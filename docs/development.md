# Development

Requires Node.js 23.6+ (the media and avatar scripts import TypeScript directly) and pnpm 10+.

```bash
pnpm install
pnpm dev          # http://localhost:5180
pnpm check        # unit tests + typecheck + production build
```

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
| `public/data/` | Connectome and trained weights |
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

`docs/media/` is recorded from a real session: a game against the Thinker,
the brain view, and a game review. To regenerate it:

```bash
CHROMIUM_PATH=/usr/bin/chromium pnpm media   # needs ffmpeg
```

The GIFs are 800 px wide, 12 fps and a few MB each, so GitHub shows them
quickly.

## Mascot

The fly is drawn in `src/components/flySvg.ts`. The React avatar and
`public/avatars/fly.svg` both come from it. After editing, run:

```bash
pnpm avatar
```
