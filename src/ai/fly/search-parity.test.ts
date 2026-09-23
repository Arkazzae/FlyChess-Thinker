/** The shipped browser player must keep the release's fixed PUCT-64 moves. */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { expect, it } from "vitest";
import { Chess } from "chess.js";
import { FlyBrain } from "./brain";
import { Connectome } from "./connectome";
import { FlyWeights } from "./weights";
import { plan } from "./planner";
const file=(path:string)=>new URL(`../../../${path}`,import.meta.url);
function binary(path:string):ArrayBuffer {
  const bytes=gunzipSync(readFileSync(file(path)));
  return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;
}
it("reproduces the released Python PUCT-64 moves, including EP, promotions and unknown clocks",async()=> {
  const brain=new FlyBrain(new Connectome(binary("public/data/flywire/connectome.bin.gz")),new FlyWeights(binary("public/data/droso-1/weights.bin.gz")));
  const {fixtures}=JSON.parse(readFileSync(file("artifacts/droso-1/parity.json"),"utf8"));
  for(const row of fixtures) {
    const decision=await plan(new Chess(row.fen),board=>brain.evaluate(board),{simulations:64,halfmoveKnown:row.halfmove_known});
    expect(decision.move,row.fen).toBe(row.move);
    expect(decision.evaluations).toBeLessThanOrEqual(64);
  }
},120_000);
