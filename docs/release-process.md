# Release Process

The rebuilt `gutu-core` baseline now supports a live package-publish path for the split Gutu ecosystem.

## Commands

```bash
bun run release:prepare
bun run release:sign
bun run release:verify
bun run rollout:sync-catalogs
gutu rollout publish-package --target @platform/communication --kind library --channel stable
gutu rollout promote --package-id @gutula/example --kind plugin --repo gutula/gutu-plugin-example --manifest artifacts/release/example-release-manifest.json --uri-base https://github.com/gutula/gutu-plugin-example/releases/download/v1.0.0
```

## Live Publish Flow

1. `gutu rollout sync-catalogs` refreshes the standalone catalog indexes from the checked-out first-party repos.
2. `gutu rollout publish-package` stages a publish workspace, builds the requested package, and packs an npm-style tarball.
3. The command writes manifest, provenance, and signature assets, uploads all of them to the target GitHub Release, then promotes the tarball into the correct standalone catalog repo and channel.
4. Promotion commits and pushes the updated catalog metadata so the channel becomes immediately consumable through `gutu vendor sync`.

The publish command reads:

- `GUTU_RELEASE_TOKEN` or `GITHUB_TOKEN` for GitHub Release and repo updates
- `GUTU_SIGNING_PRIVATE_KEY` or `--private-key <path>` for release signing
- `GUTU_SIGNING_PUBLIC_KEY` or `--public-key <path>` for embedding the verification key into promoted catalog entries

## Signing

- `release:sign` reads `GUTU_SIGNING_PRIVATE_KEY` or `--private-key <path>`
- `release:verify` reads `GUTU_SIGNING_PUBLIC_KEY` or `--public-key <path>`
- signatures use `ed25519`

## Artifacts

`release:prepare` creates:

- `artifacts/release/<package>-<version>.tgz`
- `artifacts/release/<package>-release-manifest.json`
- `artifacts/release/<package>-release-provenance.json`

The bundle excludes:

- `.git`
- `node_modules`
- `coverage`
- `dist`
- nested `artifacts`

`rollout publish-package` additionally produces a publishable npm tarball for the target first-party package and uploads:

- `<package>-<version>.tgz`
- `<package>-release-manifest.json`
- `<package>-release-provenance.json`
- `<package>-release-manifest.json.sig.json`
