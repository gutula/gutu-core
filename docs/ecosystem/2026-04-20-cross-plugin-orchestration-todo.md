# Cross-Plugin Orchestration TODO

Date: 2026-04-20
Repo: `gutu-core`
Status: Substantially complete

## Objective

Add a production-grade cross-plugin orchestration runtime to `gutu-core` built around explicit commands, durable events, jobs/workflows, replay safety, and ecosystem-level verification.

## Stage 1. Baseline And Tracking

- [x] Confirm the current split-workspace state and identify which extracted packages depend on `@platform/schema`, `@platform/events`, `@platform/jobs`, and `@platform/plugin-solver`.
- [x] Confirm that the current production runtime is still compat-shim-only for those packages.
- [x] Create a live implementation tracker in the repo.

## Stage 2. Core Runtime Packages

- [x] Add real `@platform/schema` package in `gutu-core`.
- [x] Add real `@platform/commands` package in `gutu-core`.
- [x] Add real `@platform/events` package in `gutu-core`.
- [x] Add real `@platform/jobs` package in `gutu-core`.
- [x] Add real `@platform/plugin-solver` package in `gutu-core`.
- [x] Add supporting real `@platform/kernel` and `@platform/permissions` packages in `gutu-core`.
- [x] Add runtime tests for validation, idempotency, subscriptions, replay, dead-lettering, and workflow transitions.

## Stage 3. Ecosystem Wiring

- [x] Update `gutu-core` TypeScript path aliases and workspaces for the new runtime packages.
- [x] Update the ecosystem integration harness to consume real runtime packages from `gutu-core` where available.
- [x] Keep compatibility shims only for packages that do not yet have real runtime implementations in `gutu-core`.

## Stage 4. End-To-End Proof

- [x] Add a concrete orchestration example proving command -> event -> subscriber -> follow-up event/job flow.
- [x] Cover duplicate event delivery, retry exhaustion, dead-lettering, and replay.
- [x] Ensure the example stays plugin-repo-friendly and does not reintroduce plugin source into `gutu-core`.

## Stage 5. Repo Truth And Verification

- [x] Update `README.md`, `STATUS.md`, `TASKS.md`, `TEST_MATRIX.md`, `IMPLEMENTATION_LEDGER.md`, `RISK_REGISTER.md`, and `docs/architecture.md`.
- [x] Run `bun run ci` in `gutu-core`.
- [x] Run ecosystem audit/certification/consumer smoke in `integrations/gutu-ecosystem-integration`.
  The certification workspace now completes cleanly end to end: `reports/ecosystem-certify.json` was refreshed on 2026-04-20T18:56:33.005Z with 66 packages checked, 326 commands executed, and 0 failed commands. The consumer smoke path remains green with a fresh example workspace under `.tmp/consumer-smoke/demo-consumer`.
- [x] Run `git diff --check` at the workspace root.

## Risks To Watch

- Split-repo consumers may still rely on compat shims if the certification workspace does not ingest the new `gutu-core` packages correctly.
- Command/event contracts need to remain deterministic so replay and idempotency tests stay stable.
- The implementation must not couple `gutu-core` to checked-in plugin source.
