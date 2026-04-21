import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "bun:test";

import { scaffoldWorkspace, scaffoldExternalRepository, syncWorkspaceVendor } from "../../src";

function hasTar(): boolean {
  return spawnSync("tar", ["--version"], { stdio: "ignore" }).status === 0;
}

describe("@gutu/ecosystem installs", () => {
  it("installs a signed archive artifact into vendor/plugins", async () => {
    if (!hasTar()) {
      return;
    }

    const root = mkdtempSync(join(tmpdir(), "gutu-install-"));
    try {
      const workspace = scaffoldWorkspace(root, { target: "consumer" });
      const packageRoot = join(root, "sample-plugin");
      mkdirSync(packageRoot, { recursive: true });
      writeFileSync(join(packageRoot, "README.md"), "# Sample Plugin\n", "utf8");
      writeFileSync(join(packageRoot, "package.json"), "{\"name\":\"@gutula/sample-plugin\"}\n", "utf8");

      const artifactPath = join(root, "sample-plugin.tgz");
      const tarResult = spawnSync("tar", ["-czf", artifactPath, "-C", packageRoot, "."], { encoding: "utf8" });
      expect(tarResult.status).toBe(0);

      const sha256 = createHash("sha256").update(readFileSync(artifactPath)).digest("hex");
      const { privateKey, publicKey } = generateKeyPairSync("ed25519");
      const signature = sign(null, Buffer.from(sha256, "utf8"), privateKey).toString("base64");

      writeFileSync(
        join(workspace.projectRoot, "gutu.lock.json"),
        JSON.stringify(
          {
            schemaVersion: 1,
            channel: "stable",
            core: { package: "gutu-core", version: "0.0.1" },
            libraries: [],
            plugins: [
              {
                id: "@gutula/sample-plugin",
                kind: "plugin",
                repo: "gutula/gutu-plugin-sample",
                version: "1.0.0",
                channel: "stable",
                artifact: {
                  uri: `file://${artifactPath}`,
                  format: "tgz",
                  sha256,
                  signature,
                  publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString()
                }
              }
            ]
          },
          null,
          2
        ) + "\n",
        "utf8"
      );

      const result = await syncWorkspaceVendor(workspace.projectRoot);
      expect(result.ok).toBe(true);
      expect(existsSync(join(workspace.projectRoot, "vendor", "plugins", "sample-plugin", "README.md"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("downloads and installs remote HTTP artifacts", async () => {
    if (!hasTar()) {
      return;
    }

    const root = mkdtempSync(join(tmpdir(), "gutu-install-http-"));
    try {
      const workspace = scaffoldWorkspace(root, { target: "consumer" });
      const packageRoot = join(root, "sample-http-plugin");
      mkdirSync(packageRoot, { recursive: true });
      writeFileSync(join(packageRoot, "README.md"), "# Remote Plugin\n", "utf8");
      const artifactPath = join(root, "sample-http-plugin.tgz");
      const tarResult = spawnSync("tar", ["-czf", artifactPath, "-C", packageRoot, "."], { encoding: "utf8" });
      expect(tarResult.status).toBe(0);
      const sha256 = createHash("sha256").update(readFileSync(artifactPath)).digest("hex");

      const server = Bun.serve({
        port: 0,
        fetch() {
          return new Response(Bun.file(artifactPath));
        }
      });

      writeFileSync(
        join(workspace.projectRoot, "gutu.lock.json"),
        JSON.stringify(
          {
            schemaVersion: 1,
            channel: "stable",
            core: { package: "gutu-core", version: "0.0.1" },
            libraries: [],
            plugins: [
              {
                id: "@gutula/remote-plugin",
                kind: "plugin",
                repo: "gutula/gutu-plugin-remote",
                version: "1.0.0",
                channel: "stable",
                artifact: {
                  uri: `http://127.0.0.1:${server.port}/sample.tgz`,
                  format: "tgz",
                  sha256
                }
              }
            ]
          },
          null,
          2
        ) + "\n",
        "utf8"
      );

      const result = await syncWorkspaceVendor(workspace.projectRoot);
      expect(result.ok).toBe(true);
      expect(existsSync(join(workspace.projectRoot, "vendor", "plugins", "remote-plugin", "README.md"))).toBe(true);
      server.stop(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("flattens npm-style package tarballs into the vendor root", async () => {
    if (!hasTar()) {
      return;
    }

    const root = mkdtempSync(join(tmpdir(), "gutu-install-npm-style-"));
    try {
      const workspace = scaffoldWorkspace(root, { target: "consumer" });
      const stagingRoot = join(root, "staging");
      const packageRoot = join(stagingRoot, "package");
      mkdirSync(packageRoot, { recursive: true });
      writeFileSync(join(packageRoot, "README.md"), "# Npm Style Plugin\n", "utf8");
      writeFileSync(join(packageRoot, "package.json"), "{\"name\":\"@gutula/npm-style-plugin\"}\n", "utf8");

      const artifactPath = join(root, "npm-style-plugin.tgz");
      const tarResult = spawnSync("tar", ["-czf", artifactPath, "-C", stagingRoot, "package"], { encoding: "utf8" });
      expect(tarResult.status).toBe(0);

      const sha256 = createHash("sha256").update(readFileSync(artifactPath)).digest("hex");

      writeFileSync(
        join(workspace.projectRoot, "gutu.lock.json"),
        JSON.stringify(
          {
            schemaVersion: 1,
            channel: "stable",
            core: { package: "gutu-core", version: "0.0.1" },
            libraries: [],
            plugins: [
              {
                id: "@gutula/npm-style-plugin",
                kind: "plugin",
                repo: "gutula/gutu-plugin-npm-style",
                version: "1.0.0",
                channel: "stable",
                artifact: {
                  uri: `file://${artifactPath}`,
                  format: "tgz",
                  sha256
                }
              }
            ]
          },
          null,
          2
        ) + "\n",
        "utf8"
      );

      const result = await syncWorkspaceVendor(workspace.projectRoot);
      expect(result.ok).toBe(true);
      expect(existsSync(join(workspace.projectRoot, "vendor", "plugins", "npm-style-plugin", "package.json"))).toBe(true);
      expect(existsSync(join(workspace.projectRoot, "vendor", "plugins", "npm-style-plugin", "package"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects artifacts with a mismatched digest", async () => {
    if (!hasTar()) {
      return;
    }

    const root = mkdtempSync(join(tmpdir(), "gutu-install-fail-"));
    try {
      const workspace = scaffoldWorkspace(root, { target: "consumer" });
      const packageRoot = join(root, "sample-lib");
      mkdirSync(packageRoot, { recursive: true });
      writeFileSync(join(packageRoot, "README.md"), "# Sample Library\n", "utf8");
      const artifactPath = join(root, "sample-lib.tgz");
      const tarResult = spawnSync("tar", ["-czf", artifactPath, "-C", packageRoot, "."], { encoding: "utf8" });
      expect(tarResult.status).toBe(0);

      writeFileSync(
        join(workspace.projectRoot, "gutu.lock.json"),
        JSON.stringify(
          {
            schemaVersion: 1,
            channel: "stable",
            core: { package: "gutu-core", version: "0.0.1" },
            libraries: [
              {
                id: "@gutula/sample-lib",
                kind: "library",
                repo: "gutula/gutu-lib-sample",
                version: "1.0.0",
                channel: "stable",
                artifact: {
                  uri: `file://${artifactPath}`,
                  format: "tgz",
                  sha256: "0".repeat(64)
                }
              }
            ],
            plugins: []
          },
          null,
          2
        ) + "\n",
        "utf8"
      );

      await expect(syncWorkspaceVendor(workspace.projectRoot)).rejects.toThrow("Digest mismatch");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("scaffolds external repositories for plugin, library, and integration roles", () => {
    const root = mkdtempSync(join(tmpdir(), "gutu-repo-scaffold-"));
    try {
      const plugin = scaffoldExternalRepository(root, {
        kind: "plugin",
        name: "gutu-plugin-mailer"
      });
      const library = scaffoldExternalRepository(root, {
        kind: "library",
        name: "gutu-lib-utils"
      });
      const integration = scaffoldExternalRepository(root, {
        kind: "integration",
        name: "gutu-ecosystem-integration"
      });

      expect(plugin.files).toContain("README.md");
      expect(library.files).toContain("README.md");
      expect(integration.files).toContain(".github/workflows/ci.yml");
      expect(readFileSync(join(integration.repoRoot, "README.md"), "utf8")).toContain("cross-repo");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
