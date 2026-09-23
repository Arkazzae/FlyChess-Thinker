/** DROSO-1 PUCT: all legal actions, current CP value, solved mates, bounded visits.
 * Mirrors training/core/puct.py and training/droso1/player.py.
 */
import { Chess } from "chess.js";
import type { BrainOutput } from "./brain.ts";
import { encodeBoard, MOVE_SPACE, type EncodedBoard } from "./encoding.ts";

export type Evaluator = (board: EncodedBoard) => BrainOutput | Promise<BrainOutput>;
export interface PlanOptions {
  simulations: number;
  cPuct: number;
  temperature: number;
  budgetMs?: number;
  random?: () => number;
  onStage?: (decision: FlyDecision) => void;
  now?: () => number;
  seen?: Record<string, number>;
  halfmoveKnown?: boolean;
}
export const DEFAULT_PLAN: PlanOptions = { simulations: 64, cPuct: 1.5, temperature: 0 };
export interface PlannedCandidate {
  uci: string; san: string; prior: number; value: number; score: number;
  visits: number; expectedReply: string | null; line: string[];
}
export interface FlyDecision {
  move: string; candidates: PlannedCandidate[]; value: [number, number, number];
  legalMass: number; rawChoiceLegal: boolean; evaluations: number; groups: number[];
  depth: number; simulations: number; line: string[];
}
export function positionKey(fen: string): string {
  return new Chess(fen).fen().split(" ").slice(0, 4).join(" ");
}
export function seenPositions(history: readonly { before: string; after: string }[], currentFen: string): Record<string, number> {
  const seen: Record<string, number> = {};
  const add = (fen: string) => { const key = positionKey(fen); seen[key] = (seen[key] ?? 0) + 1; };
  if (!history.length) add(currentFen);
  else { add(history[0].before); for (const move of history) add(move.after); }
  return seen;
}
export function rankLegalMoves(output: BrainOutput, board: EncodedBoard) {
  let max = -Infinity, rawBest = 0, legalMax = -Infinity;
  for (let i = 0; i < MOVE_SPACE; i++) if (output.policy[i] > max) { max = output.policy[i]; rawBest = i; }
  for (const index of board.legal.keys()) legalMax = Math.max(legalMax, output.policy[index]);
  let total = 0, legalMass = 0, legalTotal = 0;
  for (let i = 0; i < MOVE_SPACE; i++) total += Math.exp(output.policy[i] - max);
  const ranked = [...board.legal].map(([index, uci]) => {
    const prior = Math.exp(output.policy[index] - legalMax);
    legalTotal += prior;
    legalMass += Math.exp(output.policy[index] - max);
    return { index, uci, prior, logit: output.policy[index] };
  });
  for (const move of ranked) move.prior /= legalTotal || 1;
  ranked.sort((a,b) => b.prior - a.prior);
  return { ranked, legalMass: total ? legalMass / total : 0, rawChoiceLegal: board.legal.has(rawBest) };
}
function apply(board: Chess, uci: string) {
  return board.move({ from: uci.slice(0,2), to: uci.slice(2,4), promotion: uci[4] });
}
interface Node {
  board: Chess; seen: Record<string,number>; halfmoveKnown: boolean;
  uci: string; san: string; prior: number; children: Node[] | null;
  visits: number; total: number; initial: number; proof: number | null; distance: number;
}
function node(board: Chess, seen: Record<string,number>, halfmoveKnown: boolean): Node {
  return { board, seen, halfmoveKnown, uci: "", san: "", prior: 1, children: null, visits: 0, total: 0, initial: 0, proof: null, distance: 0 };
}
function terminal(n: Node): number | null {
  const b = n.board;
  if (b.isCheckmate()) return -1;
  if (b.isStalemate() || b.isInsufficientMaterial()) return 0;
  const clock = Number(b.fen().split(" ")[4]);
  if (n.seen[positionKey(b.fen())] >= 3 || (n.halfmoveKnown && clock >= 100)) return 0;
  // python-chess can_claim_draw also accepts a claim with the intended next move.
  if ((n.halfmoveKnown && clock >= 99) || Object.values(n.seen).some(count => count >= 2)) {
    for (const move of b.moves({ verbose: true })) {
      b.move(move);
      const claim = (n.seen[positionKey(b.fen())] ?? 0) >= 2 ||
        (n.halfmoveKnown && Number(b.fen().split(" ")[4]) >= 100 && !b.isCheckmate());
      b.undo();
      if (claim) return 0;
    }
  }
  return null;
}
function solve(n: Node) {
  if (!n.children?.length) return;
  const wins = n.children.filter(c => c.proof === -1);
  if (wins.length) { n.proof = 1; n.distance = 1 + Math.min(...wins.map(c=>c.distance)); }
  else if (n.children.every(c=>c.proof !== null)) {
    n.proof = -Math.min(...n.children.map(c=>c.proof!));
    n.distance = 1 + Math.max(...n.children.map(c=>c.distance));
  }
}
function backup(path: Node[], value: number) {
  for (let i=path.length-1;i>=0;i--) {
    const n=path[i]; solve(n);
    if (n.proof !== null) value=n.proof;
    n.visits++; n.total+=value; value=-value;
  }
}
function eligible(n: Node): Node[] {
  const all=n.children ?? [];
  const wins=all.filter(c=>c.proof===-1);
  if (wins.length) { const distance=Math.min(...wins.map(c=>c.distance)); return wins.filter(c=>c.distance===distance); }
  const safe=all.filter(c=>c.proof!==1);
  return safe.length ? safe : all;
}
function best(n: Node): Node | undefined { return eligible(n).sort((a,b)=>b.visits-a.visits || b.prior-a.prior)[0]; }
function line(n: Node): string[] {
  const result: string[]=[];
  let c: Node | undefined=n;
  while(c && result.length<32) { if(c.san) result.push(c.san); c=best(c); }
  return result;
}
export async function plan(position: Chess, evaluate: Evaluator, options: Partial<PlanOptions> = {}): Promise<FlyDecision> {
  const opts={...DEFAULT_PLAN,...options};
  if (!Number.isInteger(opts.simulations) || opts.simulations<1 || opts.cPuct<=0) throw new Error("Invalid PUCT budget.");
  const now=opts.now ?? (()=>performance.now()), started=now();
  const seen=opts.seen ? {...opts.seen} : seenPositions(position.history({verbose:true}),position.fen());
  const key=positionKey(position.fen()); seen[key]=Math.max(1,seen[key] ?? 0);
  const root=node(new Chess(position.fen()),seen,opts.halfmoveKnown ?? true);
  if (terminal(root)!==null) throw new Error("Cannot choose a move in a terminal position.");
  let evaluations=0, depth=0;
  let rootOutput: BrainOutput;
  let stats: ReturnType<typeof rankLegalMoves>;
  async function expand(n: Node) {
    const encoded=encodeBoard(n.board,n.halfmoveKnown), output=await evaluate(encoded);
    evaluations++;
    const ranked=rankLegalMoves(output,encoded);
    if(n===root) { rootOutput=output; stats=ranked; }
    n.initial=Math.max(-.999,Math.min(.999,output.value[0]));
    n.children=ranked.ranked.map(move=> {
      const board=new Chess(n.board.fen()), played=apply(board,move.uci);
      const counts={...n.seen}, k=positionKey(board.fen()); counts[k]=(counts[k] ?? 0)+1;
      const child=node(board,counts,n.halfmoveKnown || played.piece==="p" || !!played.captured);
      Object.assign(child,{uci:move.uci,san:played.san,prior:move.prior,proof:board.isCheckmate() ? -1 : null});
      return child;
    });
    solve(n);
  }
  function decision(chosen=best(root)!): FlyDecision {
    const candidates=(root.children ?? []).map(c=> {
      const pv=line(c), value=c.proof!==null ? -c.proof : c.visits ? -c.total/c.visits : root.initial;
      return { uci:c.uci,san:c.san,prior:c.prior,value,score:value,visits:c.visits,expectedReply:pv[1] ?? null,line:pv };
    }).sort((a,b)=>Number(b.uci===chosen.uci)-Number(a.uci===chosen.uci) || b.visits-a.visits || b.prior-a.prior);
    return {move:chosen.uci,candidates,value:[rootOutput.value[0],0,0],legalMass:stats.legalMass,
      rawChoiceLegal:stats.rawChoiceLegal,evaluations,groups:Array.from(rootOutput.groups),depth,simulations:root.visits,line:line(chosen)};
  }
  await expand(root); backup([root],root.initial);
  for(let i=1;i<opts.simulations && root.proof===null;i++) {
    if(opts.budgetMs!==undefined && now()-started>=opts.budgetMs) break;
    let n=root; const path=[root];
    while(n.children!==null && n.proof===null) {
      let candidates=n.children.filter(c=>c.proof!==1); if(!candidates.length) candidates=n.children;
      const visited=n.children.reduce((s,c)=>s+(c.visits ? c.prior : 0),0);
      const fpu=Math.max(-.999,n.initial-.25*Math.sqrt(visited)), scale=Math.sqrt(Math.max(1,n.visits));
      const score=(c:Node)=>(c.proof!==null ? -c.proof : c.visits ? -c.total/c.visits : fpu)+opts.cPuct*c.prior*scale/(1+c.visits);
      n=candidates.reduce((a,b)=>score(b)>score(a) ? b : a); path.push(n);
    }
    depth=Math.max(depth,path.length-1);
    if(n.proof===null) n.proof=terminal(n);
    if(n.proof===null) await expand(n);
    backup(path,n.proof ?? n.initial);
    if(root.visits%8===0) opts.onStage?.(decision());
  }
  let chosen=best(root)!;
  const candidates=eligible(root);
  if(opts.temperature>0 && candidates.length>1) {
    const visits=candidates.some(c=>c.visits);
    const logs=candidates.map(c=>Math.log(Math.max(visits ? c.visits : c.prior,1e-30))/opts.temperature);
    const max=Math.max(...logs), weights=logs.map(x=>Math.exp(x-max));
    let threshold=(opts.random ?? Math.random)()*weights.reduce((a,b)=>a+b,0);
    for(let i=0;i<candidates.length;i++) { threshold-=weights[i]; if(threshold<=0) {chosen=candidates[i]; break;} }
  }
  return decision(chosen);
}
/** Inverse of the tanh(cp / 600) training target, bounded for display. */
export function valueToCentipawns(value: number): number {
  return Math.round(600 * Math.atanh(Math.max(-.999,Math.min(.999,value))));
}
