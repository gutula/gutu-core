import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import * as nodePath from "node:path";
import { basename, dirname, join, resolve } from "node:path";
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { assertRepositoryBoundary, definePackageManifest, type PackageManifest } from "@gutu/kernel";
import {
  computeFileSha256,
  preparePackageReleaseBundle,
  publishGitHubRelease,
  signReleaseManifestFile,
  type GitHubFetch
} from "@gutu/release";

export const artifactDescriptorSchema = z
  .object({
    uri: z.string().min(1),
    format: z.enum(["tgz", "directory"]),
    sha256: z.string().length(64),
    signature: z.string().optional(),
    publicKeyPem: z.string().optional()
  })
  .superRefine((value, context) => {
    if (value.signature && !value.publicKeyPem) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Signed artifacts must include a publicKeyPem."
      });
    }
  });
export type ArtifactDescriptor = z.infer<typeof artifactDescriptorSchema>;

export const catalogEntrySchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["library", "plugin"]),
  repo: z.string().min(1),
  version: z.string().min(1),
  channel: z.string().min(1),
  artifact: artifactDescriptorSchema.optional()
});
export type CatalogEntry = z.infer<typeof catalogEntrySchema>;

export const compatibilityChannelSchema = z.object({
  id: z.string().min(1),
  packages: z.array(catalogEntrySchema)
});
export type CompatibilityChannel = z.infer<typeof compatibilityChannelSchema>;

export const workspaceProjectSchema = z.object({
  name: z.string().min(1),
  channel: z.string().min(1),
  coreRepo: z.string().min(1),
  frameworkPath: z.string().min(1).default("vendor/framework"),
  frameworkInstallMode: z.enum(["copy", "symlink"]).default("copy")
});
export type WorkspaceProject = z.infer<typeof workspaceProjectSchema>;

export const workspaceLockSchema = z.object({
  schemaVersion: z.literal(1),
  channel: z.string().min(1),
  core: z.object({
    package: z.literal("gutu-core"),
    version: z.string().min(1)
  }),
  libraries: z.array(catalogEntrySchema),
  plugins: z.array(catalogEntrySchema)
});
export type WorkspaceLock = z.infer<typeof workspaceLockSchema>;

export const workspaceOverridesSchema = z.object({
  packages: z.record(z.string(), z.string())
});
export type WorkspaceOverrides = z.infer<typeof workspaceOverridesSchema>;

export type FrameworkInstallMode = "copy" | "symlink";
export type ScaffoldWorkspaceOptions = {
  target: string;
  force?: boolean;
  channel?: string;
  frameworkInstallMode?: FrameworkInstallMode | "auto";
  frameworkSourceRoot?: string;
  platform?: NodeJS.Platform;
};

export type ScaffoldWorkspaceResult = {
  ok: true;
  projectRoot: string;
  createdFiles: string[];
  frameworkRoot: string;
  frameworkInstallMode: FrameworkInstallMode;
};

export type CoreDoctorResult = {
  ok: boolean;
  findings: string[];
};

export type VendorSyncResult = {
  ok: true;
  installed: Array<{
    id: string;
    targetPath: string;
    source: "artifact" | "override";
    sha256?: string;
  }>;
};

export type ExternalRepositoryKind = "plugin" | "library" | "integration";
export type ScaffoldExternalRepositoryOptions = {
  kind: ExternalRepositoryKind;
  name: string;
  outDir?: string;
};

export type ScaffoldExternalRepositoryResult = {
  ok: true;
  kind: ExternalRepositoryKind;
  repoRoot: string;
  files: string[];
};

export const rolloutRepositorySchema = z.object({
  name: z.string().min(1),
  kind: z.enum(["core", "catalog", "integration", "plugin", "library"]),
  description: z.string().min(1),
  visibility: z.enum(["public", "private"]).default("public")
});
export type RolloutRepository = z.infer<typeof rolloutRepositorySchema>;

export const rolloutOrganizationSchema = z.object({
  schemaVersion: z.literal(1),
  organization: z.string().min(1),
  repositories: z.array(rolloutRepositorySchema)
});
export type RolloutOrganization = z.infer<typeof rolloutOrganizationSchema>;

export type ScaffoldRolloutOptions = {
  manifestPath?: string;
  outDir: string;
};

export type ScaffoldRolloutResult = {
  ok: true;
  organization: string;
  repositories: Array<{
    name: string;
    kind: RolloutRepository["kind"];
    repoRoot: string;
  }>;
};

export type PromoteReleaseArtifactOptions = {
  packageId: string;
  kind: "library" | "plugin";
  repo: string;
  manifestPath: string;
  signaturePath?: string;
  signatureBase64?: string;
  publicKeyPem?: string;
  uriBase: string;
  channel?: string;
  catalogPath?: string;
  channelPath?: string;
};

export type PromoteReleaseArtifactResult = {
  ok: true;
  entry: CatalogEntry;
  catalogPath: string;
  channelPath: string;
};

export type ProvisionGitHubRepositoriesOptions = {
  owner?: string;
  manifestPath?: string;
  token?: string;
  apiBaseUrl?: string;
  fetchImpl?: GitHubFetch;
};

export type ProvisionGitHubRepositoriesResult = {
  ok: true;
  owner: string;
  repositories: Array<{
    name: string;
    kind: RolloutRepository["kind"];
    visibility: "public" | "private";
    created: boolean;
    url: string;
  }>;
};

export type FirstPartyPackageRecord = {
  id: string;
  kind: "library" | "plugin";
  repo: string;
  repoName: string;
  repoRoot: string;
  packageRoot: string;
  packageRelativePath: string;
  version: string;
  channel: string;
};

export type SyncCatalogRepositoriesOptions = {
  workspaceRoot?: string;
  librariesCatalogPath?: string;
  pluginsCatalogPath?: string;
};

export type SyncCatalogRepositoriesResult = {
  ok: true;
  workspaceRoot: string;
  librariesCatalogPath: string;
  pluginsCatalogPath: string;
  libraries: number;
  plugins: number;
};

export type PublishPackageReleaseOptions = {
  target: string;
  kind?: "library" | "plugin";
  channel?: string;
  workspaceRoot?: string;
  releaseToken: string;
  signingPrivateKeyPem: string;
  publicKeyPem?: string;
  tag?: string;
  apiBaseUrl?: string;
  fetchImpl?: GitHubFetch;
};

