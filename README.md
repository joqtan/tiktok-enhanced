# TikTok Enhanced

TikTok Enhanced is a modular TypeScript project for improving the TikTok live
stream experience. The repository is designed to host multiple independent
features rather than a single userscript implementation.

## Current modules

### Autolike

The `autolike` module contains reusable logic for automated likes on TikTok live
streams, including retries, statistics, and three humanized speed profiles:
`Calm`, `Natural`, and `Active`. Each profile combines randomized delays, pauses,
and occasional multi-taps. The module intentionally excludes UI, userscript
metadata, page bootstrap, and other runtime-specific concerns.

The Tampermonkey adapter lives separately at `src/userscript/index.ts`. It
provides DOM and timer adapters, starts the engine on TikTok live pages, and
mounts the draggable floating module widget.

The widget currently provides the Autolike module with pause/resume, mode
selection, live counters, an expandable settings area, and TikTok-inspired
cyan/pink accents. Its position and active module are persisted in
`localStorage`; drag it to any visible position and reload the page to restore it.

## Development and build

This project uses pnpm exclusively:

```sh
pnpm install
pnpm test
pnpm run build
```

The build preserves the TypeScript check and emits exactly:

```text
dist/tiktok-enhanced.user.js
```

`dist/` is ignored by Git. During development, run `pnpm run build` after
changes, then install or update the generated file in Tampermonkey:

1. Open Tampermonkey and choose **Create a new script**.
2. Replace the editor contents with `dist/tiktok-enhanced.user.js`.
3. Save the script and enable it.
4. Open a TikTok live page (`https://www.tiktok.com/@creator/live`) to run it.
5. Use the floating Autolike widget to pause/resume, change modes, and open settings.

The userscript uses `@grant none` and does not include the upstream UI or
userscript wholesale.

Tests are located under `tests/` and focus on behavior that can be validated
without a live TikTok page.

## Architecture

Reusable feature logic lives under `src/autolike`. Browser APIs, UI, and runtime
entry points are connected through explicit adapters under feature-specific
integration surfaces.

## Licensing

Original code in this repository is distributed under the Zero-Clause BSD (0BSD)
license; see [`LICENSE`](./LICENSE).

The autolike logic is derived and adapted from
[AmpedWasTaken/TikTok-Live-Liker](https://github.com/AmpedWasTaken/TikTok-Live-Liker)
and remains subject to its MIT attribution and notice requirements. See
[`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).
