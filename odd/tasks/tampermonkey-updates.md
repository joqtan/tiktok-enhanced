# Tampermonkey updates
Configure stable update metadata and publish the first userscript release.
Delivery: manual GitHub Release; no merge to main or CI changes.

## Specs
S1. User request: "te puedes encargar tu de eso?"
S2. Authorized choice: "Configurar y publicar v0.2.0 (recomendado)" — "Preparar y validar los cambios, crear el commit de configuración, subir la rama y publicar el tag y la release con el script compilado. Sin mergear a main."
S4. Documentation request: "asegurate que vaya lo nuevo en la doc o readme"
S3. Previous constraint: "Implement the requested change with the simplest design that preserves correctness, security, and readability."

## Tasks
T1 [done] S1-S4 | inline: add v0.2.0 update/download metadata to existing headers and document manual releases | commit: pending
T2 [done] S1-S4 | independent verify: validate generated header, existing tests/build, release identity and safe update URLs | commit: pending
T3 [in_progress] S2 | parent: commit configuration, push feature branch, publish v0.2.0 with compiled asset, verify public download | commit: pending

## Log
L1. Original request: "te puedes encargar tu de eso?"
L2. User chose "Configurar y publicar v0.2.0 (recomendado)"; authorization includes configuration commit, branch push, tag and release, but no merge to main.
L6. T2 independent verification PASS: 51 tests passed, diff --check passed, exactly one leading header with unique metadata, baseline identity/permissions unchanged, new behavior markers present. No CI/dependency changes. Independent build not rerun; parent build passed. Public asset verification remains T3. Native review unavailable so far; no native approval claimed.
L5. T1 evidence: initial generated-version assertion failed (RED); after metadata and README edits, pnpm test passed 51 tests, pnpm run build passed, generated/source headers matched v0.2.0 and stable update URLs with unchanged identity/permissions. One generated header confirmed. Native assess unassessable due untracked scope; explicit Risk item 5 requires independent verify, not native approval.
L4. User correction: "asegurate que vaya lo nuevo en la doc o readme". Document installation, migration to managed updates, and manual release workflow in README.md.
L3. Existing branch feat/profile-autostart-and-collapse includes 9ad2191 and d7dbff7. Preserve pre-existing .gitignore modification. Forecast under 150 authored lines. Risk: item 5 (release publication and build metadata).
