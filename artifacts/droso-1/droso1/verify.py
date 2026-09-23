"""Verify the DROSO-1 bundle and its original CPU FP32 reference outputs."""
import argparse
import json
from pathlib import Path

import numpy as np
import torch

from droso1.bundle import load_bundle
from droso1.player import Board, encode_search


def verify(directory):
    directory = Path(directory)
    torch.set_num_threads(2)
    model, manifest = load_bundle(directory, 'cpu')
    fixtures = json.loads((directory / 'parity.json').read_text())['fixtures']
    encoded = [encode_search(Board(row['fen'], halfmove_known=row['halfmove_known']))
               for row in fixtures]
    squares = torch.tensor(np.stack([row[0] for row in encoded]))
    globals_ = torch.tensor(np.stack([row[1] for row in encoded]))
    with torch.no_grad():
        outputs = model(squares, globals_)
    errors = {}
    with np.load(directory / 'parity.npz', allow_pickle=False) as reference:
        for name, actual in zip(('policy', 'reply', 'value'), outputs):
            expected = torch.from_numpy(reference[name])
            torch.testing.assert_close(actual, expected, rtol=1e-5, atol=1e-5)
            errors[name] = float((actual - expected).abs().max())
    return dict(stage='passed', model=manifest['model_name'], fixtures=len(fixtures),
                files_verified=len(manifest['files']), fp32_max_absolute_errors=errors)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bundle', type=Path, default=Path(__file__).resolve().parents[1])
    print(json.dumps(verify(parser.parse_args().bundle), indent=2))
