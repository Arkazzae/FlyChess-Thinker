"""Paired uncertainty, including CP regret only on the common comparable subset."""
import argparse
import json
from pathlib import Path

import numpy as np

from droso1.common import now,sha256,write_json
from droso1.teacher import paired_interval


def compare(a,b):
    settings=('split','positions','data_file_sha256','simulations','c_puct','teacher_nodes','engine_sha256')
    if any(a['identity'][k]!=b['identity'][k] for k in settings):
        raise ValueError('paired comparison requires matching data and search settings')
    if a['identity'].get('common_teacher_budgets_sha256')!=b['identity'].get('common_teacher_budgets_sha256'):
        raise ValueError('common teacher budget vectors must match')
    left,right=a['positions'],b['positions']
    key=lambda r:(r['index'],r['key'],r['group'],r['fen'])
    if [key(r) for r in left]!=[key(r) for r in right]:
        raise ValueError('positions and groups must align')
    groups=[r['group'] for r in left]
    common=[(x,y) for x,y in zip(left,right) if x['cp_regret'] is not None and y['cp_regret'] is not None]
    cp=dict(positions=len(common),excluded_mate_or_non_cp=len(left)-len(common),
            mean_a=None,mean_b=None,b_minus_a_mean=None,cluster_bootstrap_95=None,clusters=0)
    if common:
        x=np.array([x['cp_regret'] for x,y in common],float)
        y=np.array([y['cp_regret'] for x,y in common],float)
        group=np.array([x['group'] for x,y in common]);unique=sorted(set(group))
        cp.update(mean_a=float(x.mean()),mean_b=float(y.mean()),b_minus_a_mean=float((y-x).mean()),clusters=len(unique))
        if len(unique)>1:
            total=np.array([(y-x)[group==g].sum() for g in unique])
            counts=np.array([(group==g).sum() for g in unique])
            rng=np.random.default_rng(2026092301)
            indices=rng.integers(len(unique),size=(5000,len(unique)))
            differences=total[indices].sum(1)/counts[indices].sum(1)
            if np.ptp(differences)>0:cp['cluster_bootstrap_95']=np.quantile(differences,[.025,.975]).tolist()
    return dict(created_at=now(),a=a['identity'],b=b['identity'],
                severe=paired_interval(left,right,groups),cp_common_subset=cp,
                limitations=['CP comparison excludes every position with a mate score in either evaluation; mate mistakes remain in the primary severe metric.',
                             'Known games or source shards are the bootstrap units; missing imported game IDs remain a limitation.',
                             'Null intervals mean insufficient/constant cluster information, not proven equality.'])


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--a',type=Path,required=True)
    parser.add_argument('--b',type=Path,required=True)
    parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args()
    result=compare(json.loads(args.a.read_text()),json.loads(args.b.read_text()))
    result['files_sha256']={str(p):sha256(p) for p in (args.a,args.b,Path(__file__))}
    write_json(args.out,result)
    print(json.dumps({k:result[k] for k in ('severe','cp_common_subset')}))
