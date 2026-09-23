"""Independently verify the prepared dataset and sampled original-record contracts."""
import argparse
import json
import time
from collections import Counter
from pathlib import Path

import numpy as np

from droso1.common import now, sha256, write_json
from droso1.data import PACKED, SOURCES, convert


def audit(directory):
    start=time.monotonic()
    manifest=json.loads((directory/'manifest.json').read_text())
    if manifest.get('dedup_revision')!=2:
        raise ValueError('supervision-preserving dedup must precede the audit')
    protected=np.load(directory/'protected-keys.npy')
    groups=np.load(directory/'protected-groups.npy')
    keys=[];offset=0;expected_indices={s:[] for s in SOURCES};counts=Counter();samples=[]
    profiles={s:dict(phases=Counter(),weighted_phases=Counter(),valid_value_head_count=Counter(),
                    pain_cost_cp=Counter(),weighted_records=0.,reply=0,pain=0) for s in SOURCES}
    rng=np.random.default_rng(2026092377)
    for item in manifest['train']:
        path=directory/item['file']
        if sha256(path)!=item['sha256']:raise ValueError(f'hash mismatch {path}')
        rows=np.load(path,mmap_mode='r')
        assert rows.dtype==PACKED and len(rows)==item['records']
        assert np.all(rows['source']==SOURCES.index(item['source']))
        assert not np.isin(rows['key'],protected).any(),path
        assert not np.isin(rows['group'],groups).any(),path
        assert np.all(rows['value_mask'][:,0]==1)
        assert np.all((rows['value_mask']==0)|(rows['value_mask']==1))
        if item['source']!='generated':assert np.all(rows['value_mask'][:,1:]==0)
        else:assert np.all(rows['value_mask'][:,2]==1)
        assert np.isin(rows['weight'],[1.,1.5,2.5]).all()
        assert np.all(np.isfinite(rows['globals']))
        assert np.all(rows['globals'][:,21]==0), 'no full history retained'
        assert np.all(rows['globals'][:,20]==(item['source']!='lichess'))
        assert np.all(rows['legal'].sum(1)>0)
        assert np.all(rows['alt'][:,0]<4168)
        assert np.all((rows['reply']==-1)|((rows['reply']>=0)&(rows['reply']<4168)))
        for j in range(3):
            valid=rows['alt'][:,j]!=65535
            actions=rows['alt'][valid,j].astype(np.int64)
            assert np.all(actions<4168)
            assert np.all((rows['legal'][valid,actions//8]>>(7-actions%8))&1)
        bad=rows['blunder']>=0
        if item['source']!='dagger':assert not bad.any()
        actions=rows['blunder'][bad].astype(np.int64)
        assert np.all(actions<4168)
        assert np.all((rows['legal'][bad,actions//8]>>(7-actions%8))&1)
        assert np.all(rows['pain'][bad]>0) and np.all(rows['pain'][bad]<=2)
        assert np.all(rows['pain'][~bad]==0)
        profile=profiles[item['source']]
        pieces=np.unpackbits(rows['squares'],axis=1)[:,:960].reshape(-1,64,15)[:,:,:12].sum((1,2))
        endgame=pieces<=8
        tactical=(bad|(rows['globals'][:,4]>0)|((rows['alt'][:,1]!=65535)&
                   (rows['altcp'][:,0].astype(np.int32)-rows['altcp'][:,1]>=100)))&~endgame
        for name,mask in [('endgame',endgame),('tactical',tactical),('quiet',~endgame&~tactical)]:
            profile['phases'][name]+=int(mask.sum())
            profile['weighted_phases'][name]+=float(rows['weight'][mask].sum())
        head_count=rows['value_mask'].sum(1)
        for k in (1,2,3):profile['valid_value_head_count'][str(k)]+=int((head_count==k).sum())
        for name,lo,hi in [('100-199',100,200),('200-299',200,300),('300-599',300,600),('600-or-more',600,601)]:
            cost=rows['pain']*300
            profile['pain_cost_cp'][name]+=int((bad&(cost>=lo-.01)&(cost<hi-.01)).sum())
        profile['weighted_records']+=float(rows['weight'].sum())
        profile['reply']+=int((rows['reply']>=0).sum());profile['pain']+=int(bad.sum())
        keys.append(rows['key'].copy())
        expected_indices[item['source']].append(np.arange(offset,offset+len(rows),dtype=np.int64))
        offset+=len(rows);counts[item['source']]+=len(rows)
        sample=rng.choice(len(rows),size=min(6,len(rows)),replace=False)
        samples.extend(rows[sample].copy())
    all_keys=np.concatenate(keys)
    assert len(np.unique(all_keys))==len(all_keys),'remaining global canonical duplicates'
    assert len(all_keys)==manifest['unique_train_records']
    for source,parts in expected_indices.items():
        path=directory/f'indices-{source}.npy'
        assert sha256(path)==manifest['index_sha256'][path.name]
        np.testing.assert_array_equal(np.load(path,mmap_mode='r'),np.concatenate(parts))
    held={s:np.load(directory/f'{s}.npy') for s in ('dev','validation','test')}
    protection=json.loads((directory/'split-protection.json').read_text())
    for split,rows in held.items():
        assert sha256(directory/f'{split}.npy')==manifest[split][0]['sha256']
        roots={bytes(k).hex() for k in rows['key']}
        assert len(roots)==len(rows)
        for other in held:
            if other!=split:
                assert not roots.intersection(protection[other])
                assert not {bytes(g) for g in rows['group']}.intersection(bytes(g) for g in held[other]['group'])
    inventory=json.loads((directory/'source-inventory.json').read_text())
    original_sources={}
    native={bytes.fromhex(k):v for k,v in json.loads((directory/'native-wdl.json').read_text()).items()}
    # Reconstruct targets from original immutable records on up to six rows per shard,
    # independently of packed-file hashes and the global dedup SQL.
    for row in sorted(samples,key=lambda r:int(r['shard'])):
        shard=int(row['shard']);info=inventory[shard]
        if shard not in original_sources:
            original_sources.clear()
            if sha256(info['path'])!=info['sha256']:raise ValueError('original source changed')
            with np.load(info['path']) as z:original_sources[shard]=z['records']
        records=original_sources[shard]
        regenerated=convert(records[int(row['row'])],records,int(row['row']),info['path'],shard,native_wdl=native)
        assert regenerated.tobytes()==row.tobytes(),(shard,int(row['row']))
    weighted_sampling={s:manifest['source_probabilities'][s]*profiles[s]['weighted_records']/counts[s] for s in SOURCES}
    weighted_total=sum(weighted_sampling.values())
    report=dict(stage='passed',created_at=now(),manifest_sha256=sha256(directory/'manifest.json'),
                train_records=offset,globally_unique_canonical_positions=True,train_heldout_root_or_child_overlap=0,
                train_heldout_group_overlap=0,cross_split_roots_vs_children=0,cross_split_group_overlap=0,
                sources=dict(counts),sampled_original_record_reconstructions=len(samples),
                every_packed_policy_and_pain_target_legal=True,sampler_indices_verified=True,
                split_positions={s:len(r) for s,r in held.items()},seconds=time.monotonic()-start,
                source_profiles=profiles,
                expected_source_share_after_example_weighting={s:v/weighted_total for s,v in weighted_sampling.items()},
                weighting_scope='Policy and value use example weights; reply and pain have their separately documented denominators.',
                limitations=['Imported original-game identity and some teacher metadata were irretrievably lost.',
                             'Legacy CP already collapsed mates at generation time; new benchmark preserves native mate scores.',
                             'Global dedup selects explicit pain/context first; this does not identify the deepest teacher label.'])
    write_json(directory/'audit.json',report)
    print(json.dumps(report),flush=True)
    return report


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data',type=Path,required=True)
    args=parser.parse_args();audit(args.data)
