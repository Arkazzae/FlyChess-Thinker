/**
 * Move selection for the Fly brain: instinct proposes, thinking decides.
 *
 * The policy head ranks moves (instinct). The brain then *thinks*: it imagines
 * the positions after its candidates, the opponent's most likely replies, its
 * own follow-ups and so on, evaluates every imagined position with its own
 * value heads and backs the values up with minimax. A move that gives up
 * material now is chosen when the imagined future is better.
 *
 * Two habits of a thinking player are part of the tree. Measured with flybrain/blunder_lab.py
 * and search_lab.py (40 games per variant against a 956 Elo opponent): 8 of 24 games were drawn
 * by repetition from won positions and 58 % of big mistakes were one- or two-move tactics that
 * instinct never proposed; adding the habits took the same brain from 956 to 1073 Elo.
 *   - memory: a position that already occurred in this game counts as a draw, as engines score
 *     it, so a winning side stops shuffling and a losing side goes looking for the repetition;
 *   - forcing moves: captures that win material on a simple count and queen promotions are
 *     always imagined, for both sides, even when instinct ranks them low. Judging the resulting
 *     position is still the brain's own job.
 *
 * Thinking is iterative: each stage looks wider, later deeper, than the last and
 * reuses every evaluation made so far. It stops when the time budget runs out
 * and plays the result of the last completed stage. flybrain/player.py mirrors
 * the same tree and back-up rule so training-time Elo probes measure the same
 * player.
 */

import { Chess } from "chess.js";
import { combinedValue, type BrainOutput } from "./brain.ts";
import { decodeMoveIndex, encodeBoard, MOVE_SPACE, type EncodedBoard } from "./encoding.ts";

export type Evaluator = (board: EncodedBoard) => BrainOutput | Promise<BrainOutput>;

/** Moves examined at each half-move of the imagined tree: [own candidates, replies, own follow-ups, …]. */
export type Widths = readonly number[];

export interface PlanOptions {
  /** How many policy candidates are examined. 1 disables lookahead. */
  candidates: number;
  /** How many opponent replies are examined per candidate. 0 = one half-move lookahead only. */
  replies: number;
  /** Weight of the policy prior (log-probability relative to the best candidate). */
  priorWeight: number;
  /** Softmax temperature over final scores; 0 picks the best. */
  temperature: number;
  random?: () => number;
  /** Thinking time in milliseconds. When set, stages from `stages` run until it is used up. */
  budgetMs?: number;
  /** Successive thinking stages; defaults to THINKING_STAGES. The first stage always completes. */
  stages?: readonly Widths[];
  /** Called after every completed stage with the decision so far. */
  onStage?: (decision: FlyDecision) => void;
  now?: () => number;
  /** Memory: how often each position of this game has occurred (keys from positionKey), the current one included. */
  seen?: Record<string, number>;
  /** How many forcing moves are imagined on top of instinct's candidates at every node. Default 2. */
  forcing?: number;
}

