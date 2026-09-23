"""Lossless portable DROSO-1 inference export, checked against the saved model."""
import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

import chess
import numpy as np
import torch

from droso1.common import BASE,now,sha256,write_json
from droso1.bundle import load_bundle
from droso1.player import Board,Player,encode_search
from droso1.train import load_checkpoint
from core.encoding import legal_moves


RUNTIME_FILES=('model.py','flychess.py','player.py','core/input_map.py',
               'core/__init__.py','core/encoding.py','core/player.py','core/puct.py',
               'droso1/__init__.py','droso1/model.py','droso1/player.py','droso1/bundle.py')
FIXTURES=(chess.STARTING_FEN,
          'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
          '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 20',
          '4k3/8/8/8/3Pp3/8/8/4K3 b - d3 0 20',
          '7k/4P3/8/8/8/8/8/K7 w - - 0 40',
          'k7/8/8/8/8/8/4p3/7K b - - 0 40')


@torch.no_grad()
def export(checkpoint,arm,destination):
    if destination.exists():raise FileExistsError('export into a new directory; frozen exports are immutable')
    torch.set_num_threads(2)
    torch.backends.cuda.matmul.allow_tf32=True
    model,provenance=load_checkpoint(checkpoint,arm)
    saved=torch.load(checkpoint,map_location='cpu',weights_only=False,mmap=True)
    destination.mkdir(parents=True)
    np.savez_compressed(destination/'weights.npz',**{name:value.cpu().numpy() for name,value in model.state_dict().items()})
    shutil.copy2(saved['graph_path'],destination/'graph.npz')
    for name in RUNTIME_FILES:
        target=destination/name
        target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(BASE/name,target)
    requirements=f'numpy=={np.__version__}\nchess=={chess.__version__}\ntorch=={torch.__version__.split("+")[0]}\n'
    (destination/'requirements.txt').write_text(requirements)
    (destination/'README.md').write_text('''# DROSO-1 — portable Python inference

Run inside this directory, with the recorded NumPy/chess/PyTorch dependencies:

```bash
python -m droso1.bundle --device cuda
python -m droso1.bundle --device cuda --moves e2e4 c7c5
```

Use `--fen '...'` and optionally `--unknown-clock` for imported diagrams.
`--moves` preserves the subsequent game history. CPU inference is supported;
this package contains no CPU trainer. Search defaults to 64 PUCT simulations.
The player uses the current-CP tanh output, never the auxiliary outputs as WDL.
All legal queen/rook/bishop/knight promotions have separate policy actions.

Weights are lossless NumPy arrays, with anatomy and inference source included.
The manifest pins each file and records the original training checkpoint.
Keep that checkpoint for resuming training: this inference bundle has no AdamW
state. This is the 4168-action DROSO-1 contract, not a drop-in file for the old
4096-action browser importer. CUDA PyTorch must match the local driver;
`requirements.txt` records the tested versions, not a CUDA wheel repository.
''')
    shutil.copy2(BASE/'LICENSE', destination/'LICENSE')
    files=(*RUNTIME_FILES,'LICENSE','graph.npz','weights.npz','requirements.txt','README.md')
    manifest=dict(model_name='DROSO-1',format='flywire-fresh-10-numpy',created_at=now(),provenance=provenance,
                  model_config=saved['model_config'],training_code_sha256=saved['code_hashes'],
                  contract=dict(square_features=15,global_features=22,move_space=4168,
                                value='tanh(current_CP/600), side to move',auxiliary_outputs_used_for_search=False,
                                promotions=['queen','rook','bishop','knight'],search='PUCT',simulations=64,c_puct=1.5),
                  files={name:sha256(destination/name) for name in files})
    write_json(destination/'manifest.json',manifest)
    reloaded,_=load_bundle(destination)
    exact=all(torch.equal(value,reloaded.state_dict()[name]) for name,value in model.state_dict().items())
    if not exact:raise AssertionError('lossless tensor roundtrip failed')
    boards=[Board(fen) for fen in FIXTURES]+[Board(FIXTURES[1],halfmove_known=False)]
    encoded=[encode_search(board) for board in boards]
    squares=torch.tensor(np.stack([r[0] for r in encoded]),device='cuda')
    globals_=torch.tensor(np.stack([r[1] for r in encoded]),device='cuda')
    expected=model(squares,globals_);actual=reloaded(squares,globals_)
    errors=[float((a-b).abs().max()) for a,b in zip(expected,actual)]
    # Sparse CUDA accumulation can cross a BF16 rounding boundary in the
    # auxiliary reply head, even on repeated calls to the same model. Keep
    # strict checks on the policy/current-value outputs used by the player.
    if not all(torch.allclose(expected[i],actual[i],atol=2e-4,rtol=2e-4) for i in (0,2)):
        raise AssertionError(f'export policy/value parity: {errors}')
    reply=expected[1].to(torch.bfloat16)
    positive=torch.full_like(reply,float('inf'))
    negative=-positive
    reply_ulp=torch.maximum((torch.nextafter(reply,positive).float()-reply.float()).abs(),
                            (torch.nextafter(reply,negative).float()-reply.float()).abs())
    reply_delta=(expected[1]-actual[1]).abs()
    if not bool((reply_delta<=reply_ulp).all()):
        raise AssertionError(f'export reply differs by more than one BF16 step: {errors}')
    reply_rounding=dict(differing_logits=int(torch.count_nonzero(reply_delta)),
                        maximum_absolute_difference=errors[1],
                        maximum_bfloat16_steps=float((reply_delta/reply_ulp).max()),
                        tolerance='One BF16 representable step for the auxiliary reply head only; policy/value retain strict tolerance.')
    first,_=Player(model,device='cuda',simulations=64).choose(boards,temperature=0.)
    second,_=Player(reloaded,device='cuda',simulations=64).choose(boards,temperature=0.)
    if first!=second:raise AssertionError('export chosen-move parity failed')
    for board in boards[4:6]:
        promotions=[m.promotion for m in legal_moves(board).values() if m.promotion]
        if set(promotions)!={chess.QUEEN,chess.ROOK,chess.BISHOP,chess.KNIGHT}:
            raise AssertionError('promotion contract failed')
    # Independent FP32 inference check, without the CUDA autocast path. This
    # is read-only CPU inference; it neither trains nor alters saved weights.
    cpu_expected=model.cpu()(squares.cpu(),globals_.cpu())
    cpu_actual=reloaded.cpu()(squares.cpu(),globals_.cpu())
    cpu_errors=[float((a-b).abs().max()) for a,b in zip(cpu_expected,cpu_actual)]
    if not all(torch.equal(a,b) for a,b in zip(cpu_expected,cpu_actual)):
        raise AssertionError(f'export FP32 reference is not exact: {cpu_errors}')
    # Execute the copied runtime in a fresh process from the export directory.
    completed=subprocess.run([sys.executable,'-m','droso1.bundle','--device','cuda','--simulations','64'],
                             cwd=destination,text=True,capture_output=True,check=True)
    standalone=json.loads(completed.stdout)
    if standalone['move']!=first[0].uci():raise AssertionError('standalone runtime move mismatch')
    report=dict(stage='passed',tensor_roundtrip_exact=exact,forward_max_absolute_errors=errors,
                auxiliary_reply_rounding=reply_rounding,fp32_cpu_forward_exact=True,
                fp32_cpu_max_absolute_errors=cpu_errors,
                fixtures=[dict(fen=b.fen(),halfmove_known=b.halfmove_known,move=m.uci()) for b,m in zip(boards,first)],
                standalone_runtime_verified=True,all_promotions_both_colors=True,
                manifest_sha256=sha256(destination/'manifest.json'),finished_at=now())
    write_json(destination/'verification.json',report)
    print(json.dumps(report),flush=True)
    return report


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--checkpoint',type=Path,required=True)
    parser.add_argument('--arm',choices=('A','B'),required=True)
    parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args()
    export(args.checkpoint.resolve(),args.arm,args.out.resolve())
