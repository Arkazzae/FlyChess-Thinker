import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import type { BrainOutput } from "./brain";
import { encodeBoard, MOVE_SPACE, SQUARE_FEATURES, type EncodedBoard } from "./encoding";
import { plan, rankLegalMoves, seenPositions } from "./planner";

function output(board: EncodedBoard, favorite = "e2e4", value = 0): BrainOutput {
  const policy=new Float32Array(MOVE_SPACE).fill(-20);
  for(const [i,uci] of board.legal) policy[i]=uci===favorite ? 2 : 0;
  return {policy,reply:new Float32Array(MOVE_SPACE),value:Float32Array.of(value,.99,-.99),groups:new Float32Array(6)};
}
describe("DROSO-1 PUCT",()=> {
  it("uses all legal moves, a stable legal softmax, and a bounded visit count",async()=> {
    let calls=0;
    const decision=await plan(new Chess(),board=>{calls++;return output(board);},{simulations:8});
    expect(decision.simulations).toBe(8);
    expect(decision.evaluations).toBe(calls);
    expect(calls).toBeLessThanOrEqual(8);
    expect(decision.candidates).toHaveLength(20);
    expect(decision.candidates.reduce((s,c)=>s+c.visits,0)).toBe(7);
    expect(new Chess().moves({verbose:true}).map(m=>m.from+m.to)).toContain(decision.move);
    const board=encodeBoard(new Chess()), out=output(board); out.policy.fill(1000);
    for(const index of board.legal.keys())out.policy[index]=-1000;
    const ranked=rankLegalMoves(out,board);
    expect(ranked.ranked.reduce((s,c)=>s+c.prior,0)).toBeCloseTo(1);
  });
  it("ignores unsupervised auxiliary heads",async()=> {
    const board=new Chess();
    const a=await plan(board,b=>output(b),{simulations:8});
    const c=await plan(board,b=>{const o=output(b);o.value[1]=-1;o.value[2]=1;return o;},{simulations:8});
    expect(c).toEqual(a);
  });
  it("plays a proved mate even when its prior is tiny",async()=> {
    const chess=new Chess("7k/5Q2/6K1/8/8/8/8/8 w - - 0 1");
    const d=await plan(chess,b=>output(b,"f7f1"),{simulations:1});
    chess.move({from:d.move.slice(0,2),to:d.move.slice(2,4)});
    expect(chess.isCheckmate()).toBe(true);
  });
  it("keeps all four promotions and chooses a winning rook over stalemating queen",async()=> {
    const chess=new Chess("8/1P6/8/8/8/8/5K2/7k w - - 0 1");
    const d=await plan(chess,b=>{
      const o=output(b,"b7b8r",-.8);
      // Queen's leading prior loses to exact stalemate and rook's winning evaluation.
      for(const [i,u] of b.legal)if(u==="b7b8q")o.policy[i]=2.1;
      return o;
    },{simulations:32});
    expect(d.candidates.filter(c=>c.uci.startsWith("b7b8"))).toHaveLength(4);
    expect(d.move).toBe("b7b8r");
  });
  it("treats twofold as playable and a threefold claim as terminal",async()=> {
    const chess=new Chess();
    for(const san of ["Nf3","Nf6","Ng1","Ng8"])chess.move(san);
    const seen=seenPositions(chess.history({verbose:true}),chess.fen());
    await expect(plan(chess,b=>output(b),{simulations:1,seen})).resolves.toHaveProperty("move");
    for(const san of ["Nf3","Nf6","Ng1","Ng8"])chess.move(san);
    await expect(plan(chess,b=>output(b),{simulations:1,seen:seenPositions(chess.history({verbose:true}),chess.fen())})).rejects.toThrow("terminal");
  });
  it("respects fifty-move claims, but mate takes precedence",async()=> {
    for(const fen of ["8/8/8/8/8/3k4/8/K6R w - - 100 70","7k/6Q1/6K1/8/8/8/8/8 b - - 100 70"])
      await expect(plan(new Chess(fen),b=>output(b))).rejects.toThrow("terminal");
  });
  it("finishes the root even when the deadline expires",async()=> {
    let time=0;
    const d=await plan(new Chess(),b=>{time+=10;return output(b);},{simulations:64,budgetMs:5,now:()=>time});
    expect(d.simulations).toBe(1);
    expect(d.move).toBe("e2e4");
  });
  it("carries unknown clocks until a pawn move or capture",async()=> {
    const flags: number[]=[];
    await plan(new Chess(),b=>{
      flags.push(b.globals[20]);
      expect(b.globals[21]).toBe(0);
      expect(b.squares).toHaveLength(64*SQUARE_FEATURES);
      return output(b);
    },{simulations:2,halfmoveKnown:false});
    expect(flags).toEqual([0,1]);
  });
});
