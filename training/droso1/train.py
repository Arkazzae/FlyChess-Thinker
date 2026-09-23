"""CUDA-only fresh A/B experiment, durable checkpoints and exact sampler resume."""
import argparse
import gc
import hashlib
import json
import math
import time
from pathlib import Path

import numpy as np
import torch

from model import Graph, SparseMatmul
from training_state import RunControl, atomic_checkpoint, capture_rng, restore_rng
from droso1.common import BASE, GRAPH, GRAPH_HASH, SEED, now, sha256, write_json
from droso1.data import Dataset, SOURCES, unpack
from droso1.loss import losses
from droso1.model import Brain, optimizer_for

CONFIG = dict(steps=10, hidden=512, central_sample=2048, seed=SEED)
TRAIN_FILES = ['droso1/train.py', 'droso1/model.py', 'droso1/loss.py', 'droso1/data.py', 'droso1/common.py',
               'model.py', 'flychess.py', 'training_state.py', 'core/encoding.py', 'core/input_map.py']


def parameter_hash(model):
    digest = hashlib.sha256()
    for name, value in model.named_parameters():
        digest.update(name.encode())
        digest.update(value.detach().cpu().contiguous().numpy().tobytes())
    return digest.hexdigest()


def verify_data_files(directory):
    manifest=json.loads((directory/'manifest.json').read_text())
    if not manifest.get('smoke_only') and manifest.get('dedup_revision')!=2:
        raise ValueError('production training requires supervision-preserving global deduplication')
    for item in manifest['train']:
        if sha256(directory/item['file'])!=item['sha256']:
            raise ValueError(f'changed data shard: {item["file"]}')
    for name,expected in manifest.get('index_sha256',{}).items():
        if sha256(directory/name)!=expected:
            raise ValueError(f'changed source index: {name}')
    if not manifest.get('smoke_only'):
        if len(manifest.get('index_sha256',{}))!=3:
            raise ValueError('missing sampler index provenance')
        for item in manifest['dev']:
            if sha256(directory/item['file'])!=item['sha256']:
                raise ValueError('changed development data')
    return manifest


@torch.no_grad()
def calibrate(model, rows):
    bn = model.feature_norm
    momentum, training = bn.momentum, model.training
    bn.reset_running_stats()
    bn.momentum = None
    model.train()
    for start in range(0, len(rows), 256):
        batch = unpack(rows[start:start+256], 'cuda')
        model(batch['squares'], batch['globals'])
    bn.momentum = momentum
    model.train(training)


@torch.no_grad()
def diagnostics(model, rows):
    model.eval()
    totals = dict(n=0, cp_squared_error=0., policy_top1=0, raw_legal=0, legal_mass=0., reply_n=0, reply_top1=0)
    for start in range(0, len(rows), 128):
        batch = unpack(rows[start:start+128], 'cuda')
        policy, reply, value = model(batch['squares'], batch['globals'])
        n = len(policy)
        best = batch['alt'][:, 0]
        totals['n'] += n
        totals['cp_squared_error'] += float((value[:, 0] - batch['value'][:, 0]).square().sum())
        totals['policy_top1'] += int((policy.masked_fill(~batch['legal'], float('-inf')).argmax(1) == best).sum())
        totals['raw_legal'] += int(batch['legal'].gather(1, policy.argmax(1)[:, None]).sum())
        totals['legal_mass'] += float((policy.softmax(1) * batch['legal']).sum())
        valid_reply = batch['reply'] >= 0
        totals['reply_n'] += int(valid_reply.sum())
        totals['reply_top1'] += int((reply.argmax(1)[valid_reply] == batch['reply'][valid_reply]).sum())
    n = totals['n']
    return dict(positions=n, cp_mse=totals['cp_squared_error']/n, policy_top1=totals['policy_top1']/n,
                raw_legal=totals['raw_legal']/n, legal_mass=totals['legal_mass']/n,
                reply_positions=totals['reply_n'], reply_top1=totals['reply_top1']/max(1,totals['reply_n']))


