"""Pinned anatomy and shared paths for DROSO-1."""
from datetime import datetime, timezone
from pathlib import Path

from core.common import sha256, write_json

BASE = Path(__file__).resolve().parents[1]
GRAPH = BASE.parent / 'artifacts/droso-1/graph.npz'
GRAPH_HASH = '9d154f9c68faea2e7e8b18ff835ebbb15a18ad92d13e1608923d8f3473574ea4'
SEED = 2026092301


def now():
    return datetime.now(timezone.utc).isoformat()


def code_hashes():
    files = [*sorted((BASE / 'droso1').glob('*.py')), BASE / 'model.py', BASE / 'flychess.py',
             BASE / 'training_state.py', BASE / 'core/encoding.py', BASE / 'core/puct.py',
             BASE / 'core/player.py', BASE / 'core/input_map.py']
    return {str(p.relative_to(BASE)): sha256(p) for p in files}
