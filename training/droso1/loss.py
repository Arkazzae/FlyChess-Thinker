"""Matched current-CP weighting; A adds only actual temporal/outcome supervision."""
import torch
from torch.nn import functional as F


def losses(output, batch, gain, arm):
    if arm not in ('A', 'B'):
        raise ValueError('unknown experimental arm')
    policy, reply, value = output
    weight = batch['weight']
    denom = weight.sum().clamp(min=1e-12)
    valid_alt = batch['alt'] != 65535
    alt = batch['alt'].masked_fill(~valid_alt, 0)
    scores = (batch['altcp'] - batch['altcp'][:, :1]) / 120.
    target = scores.masked_fill(~valid_alt, float('-inf')).softmax(1)
    full_logp = F.log_softmax(policy, 1)
    legal_logp = F.log_softmax(policy.masked_fill(~batch['legal'], float('-inf')), 1).clamp(min=-30)
    full = -(full_logp.gather(1, alt) * target).sum(1)
    masked = -(legal_logp.gather(1, alt) * target).sum(1)
    policy_loss = ((.4 * full + .6 * masked) * weight).sum() / denom
    has_reply = batch['reply'] >= 0
    reply_loss = F.cross_entropy(reply[has_reply], batch['reply'][has_reply]) if has_reply.any() else reply.sum()*0
    hurt = batch['blunder'] >= 0
    pain_loss = policy.sum()*0
    if hurt.any():
        probability = legal_logp[hurt].gather(1, batch['blunder'][hurt, None]).squeeze(1).exp().clamp(max=.999)
        pain_loss = (-torch.log1p(-probability) * batch['pain'][hurt]).sum() / len(weight)
    masks = batch['value_mask']
    divisor = masks.sum(1).clamp(min=1)
    errors = F.mse_loss(value, batch['value'], reduction='none') * masks
    current = (2 * errors[:, 0] / divisor * weight).sum() / denom
    future = (2 * errors[:, 1] / divisor * weight).sum() / denom
    outcome = (2 * errors[:, 2] / divisor * weight).sum() / denom
    consistency = value.sum()*0
    if arm == 'A':
        m01 = masks[:, 0] * masks[:, 1] * (batch['left'] > 8)
        m12 = masks[:, 1] * masks[:, 2]
        d12 = torch.pow(value.new_tensor(.96), (batch['left'] - 8).clamp(min=0, max=60).to(value.dtype))
        consistency = (((value[:, 0] - .96**8 * value[:, 1]).square() * m01).sum() / m01.sum().clamp(min=1)
                       + ((value[:, 1] - d12 * value[:, 2]).square() * m12).sum() / m12.sum().clamp(min=1))
    gain_loss = .001 * gain.square().mean()
    total = policy_loss + .5*reply_loss + .5*pain_loss + current + gain_loss
    if arm == 'A':
        total = total + future + outcome + .25*consistency
    return total, dict(policy=policy_loss, reply=.5*reply_loss, pain=.5*pain_loss, current=current,
                       future=future if arm == 'A' else future.detach()*0,
                       outcome=outcome if arm == 'A' else outcome.detach()*0,
                       consistency=.25*consistency, gain=gain_loss)
