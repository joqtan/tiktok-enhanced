# Repository Guidelines

## Project scope

This repository is a broader TypeScript project. The autolike functionality is
currently its first module, not the definition of the whole project. Keep each
feature modular, with clear boundaries between reusable logic, integrations,
UI, and runtime entry points.

## Package manager

- Use pnpm exclusively.
- Do not introduce npm or Yarn lockfiles.

## TypeScript

- Use strict TypeScript.
- Prefer explicit interfaces and dependency injection for browser APIs, timers,
  storage, and DOM access.
- Keep pure logic independently testable.
- Avoid `any` unless there is no safe alternative.

## Testing and validation

- Keep validation proportional to the change.
- For simple documentation, configuration, formatting, or mechanical changes,
  do not require a test or build run.
- For behavior changes, add or update focused tests when practical.
- Before committing code changes, run `pnpm test` and `pnpm run build`.
- Do not treat compilation alone as sufficient validation for behavior changes.

## Architecture

- Keep reusable feature logic independent from UI and runtime bootstrapping.
- Do not add platform-specific DOM setup to reusable cores unless it is exposed
  through an adapter or injected dependency.
- Preserve existing behavior unless a change explicitly requires it.
- Keep feature-specific concerns inside their module instead of coupling them
  to unrelated or future project features.

## Licensing

- Preserve attribution to AmpedWasTaken/TikTok-Live-Liker.
- Keep MIT notices for code derived from the upstream project.
- Do not remove or weaken `THIRD_PARTY_NOTICES.md`.
- Original project code remains under the repository's 0BSD license.

## Code review priorities

Review carefully for:

1. Regressions in the behavior being changed.
2. Incorrect module boundaries or accidental cross-feature coupling.
3. Browser lifecycle leaks, uncleared timers, and resource cleanup where applicable.
4. Implicit coupling between reusable logic and UI/runtime code.
5. License or attribution regressions.
6. Accidental dependencies on `node_modules`, generated files, or secrets.

For autolike changes specifically, also check click scheduling, retries,
delays, cancellation, and statistics accounting.
