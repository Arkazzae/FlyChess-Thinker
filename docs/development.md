# Development

To play, use the hosted version at https://fly-chess-thinker.vercel.app/.
This page is for running and changing the code.

## Run locally

Use Node.js 24.12+ and pnpm 10.14.0 (pinned in `package.json`). The locked
dependencies also support Node.js 22.20+ on the 22.x line; Node.js 23 is outside
Vitest's supported range. The scripts run JavaScript in Node and load the
application's TypeScript through Vite in the browser.

```bash
pnpm install --frozen-lockfile
pnpm dev          # http://localhost:5180
pnpm check        # unit tests + typecheck + production build
```

There is no backend. The brain (about 51 MB) is served from `public/data/`,
checked against SHA-256 and run in a Web Worker: on the GPU (WebGPU) when there
is a usable adapter, otherwise on the CPU. Serve the app over HTTPS or
localhost: model verification uses
[`crypto.subtle`](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/subtle),
and [WebGPU](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/gpu) also
requires a secure context. Opening `index.html` directly is not supported.

## Deploy

The app is static. Vite builds it into `dist/`. The hosted copy runs on Vercel:

```bash
vercel deploy --prod
```

`vercel.json` lets browsers keep `/data/**` for a year. The app always
revalidates those files before use and checks them against SHA-256, so a
replaced model reaches players on their next visit.

## Browser tests

Two Playwright scripts drive a real Chromium and start their own servers
(`test:fly:browser` on port 5297, `test:preview` on 4173). Build the current
production bundle before `test:preview`; that script serves the existing
`dist/` and does not rebuild it. With a system Chromium on Linux:

```bash
pnpm build
CHROMIUM_PATH=/usr/bin/chromium pnpm test:fly:browser
CHROMIUM_PATH=/usr/bin/chromium pnpm test:preview
```

Alternatively, install Playwright's Chromium with
`pnpm exec playwright install chromium` and omit `CHROMIUM_PATH`.

**`test:fly:browser`** loads the brain through the preloader and checks:

- the EN/PL switch;
- a full move against the fly;
- the recorded propagation: 11 frames, activity spreading, group flows;
- the hint and takeback;
- the brain views render;
- post-game review and replay, all three search budgets, and draw claims;
- WebGPU agrees with the CPU on the full connectome within numeric tolerances,
  when a usable hardware adapter is available. The report marks this check as
  skipped if WebGPU cannot start.

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
| `scripts/` | Browser tests and README media capture |
| `artifacts/` | Standalone DROSO-1 Python bundle; legacy fly-v6/fly-v4 exports and MaleCNS in `legacy/` |
| `training/` | DROSO-1 data preparation, training, evaluation and export pipeline |
| `benchmarks/droso-1/` | Published model results, evaluation positions, JSON and PGN |

## Updating the model

Follow the [training and export recipe](droso-1/recipe.md). From the repository
root, with the Python dependencies installed and the virtual environment
active, export a verified standalone bundle to the browser:

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
FP32. Browser manifest hashes cover the decompressed binary payloads; the
standalone bundle's manifest hashes cover the files as stored. The parity
test fails if required assets are missing. Changes to model
architecture also require matching TypeScript encoder, loader and inference.

## README media

The gameplay and brain renders in `docs/media/` come from a real session. To regenerate these recordings:

```bash
CHROMIUM_PATH=/usr/bin/chromium pnpm media   # needs ffmpeg
```

Both GIFs are 800 × 450 (16:9) at 12 fps and a few MB each, so GitHub shows
them quickly and at the same size.

The media script records only the application views; it does not touch the
illustrated README banner, `docs/media/banner-illustrated.png`.

## Mascot

The three portraits in `public/avatars/flies/` are `scout`, `tactician`
and `thinker`. They share the same DROSO-1 checkpoint. Old saved selections
migrate to the corresponding new style.

The favicon uses the same character and illustration style. The app ships
optimised assets only. Old portraits and the obsolete SVG mascot are removed.
