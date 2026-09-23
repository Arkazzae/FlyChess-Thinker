"""Frozen-model actual-move regret and diverse paired games, with resumable records."""
import argparse
import gc
import json
import time
from collections import Counter
from pathlib import Path

import chess
import chess.pgn
import numpy as np
import torch

from model import Graph
from droso1.bundle import load_bundle
from droso1.common import BASE, now, sha256, write_json
from droso1.player import Board, Player
from droso1.prepare import bucket
from droso1.teacher import Teacher, paired_interval, summarize
from droso1.train import load_checkpoint


EVALUATION_FILES = ('droso1/evaluate.py','droso1/player.py','droso1/teacher.py','core/puct.py',
                    'core/player.py','core/encoding.py','player.py')


def selected_moves(player, rows, destination, identity):
    saved=json.loads(destination.read_text()) if destination.exists() else dict(identity=identity,moves=[],seconds=0.)
    if saved['identity']!=identity:
        raise ValueError('cannot mix evaluations from different frozen weights/settings')
    started=time.monotonic()
    previous=saved['seconds']
    for start in range(len(saved['moves']),len(rows),32):
        part=rows[start:start+32]
        boards=[Board(r['fen'].decode(),halfmove_known=bool(r['globals'][20])) for r in part]
        moves,_=player.choose(boards,temperature=0.)
        for board,move in zip(boards,moves):
            if move not in board.legal_moves:
                raise ValueError('illegal neural move')
        saved['moves'].extend(m.uci() for m in moves)
        saved['seconds']=previous+time.monotonic()-started
        write_json(destination,saved)
        print(json.dumps(dict(stage='selected_moves',model=identity['name'],done=len(saved['moves']),total=len(rows),seconds=saved['seconds'])),flush=True)
    return saved


def score_moves(teacher,rows,moves,path,identity):
    result=json.loads(path.read_text()) if path.exists() else dict(identity=identity,positions=[])
    if result['identity']!=identity:
        raise ValueError('regret identity mismatch')
    for i in range(len(result['positions']),len(rows)):
        row=rows[i]
        assessment=teacher.regret(row['fen'].decode(),moves[i])
        result['positions'].append(dict(index=i,key=bytes(row['key']).hex(),group=bytes(row['group']).hex(),
                                        stratum=bucket(row),fen=row['fen'].decode(),move=moves[i],**assessment))
        if (i+1)%16==0 or i+1==len(rows):
            result['summary']=summarize(result['positions'])
            write_json(path,result)
            print(json.dumps(dict(stage='teacher_regret',model=identity['name'],done=i+1,total=len(rows),summary=result['summary'])),flush=True)
    result['summary']=summarize(result['positions'])
    result['strata']={s:summarize([r for r in result['positions'] if r['stratum']==s]) for s in ('quiet','tactical','endgame')}
    write_json(path,result)
    return result


def game_score(board,teacher):
    outcome=board.outcome(claim_draw=True)
    if outcome:
        return (.5 if outcome.winner is None else float(outcome.winner==chess.WHITE)),False,None
    info=teacher.analyse(board.fen())
    relative=(1 if info['mate']>0 else -1) if info['mate'] is not None else (1 if info['cp']>300 else -1 if info['cp'] < -300 else 0)
    white=relative if board.turn==chess.WHITE else -relative
    return (white+1)/2,True,info


