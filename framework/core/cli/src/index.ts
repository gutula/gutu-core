import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  doctorCoreRepository,
  type FrameworkInstallMode,
  publishPackageRelease,
  promoteReleaseArtifact,
  provisionGitHubRepositories,
  scaffoldExternalRepository,
  scaffoldRolloutRepositories,
  scaffoldWorkspace,
  syncCatalogRepositories,
  syncWorkspaceVendor
} from "@gutu/ecosystem";
import { prepareReleaseBundle, signReleaseManifestFile, verifyReleaseManifestFileSignature } from "@gutu/release";

export type CliIo = {
  cwd: string;
  stdout: { write(chunk: string): unknown };
  stderr: { write(chunk: string): unknown };
};

export async function runCli(argv: string[], io: CliIo): Promise<number> {
  const [command, ...rest] = argv;

  if (!command || command === "help" || command === "--help") {
    io.stdout.write(helpText());
    return 0;
  }

  if (command === "init") {
    const target = rest.find((entry) => !entry.startsWith("--")) ?? "gutu-workspace";
    const force = readBooleanFlag(rest, "--force");
    const frameworkInstallMode = readFlag(rest, "--framework-install-mode");
    if (frameworkInstallMode && !isFrameworkInstallModePreference(frameworkInstallMode)) {
      io.stderr.write("Invalid --framework-install-mode. Use auto, copy, or symlink.\n");
      return 1;
    }
    const validatedFrameworkInstallMode =
      frameworkInstallMode && isFrameworkInstallModePreference(frameworkInstallMode) ? frameworkInstallMode : undefined;

    const initOptions: {
      target: string;
      force: boolean;
      frameworkInstallMode?: FrameworkInstallMode | "auto";
    } = { target, force };
    if (validatedFrameworkInstallMode) {
      initOptions.frameworkInstallMode = validatedFrameworkInstallMode;
    }

    const result = scaffoldWorkspace(io.cwd, {
      ...initOptions
    });
    io.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return 0;
  }

  if (command === "doctor") {
    const target = rest.find((entry) => !entry.startsWith("--"));
    const result = doctorCoreRepository(target ? resolve(io.cwd, target) : io.cwd);
    const stream = result.ok ? io.stdout : io.stderr;
    stream.write(JSON.stringify(result, null, 2) + "\n");
    return result.ok ? 0 : 1;
  }

  if (command === "vendor" && rest[0] === "sync") {
    const target = rest.find((entry, index) => index > 0 && !entry.startsWith("--"));
    const result = await syncWorkspaceVendor(target ? resolve(io.cwd, target) : io.cwd);
    io.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return 0;
  }

  if (command === "scaffold" && rest[0] === "repo") {
    const kind = readFlag(rest, "--kind");
    const name = readFlag(rest, "--name");
    const outDir = readFlag(rest, "--out");
    if (!kind || !name || !isRepositoryKind(kind)) {
      io.stderr.write("Missing or invalid --kind/--name for `gutu scaffold repo`.\n");
      return 1;
    }

    const result = scaffoldExternalRepository(io.cwd, {
      kind,
      name,
      ...(outDir ? { outDir: resolve(io.cwd, outDir) } : {})
    });
    io.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return 0;
  }

  if (command === "rollout" && rest[0] === "scaffold") {
    const outDir = readFlag(rest, "--out");
    const manifestPath = readFlag(rest, "--manifest");
    if (!outDir) {
      io.stderr.write("Missing required flag --out for `gutu rollout scaffold`.\n");
      return 1;
    }

    const result = scaffoldRolloutRepositories(
      io.cwd,
      manifestPath
        ? { outDir: resolve(io.cwd, outDir), manifestPath }
        : { outDir: resolve(io.cwd, outDir) }
    );
    io.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return 0;
  }

  if (command === "rollout" && rest[0] === "promote") {
    const packageId = readFlag(rest, "--package-id");
    const kind = readFlag(rest, "--kind");
    const repo = readFlag(rest, "--repo");
    const manifestPath = readFlag(rest, "--manifest");
    const uriBase = readFlag(rest, "--uri-base");
    const signaturePath = readFlag(rest, "--signature");
    const channel = readFlag(rest, "--channel");
    const catalogPath = readFlag(rest, "--catalog");
    const channelPath = readFlag(rest, "--channel-path");
    const publicKeyPem =
      process.env.GUTU_SIGNING_PUBLIC_KEY ??
      (readFlag(rest, "--public-key") ? readFileSync(resolve(io.cwd, readFlag(rest, "--public-key") as string), "utf8") : undefined);

    if (!packageId || !repo || !manifestPath || !uriBase || (kind !== "plugin" && kind !== "library")) {
      io.stderr.write("Missing or invalid flags for `gutu rollout promote`.\n");
      return 1;
    }

    const result = promoteReleaseArtifact(io.cwd, {
      packageId,
      kind,
      repo,
      manifestPath,
      uriBase,
      ...(signaturePath ? { signaturePath } : {}),
      ...(publicKeyPem ? { publicKeyPem } : {}),
      ...(channel ? { channel } : {}),
      ...(catalogPath ? { catalogPath } : {}),
      ...(channelPath ? { channelPath } : {})
    });
    io.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return 0;
  }

  if (command === "rollout" && rest[0] === "sync-catalogs") {
    const workspaceRoot = readFlag(rest, "--workspace-root");
    const result = syncCatalogRepositories(io.cwd, workspaceRoot ? { workspaceRoot: resolve(io.cwd, workspaceRoot) } : {});
    io.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return 0;
  }

  if (command === "rollout" && rest[0] === "publish-package") {
    const target = readFlag(rest, "--target") ?? rest.find((entry, index) => index > 0 && !entry.startsWith("--"));
    const kind = readFlag(rest, "--kind");
    const workspaceRoot = readFlag(rest, "--workspace-root");
    const channel = readFlag(rest, "--channel");
    const tag = readFlag(rest, "--tag");
    const releaseToken = process.env.GUTU_RELEASE_TOKEN ?? process.env.GITHUB_TOKEN;
    const signingPrivateKeyPem =
      process.env.GUTU_SIGNING_PRIVATE_KEY ??
      (readFlag(rest, "--private-key") ? readFileSync(resolve(io.cwd, readFlag(rest, "--private-key") as string), "utf8") : undefined);
    const publicKeyPem =
      process.env.GUTU_SIGNING_PUBLIC_KEY ??
      (readFlag(rest, "--public-key") ? readFileSync(resolve(io.cwd, readFlag(rest, "--public-key") as string), "utf8") : undefined);

    if (!target || (kind && kind !== "plugin" && kind !== "library")) {
      io.stderr.write("Missing or invalid flags for `gutu rollout publish-package`.\n");
      return 1;
    }
    if (!releaseToken) {
      io.stderr.write("Missing GUTU_RELEASE_TOKEN or GITHUB_TOKEN for `gutu rollout publish-package`.\n");
      return 1;
    }
    if (!signingPrivateKeyPem) {
      io.stderr.write("Missing GUTU_SIGNING_PRIVATE_KEY or --private-key for `gutu rollout publish-package`.\n");
      return 1;
    }

    const result = await publishPackageRelease(io.cwd, {
      target,
      ...(kind === "plugin" || kind === "library" ? { kind } : {}),
      ...(workspaceRoot ? { workspaceRoot: resolve(io.cwd, workspaceRoot) } : {}),
      ...(channel ? { channel } : {}),
      ...(tag ? { tag } : {}),
      releaseToken,
      signingPrivateKeyPem,
      ...(publicKeyPem ? { publicKeyPem } : {})
    });
    io.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return 0;
  }

  if (command === "rollout" && rest[0] === "provision-github") {
    const owner = readFlag(rest, "--owner");
    const manifestPath = readFlag(rest, "--manifest");
    const token = process.env.GUTU_RELEASE_TOKEN ?? process.env.GITHUB_TOKEN;
    if (!token) {
      io.stderr.write("Missing GUTU_RELEASE_TOKEN or GITHUB_TOKEN for `gutu rollout provision-github`.\n");
      return 1;
    }

    const result = await provisionGitHubRepositories(
      io.cwd,
      manifestPath
        ? { token, ...(owner ? { owner } : {}), manifestPath }
        : { token, ...(owner ? { owner } : {}) }
    );
    io.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return 0;
  }

  if (command === "release" && rest[0] === "prepare") {
    const outDir = readFlag(rest, "--out") ?? "artifacts/release";
    const artifactName = readFlag(rest, "--name") ?? undefined;
    const result = prepareReleaseBundle(io.cwd, {
      outDir: resolve(io.cwd, outDir),
      ...(artifactName ? { artifactName } : {})
    });
    io.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return 0;
  }

  if (command === "release" && rest[0] === "sign") {
    const manifestPath = readFlag(rest, "--manifest") ?? join(io.cwd, "artifacts", "release", "gutu-core-release-manifest.json");
    const outPath = readFlag(rest, "--out") ?? `${manifestPath}.sig.json`;
    const privateKeyPem =
      process.env.GUTU_SIGNING_PRIVATE_KEY ??
      (readFlag(rest, "--private-key") ? readFileSync(resolve(io.cwd, readFlag(rest, "--private-key") as string), "utf8") : undefined);

    if (!privateKeyPem) {
      io.stderr.write("Missing signing key. Set GUTU_SIGNING_PRIVATE_KEY or pass --private-key.\n");
      return 1;
    }

    const result = signReleaseManifestFile(resolve(io.cwd, manifestPath), privateKeyPem, resolve(io.cwd, outPath));
    io.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return 0;
  }

  if (command === "release" && rest[0] === "verify") {
    const manifestPath = readFlag(rest, "--manifest") ?? join(io.cwd, "artifacts", "release", "gutu-core-release-manifest.json");
    const signaturePath = readFlag(rest, "--signature") ?? `${manifestPath}.sig.json`;
    const publicKeyPem =
      process.env.GUTU_SIGNING_PUBLIC_KEY ??
      (readFlag(rest, "--public-key") ? readFileSync(resolve(io.cwd, readFlag(rest, "--public-key") as string), "utf8") : undefined);

    if (!publicKeyPem) {
      io.stderr.write("Missing verification key. Set GUTU_SIGNING_PUBLIC_KEY or pass --public-key.\n");
      return 1;
    }

    const verified = verifyReleaseManifestFileSignature(resolve(io.cwd, manifestPath), resolve(io.cwd, signaturePath), publicKeyPem);
    const stream = verified ? io.stdout : io.stderr;
    stream.write(JSON.stringify({ ok: verified }, null, 2) + "\n");
    return verified ? 0 : 1;
  }

  io.stderr.write(`Unknown command '${command}'.\n`);
  io.stderr.write(helpText());
  return 1;
}

