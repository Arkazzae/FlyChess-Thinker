"""Export a verified DROSO-1 bundle to lossless FP32 browser assets and parity fixtures."""
import argparse
import csv
import gzip
import hashlib
import json
from pathlib import Path
import urllib.request

import chess
import numpy as np
import torch
from droso1.bundle import load_bundle, file_hash
from droso1.player import Board, encode_search
from core.encoding import move_index


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write_asset(directory, filename, data):
    directory.mkdir(parents=True, exist_ok=True)
    packed = gzip.compress(data, compresslevel=9, mtime=0)
    (directory / filename).write_bytes(packed)
    return dict(bytes=len(data), compressedBytes=len(packed), sha256=sha(data))


def export(bundle, annotations, public, fixture):
    torch.set_num_threads(2)
    model, manifest = load_bundle(bundle, 'cpu')
    provenance_path = bundle / 'graph-provenance.json'
    if not provenance_path.exists():
        provenance_path = Path(__file__).resolve().parents[2] / 'artifacts/droso-1/graph-provenance.json'
    provenance = json.loads(provenance_path.read_text())
    if manifest['files']['graph.npz'] != provenance['graph_sha256']:
        raise ValueError('Bundle graph does not match the coordinate provenance')
    source = provenance['sources'][0]
    if annotations is None:
        annotations = Path('training/data/annotations-v2.1.0.tsv')
        if not annotations.exists():
            annotations.parent.mkdir(parents=True, exist_ok=True)
            urllib.request.urlretrieve(source['url'], annotations)
    if file_hash(annotations) != source['sha256']:
        raise ValueError('Annotation checksum mismatch')
    graph = np.load(bundle / 'graph.npz', allow_pickle=False)
    w = np.load(bundle / 'weights.npz', allow_pickle=False)
    n, m = len(graph['ids']), len(graph['sources'])
    soma = {}
    with annotations.open() as stream:
        for row in csv.DictReader(stream, delimiter='\t'):
            try:
                xyz = np.array([float(row['soma_' + axis]) for axis in 'xyz']) * [4, 4, 40]
                if np.isfinite(xyz).all():
                    soma[int(row['root_id'])] = xyz
            except ValueError:
                pass
    positioned = np.array([int(i) in soma for i in graph['ids']], dtype='<u4')
    positions = np.array([soma.get(int(i), [0, 0, 0]) for i in graph['ids']], dtype=np.float32)
    selected = positioned.astype(bool)
    measured = positions[selected]
    center = (measured.min(0) + measured.max(0)) / 2
    scale = (measured.max(0) - measured.min(0)).max() / 2
    positions[selected] = (measured - center) / scale
    # CloudView displays (x, -z, y); permute anatomical axes so dorsal is up.
    positions = positions[:, [0, 2, 1]].copy()
    if not np.array_equal(graph['weights'], graph['weights'].astype('<u2')):
        raise ValueError('Synapse counts cannot be represented as uint16')
    def b(a, dtype): return np.asarray(a, dtype=dtype).tobytes()
    data = b([0x534e434d, 2, n, m], '<u4') + b(graph['ids'], '<u8')
    for a, dtype in [(graph['groups'], '<u4'), (graph['signs'], '<f4'), (positioned, '<u4'),
                     (positions, '<f4'), (graph['offsets'], '<u4'), (graph['sources'], '<u4'), (graph['weights'], '<u2')]:
        data += b(a, dtype)
    graph_meta = dict(version=2, id='flywire-v783', dataset='FlyWire FAFB v783', neurons=n, connections=m,
                      synapses=int(graph['weights'].sum(dtype=np.float64)), positioned=int(positioned.sum()),
                      groups=['optic', 'visual projection', 'central', 'descending', 'ascending', 'sensory'],
                      groupCounts=np.bincount(graph['groups'], minlength=6).tolist(),
                      sourceGraph=manifest['files']['graph.npz'], anatomySource=source,
                      coordinates=dict(source='soma_x/y/z', voxelSizeNm=[4,4,40], axes=['x','z','y'], centerNm=center.tolist(), scaleNm=float(scale)),
                      **write_asset(public / 'flywire', 'connectome.bin.gz', data))
    (public / 'flywire/manifest.json').write_text(json.dumps(graph_meta, indent=2)+'\n')
    p, h = len(w['readout_index']), model.hidden.out_features
    data = b([0x594c4643, 2, n, m, len(w['vis_index']), len(w['glob_index']), p, h, 15, 22, model.steps, 4168], '<u4')
    data += b([.65, .95, 0, 0], '<f4')
    for name, dtype in [('vis_index','<u4'),('vis_square','u1'),('vis_weight','<f4'),('glob_index','<u4'),('glob_weight','<f4'),('bias','<f4'),('gain','<f4'),('readout_index','<u4')]:
        data += b(w[name], dtype)
        data += b'\0' * (-len(data) % 4)
    bn_scale = w['feature_norm.weight'] / np.sqrt(w['feature_norm.running_var'] + model.feature_norm.eps)
    bn_shift = w['feature_norm.bias'] - w['feature_norm.running_mean'] * bn_scale
    data += b(bn_scale, '<f4') + b(bn_shift, '<f4')
    for name in ['hidden','hidden2','policy','reply','value']:
        data += b(w[name+'.weight'], '<f4') + b(w[name+'.bias'], '<f4')
    model_meta = dict(version=2,label='DROSO-1',connectome=graph_meta['sha256'],neurons=n,connections=m,
                      visualInputs=len(w['vis_index']), globalInputs=len(w['glob_index']),readout=p,hidden=h,steps=model.steps,
                      squareFeatures=15,globalFeatures=22,moveSpace=4168,precision='float32',
                      sourceWeights=manifest['files']['weights.npz'],training=dict(positions=manifest['provenance']['seen'],step=manifest['provenance']['step']),
                      search=dict(algorithm='PUCT',simulations=64,cPuct=1.5,valueHead='current_cp_tanh'),
                      **write_asset(public/'droso-1','weights.bin.gz',data))
    (public/'droso-1/model.json').write_text(json.dumps(model_meta,indent=2)+'\n')
    fixture_source = bundle / 'parity.json'
    if not fixture_source.exists():
        fixture_source = bundle / 'verification.json'
    cases=json.loads(fixture_source.read_text())
    rows=[]
    for case in cases['fixtures']:
        board=Board(case['fen'],halfmove_known=case.get('halfmove_known',True))
        for uci in case.get('moves',[]): board.push_uci(uci)
        squares, globals_=encode_search(board)
        with torch.no_grad(): policy,reply,value=model(torch.tensor(squares[None]),torch.tensor(globals_[None]))
        logits=policy[0].numpy()
        legal=[move_index(move,board.turn==chess.BLACK) for move in board.legal_moves]
        top=sorted(legal,key=lambda i:-logits[i])[:8]
        full=np.exp(logits-logits.max())
        rows.append(dict(fen=board.fen(),halfmoveKnown=board.halfmove_known,flip=board.turn==chess.BLACK,
                         squares=squares.ravel().tolist(),globals=globals_.tolist(),topMoves=top,
                         topLogits=logits[top].tolist(),policy=logits.tolist(),replyLogits=reply[0].tolist(),
                         value=value[0].tolist(),reply=int(reply[0].argmax()),
                         legalMass=float(full[legal].sum()/full.sum())))
    fixture.parent.mkdir(parents=True,exist_ok=True)
    fixture.write_text(json.dumps(dict(weights=model_meta['sha256'],positions=rows),separators=(',',':'))+'\n')
    print(json.dumps(dict(graph=graph_meta,model=model_meta),indent=2))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bundle',type=Path,default=Path('artifacts/droso-1'))
    parser.add_argument('--annotations',type=Path)
    parser.add_argument('--public',type=Path,default=Path('public/data'))
    parser.add_argument('--fixture',type=Path,default=Path('src/ai/fly/fixtures/parity.json'))
    args=parser.parse_args()
    export(args.bundle,args.annotations,args.public,args.fixture)

if __name__=='__main__': main()
