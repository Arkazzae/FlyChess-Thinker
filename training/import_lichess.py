"""Import deep Stockfish analysis from the public Lichess evaluation database.

Source: https://database.lichess.org/#evals (CC0). Every line is a position with
one or more Stockfish evaluations (MultiPV lines, centipawns from White's point
of view, typically depth 30-60). The stream is decompressed on the fly; nothing
but the converted shards is stored.

  python import_lichess.py --positions 5000000

Records use the generate.py layout with origin = 4 and left = 0, which tells the
DROSO-1 trainer to mask both future and outcome supervision.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
URL = 'https://database.lichess.org/lichess_db_eval.jsonl.zst'
MATE = 3000
NONE = 65535
RECORD = np.dtype([
    ('fen', 'S92'), ('best', '<u2'), ('promo', 'u1'), ('cp', '<i2'), ('alt', '<u2', (3,)), ('altcp', '<i2', (3,)),
    ('reply', '<u2'), ('ply', '<u2'), ('game', '<u4'), ('origin', 'u1'), ('outcome', 'i1'), ('left', '<u2'),
])
PROMO = {'n': 1, 'b': 2, 'r': 3, 'q': 4}


def square(name: str) -> int:
    return (ord(name[1]) - 49) * 8 + (ord(name[0]) - 97)


def move_index(uci: str) -> int:
    return square(uci[0:2]) * 64 + square(uci[2:4])


def score(pv: dict, white_to_move: bool) -> int:
    if 'mate' in pv:
        mate = pv['mate']
        value = (MATE - min(abs(mate), 999)) * (1 if mate > 0 else -1)
    else:
        value = max(-MATE + 1000, min(MATE - 1000, pv.get('cp', 0)))
    return value if white_to_move else -value


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--positions', type=int, default=5_000_000)
    parser.add_argument('--skip', type=int, default=0, help='lines to skip at the start of the stream')
    parser.add_argument('--min-depth', type=int, default=18)
    parser.add_argument('--shard-size', type=int, default=65536)
    parser.add_argument('--out', type=Path, default=ROOT / 'data/shards')
    parser.add_argument('--url', default=URL)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    tag = time.strftime('%m%d%H%M%S') + 'lichess'
    download = subprocess.Popen(['curl', '--fail', '--location', '--silent', '--show-error', args.url], stdout=subprocess.PIPE)
    stream = subprocess.Popen(['zstd', '-dc'], stdin=download.stdout, stdout=subprocess.PIPE, bufsize=1 << 20)
    download.stdout.close()
    buffer = np.zeros(args.shard_size, dtype=RECORD)
    filled = written = shard = seen = 0
    started = time.time()

    def flush():
        nonlocal filled, shard, written
        if not filled:
            return
        path = args.out / f'{tag}-{shard:05d}.npz'
        tmp = path.with_suffix('.tmp.npz')
        np.savez_compressed(tmp, records=buffer[:filled])
        tmp.replace(path)
        written += filled
        filled = 0
        shard += 1
        print(f'[{time.strftime("%H:%M:%S")}] lichess positions={written:,} ({written / (time.time() - started):,.0f}/s)', flush=True)

    assert stream.stdout is not None
    for raw in stream.stdout:
        seen += 1
        if seen <= args.skip:
            continue
        try:
            entry = json.loads(raw)
            evals = [e for e in entry['evals'] if e.get('depth', 0) >= args.min_depth and e.get('pvs')]
            if not evals:
                continue
            # Prefer the evaluation with the most lines, then the deepest.
            best_eval = max(evals, key=lambda e: (min(len(e['pvs']), 3), e['depth']))
            pvs = [pv for pv in best_eval['pvs'] if pv.get('line')][:3]
            if not pvs:
                continue
            fen = entry['fen']
            white = fen.split(' ')[1] == 'w'
            record = buffer[filled]
            record['fen'] = f'{fen} 0 1'.encode()
            first = pvs[0]['line'].split(' ')
            record['best'] = move_index(first[0])
            record['promo'] = PROMO.get(first[0][4:5], 0)
            alt = np.full(3, NONE, dtype='<u2')
            altcp = np.zeros(3, dtype='<i2')
            for k, pv in enumerate(pvs):
                alt[k] = move_index(pv['line'].split(' ', 1)[0])
                altcp[k] = score(pv, white)
            record['cp'] = altcp[0]
            record['alt'] = alt
            record['altcp'] = altcp
            record['reply'] = move_index(first[1]) if len(first) > 1 else NONE
            record['ply'] = 0
            record['game'] = 0
            record['origin'] = 4
            record['outcome'] = 0
            record['left'] = 0
        except (KeyError, ValueError, IndexError):
            continue
        filled += 1
        if filled == args.shard_size:
            flush()
        if written + filled >= args.positions:
            break
    flush()
    stream.terminate()
    download.terminate()
    stream.wait()
    download.wait()
    print(f'done: {written:,} positions from {seen:,} lines', flush=True)


if __name__ == '__main__':
    sys.exit(main())
