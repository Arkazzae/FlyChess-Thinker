"""Collect Stockfish-labelled mistakes from a frozen DROSO-1 model.

DAgger records retain the legacy shard contract: origin=5, game=played move,
ply=centipawn cost, left=0. Missing game outcome/future targets stay masked.
This creates a new corpus; it does not recreate the release training history.
"""
from __future__ import annotations

import argparse
import multiprocessing as mp
import time
from pathlib import Path

import chess
import chess.engine
import numpy as np
import torch

from generate import DEFAULT_ENGINE as ENGINE
from droso1.bundle import load_bundle
from droso1.train import load_checkpoint
from droso1.player import Board, Player
from droso1.rating_match import opening_board
from generate import MATE, NONE, RECORD, encode_move, promo_code

class Opponent:
    def __init__(self, name: str, rng: np.random.Generator):
        self.name, self.rng = name, rng
        self.random_share = 1.0 if name == 'random' else int(name[3:]) / 100 if name.startswith('mix') else 0.0
        self.engine = None
        if name != 'random':
            self.engine = chess.engine.SimpleEngine.popen_uci(str(ENGINE))
            elo = 1320 if name.startswith('mix') else int(name[2:])
            self.engine.configure({'Threads': 1, 'Hash': 16, 'UCI_LimitStrength': True, 'UCI_Elo': elo})

    def move(self, board: chess.Board) -> chess.Move:
        if self.engine is None or self.rng.random() < self.random_share:
            moves = list(board.legal_moves)
            return moves[self.rng.integers(len(moves))]
        return self.engine.play(board, chess.engine.Limit(time=0.03)).move

    def close(self):
        if self.engine:
            self.engine.quit()



OPPONENTS = ['self', 'mix25', 'mix12', 'self', 'mix06', 'sf1320']
_engine = None


def _init(depth: int):
    global _engine, _limit
    _engine = chess.engine.SimpleEngine.popen_uci(str(ENGINE))
    _engine.configure({'Threads': 1, 'Hash': 32})
    _limit = chess.engine.Limit(depth=depth)


def _label(item):
    fen, played_uci = item
    board = chess.Board(fen)
    lines = [i for i in _engine.analyse(board, _limit, multipv=3) if i.get('pv')]
    if not lines:
        return None
    record = np.zeros((), dtype=RECORD)
    record['fen'] = fen.encode()
    best = lines[0]['pv'][0]
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
    record['reply'] = encode_move(lines[0]['pv'][1]) if len(lines[0]['pv']) > 1 else NONE
    record['origin'] = 5
    # What did its own move cost? Reuse a MultiPV line when it is one of them, otherwise ask about that move alone.
    played = chess.Move.from_uci(played_uci)
    cost = None
    for k, line in enumerate(lines[:3]):
        if line['pv'][0] == played:
            cost = int(altcp[0]) - int(altcp[k])
    if cost is None and played in board.legal_moves:
        info = _engine.analyse(board, _limit, root_moves=[played])
        cost = int(altcp[0]) - max(-MATE, min(MATE, info['score'].pov(board.turn).score(mate_score=MATE)))
    record['game'] = encode_move(played)
    record['ply'] = max(0, min(MATE, cost or 0))
    return record


def play_round(player: Player, games: int, rng, max_plies: int = 160) -> list[tuple[str, str]]:
    """Simultaneous games; returns (FEN, move played) for every position where the fly had to move."""
    names = [OPPONENTS[g % len(OPPONENTS)] for g in range(games)]
    engines = {name: Opponent(name, rng) for name in set(names) if name != 'self'}
    boards = [opening_board(int(rng.integers(0, 16))) for _ in range(games)]
    fly_white = [g % 2 == 0 for g in range(games)]
    fens: dict[str, str] = {}
    active = list(range(games))
    while active:
        for g in active:
            if names[g] != 'self' and (boards[g].turn == chess.WHITE) != fly_white[g]:
                boards[g].push(engines[names[g]].move(boards[g]))
        active = [g for g in active if not boards[g].is_game_over(claim_draw=True) and boards[g].ply() < max_plies]
        todo = [g for g in active if names[g] == 'self' or (boards[g].turn == chess.WHITE) == fly_white[g]]
        if todo:
            # Exploration early, then its real play: the labels should cover what it actually does.
            temperature = 0.4 if boards[todo[0]].ply() < 12 else 0.12
            moves, _ = player.choose([boards[g] for g in todo], temperature=temperature, rng=rng)
            for g, move in zip(todo, moves):
                fens.setdefault(boards[g].fen(), move.uci())
                boards[g].push(move)
        active = [g for g in active if not boards[g].is_game_over(claim_draw=True) and boards[g].ply() < max_plies]
    for engine in engines.values():
        engine.close()
    return list(fens.items())


def main():
    parser = argparse.ArgumentParser()
    weights = parser.add_mutually_exclusive_group(required=True)
    weights.add_argument('--bundle', type=Path)
    weights.add_argument('--checkpoint', type=Path)
    parser.add_argument('--arm', choices=('A','B'), default='B')
    parser.add_argument('--seed', type=int, default=2026092301)
    parser.add_argument('--out', type=Path, default=Path('data/shards'))
    parser.add_argument('--games', type=int, default=48)
    parser.add_argument('--labellers', type=int, default=10)
    parser.add_argument('--depth', type=int, default=10)
    parser.add_argument('--rounds', type=int, default=100)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    torch.set_num_threads(2)
    if args.bundle:
        model, metadata = load_bundle(args.bundle)
    else:
        model, metadata = load_checkpoint(args.checkpoint, args.arm)
    player = Player(model, device='cuda', batch=32, simulations=64)
    rng = np.random.default_rng(args.seed)
    tag = time.strftime('%m%d%H%M%S') + 'dagger'
    total = 0
    with mp.get_context('spawn').Pool(args.labellers, initializer=_init, initargs=(args.depth,)) as pool:
        for round_index in range(args.rounds):
            started = time.time()
            fens = play_round(player, args.games, rng)
            played = time.time() - started
            records = [r for r in pool.imap_unordered(_label, fens, chunksize=16) if r is not None]
            if records:
                path = args.out / f'{tag}-{round_index:05d}.npz'
                tmp = path.with_suffix('.tmp.npz')
                np.savez_compressed(tmp, records=np.array(records, dtype=RECORD))
                tmp.replace(path)
                total += len(records)
            costly = sum(int(r['ply']) >= 100 for r in records)
            print(f'[{time.strftime("%H:%M:%S")}] round {round_index}: {len(records)} positions, {costly} costly moves '
                  f'(play {played:.0f}s, label {time.time() - started - played:.0f}s), total {total:,}', flush=True)


if __name__ == '__main__':
    main()
