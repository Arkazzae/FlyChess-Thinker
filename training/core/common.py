"""Small, dependency-free provenance helpers."""
import hashlib
import json
from pathlib import Path


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


def write_json(path, value):
    path = Path(path)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')
    temporary.replace(path)


def split_group(group, seed):
    bucket = int(hashlib.sha256(f'{seed}:{group}'.encode()).hexdigest()[:8], 16) % 100
    return 'train' if bucket < 80 else 'dev' if bucket < 90 else 'test'


def source_hashes():
    root = Path(__file__).resolve().parent.parent
    files = [*sorted((root / 'v7').glob('*.py')), root / 'model.py', root / 'flychess.py', root / 'player.py']
    return {str(path.relative_to(root)): sha256(path) for path in files}
