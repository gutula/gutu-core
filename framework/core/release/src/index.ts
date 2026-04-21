import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { z } from "zod";

export const releaseManifestSchema = z.object({
  schemaVersion: z.literal(1),
  package: z.string().min(1),
  version: z.string().min(1),
  createdAt: z.string().min(1),
  artifact: z.object({
    path: z.string().min(1),
    sha256: z.string().length(64),
    sizeBytes: z.number().int().nonnegative()
  })
});
export type ReleaseManifest = z.infer<typeof releaseManifestSchema>;

export const releaseProvenanceSchema = z.object({
  schemaVersion: z.literal(1),
  package: z.string().min(1),
  createdAt: z.string().min(1),
  artifact: z.object({
    path: z.string().min(1),
    sha256: z.string().length(64),
    sizeBytes: z.number().int().nonnegative()
  }),
  environment: z.object({
    platform: z.string().min(1),
    arch: z.string().min(1),
    node: z.string().min(1),
    bun: z.string().min(1)
  }),
  git: z.object({
    commit: z.string().optional(),
    branch: z.string().optional()
  })
});
export type ReleaseProvenance = z.infer<typeof releaseProvenanceSchema>;

export const releaseSignatureSchema = z.object({
  algorithm: z.literal("ed25519"),
  signature: z.string().min(1)
});
export type ReleaseSignature = z.infer<typeof releaseSignatureSchema>;

export type GitHubFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type PrepareReleaseBundleOptions = {
  outDir: string;
  artifactName?: string;
};

export type PrepareReleaseBundleResult = {
  artifactPath: string;
  manifestPath: string;
  provenancePath: string;
  manifest: ReleaseManifest;
  provenance: ReleaseProvenance;
};

export type PreparePackageReleaseBundleOptions = {
  packageRoot: string;
  outDir: string;
  artifactName?: string;
};

export type PreparePackageReleaseBundleResult = {
  artifactPath: string;
  manifestPath: string;
  provenancePath: string;
  manifest: ReleaseManifest;
  provenance: ReleaseProvenance;
  packageName: string;
  version: string;
};

export type PublishGitHubReleaseAsset = {
  path: string;
  name?: string;
  contentType?: string;
};

export type PublishGitHubReleaseOptions = {
  repo: string;
  tag: string;
  token: string;
  title?: string;
  prerelease?: boolean;
  notes?: string;
  apiBaseUrl?: string;
  fetchImpl?: GitHubFetch;
  assets: PublishGitHubReleaseAsset[];
};

export type PublishGitHubReleaseResult = {
  ok: true;
  repo: string;
  tag: string;
  created: boolean;
  htmlUrl: string;
  releaseId: number;
  assets: Array<{
    name: string;
    browserDownloadUrl: string;
  }>;
};

export function prepareReleaseBundle(projectRoot: string, options: PrepareReleaseBundleOptions): PrepareReleaseBundleResult {
  ensureTarAvailable();

  const packageJsonPath = join(projectRoot, "package.json");
  const packageJson = existsSync(packageJsonPath)
    ? JSON.parse(readFileSync(packageJsonPath, "utf8")) as { name?: string; version?: string }
    : {};
  const packageName = packageJson.name ?? "gutu-core";
  const version = packageJson.version ?? "0.0.1";

  const outDir = resolve(projectRoot, options.outDir);
  mkdirSync(outDir, { recursive: true });

  const artifactName = options.artifactName ?? `${sanitizeFileName(packageName)}-${version}.tgz`;
  const artifactPath = join(outDir, artifactName);
  const manifestPath = join(outDir, `${sanitizeFileName(packageName)}-release-manifest.json`);
  const provenancePath = join(outDir, `${sanitizeFileName(packageName)}-release-provenance.json`);

  const tar = spawnSync(
    "tar",
    [
      "-czf",
      artifactPath,
      "--exclude=.git",
      "--exclude=old_contents",
      "--exclude=node_modules",
      "--exclude=coverage",
      "--exclude=dist",
      "--exclude=artifacts",
      "-C",
      projectRoot,
      "."
    ],
    { encoding: "utf8" }
  );

  if (tar.status !== 0) {
    throw new Error(`Unable to prepare release bundle: ${tar.stderr || tar.stdout || "tar failed"}`);
  }

  const sha256 = computeFileSha256(artifactPath);
  const sizeBytes = statSync(artifactPath).size;
  const createdAt = new Date().toISOString();
  const relativeArtifactPath = relative(projectRoot, artifactPath) || artifactName;

  const manifest = releaseManifestSchema.parse({
    schemaVersion: 1,
    package: packageName,
    version,
    createdAt,
    artifact: {
      path: relativeArtifactPath,
      sha256,
      sizeBytes
    }
  });

  const provenance = releaseProvenanceSchema.parse({
    schemaVersion: 1,
    package: packageName,
    createdAt,
    artifact: manifest.artifact,
    environment: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      bun: Bun.version
    },
    git: {
      commit: readGitValue(projectRoot, ["rev-parse", "HEAD"]),
      branch: readGitValue(projectRoot, ["branch", "--show-current"])
    }
  });

  writeJson(manifestPath, manifest);
  writeJson(provenancePath, provenance);

  return {
    artifactPath,
    manifestPath,
    provenancePath,
    manifest,
    provenance
  };
}

