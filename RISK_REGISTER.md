# Risk Register

## Active Risks

### R1. Future contributors may reintroduce plugin source into core

Mitigation:

- Keep `gutu doctor` checking repository boundaries.
- Document the no-plugin-source rule in README, CONTRIBUTING, and SECURITY.

### R2. Live external publishing is not provisioned yet

Mitigation:

- Use the shipped release/sign/vendor flows locally until the external repos and CI secrets are provisioned.

### R3. Remote artifact trust still depends on operator-managed keys

Mitigation:

- Keep `GUTU_SIGNING_PRIVATE_KEY` and `GUTU_SIGNING_PUBLIC_KEY` outside the repo.
- Promote long-term signing into managed CI secrets or KMS-backed workflows during external rollout.

### R4. Live GitHub provisioning remains credential-gated

Mitigation:

- Use the implemented `gutu rollout provision-github` command once `GITHUB_TOKEN` is present.
- Keep rollout topology in `ecosystem/rollout/organization.json` so provisioning stays deterministic.

### R5. One compat shim still remains in the integration harness

Mitigation:

- Keep the audit report tracking the remaining shim count explicitly.
- Replace the final shim in a follow-on wave so the integration repo depends only on real core or external first-party packages.

### R6. Cross-plugin orchestration currently ships as an in-memory reference runtime

Mitigation:

- Keep the command/event/job contracts stable so persistent adapters can be added without breaking plugin code.
- Treat this runtime as the canonical orchestration semantic layer and add durable storage adapters during external rollout.

### R7. Consumer bootstrap can drift if copied framework roots are not refreshed during upgrades

Mitigation:

- Keep `gutu init` recording `frameworkInstallMode` and `frameworkPath` in `gutu.project.json`.
- Prefer `copy` for enterprise Windows or locked-down endpoints, and re-bootstrap intentionally when adopting a newer `gutu-core` baseline.
