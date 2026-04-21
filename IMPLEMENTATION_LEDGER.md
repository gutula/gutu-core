# Implementation Ledger

## 2026-04-20

- Rebuilt the repository root as a clean, plugin-free `gutu-core` baseline.
- Added fresh governance and truth surfaces for the reset repository.
- Added `@gutu/kernel` for core manifest and repository-boundary contracts.
- Added `@gutu/ecosystem` for consumer workspace bootstrap and lockfile models.
- Added `@gutu/cli` for `init` and `doctor` commands.
- Added `@gutu/release` for release bundle preparation, manifest/provenance generation, and signature verification.
- Added `gutu vendor sync` with file and HTTP artifact fetching, digest enforcement, optional signature verification, and vendor install state recording.
- Added scaffolding flows for standalone plugin, library, and integration repositories.
- Added rollout automation for batch external-repo scaffolding, signed release promotion into channels/catalogs, and GitHub provisioning with `GITHUB_TOKEN`.
- Moved the standalone `gutu-core` repo under the umbrella workspace alongside extracted plugin, library, app, catalog, and integration repo folders.
- Added first-party `@platform/kernel`, `@platform/permissions`, `@platform/schema`, `@platform/commands`, `@platform/events`, `@platform/jobs`, and `@platform/plugin-solver` packages inside `gutu-core`.
- Added a durable orchestration model built around explicit commands, outbox-style events, retries, dead-lettering, replay, and workflow transitions.
- Added end-to-end orchestration coverage for a payment-received -> invoice-paid -> notification-dispatch flow inside `gutu-core`.
- Updated the ecosystem integration harness to consume real runtime packages from `gutu-core`, leaving only one remaining compat shim.
- Verified the new baseline with `bun run build`, `bun run typecheck`, `bun run lint`, `bun run test`, `bun run ci`, `bun run doctor`, `bun run release:prepare`, and `git diff --check`.

## 2026-04-21

- Hardened `gutu init` so it now installs a local framework root into `vendor/framework` during workspace bootstrap instead of leaving a placeholder directory.
- Added cross-platform framework install mode selection with explicit `copy`, explicit `symlink`, and automatic `copy` fallback for Windows or symlink-restricted hosts.
- Replaced brittle source-root discovery with path-utility-based resolution that works for both source-tree and bundled CLI paths, including Windows-style paths.
- Added smoke and unit coverage for `gutu init` in both `copy` and `symlink` modes plus Windows-oriented source-root resolution cases.
- Updated the README, status ledger, task ledger, and risk register so the initialization flow is documented honestly as cross-platform and enterprise-safe.