def gradient_probe(model, batch, arm):
    """Rare diagnostic on shared readout, never an automatic weight balancer."""
    model.train()
    output = model(batch['squares'], batch['globals'], bptt=4)
    _, terms = losses(output, batch, model.gain, arm)
    report = {}
    for name, loss in terms.items():
        if not loss.requires_grad or name == 'gain':
            continue
        gradient = torch.autograd.grad(loss, model.hidden.weight, retain_graph=True, allow_unused=True)[0]
        report[name] = None if gradient is None else float(gradient.norm())
    model.zero_grad(set_to_none=True)
    return report


def load_checkpoint(path, arm, device='cuda'):
    state = torch.load(path, map_location='cpu', weights_only=False, mmap=True)
    if state.get('format_version') != 'flywire_fresh_10':
        raise ValueError('not a fresh-model checkpoint')
    if sha256(state['graph_path']) != state['graph_sha256']:
        raise ValueError('graph hash mismatch')
    model = Brain(Graph.load(state['graph_path']), **state['model_config'])
    saved = state['models'][arm]
    for name in ('crow', 'col', 'base', 'norm', 'vis_square', 'readout_index'):
        if not torch.equal(model.state_dict()[name], saved[name]):
            raise ValueError(f'anatomy/interface mismatch: {name}')
    model.load_state_dict(saved, strict=True)
    meta = dict(checkpoint=str(Path(path).resolve()), sha256=sha256(path), arm=arm,
                seen=state['seen'][arm], step=state['steps'][arm], graph_sha256=state['graph_sha256'],
                initial_parameter_sha256=state['initial_parameter_sha256'], data_sha256=state['data_sha256'])
    return model.to(device).eval(), meta


