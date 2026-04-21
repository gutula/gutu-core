# Gutu Core Reset TODO

Date: 2026-04-20
Status: reset baseline active, hardened, and moved under umbrella workspace

## Stage 0. Extraction

- [x] Move the previous monolithic contents out of the active core root.
- [x] Remove the archive after repo-shaped extraction into the umbrella workspace.

## Stage 1. Fresh Root

- [x] Create a new root `package.json`.
- [x] Create new TypeScript and lint configuration.
- [x] Create new governance and truth surfaces.
- [x] Create a fresh CI workflow.

## Stage 2. Core Packages

- [x] Add `@gutu/kernel`.
- [x] Add `@gutu/ecosystem`.
- [x] Add `@gutu/cli`.
- [x] Keep the repository free of plugin source code.

## Stage 3. Verification

- [x] Run `bun install`.
- [x] Run `bun run build`.
- [x] Run `bun run typecheck`.
- [x] Run `bun run lint`.
- [x] Run `bun run test`.
- [x] Run `bun run ci`.

## Stage 4. Follow-On

- [x] Add remote artifact fetching.
- [x] Add release signing and provenance for the new baseline.
- [x] Add scaffolding for external plugin and library repositories.
- [x] Add scaffolding for a dedicated ecosystem integration repository.

## Stage 5. External Rollout

- [x] Add GitHub-ready rollout automation for repo provisioning.
- [x] Add signed release promotion tooling for channels and catalogs.
- [x] Add batch rollout scaffolding from the organization manifest.
- [x] Move the active core repo into `gutu-core/` under the umbrella workspace.
- [ ] Execute the live GitHub provisioning run with real credentials.
- [ ] Publish the first signed remote artifacts from those live repositories.
- [ ] Wire the live integration repository to those published artifacts and CI secrets.
