"""Load the portable inference bundle; no trainer or optimizer dependency."""
import argparse
import hashlib
import json
from pathlib import Path

import chess
import numpy as np
import torch

from model import Graph
from droso1.model import Brain
from droso1.player import Board, Player, encode_search
from core.encoding import move_index


def file_hash(path):
    digest=hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''):
            digest.update(block)
    return digest.hexdigest()


def load_bundle(directory,device='cuda'):
    directory=Path(directory)
    manifest=json.loads((directory/'manifest.json').read_text())
    if manifest['format']!='flywire-fresh-10-numpy':
        raise ValueError('unsupported bundle format')
    for name,expected in manifest['files'].items():
        path=(directory/name).resolve()
        if not path.is_relative_to(directory.resolve()) or file_hash(path)!=expected:
            raise ValueError(f'bundle integrity failure: {name}')
    model=Brain(Graph.load(str(directory/'graph.npz')),**manifest['model_config'])
    with np.load(directory/'weights.npz',allow_pickle=False) as weights:
        state={name:torch.from_numpy(weights[name]) for name in weights.files}
    for name in ('crow','col','base','norm','vis_square','readout_index'):
        if not torch.equal(model.state_dict()[name],state[name]):
            raise ValueError(f'anatomy/interface mismatch: {name}')
    model.load_state_dict(state,strict=True)
    return model.to(device).eval(),manifest


@torch.no_grad()
def inspect_position(model,board):
    squares,globals_=encode_search(board)
    device=next(model.parameters()).device
    policy,_,value=model(torch.tensor(squares[None],device=device),torch.tensor(globals_[None],device=device))
    moves=list(board.legal_moves)
    if not moves:
        return dict(current_cp_tanh=float(value[0,0]),legal_policy={})
    indices=[move_index(move,board.turn==chess.BLACK) for move in moves]
    probs=policy[0,indices].softmax(0).cpu().tolist()
    return dict(current_cp_tanh=float(value[0,0]),legal_policy=dict(zip([m.uci() for m in moves],probs)))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bundle',type=Path,default=Path(__file__).resolve().parents[1])
    parser.add_argument('--fen',default=chess.STARTING_FEN)
    parser.add_argument('--moves',nargs='*',default=[],help='UCI moves after FEN, preserving repetition history')
    parser.add_argument('--simulations',type=int,default=64)
    parser.add_argument('--device',choices=('cuda','cpu'),default='cuda')
    parser.add_argument('--unknown-clock',action='store_true')
    args=parser.parse_args()
    torch.set_num_threads(2)
    torch.backends.cuda.matmul.allow_tf32=True
    model,manifest=load_bundle(args.bundle,args.device)
    board=Board(args.fen,halfmove_known=not args.unknown_clock)
    if not board.is_valid():parser.error('invalid standard-chess FEN')
    for uci in args.moves:board.push_uci(uci)
    result=dict(fen=board.fen(),arm=manifest['provenance']['arm'],seen=manifest['provenance']['seen'])
    if board.is_game_over(claim_draw=True):
        result.update(move=None,result=board.result(claim_draw=True))
    else:
        player=Player(model,device=args.device,batch=32,simulations=args.simulations)
        chosen,_=player.choose([board],temperature=0.)
        result.update(move=chosen[0].uci(),san=board.san(chosen[0]),simulations=args.simulations,
                      **inspect_position(model,board))
    print(json.dumps(result))


if __name__=='__main__':
    main()
