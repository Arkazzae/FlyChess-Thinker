"""Frozen-model rating probe against explicitly configured Stockfish handicaps.

Ratings are conditional on this engine protocol, not FIDE or online ratings.
Every opening is played with both colours. No training or model selection.
"""
import argparse
import json
import math
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import chess
import chess.engine
import chess.pgn
import numpy as np
import torch

from generate import DEFAULT_ENGINE
from training_state import RunControl
from droso1.common import BASE, now, sha256, write_json
from droso1.evaluate import EVALUATION_FILES
from droso1.player import Board, Player
from droso1.train import load_checkpoint
from droso1.bundle import load_bundle


# Six to eight legal book plies, no model-dependent opening selection.
OPENINGS = [
    ('ruy_lopez', 'open_games', 'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6'),
    ('italian', 'open_games', 'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5'),
    ('scotch', 'open_games', 'e2e4 e7e5 g1f3 b8c6 d2d4 e5d4'),
    ('sicilian_open', 'sicilian', 'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6'),
    ('sicilian_closed', 'sicilian', 'e2e4 c7c5 b1c3 b8c6 g2g3 g7g6'),
    ('french', 'french', 'e2e4 e7e6 d2d4 d7d5 b1c3 g8f6'),
    ('caro_kann', 'caro_kann', 'e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4 c8f5'),
    ('pirc', 'pirc', 'e2e4 d7d6 d2d4 g8f6 b1c3 g7g6'),
    ('scandinavian', 'scandinavian', 'e2e4 d7d5 e4d5 d8d5 b1c3 d5a5'),
    ('queens_gambit', 'queens_gambit', 'd2d4 d7d5 c2c4 e7e6 b1c3 g8f6'),
    ('slav', 'slav', 'd2d4 d7d5 c2c4 c7c6 g1f3 g8f6'),
    ('kings_indian', 'kings_indian', 'd2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6'),
    ('grunfeld', 'grunfeld', 'd2d4 g8f6 c2c4 g7g6 b1c3 d7d5'),
    ('nimzo_indian', 'nimzo_indian', 'd2d4 g8f6 c2c4 e7e6 b1c3 f8b4'),
    ('english', 'english', 'c2c4 e7e5 b1c3 g8f6 g2g3 d7d5'),
    ('reti', 'reti', 'g1f3 d7d5 c2c4 e7e6 g2g3 g8f6'),
]


def opening_board(index):
    board = Board()
    for uci in OPENINGS[index][2].split():
        board.push_uci(uci)
    if not board.is_valid() or board.is_game_over(claim_draw=True):
        raise ValueError('invalid opening book position')
    return board


def skill_selection_depth(elo):
    e = (elo-1320)/1870
    level = min(19., max(0., ((37.2473*e-40.8525)*e+22.2943)*e-.311438))
    return 1+int(level)