def play_games(subject,opponent,openings,out,teacher,identity,max_plies=200):
    state_path=out/'games-state.json'
    state=json.loads(state_path.read_text()) if state_path.exists() else dict(identity=identity,moves=[[] for _ in range(2*len(openings))],seconds=0.)
    if state['identity']!=identity:
        raise ValueError('game resume identity mismatch')
    boards=[]
    for i,line in enumerate(state['moves']):
        board=Board(openings[i//2]['fen'])
        for uci in line:
            board.push(board.parse_uci(uci))
        boards.append(board)
    started=time.monotonic();previous=state['seconds'];last_log=0.
    while True:
        remaining=[i for i,b in enumerate(boards) if not b.is_game_over(claim_draw=True) and len(b.move_stack)<max_plies]
        if not remaining:
            break
        for mine,player in ((True,subject),(False,opponent)):
            todo=[i for i in remaining if ((boards[i].turn==chess.WHITE)==(i%2==0))==mine
                  and not boards[i].is_game_over(claim_draw=True) and len(boards[i].move_stack)<max_plies]
            if todo:
                moves,_=player.choose([boards[i] for i in todo],temperature=0.)
                for i,move in zip(todo,moves):
                    if move not in boards[i].legal_moves:
                        raise ValueError('illegal match move')
                    boards[i].push(move)
        state['moves']=[[m.uci() for m in b.move_stack] for b in boards]
        state['seconds']=previous+time.monotonic()-started
        write_json(state_path,state)
        if time.monotonic()-last_log>15:
            progress=dict(stage='games',finished=sum(b.is_game_over(claim_draw=True) or len(b.move_stack)>=max_plies for b in boards),
                          total=len(boards),min_plies=min(len(b.move_stack) for b in boards),max_plies=max(len(b.move_stack) for b in boards),seconds=state['seconds'])
            print(json.dumps(progress),flush=True);last_log=time.monotonic()
    results=[];pgns=[];trajectories=[]
    for i,board in enumerate(boards):
        white,adjudicated,analysis=game_score(board,teacher)
        score=white if i%2==0 else 1-white
        result='1-0' if white==1 else '0-1' if white==0 else '1/2-1/2'
        game=chess.pgn.Game.from_board(board)
        game.headers.update(Event='DROSO-1 controlled comparison',Date=time.strftime('%Y.%m.%d'),Round=str(i+1),
                            White=identity['subject']['name'] if i%2==0 else identity['opponent']['name'],
                            Black=identity['opponent']['name'] if i%2==0 else identity['subject']['name'],
                            Result=result,Termination='adjudication' if adjudicated else 'normal',
                            OpeningID=openings[i//2]['key'],Search=f"PUCT {identity['simulations']}")
        pgns.append(str(game)+'\n\n')
        results.append(dict(game=i,opening=i//2,subject_white=i%2==0,score=score,result=result,adjudicated=adjudicated,
                            plies=len(board.move_stack),analysis=analysis))
        trajectories.append(openings[i//2]['fen']+' '+ ' '.join(m.uci() for m in board.move_stack))
    (out/'games.pgn').write_text(''.join(pgns))
    # Reparse independently to check serialized moves, colors and natural results.
    parsed=0
    with (out/'games.pgn').open() as stream:
        while game:=chess.pgn.read_game(stream):
            if game.errors:
                raise ValueError('PGN parse error')
            board=game.board()
            for move in game.mainline_moves():
                if move not in board.legal_moves:
                    raise ValueError('PGN illegal move')
                board.push(move)
            outcome=board.outcome(claim_draw=True)
            if outcome and outcome.result()!=game.headers['Result']:
                raise ValueError('PGN natural result mismatch')
            parsed+=1
    if parsed!=len(results):
        raise ValueError('PGN game count mismatch')
    scores=np.array([r['score'] for r in results])
    pairs=scores.reshape(-1,2).mean(1)
    rng=np.random.default_rng(2026092301)
    bootstrap=pairs[rng.integers(len(pairs),size=(5000,len(pairs)))].mean(1)
    degenerate=len(pairs)<2 or np.ptp(bootstrap)==0
    report=dict(identity=identity,games=len(results),wins=int((scores==1).sum()),draws=int((scores==.5).sum()),
                losses=int((scores==0).sum()),score=float(scores.mean()),
                opening_cluster_95=None if degenerate else np.quantile(bootstrap,[.025,.975]).tolist(),
                uncertainty='constant/insufficient opening-pair outcomes; bootstrap interval unavailable' if degenerate else 'empirical opening-cluster bootstrap',
                adjudicated=sum(r['adjudicated'] for r in results),unique_trajectories=len(set(trajectories)),
                legal_pgn_verified=True,seconds=state['seconds'],details=results,
                limitations=['Single seed; paired openings are the sampling unit.', 'No Elo estimate.',
                             'Capped games adjudicated by Stockfish at fixed node budget and +/-300cp.'])
    write_json(out/'games-report.json',report)
    return report


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--checkpoint',type=Path)
    parser.add_argument('--arms',nargs='+',choices=('A','B'),default=[])
    parser.add_argument('--bundle', type=Path, help='Compare with a portable model bundle')
    parser.add_argument('--data',type=Path,default=BASE/'data/droso-1')
    parser.add_argument('--split',choices=('dev','validation','test'),default='dev')
    parser.add_argument('--final',action='store_true')
    parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--simulations',type=int,default=64)
    parser.add_argument('--teacher-nodes',type=int,default=200000)
    parser.add_argument('--limit',type=int,default=0)
    parser.add_argument('--games',action='store_true')
    parser.add_argument('--games-only',action='store_true')
    parser.add_argument('--opening-limit',type=int,default=0)
    args=parser.parse_args()
    if args.split=='test' and not args.final:
        parser.error('final holdout requires explicit --final after candidate selection')
    torch.set_num_threads(2)
    torch.backends.cuda.matmul.allow_tf32=True
    args.out.mkdir(parents=True,exist_ok=True)
    rows=np.load(args.data/f'{args.split}.npy',mmap_mode='r')
    if args.limit:rows=rows[:args.limit]
    models={};metadata={};players={}
    for arm in args.arms:
        if args.checkpoint is None:parser.error('--checkpoint required for fresh arms')
        model,meta=load_checkpoint(args.checkpoint,arm)
        name='fresh_'+arm;models[name]=model;metadata[name]=meta|dict(name=name,player='current_CP_PUCT')
        players[name]=Player(model,device='cuda',batch=32,simulations=args.simulations)
    if args.bundle:
        model, manifest = load_bundle(args.bundle)
        name = 'DROSO-1'
        models[name] = model
        metadata[name] = manifest['provenance'] | dict(name=name, manifest_sha256=sha256(args.bundle/'manifest.json'))
        players[name] = Player(model, device='cuda', batch=32, simulations=args.simulations)
    if not players:parser.error('select at least one model')
    teacher=Teacher(args.data/'teacher-cache.sqlite',args.teacher_nodes)
    identity=dict(split=args.split,positions=len(rows),data_file_sha256=sha256(args.data/f'{args.split}.npy'),
                  simulations=args.simulations,c_puct=1.5,teacher_nodes=args.teacher_nodes,engine_sha256=teacher.engine_hash,
                  evaluation_code_sha256={name:sha256(BASE/name) for name in EVALUATION_FILES})
    report=dict(stage='running',created_at=now(),settings=identity,models=metadata,regret={},matches=[])
    if args.split=='test':
        write_json(args.out/'final-test-use.json',dict(models=metadata,settings=identity,opened_at=now()))
    try:
        if not args.games_only:
            for name,player in players.items():
                current=identity|metadata[name]
                moves=selected_moves(player,rows,args.out/f'{name}-moves.json',current)
                result=score_moves(teacher,rows,moves['moves'],args.out/f'{name}-regret.json',current)
                report['regret'][name]=result['summary']|dict(strata=result['strata'],selection_seconds=moves['seconds'])
                write_json(args.out/'report.json',report)
            if len(players)==2:
                names=list(players)
                pairs=[json.loads((args.out/f'{name}-regret.json').read_text())['positions'] for name in names]
                report['paired_comparison']=dict(a=names[0],b=names[1],**paired_interval(pairs[0],pairs[1],[bytes(r['group']).hex() for r in rows]))
        if args.games or args.games_only:
            if len(players)!=2:parser.error('games require exactly two models')
            openings=json.loads((args.data/'openings.json').read_text())[args.split]
            if args.opening_limit:openings=openings[:args.opening_limit]
            names=list(players)
            match_identity=dict(subject=metadata[names[0]],opponent=metadata[names[1]],simulations=args.simulations,
                                c_puct=1.5,openings_sha256=sha256(args.data/'openings.json'),split=args.split,
                                opening_count=len(openings),teacher_nodes=args.teacher_nodes,
                                engine_sha256=teacher.engine_hash,evaluation_code_sha256=identity['evaluation_code_sha256'])
            result=play_games(players[names[0]],players[names[1]],openings,args.out,teacher,match_identity)
            report['matches'].append(result)
        report.update(stage='completed',finished_at=now())
        write_json(args.out/'report.json',report)
        print(json.dumps(report),flush=True)
    finally:
        teacher.close()


if __name__=='__main__':
    main()
