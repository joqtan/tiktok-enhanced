# Shared module contract

TikTok Enhanced keeps the Autolike module split into four explicit layers. The
layers communicate through small TypeScript contracts; no layer discovers or
constructs another layer's platform details.

## Boundaries

1. **Reusable core (`src/autolike`)** — `AutoLikeEngine` owns scheduling,
   cancellation, state transitions, pacing, retries, and statistics. It accepts
   a button finder, click adapter, and `Timer` rather than reading browser APIs.
   The legacy `browser` dependency remains supported for existing integrations,
   but new wiring should provide `clickButton`.
2. **Browser adapters (`src/userscript/index.ts`)** —
   `createBrowserAdapters` translates DOM discovery/click dispatch, window timers,
   and `localStorage` into `AutolikeBrowserAdapters` and `StorageAdapter`.
3. **Module UI (`src/userscript/floating-widget.ts`)** — `FloatingWidget` depends
   on the `AutolikeCore` behavior contract and injected document/window,
   storage, and interval timer. It can control and display a core without
   knowing its implementation.
4. **Runtime route/session lifecycle (`src/userscript/index.ts`)** —
   `createAutolikeRuntime` owns one engine/widget pair per live route. Leaving a
   live route destroys both; entering a live route creates a fresh pair and
   therefore route-scoped statistics.

## Live layout

`src/live-layout` owns transient navigation and chat visibility controls on panel
edges. It does not depend on Autolike, its widget, or its storage. The runtime
creates one layout controller per live session and disposes it when the route
changes or the session is destroyed. Its scoped styles and controls are removed
without replacing site panels; panel visibility starts fresh on the next live.

## Contract rules

- Keep core logic browser-independent and inject side effects.
- Keep UI state and persistence in the UI/integration layer.
- Runtime owns replacement and teardown; callers explicitly start a session.
- Adapters must preserve the existing timer, retry, pacing, click, and
  statistics semantics.
- Add a focused adapter or module test when a boundary changes; do not create
  a generic module registry or selector abstraction for one module.

The shared interfaces are in `src/autolike/contract.ts` and are re-exported by
the existing Autolike module entry point.