/** A forced-in move is never penalised more than this share of the best prior. */
export const PRIOR_FLOOR = 0.35;
const PIECE_WORTH: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** Identity of a position for repetition: placement, side to move, castling rights, en passant. */
export function positionKey(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

/** Position counts of a game from chess.js verbose history (each entry carries `before` and `after`). */
export function seenPositions(history: readonly { before: string; after: string }[], currentFen: string): Record<string, number> {
  const seen: Record<string, number> = {};
  const add = (fen: string) => { const key = positionKey(fen); seen[key] = (seen[key] ?? 0) + 1; };
  if (history.length === 0) add(currentFen);
  else {
    add(history[0].before);
    for (const move of history) add(move.after);
  }
  return seen;
}

/** Captures that win material on a simple count (victim − attacker if the square is defended) and queen promotions, best first. */
export function forcingMoves(position: Chess, limit: number): string[] {
  if (limit <= 0) return [];
  const opponent = position.turn() === "w" ? "b" : "w";
  const scored: { gain: number; uci: string }[] = [];
  for (const move of position.moves({ verbose: true })) {
    let gain = 0;
    if (move.promotion === "q") gain += 8;
    if (move.captured) {
      const defended = position.isAttacked(move.to, opponent);
      gain += PIECE_WORTH[move.captured] - (defended ? PIECE_WORTH[move.piece] : 0);
    } else if (!move.promotion) continue;
    if (move.promotion && move.promotion !== "q") continue;
    if (gain >= 2) scored.push({ gain, uci: `${move.from}${move.to}${move.promotion ?? ""}` });
  }
  scored.sort((a, b) => b.gain - a.gain);
  return scored.slice(0, limit).map((entry) => entry.uci);
}

export const DEFAULT_PLAN: PlanOptions = { candidates: 3, replies: 2, priorWeight: 0.25, temperature: 0 };

/**
 * Wider first, deeper later. Measured with flybrain/search_lab.py (60 games per shape against the
 * same opponent): instinct 677 Elo, [3,2] 729, [4,3] 801, [6,4] 833, while [4,3,2] stayed at 801 for
 * 2.4x the evaluations. With a young value head, missing a candidate or a refutation costs more
 * than not seeing a third half-move. Evaluations are cached, so a stage only pays for new positions.
 */
export const THINKING_STAGES: readonly Widths[] = [[3, 2], [4, 3], [6, 4], [8, 5], [8, 5, 2], [10, 6, 2], [10, 6, 3, 2]];
/** Share of a node's own (static) judgement kept when backing up the search below it. */
export const STATIC_SHARE = 0.3;

export interface PlannedCandidate {
  uci: string;
  san: string;
  /** Policy probability among legal moves. */
  prior: number;
  /** Expected value for the side to move after thinking, in [-1, 1]. */
  value: number;
  score: number;
  expectedReply: string | null;
  /** The imagined continuation in SAN, starting with this move. */
  line: string[];
}

export interface FlyDecision {
  move: string;
  candidates: PlannedCandidate[];
  /** Root value heads (side to move perspective). */
  value: [number, number, number];
  /** Share of unmasked policy probability that falls on legal moves: how well the brain knows the rules. */
  legalMass: number;
  /** Whether the raw, unmasked top choice was a legal move. */
  rawChoiceLegal: boolean;
  evaluations: number;
  groups: number[];
  /** Half-moves of lookahead in the last completed stage (0 = pure instinct). */
  depth: number;
  /** Completed thinking stages. */
  stages: number;
  /** The imagined main line in SAN, starting with the chosen move. */
  line: string[];
}

interface RankedMove { index: number; uci: string; prior: number; logit: number }

export function rankLegalMoves(output: BrainOutput, board: EncodedBoard): { ranked: RankedMove[]; legalMass: number; rawChoiceLegal: boolean } {
  let max = -Infinity;
  let rawBest = 0;
  for (let i = 0; i < MOVE_SPACE; i++) if (output.policy[i] > max) { max = output.policy[i]; rawBest = i; }
  let total = 0;
  let legalTotal = 0;
  for (let i = 0; i < MOVE_SPACE; i++) total += Math.exp(output.policy[i] - max);
  const ranked: RankedMove[] = [];
  for (const [index, uci] of board.legal) {
    const weight = Math.exp(output.policy[index] - max);
    legalTotal += weight;
    ranked.push({ index, uci, prior: weight, logit: output.policy[index] });
  }
  for (const move of ranked) move.prior /= legalTotal || 1;
  ranked.sort((a, b) => b.prior - a.prior);
  return { ranked, legalMass: total ? legalTotal / total : 0, rawChoiceLegal: board.legal.has(rawBest) };
}

/** Value for the side to move in a finished position, or null while the game goes on. */
function terminalValue(position: Chess): number | null {
  if (position.isCheckmate()) return -1;
  if (position.isDraw() || position.isStalemate()) return 0;
  return null;
}

function applyUci(position: Chess, uci: string) {
  return position.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined });
}

