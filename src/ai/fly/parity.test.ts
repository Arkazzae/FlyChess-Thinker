/**
 * End-to-end numerical parity with the PyTorch trainer: the bundled connectome
 * and the exported weights must reproduce the logits and values that
 * flybrain/export_weights.py computed for the fixture positions.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { FlyBrain } from "./brain";
import { Connectome } from "./connectome";
import { encodeBoard } from "./encoding";
import { rankLegalMoves } from "./planner";
import { FlyWeights } from "./weights";

const file = (path: string) => new URL(`../../../${path}`, import.meta.url);
/** Every model the app can play: the current fly-v6 and the older fly-v4. */
const MODELS = [
  { label: "fly-v6", dir: "flybrain", fixture: "parity.json" },
  { label: "fly-v4", dir: "flybrain-v4", fixture: "parity-v4.json" },
];

function inflate(url: URL): ArrayBuffer {
  const bytes = gunzipSync(readFileSync(url));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
const sha256 = (buffer: ArrayBuffer) => createHash("sha256").update(new Uint8Array(buffer)).digest("hex");

interface FixturePosition {
  fen: string;
  flip: boolean;
  squares: number[];
  globals: number[];
  topMoves: number[];
  topLogits: number[];
  legalMass: number;
  reply: number;
  value: number[];
}

describe.each(MODELS)("fly brain parity with the trainer: $label", ({ dir, fixture: fixtureName }) => {
  const paths = {
    connectome: file("public/data/mcns/connectome.bin.gz"),
    manifest: file("public/data/mcns/manifest.json"),
    weights: file(`public/data/${dir}/weights.bin.gz`),
    model: file(`public/data/${dir}/model.json`),
    fixture: new URL(`./fixtures/${fixtureName}`, import.meta.url),
  };
  const available = Object.values(paths).every((url) => existsSync(url));
  it.skipIf(!available)("bundled files match their manifests and the trainer's numbers", () => {
    const manifest = JSON.parse(readFileSync(paths.manifest, "utf8"));
    const model = JSON.parse(readFileSync(paths.model, "utf8"));
    const fixture: { weights: string; positions: FixturePosition[] } = JSON.parse(readFileSync(paths.fixture, "utf8"));
    const graphBuffer = inflate(paths.connectome);
    const weightsBuffer = inflate(paths.weights);
    expect(sha256(graphBuffer)).toBe(manifest.sha256);
    expect(sha256(weightsBuffer)).toBe(model.sha256);
    expect(model.connectome).toBe(manifest.sha256);
    expect(fixture.weights).toBe(model.sha256);

    const graph = new Connectome(graphBuffer);
    expect(graph.count).toBe(163903);
    expect(graph.edges).toBe(6235682);
    const weights = new FlyWeights(weightsBuffer);
    expect(weights.steps).toBe(model.steps);
    expect(weights.visIndex.length).toBe(23720);
    const brain = new FlyBrain(graph, weights);

    for (const position of fixture.positions) {
      const board = encodeBoard(new Chess(position.fen));
      // The Python and TypeScript encoders must agree bit for bit (pieces, attack maps, rights).
      expect(board.flip, position.fen).toBe(position.flip);
      expect(Array.from(board.squares), position.fen).toEqual(position.squares);
      for (let i = 0; i < position.globals.length; i++) expect(board.globals[i]).toBeCloseTo(position.globals[i], 5);

      const output = brain.evaluate(board);
      expect(Array.from(output.policy).every(Number.isFinite)).toBe(true);
      const ranked = rankLegalMoves(output, board);
      // Same best move; logits and values within float32 accumulation noise.
      expect(ranked.ranked[0].index, position.fen).toBe(position.topMoves[0]);
      for (let k = 0; k < position.topMoves.length; k++) {
        expect(output.policy[position.topMoves[k]], `${position.fen} move ${k}`).toBeCloseTo(position.topLogits[k], 2);
      }
      for (let k = 0; k < 3; k++) expect(output.value[k]).toBeCloseTo(position.value[k], 3);
      expect(ranked.legalMass).toBeCloseTo(position.legalMass, 2);
      let replyBest = 0;
      for (let i = 1; i < output.reply.length; i++) if (output.reply[i] > output.reply[replyBest]) replyBest = i;
      expect(replyBest).toBe(position.reply);
    }
  }, 120_000);
});
