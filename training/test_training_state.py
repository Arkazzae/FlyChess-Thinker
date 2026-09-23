import json
import os
import signal
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import torch

from training_state import RunControl, TrainingClock, atomic_checkpoint, capture_rng, restore_rng, worker_signals


class TrainingStateTests(unittest.TestCase):
    def test_resume_preserves_adam_and_next_random_update(self):
        torch.manual_seed(42)
        model = torch.nn.Linear(3, 2)
        optimizer = torch.optim.AdamW(model.parameters(), lr=0.003)

        def step(network, adam):
            adam.zero_grad()
            loss = (network(torch.randn(4, 3)) - torch.randn(4, 2)).square().mean()
            loss.backward()
            adam.step()

        step(model, optimizer)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'last.pt'
            atomic_checkpoint({'model': model.state_dict(), 'optimizer': optimizer.state_dict(),
                               'rng': capture_rng(), 'step': 1}, path)
            step(model, optimizer)
            saved = torch.load(path, weights_only=False)
            resumed = torch.nn.Linear(3, 2)
            resumed_optimizer = torch.optim.AdamW(resumed.parameters(), lr=99)
            resumed.load_state_dict(saved['model'])
            resumed_optimizer.load_state_dict(saved['optimizer'])
            restore_rng(saved['rng'])
            step(resumed, resumed_optimizer)
            for expected, actual in zip(model.parameters(), resumed.parameters()):
                torch.testing.assert_close(actual, expected, rtol=0, atol=0)
            for original, continued in zip(optimizer.state.values(), resumed_optimizer.state.values()):
                for key in original:
                    torch.testing.assert_close(continued[key], original[key], rtol=0, atol=0)

    def test_failed_save_keeps_previous_checkpoint(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'last.pt'
            atomic_checkpoint({'step': 10}, path)

            def fail(state, stream):
                stream.write(b'incomplete checkpoint')
                raise OSError('simulated full disk')

            with patch('training_state.torch.save', side_effect=fail):
                with self.assertRaises(OSError):
                    atomic_checkpoint({'step': 11}, path)
            self.assertEqual(torch.load(path, weights_only=False)['step'], 10)
            self.assertFalse(path.with_name('last.pt.tmp').exists())

    def test_pause_time_does_not_advance_schedule(self):
        now = [100.0]
        clock = TrainingClock(1, [0.001], now=lambda: now[0])
        now[0] += 120
        saved = clock.state_dict()
        rates = clock.learning_rates(1000)
        now[0] += 10000  # computer was off during the pause
        resumed = TrainingClock(1, [99], saved, now=lambda: now[0])
        self.assertEqual(resumed.elapsed, 120)
        self.assertEqual(resumed.learning_rates(1000), rates)
        now[0] += 3480
        self.assertTrue(resumed.expired())

    def test_unlimited_run_has_no_time_decay_or_deadline(self):
        now = [0.0]
        clock = TrainingClock(0, [0.002], now=lambda: now[0])
        now[0] = 1e9
        self.assertFalse(clock.expired())
        self.assertEqual(clock.learning_rates(1000), [0.002])

    def test_signals_request_pause_without_interrupting_update(self):
        with tempfile.TemporaryDirectory() as directory:
            with RunControl(directory) as control:
                os.kill(os.getpid(), signal.SIGTERM)
                self.assertTrue(control.should_stop())
                self.assertEqual(control.reason, 'SIGTERM')
                control.publish('paused', checkpoint_step=17)
            self.assertEqual(json.loads((Path(directory) / 'status.json').read_text())['checkpoint_step'], 17)

    def test_other_process_observes_run_lock_and_pause_file(self):
        with tempfile.TemporaryDirectory() as directory:
            with RunControl(directory) as control:
                script = 'from pathlib import Path; from training_control import active; import sys; sys.exit(0 if active(Path(sys.argv[1])) else 1)'
                result = subprocess.run([sys.executable, '-c', script, directory], cwd=Path(__file__).parent)
                self.assertEqual(result.returncode, 0)
                control.pause_path.touch()
                self.assertTrue(control.should_stop())
            result = subprocess.run([sys.executable, '-c', script, directory], cwd=Path(__file__).parent)
            self.assertEqual(result.returncode, 1)

    def test_workers_ignore_interrupt_but_obey_terminate(self):
        original = {s: signal.getsignal(s) for s in (signal.SIGINT, signal.SIGTERM)}
        try:
            worker_signals(0)
            self.assertEqual(signal.getsignal(signal.SIGINT), signal.SIG_IGN)
            self.assertEqual(signal.getsignal(signal.SIGTERM), signal.SIG_DFL)
        finally:
            for signum, handler in original.items():
                signal.signal(signum, handler)


if __name__ == '__main__':
    unittest.main()
