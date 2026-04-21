# External Repository Model

`gutu-core` stays plugin-free. External package code is created outside this repository.

## Scaffolding

Use:

```bash
gutu scaffold repo --kind plugin --name gutu-plugin-example
gutu scaffold repo --kind library --name gutu-lib-example
gutu scaffold repo --kind integration --name gutu-ecosystem-integration
gutu rollout scaffold --out ../gutula-rollout
gutu rollout sync-catalogs
```

When the command is run from the `gutu-core` repository root, the scaffold is written to a sibling directory by default so plugin or library source is not accidentally created inside the core repository.

## Roles

- `plugin`: standalone plugin source repository
- `library`: standalone shared library repository
- `integration`: cross-repo matrix and compatibility verification repository

## Installation

Consumer workspaces install packages through `gutu.lock.json` plus `gutu vendor sync`.

The live install surface is split across the standalone catalog repos:

- `gutula/gutu-libraries`: `catalog/index.json`, `channels/stable.json`, `channels/next.json`
- `gutula/gutu-plugins`: `catalog/index.json`, `channels/stable.json`, `channels/next.json`

## GitHub Provisioning

When `GUTU_RELEASE_TOKEN` or `GITHUB_TOKEN` is available, the rollout manifest can be provisioned directly:

```bash
gutu rollout provision-github
```

If the token is unavailable, the command fails fast and cleanly without changing local state.

## Live Publishing

Use `gutu rollout publish-package` to build a target first-party library or plugin, upload signed release assets to the target GitHub Release, and promote the artifact into the standalone catalog repo and channel.

The command can run from the umbrella workspace or from a standalone `gutu-core` checkout when `ecosystem/rollout/live-topology.json` is available.