interface Imagined {
  board: EncodedBoard;
  output: BrainOutput;
  ranked: RankedMove[];
  legalMass: number;
  rawChoiceLegal: boolean;
}

interface Backed { value: number; line: string[] }

class Timeout extends Error {}

/** One thinking session over a root position. Evaluations are cached by position. */
class Thinker {
  readonly cache = new Map<string, Imagined>();
  evaluations = 0;
  deadline = Infinity;
  private readonly evaluate: Evaluator;
  private readonly now: () => number;
  private readonly seen: Record<string, number> | undefined;
  private readonly forcing: number;

  constructor(evaluate: Evaluator, now: () => number, seen: Record<string, number> | undefined, forcing: number) {
    this.evaluate = evaluate;
    this.now = now;
    this.seen = seen;
    this.forcing = forcing;
  }

  /** Instinct's top moves plus the forcing moves it did not propose (with a floored prior). */
  private shortlist(position: Chess, here: Imagined, width: number): RankedMove[] {
    const picked = here.ranked.slice(0, Math.max(1, width));
    if (this.forcing <= 0) return picked;
    const floor = PRIOR_FLOOR * (here.ranked[0]?.prior ?? 1);
    for (const uci of forcingMoves(position, this.forcing)) {
      if (picked.some((move) => move.uci === uci)) continue;
      const known = here.ranked.find((move) => move.uci === uci);
      if (known) picked.push({ ...known, prior: Math.max(known.prior, floor) });
    }
    return picked;
  }

  async imagine(position: Chess): Promise<Imagined> {
    // The move number does not reach the brain; everything else in the FEN does.
    const key = position.fen().split(" ").slice(0, 5).join(" ");
    const known = this.cache.get(key);
    if (known) return known;
    if (this.now() > this.deadline) throw new Timeout();
    const board = encodeBoard(position);
    const output = await this.evaluate(board);
    this.evaluations++;
    const imagined = { board, output, ...rankLegalMoves(output, board) };
    this.cache.set(key, imagined);
    return imagined;
  }

  /** Negamax over the policy-pruned tree; value for the side to move in `position`. */
  async value(position: Chess, widths: Widths, level: number): Promise<Backed> {
    const finished = terminalValue(position);
    if (finished !== null) return { value: finished, line: [] };
    // Memory: a position this game has already seen is a draw, as chess engines score it.
    if (this.seen && (this.seen[positionKey(position.fen())] ?? 0) >= 1) return { value: 0, line: [] };
    const here = await this.imagine(position);
    const own = combinedValue(here.output.value);
    if (level >= widths.length) return { value: own, line: [] };
    let best = -Infinity;
    let line: string[] = [];
    for (const move of this.shortlist(position, here, widths[level])) {
      const child = new Chess(position.fen());
      const played = applyUci(child, move.uci);
      const below = await this.value(child, widths, level + 1);
      if (-below.value > best) { best = -below.value; line = [played.san, ...below.line]; }
    }
    if (!Number.isFinite(best)) return { value: own, line: [] };
    return { value: STATIC_SHARE * own + (1 - STATIC_SHARE) * best, line };
  }

