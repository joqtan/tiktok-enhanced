# TikTok Enhanced

[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow.svg)](https://www.conventionalcommits.org/en/v1.0.0/)

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
provides DOM and timer adapters and mounts the draggable floating module widget
on TikTok live pages. **Autolike stays stopped by default**; select **Resume** to
start it manually.

The widget provides pause/resume, mode selection, live counters, and expandable
**Settings**, with TikTok-inspired cyan/pink accents. Its position, selected mode,
active module, and collapsed state are persisted in `localStorage`.

#### Compact panel

Select the small **up-chevron** button (tooltip: **Collapse panel**) to hide the
mode selector, settings, and counters while keeping the name, status, and
pause/resume control visible. Select the **down-chevron** (tooltip: **Expand
panel**) to restore the details. Collapsing does not pause or start autolike;
the panel is kept inside the viewport when its size changes.

#### Automatic start for selected profiles

1. Open a creator live page, such as `https://www.tiktok.com/@creator/live`.
2. Open **Settings** and select **Add @creator**.
3. Leave the live and enter it again. Autolike starts with your saved mode.

Adding a profile never starts the current session. **Pause** keeps it stopped for
that visit, including hash/query changes and same-path navigation events. Leaving
and entering an allowlisted live again permits another automatic start. Switching
to a different live creates a fresh session with fresh counters.

Settings lists saved profiles with **Remove** controls; removing one affects the
next entry and does not stop the current session. Profiles are matched
case-insensitively from `/@creator/live` (an optional trailing slash is supported).
Generic `/live` pages have no known profile and never start automatically.

The allowlist is stored locally in this browser, not in your TikTok account.
Invalid or unreadable saved data cannot enable automatic start. If saving fails,
Settings shows an error instead of claiming the profile was saved.

## Install and update

Install the [latest userscript](https://github.com/joqtan/tiktok-enhanced/releases/latest/download/tiktok-enhanced.user.js)
with Tampermonkey enabled, then confirm installation in Tampermonkey. The release
includes the compiled script; you do not need Node.js or pnpm to install it.

If you previously pasted the script manually, install version **0.2.0** from that
link once to give Tampermonkey the update URLs. Keep the existing script name and
namespace so Tampermonkey can recognize it as an update. Check that only one copy
is enabled.

After that, Tampermonkey can check the published version according to its update
settings. You can also use its **Check for updates** action. It downloads newer
versions from GitHub Releases, not directly from the source branch. Browser-local
preferences remain in `localStorage`; this update does not change their keys.

## Development and build

This project uses Node.js 22 LTS and pnpm 10 exclusively. CI validates every pull request and every push to `main` with the same commands:

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
4. Open a TikTok live page (`https://www.tiktok.com/@creator/live`) to show the widget.
5. Select **Resume** to start, or open **Settings** to allow automatic start on
   future visits. Use the up-chevron button for a compact panel.

The userscript uses `@grant none` and does not include the upstream UI or
userscript wholesale.

Tests are located under `tests/` and focus on behavior that can be validated
without a live TikTok page.

## Publish a release

Releases are published manually; pushing source changes alone does not update
installed scripts. Keep the release asset name `tiktok-enhanced.user.js` stable,
because both `@updateURL` and `@downloadURL` use GitHub's latest-release URL.

1. Increase `@version` in both `tools/build.mjs` (the generated header) and
   `src/userscript/index.ts`. Use a higher version than the latest published one.
2. Run `pnpm test` and `pnpm run build`. Check the version and update URLs at the
   beginning of `dist/tiktok-enhanced.user.js`.
3. Commit the version change and push the release branch.
4. Publish the release against that exact commit, attaching the compiled script.
   For the first release, the commands are:

   ```sh
   git push -u origin HEAD
   gh release create v0.2.0 dist/tiktok-enhanced.user.js --repo joqtan/tiktok-enhanced --target "$(git rev-parse HEAD)" --title "v0.2.0" --notes "Add profile autostart, a collapsible panel, and Tampermonkey update support." --latest
   ```

   For future releases, substitute the new version and release notes. This
   publishes a tag and release without merging the branch into `main`.

5. Confirm the release lists the asset, and that the
   [latest download](https://github.com/joqtan/tiktok-enhanced/releases/latest/download/tiktok-enhanced.user.js)
   serves the expected version. Keep stable releases separate from prereleases;
   the update URLs follow the release designated as latest.

The `dist/` artifact stays ignored by Git. Attach the freshly built file to each
release rather than committing it.

## Architecture

Reusable feature logic lives under `src/autolike`. Browser APIs, UI, and runtime
entry points are connected through explicit adapters under feature-specific
integration surfaces. The shared four-layer module boundary is documented in
[`docs/module-contract.md`](./docs/module-contract.md).

## Licensing

Original code in this repository is distributed under the Zero-Clause BSD (0BSD)
license; see [`LICENSE`](./LICENSE).

The autolike logic is derived and adapted from
[AmpedWasTaken/TikTok-Live-Liker](https://github.com/AmpedWasTaken/TikTok-Live-Liker)
and remains subject to its MIT attribution and notice requirements. See
[`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).
