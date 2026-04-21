# External Repository Model

`gutu-core` stays plugin-free. External package code is created outside this repository.

## Scaffolding

Use:

```bash
gutu scaffold repo --kind plugin --name gutu-plugin-example
gutu scaffold repo --kind library --name gutu-lib-example
gutu scaffold repo --kind integration --name gutu-ecosystem-integration
gutu rollout scaffold --out ../gutula-rollout
```

When the command is run from the `gutu-core` repository root, the scaffold is written to a sibling directory by default so plugin or library source is not accidentally created inside the core repository.

## Roles

- `plugin`: standalone plugin source repository
- `library`: standalone shared library repository
- `integration`: cross-repo matrix and compatibility verification repository

## Installation

Consumer workspaces install packages through `gutu.lock.json` plus `gutu vendor sync`.

## GitHub Provisioning

When `GITHUB_TOKEN` is available, the rollout manifest can be provisioned directly:

```bash
gutu rollout provision-github
```

If the token is unavailable, the command fails fast and cleanly without changing local state.
