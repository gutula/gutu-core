# Risk Register

## Active Risks

### R1. Future contributors may reintroduce plugin source into core

Mitigation:

- Keep `gutu doctor` checking repository boundaries.
- Document the no-plugin-source rule in README, CONTRIBUTING, and SECURITY.

### R2. Live stable channel coverage is still intentionally narrow

Mitigation:

- Keep `gutu rollout publish-package` as the standard path for promoting more first-party packages into the live channels.
- Treat the currently published stable fixtures as the minimum install-proof surface until broader package promotion is complete.

### R3. Remote artifact trust still depends on operator-managed keys

Mitigation:

- Keep `GUTU_SIGNING_PRIVATE_KEY` and `GUTU_SIGNING_PUBLIC_KEY` outside the repo.
- Promote long-term signing into managed CI secrets or KMS-backed workflows during external rollout.

### R4. Live GitHub provisioning remains credential-gated

Mitigation:

- Use `GUTU_RELEASE_TOKEN` or `GITHUB_TOKEN` for future provisioning and publish runs.
- Keep rollout topology in `ecosystem/rollout/organization.json` and `ecosystem/rollout/live-topology.json` so provisioning and remote certification stay deterministic.

### R5. Remote-first certification depends on external repo and release availability

Mitigation:

- Keep the live topology manifest small, explicit, and versioned in-repo.
- Keep `GUTU_ECOSYSTEM_MODE=local` as the emergency fallback when GitHub availability or rate limiting interferes with remote certification.

### R6. Cross-plugin orchestration currently ships as an in-memory reference runtime

Mitigation:

- Keep the command/event/job contracts stable so persistent adapters can be added without breaking plugin code.
- Treat this runtime as the canonical orchestration semantic layer and add durable storage adapters during external rollout.

### R7. Consumer bootstrap can drift if copied framework roots are not refreshed during upgrades

Mitigation:

- Keep `gutu init` recording `frameworkInstallMode` and `frameworkPath` in `gutu.project.json`.
- Prefer `copy` for enterprise Windows or locked-down endpoints, and re-bootstrap intentionally when adopting a newer `gutu-core` baseline.