export function preparePackageReleaseBundle(
  repoRoot: string,
  options: PreparePackageReleaseBundleOptions
): PreparePackageReleaseBundleResult {
  ensureNpmAvailable();

  const resolvedRepoRoot = resolve(repoRoot);
  const packageRoot = resolve(resolvedRepoRoot, options.packageRoot);
  const packageJsonPath = join(packageRoot, "package.json");
  if (!existsSync(packageJsonPath)) {
    throw new Error(`Unable to prepare package release bundle because '${packageJsonPath}' does not exist.`);
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { name?: string; version?: string };
  const packageName = packageJson.name;
  const version = packageJson.version;
  if (!packageName || !version) {
    throw new Error(`Package metadata at '${packageJsonPath}' must include name and version.`);
  }

  const outDir = resolve(resolvedRepoRoot, options.outDir);
  mkdirSync(outDir, { recursive: true });

  const packed = spawnSync(
    "npm",
    ["pack", "--json", "--pack-destination", outDir],
    {
      cwd: packageRoot,
      encoding: "utf8"
    }
  );
  if (packed.status !== 0) {
    throw new Error(`Unable to pack package release bundle: ${packed.stderr || packed.stdout || "npm pack failed"}`);
  }

  const metadata = JSON.parse(packed.stdout.trim()) as Array<{ filename?: string }>;
  const packedFilename = metadata[0]?.filename;
  if (!packedFilename) {
    throw new Error(`npm pack did not return a filename for '${packageName}'.`);
  }

  const artifactFilename = options.artifactName ?? packedFilename;
  const packedArtifactPath = join(outDir, packedFilename);
  const artifactPath = artifactFilename === packedFilename ? packedArtifactPath : join(outDir, artifactFilename);
  if (artifactPath !== packedArtifactPath) {
    const file = readFileSync(packedArtifactPath);
    writeFileSync(artifactPath, file);
  }

  const manifestPath = join(outDir, `${sanitizeFileName(packageName)}-release-manifest.json`);
  const provenancePath = join(outDir, `${sanitizeFileName(packageName)}-release-provenance.json`);
  const sha256 = computeFileSha256(artifactPath);
  const sizeBytes = statSync(artifactPath).size;
  const createdAt = new Date().toISOString();
  const artifactPathInManifest = basename(artifactPath);

  const manifest = releaseManifestSchema.parse({
    schemaVersion: 1,
    package: packageName,
    version,
    createdAt,
    artifact: {
      path: artifactPathInManifest,
      sha256,
      sizeBytes
    }
  });

  const provenance = releaseProvenanceSchema.parse({
    schemaVersion: 1,
    package: packageName,
    createdAt,
    artifact: manifest.artifact,
    environment: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      bun: Bun.version
    },
    git: {
      commit: readGitValue(resolvedRepoRoot, ["rev-parse", "HEAD"]),
      branch: readGitValue(resolvedRepoRoot, ["branch", "--show-current"])
    }
  });

  writeJson(manifestPath, manifest);
  writeJson(provenancePath, provenance);

  return {
    artifactPath,
    manifestPath,
    provenancePath,
    manifest,
    provenance,
    packageName,
    version
  };
}

export function signReleaseManifest(manifest: ReleaseManifest, privateKeyPem: string): ReleaseSignature {
  const key = createPrivateKey(privateKeyPem);
  return releaseSignatureSchema.parse({
    algorithm: "ed25519",
    signature: sign(null, Buffer.from(stableStringify(manifest), "utf8"), key).toString("base64")
  });
}

export function verifyReleaseManifestSignature(
  manifest: ReleaseManifest,
  signatureBase64: string,
  publicKeyPem: string
): boolean {
  const key = createPublicKey(publicKeyPem);
  return verify(null, Buffer.from(stableStringify(manifest), "utf8"), key, Buffer.from(signatureBase64, "base64"));
}

export function signReleaseManifestFile(
  manifestPath: string,
  privateKeyPem: string,
  outPath = `${manifestPath}.sig.json`
): { signaturePath: string; signature: ReleaseSignature } {
  const manifest = releaseManifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf8")));
  const signature = signReleaseManifest(manifest, privateKeyPem);
  writeJson(outPath, signature);
  return {
    signaturePath: outPath,
    signature
  };
}

export function verifyReleaseManifestFileSignature(
  manifestPath: string,
  signaturePath: string,
  publicKeyPem: string
): boolean {
  const manifest = releaseManifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf8")));
  const signature = releaseSignatureSchema.parse(JSON.parse(readFileSync(signaturePath, "utf8")));
  return verifyReleaseManifestSignature(manifest, signature.signature, publicKeyPem);
}

