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

There is no backend. The brain (about 31 MB) is served from `public/data/`,
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
| `public/data/` | Connectome and trained weights (`flybrain/` is fly-v6, `flybrain-v4/` the older fly-v4, loaded on demand) |
| `scripts/` | Browser tests, README media, the mascot SVG export |
| `artifacts/` | Exported fly-v6 and fly-v4 brains with notes |

## Updating the model

The browser weights are exported from a PyTorch checkpoint by the trainer's
`export_weights.py`. It writes three files:

- `public/data/flybrain/weights.bin.gz` and `model.json`;
- `src/ai/fly/fixtures/parity.json`: reference outputs on fixed positions.

Then run:

```bash
npx vitest run src/ai/fly/parity.test.ts
```

This test is the gate. It checks that TypeScript inference reproduces the
trainer's numbers with the new weights. Any checkpoint with the same
architecture (as fly-v4 through fly-v6 have) drops in without code changes.

## README media

The gameplay, brain view and game review in `docs/media/` are recorded from
a real session. To regenerate these recordings:

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

The six opponent portraits are generated 2D illustrations in
`public/avatars/flies/`, selected by `src/ai/bots/avatars.ts`. `FlyMascot`
uses them in the preloader, picker, player bar, chat and game result. Full-resolution
PNGs and the exact imagegen prompts live in `output/imagegen/fly-avatars/`.
Character identifiers and asset filenames use English: `reflex`, `planner`,
`thinker`, `rookie`, `scribe` and `elder`. Older saved selections are migrated
when browser settings load.

The legacy plain animated mascot used by the favicon and README media is drawn
in `src/components/flySvg.ts`. It also supplies `public/avatars/fly.svg`.
After editing that SVG source, run:

```bash
pnpm avatar
```
