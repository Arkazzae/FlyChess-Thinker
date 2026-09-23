"""Audit paired games and cluster uncertainty by known source game, not FEN alone."""
import argparse
import json
from collections import Counter
from pathlib import Path

import chess.pgn
import numpy as np

from droso1.common import BASE,now,sha256,write_json
from droso1.data import canonical_key


def clustered_score(scores,groups):
    scores=np.array(scores,float);groups=np.array(groups)
    if len(scores)!=len(groups) or not len(scores) or not np.isin(scores,[0.,.5,1.]).all():
        raise ValueError('one valid game score per group required')
    unique=sorted(set(groups));interval=None
    if len(unique)>1:
        totals=np.array([scores[groups==g].sum() for g in unique])
        counts=np.array([(groups==g).sum() for g in unique])
        rng=np.random.default_rng(2026092301)
        sampled=rng.integers(len(unique),size=(5000,len(unique)))
        boot=totals[sampled].sum(1)/counts[sampled].sum(1)
        if np.ptp(boot)>0:interval=np.quantile(boot,[.025,.975]).tolist()
    return dict(score=float(scores.mean()),source_game_clusters=len(unique),source_game_cluster_95=interval,
                unit='Known source game, including both colors and all sampled starts from that game.',
                uncertainty='Null interval means insufficient or constant cluster observations, not certainty.')


def audit(report_path,openings_path,out):
    report=json.loads(report_path.read_text())
    if report['stage']!='completed' or len(report['matches'])!=1:
        raise ValueError('one completed match required')
    match=report['matches'][0];identity=match['identity']
    if sha256(openings_path)!=identity['openings_sha256']:
        raise ValueError('opening provenance changed')
    openings=json.loads(openings_path.read_text())[identity['split']][:identity['opening_count']]
    details=match['details']
    if len(details)!=2*len(openings):raise ValueError('expected both colors for every opening')
    for i in range(len(openings)):
        rows=[r for r in details if r['opening']==i]
        if len(rows)!=2 or {r['subject_white'] for r in rows}!={False,True}:
            raise ValueError('unpaired opening')
    groups=[openings[r['opening']]['group'] for r in details]
    stats=clustered_score([r['score'] for r in details],groups)
    starts=[set() for _ in openings];parsed=0
    pgn=report_path.parent/'games.pgn'
    with pgn.open() as stream:
        while game:=chess.pgn.read_game(stream):
            if game.errors:raise ValueError('PGN errors')
            row=details[parsed];opening=row['opening'];board=game.board()
            if board.fen()!=openings[opening]['fen'] or game.headers['Result']!=row['result']:
                raise ValueError('PGN identity/result mismatch')
            starts[opening].add(canonical_key(board))
            for ply,move in enumerate(game.mainline_moves(),1):
                if move not in board.legal_moves:raise ValueError('illegal PGN move')
                board.push(move)
                if ply<=16:starts[opening].add(canonical_key(board))
            parsed+=1
    if parsed!=len(details):raise ValueError('PGN game count mismatch')
    intersections=[]
    for i in range(len(openings)):
        for j in range(i):
            shared=starts[i]&starts[j]
            if shared:intersections.append(dict(opening_a=j,opening_b=i,shared_canonical_positions=len(shared),same_source_game=openings[j]['group']==openings[i]['group']))
    result=dict(stage='passed',created_at=now(),report_sha256=sha256(report_path),pgn_sha256=sha256(pgn),
                openings_sha256=sha256(openings_path),analysis_code_sha256=sha256(__file__),
                games=len(details),distinct_start_positions=len(set(r['fen'] for r in openings)),
                starts_per_source_game=dict(Counter(r['group'] for r in openings)),
                paired_colors_verified=True,legal_pgn_verified=True,**stats,
                opening_pairs_with_transpositions_first_16_plies=intersections,
                limitations=['Canonical overlaps ignore clocks and mirror side to move; they flag related positions rather than prove identical games.',
                             'Imported game IDs are not used here: all match starts come from generated games with known groups.',
                             'Single seed and a small selected opening sample; no Elo estimate.'])
    write_json(out,result)
    print(json.dumps({k:result[k] for k in ('games','distinct_start_positions','score','source_game_clusters','source_game_cluster_95')}))
    return result


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report',type=Path,required=True)
    parser.add_argument('--openings',type=Path,default=BASE/'data/droso-1/openings.json')
    parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args();audit(args.report,args.openings,args.out)
