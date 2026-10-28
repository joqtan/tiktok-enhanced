# Tampermonkey updates
Configure stable update metadata and publish the first userscript release.
Delivery: manual GitHub Release; no merge to main or CI changes.

## Specs
S1. User request: "te puedes encargar tu de eso?"
S2. Authorized choice: "Configurar y publicar v0.2.0 (recomendado)" — "Preparar y validar los cambios, crear el commit de configuración, subir la rama y publicar el tag y la release con el script compilado. Sin mergear a main."
S3. Previous constraint: "Implement the requested change with the simplest design that preserves correctness, security, and readability."
S4. Documentation request: "asegurate que vaya lo nuevo en la doc o readme"

## Tasks
T1 [done] S1-S4 | inline: add v0.2.0 update/download metadata to existing headers and document manual releases | commit: 8a6f280
T2 [done] S1-S4 | independent verify: validate generated header, existing tests/build, release identity and safe update URLs | commit: 8a6f280
T3 [done] S2 | parent: commit configuration, push feature branch, publish v0.2.0 with compiled asset, verify public download | commit: 8a6f280 (release target); completion evidence in this document's follow-up commit

## Log
L1. Original request: "te puedes encargar tu de eso?"
L2. User chose "Configurar y publicar v0.2.0 (recomendado)"; authorization includes configuration commit, branch push, tag and release, but no merge to main.
L3. Existing branch feat/profile-autostart-and-collapse includes 9ad2191 and d7dbff7. Preserve pre-existing .gitignore modification. Forecast under 150 authored lines. Risk: item 5 (release publication and build metadata).
L4. User correction: "asegurate que vaya lo nuevo en la doc o readme". Document installation, migration to managed updates, and manual release workflow in README.md.
L5. T1 evidence: initial generated-version assertion failed (RED); after metadata and README edits, pnpm test passed 51 tests, pnpm run build passed, generated/source headers matched v0.2.0 and stable update URLs with unchanged identity/permissions. One generated header confirmed.
L6. T2 independent verification PASS: 51 tests passed, diff --check passed, exactly one leading header with unique metadata, baseline identity/permissions unchanged, new behavior markers present. No CI/dependency changes. Independent build not rerun; parent build passed.
L7. Native assessment initially unavailable because of untracked scope; a later mistyped base failed resolution. Assessment with the actual full parent commit succeeded: nativeRisk medium, reviewDue false (under_budget). Escalated item 5 required independent verification, which passed. No native review started or approval claimed.
L8. T3 evidence: configuration commit 8a6f2807f1a77499d33f8fae035d21d153edf855 pushed on feat/profile-autostart-and-collapse. Published stable latest release https://github.com/joqtan/tiktok-enhanced/releases/tag/v0.2.0 with tiktok-enhanced.user.js. Public latest download returned HTTP 200 and matched the validated local build byte-for-byte, SHA-256 3778fc49c422025d698fbb1d5cdfaa9b1087b9c66d55ce752f7b158981e4cbc2. Remote v0.2.0 tag matched that exact commit. No merge to main. Real-browser Tampermonkey update UX not exercised.
