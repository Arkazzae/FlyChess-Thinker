"""Cached single-threaded Stockfish analysis of the actual selected move."""
import hashlib
import json
import sqlite3

import chess
import chess.engine
import numpy as np

from generate import DEFAULT_ENGINE
from droso1.common import sha256


class Teacher:
    def __init__(self, cache, nodes=200000):
        self.nodes=nodes
        self.engine_hash=sha256(DEFAULT_ENGINE)
        self.connection=sqlite3.connect(cache)
        self.connection.execute('CREATE TABLE IF NOT EXISTS analysis (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
        self.engine=chess.engine.SimpleEngine.popen_uci(str(DEFAULT_ENGINE))
        self.engine.configure({'Threads':1,'Hash':32,'UCI_ShowWDL':True})

    def close(self):
        self.engine.quit()
        self.connection.close()

    def analyse(self, fen, move=None, nodes=None):
        nodes=nodes or self.nodes
        spec=dict(fen=fen,move=move,nodes=nodes,engine_sha256=self.engine_hash,threads=1,hash_mb=32,clear_hash_per_query=True)
        key=hashlib.sha256(json.dumps(spec,sort_keys=True).encode()).hexdigest()
        hit=self.connection.execute('SELECT value FROM analysis WHERE key=?',(key,)).fetchone()
        if hit:
            return json.loads(hit[0])
        board=chess.Board(fen)
        choices=None if move is None else [board.parse_uci(move)]
        info=self.engine.analyse(board,chess.engine.Limit(nodes=nodes),root_moves=choices,game=object())
        score=info['score'].pov(board.turn)
        wdl=info.get('wdl')
        row=spec|dict(cp=score.score(),mate=score.mate(),depth=info.get('depth'),actual_nodes=info.get('nodes'),
                      pv=[m.uci() for m in info.get('pv',[])],
                      wdl=list(wdl.pov(board.turn)) if wdl else None)
        self.connection.execute('INSERT INTO analysis VALUES (?,?)',(key,json.dumps(row)))
        self.connection.commit()
        return row

    def regret(self, fen, move):
        root=self.analyse(fen)
        chosen=self.analyse(fen,move)
        raw=None if root['cp'] is None or chosen['cp'] is None else root['cp']-chosen['cp']
        # Equal strengthened budgets for both queries at ambiguous thresholds
        # or when a bounded root search appears worse than the chosen move.
        confirm=(raw is not None and (raw < -50 or 250 <= raw <= 350)) or ((root['mate'] is None)!=(chosen['mate'] is None))
        if confirm:
            root=self.analyse(fen,nodes=max(self.nodes,1000000))
            chosen=self.analyse(fen,move,nodes=max(self.nodes,1000000))
        return score_regret(root,chosen)|dict(root=root,chosen=chosen,confirmed=confirm)


def score_regret(root,chosen):
    root_win=root['mate'] is not None and root['mate']>0
    chosen_win=chosen['mate'] is not None and chosen['mate']>0
    root_loss=root['mate'] is not None and root['mate']<0
    chosen_loss=chosen['mate'] is not None and chosen['mate']<0
    raw=None if root['cp'] is None or chosen['cp'] is None else root['cp']-chosen['cp']
    regret=None if raw is None else max(0,raw)
    lost_mate=root_win and not chosen_win
    allowed_mate=chosen_loss and not root_loss
    return dict(raw_cp_difference=raw,cp_regret=regret,severe=bool(lost_mate or allowed_mate or (regret is not None and regret>=300)),
                teacher_mating_win_lost=lost_mate,teacher_mating_loss_allowed=allowed_mate,
                negative_cp_difference=raw is not None and raw<0)


def summarize(rows):
    cp=[r['cp_regret'] for r in rows if r['cp_regret'] is not None]
    return dict(positions=len(rows),severe_count=sum(r['severe'] for r in rows),
                severe_rate=sum(r['severe'] for r in rows)/max(1,len(rows)),
                cp_comparable=len(cp),mean_cp_regret=float(np.mean(cp)) if cp else None,
                median_cp_regret=float(np.median(cp)) if cp else None,
                p95_cp_regret=float(np.quantile(cp,.95)) if cp else None,
                teacher_mating_wins_lost=sum(r['teacher_mating_win_lost'] for r in rows),
                teacher_mating_losses_allowed=sum(r['teacher_mating_loss_allowed'] for r in rows),
                negative_differences=sum(r['negative_cp_difference'] for r in rows))


def paired_interval(a,b,groups,seed=2026092301):
    if len(a)!=len(b) or len(a)!=len(groups):
        raise ValueError('matched samples required')
    unique=sorted(set(groups))
    deltas=np.array([int(y['severe'])-int(x['severe']) for x,y in zip(a,b)],float)
    if len(unique)<2:
        return dict(b_minus_a_severe_rate=float(deltas.mean()),cluster_bootstrap_95=None,clusters=len(unique),positions=len(a),
                    unit='known game or source shard; imported game IDs unavailable',uncertainty='insufficient independent clusters')
    totals=np.array([deltas[np.array(groups)==g].sum() for g in unique])
    counts=np.array([sum(x==g for x in groups) for g in unique])
    rng=np.random.default_rng(seed)
    sampled=rng.integers(len(unique),size=(5000,len(unique)))
    differences=totals[sampled].sum(1)/counts[sampled].sum(1)
    degenerate=np.ptp(differences)==0
    return dict(b_minus_a_severe_rate=float(deltas.mean()),
                cluster_bootstrap_95=None if degenerate else np.quantile(differences,[.025,.975]).tolist(),
                clusters=len(unique),positions=len(a),unit='known game or source shard; imported game IDs unavailable',
                uncertainty='constant sampled cluster effects cannot establish zero uncertainty' if degenerate else 'empirical cluster bootstrap')