function helpText(): string {
  return [
    "gutu-core CLI",
    "",
    "Commands:",
    "  gutu init <target> [--force] [--framework-install-mode <auto|copy|symlink>]",
    "  gutu doctor [path]",
    "  gutu vendor sync [workspaceRoot]",
    "  gutu scaffold repo --kind <plugin|library|integration> --name <repo-name> [--out <dir>]",
    "  gutu rollout scaffold --out <dir> [--manifest <path>]",
    "  gutu rollout sync-catalogs [--workspace-root <path>]",
    "  gutu rollout promote --package-id <id> --kind <plugin|library> --repo <repo> --manifest <path> --uri-base <url>",
    "  gutu rollout publish-package --target <repo|package|path> [--kind <plugin|library>] [--workspace-root <path>]",
    "  gutu rollout provision-github [--owner <org>] [--manifest <path>]",
    "  gutu release prepare [--out <dir>] [--name <artifact-name>]",
    "  gutu release sign [--manifest <path>] [--private-key <path>] [--out <signature-path>]",
    "  gutu release verify [--manifest <path>] [--signature <path>] [--public-key <path>]",
    ""
  ].join("\n");
}

function readBooleanFlag(args: readonly string[], flag: string): boolean {
  return args.includes(flag) || args.includes(`${flag}=true`);
}

function readFlag(args: readonly string[], flag: string): string | undefined {
  const exactIndex = args.indexOf(flag);
  if (exactIndex >= 0) {
    const value = args[exactIndex + 1];
    return value && !value.startsWith("--") ? value : undefined;
  }

  const inline = args.find((entry) => entry.startsWith(`${flag}=`));
  if (!inline) {
    return undefined;
  }

  return inline.slice(flag.length + 1);
}

function isRepositoryKind(value: string): value is "plugin" | "library" | "integration" {
  return value === "plugin" || value === "library" || value === "integration";
}

function isFrameworkInstallModePreference(value: string): value is FrameworkInstallMode | "auto" {
  return value === "auto" || value === "copy" || value === "symlink";
}
