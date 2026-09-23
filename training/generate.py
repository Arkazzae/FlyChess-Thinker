"""Stockfish-labelled position generator for the Fly chess brain.

Every worker runs its own Stockfish 19 (1 thread) and plays diversified games:
random or book openings, then mostly Stockfish moves with a share of
second-best and random moves so the data also covers unbalanced positions.
Every visited position is labelled with the top-3 MultiPV lines at a fixed
depth. Records are written as compressed NumPy shards.

Run from training/:
  python generate.py --workers 2 --target 2000000

Record fields (all in absolute board coordinates, the trainer flips):
  fen      S92    position
  best     u16    best move as from*64+to
  promo    u8     promotion of the best move: 0 none, 1 n, 2 b, 3 r, 4 q
  cp       i16    best-line score, side-to-move perspective, mate mapped to ±3000
  alt      u16x3  top-3 moves (index 0 == best), 65535 when absent
  altcp    i16x3  their scores
  reply    u16    expected opponent reply (second move of the best line), 65535 when absent
  ply      u16    half-moves played so far in the game
  game     u32    game id within the worker
  origin   u8     how the move actually played was chosen: 0 best, 1 alternative, 2 random, 3 book
  outcome  i8     final game result from the side to move's perspective: +1 win, 0 draw, -1 loss
  left     u16    half-moves remaining until the end of the game
Games are written whole, so the records of one game are contiguous in a shard.
"""
from __future__ import annotations

import argparse
import multiprocessing as mp
import os
import shutil
import random
import signal
import sys
import time
from pathlib import Path

import chess
import chess.engine
import numpy as np

ROOT = Path(__file__).resolve().parent
DEFAULT_ENGINE = Path(os.environ.get('STOCKFISH_EXECUTABLE') or shutil.which('stockfish') or '/usr/games/stockfish')
MATE = 3000
NONE = 65535
BOOK = [
    'e2e4 e7e5 g1f3 b8c6 f1b5', 'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5', 'e2e4 e7e5 g1f3 g8f6', 'e2e4 e7e5 f2f4',
    'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3', 'e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4', 'e2e4 c7c5 b1c3',
    'e2e4 e7e6 d2d4 d7d5 b1c3', 'e2e4 e7e6 d2d4 d7d5 e4e5', 'e2e4 c7c6 d2d4 d7d5 b1c3', 'e2e4 c7c6 d2d4 d7d5 e4e5',
    'e2e4 d7d5 e4d5 d8d5 b1c3', 'e2e4 g8f6 e4e5 f6d5 d2d4', 'e2e4 d7d6 d2d4 g8f6 b1c3 g7g6', 'e2e4 g7g6 d2d4 f8g7',
    'd2d4 d7d5 c2c4 e7e6 b1c3 g8f6', 'd2d4 d7d5 c2c4 c7c6 g1f3 g8f6', 'd2d4 d7d5 c2c4 d5c4', 'd2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6',
    'd2d4 g8f6 c2c4 e7e6 b1c3 f8b4', 'd2d4 g8f6 c2c4 e7e6 g1f3 b7b6', 'd2d4 g8f6 c2c4 c7c5 d4d5', 'd2d4 d7d5 c1f4', 'd2d4 d7d5 g1f3 g8f6 e2e3',
    'd2d4 f7f5', 'c2c4 e7e5 b1c3 g8f6', 'c2c4 c7c5', 'g1f3 d7d5 g2g3 g8f6 f1g2', 'g1f3 g8f6 c2c4 g7g6', 'b2b3 e7e5', 'f2f4 d7d5',
]


def encode_move(move: chess.Move) -> int:
    return move.from_square * 64 + move.to_square


def promo_code(move: chess.Move) -> int:
    return {None: 0, chess.KNIGHT: 1, chess.BISHOP: 2, chess.ROOK: 3, chess.QUEEN: 4}[move.promotion]


RECORD = np.dtype([
    ('fen', 'S92'), ('best', '<u2'), ('promo', 'u1'), ('cp', '<i2'), ('alt', '<u2', (3,)), ('altcp', '<i2', (3,)),
    ('reply', '<u2'), ('ply', '<u2'), ('game', '<u4'), ('origin', 'u1'), ('outcome', 'i1'), ('left', '<u2'),
])


def adjudicate(board: chess.Board, last_cp: int, last_turn: chess.Color) -> int:
    """Result from White's perspective: +1, 0, -1. Unfinished games use the last evaluation."""
    outcome = board.outcome(claim_draw=True)
    if outcome is not None:
        return 0 if outcome.winner is None else (1 if outcome.winner == chess.WHITE else -1)
    white_cp = last_cp if last_turn == chess.WHITE else -last_cp
    return 1 if white_cp > 300 else -1 if white_cp < -300 else 0


def opening(board: chess.Board, rng: random.Random) -> int:
    """Play an opening; return how many plies were book moves."""
    if rng.random() < 0.3:
        line = rng.choice(BOOK).split()
        cut = rng.randint(max(1, len(line) - 3), len(line))
        played = 0
        for uci in line[:cut]:
            move = chess.Move.from_uci(uci)
            if move not in board.legal_moves:
                break
            board.push(move)
            played += 1
        return played
    plies = rng.choice([0, 1, 2, 2, 3, 4, 4, 5, 6, 8, 10])
    for _ in range(plies):
        moves = list(board.legal_moves)
        if not moves:
            break
        board.push(rng.choice(moves))
    return 0


