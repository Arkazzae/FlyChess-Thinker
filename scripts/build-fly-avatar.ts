/**
 * Writes public/avatars/fly.svg (favicon and anywhere a plain image is needed) from the same
 * source as the in-app FlyMascot, with its animation styles embedded.
 *
 *   node scripts/build-fly-avatar.ts
 */
import { writeFileSync } from "node:fs";
import { flySvg } from "../src/components/flySvg.ts";

const target = new URL("../public/avatars/fly.svg", import.meta.url);
writeFileSync(target, flySvg("fly", { style: true, title: "Fruit fly" }) + "\n");
console.log("public/avatars/fly.svg");
