# Multica Supercharge Rollout TODO

Date: 2026-04-22
Repo: `gutu-core`
Status: Completed

## Objective

Close the remaining Multica-class gaps on top of the hardened governed AI core by adding first-class collaboration and runtime bridge control planes, then threading those surfaces through skills, automation, and Pack 0 Company Builder.

## Stage 1. Tracking And Truth

- [x] Reconfirm the existing supercharge rollout state before extending it.
- [x] Create a dedicated rollout tracker for the Multica-derived collaboration and runtime layer.
- [x] Update workspace truth surfaces so the stack story explicitly includes collaboration and runtime bridge planes.
- [x] Update repo-local `README.md`, `DEVELOPER.md`, and `TODO.md` files for every new or expanded repo touched by this stage.

## Stage 2. Add Collaboration And Runtime Bridge Planes

- [x] Create `plugins/gutu-plugin-issues-core` as the collaboration control plane for projects, issues, comments, activity, inbox, attachments, and resumable issue sessions.
- [x] Create `plugins/gutu-plugin-runtime-bridge-core` as the daemon/runtime plane for runtime registration, watched workspaces, local skill discovery, provider detection, and resumable runtime sessions.
- [x] Add focused integration, contract, unit, and migration coverage for both new plugins.

## Stage 3. Extend Existing Control Planes

- [x] Extend `ai-skills-core` with local-skill import and richer agent-profile settings parity.
- [x] Extend `automation-core` with Autopilot-oriented issue creation, runtime targeting, and manual trigger history posture.
- [x] Extend `company-builder-core` so work intakes create collaboration issues and runtime sessions rather than stopping at isolated queue records.

## Stage 4. Catalog, Workspace, And Docs Truth

- [x] Add the new plugins to `WORKSPACE_REPOS.md`, plugin catalog metadata, and `next` channel truth.
- [x] Update `catalogs/gutu-plugins/README.md` and framework overview docs with the new collaboration/runtime story.
- [x] Keep repo-local TODO ledgers honest about shipped scope versus remaining boundaries.

## Stage 5. Verification

- [x] Run docs checkers for `issues-core`, `runtime-bridge-core`, and every expanded repo.
- [x] Run repo-level build, typecheck, lint, and test lanes for the new and modified plugins.
- [x] Run full ecosystem verification and sync the generated reports.

## Stage 6. Post-Completion Hardening

- [x] Add explicit issue blocker dependencies and inbox acknowledgement transitions so collaboration recovery stops relying on implicit comments.
- [x] Add watched-workspace allowlist and policy posture so runtime bridge state can surface blocked or warning workspaces.
- [x] Add automation dead-letter persistence and replay flows for runtime or dependency failures.
- [x] Surface blocked issues, inbox pressure, dead letters, and runtime policy alerts inside Pack 0 work queues.
- [x] Refresh repo truth docs so the shipped control-plane hardening no longer appears as future work.

## Risks To Watch

- The collaboration and runtime bridge layers must stay subordinate to the governed work OS rather than reintroducing ad hoc side effects.
- Runtime and session state are still same-process fixtures in this rollout, so failure handling must be explicit and test-covered.
- Catalog and ecosystem inventory drift grows with every new plugin repo, so truth docs and certification need to move in lockstep.

## Verification Evidence

- `bun run docs:check` passed for `gutu-plugin-issues-core`, `gutu-plugin-runtime-bridge-core`, `gutu-plugin-ai-skills-core`, `gutu-plugin-automation-core`, and `gutu-plugin-company-builder-core`.
- `bun run certify:local` passed in `integrations/gutu-ecosystem-integration` with `73` packages checked, `361` commands executed, and `0` failed commands.
- `bun run ci:local` passed in `integrations/gutu-ecosystem-integration`, refreshing `ecosystem-audit.md`, `ecosystem-certify.md`, and `consumer-smoke.md`.
- Dependency-complete targeted package validation passed in the certification workspace for `issues-core`, `runtime-bridge-core`, `automation-core`, and `company-builder-core` after the hardening pass.
