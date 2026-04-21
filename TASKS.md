# TASKS

## Stage 1 - Reset

- [x] Move the previous repository contents into `old_contents/`.
- [x] Rebuild the repository root as a clean `gutu-core` baseline.
- [x] Remove active plugin source from the root repository.

## Stage 2 - Core Baseline

- [x] Create fresh root governance and truth documents.
- [x] Create `@gutu/kernel`.
- [x] Create `@gutu/ecosystem`.
- [x] Create `@gutu/cli`.
- [x] Create `@gutu/release`.
- [x] Add `gutu init` workspace scaffolding.
- [x] Harden `gutu init` for cross-platform framework installs with `copy`/`symlink` mode coverage.
- [x] Add `gutu doctor` repository-boundary verification.
- [x] Add `gutu vendor sync`.
- [x] Add release prepare/sign/verify flows.
- [x] Add external repo scaffolding commands.
- [x] Add rollout manifest and batch rollout scaffolding.
- [x] Add release promotion tooling for channel/catalog metadata.
- [x] Add GitHub provisioning automation gated on `GITHUB_TOKEN`.

## Stage 3 - Orchestration Runtime

- [x] Add `@platform/kernel`.
- [x] Add `@platform/permissions`.
- [x] Add `@platform/schema`.
- [x] Add `@platform/commands`.
- [x] Add `@platform/events`.
- [x] Add `@platform/jobs`.
- [x] Add `@platform/db-drizzle`.
- [x] Add `@platform/plugin-solver`.
- [x] Add end-to-end command -> event -> subscriber -> job orchestration coverage.
- [x] Reduce the integration harness to a single remaining compat shim.
- [x] Replace the final compat shim with a real core package and remove compatibility fallback usage.

## Stage 4 - Follow-On

- [x] Provision separate live `gutula/*` coordination repositories for core, catalogs, and integration.
- [x] Seed the standalone catalog indexes from the checked-out first-party packages.
- [x] Wire the live package channels to published signed artifacts.
- [x] Stand up remote-first cross-repo integration verification against those external repos.
- [ ] Expand live signed release coverage beyond the initial stable channel fixtures.
