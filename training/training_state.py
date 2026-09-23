"""Durable checkpoints and cooperative pause control for the local trainer."""
from __future__ import annotations

import fcntl
import json
import math
import os
import random
import signal
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch


def atomic_checkpoint(state, path: Path):
    """A failed write leaves the previous checkpoint intact."""
    temporary = path.with_name(path.name + '.tmp')
    try:
        with temporary.open('wb') as stream:
            torch.save(state, stream)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.replace(path)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        temporary.unlink(missing_ok=True)


def capture_rng():
    return {'python': random.getstate(), 'numpy': np.random.get_state(),
            'torch': torch.get_rng_state(),
            'cuda': torch.cuda.get_rng_state_all() if torch.cuda.is_available() else []}


def restore_rng(state):
    if not state:
        return
    random.setstate(state['python'])
    np.random.set_state(state['numpy'])
    torch.set_rng_state(state['torch'].cpu())
    if state.get('cuda') and torch.cuda.is_available():
        for device, rng in enumerate(state['cuda'][:torch.cuda.device_count()]):
            torch.cuda.set_rng_state(rng.cpu(), device)


def worker_signals(worker_id):
    # Only the trainer handles Ctrl+C; workers must still obey terminate().
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    signal.signal(signal.SIGTERM, signal.SIG_DFL)


class TrainingClock:
    """The learning-rate clock advances only while the training process runs."""
    def __init__(self, hours, base_lrs, saved=None, now=time.monotonic):
        self.now = now
        self.started = now()
        self.previous = saved['elapsed_seconds'] if saved else 0.0
        self.base_lrs = saved['base_lrs'] if saved else list(base_lrs)
        self.schedule_seconds = saved['schedule_seconds'] if saved else (hours * 3600 or None)
        self.limit_seconds = hours * 3600 or None

    @property
    def elapsed(self):
        return self.previous + self.now() - self.started

    def expired(self):
        return self.limit_seconds is not None and self.elapsed >= self.limit_seconds

    def learning_rates(self, step):
        warmup = min(1.0, (step + 1) / 400)
        progress = min(1.0, self.elapsed / self.schedule_seconds) if self.schedule_seconds else 0.0
        scale = warmup * (0.1 + 0.9 * 0.5 * (1 + math.cos(math.pi * progress)))
        return [lr * scale for lr in self.base_lrs]

    def state_dict(self):
        return {'elapsed_seconds': self.elapsed, 'base_lrs': self.base_lrs,
                'schedule_seconds': self.schedule_seconds}


class RunControl:
    """SIGINT, SIGTERM or a PAUSE file request a stop at the next safe boundary."""
    def __init__(self, directory):
        self.directory = Path(directory)
        self.pause_path = self.directory / 'PAUSE'
        self.reason = None
        self.handlers = {}
        self.status = {'pid': os.getpid(), 'status': 'starting'}

    def __enter__(self):
        self.directory.mkdir(parents=True, exist_ok=True)
        self.lock = (self.directory / 'train.lock').open('a+')
        try:
            # POSIX record locks are not inherited by DataLoader's forked workers.
            fcntl.lockf(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            self.lock.close()
            raise SystemExit(f'a trainer is already running in {self.directory}')
        self.pause_path.unlink(missing_ok=True)
        for signum in (signal.SIGINT, signal.SIGTERM):
            self.handlers[signum] = signal.signal(signum, self._signal)
        self.publish('starting')
        return self

    def _signal(self, signum, frame):
        self.reason = self.reason or signal.Signals(signum).name

    def should_stop(self):
        if self.pause_path.exists():
            self.reason = self.reason or 'pause requested'
        return self.reason is not None

    def publish(self, status, **fields):
        self.status.update(fields, status=status, updated_at=datetime.now(timezone.utc).isoformat())
        temporary = self.directory / 'status.json.tmp'
        temporary.write_text(json.dumps(self.status, indent=2) + '\n')
        temporary.replace(self.directory / 'status.json')

    def __exit__(self, exc_type, exc, traceback):
        try:
            if exc_type is not None:
                self.publish('failed', error=str(exc))
        finally:
            for signum, handler in self.handlers.items():
                signal.signal(signum, handler)
            self.lock.close()
