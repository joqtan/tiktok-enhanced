# TikTok Enhanced: Autolike Roadmap

This roadmap keeps Autolike safe, predictable, testable, and independent from UI and TikTok DOM setup. Each workstream should be an independent, reviewable pull request whenever practical.

## Current direction

- Every live stream is entered with Autolike **stopped**, including reloads and client-side navigation.
- Mode selection may persist, but running state never persists or resumes automatically.
- Starting requires an explicit user action.
- Leaving a live invalidates the old session and cleans up its timers, retries, and listeners.

## Roadmap at a glance

| # | Workstream | Outcome | Status |
|---|---|---|---|
| 1 | Continuous integration | Tests and production builds run automatically | ✅ Merged (PRs #4 and #5) |
| 2 | Safe live entry | Every live starts stopped; no automatic resume | ✅ Merged (PR #7) |
| 3 | Rate limiting and pacing | Clicks remain human-like and bounded | 🔶 Implemented; PR pending |
| 4 | Lifecycle hardening | Timers, retries, observers, and sessions are cleaned up | 🔶 Phases one and two completed; deferred items listed below |
| 5 | Observability | Users and maintainers can understand Autolike behavior | 🔶 Implemented; PR pending |
| 6 | Shared module contract | New features can reuse stable runtime and UI boundaries | Planned |
| 7 | Second low-risk module | Expand the product without destabilizing Autolike | Planned |
| 8 | Distribution | Version, package, and publish the extension reliably | Planned |

---

## 2. Safe-by-default live entry — completed

The runtime now mounts every live entry with the widget stopped. The mode is restored as configuration only, and the widget's explicit control starts the engine. Reloads and repeated route initialization therefore cannot resume a previous running state. Live route changes stop and replace the old engine/widget; navigation away tears them down.

Focused coverage includes initial stopped entry behavior at the widget boundary, explicit start/stop controls, reload-like fresh initialization, live path detection, and repeated teardown.

## 3. Rate limiting and human-like pacing — implementation complete

**Objective:** make click scheduling bounded, understandable, and resistant to accidental bursts.

The engine now preserves randomized delays for regular and debug modes, serializes probabilistic multi-taps within each scheduling cycle, and prevents them from overlapping the next cycle. Retry attempts, clicks per cycle, and total work per cycle have explicit safe limits. Retry paths use the same randomized pacing policy, including configured pauses, rather than bypassing it. Statistics distinguish attempted clicks, multi-taps, skips, retries, and failures; missing-button skips are no longer counted as failed click attempts.

Focused coverage includes retry exhaustion and cancellation, retry pause pacing, cycle work limits, bounded multi-taps, stale asynchronous work, safe limit normalization, and consistent statistics accounting. The implementation is ready for the next reviewable pull request.

## 4. Browser lifecycle hardening — phase one completed

This phase adds session-generation invalidation in the reusable engine. Stop cancels pending timers and retries, stale timer callbacks are ignored even if a timer adapter invokes them after cancellation, combo callbacks cannot mutate a later session, and repeated stop/teardown is safe. The runtime also owns live route transitions and removes the old widget/engine before mounting a new stopped entry.

### Phase two completed

Runtime navigation is covered through actual pushState, replaceState, and popstate transitions across live A, live B, away, and live A again. Every live entry creates a fresh stopped engine/widget session; the old pair is stopped and destroyed exactly once. Session statistics are route-scoped and reset on every new live entry (mode and widget position may persist as configuration, but counters do not). The detector abandons disconnected roots and roots no longer contained by the document, then safely searches replacement DOM nodes.

MutationObserver remains intentionally out of scope until DOM observation is introduced. Future observers and asynchronous adapters must be owned and invalidated by their session.

### Remaining point-4 items

- Centralize ownership for future observers and listeners by session.
- Add and disconnect MutationObserver instances when DOM observation is introduced.
- Extend stale-work coverage to every future asynchronous adapter, not only timers/retries.

## 5. Observability and user feedback — implementation complete

The engine now exposes stopped, running, and unavailable status, with stopped covering the existing explicit stop/resume behavior. Optional structured diagnostics report lifecycle transitions, unavailable/recovered button detection, retry exhaustion, detector failures, and cancelled pending work without exposing page data. The widget derives its displayed status from the engine and renders skips, retries, multi-taps, and completed combos alongside the existing counters.

Focused coverage includes status transitions, unavailable recovery, retry exhaustion, detector errors, cancellation diagnostics, and expanded widget counters. A separate paused state remains deferred until the runtime distinguishes pausing from stopping.

## 6. Shared module contract

Define boundaries for core scheduling/state, DOM/timer/storage adapters, UI, and runtime route lifecycle before adding unrelated features.

## 7. Add a second, lower-risk module

Choose a module with limited side effects, an independent lifecycle, a clear boundary, and fixture-friendly tests.

## 8. Distribution and release

Document local validation, versioning, packaging, release checks, and preservation of third-party attribution.

## Recommended sequence

1. ✅ Merge CI (point 1; PRs #4 and #5).
2. ✅ Deliver safe live entry (point 2; PR #7).
3. ✅ Complete lifecycle hardening phases one and two (point 4; commit `8d54b76`).
4. ✅ Implement rate limiting and human-like pacing (point 3; PR pending).
5. Complete the deferred lifecycle foundations when observers or new asynchronous adapters are introduced (point 4).
6. ✅ Implement observability and user feedback (point 5).
7. Extract the shared module contract (point 6).
8. Implement one low-risk second module (point 7).
9. Prepare distribution and release workflow (point 8).

## Review checklist

- [ ] Scope is limited to the intended roadmap point.
- [ ] Tests cover changed behavior and cancellation paths.
- [ ] Browser resources are cleaned up.
- [ ] UI, reusable logic, adapters, and runtime remain separated.
- [ ] No secrets, generated files, or `node_modules` content were added.
- [ ] Attribution and third-party notices remain intact.
- [ ] `pnpm test` and `pnpm run build` pass before delivery.

## Non-goals

This roadmap does not authorize automatic interaction on new platforms, aggressive click modes, unrelated UI redesigns, or broad rewrites before lifecycle and testing foundations are stable.
