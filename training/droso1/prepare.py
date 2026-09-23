"""Audit the whole legacy corpus on disk; reserve grouped evaluation before training."""
import argparse
import hashlib
import json
import os
import sqlite3
import time
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import chess
import numpy as np

from droso1.common import BASE, SEED, now, sha256, write_json
from droso1.data import PACKED, SOURCES, SOURCE_PROBABILITIES, canonical_key, convert, group_key, source_of


def bucket(row):
    board = chess.Board(row['fen'].decode())
    if chess.popcount(board.occupied) <= 8:
        return 'endgame'
    valid = row['alt'] != 65535
    cp = row['altcp'][valid]
    if row['pain'] > 0 or board.is_check() or (len(cp) > 1 and int(cp[0]) - int(cp[1]) >= 100):
        return 'tactical'
    return 'quiet'


def protect(board):
    keys = {canonical_key(board)}
    for move in list(board.legal_moves):
        board.push(move)
        keys.add(canonical_key(board))
        board.pop()
    return keys


def old_positions():
    keys = set()
    from droso1.diagnostics import cases
    for row in cases():
        keys.add(canonical_key(chess.Board(row['fen'])))
    return keys, {}


def select_evaluation(paths, out, seed):
    rng = np.random.default_rng(seed)
    reserved = {'dev': [], 'validation': [], 'test': []}
    # Whole imported shards and whole generated shards are withheld. Original
    # game identities of imports are irretrievable; the manifest records this.
    for source in SOURCES:
        pool = [p for p in paths if source_of(p) == source]
        pool = [pool[i] for i in rng.permutation(len(pool))]
        count = 4 if source == 'dagger' else 2 if source == 'generated' else 1
        for j, split in enumerate(reserved):
            reserved[split].extend(pool[j * count:(j + 1) * count])
    previous, native = old_positions()
    roots = set(previous)
    protected = set(previous)
    split_protected = {}
    selected, openings, counts = {}, {}, {}
    groups = set()
    for split, n in [('dev', 256), ('validation', 512), ('test', 512)]:
        quotas = {}
        source_n = [int(n * .6), int(n * .25)]
        source_n.append(n - sum(source_n))
        for source, total in zip(SOURCES, source_n):
            quotas[source, 'endgame'] = total // 4
            quotas[source, 'tactical'] = total // 4
            quotas[source, 'quiet'] = total - 2 * (total // 4)
        found = Counter()
        rows, opening_rows = [], []
        own_protected = set()
        for path in reserved[split]:
            with np.load(path) as z:
                records = z['records']
            source = source_of(path)
            for index in rng.permutation(len(records)):
                source_complete = all(found[source, category] >= quotas[source, category] for category in ('endgame', 'tactical', 'quiet'))
                openings_complete = source != 'generated' or len(opening_rows) >= (8 if split == 'dev' else 16 if split == 'validation' else 32)
                if source_complete and openings_complete:
                    break
                raw = records[index]
                fields = raw['fen'].decode().split()
                if (source != 'lichess' and int(fields[5]) < 9) or abs(int(raw['cp'])) > 1800:
                    continue
                try:
                    row = convert(raw, records, int(index), path, paths.index(path), native_wdl=native)
                except ValueError:
                    continue
                key = bytes(row['key'])
                if key in protected:
                    continue
                board = chess.Board(row['fen'].decode())
                need_opening = (source == 'generated' and len(opening_rows) < (8 if split == 'dev' else 16 if split == 'validation' else 32)
                                and 9 <= board.fullmove_number <= 20 and abs(int(row['cp'][0])) <= 100
                                and chess.popcount(board.occupied) >= 20)
                stratum = (source, bucket(row))
                need_position = found[stratum] < quotas[stratum]
                if not need_position and not need_opening:
                    continue
                children = protect(board)
                # Roots cannot equal another split's root or immediate child.
                if children.intersection(roots):
                    continue
                if need_position:
                    rows.append(row)
                    found[stratum] += 1
                if need_opening:
                    opening_rows.append(dict(fen=row['fen'].decode(), key=key.hex(), group=bytes(row['group']).hex(),
                                             original_id=f'{path.name}:{index}', cp=int(row['cp'][0])))
                roots.add(key)
                own_protected.update(children)
                protected.update(children)
                groups.add(bytes(row['group']))
        if len(rows) != n:
            raise ValueError(f'incomplete held-out strata {split}: {dict(found)} / {quotas}')
        expected_openings = 8 if split == 'dev' else 16 if split == 'validation' else 32
        if len(opening_rows) != expected_openings:
            raise ValueError(f'not enough distinct openings: {split}: {len(opening_rows)}')
        target = out / f'{split}.npy'
        np.save(target, np.array(rows, dtype=PACKED))
        selected[split] = [dict(file=target.name, records=n, sha256=sha256(target))]
        counts[split] = {f'{s}/{b}': int(v) for (s, b), v in found.items()}
        openings[split] = opening_rows
        split_protected[split] = sorted(k.hex() for k in own_protected)
    write_json(out / 'openings.json', openings)
    write_json(out / 'split-protection.json', split_protected)
    write_json(out / 'held-out.json', dict(reserved_shards={k: [p.name for p in v] for k, v in reserved.items()},
                                         counts=counts, splits=selected, source_group_limitation='Import game IDs were lost; whole-shard and canonical-position isolation do not prove source-game isolation.',
                                         old_diagnostic_roots=len(previous)))
    np.save(out / 'protected-keys.npy', np.array(sorted(protected), dtype='V16'))
    np.save(out / 'protected-groups.npy', np.array(sorted(groups), dtype='V16'))
    write_json(out / 'native-wdl.json', {k.hex(): v for k, v in native.items()})
    return reserved, selected


_protected = None
_groups = None
_native = None


def initialize_worker(out):
    global _protected, _groups, _native
    out = Path(out)
    _protected = {bytes(k) for k in np.load(out / 'protected-keys.npy')}
    _groups = {bytes(k) for k in np.load(out / 'protected-groups.npy')}
    _native = {bytes.fromhex(k): v for k, v in json.loads((out / 'native-wdl.json').read_text()).items()}


def prepare_shard(job):
    number, path, out = job
    path, out = Path(path), Path(out)
    target = out / 'parts' / f'{number:04d}.npy'
    metadata = target.with_suffix('.json')
    source_hash = sha256(path)
    if metadata.exists():
        prior = json.loads(metadata.read_text())
        if prior['source_sha256'] != source_hash or prior['sha256'] != sha256(target):
            raise ValueError('prepared shard changed')
        return prior
    start = time.monotonic()
    with np.load(path) as z:
        records = z['records']
    result = np.empty(len(records), dtype=PACKED)
    rejected, n = Counter(), 0
    for index, record in enumerate(records):
        try:
            if group_key(path, record) in _groups:
                rejected['held_out_group'] += 1
                continue
            row = convert(record, records, index, path, number, native_wdl=_native)
            if bytes(row['key']) in _protected:
                rejected['held_out_or_diagnostic_position'] += 1
                continue
            result[n] = row
            n += 1
        except ValueError as error:
            rejected[str(error)] += 1
    temporary = target.with_suffix('.tmp.npy')
    np.save(temporary, result[:n])
    temporary.replace(target)
    info = dict(file=str(target.relative_to(out)), records=n, source=source_of(path),
                source_path=str(path), source_sha256=source_hash, source_records=len(records),
                rejected=dict(rejected), sha256=sha256(target), seconds=time.monotonic() - start)
    write_json(metadata, info)
    return info


def finalize(out, prepared, held):
    """One canonical position globally; priority DAgger, real games, then imports.

    Prefer retained explicit bad-move supervision and temporal context. Teacher
    depth was lost, so this is a declared convention, not a best-label claim.
    """
    db = out / 'dedup.sqlite'
    if db.exists():
        db.unlink()
    connection = sqlite3.connect(db)
    connection.execute('PRAGMA journal_mode=OFF')
    connection.execute('PRAGMA synchronous=OFF')
    connection.execute('CREATE TABLE seen (key BLOB PRIMARY KEY) WITHOUT ROWID')
    train = []
    offset = 0
    source_ids = {s: [] for s in SOURCES}
    duplicates = Counter()
    masks, weights, promotions = Counter(), Counter(), Counter()
    priority = {'dagger': 0, 'generated': 1, 'lichess': 2}
    for part in sorted(prepared, key=lambda x: (priority[x['source']], x['file'])):
        path = out / part['file']
        rows = np.load(path, mmap_mode='r')
        keep = np.empty(len(rows), np.int64)
        n = 0
        cursor = connection.cursor()
        for i, key in enumerate(rows['key']):
            cursor.execute('INSERT OR IGNORE INTO seen VALUES (?)', (bytes(key),))
            if cursor.rowcount:
                keep[n] = i
                n += 1
        connection.commit()
        duplicates[part['source']] += len(rows) - n
        target = out / 'train' / path.name
        selected = rows[keep[:n]]
        np.save(target, selected)
        item = dict(file=str(target.relative_to(out)), records=n, source=part['source'], sha256=sha256(target))
        if n:
            train.append(item)
            source_ids[part['source']].append(np.arange(offset, offset + n, dtype=np.int64))
            offset += n
        masks.update({str(i): int(selected['value_mask'][:, i].sum()) for i in range(3)})
        masks['reply'] += int((selected['reply'] >= 0).sum())
        masks['pain'] += int((selected['blunder'] >= 0).sum())
        masks['wdl'] += int(selected['wdl_mask'].sum())
        weights.update({str(float(w)): int((selected['weight'] == w).sum()) for w in np.unique(selected['weight'])})
        promotions[part['source']] += int((selected['alt'][:, 0] >= 4096).sum())
    connection.close()
    for source, parts in source_ids.items():
        indices = np.concatenate(parts)
        if len(indices) == 0:
            raise ValueError(f'empty source {source}')
        np.save(out / f'indices-{source}.npy', indices)
    manifest = dict(format_version=10, created_at=now(), seed=SEED, train=train, **held,
                    unique_train_records=offset, source_counts={s: sum(map(len, v)) for s, v in source_ids.items()},
                    source_probabilities=dict(zip(SOURCES, SOURCE_PROBABILITIES.tolist())),
                    deduplication='canonical color/rank-mirrored position, legal EP; first DAgger, then generated, then Lichess; lost teacher depth cannot rank duplicates by quality',
                    duplicates_removed=dict(duplicates), valid_labels=dict(masks), sample_weights=dict(weights),
                    best_underpromotions=dict(promotions), prepared_sources=prepared,
                    protection_sha256=sha256(out / 'protected-keys.npy'), openings_sha256=sha256(out / 'openings.json'),
                    native_wdl_source='stockfish19_50000_nodes_multipv3; retained separately and masked when absent',
                    preprocessing_sha256={p.name: sha256(p) for p in [Path(__file__), Path(__file__).with_name('data.py')]})
    write_json(out / 'manifest.json', manifest)
    write_json(out / 'status.json', dict(stage='completed', unique_train_records=offset, updated_at=now()))
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--shards', type=Path, default=BASE / 'data/shards')
    parser.add_argument('--workers', type=int, default=2)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    for name in ('parts', 'train'):
        (args.out / name).mkdir(exist_ok=True)
    config_path = args.out / 'preparation-code.json'
    preparation_code = {str(p.relative_to(BASE)): sha256(p) for p in [Path(__file__), Path(__file__).with_name('data.py'), BASE/'core/encoding.py', BASE/'flychess.py']}
    if config_path.exists() and json.loads(config_path.read_text()) != preparation_code:
        raise ValueError('preparation code changed; use a new output directory')
    write_json(config_path, preparation_code)
    if (args.out / 'manifest.json').exists():
        print('Dataset already complete; retaining it.', flush=True)
        return
    paths = sorted(args.shards.glob('*.npz'))
    write_json(args.out / 'status.json', dict(stage='selecting_evaluation', pid=os.getpid(), updated_at=now()))
    write_json(args.out / 'source-inventory.json', [dict(path=str(p), sha256=sha256(p)) for p in paths])
    if not (args.out / 'held-out.json').exists():
        reserved, selected = select_evaluation(paths, args.out, SEED)
    else:
        held = json.loads((args.out / 'held-out.json').read_text())
        reserved = {k: [args.shards / n for n in v] for k, v in held['reserved_shards'].items()}
        selected = held['splits']
    withheld = {p for group in reserved.values() for p in group}
    jobs = [(i, str(p), str(args.out)) for i, p in enumerate(paths) if p not in withheld]
    # Expensive imports first lets two workers overlap them while the remaining
    # small shards stream through; completion and dedup order stay deterministic.
    jobs.sort(key=lambda job: (-Path(job[1]).stat().st_size, job[0]))
    started = time.monotonic()
    prepared = []
    with ProcessPoolExecutor(max_workers=args.workers, initializer=initialize_worker, initargs=(str(args.out),)) as executor:
        for info in executor.map(prepare_shard, jobs, chunksize=1):
            prepared.append(info)
            status = dict(stage='preparing', completed_shards=len(prepared), total_shards=len(jobs),
                          validated_records=sum(p['records'] for p in prepared), seconds=time.monotonic() - started,
                          latest=info['file'], updated_at=now(), pid=os.getpid())
            write_json(args.out / 'status.json', status)
            print(json.dumps(status), flush=True)
    print(json.dumps(dict(stage='deduplicating', seconds=time.monotonic() - started)), flush=True)
    manifest = finalize(args.out, prepared, selected)
    print(json.dumps(dict(stage='completed', records=manifest['unique_train_records'], seconds=time.monotonic() - started)), flush=True)


if __name__ == '__main__':
    main()