def worker(index: int, args: argparse.Namespace, counter, stop) -> None:
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    rng = random.Random(args.seed * 1000 + index)
    engine = chess.engine.SimpleEngine.popen_uci(str(args.engine))
    engine.configure({'Threads': 1, 'Hash': args.hash})
    limit = chess.engine.Limit(depth=args.depth)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    buffer = np.zeros(args.shard_size, dtype=RECORD)
    filled = 0
    shard = 0
    game = 0

    def flush():
        nonlocal filled, shard
        if not filled:
            return
        path = out / f'{args.run_tag}-w{index:02d}-{shard:05d}.npz'
        tmp = path.with_suffix('.tmp.npz')
        np.savez_compressed(tmp, records=buffer[:filled])
        tmp.replace(path)
        with counter.get_lock():
            counter.value += filled
        filled = 0
        shard += 1

    def commit(records: list, board: chess.Board, last_cp: int, last_turn: chess.Color):
        """Fill outcome/left for a finished game and append it whole to the shard."""
        nonlocal filled
        if not records:
            return
        white_result = adjudicate(board, last_cp, last_turn)
        total = len(records)
        for k, record in enumerate(records):
            mover_white = bytes(record['fen']).split(b' ')[1] == b'w'
            record['outcome'] = white_result if mover_white else -white_result
            record['left'] = total - k
        if filled + total > args.shard_size:
            flush()
        n = min(total, args.shard_size)
        buffer[filled:filled + n] = records[:n]
        filled += n
        if filled == args.shard_size:
            flush()

    try:
        while not stop.is_set():
            board = chess.Board()
            book_plies = opening(board, rng)
            game += 1
            ply = board.ply()
            records: list = []
            last_cp, last_turn = 0, board.turn
            while not board.is_game_over(claim_draw=True) and ply < args.max_plies and not stop.is_set():
                infos = engine.analyse(board, limit, multipv=args.multipv)
                lines = [i for i in infos if i.get('pv')]
                if not lines:
                    break
                record = np.zeros((), dtype=RECORD)
                record['fen'] = board.fen().encode()
                best_line = lines[0]
                best = best_line['pv'][0]
                record['best'] = encode_move(best)
                record['promo'] = promo_code(best)
                alt = np.full(3, NONE, dtype='<u2')
                altcp = np.zeros(3, dtype='<i2')
                for k, line in enumerate(lines[:3]):
                    alt[k] = encode_move(line['pv'][0])
                    altcp[k] = max(-MATE, min(MATE, line['score'].pov(board.turn).score(mate_score=MATE)))
                record['cp'] = altcp[0]
                record['alt'] = alt
                record['altcp'] = altcp
                record['reply'] = encode_move(best_line['pv'][1]) if len(best_line['pv']) > 1 else NONE
                record['ply'] = ply
                record['game'] = game
                roll = rng.random()
                if ply < book_plies:
                    origin, move = 3, best
                elif roll < args.p_random:
                    origin, move = 2, rng.choice(list(board.legal_moves))
                elif roll < args.p_random + args.p_alt and len(lines) > 1:
                    origin, move = 1, rng.choice(lines[1:])['pv'][0]
                else:
                    origin, move = 0, best
                record['origin'] = origin
                records.append(record)
                last_cp, last_turn = int(altcp[0]), board.turn
                board.push(move)
                ply += 1
            if not stop.is_set() or board.is_game_over(claim_draw=True):
                commit(records, board, last_cp, last_turn)
    finally:
        flush()
        engine.quit()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--engine', type=Path, default=DEFAULT_ENGINE)
    parser.add_argument('--out', type=Path, default=ROOT / 'data/shards')
    parser.add_argument('--workers', type=int, default=max(1, os.cpu_count() - 4))
    parser.add_argument('--target', type=int, default=2_000_000, help='stop after this many labelled positions')
    parser.add_argument('--depth', type=int, default=12)
    parser.add_argument('--multipv', type=int, default=3)
    parser.add_argument('--hash', type=int, default=64)
    parser.add_argument('--shard-size', type=int, default=8192)
    parser.add_argument('--max-plies', type=int, default=220)
    parser.add_argument('--p-random', type=float, default=0.08)
    parser.add_argument('--p-alt', type=float, default=0.14)
    parser.add_argument('--seed', type=int, default=20260918)
    args = parser.parse_args()
    # Unique per run, so a restart never overwrites earlier shards.
    args.run_tag = time.strftime('%m%d%H%M%S') + f'd{args.depth}'
    if not args.engine.exists():
        sys.exit(f'Stockfish binary not found: {args.engine}')
    existing = sum(int(np.load(p)['records'].shape[0]) for p in Path(args.out).glob('*.npz')) if Path(args.out).exists() else 0
    if existing:
        # Seed shift keeps new games distinct from a previous run.
        args.seed += len(list(Path(args.out).glob('*.npz')))
    ctx = mp.get_context('spawn')
    counter = ctx.Value('q', existing)
    stop = ctx.Event()
    processes = [ctx.Process(target=worker, args=(i, args, counter, stop), daemon=True) for i in range(args.workers)]
    for p in processes:
        p.start()
    started = time.time()
    last = existing
    try:
        while counter.value < args.target and any(p.is_alive() for p in processes):
            time.sleep(30)
            now = counter.value
            rate = (now - last) / 30
            last = now
            print(f'[{time.strftime("%H:%M:%S")}] positions={now:,} rate={rate:,.0f}/s elapsed={time.time() - started:,.0f}s', flush=True)
    except KeyboardInterrupt:
        pass
    stop.set()
    for p in processes:
        p.join(timeout=120)
    print(f'done positions={counter.value:,}', flush=True)


if __name__ == '__main__':
    main()
