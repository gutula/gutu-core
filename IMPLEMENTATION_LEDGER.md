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
- Added `@platform/db-drizzle` as a real core runtime package inside `gutu-core`, eliminating the final integration compat shim.
- Added live topology manifests plus `gutu rollout sync-catalogs` and `gutu rollout publish-package` so the core repo can seed standalone catalogs, build first-party packages, upload signed GitHub Release assets, and promote live channel metadata.
- Added GitHub Release upload support to `@gutu/release` and wired the publish flow to commit and push catalog promotions automatically.
- Converted `gutu-core`, `gutu-libraries`, `gutu-plugins`, and `gutu-ecosystem-integration` into live `gutula/*` repositories and pushed their standalone `main` branches.
- Populated the standalone catalog repos with full first-party inventory metadata, added `stable` and `next` channel files, and added CI validation for ordering, duplicates, signatures, and release asset reachability.
- Rebuilt the integration harness around a live-topology clone path that is now the default certification mode, with `GUTU_ECOSYSTEM_MODE=local` kept as the explicit umbrella-workspace override.
- Published signed GitHub Release artifacts for `@platform/communication` and `@plugins/notifications-core` and promoted them into the live stable channels used by `gutu vendor sync`.

## 2026-04-23

- Expanded the package and pack contract model so manifests now carry richer business ownership, capability, dependency, deprecation, trust, merge, rollback, and environment metadata.
- Added `@platform/business-runtime` with shared numbering, localization, exchange-rate, tax, import quarantine, traceability, reconciliation, contract-registry, and pack preview or apply or rollback primitives for the new business suite.
- Added shared SQL-backed business domain state stores plus shared Postgres and SQLite schema builders inside `@platform/business-runtime`, and migrated the scaffolded business plugins to use that shared runtime package directly instead of JSON fixture files.
- Added durable business orchestration helpers for outbox, inbox, dead-letter, replay, downstream resolution, and projection state to `@platform/business-runtime`, then regenerated the business plugin scaffolds to use those shared recovery semantics.
- Expanded the business suite scaffold from the initial core domains to 25 first-party business plugin repos by adding contracts, subscriptions, business portals, field service, maintenance, treasury, e-invoicing, analytics/BI, and AI assist addon repos.
- Regenerated the business plugin suite so every extracted repo now exports ERPNext-informed domain catalogs, report catalogs, exception queue catalogs, operational scenario catalogs, governed settings-surface catalogs, and a repo-root `ci` script.
- Added the extracted `catalogs/gutu-business-packs` repo with 13 first-party localization and sector pack artifacts, each carrying package metadata, channel metadata, deployable pack payloads, and validation fixtures.
- Expanded the business pack artifacts so each pack now carries starter settings, workflow, report, and automation objects, then restored the local signed stable channel after regeneration.
- Added local pack signing and stable-promotion scripts to `catalogs/gutu-business-packs`, then hardened `tooling/business-os/check.mjs` into a real business verification lane that now loads package manifests, evaluates contract registry health, dry-runs sample pack installs, validates the business pack catalog, enforces signature-gated stable promotion, and simulates both business lifecycle or recovery scenarios and 19 direct cross-plugin handoff scenarios across the generated suite.
- Added named cross-plugin end-to-end business flow coverage with durable evidence artifacts in `integrations/gutu-ecosystem-integration/reports/business-os-flows.{json,md}`, expanding the verified suite to 11 business scenarios including quote-to-cash, procure-to-pay, project-to-bill, plan-to-produce, service dispatch to bill, retail POS close, hire to payroll, contract renewal, portal self-service, treasury settlement, and e-invoicing.
- Added `tooling/business-os/run-resilience-flows.mjs` plus `business:resilience` so the suite now verifies duplicate create protection, revision mismatch handling, dead-letter replay, and downstream recovery across all 25 business plugins, with durable evidence written to `integrations/gutu-ecosystem-integration/reports/business-os-resilience.{json,md}`.
- Added `tooling/business-os/run-ci-fanout.mjs` plus the `business:fanout-ci` and `business:certify` wiring so all 25 business plugin repos plus the pack catalog are now build or lint or test or docs-checked together and recorded in `integrations/gutu-ecosystem-integration/reports/business-os-ci.{json,md}`.
- Updated the shared business-runtime downstream-resolution behavior so reconcile exceptions close automatically once all downstream work for the document is resolved, and kept the scaffolded lifecycle checks aligned with that smoother steady state.
- Deepened the shared business-plugin lifecycle so the generated suite now includes hold or release, amend, and reverse flows plus richer downstream secondary-record tracking, and extended the resilience runner to exercise those flows across all 25 business plugins.
- Added first-class install guidance across the business suite so generated manifests, pack dependencies, docs, and the shared plugin solver now distinguish required, recommended, capability-enhancing, and integration-only dependencies instead of flattening every relationship into one mandatory list.
- Tightened the core manifest helper signatures so defaulted contract fields remain ergonomic at call sites while staying type-safe through validation.
- Verified the new business runtime surface with focused Bun tests, a full `gutu-core` TypeScript compile, business-suite scenario checks, full-suite resilience checks, business repo CI fan-out, pack-catalog validation, plugin docs audit, and `graphify update .`.