export async function publishGitHubRelease(options: PublishGitHubReleaseOptions): Promise<PublishGitHubReleaseResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiBaseUrl = (options.apiBaseUrl ?? "https://api.github.com").replace(/\/+$/, "");
  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${options.token}`,
    "user-agent": "gutu-core-release"
  };
  const tagEndpoint = `${apiBaseUrl}/repos/${options.repo}/releases/tags/${encodeURIComponent(options.tag)}`;

  let created = false;
  let release = await fetchRelease(fetchImpl, tagEndpoint, headers);
  if (!release) {
    const createdRelease = await fetchImpl(`${apiBaseUrl}/repos/${options.repo}/releases`, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        tag_name: options.tag,
        name: options.title ?? options.tag,
        prerelease: options.prerelease ?? false,
        draft: false,
        body: options.notes ?? ""
      })
    });
    const payload = (await createdRelease.json()) as GitHubReleasePayload;
    if (!createdRelease.ok) {
      throw new Error(`Unable to create GitHub release ${options.repo}@${options.tag}: ${createdRelease.status} ${payload.message ?? "unknown error"}`);
    }
    created = true;
    release = payload;
  }

  if (!release) {
    throw new Error(`Unable to resolve GitHub release ${options.repo}@${options.tag}.`);
  }

  const existingAssets = new Map((release.assets ?? []).map((asset) => [asset.name, asset]));
  for (const asset of options.assets) {
    const assetName = asset.name ?? basename(asset.path);
    const existingAsset = existingAssets.get(assetName);
    if (existingAsset) {
      const removeResponse = await fetchImpl(`${apiBaseUrl}/repos/${options.repo}/releases/assets/${existingAsset.id}`, {
        method: "DELETE",
        headers
      });
      if (!removeResponse.ok && removeResponse.status !== 404) {
        throw new Error(`Unable to replace release asset '${assetName}' for ${options.repo}@${options.tag}.`);
      }
    }
  }

  const uploadBaseUrl = release.upload_url?.replace(/\{.*$/, "");
  if (!uploadBaseUrl) {
    throw new Error(`GitHub release ${options.repo}@${options.tag} did not include an upload URL.`);
  }

  const publishedAssets: Array<{ name: string; browserDownloadUrl: string }> = [];
  for (const asset of options.assets) {
    const assetName = asset.name ?? basename(asset.path);
    const uploadResponse = await fetchImpl(`${uploadBaseUrl}?name=${encodeURIComponent(assetName)}`, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": asset.contentType ?? inferReleaseAssetContentType(assetName)
      },
      body: readFileSync(asset.path)
    });
    const payload = (await uploadResponse.json()) as GitHubReleaseAssetPayload;
    if (!uploadResponse.ok) {
      throw new Error(`Unable to upload release asset '${assetName}' for ${options.repo}@${options.tag}: ${uploadResponse.status} ${payload.message ?? "unknown error"}`);
    }
    publishedAssets.push({
      name: payload.name ?? assetName,
      browserDownloadUrl: payload.browser_download_url ?? `https://github.com/${options.repo}/releases/download/${options.tag}/${assetName}`
    });
  }

  return {
    ok: true,
    repo: options.repo,
    tag: options.tag,
    created,
    htmlUrl: release.html_url ?? `https://github.com/${options.repo}/releases/tag/${options.tag}`,
    releaseId: release.id,
    assets: publishedAssets
  };
}

export function computeFileSha256(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function ensureTarAvailable() {
  const result = spawnSync("tar", ["--version"], { stdio: "ignore" });
  if (result.status !== 0) {
    throw new Error("The 'tar' command is required for release bundling.");
  }
}

function ensureNpmAvailable() {
  const result = spawnSync("npm", ["--version"], { stdio: "ignore" });
  if (result.status !== 0) {
    throw new Error("The 'npm' command is required for package release bundling.");
  }
}

function readGitValue(cwd: string, args: string[]): string | undefined {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    return undefined;
  }
  const value = result.stdout.trim();
  return value.length > 0 ? value : undefined;
}

function sanitizeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function inferReleaseAssetContentType(fileName: string): string {
  if (fileName.endsWith(".tgz")) {
    return "application/gzip";
  }
  if (extname(fileName) === ".json") {
    return "application/json";
  }
  return "application/octet-stream";
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = sortValue((value as Record<string, unknown>)[key]);
        return accumulator;
      }, {});
  }

  return value;
}

function writeJson(filePath: string, value: unknown) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

type GitHubReleasePayload = {
  id: number;
  html_url?: string;
  upload_url?: string;
  assets?: GitHubReleaseAssetPayload[];
  message?: string;
};

type GitHubReleaseAssetPayload = {
  id: number;
  name?: string;
  browser_download_url?: string;
  message?: string;
};

async function fetchRelease(
  fetchImpl: GitHubFetch,
  url: string,
  headers: Record<string, string>
): Promise<GitHubReleasePayload | undefined> {
  const response = await fetchImpl(url, {
    method: "GET",
    headers
  });
  if (response.status === 404) {
    return undefined;
  }

  const payload = (await response.json()) as GitHubReleasePayload;
  if (!response.ok) {
    throw new Error(`Unable to query GitHub release: ${response.status} ${payload.message ?? "unknown error"}`);
  }
  return payload;
}
