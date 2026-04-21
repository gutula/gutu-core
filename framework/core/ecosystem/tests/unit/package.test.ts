import { existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, win32 } from "node:path";
import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "bun:test";

import {
  createWorkspaceLock,
  doctorCoreRepository,
  loadRolloutOrganization,
  promoteReleaseArtifact,
  provisionGitHubRepositories,
  resolveFrameworkInstallMode,
  resolveFrameworkSourceRootFromModulePath,
  scaffoldRolloutRepositories,
  scaffoldWorkspace,
  syncCatalogRepositories
} from "../../src";

function createFrameworkSourceFixture(root: string): string {
  const sourceRoot = join(root, "framework-source");
  mkdirSync(join(sourceRoot, "framework", "core", "cli"), { recursive: true });
  mkdirSync(join(sourceRoot, "framework", "core", "ecosystem"), { recursive: true });
  writeFileSync(
    join(sourceRoot, "package.json"),
    JSON.stringify(
      {
        name: "gutu-core",
        private: true,
        workspaces: ["framework/core/*"]
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
  writeFileSync(join(sourceRoot, "README.md"), "# Fixture\n", "utf8");
  writeFileSync(join(sourceRoot, "framework", "core", "cli", "marker.txt"), "cli\n", "utf8");
  writeFileSync(join(sourceRoot, "framework", "core", "ecosystem", "marker.txt"), "ecosystem\n", "utf8");
  return sourceRoot;
}

function hasDirectorySymlinkSupport(root: string): boolean {
  const source = join(root, "symlink-source");
  const target = join(root, "symlink-target");
  mkdirSync(source, { recursive: true });

  try {
    symlinkSync(source, target, process.platform === "win32" ? "junction" : "dir");
    return true;
  } catch {
    return false;
  } finally {
    rmSync(target, { recursive: true, force: true });
    rmSync(source, { recursive: true, force: true });
  }
}

function createSplitWorkspaceFixture(root: string) {
  mkdirSync(join(root, "gutu-core"), { recursive: true });
  writeFileSync(join(root, "gutu-core", "package.json"), "{\"name\":\"gutu-core\"}\n", "utf8");
  mkdirSync(join(root, "integrations"), { recursive: true });

  mkdirSync(join(root, "catalogs", "gutu-libraries", "catalog"), { recursive: true });
  mkdirSync(join(root, "catalogs", "gutu-plugins", "catalog"), { recursive: true });

  writeFileSync(
    join(root, "catalogs", "gutu-libraries", "catalog", "index.json"),
    JSON.stringify({ schemaVersion: 1, generatedAt: new Date(0).toISOString(), packages: [] }, null, 2) + "\n",
    "utf8"
  );
  writeFileSync(
    join(root, "catalogs", "gutu-plugins", "catalog", "index.json"),
    JSON.stringify({ schemaVersion: 1, generatedAt: new Date(0).toISOString(), packages: [] }, null, 2) + "\n",
    "utf8"
  );

  mkdirSync(join(root, "libraries", "gutu-lib-demo", "framework", "libraries", "demo"), { recursive: true });
  writeFileSync(
    join(root, "libraries", "gutu-lib-demo", "package.json"),
    JSON.stringify({ name: "gutu-lib-demo", private: true, workspaces: ["framework/libraries/*"] }, null, 2) + "\n",
    "utf8"
  );
  writeFileSync(
    join(root, "libraries", "gutu-lib-demo", "framework", "libraries", "demo", "package.json"),
    JSON.stringify({ name: "@platform/demo", version: "1.2.3", private: false }, null, 2) + "\n",
    "utf8"
  );

  mkdirSync(join(root, "plugins", "gutu-plugin-demo", "framework", "builtin-plugins", "demo"), { recursive: true });
  writeFileSync(
    join(root, "plugins", "gutu-plugin-demo", "package.json"),
    JSON.stringify({ name: "gutu-plugin-demo", private: true, workspaces: ["framework/builtin-plugins/*"] }, null, 2) + "\n",
    "utf8"
  );
  writeFileSync(
    join(root, "plugins", "gutu-plugin-demo", "framework", "builtin-plugins", "demo", "package.json"),
    JSON.stringify({ name: "@plugins/demo", version: "4.5.6", private: false }, null, 2) + "\n",
    "utf8"
  );
}

describe("@gutu/ecosystem", () => {
  it("creates an empty stable lockfile", () => {
    const lock = createWorkspaceLock();
    expect(lock.channel).toBe("stable");
    expect(lock.plugins).toHaveLength(0);
    expect(lock.libraries).toHaveLength(0);
  });

  it("scaffolds a clean consumer workspace", () => {
    const root = mkdtempSync(join(tmpdir(), "gutu-ecosystem-"));
    try {
      const frameworkSourceRoot = createFrameworkSourceFixture(root);
      const result = scaffoldWorkspace(root, {
        target: "demo",
        frameworkSourceRoot,
        frameworkInstallMode: "copy"
      });
      expect(result.ok).toBe(true);
      expect(result.createdFiles).toContain("gutu.project.json");
      expect(result.createdFiles).toContain("vendor/plugins/.gitkeep");
      expect(result.frameworkInstallMode).toBe("copy");
      expect(existsSync(join(root, "demo", "vendor", "framework", "package.json"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps copy mode safe when the workspace lives inside the framework source tree", () => {
    const root = mkdtempSync(join(tmpdir(), "gutu-ecosystem-copy-safe-"));
    try {
      const frameworkSourceRoot = createFrameworkSourceFixture(root);
      const result = scaffoldWorkspace(frameworkSourceRoot, {
        target: "consumer",
        frameworkSourceRoot,
        frameworkInstallMode: "copy"
      });

      expect(result.frameworkInstallMode).toBe("copy");
      expect(existsSync(join(result.frameworkRoot, "package.json"))).toBe(true);
      expect(existsSync(join(result.frameworkRoot, "consumer"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("supports symlink mode when directory links are available", () => {
    const root = mkdtempSync(join(tmpdir(), "gutu-ecosystem-symlink-"));
    try {
      if (!hasDirectorySymlinkSupport(root)) {
        return;
      }

      const frameworkSourceRoot = createFrameworkSourceFixture(root);
      const result = scaffoldWorkspace(root, {
        target: "demo",
        frameworkSourceRoot,
        frameworkInstallMode: "symlink"
      });

      expect(result.frameworkInstallMode).toBe("symlink");
      expect(lstatSync(result.frameworkRoot).isSymbolicLink()).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("prefers copy mode for automatic installs on Windows-oriented hosts", () => {
    expect(resolveFrameworkInstallMode("auto", { platform: "win32", symlinkSafe: true })).toBe("copy");
  });

  it("resolves source roots from Windows-style source paths with path utilities", () => {
    const frameworkRoot = win32.join("C:\\", "Program Files", "gutu-core");
    const moduleFilePath = win32.join(frameworkRoot, "framework", "core", "ecosystem", "src", "index.ts");
    const existingPaths = new Set([
      win32.join(frameworkRoot, "package.json"),
      win32.join(frameworkRoot, "framework", "core", "cli"),
      win32.join(frameworkRoot, "framework", "core", "ecosystem")
    ]);

    const result = resolveFrameworkSourceRootFromModulePath(moduleFilePath, {
      pathApi: win32,
      exists(path) {
        return existingPaths.has(path);
      }
    });

    expect(result).toBe(frameworkRoot);
  });

  it("resolves bundled Windows-style dist paths without Unix path surgery", () => {
    const frameworkRoot = win32.join("C:\\", "Program Files", "gutu-core");
    const moduleFilePath = win32.join(frameworkRoot, "dist", "gutu.js");
    const existingPaths = new Set([
      win32.join(frameworkRoot, "package.json"),
      win32.join(frameworkRoot, "framework", "core", "cli"),
      win32.join(frameworkRoot, "framework", "core", "ecosystem")
    ]);

    const result = resolveFrameworkSourceRootFromModulePath(moduleFilePath, {
      pathApi: win32,
      exists(path) {
        return existingPaths.has(path);
      }
    });

    expect(result).toBe(frameworkRoot);
  });

  it("flags forbidden plugin directories in the core repository", () => {
    const root = mkdtempSync(join(tmpdir(), "gutu-doctor-"));
    try {
      mkdirSync(join(root, "old_contents"), { recursive: true });
      mkdirSync(join(root, "plugins"), { recursive: true });
      const result = doctorCoreRepository(root);
      expect(result.ok).toBe(false);
      expect(result.findings[0]).toContain("plugins");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("loads the rollout organization manifest", () => {
    const root = mkdtempSync(join(tmpdir(), "gutu-rollout-load-"));
    try {
      mkdirSync(join(root, "ecosystem", "rollout"), { recursive: true });
      writeFileSync(
        join(root, "ecosystem", "rollout", "organization.json"),
        JSON.stringify(
          {
            schemaVersion: 1,
            organization: "gutula",
            repositories: [{ name: "gutu-core", kind: "core", description: "Core repo." }]
          },
          null,
          2
        ) + "\n",
        "utf8"
      );

      const rollout = loadRolloutOrganization(root);
      expect(rollout.organization).toBe("gutula");
      expect(rollout.repositories).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("scaffolds the configured rollout repository set", () => {
    const root = mkdtempSync(join(tmpdir(), "gutu-rollout-scaffold-"));
    try {
      mkdirSync(join(root, "ecosystem", "rollout"), { recursive: true });
      writeFileSync(
        join(root, "ecosystem", "rollout", "organization.json"),
        JSON.stringify(
          {
            schemaVersion: 1,
            organization: "gutula",
            repositories: [
              { name: "gutu-core", kind: "core", description: "Core repo." },
              { name: "gutu-plugins", kind: "catalog", description: "Catalog repo." },
              { name: "gutu-ecosystem-integration", kind: "integration", description: "Integration repo." }
            ]
          },
          null,
          2
        ) + "\n",
        "utf8"
      );

      const result = scaffoldRolloutRepositories(root, { outDir: join(root, "out") });
      expect(result.ok).toBe(true);
      expect(existsSync(join(root, "out", "gutu-plugins", "catalog", "index.json"))).toBe(true);
      expect(existsSync(join(root, "out", "gutu-ecosystem-integration", "matrix", "README.md"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("syncs standalone catalog indexes from the checked-out plugin and library repos", () => {
    const root = mkdtempSync(join(tmpdir(), "gutu-rollout-sync-"));
    try {
      createSplitWorkspaceFixture(root);

      const result = syncCatalogRepositories(root);
      expect(result.ok).toBe(true);

      const librariesCatalog = JSON.parse(readFileSync(result.librariesCatalogPath, "utf8")) as { packages: Array<{ id: string }> };
      const pluginsCatalog = JSON.parse(readFileSync(result.pluginsCatalogPath, "utf8")) as { packages: Array<{ id: string }> };
      expect(librariesCatalog.packages[0]?.id).toBe("@platform/demo");
      expect(pluginsCatalog.packages[0]?.id).toBe("@plugins/demo");
      expect(existsSync(join(root, "catalogs", "gutu-libraries", "channels", "stable.json"))).toBe(true);
      expect(existsSync(join(root, "catalogs", "gutu-plugins", "channels", "next.json"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("promotes a signed release artifact into catalog and channel metadata", () => {
    const root = mkdtempSync(join(tmpdir(), "gutu-rollout-promote-"));
    try {
      mkdirSync(join(root, "artifacts", "release"), { recursive: true });
      const { publicKey } = generateKeyPairSync("ed25519");

      writeFileSync(
        join(root, "artifacts", "release", "demo-release-manifest.json"),
        JSON.stringify(
          {
            schemaVersion: 1,
            package: "demo",
            version: "1.2.3",
            createdAt: new Date(0).toISOString(),
            artifact: {
              path: "artifacts/release/demo-1.2.3.tgz",
              sha256: "a".repeat(64),
              sizeBytes: 123
            }
          },
          null,
          2
        ) + "\n",
        "utf8"
      );
      writeFileSync(
        join(root, "artifacts", "release", "demo-release-manifest.json.sig.json"),
        JSON.stringify({ algorithm: "ed25519", signature: "ZmFrZQ==" }, null, 2) + "\n",
        "utf8"
      );

      const result = promoteReleaseArtifact(root, {
        packageId: "@gutula/demo-plugin",
        kind: "plugin",
        repo: "gutula/gutu-plugin-demo",
        manifestPath: "artifacts/release/demo-release-manifest.json",
        signaturePath: "artifacts/release/demo-release-manifest.json.sig.json",
        publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
        uriBase: "https://github.com/gutula/gutu-plugin-demo/releases/download/v1.2.3"
      });

      expect(result.ok).toBe(true);
      const catalog = JSON.parse(readFileSync(result.catalogPath, "utf8")) as { packages: Array<{ id: string }> };
      const channel = JSON.parse(readFileSync(result.channelPath, "utf8")) as { packages: Array<{ id: string }> };
      expect(catalog.packages[0]?.id).toBe("@gutula/demo-plugin");
      expect(channel.packages[0]?.id).toBe("@gutula/demo-plugin");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("prefers standalone catalog repo roots when they are checked out in the workspace", () => {
    const root = mkdtempSync(join(tmpdir(), "gutu-rollout-promote-standalone-"));
    try {
      createSplitWorkspaceFixture(root);
      mkdirSync(join(root, "artifacts", "release"), { recursive: true });

      writeFileSync(
        join(root, "artifacts", "release", "demo-release-manifest.json"),
        JSON.stringify(
          {
            schemaVersion: 1,
            package: "demo",
            version: "1.2.3",
            createdAt: new Date(0).toISOString(),
            artifact: {
              path: "demo-1.2.3.tgz",
              sha256: "c".repeat(64),
              sizeBytes: 123
            }
          },
          null,
          2
        ) + "\n",
        "utf8"
      );

      const result = promoteReleaseArtifact(root, {
        packageId: "@plugins/demo",
        kind: "plugin",
        repo: "gutula/gutu-plugin-demo",
        manifestPath: "artifacts/release/demo-release-manifest.json",
        uriBase: "https://github.com/gutula/gutu-plugin-demo/releases/download/v1.2.3"
      });

      expect(result.catalogPath).toBe(join(root, "catalogs", "gutu-plugins", "catalog", "index.json"));
      expect(result.channelPath).toBe(join(root, "catalogs", "gutu-plugins", "channels", "stable.json"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("provisions GitHub repositories through the rollout manifest when a token is available", async () => {
    const root = mkdtempSync(join(tmpdir(), "gutu-rollout-provision-"));
    try {
      mkdirSync(join(root, "ecosystem", "rollout"), { recursive: true });
      writeFileSync(
        join(root, "ecosystem", "rollout", "organization.json"),
        JSON.stringify(
          {
            schemaVersion: 1,
            organization: "gutula",
            repositories: [
              { name: "gutu-core", kind: "core", description: "Core repo.", visibility: "public" },
              { name: "gutu-plugins", kind: "catalog", description: "Catalog repo.", visibility: "public" }
            ]
          },
          null,
          2
        ) + "\n",
        "utf8"
      );

      const calls: Array<{ url: string; body: string }> = [];
      const result = await provisionGitHubRepositories(root, {
        token: "token",
        fetchImpl: async (input, init) => {
          calls.push({
            url: String(input),
            body: String(init?.body ?? "")
          });

          return new Response(
            JSON.stringify({
              html_url: "https://github.com/gutula/example"
            }),
            { status: 201, headers: { "content-type": "application/json" } }
          );
        }
      });

      expect(result.ok).toBe(true);
      expect(result.repositories).toHaveLength(2);
      expect(calls[0]?.url).toContain("/orgs/gutula/repos");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