def run(args, control):
    if not torch.cuda.is_available():
        raise RuntimeError('RTX/CUDA required; no CPU training fallback')
    torch.set_num_threads(2)
    torch.backends.cuda.matmul.allow_tf32 = True
    torch.backends.cudnn.allow_tf32 = True
    if sha256(GRAPH) != GRAPH_HASH:
        raise ValueError('pinned FlyWire graph changed')
    hashes = {name: sha256(BASE/name) for name in TRAIN_FILES}
    data_hash = sha256(args.data/'manifest.json')
    verify_data_files(args.data)
    path = args.run/'last.pt'
    if path.exists() != args.resume:
        raise ValueError('use --resume exactly when continuing an existing fresh run')
    state = torch.load(path, map_location='cpu', weights_only=False, mmap=True) if args.resume else None
    if state and (state['code_hashes'] != hashes or state['data_sha256'] != data_hash or state['graph_sha256'] != GRAPH_HASH):
        raise ValueError('resume requires identical training code, data and anatomy')
    data = Dataset(args.data)
    dev = np.load(args.data/'dev.npy', mmap_mode='r')
    calibration_indices = np.concatenate([data.sample(i, seed=SEED+811) for i in range(12)])
    calibration_rows = data.rows(calibration_indices)
    calibration_hash = hashlib.sha256(calibration_rows.tobytes()).hexdigest()
    if state and state['calibration_sha256'] != calibration_hash:
        raise ValueError('training-only calibration pool changed')
    graph = Graph.load(str(GRAPH))
    models, optimizers = {}, {}
    initial_hash = state['initial_parameter_sha256'] if state else None
    all_arms = tuple(state['models']) if state else tuple(args.arms)
    seen = dict(state['seen']) if state else {arm: 0 for arm in all_arms}
    steps = dict(state['steps']) if state else {arm: 0 for arm in all_arms}
    if any(arm not in all_arms for arm in args.arms):
        raise ValueError('cannot introduce an arm partway through an experiment')
    for arm in args.arms:
        torch.manual_seed(SEED)
        model = Brain(graph, **CONFIG)
        if not state:
            digest = parameter_hash(model)
            if initial_hash is None:
                initial_hash = digest
                atomic_checkpoint(dict(model=model.state_dict(), model_config=CONFIG, seen=0,
                                       seed=SEED, parameter_sha256=digest, graph_sha256=GRAPH_HASH), args.run/'initial.pt')
            elif digest != initial_hash:
                raise ValueError('A and B must have exactly the same fresh parameters')
            if model.gain.count_nonzero() or model.bias.count_nonzero():
                raise ValueError('unexpected learned graph initialization')
        else:
            model.load_state_dict(state['models'][arm], strict=True)
        model = model.cuda()
        optimizer = optimizer_for(model)
        if state:
            optimizer.load_state_dict(state['optimizers'][arm])
        elif optimizer.state:
            raise ValueError('optimizer must start empty')
        models[arm], optimizers[arm] = model, optimizer
    del graph
    gc.collect()
    if len(args.arms) > 1 and len({seen[a] for a in args.arms}) != 1:
        raise ValueError('paired comparison requires equal exposure')
    if state:
        restore_rng(state['rng'])
    SparseMatmul.edge_samples = 96
    started = time.monotonic()
    previous_seconds = state.get('elapsed_seconds', 0.) if state else 0.
    last_save = started
    start_steps = dict(steps)
    source_counts = np.zeros(3, np.int64)
    label_counts = np.zeros(3, np.int64)
    terms_accum = {a: {} for a in args.arms}
    batch_hash = None
    recipe = dict(created_at=now(), fresh_initialization=True, transferred_learned_weights=False,
                  arms=all_arms, active_arms=args.arms, model_config=CONFIG, batch=256, bptt=4, edge_samples=96,
                  gain_and_bias_lr=2e-5, other_lr=6e-5, warmup_steps=400, betas=[.9,.98], clip=1,
                  current_cp_coefficient='2 / reference valid value head count, identical for A/B',
                  temporal_supervision='A only: actual +8 CP, outcome, consistency; B masks the package',
                  value_in_search='tanh CP now', source_probabilities=data.manifest['source_probabilities'],
                  calibration_sha256=calibration_hash, initial_parameter_sha256=initial_hash,
                  data_sha256=data_hash, graph_sha256=GRAPH_HASH, code_hashes=hashes)
    if not (args.run/'recipe.json').exists():
        write_json(args.run/'recipe.json', recipe)
    metrics = (args.run/'metrics.jsonl').open('a')
    (args.run/'snapshots').mkdir(exist_ok=True)

    def payload():
        return dict(format_version='flywire_fresh_10', model_config=CONFIG,
                    models={a: models[a].state_dict() if a in models else state['models'][a] for a in all_arms},
                    optimizers={a: optimizers[a].state_dict() if a in optimizers else state['optimizers'][a] for a in all_arms},
                    seen=seen, steps=steps, rng=capture_rng(), elapsed_seconds=previous_seconds+time.monotonic()-started,
                    graph_path=str(GRAPH), graph_sha256=GRAPH_HASH, data_path=str(args.data.resolve()), data_sha256=data_hash,
                    code_hashes=hashes, initial_parameter_sha256=initial_hash, calibration_sha256=calibration_hash,
                    last_batch_sha256=batch_hash, active_arms=args.arms, target_seen=args.target_seen)

    def save(status, snapshot=False):
        nonlocal last_save
        for arm, model in models.items():
            calibrate(model, calibration_rows)
            optimizers[arm].zero_grad(set_to_none=True)
        saved = payload()
        atomic_checkpoint(saved, path)
        if snapshot:
            name = '-'.join(f'{a}{seen[a]}' for a in args.arms)
            atomic_checkpoint(saved, args.run/'snapshots'/f'{name}.pt')
        control.publish(status, seen=seen, steps=steps, checkpoint_seen=dict(seen), device='cuda',
                        target_seen=args.target_seen, active_arms=args.arms, elapsed_seconds=saved['elapsed_seconds'])
        last_save = time.monotonic()

    def stopped():
        return control.should_stop() or all(seen[a] >= args.target_seen for a in args.arms) or (
            args.max_steps and min(steps[a]-start_steps[a] for a in args.arms) >= args.max_steps)

    print(json.dumps(dict(stage='starting', seen=seen, target_seen=args.target_seen, active_arms=args.arms,
                          fresh=state is None, initial_parameter_sha256=initial_hash)), flush=True)
    save('running')
    try:
        while not stopped():
            step = steps[args.arms[0]]
            indices = data.sample(step)
            batch_hash = hashlib.sha256(indices.astype('<i8').tobytes()).hexdigest()
            batch = data.batch(indices, 'cuda')
            source_counts += np.bincount(batch['source'].cpu().numpy(), minlength=3)
            label_counts += batch['value_mask'].sum(0).cpu().numpy().astype(np.int64)
            order = list(args.arms)[::1 if step%2==0 else -1]
            for arm in order:
                model, optimizer = models[arm], optimizers[arm]
                model.train()
                torch.manual_seed(SEED+step)
                for group, rate in zip(optimizer.param_groups, [2e-5,6e-5]):
                    group['lr'] = rate * min(1., (step+1)/400)
                optimizer.zero_grad(set_to_none=True)
                output = model(batch['squares'], batch['globals'], bptt=4)
                total, terms = losses(output, batch, model.gain, arm)
                if not torch.isfinite(total):
                    raise FloatingPointError(f'nonfinite {arm} loss; keeping previous committed checkpoint')
                total.backward()
                norm = torch.nn.utils.clip_grad_norm_(model.parameters(), 1., error_if_nonfinite=True)
                optimizer.step()
                optimizer.zero_grad(set_to_none=True)
                terms_accum[arm] = {k:float(v.detach()) for k,v in terms.items()} | {'total':float(total.detach()), 'gradient_norm':float(norm)}
                del output, total, terms
            # Commit counters only after the complete matched batch succeeded.
            for arm in args.arms:
                steps[arm] += 1
                seen[arm] += 256
            step += 1
            if step % 50 == 0 or step == 1:
                elapsed = time.monotonic()-started
                record = dict(stage='training', seen=dict(seen), steps=dict(steps), seconds=previous_seconds+elapsed,
                              presentations_per_second=256*sum(steps[a]-start_steps[a] for a in args.arms)/elapsed,
                              terms=terms_accum, sources=dict(zip(SOURCES,source_counts.tolist())),
                              valid_value_labels=label_counts.tolist(), batch_sha256=batch_hash,
                              peak_cuda_bytes=torch.cuda.max_memory_allocated(), updated_at=now())
                metrics.write(json.dumps(record)+'\n'); metrics.flush()
                print(json.dumps(record), flush=True)
                control.publish('running', **{k:v for k,v in record.items() if k!='stage'})
            check = step % 2048 == 0
            if check or time.monotonic()-last_save >= 120 or stopped():
                save('running', snapshot=check)
            if check:
                report = {a:diagnostics(m,dev) for a,m in models.items()}
                probe_batch=unpack(calibration_rows[:256],'cuda')
                probes = {a:gradient_probe(m,probe_batch,a) for a,m in models.items()}
                del probe_batch
                record = dict(stage='dev', seen=dict(seen), diagnostics=report, readout_gradient_norms=probes, updated_at=now())
                metrics.write(json.dumps(record)+'\n'); metrics.flush()
                print(json.dumps(record),flush=True)
                # Probe updates BN in training mode; restore the common fixed calibration.
                save('running')
        status = 'completed' if all(seen[a]>=args.target_seen for a in args.arms) else 'paused'
        save(status, snapshot=True)
        report = dict(stage=status, seen=dict(seen), steps=dict(steps), active_arms=args.arms,
                      diagnostics={a:diagnostics(m,dev) for a,m in models.items()},
                      initial_parameter_sha256=initial_hash, stop_reason=control.reason or ('target_reached' if status=='completed' else 'max_steps'),
                      checkpoint_sha256=sha256(path), updated_at=now())
        write_json(args.run/'training-result.json', report)
        print(json.dumps(report),flush=True)
    finally:
        metrics.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', type=Path, required=True)
    parser.add_argument('--data', type=Path, default=BASE/'data/droso-1')
    parser.add_argument('--arms', nargs='+', choices=('A','B'), default=['A','B'])
    parser.add_argument('--target-seen', type=int, default=1048576)
    parser.add_argument('--resume', action='store_true')
    parser.add_argument('--max-steps', type=int, default=0)
    args=parser.parse_args()
    if args.target_seen<=0 or args.target_seen%256 or len(set(args.arms))!=len(args.arms):
        parser.error('positive full-batch target and distinct arms required')
    args.run=args.run.resolve(); args.data=args.data.resolve()
    with RunControl(args.run) as control:
        run(args,control)


if __name__=='__main__':
    main()
