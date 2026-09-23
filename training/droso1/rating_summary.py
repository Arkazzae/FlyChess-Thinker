"""Conditional Elo performance and opening-family clustered uncertainty."""
import argparse
import json
import math
from pathlib import Path

import numpy as np

from droso1.common import now, sha256, write_json


def expected(rating, opponents):
    return 1/(1+np.power(10.,(np.asarray(opponents)-np.asarray(rating)[...,None])/400))


def fit_rating(total_points, counts, opponents):
    """Fractional-score logistic estimate, preserving infinite boundary results."""
    points=np.asarray(total_points,dtype=float)
    counts=np.asarray(counts,dtype=float)
    opponents=np.asarray(opponents,dtype=float)
    games=counts.sum(axis=-1)
    if np.any(games<=0) or np.any(points<0) or np.any(points>games):
        raise ValueError('invalid game scores/counts')
    low=np.full(points.shape,-10000.)
    high=np.full(points.shape,10000.)
    for _ in range(75):
        mid=(low+high)/2
        prediction=(expected(mid,opponents)*counts).sum(axis=-1)
        low=np.where(prediction<points,mid,low)
        high=np.where(prediction>=points,mid,high)
    result=(low+high)/2
    return np.where(points==0,-np.inf,np.where(points==games,np.inf,result))


def bound(value):
    return dict(value=float(value) if np.isfinite(value) else None,
                boundary=None if np.isfinite(value) else 'negative_infinity' if value<0 else 'positive_infinity')


def interval(values):
    ordered=np.sort(np.asarray(values))
    if len(ordered)<2 or ordered[0]==ordered[-1]:
        return dict(lower=None,upper=None,reason='Constant bootstrap sample; does not imply certainty.')
    # Empirical order statistics retain infinite tails without NaN interpolation.
    lower=ordered[max(0,math.ceil(.025*len(ordered))-1)]
    upper=ordered[min(len(ordered)-1,math.ceil(.975*len(ordered))-1)]
    return dict(lower=bound(lower),upper=bound(upper),reason=None)


def summarize(paths,out):
    reports=[json.loads(p.read_text()) for p in paths]
    for r in reports:
        if r['stage']!='completed' or r['unresolved']:
            raise ValueError('rating requires completed matches without censored games')
    first=reports[0]['identity']
    fields=('checkpoint','engine_sha256','stockfish_depth','stockfish_threads','stockfish_hash_mb',
            'simulations','c_puct','openings','opening_count','wave_size','code_sha256')
    if any(any(r['identity'][f]!=first[f] for f in fields) for r in reports):
        raise ValueError('rating opponents must use the same frozen model and protocol')
    ratings=np.array([r['identity']['UCI_Elo'] for r in reports])
    if len(set(ratings))!=len(ratings):raise ValueError('one report per opponent level')
    families=sorted({g['family'] for r in reports for g in r['details']})
    counts=np.zeros((len(families),len(reports)))
    points=np.zeros_like(counts)
    for j,r in enumerate(reports):
        for opening in range(first['opening_count']):
            pair=[g for g in r['details'] if g['opening']==opening]
            if len(pair)!=2 or {g['subject_white'] for g in pair}!={True,False}:
                raise ValueError('every opening must have paired colours')
        for row in r['details']:
            if row['score'] not in (0.,.5,1.):raise ValueError('invalid finished score')
            if row['family']!=first['openings'][row['opening']][1]:raise ValueError('opening family mismatch')
            i=families.index(row['family']);counts[i,j]+=1;points[i,j]+=row['score']
        if len(r['details'])!=r['games']:raise ValueError('match details incomplete')
    total_counts=counts.sum(axis=0);total_points=points.sum(axis=0)
    rating=float(fit_rating(total_points.sum(),total_counts,ratings))
    rng=np.random.default_rng(2026092312)
    sampled=rng.integers(len(families),size=(10000,len(families)))
    boot_counts=counts[sampled].sum(axis=1);boot_points=points[sampled].sum(axis=1)
    boot_ratings=fit_rating(boot_points.sum(axis=1),boot_counts,ratings)
    per_level=[]
    for j,r in enumerate(reports):
        scores=boot_points[:,j]/boot_counts[:,j]
        performance=float(fit_rating(total_points[j],[total_counts[j]],[ratings[j]]))
        performance_boot=fit_rating(boot_points[:,j],boot_counts[:,j,None],[ratings[j]])
        per_level.append(dict(opponent_uci_elo=int(ratings[j]),games=r['games'],
            wins=r['wins'],draws=r['draws'],losses=r['losses'],score=float(total_points[j]/total_counts[j]),
            score_family_bootstrap_95=interval(scores),performance=bound(performance),
            performance_family_bootstrap_95=interval(performance_boot),
            natural_games=r['games']-r['unresolved'],unique_trajectories=r['unique_trajectories']))
    result=dict(stage='completed',created_at=now(),performance_rating=bound(rating),
        performance_family_bootstrap_95=interval(boot_ratings),
        games=int(total_counts.sum()),points=float(total_points.sum()),
        families=len(families),family_names=families,opponents=per_level,
        checkpoint=first['checkpoint'],simulations=first['simulations'],stockfish_depth=first['stockfish_depth'],
        bootstrap=dict(samples=10000,seed=2026092312,unit='Entire opening family, both colours and all opponent levels together',
            negative_infinite_samples=int(np.isneginf(boot_ratings).sum()),positive_infinite_samples=int(np.isposinf(boot_ratings).sum())),
        files_sha256={str(p):sha256(p) for p in [*paths,Path(__file__)]},
        limitations=['Conditional performance on SF19 UCI_Elo settings at depth 8; not FIDE, Chess.com or Lichess rating.',
            'Intervals cover sampled opening-family variation only, not systematic error in opponent calibration.',
            'Stockfish official UCI_Elo calibration uses 120s+1s and CCRL40/4; the depth-limited protocol differs.',
            'A single model seed; Stockfish internal handicap randomness is not externally seed-controlled.',
            'A logistic performance model assumes a consistent rating scale across the two opponent settings.'])
    write_json(out,result)
    print(json.dumps({k:result[k] for k in ('performance_rating','performance_family_bootstrap_95','games','points','opponents')}),flush=True)
    return result


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input',type=Path,action='append',required=True)
    parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args();summarize(args.input,args.out)