export type PublishPackageReleaseResult = {
  ok: true;
  workspaceRoot: string;
  packageId: string;
  kind: "library" | "plugin";
  repo: string;
  repoRoot: string;
  packageRoot: string;
  tag: string;
  releaseHtmlUrl: string;
  artifactUri: string;
  catalogPath: string;
  channelPath: string;
};

type PathApi = Pick<typeof nodePath, "dirname" | "join" | "resolve" | "relative" | "isAbsolute">;

const FRAMEWORK_INSTALL_PATH = "vendor/framework";
const FRAMEWORK_COPY_IGNORED_NAMES = new Set([".git", ".tmp", "artifacts", "coverage", "dist", "node_modules"]);

export function createWorkspaceProject(
  name: string,
  channel = "stable",
  frameworkInstallMode: FrameworkInstallMode = "copy"
): WorkspaceProject {
  return workspaceProjectSchema.parse({
    name,
    channel,
    coreRepo: "gutula/gutu-core",
    frameworkPath: FRAMEWORK_INSTALL_PATH,
    frameworkInstallMode
  });
}

export function createWorkspaceLock(channel = "stable"): WorkspaceLock {
  return workspaceLockSchema.parse({
    schemaVersion: 1,
    channel,
    core: {
      package: "gutu-core",
      version: "0.0.1"
    },
    libraries: [],
    plugins: []
  });
}

export function loadRolloutOrganization(cwd: string, manifestPath = join(cwd, "ecosystem", "rollout", "organization.json")): RolloutOrganization {
  return rolloutOrganizationSchema.parse(JSON.parse(readFileSync(manifestPath, "utf8")));
}

export function createWorkspaceOverrides(): WorkspaceOverrides {
  return workspaceOverridesSchema.parse({
    packages: {}
  });
}

