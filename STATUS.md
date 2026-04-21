# STATUS

## Current Phase

- `Phase R1 - hard reset complete`
- `Phase R2 - clean gutu-core baseline active`
- `Phase R3 - plugin-free ecosystem bootstrap ready and verified`
- `Phase R4 - artifact, release, and external-repo scaffolding complete`
- `Phase R5 - rollout automation complete; live GitHub execution remains credential-gated`
- `Phase R6 - cross-plugin orchestration runtime active and wired into the split-repo integration harness`
- `Phase R7 - cross-platform consumer bootstrap hardened for copy/symlink framework installs`
- `Phase R8 - live external publishing, standalone coordination repos, and remote-first certification active`

## Truth

- The active repository root has been rebuilt as a standalone `gutu-core` repo.
- This repo contains zero plugin source code.
- The new core baseline currently ships:
  - `@gutu/kernel`
  - `@gutu/ecosystem`
  - `@gutu/cli`
  - `@gutu/release`
  - `@platform/kernel`
  - `@platform/permissions`
  - `@platform/schema`
  - `@platform/commands`
  - `@platform/events`
  - `@platform/jobs`
  - `@platform/db-drizzle`
  - `@platform/plugin-solver`
- The active orchestration model is explicit commands plus durable events and jobs/workflows, not generic bidirectional hooks.
- The ecosystem audit now sees 12 real core runtime packages and zero compatibility shims.
- `gutu init` now vendors a local framework root into `vendor/framework` and records whether the bootstrap used `copy` or `symlink`.
- Automatic bootstrap mode now prefers `copy` on Windows and other symlink-restricted hosts so consumer initialization remains enterprise-safe.
- `gutula/gutu-core`, `gutula/gutu-libraries`, `gutula/gutu-plugins`, and `gutula/gutu-ecosystem-integration` now exist as live GitHub repositories.
- The standalone catalog repos now own `catalog/index.json` plus `stable` and `next` channel files as the live package-discovery surface.
- The live stable channels are seeded with signed GitHub Release artifacts for `@platform/communication` and `@plugins/notifications-core`.
- The integration harness now defaults to cloning the live repo topology and only falls back to the umbrella workspace when `GUTU_ECOSYSTEM_MODE=local` is explicitly requested.

## Next Milestones

1. Extend live channel coverage beyond the initial seeded stable packages.
2. Rotate signing and release credentials into long-lived CI/KMS management.
3. Keep the remote-first certification lane green as more first-party packages are promoted.

## Verified Commands

- `bun run build`
- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run ci`
- `bun run doctor`
- `bun run release:prepare`
- `bun run rollout:scaffold`
- `bun run rollout:sync-catalogs`
- `bun run gutu -- rollout publish-package --target @platform/communication --kind library --channel stable`
- `bun run gutu -- rollout publish-package --target @plugins/notifications-core --kind plugin --channel stable`
- `npm run validate` in `catalogs/gutu-libraries`
- `npm run validate` in `catalogs/gutu-plugins`
- `bun run audit` in `integrations/gutu-ecosystem-integration`
- `bun run consumer:smoke` in `integrations/gutu-ecosystem-integration`
- `git diff --check`
