# Company Builder Supercharge Rollout TODO

Date: 2026-04-22
Repo: `gutu-core`
Status: Completed

## Objective

Ship the supercharged parity rollout for Pack 0 Company Builder on top of a hardened governed AI core. This rollout expands the platform beyond the earlier company pack baseline by adding first-class skills, integrations, routines, execution workspaces, richer runtime contracts, staged builder publish semantics, and updated ecosystem truth surfaces.

## Stage 1. Tracking And Truth

- [x] Reconfirm the split-workspace state for the touched plugin and library repos.
- [x] Keep a live implementation tracker in `gutu-core/docs/ecosystem/2026-04-22-company-builder-rollout-todo.md`.
- [x] Update workspace truth surfaces so the product story stays "governed work OS plus optional operating-model packs".
- [x] Update repo-local `README.md`, `DEVELOPER.md`, and `TODO.md` files for every new or expanded repo touched by this rollout.

## Stage 2. Harden Shared Runtime And Builder Contracts

- [x] Extend `@platform/ai-runtime` with capability taxonomy, execution modes, run lineage, verifier results, run events, and runner handoff contracts.
- [x] Extend `@platform/admin-builders` with staged publish, diff, simulation, rollback, owner, policy, preview, and publish-approval metadata.
- [x] Extend `@platform/ai-mcp` with transport/runtime orchestration helpers, tool filtering, schema cache contracts, health evaluation, and multi-server connection planning.

## Stage 3. Expand The Governed AI Core

- [x] Extend `gutu-plugin-ai-core` with branching, event streams, verifier recording, runner handoff state, and workflow/approval builder surfaces.
- [x] Extend `gutu-plugin-ai-rag` with governed knowledge pipelines, memory candidates, promotion flows, and retrieval diagnostics strong enough for Pack 0 routing.
- [x] Extend `gutu-plugin-ai-evals` with rollout rings, online evidence, richer subject kinds, and promotion state that can gate skills, connectors, workflows, and company packs.

## Stage 4. Add New Control-Plane Plugins

- [x] Create `plugins/gutu-plugin-ai-skills-core` with public skill, skill-version, assignment, and agent-profile surfaces plus `skill-builder` and `agent-builder`.
- [x] Create `plugins/gutu-plugin-integration-core` with connector, connection, and webhook surfaces plus `integration-builder`.
- [x] Create `plugins/gutu-plugin-automation-core` with routines, routine runs, inbox loops, concurrency policy, and catch-up policy.
- [x] Create `plugins/gutu-plugin-execution-workspaces-core` with realized workspaces, runtime services, and operator control-room pages.

## Stage 5. Expand Pack 0 Company Builder

- [x] Compose Company Builder with the new skills, integration, automation, and execution plugins rather than re-owning those primitives.
- [x] Add staged operating-model revisions, rollback targets, template install flows, and assignment summaries.
- [x] Keep the `company` workspace, `company-builder`, `department-builder`, and `/apps/company-builder` zone aligned with the new underlying control planes.
- [x] Keep work-intake orchestration typed and replay-safe across intake, retrieval, release gate, AI run, approval wait, verification, escalation, and completion.

## Stage 6. Verification And Stabilization

- [x] Fix deterministic freshness drift in `ai-rag` seed fixtures so Pack 0 publish can pass with a healthy approved baseline while stale-path coverage remains explicit.
- [x] Fix the remaining `automation-core` lint blocker in the certification workspace.
- [x] Re-run ecosystem certification after the stability fixes and confirm zero failures.
- [x] Re-run docs checkers for `gutu-plugin-ai-skills-core`, `gutu-plugin-integration-core`, `gutu-plugin-automation-core`, `gutu-plugin-execution-workspaces-core`, and `gutu-plugin-company-builder-core`.
- [x] Re-run full `bun run ci:local` in `integrations/gutu-ecosystem-integration`.

## Dependency Notes

- `company-builder-core` now depends on `ai-skills-core`, `ai-core`, `ai-rag`, `ai-evals`, `integration-core`, `automation-core`, `execution-workspaces-core`, `jobs-core`, `workflow-core`, and `notifications-core`.
- `ai-skills-core` is the canonical skill ontology. Company Builder composes it; it does not redefine it.
- `integration-core` owns governed connector state while `@platform/ai-mcp` owns transport/runtime orchestration helpers.
- `automation-core` stays on top of `jobs-core`, `workflow-core`, and `notifications-core` instead of creating a second scheduler stack.

## Risks To Watch

- Some platform backbones are still same-process and state-file-backed, so runtime hardening and truth docs must continue moving together.
- Secret-vault adapters, real infrastructure provisioners, and deeper external observability remain future implementation layers on top of the new control-plane contracts.
- The catalog and workspace inventory now span 71 packages, so drift checks need to remain part of every broad rollout.

## Verification Notes

- Repo-local docs checkers passed for `gutu-plugin-ai-skills-core`, `gutu-plugin-integration-core`, `gutu-plugin-automation-core`, `gutu-plugin-execution-workspaces-core`, and `gutu-plugin-company-builder-core` after the truth-doc rewrite.
- Ecosystem audit regenerated at `2026-04-22T08:32:39.965Z` with `Packages discovered: 71`, `Manifest drift findings: 0`, and `Unresolved imports: 0`.
- Ecosystem certification regenerated at `2026-04-22T08:36:44.473Z` with `Packages checked: 71`, `Commands executed: 351`, and `Failed commands: 0`.
- Consumer smoke regenerated at `2026-04-22T08:36:48.035Z` with certification install, init, and vendor sync all passing.
- The final green certification run validated the new control-plane plugins and the expanded Pack 0 composition end to end inside the certification workspace.
