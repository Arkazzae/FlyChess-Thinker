"""Finalize deduplication with valid pain/context preferred over earlier plain copies.

Historical early DAgger shards often predate cost recording. File-order dedup
would discard later explicit errors at identical positions. Select the richest
available row first; never invent the missing history or teacher depth.
"""
import argparse
import json
import sqlite3
import time
from collections import Counter
from pathlib import Path

import numpy as np

from droso1.common import now, sha256, write_json
from droso1.data import SOURCES


def reindex(directory):
    manifest_path=directory/'manifest.json'
    original=json.loads(manifest_path.read_text())
    if original.get('dedup_revision')==2:
        return original
    (directory/'manifest-before-supervision-dedup.json').write_bytes(manifest_path.read_bytes())
    original_hash=sha256(manifest_path)
    parts=sorted(original['prepared_sources'],key=lambda p:({'dagger':0,'generated':1,'lichess':2}[p['source']],p['file']))
    db=directory/'supervision-dedup.sqlite'
    db.unlink(missing_ok=True)
    connection=sqlite3.connect(db)
    connection.execute('PRAGMA journal_mode=OFF')
    connection.execute('PRAGMA synchronous=OFF')
    connection.execute('CREATE TABLE selected (key BLOB PRIMARY KEY, part INTEGER, row INTEGER, priority INTEGER) WITHOUT ROWID')
    statement=('INSERT INTO selected VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET '
               'part=excluded.part,row=excluded.row,priority=excluded.priority WHERE excluded.priority>selected.priority')
    start=time.monotonic()
    for number,part in enumerate(parts):
        rows=np.load(directory/part['file'],mmap_mode='r')
        priorities=np.where(rows['blunder']>=0,2,np.where(rows['value_mask'][:,2]>0,1,0))
        connection.executemany(statement,((bytes(key),number,i,int(priority)) for i,(key,priority) in enumerate(zip(rows['key'],priorities))))
        connection.commit()
        if number%50==0:
            print(json.dumps(dict(stage='supervision_dedup',parts=number,total=len(parts),seconds=time.monotonic()-start)),flush=True)
    connection.execute('CREATE INDEX selected_part ON selected(part)')
    connection.commit()
    train=[]; source_indices={s:[] for s in SOURCES};offset=0
    masks=Counter();weights=Counter();underpromotions=Counter();duplicates=Counter();source_coverage={}
    for number,part in enumerate(parts):
        rows=np.load(directory/part['file'],mmap_mode='r')
        indices=np.array([r[0] for r in connection.execute('SELECT row FROM selected WHERE part=? ORDER BY row',(number,))],dtype=np.int64)
        chosen=rows[indices]
        target=directory/'train'/Path(part['file']).name
        temporary=target.with_suffix('.tmp.npy')
        np.save(temporary,chosen);temporary.replace(target)
        n=len(chosen); source=part['source']
        duplicates[source]+=len(rows)-n
        if n:
            train.append(dict(file=str(target.relative_to(directory)),source=source,records=n,sha256=sha256(target)))
            source_indices[source].append(np.arange(offset,offset+n,dtype=np.int64))
            offset+=n
        for i in range(3): masks[str(i)]+=int(chosen['value_mask'][:,i].sum())
        masks['reply']+=int((chosen['reply']>=0).sum())
        masks['pain']+=int((chosen['blunder']>=0).sum())
        masks['wdl']+=int(chosen['wdl_mask'].sum())
        weights.update({str(float(w)):int((chosen['weight']==w).sum()) for w in np.unique(chosen['weight'])})
        underpromotions[source]+=int((chosen['alt'][:,0]>=4096).sum())
        counts=source_coverage.setdefault(source,Counter())
        counts['records']+=n;counts['pain']+=int((chosen['blunder']>=0).sum())
        counts['future']+=int(chosen['value_mask'][:,1].sum());counts['outcome']+=int(chosen['value_mask'][:,2].sum())
    for source,parts_ids in source_indices.items():
        indices=np.concatenate(parts_ids)
        np.save(directory/f'indices-{source}.npy',indices)
    connection.close()
    original.update(train=train,unique_train_records=offset,source_counts={s:sum(map(len,p)) for s,p in source_indices.items()},
                    dedup_revision=2,deduplication='canonical position globally: prefer explicit valid pain, then actual game context, then first deterministic source/file order; no claim about lost teacher depth',
                    duplicates_removed=dict(duplicates),valid_labels=dict(masks),sample_weights=dict(weights),
                    best_underpromotions=dict(underpromotions),source_label_coverage={s:dict(c) for s,c in source_coverage.items()},
                    index_sha256={f'indices-{s}.npy':sha256(directory/f'indices-{s}.npy') for s in SOURCES},
                    previous_manifest_sha256=original_hash,dedup_code_sha256=sha256(__file__),dedup_finished_at=now())
    write_json(manifest_path,original)
    write_json(directory/'status.json',dict(stage='completed',dedup_revision=2,unique_train_records=offset,updated_at=now()))
    print(json.dumps(dict(stage='completed',records=offset,valid_labels=dict(masks),seconds=time.monotonic()-start)),flush=True)
    return original


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data',type=Path,required=True)
    args=parser.parse_args();reindex(args.data)
