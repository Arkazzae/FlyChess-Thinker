# Development

To play, use the hosted version at https://fly-chess-thinker.vercel.app/.
This page is for running and changing the code.

## Run locally

Requires Node.js 23.6+ (the media and avatar scripts import TypeScript directly) and pnpm 10+.

```bash
pnpm install
pnpm dev          # http://localhost:5180
pnpm check        # unit tests + typecheck + production build
```

There is no backend. The brain (about 51 MB) is served from `public/data/`,
checked against SHA-256 and run in a Web Worker: on the GPU (WebGPU) when there
is one, otherwise on the CPU.

## Deploy

The app is static. Vite builds it into `dist/`. The hosted copy runs on Vercel:

```bash
vercel deploy --prod
```

`vercel.json` lets browsers keep `/data/**` for a year. The app always
revalidates those files before use and checks them against SHA-256, so a
replaced model reaches players on their next visit.

## Browser tests

Two Playwright scripts drive a real Chromium. On Linux, point them at a
system browser:

```bash
CHROMIUM_PATH=/usr/bin/chromium pnpm test:fly:browser
CHROMIUM_PATH=/usr/bin/chromium pnpm test:preview
```

**`test:fly:browser`** loads the brain through the preloader and checks:
- the EN/PL switch;
- a full move against the fly;
- the recorded propagation: 11 frames, activity spreading, group flows;
- the hint and takeback;
- the brain views render;
- WebGPU gives the same numbers as the CPU on the full connectome.

**`test:preview`** plays a move against the production bundle and checks for
horizontal scrolling at laptop and phone widths.

Screenshots go to `reports/`.

## Layout

| Path | What |
| --- | --- |
| `src/ai/fly/` | Connectome and weights loaders, board encoding, the brain (CPU), the WebGPU propagator, the planner, the worker |
| `src/brain/` | Brain-view playback clock, recording statistics, the 3D cloud (WebGL), the flow diagram |
| `src/components/` | App shell and preloader (`shell/`), game screen (`play/`), brain views (`brain/`), board (`Board/`), the fly mascot |
| `src/game/session.ts` | Starting, rematching and ending games; PGN export |
| `src/i18n/` | English and Polish strings (English is the default) |
| `public/data/` | FlyWire connectome (`flywire/`) and DROSO-1 browser weights (`droso-1/`) |
| `scripts/` | Browser tests, README media, avatar and favicon processing |
| `artifacts/` | Standalone DROSO-1 Python bundle; legacy fly-v6/fly-v4 exports and MaleCNS in `legacy/` |
| `training/` | DROSO-1 data preparation, training, evaluation and export pipeline |
| `benchmarks/droso-1/` | Published model results, evaluation positions, JSON and PGN |

## Updating the model

Follow the [training and export recipe](droso-1/recipe.md). From the repository
root, export a verified standalone bundle to the browser:

```bash
PYTHONPATH=training python -m droso1.export_browser --bundle artifacts/droso-1
pnpm check
CHROMIUM_PATH=/usr/bin/chromium pnpm test:fly:browser
```

The exporter downloads pinned FlyWire annotations if needed; `--annotations`
accepts a local copy with the same SHA-256. It writes the graph, FP32 weights,
manifests and PyTorch reference fixtures. It preserves the complete action
space, input mapping and original root IDs. Batch normalisation is folded
into scale/shift.

The binary formats are version 2. Graph IDs are uint64; layers and gains are
FP32. The parity test fails if required assets are missing. Changes to model
architecture also require matching TypeScript encoder, loader and inference.

## README media

The gameplay and brain renders in `docs/media/` come from a real session. To regenerate these recordings:

```bash
CHROMIUM_PATH=/usr/bin/chromium pnpm media   # needs ffmpeg
```

Both GIFs are 800 × 450 (16:9) at 12 fps and a few MB each, so GitHub shows
them quickly and at the same size.

The README uses `docs/media/banner-illustrated.png`, generated separately
with imagegen from the original banner and the Thinker avatar. The exact
prompt is saved in `output/imagegen/banner/prompt.md`. The media script's
legacy `banner.png` output is independent of this illustrated banner.

## Mascot

The three generated portraits in `public/avatars/flies/` are `scout`, `tactician`
and `thinker`. They share the same DROSO-1 checkpoint. Old saved selections
migrate to the corresponding new style.

The favicon uses the same character and illustration style. Exact generation
prompts and reference names are saved in [avatar-prompts.json](droso-1/avatar-prompts.json).
Local full-resolution sources live in `output/imagegen/droso-1/`; the app only
ships optimised assets. Old portraits and the obsolete SVG mascot are removed.