def play(args, control):
    if args.depth < skill_selection_depth(args.elo):
        raise ValueError('search must reach the installed Stockfish handicap selection depth')
    torch.set_num_threads(2)
    torch.backends.cuda.matmul.allow_tf32=True
    if args.bundle:
        model, manifest = load_bundle(args.bundle)
        metadata = manifest['provenance'] | dict(manifest_sha256=sha256(args.bundle/'manifest.json'))
    else:
        model, metadata = load_checkpoint(args.checkpoint, 'B')
    player = Player(model, device='cuda', batch=32, simulations=args.simulations)
    settings = dict(checkpoint=metadata, engine_sha256=sha256(DEFAULT_ENGINE),
        engine='Stockfish 19', UCI_Elo=args.elo, UCI_LimitStrength=True,
        stockfish_threads=1, stockfish_hash_mb=16, stockfish_depth=args.depth,
        minimum_handicap_selection_depth=skill_selection_depth(args.elo),
        separate_engine_per_game=True, concurrent_stockfish_searches=2,
        simulations=args.simulations, c_puct=1.5, model_move_clock=None,
        wave_size=args.wave_size, max_additional_plies=args.max_plies,
        openings=OPENINGS, opening_count=args.openings,
        code_sha256={name:sha256(BASE/name) for name in (*EVALUATION_FILES, 'droso1/rating_match.py')},
        rating_scale='Conditional on SF19 UCI_Elo, depth-limited protocol; not human/online Elo.')
    settings = json.loads(json.dumps(settings))
    state_path = args.out/'state.json'
    if state_path.exists():
        state = json.loads(state_path.read_text())
        if state['identity'] != settings:
            raise ValueError('cannot resume a different model or rating protocol')
        state['resume_count'] += 1
    else:
        state = dict(identity=settings, moves=[[] for _ in range(args.openings*2)],
                     seconds=0., started_at=now(), resume_count=0)
    boards = [opening_board(i//2) for i in range(args.openings*2)]
    for board, moves in zip(boards,state['moves']):
        for row in moves:
            board.push_uci(row['uci'])
    started = time.monotonic()
    previous_seconds = state['seconds']

    def remaining(i):
        return not boards[i].is_game_over(claim_draw=True) and len(state['moves'][i]) < args.max_plies

    def save():
        state['seconds'] = previous_seconds+time.monotonic()-started
        write_json(state_path,state)
        progress = dict(elo=args.elo, finished=sum(not remaining(i) for i in range(len(boards))),
            games=len(boards), min_plies=min(map(len,state['moves'])),
            max_plies=max(map(len,state['moves'])), seconds=state['seconds'])
        control.publish('playing', **progress)
        print(json.dumps(progress),flush=True)

    try:
        for start in range(0,len(boards),args.wave_size):
            indices = list(range(start,min(start+args.wave_size,len(boards))))
            engines = {}
            try:
                for i in indices:
                    if not remaining(i):continue
                    engine = chess.engine.SimpleEngine.popen_uci(str(DEFAULT_ENGINE))
                    engines[i] = engine
                    if engine.id.get('name') != 'Stockfish 19':
                        raise ValueError('rating protocol is pinned to the installed SF19')
                    engine.configure({'Threads':1,'Hash':16,'UCI_LimitStrength':True,'UCI_Elo':args.elo})
                with ThreadPoolExecutor(max_workers=2) as pool:
                    last_log = 0.
                    while any(remaining(i) for i in indices):
                        if control.should_stop():
                            save()
                            raise InterruptedError(control.reason)
                        mine = [i for i in indices if remaining(i) and (boards[i].turn==chess.WHITE)==(i%2==0)]
                        if mine:
                            moves,_ = player.choose([boards[i] for i in mine],temperature=0.)
                            for i,move in zip(mine,moves):
                                if move not in boards[i].legal_moves:raise ValueError('illegal model move')
                                boards[i].push(move)
                                state['moves'][i].append(dict(uci=move.uci(),player='flywire'))
                        theirs = [i for i in indices if remaining(i) and (boards[i].turn==chess.WHITE)!=(i%2==0)]

                        def opponent_move(i):
                            before = time.monotonic()
                            result = engines[i].play(boards[i],chess.engine.Limit(depth=args.depth),
                                                     game=i,info=chess.engine.INFO_BASIC)
                            return i,result,time.monotonic()-before

                        for i,result,seconds in pool.map(opponent_move,theirs):
                            if result.move not in boards[i].legal_moves:raise ValueError('illegal Stockfish move')
                            depth = result.info.get('depth')
                            if (depth is None or depth < skill_selection_depth(args.elo)) and boards[i].legal_moves.count()>1:
                                raise ValueError('Stockfish did not reach its handicap selection depth')
                            boards[i].push(result.move)
                            state['moves'][i].append(dict(uci=result.move.uci(),player='stockfish',
                                depth=depth,nodes=result.info.get('nodes'),seconds=seconds))
                        # Every complete model/opponent turn is durable.
                        state['seconds'] = previous_seconds+time.monotonic()-started
                        write_json(state_path,state)
                        if time.monotonic()-last_log > 20:
                            save();last_log=time.monotonic()
            finally:
                for engine in engines.values():engine.quit()
        save()
        details=[];pgns=[]
        for i,board in enumerate(boards):
            outcome=board.outcome(claim_draw=True)
            score=None if outcome is None else .5 if outcome.winner is None else float(outcome.winner==(i%2==0))
            game=chess.pgn.Game.from_board(board)
            result=outcome.result() if outcome else '*'
            game.headers.update(Event='DROSO-1 rating probe',Date=time.strftime('%Y.%m.%d'),Round=str(i+1),
                White='DROSO-1' if i%2==0 else f'SF19 UCI_Elo {args.elo}',
                Black=f'SF19 UCI_Elo {args.elo}' if i%2==0 else 'DROSO-1',
                Result=result,Opening=OPENINGS[i//2][0],
                Termination='normal' if outcome else 'unterminated',
                Search=f'FlyWire PUCT {args.simulations}; Stockfish depth {args.depth}')
            pgns.append(str(game)+'\n\n')
            details.append(dict(game=i,opening=i//2,family=OPENINGS[i//2][1],
                subject_white=i%2==0,score=score,result=result,
                additional_plies=len(state['moves'][i]),termination=outcome.termination.name if outcome else 'ply_cap'))
        (args.out/'games.pgn').write_text(''.join(pgns))
        parsed=0;trajectories=set()
        with (args.out/'games.pgn').open() as stream:
            while game:=chess.pgn.read_game(stream):
                if game.errors:raise ValueError('PGN parse error')
                board=game.board();line=[]
                for move in game.mainline_moves():
                    if move not in board.legal_moves:raise ValueError('illegal PGN move')
                    board.push(move);line.append(move.uci())
                expected=boards[parsed]
                if board.fen()!=expected.fen() or game.headers['Result']!=details[parsed]['result']:
                    raise ValueError('PGN state/result mismatch')
                trajectories.add(' '.join(line));parsed+=1
        if parsed!=len(boards):raise ValueError('PGN count mismatch')
        values=[r['score'] for r in details if r['score'] is not None]
        report=dict(stage='completed',identity=settings,finished_at=now(),games=len(boards),
            wins=values.count(1.),draws=values.count(.5),losses=values.count(0.),
            unresolved=len(boards)-len(values),score=float(np.mean(values)) if values else None,
            details=details,seconds=state['seconds'],resume_count=state['resume_count'],
            unique_trajectories=len(trajectories),legal_pgn_verified=True,
            limitations=['SF19 handicap RNG is internal and not seed-controllable; resume restores game history, not its RNG or transposition table.',
                'Stockfish calibration uses 120s+1s; this experiment uses depth 8 and an unlimited model clock with a fixed simulation budget.',
                'No fabricated ratings for weak opponents; unresolved games are reported separately, never silently counted as draws.',
                'Book positions are ordinary chess openings and may have occurred in historical training. No weight updates during this evaluation.'])
        write_json(args.out/'report.json',report)
        control.publish('completed',elo=args.elo,wins=report['wins'],draws=report['draws'],losses=report['losses'],unresolved=report['unresolved'])
        print(json.dumps({k:report[k] for k in ('games','wins','draws','losses','unresolved','score','seconds')}),flush=True)
    except InterruptedError as error:
        control.publish('paused',reason=str(error))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    weights = parser.add_mutually_exclusive_group(required=True)
    weights.add_argument('--checkpoint', type=Path)
    weights.add_argument('--bundle', type=Path)
    parser.add_argument('--elo',type=int,required=True)
    parser.add_argument('--depth',type=int,default=8)
    parser.add_argument('--simulations',type=int,default=64)
    parser.add_argument('--openings',type=int,default=16)
    parser.add_argument('--wave-size',type=int,default=16)
    parser.add_argument('--max-plies',type=int,default=512)
    parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args()
    if not 1320<=args.elo<=3190 or not 1<=args.openings<=len(OPENINGS) or min(args.depth,args.simulations,args.wave_size,args.max_plies)<1:
        parser.error('invalid rating protocol parameters')
    args.out=args.out.resolve()
    if args.checkpoint:args.checkpoint=args.checkpoint.resolve()
    if args.bundle:args.bundle=args.bundle.resolve()
    for i in range(args.openings):opening_board(i)
    with RunControl(args.out) as control:play(args,control)


if __name__=='__main__':main()
