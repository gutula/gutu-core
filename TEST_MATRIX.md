# Test Matrix

## Current Verification

- Build:
  - `bun run build`
- Release bundle:
  - `bun run release:prepare`
- Typecheck:
  - `bun run typecheck`
- Lint:
  - `bun run lint`
- Unit tests:
  - `bun run test`
- Full baseline:
  - `bun run ci`
- Doctor:
  - `bun run doctor`
- Rollout:
  - `bun run rollout:scaffold`

## Coverage Focus

- kernel manifest validation
- package definition validation and install-review policy evaluation
- repository boundary enforcement
- ecosystem lockfile and workspace bootstrap shape
- artifact download, digest verification, and signature validation
- release manifest, provenance, and signature flows
- action/resource schema execution and JSON schema projection
- command dispatch idempotency and event append behavior
- event subscription retries, dead-lettering, and replay
- job retries, dead-letter handling, and workflow transitions
- plugin dependency ordering plus command/event topology warnings
- end-to-end payment-received -> invoice-paid -> notification-dispatch orchestration
- rollout manifest loading, repo scaffolding, and GitHub provisioning request generation
- CLI scaffold and doctor flows