  async decide(chess: Chess, widths: Widths, priorWeight: number, stages: number): Promise<FlyDecision> {
    const root = await this.imagine(chess);
    const instinctOnly = widths.length <= 1 && (widths[0] ?? 1) <= 1;
    const shortlist = instinctOnly ? root.ranked.slice(0, 1) : this.shortlist(chess, root, widths[0] ?? 1);
    const bestPrior = Math.max(...shortlist.map((move) => move.prior)) || 1e-9;
    const candidates: PlannedCandidate[] = [];
    for (const move of shortlist) {
      const child = new Chess(chess.fen());
      const played = applyUci(child, move.uci);
      let value: number;
      let line: string[] = [played.san];
      let expectedReply: string | null = null;
      if (instinctOnly) {
        // Pure instinct: no imagined positions, the reply head names the expected answer.
        value = terminalValue(child) === null ? combinedValue(root.output.value) : -terminalValue(child)!;
        let replyIndex = 0;
        for (let i = 1; i < MOVE_SPACE; i++) if (root.output.reply[i] > root.output.reply[replyIndex]) replyIndex = i;
        // The reply head is trained in the frame of the side to move now.
        const { from, to } = decodeMoveIndex(replyIndex, root.board.flip);
        expectedReply = `${from}${to}`;
      } else {
        const below = await this.value(child, widths, 1);
        value = -below.value;
        line = [played.san, ...below.line];
        if (below.line.length) {
          const reply = new Chess(child.fen()).move(below.line[0]);
          expectedReply = `${reply.from}${reply.to}${reply.promotion ?? ""}`;
        } else if (terminalValue(child) === null) {
          expectedReply = (await this.imagine(child)).ranked[0]?.uci ?? null;
        }
      }
      const score = value + priorWeight * Math.log(Math.max(move.prior, 1e-9) / bestPrior);
      candidates.push({ uci: move.uci, san: played.san, prior: move.prior, value, score, expectedReply, line });
    }
    candidates.sort((a, b) => b.score - a.score);
    const value = root.output.value;
    return {
      move: candidates[0].uci, candidates, value: [value[0], value[1], value[2]], legalMass: root.legalMass, rawChoiceLegal: root.rawChoiceLegal,
      evaluations: this.evaluations, groups: Array.from(root.output.groups), depth: instinctOnly ? 0 : widths.length,
      stages, line: candidates[0].line,
    };
  }
}

function pick(decision: FlyDecision, options: PlanOptions): FlyDecision {
  if (!(options.temperature > 0) || decision.candidates.length < 2) return decision;
  const random = options.random ?? Math.random;
  const top = decision.candidates[0].score;
  const weights = decision.candidates.map((c) => Math.exp((c.score - top) / options.temperature));
  let roll = random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return { ...decision, move: decision.candidates[i].uci, line: decision.candidates[i].line };
  }
  return decision;
}

/**
 * Choose a move. Without `budgetMs` a single stage [candidates, replies] is searched;
 * with it the brain keeps thinking through `stages` until the time is used up.
 */
export async function plan(chess: Chess, evaluate: Evaluator, options: PlanOptions = DEFAULT_PLAN): Promise<FlyDecision> {
  if (chess.moves().length === 0) throw new Error("No legal moves to plan.");
  const now = options.now ?? (() => performance.now());
  const thinker = new Thinker(evaluate, now, options.seen, options.forcing ?? 2);
  const single: Widths = options.candidates <= 1 ? [1] : options.replies > 0 ? [options.candidates, options.replies] : [options.candidates];
  const stages = options.budgetMs === undefined ? [single] : options.stages ?? THINKING_STAGES;
  const started = now();
  let decision: FlyDecision | null = null;
  for (let index = 0; index < stages.length; index++) {
    // The first stage always completes; later ones are abandoned when the budget runs out.
    thinker.deadline = index === 0 || options.budgetMs === undefined ? Infinity : started + options.budgetMs;
    if (index > 0 && now() >= thinker.deadline) break;
    try {
      decision = await thinker.decide(chess, stages[index], options.priorWeight, index + 1);
      options.onStage?.({ ...decision, evaluations: thinker.evaluations });
    } catch (error) {
      if (error instanceof Timeout) break;
      throw error;
    }
    if (chess.moves().length === 1) break; // nothing to choose between
  }
  if (!decision) throw new Error("The brain produced no decision.");
  return pick({ ...decision, evaluations: thinker.evaluations }, options);
}

/** tanh value → centipawns on the scale used in training (tanh(cp / 600)). */
export function valueToCentipawns(value: number): number {
  const clamped = Math.max(-0.999, Math.min(0.999, value));
  return Math.round(600 * Math.atanh(clamped));
}