export function resolveFrameworkWorkspaceRoot(cwd: string): string {
  const start = resolve(cwd);
  const candidates = [start];

  let current = start;
  for (let depth = 0; depth < 6; depth += 1) {
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    candidates.push(parent);
    current = parent;
  }

  for (const candidate of candidates) {
    if (looksLikeWorkspaceRoot(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Unable to resolve the Framework workspace root from '${cwd}'.`);
}

export function discoverFirstPartyPackages(
  cwd: string,
  options: {
    workspaceRoot?: string;
    kind?: "library" | "plugin";
  } = {}
): FirstPartyPackageRecord[] {
  const workspaceRoot = resolve(options.workspaceRoot ?? resolveFrameworkWorkspaceRoot(cwd));
  const roots: Array<{ kind: "library" | "plugin"; baseRoot: string; nestedSegments: string[] }> = [
    { kind: "library", baseRoot: join(workspaceRoot, "libraries"), nestedSegments: ["framework", "libraries"] },
    { kind: "plugin", baseRoot: join(workspaceRoot, "plugins"), nestedSegments: ["framework", "builtin-plugins"] }
  ];
  const results: FirstPartyPackageRecord[] = [];

  for (const root of roots) {
    if (options.kind && options.kind !== root.kind) {
      continue;
    }
    if (!existsSync(root.baseRoot)) {
      continue;
    }

    for (const repoName of readdirSync(root.baseRoot)) {
      const repoRoot = join(root.baseRoot, repoName);
      const nestedRoot = join(repoRoot, ...root.nestedSegments);
      if (!existsSync(nestedRoot)) {
        continue;
      }

      for (const packageFolder of readdirSync(nestedRoot)) {
        const packageRoot = join(nestedRoot, packageFolder);
        const packageJsonPath = join(packageRoot, "package.json");
        if (!existsSync(packageJsonPath)) {
          continue;
        }

        const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
          name?: string;
          version?: string;
        };
        if (!packageJson.name || !packageJson.version) {
          continue;
        }

        results.push({
          id: packageJson.name,
          kind: root.kind,
          repo: inferRepositorySlug(repoRoot, repoName),
          repoName,
          repoRoot,
          packageRoot,
          packageRelativePath: nodePath.relative(repoRoot, packageRoot),
          version: packageJson.version,
          channel: "stable"
        });
      }
    }
  }

  return results.sort((left, right) => left.id.localeCompare(right.id));
}

export function syncCatalogRepositories(
  cwd: string,
  options: SyncCatalogRepositoriesOptions = {}
): SyncCatalogRepositoriesResult {
  const workspaceRoot = resolve(options.workspaceRoot ?? resolveFrameworkWorkspaceRoot(cwd));
  const packages = discoverFirstPartyPackages(workspaceRoot, { workspaceRoot });
  const librariesCatalogPath = resolve(
    workspaceRoot,
    options.librariesCatalogPath ?? defaultCatalogFilePath(workspaceRoot, "library", "catalog", "index.json")
  );
  const pluginsCatalogPath = resolve(
    workspaceRoot,
    options.pluginsCatalogPath ?? defaultCatalogFilePath(workspaceRoot, "plugin", "catalog", "index.json")
  );

  const currentLibraries = readCatalogEntries(librariesCatalogPath);
  const currentPlugins = readCatalogEntries(pluginsCatalogPath);

  const nextLibraries = packages
    .filter((entry) => entry.kind === "library")
    .map((entry) => mergeCatalogEntry(entry, currentLibraries.get(entry.id)));
  const nextPlugins = packages
    .filter((entry) => entry.kind === "plugin")
    .map((entry) => mergeCatalogEntry(entry, currentPlugins.get(entry.id)));

  writeCatalogIndex(librariesCatalogPath, nextLibraries);
  writeCatalogIndex(pluginsCatalogPath, nextPlugins);

  ensureChannelFile(resolve(workspaceRoot, defaultCatalogFilePath(workspaceRoot, "library", "channels", "stable.json")), "stable");
  ensureChannelFile(resolve(workspaceRoot, defaultCatalogFilePath(workspaceRoot, "library", "channels", "next.json")), "next");
  ensureChannelFile(resolve(workspaceRoot, defaultCatalogFilePath(workspaceRoot, "plugin", "channels", "stable.json")), "stable");
  ensureChannelFile(resolve(workspaceRoot, defaultCatalogFilePath(workspaceRoot, "plugin", "channels", "next.json")), "next");

  return {
    ok: true,
    workspaceRoot,
    librariesCatalogPath,
    pluginsCatalogPath,
    libraries: nextLibraries.length,
    plugins: nextPlugins.length
  };
}

export function resolveFrameworkSourceRootFromModulePath(
  moduleFilePath: string,
  options: {
    pathApi?: PathApi;
    exists?: (path: string) => boolean;
  } = {}
): string {
  const pathApi = options.pathApi ?? nodePath;
  const exists = options.exists ?? existsSync;
  const moduleDir = pathApi.dirname(moduleFilePath);
  const candidates = [
    pathApi.resolve(moduleDir, "..", "..", "..", ".."),
    pathApi.resolve(moduleDir, ".."),
    pathApi.resolve(moduleDir, "..", ".."),
    pathApi.resolve(moduleDir, "..", "..", "..", "..", "..")
  ];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    if (seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    if (isFrameworkSourceRoot(candidate, { pathApi, exists })) {
      return candidate;
    }
  }

  throw new Error(`Unable to resolve the gutu-core framework source root from '${moduleFilePath}'.`);
}

export function resolveFrameworkInstallMode(
  requestedMode: FrameworkInstallMode | "auto" = "auto",
  options: {
    platform?: NodeJS.Platform;
    symlinkSafe?: boolean;
  } = {}
): FrameworkInstallMode {
  if (requestedMode === "copy" || requestedMode === "symlink") {
    return requestedMode;
  }

  if ((options.platform ?? process.platform) === "win32") {
    return "copy";
  }

  return options.symlinkSafe === false ? "copy" : "symlink";
}

export function scaffoldWorkspace(cwd: string, options: ScaffoldWorkspaceOptions): ScaffoldWorkspaceResult {
  const projectRoot = resolve(cwd, options.target);
  const channel = options.channel ?? "stable";

  if (existsSync(projectRoot)) {
    const entries = readdirSync(projectRoot);
    if (entries.length > 0 && !options.force) {
      throw new Error(`Target directory '${projectRoot}' already exists and is not empty.`);
    }
    if (entries.length > 0 && options.force) {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  }

  mkdirSync(projectRoot, { recursive: true });

  const frameworkSourceRoot = resolve(cwd, options.frameworkSourceRoot ?? resolveInstalledFrameworkSourceRoot());
  if (!isFrameworkSourceRoot(frameworkSourceRoot)) {
    throw new Error(`Unable to scaffold workspace because '${frameworkSourceRoot}' is not a valid gutu-core source root.`);
  }

  const platform = options.platform ?? process.platform;
  const frameworkInstallMode = resolveFrameworkInstallMode(options.frameworkInstallMode ?? "auto", {
    platform,
    symlinkSafe: canUseFrameworkSymlink(projectRoot, frameworkSourceRoot, platform)
  });
  const projectName = slugifyName(basename(projectRoot));
  const project = createWorkspaceProject(projectName, channel, frameworkInstallMode);
  const lock = createWorkspaceLock(channel);
  const overrides = createWorkspaceOverrides();
  const appName = `${projectName}-app`;

  const files: Record<string, string> = {
    "README.md": `# ${projectName}\n\nBootstrapped by gutu-core.\n`,
    "package.json": JSON.stringify(
      {
        name: projectName,
        private: true,
        type: "module",
        scripts: {
          doctor: "gutu doctor ."
        }
      },
      null,
      2
    ) + "\n",
    "gutu.project.json": JSON.stringify(project, null, 2) + "\n",
    "gutu.lock.json": JSON.stringify(lock, null, 2) + "\n",
    "gutu.overrides.json": JSON.stringify(overrides, null, 2) + "\n",
    "apps/.gitkeep": "",
    [`apps/${appName}/README.md`]: `# ${appName}\n\nPlace the consumer application here.\n`,
    "vendor/libraries/.gitkeep": "",
    "vendor/plugins/.gitkeep": "",
    ".gutu/cache/.gitkeep": "",
    ".gutu/state/.gitkeep": ""
  };

  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = join(projectRoot, relativePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, contents, "utf8");
  }

  const frameworkRoot = join(projectRoot, "vendor", "framework");
  installFrameworkRoot(frameworkSourceRoot, frameworkRoot, frameworkInstallMode, {
    platform,
    excludedSourceRoots: [projectRoot]
  });

  return {
    ok: true,
    projectRoot,
    createdFiles: Object.keys(files).sort(),
    frameworkRoot,
    frameworkInstallMode
  };
}

export function doctorCoreRepository(cwd: string): CoreDoctorResult {
  const findings: string[] = [];
  const packageJsonPath = join(cwd, "package.json");

  if (existsSync(join(cwd, "framework", "builtin-plugins"))) {
    findings.push("Found forbidden directory: framework/builtin-plugins");
  }

  if (existsSync(join(cwd, "plugins"))) {
    findings.push("Found forbidden root directory: plugins");
  }

  if (existsSync(join(cwd, "apps"))) {
    findings.push("Found forbidden root directory: apps");
  }

  if (existsSync(packageJsonPath)) {
    const rootPackageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { workspaces?: string[] };
    const workspaces = rootPackageJson.workspaces ?? [];
    if (workspaces.some((entry) => entry.includes("builtin-plugins") || entry === "apps/*" || entry === "plugins/*")) {
      findings.push("Root workspaces reference forbidden plugin or app source globs.");
    }
  }

  const manifests: PackageManifest[] = [
    definePackageManifest({
      id: "@gutu/kernel",
      kind: "core",
      version: "0.0.1",
      description: "Kernel contracts."
    }),
    definePackageManifest({
      id: "@gutu/ecosystem",
      kind: "core",
      version: "0.0.1",
      description: "Ecosystem contracts."
    }),
    definePackageManifest({
      id: "@gutu/cli",
      kind: "core",
      version: "0.0.1",
      description: "CLI package."
    })
  ];

  const boundary = assertRepositoryBoundary("core", manifests);
  if (!boundary.ok) {
    findings.push("Core repository manifest boundary check failed.");
  }

  const requiredMetadataFiles = [
    join(cwd, "ecosystem", "catalog", "libraries.json"),
    join(cwd, "ecosystem", "catalog", "plugins.json"),
    join(cwd, "ecosystem", "channels", "stable.json"),
    join(cwd, "ecosystem", "channels", "next.json"),
    join(cwd, "ecosystem", "rollout", "organization.json")
  ];

  for (const file of requiredMetadataFiles) {
    if (!existsSync(file)) {
      findings.push(`Missing ecosystem metadata file: ${file}`);
    }
  }

  if (!hasTar()) {
    findings.push("Missing required system dependency: tar");
  }

  return {
    ok: findings.length === 0,
    findings
  };
}

export async function syncWorkspaceVendor(workspaceRoot: string): Promise<VendorSyncResult> {
  const projectPath = join(workspaceRoot, "gutu.project.json");
  const lockPath = join(workspaceRoot, "gutu.lock.json");
  const overridesPath = join(workspaceRoot, "gutu.overrides.json");

  const project = workspaceProjectSchema.parse(JSON.parse(readFileSync(projectPath, "utf8")));
  const lock = workspaceLockSchema.parse(JSON.parse(readFileSync(lockPath, "utf8")));
  const overrides = workspaceOverridesSchema.parse(JSON.parse(readFileSync(overridesPath, "utf8")));

  mkdirSync(join(workspaceRoot, ".gutu", "cache"), { recursive: true });
  mkdirSync(join(workspaceRoot, ".gutu", "state"), { recursive: true });
  mkdirSync(join(workspaceRoot, "vendor", "libraries"), { recursive: true });
  mkdirSync(join(workspaceRoot, "vendor", "plugins"), { recursive: true });

  const installed = [
    ...(await installEntries(workspaceRoot, lock.libraries, overrides, "libraries")),
    ...(await installEntries(workspaceRoot, lock.plugins, overrides, "plugins"))
  ];

  writeFileSync(
    join(workspaceRoot, ".gutu", "state", "vendor-installs.json"),
    JSON.stringify(
      {
        workspace: project.name,
        installedAt: new Date().toISOString(),
        installed
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  return {
    ok: true,
    installed
  };
}

export function scaffoldExternalRepository(
  cwd: string,
  options: ScaffoldExternalRepositoryOptions
): ScaffoldExternalRepositoryResult {
  const repoRoot = resolve(options.outDir ?? defaultExternalRepositoryPath(cwd, options.name));
  mkdirSync(repoRoot, { recursive: true });

  const files = createExternalRepositoryFiles(options.kind, options.name);
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = join(repoRoot, relativePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, contents, "utf8");
  }

  return {
    ok: true,
    kind: options.kind,
    repoRoot,
    files: Object.keys(files).sort()
  };
}

export function scaffoldRolloutRepositories(
  cwd: string,
  options: ScaffoldRolloutOptions
): ScaffoldRolloutResult {
  const rollout = loadRolloutOrganization(cwd, options.manifestPath ? resolve(cwd, options.manifestPath) : undefined);
  const outDir = resolve(cwd, options.outDir);
  mkdirSync(outDir, { recursive: true });

  const repositories = rollout.repositories.map((repository) => {
    const repoRoot = join(outDir, repository.name);

    if (repository.kind === "integration") {
      scaffoldExternalRepository(cwd, {
        kind: "integration",
        name: repository.name,
        outDir: repoRoot
      });
    } else if (repository.kind === "plugin" || repository.kind === "library") {
      scaffoldExternalRepository(cwd, {
        kind: repository.kind,
        name: repository.name,
        outDir: repoRoot
      });
    } else {
      scaffoldManagedRepository(repoRoot, repository);
    }

    return {
      name: repository.name,
      kind: repository.kind,
      repoRoot
    };
  });

  return {
    ok: true,
    organization: rollout.organization,
    repositories
  };
}

export async function provisionGitHubRepositories(
  cwd: string,
  options: ProvisionGitHubRepositoriesOptions = {}
): Promise<ProvisionGitHubRepositoriesResult> {
  const rollout = loadRolloutOrganization(cwd, options.manifestPath ? resolve(cwd, options.manifestPath) : undefined);
  const owner = options.owner ?? rollout.organization;
  const token = options.token ?? process.env.GITHUB_TOKEN;

  if (!token) {
    throw new Error("Missing GITHUB_TOKEN for GitHub repository provisioning.");
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const apiBaseUrl = options.apiBaseUrl ?? "https://api.github.com";
  const repositories: ProvisionGitHubRepositoriesResult["repositories"] = [];

  for (const repository of rollout.repositories) {
    const response = await fetchImpl(`${apiBaseUrl.replace(/\/+$/, "")}/orgs/${owner}/repos`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/vnd.github+json",
        "user-agent": "gutu-core-rollout"
      },
      body: JSON.stringify({
        name: repository.name,
        description: repository.description,
        private: repository.visibility === "private",
        has_issues: true,
        has_projects: false,
        has_wiki: false,
        auto_init: false
      })
    });

    const payload = (await response.json()) as { html_url?: string; message?: string };
    if (!response.ok && response.status !== 422) {
      throw new Error(`GitHub provisioning failed for ${repository.name}: ${response.status} ${payload.message ?? "unknown error"}`);
    }

    repositories.push({
      name: repository.name,
      kind: repository.kind,
      visibility: repository.visibility,
      created: response.status !== 422,
      url: payload.html_url ?? `https://github.com/${owner}/${repository.name}`
    });
  }

  return {
    ok: true,
    owner,
    repositories
  };
}

export async function publishPackageRelease(
  cwd: string,
  options: PublishPackageReleaseOptions
): Promise<PublishPackageReleaseResult> {
  const workspaceRoot = resolvePublishWorkspaceRoot(cwd, options.workspaceRoot);
  const syncedCatalogs = syncCatalogRepositories(workspaceRoot, { workspaceRoot });
  const packageRecord = resolvePackagePublishTarget(workspaceRoot, options.target, options.kind);
  const publishWorkspaceRoot = join(workspaceRoot, ".tmp", "release-publish", packageRecord.repoName);

  preparePublishWorkspace(workspaceRoot, publishWorkspaceRoot);

  const packageRepoRoot = join(publishWorkspaceRoot, nodePath.relative(workspaceRoot, packageRecord.repoRoot));
  const build = spawnSync("bun", ["run", "build"], {
    cwd: packageRepoRoot,
    encoding: "utf8"
  });
  if (build.status !== 0) {
    throw new Error(`Unable to build ${packageRecord.id}: ${build.stderr || build.stdout || "bun run build failed"}`);
  }

  const bundle = preparePackageReleaseBundle(packageRepoRoot, {
    packageRoot: packageRecord.packageRelativePath,
    outDir: join(packageRepoRoot, "artifacts", "release")
  });
  const signature = signReleaseManifestFile(bundle.manifestPath, options.signingPrivateKeyPem);
  const artifactSignatureBase64 = signArtifactDigest(bundle.manifest.artifact.sha256, options.signingPrivateKeyPem);
  const tag = options.tag ?? `v${bundle.version}`;
  const release = await publishGitHubRelease({
    repo: packageRecord.repo,
    tag,
    token: options.releaseToken,
    ...(options.apiBaseUrl ? { apiBaseUrl: options.apiBaseUrl } : {}),
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    assets: [
      { path: bundle.artifactPath },
      { path: bundle.manifestPath },
      { path: bundle.provenancePath },
      { path: signature.signaturePath }
    ]
  });
  const publicKeyPem =
    options.publicKeyPem ??
    createPublicKey(options.signingPrivateKeyPem).export({ type: "spki", format: "pem" }).toString();
  const promotion = promoteReleaseArtifact(workspaceRoot, {
    packageId: packageRecord.id,
    kind: packageRecord.kind,
    repo: packageRecord.repo,
    manifestPath: bundle.manifestPath,
    signatureBase64: artifactSignatureBase64,
    publicKeyPem,
    uriBase: `https://github.com/${packageRecord.repo}/releases/download/${tag}`,
    channel: options.channel ?? packageRecord.channel,
    ...(packageRecord.kind === "library"
      ? { catalogPath: syncedCatalogs.librariesCatalogPath }
      : { catalogPath: syncedCatalogs.pluginsCatalogPath })
  });
  commitCatalogPromotion(
    dirname(dirname(promotion.catalogPath)),
    [promotion.catalogPath, promotion.channelPath],
    `chore: promote ${packageRecord.id} ${tag} to ${options.channel ?? packageRecord.channel}`
  );

  return {
    ok: true,
    workspaceRoot,
    packageId: packageRecord.id,
    kind: packageRecord.kind,
    repo: packageRecord.repo,
    repoRoot: packageRecord.repoRoot,
    packageRoot: packageRecord.packageRoot,
    tag,
    releaseHtmlUrl: release.htmlUrl,
    artifactUri: promotion.entry.artifact?.uri ?? `https://github.com/${packageRecord.repo}/releases/download/${tag}/${bundle.manifest.artifact.path}`,
    catalogPath: promotion.catalogPath,
    channelPath: promotion.channelPath
  };
}

export function promoteReleaseArtifact(
  cwd: string,
  options: PromoteReleaseArtifactOptions
): PromoteReleaseArtifactResult {
  const channel = options.channel ?? "stable";
  const workspaceRoot = tryResolveFrameworkWorkspaceRoot(cwd) ?? resolve(cwd);
  const manifest = JSON.parse(readFileSync(resolve(cwd, options.manifestPath), "utf8")) as {
    artifact: { path: string; sha256: string };
    version: string;
  };
  const signature =
    options.signatureBase64
      ? { signature: options.signatureBase64 }
      : options.signaturePath
        ? JSON.parse(readFileSync(resolve(cwd, options.signaturePath), "utf8")) as { signature: string }
        : undefined;
  const entry = catalogEntrySchema.parse({
    id: options.packageId,
    kind: options.kind,
    repo: options.repo,
    version: manifest.version,
    channel,
    artifact: {
      uri: joinUrl(options.uriBase, manifest.artifact.path),
      format: "tgz",
      sha256: manifest.artifact.sha256,
      ...(signature ? { signature: signature.signature } : {}),
      ...(options.publicKeyPem ? { publicKeyPem: options.publicKeyPem } : {})
    }
  });

  const catalogPath =
    resolve(
      workspaceRoot,
      options.catalogPath ??
        defaultCatalogFilePath(workspaceRoot, options.kind, "catalog", "index.json")
    );
  const channelPath = resolve(
    workspaceRoot,
    options.channelPath ?? defaultCatalogFilePath(workspaceRoot, options.kind, "channels", `${channel}.json`)
  );

  upsertCatalogEntry(catalogPath, entry);
  upsertChannelEntry(channelPath, channel, entry);

  return {
    ok: true,
    entry,
    catalogPath,
    channelPath
  };
}

function tryResolveFrameworkWorkspaceRoot(cwd: string): string | undefined {
  try {
    return resolveFrameworkWorkspaceRoot(cwd);
  } catch {
    return undefined;
  }
}

function looksLikeWorkspaceRoot(candidate: string): boolean {
  return (
    existsSync(join(candidate, "gutu-core", "package.json")) &&
    existsSync(join(candidate, "plugins")) &&
    existsSync(join(candidate, "libraries")) &&
    existsSync(join(candidate, "catalogs")) &&
    existsSync(join(candidate, "integrations"))
  );
}

function defaultCatalogFilePath(
  workspaceRoot: string,
  kind: "library" | "plugin",
  ...segments: string[]
): string {
  const catalogRepoRoot = join(
    workspaceRoot,
    "catalogs",
    kind === "plugin" ? "gutu-plugins" : "gutu-libraries"
  );
  if (existsSync(catalogRepoRoot)) {
    return join("catalogs", kind === "plugin" ? "gutu-plugins" : "gutu-libraries", ...segments);
  }

  if (segments[0] === "catalog") {
    return join("ecosystem", "catalog", kind === "plugin" ? "plugins.json" : "libraries.json");
  }

  return join("ecosystem", "channels", segments.at(-1) as string);
}

function readCatalogEntries(catalogPath: string): Map<string, CatalogEntry> {
  if (!existsSync(catalogPath)) {
    return new Map();
  }

  const payload = JSON.parse(readFileSync(catalogPath, "utf8")) as { packages?: CatalogEntry[] };
  return new Map((payload.packages ?? []).map((entry) => [entry.id, catalogEntrySchema.parse(entry)]));
}

function mergeCatalogEntry(record: FirstPartyPackageRecord, current?: CatalogEntry): CatalogEntry {
  return catalogEntrySchema.parse({
    id: record.id,
    kind: record.kind,
    repo: record.repo,
    version: record.version,
    channel: current?.channel ?? record.channel,
    ...(current?.artifact ? { artifact: current.artifact } : {})
  });
}

function writeCatalogIndex(catalogPath: string, packages: CatalogEntry[]) {
  writeJsonFile(catalogPath, {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    packages: [...packages].sort((left, right) => left.id.localeCompare(right.id))
  });
}

function ensureChannelFile(channelPath: string, channelId: string) {
  const current = existsSync(channelPath)
    ? (JSON.parse(readFileSync(channelPath, "utf8")) as { packages?: CatalogEntry[] })
    : { packages: [] };

  writeJsonFile(channelPath, {
    schemaVersion: 1,
    id: channelId,
    packages: [...(current.packages ?? [])].sort((left, right) => left.id.localeCompare(right.id))
  });
}

function inferRepositorySlug(repoRoot: string, repoName: string): string {
  const remote = readGitRemote(repoRoot);
  if (!remote) {
    return `gutula/${repoName}`;
  }

  const sshMatch = remote.match(/github\.com:(.+?)(?:\.git)?$/);
  if (sshMatch?.[1]) {
    return sshMatch[1];
  }

  const httpsMatch = remote.match(/github\.com\/(.+?)(?:\.git)?$/);
  if (httpsMatch?.[1]) {
    return httpsMatch[1];
  }

  return `gutula/${repoName}`;
}

function readGitRemote(repoRoot: string): string | undefined {
  const remote = spawnSync("git", ["remote", "get-url", "origin"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  if (remote.status !== 0) {
    return undefined;
  }
  const value = remote.stdout.trim();
  return value.length > 0 ? value : undefined;
}

function resolvePackagePublishTarget(
  workspaceRoot: string,
  target: string,
  kind?: "library" | "plugin"
): FirstPartyPackageRecord {
  const matches = discoverFirstPartyPackages(workspaceRoot, {
    workspaceRoot,
    ...(kind ? { kind } : {})
  }).filter((entry) => {
    const normalizedTarget = resolve(workspaceRoot, target);
    return (
      entry.id === target ||
      entry.repo === target ||
      entry.repoName === target ||
      entry.repoRoot === normalizedTarget ||
      entry.packageRoot === normalizedTarget
    );
  });

  if (matches.length === 0) {
    throw new Error(`Unable to resolve package publish target '${target}'.`);
  }

  return matches[0] as FirstPartyPackageRecord;
}

function resolvePublishWorkspaceRoot(cwd: string, requestedWorkspaceRoot?: string): string {
  if (requestedWorkspaceRoot) {
    return resolve(requestedWorkspaceRoot);
  }

  const localWorkspaceRoot = tryResolveFrameworkWorkspaceRoot(cwd);
  if (localWorkspaceRoot) {
    return localWorkspaceRoot;
  }

  const currentRoot = resolve(cwd);
  const topologyManifestPath = resolveLiveTopologyManifestPath(currentRoot);
  if (!topologyManifestPath) {
    throw new Error(
      "Unable to resolve a publish workspace root. Run from the umbrella Framework workspace, pass --workspace-root, or provide ecosystem/rollout/live-topology.json."
    );
  }

  const stagedWorkspaceRoot = join(currentRoot, ".tmp", "publish-source");
  stageWorkspaceFromTopology(stagedWorkspaceRoot, topologyManifestPath);
  return stagedWorkspaceRoot;
}

function resolveLiveTopologyManifestPath(cwd: string): string | undefined {
  const candidates = [
    join(cwd, "ecosystem", "rollout", "live-topology.json"),
    join(cwd, "gutu-core", "ecosystem", "rollout", "live-topology.json")
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function stageWorkspaceFromTopology(targetRoot: string, manifestPath: string) {
  const payload = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    repositories?: Array<{ path?: string; url?: string; branch?: string }>;
  };
  const repositories = payload.repositories ?? [];
  if (repositories.length === 0) {
    throw new Error(`Live topology manifest '${manifestPath}' does not list any repositories.`);
  }

  rmSync(targetRoot, { recursive: true, force: true });
  mkdirSync(targetRoot, { recursive: true });

  for (const repository of repositories) {
    if (!repository.path || !repository.url) {
      continue;
    }

    const destination = join(targetRoot, repository.path);
    mkdirSync(dirname(destination), { recursive: true });
    const clone = spawnSync(
      "git",
      ["clone", "--depth", "1", "--branch", repository.branch ?? "main", repository.url, destination],
      { encoding: "utf8" }
    );
    if (clone.status !== 0) {
      throw new Error(`Unable to clone ${repository.url}: ${clone.stderr || clone.stdout || "git clone failed"}`);
    }
  }
}

function commitCatalogPromotion(repoRoot: string, files: string[], message: string) {
  const gitRoot = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  if (gitRoot.status !== 0 || gitRoot.stdout.trim() !== "true") {
    return;
  }

  const relativeFiles = files.map((filePath) => nodePath.relative(repoRoot, filePath));
  const add = spawnSync("git", ["add", ...relativeFiles], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  if (add.status !== 0) {
    throw new Error(`Unable to stage catalog promotion in ${repoRoot}: ${add.stderr || add.stdout || "git add failed"}`);
  }

  const diff = spawnSync("git", ["diff", "--cached", "--quiet"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  if (diff.status === 0) {
    return;
  }

  const commit = spawnSync("git", ["commit", "-m", message], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  if (commit.status !== 0) {
    throw new Error(`Unable to commit catalog promotion in ${repoRoot}: ${commit.stderr || commit.stdout || "git commit failed"}`);
  }

  const push = spawnSync("git", ["push", "origin", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  if (push.status !== 0) {
    throw new Error(`Unable to push catalog promotion in ${repoRoot}: ${push.stderr || push.stdout || "git push failed"}`);
  }
}

function preparePublishWorkspace(workspaceRoot: string, targetRoot: string) {
  rmSync(targetRoot, { recursive: true, force: true });
  mkdirSync(targetRoot, { recursive: true });

  for (const relativeRoot of ["gutu-core", "libraries", "plugins"] as const) {
    copyPublishTree(join(workspaceRoot, relativeRoot), join(targetRoot, relativeRoot));
  }

  writeFileSync(
    join(targetRoot, "package.json"),
    JSON.stringify(
      {
        name: "gutu-publish-workspace",
        private: true,
        type: "module",
        workspaces: [
          "gutu-core/framework/core/*",
          "libraries/*/framework/libraries/*",
          "plugins/*/framework/builtin-plugins/*"
        ],
        devDependencies: {
          "@eslint/js": "^9.25.1",
          "@types/react": "^19.2.2",
          "@types/react-dom": "^19.2.2",
          "bun-types": "^1.3.12",
          "eslint": "^9.25.1",
          "globals": "^16.0.0",
          "playwright": "^1.55.0",
          "react": "^19.1.0",
          "react-dom": "^19.1.0",
          "typescript": "5.8.3",
          "typescript-eslint": "^8.30.1",
          "zod": "^3.24.3"
        }
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  const install = spawnSync("bun", ["install"], {
    cwd: targetRoot,
    encoding: "utf8"
  });
  if (install.status !== 0) {
    throw new Error(`Unable to install the publish workspace: ${install.stderr || install.stdout || "bun install failed"}`);
  }
}

function copyPublishTree(source: string, destination: string) {
  if (!existsSync(source)) {
    return;
  }

  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination, {
    recursive: true,
    filter(entry) {
      const name = basename(entry);
      return ![".git", ".tmp", "artifacts", "coverage", "dist", "node_modules"].includes(name);
    }
  });
}

function slugifyName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "gutu-workspace";
}

function resolveInstalledFrameworkSourceRoot(): string {
  return resolveFrameworkSourceRootFromModulePath(fileURLToPath(import.meta.url));
}

function isFrameworkSourceRoot(
  candidateRoot: string,
  options: {
    pathApi?: Pick<typeof nodePath, "join">;
    exists?: (path: string) => boolean;
  } = {}
): boolean {
  const pathApi = options.pathApi ?? nodePath;
  const exists = options.exists ?? existsSync;
  return (
    exists(pathApi.join(candidateRoot, "package.json")) &&
    exists(pathApi.join(candidateRoot, "framework", "core", "cli")) &&
    exists(pathApi.join(candidateRoot, "framework", "core", "ecosystem"))
  );
}

function canUseFrameworkSymlink(projectRoot: string, frameworkSourceRoot: string, platform: NodeJS.Platform): boolean {
  if (platform === "win32") {
    return false;
  }

  const probeRoot = join(projectRoot, ".gutu", "state");
  const probePath = join(probeRoot, `.framework-link-probe-${process.pid}-${Date.now()}`);
  mkdirSync(probeRoot, { recursive: true });

  try {
    symlinkSync(frameworkSourceRoot, probePath, symlinkTypeForPlatform(platform));
    return true;
  } catch {
    return false;
  } finally {
    rmSync(probePath, { recursive: true, force: true });
  }
}

function installFrameworkRoot(
  sourceRoot: string,
  targetRoot: string,
  mode: FrameworkInstallMode,
  options: {
    platform: NodeJS.Platform;
    excludedSourceRoots?: string[];
  }
) {
  rmSync(targetRoot, { recursive: true, force: true });
  mkdirSync(dirname(targetRoot), { recursive: true });

  if (mode === "symlink") {
    symlinkSync(sourceRoot, targetRoot, symlinkTypeForPlatform(options.platform));
    return;
  }

  mkdirSync(targetRoot, { recursive: true });
  const excludedSourceRoots = (options.excludedSourceRoots ?? []).map((entry) => resolve(entry));

  for (const entry of readdirSync(sourceRoot)) {
    const sourceEntry = join(sourceRoot, entry);
    if (!shouldCopyFrameworkPath(sourceEntry, excludedSourceRoots)) {
      continue;
    }

    cpSync(sourceEntry, join(targetRoot, entry), {
      recursive: true,
      filter(candidate) {
        return shouldCopyFrameworkPath(candidate, excludedSourceRoots);
      }
    });
  }
}

function shouldCopyFrameworkPath(sourcePath: string, excludedSourceRoots: readonly string[]): boolean {
  if (FRAMEWORK_COPY_IGNORED_NAMES.has(basename(sourcePath))) {
    return false;
  }

  return excludedSourceRoots.every((excludedRoot) => !isPathInside(sourcePath, excludedRoot));
}

function isPathInside(candidatePath: string, parentPath: string): boolean {
  const relativePath = nodePath.relative(resolve(parentPath), resolve(candidatePath));
  return relativePath === "" || (!relativePath.startsWith("..") && !nodePath.isAbsolute(relativePath));
}

function symlinkTypeForPlatform(platform: NodeJS.Platform): "dir" | "junction" {
  return platform === "win32" ? "junction" : "dir";
}

async function installEntries(
  workspaceRoot: string,
  entries: readonly CatalogEntry[],
  overrides: WorkspaceOverrides,
  bucket: "libraries" | "plugins"
): Promise<Array<{ id: string; targetPath: string; source: "artifact" | "override"; sha256?: string }>> {
  const installed: Array<{ id: string; targetPath: string; source: "artifact" | "override"; sha256?: string }> = [];

  for (const entry of entries) {
    const targetPath = join(workspaceRoot, "vendor", bucket, vendorDirectoryName(entry.id));
    rmSync(targetPath, { recursive: true, force: true });
    mkdirSync(targetPath, { recursive: true });

    const overridePath = overrides.packages[entry.id];
    if (overridePath) {
      cpSync(resolve(workspaceRoot, overridePath), targetPath, { recursive: true });
      installed.push({
        id: entry.id,
        targetPath,
        source: "override" as const
      });
      continue;
    }

    if (!entry.artifact) {
      throw new Error(`Missing artifact metadata for ${entry.id}.`);
    }

    const artifactPath = await materializeArtifact(join(workspaceRoot, ".gutu", "cache"), entry.id, entry.artifact);
    const actualSha256 = computeFileSha256(artifactPath);
    if (actualSha256 !== entry.artifact.sha256) {
      throw new Error(`Digest mismatch for ${entry.id}. Expected ${entry.artifact.sha256} but received ${actualSha256}.`);
    }

    if (entry.artifact.signature && entry.artifact.publicKeyPem) {
      const publicKey = createPublicKey(entry.artifact.publicKeyPem);
      const verified = verify(
        null,
        Buffer.from(actualSha256, "utf8"),
        publicKey,
        Buffer.from(entry.artifact.signature, "base64")
      );
      if (!verified) {
        throw new Error(`Signature verification failed for ${entry.id}.`);
      }
    }

    if (entry.artifact.format === "directory") {
      cpSync(artifactPath, targetPath, { recursive: true });
    } else {
      const extracted = spawnSync("tar", ["-xzf", artifactPath, "-C", targetPath], { encoding: "utf8" });
      if (extracted.status !== 0) {
        throw new Error(`Unable to extract artifact for ${entry.id}: ${extracted.stderr || extracted.stdout || "tar failed"}`);
      }
      collapseExtractedPackageRoot(targetPath);
    }

    installed.push({
      id: entry.id,
      targetPath,
      source: "artifact" as const,
      sha256: actualSha256
    });
  }

  return installed;
}

function collapseExtractedPackageRoot(targetPath: string) {
  const packageRoot = join(targetPath, "package");
  if (!existsSync(packageRoot)) {
    return;
  }

  for (const entry of readdirSync(packageRoot)) {
    cpSync(join(packageRoot, entry), join(targetPath, entry), { recursive: true });
  }
  rmSync(packageRoot, { recursive: true, force: true });
}

async function materializeArtifact(cacheRoot: string, packageId: string, artifact: ArtifactDescriptor): Promise<string> {
  mkdirSync(cacheRoot, { recursive: true });

  const cachePath =
    artifact.format === "directory"
      ? resolveArtifactUri(artifact.uri)
      : join(cacheRoot, `${vendorDirectoryName(packageId)}-${artifact.sha256}.tgz`);

  if (artifact.format === "directory") {
    return cachePath;
  }

  if (existsSync(cachePath) && computeFileSha256(cachePath) === artifact.sha256) {
    return cachePath;
  }

  if (/^https?:\/\//.test(artifact.uri)) {
    const response = await fetch(artifact.uri, { redirect: "follow" });
    if (!response.ok) {
      throw new Error(`Unable to download artifact ${artifact.uri}: ${response.status} ${response.statusText}`);
    }

    const body = Buffer.from(await response.arrayBuffer());
    writeFileSync(cachePath, body);
    return cachePath;
  }

  const sourcePath = resolveArtifactUri(artifact.uri);
  cpSync(sourcePath, cachePath);
  return cachePath;
}

function resolveArtifactUri(uri: string): string {
  if (uri.startsWith("file://")) {
    return fileURLToPath(uri);
  }

  return resolve(uri);
}

function vendorDirectoryName(packageId: string): string {
  const normalized = packageId.replace(/\\/g, "/").split("/").filter(Boolean);
  const leaf = normalized.at(-1) ?? packageId;
  return leaf.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function hasTar(): boolean {
  return spawnSync("tar", ["--version"], { stdio: "ignore" }).status === 0;
}

function createExternalRepositoryFiles(kind: ExternalRepositoryKind, name: string): Record<string, string> {
  const packageSlug = name.replace(/^gutu-(plugin|lib)-/, "");
  const displayKind = kind === "integration" ? "integration" : `${kind} repository`;
  const packageName =
    kind === "plugin" ? `@gutula/${packageSlug}` : kind === "library" ? `@gutula/${packageSlug}` : name;

  const files: Record<string, string> = {
    ".gitignore": "node_modules/\ndist/\ncoverage/\n",
    ".github/workflows/ci.yml": `name: CI\n\non:\n  push:\n  pull_request:\n\njobs:\n  verify:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: oven-sh/setup-bun@v2\n        with:\n          bun-version: "1.3.12"\n      - run: bun install --frozen-lockfile\n      - run: bun test\n`,
    "README.md": `# ${name}\n\nThis is a standalone ${displayKind} scaffold generated by gutu-core.\n\nIt is intended to live outside the core repository as part of the wider Gutu ecosystem${kind === "integration" ? " and coordinate cross-repo verification." : "."}\n`,
    "package.json": JSON.stringify(
      {
        name: packageName,
        private: true,
        type: "module",
        version: "0.0.1",
        scripts: {
          test: "bun test"
        }
      },
      null,
      2
    ) + "\n",
    "CHANGELOG.md": "# Changelog\n\n## 0.0.1\n\n- Initial scaffold.\n",
    "SECURITY.md": "# Security Policy\n\nReport security issues privately to the maintainers.\n",
    "CONTRIBUTING.md": "# Contributing\n\nKeep this repository focused on its single role.\n"
  };

  if (kind === "integration") {
    files["matrix/README.md"] =
      "# Integration Matrix\n\nTrack the tested gutu-core, plugin, and library combinations here.\n";
  } else {
    files["src/index.ts"] =
      kind === "plugin"
        ? `export const pluginId = "${name}";\n`
        : `export const libraryId = "${name}";\n`;
    files["tests/unit/package.test.ts"] =
      kind === "plugin"
        ? `import { describe, expect, it } from "bun:test";\n\nimport { pluginId } from "../../src/index";\n\ndescribe("${name}", () => {\n  it("exposes a stable plugin id", () => {\n    expect(pluginId).toBe("${name}");\n  });\n});\n`
        : `import { describe, expect, it } from "bun:test";\n\nimport { libraryId } from "../../src/index";\n\ndescribe("${name}", () => {\n  it("exposes a stable library id", () => {\n    expect(libraryId).toBe("${name}");\n  });\n});\n`;
  }

  return files;
}

function defaultExternalRepositoryPath(cwd: string, name: string): string {
  const looksLikeCoreRoot = existsSync(join(cwd, "old_contents")) && existsSync(join(cwd, "framework", "core"));
  return looksLikeCoreRoot ? join(cwd, "..", name) : join(cwd, name);
}

function scaffoldManagedRepository(repoRoot: string, repository: RolloutRepository) {
  mkdirSync(repoRoot, { recursive: true });
  const files: Record<string, string> = {
    ".gitignore": "node_modules/\ndist/\ncoverage/\n",
    "README.md": `# ${repository.name}\n\n${repository.description}\n`,
    ".github/workflows/ci.yml": `name: CI\n\non:\n  push:\n  pull_request:\n\njobs:\n  verify:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: echo "Managed repository scaffold ready"\n`
  };

  if (repository.kind === "catalog") {
    files["catalog/index.json"] = JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: new Date(0).toISOString(),
        packages: []
      },
      null,
      2
    ) + "\n";
  }

  if (repository.kind === "core") {
    files["docs/README.md"] = "# Core Repo\n\nThis repository is managed separately from plugin and library repos.\n";
  }

  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = join(repoRoot, relativePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, contents, "utf8");
  }
}

function joinUrl(base: string, suffix: string): string {
  return `${base.replace(/\/+$/, "")}/${suffix.replace(/^\/+/, "")}`;
}

function upsertCatalogEntry(catalogPath: string, entry: CatalogEntry) {
  const current = existsSync(catalogPath)
    ? (JSON.parse(readFileSync(catalogPath, "utf8")) as { schemaVersion?: number; generatedAt?: string; packages?: CatalogEntry[] })
    : { schemaVersion: 1, generatedAt: new Date(0).toISOString(), packages: [] };

  const packages = (current.packages ?? []).filter((candidate) => candidate.id !== entry.id);
  packages.push(entry);
  packages.sort((left, right) => left.id.localeCompare(right.id));

  writeJsonFile(catalogPath, {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    packages
  });
}

function upsertChannelEntry(channelPath: string, channelId: string, entry: CatalogEntry) {
  const current = existsSync(channelPath)
    ? (JSON.parse(readFileSync(channelPath, "utf8")) as { schemaVersion?: number; id?: string; packages?: CatalogEntry[] })
    : { schemaVersion: 1, id: channelId, packages: [] };

  const packages = (current.packages ?? []).filter((candidate) => candidate.id !== entry.id);
  packages.push(entry);
  packages.sort((left, right) => left.id.localeCompare(right.id));

  writeJsonFile(channelPath, {
    schemaVersion: 1,
    id: channelId,
    packages
  });
}

function writeJsonFile(filePath: string, value: unknown) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function signArtifactDigest(sha256: string, privateKeyPem: string): string {
  const privateKey = createPrivateKey(privateKeyPem);
  return sign(null, Buffer.from(sha256, "utf8"), privateKey).toString("base64");
}
