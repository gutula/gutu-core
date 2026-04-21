# Release Process

The rebuilt `gutu-core` baseline now supports a minimal but real release path.

## Commands

```bash
bun run release:prepare
bun run release:sign
bun run release:verify
gutu rollout promote --package-id @gutula/example --kind plugin --repo gutula/gutu-plugin-example --manifest artifacts/release/example-release-manifest.json --uri-base https://github.com/gutula/gutu-plugin-example/releases/download/v1.0.0
```

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
