import { existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "bun:test";

import { runCli } from "../../src";

function createIo(cwd: string) {
  let stdout = "";
  let stderr = "";

  return {
    io: {
      cwd,
      stdout: {
        write(chunk: string) {
          stdout += chunk;
        }
      },
      stderr: {
        write(chunk: string) {
          stderr += chunk;
        }
      }
    },
    read: () => ({ stdout, stderr })
  };
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

describe("@gutu/cli", () => {
  it("prints help by default", async () => {
    const root = mkdtempSync(join(tmpdir(), "gutu-cli-help-"));
    try {
      const harness = createIo(root);
      const code = await runCli([], harness.io);
      expect(code).toBe(0);
      expect(harness.read().stdout).toContain("gutu init");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("initializes a consumer workspace", async () => {
    const root = mkdtempSync(join(tmpdir(), "gutu-cli-init-"));
    try {
      const harness = createIo(root);
      const code = await runCli(["init", "demo"], harness.io);
      expect(code).toBe(0);
      expect(harness.read().stdout).toContain("\"ok\": true");
      expect(existsSync(join(root, "demo", "vendor", "framework", "package.json"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("initializes a consumer workspace in copy mode", async () => {
    const root = mkdtempSync(join(tmpdir(), "gutu-cli-init-copy-"));
    try {
      const harness = createIo(root);
      const code = await runCli(["init", "demo", "--framework-install-mode", "copy"], harness.io);
      expect(code).toBe(0);
      expect(harness.read().stdout).toContain("\"frameworkInstallMode\": \"copy\"");
      expect(existsSync(join(root, "demo", "vendor", "framework", "package.json"))).toBe(true);
      expect(lstatSync(join(root, "demo", "vendor", "framework")).isSymbolicLink()).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("initializes a consumer workspace in symlink mode when directory links are available", async () => {
    const root = mkdtempSync(join(tmpdir(), "gutu-cli-init-symlink-"));
    try {
      if (!hasDirectorySymlinkSupport(root)) {
        return;
      }

      const harness = createIo(root);
      const code = await runCli(["init", "demo", "--framework-install-mode", "symlink"], harness.io);
      expect(code).toBe(0);
      expect(harness.read().stdout).toContain("\"frameworkInstallMode\": \"symlink\"");
      expect(lstatSync(join(root, "demo", "vendor", "framework")).isSymbolicLink()).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails doctor when plugins directory exists", async () => {
    const root = mkdtempSync(join(tmpdir(), "gutu-cli-doctor-"));
    try {
      mkdirSync(join(root, "old_contents"), { recursive: true });
      mkdirSync(join(root, "plugins"), { recursive: true });
      const harness = createIo(root);
      const code = await runCli(["doctor"], harness.io);
      expect(code).toBe(1);
      expect(harness.read().stderr).toContain("plugins");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("scaffolds an external integration repository", async () => {
    const root = mkdtempSync(join(tmpdir(), "gutu-cli-scaffold-"));
    try {
      const harness = createIo(root);
      const code = await runCli(["scaffold", "repo", "--kind", "integration", "--name", "gutu-ecosystem-integration"], harness.io);
      expect(code).toBe(0);
      expect(harness.read().stdout).toContain("gutu-ecosystem-integration");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("prepares release artifacts from the CLI", async () => {
    const root = mkdtempSync(join(tmpdir(), "gutu-cli-release-"));
    try {
      writeFileSync(join(root, "README.md"), "# Demo\n", "utf8");
      writeFileSync(join(root, "package.json"), "{\"name\":\"demo\"}\n", "utf8");
      mkdirSync(join(root, "framework", "core"), { recursive: true });
      writeFileSync(join(root, "framework", "core", "marker.txt"), "demo\n", "utf8");

      const harness = createIo(root);
      const code = await runCli(["release", "prepare"], harness.io);
      expect(code).toBe(0);
      expect(harness.read().stdout).toContain("artifactPath");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("syncs vendored packages from a signed lockfile artifact", async () => {
    const root = mkdtempSync(join(tmpdir(), "gutu-cli-vendor-"));
    try {
      const initHarness = createIo(root);
      const initCode = await runCli(["init", "consumer"], initHarness.io);
      expect(initCode).toBe(0);

      const packageRoot = join(root, "sample-plugin");
      mkdirSync(packageRoot, { recursive: true });
      writeFileSync(join(packageRoot, "README.md"), "# Sample Plugin\n", "utf8");
      const artifactPath = join(root, "sample-plugin.tgz");
      expect(spawnSync("tar", ["-czf", artifactPath, "-C", packageRoot, "."], { encoding: "utf8" }).status).toBe(0);

      const sha256 = createHash("sha256").update(readFileSync(artifactPath)).digest("hex");
      const { privateKey, publicKey } = generateKeyPairSync("ed25519");
      const signature = sign(null, Buffer.from(sha256, "utf8"), privateKey).toString("base64");

      writeFileSync(
        join(root, "consumer", "gutu.lock.json"),
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

      const harness = createIo(root);
      const code = await runCli(["vendor", "sync", "consumer"], harness.io);
      expect(code).toBe(0);
      expect(harness.read().stdout).toContain("sample-plugin");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("signs and verifies a release manifest from the CLI", async () => {
    const root = mkdtempSync(join(tmpdir(), "gutu-cli-sign-"));
    try {
      writeFileSync(join(root, "README.md"), "# Demo\n", "utf8");
      writeFileSync(join(root, "package.json"), "{\"name\":\"demo\",\"version\":\"0.0.1\"}\n", "utf8");
      mkdirSync(join(root, "framework", "core"), { recursive: true });
      writeFileSync(join(root, "framework", "core", "marker.txt"), "demo\n", "utf8");

      const releaseHarness = createIo(root);
      expect(await runCli(["release", "prepare"], releaseHarness.io)).toBe(0);

      const { privateKey, publicKey } = generateKeyPairSync("ed25519");
      const privateKeyPath = join(root, "private.pem");
      const publicKeyPath = join(root, "public.pem");
      writeFileSync(privateKeyPath, privateKey.export({ type: "pkcs8", format: "pem" }).toString(), "utf8");
      writeFileSync(publicKeyPath, publicKey.export({ type: "spki", format: "pem" }).toString(), "utf8");

      const signHarness = createIo(root);
      expect(
        await runCli(
          ["release", "sign", "--manifest", "artifacts/release/demo-release-manifest.json", "--private-key", "private.pem"],
          signHarness.io
        )
      ).toBe(0);

      const verifyHarness = createIo(root);
      expect(
        await runCli(
          [
            "release",
            "verify",
            "--manifest",
            "artifacts/release/demo-release-manifest.json",
            "--signature",
            "artifacts/release/demo-release-manifest.json.sig.json",
            "--public-key",
            "public.pem"
          ],
          verifyHarness.io
        )
      ).toBe(0);
      expect(verifyHarness.read().stdout).toContain("\"ok\": true");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("scaffolds the full rollout repository set from the CLI", async () => {
    const root = mkdtempSync(join(tmpdir(), "gutu-cli-rollout-"));
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
              { name: "gutu-plugins", kind: "catalog", description: "Plugin catalog." }
            ]
          },
          null,
          2
        ) + "\n",
        "utf8"
      );

      const harness = createIo(root);
      const code = await runCli(["rollout", "scaffold", "--out", "rollout-out"], harness.io);
      expect(code).toBe(0);
      expect(harness.read().stdout).toContain("gutula");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("promotes a release artifact into channel metadata from the CLI", async () => {
    const root = mkdtempSync(join(tmpdir(), "gutu-cli-promote-"));
    try {
      mkdirSync(join(root, "artifacts", "release"), { recursive: true });
      writeFileSync(
        join(root, "artifacts", "release", "plugin-release-manifest.json"),
        JSON.stringify(
          {
            schemaVersion: 1,
            package: "plugin-demo",
            version: "1.2.3",
            createdAt: new Date(0).toISOString(),
            artifact: {
              path: "artifacts/release/plugin-demo-1.2.3.tgz",
              sha256: "b".repeat(64),
              sizeBytes: 321
            }
          },
          null,
          2
        ) + "\n",
        "utf8"
      );

      const harness = createIo(root);
      const code = await runCli(
        [
          "rollout",
          "promote",
          "--package-id",
          "@gutula/plugin-demo",
          "--kind",
          "plugin",
          "--repo",
          "gutula/gutu-plugin-demo",
          "--manifest",
          "artifacts/release/plugin-release-manifest.json",
          "--uri-base",
          "https://github.com/gutula/gutu-plugin-demo/releases/download/v1.2.3"
        ],
        harness.io
      );
      expect(code).toBe(0);
      expect(harness.read().stdout).toContain("@gutula/plugin-demo");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("syncs standalone catalog indexes from the CLI", async () => {
    const root = mkdtempSync(join(tmpdir(), "gutu-cli-sync-catalogs-"));
    try {
      createSplitWorkspaceFixture(root);
      const harness = createIo(root);
      const code = await runCli(["rollout", "sync-catalogs"], harness.io);
      expect(code).toBe(0);
      expect(harness.read().stdout).toContain("\"libraries\": 1");
      expect(existsSync(join(root, "catalogs", "gutu-plugins", "channels", "stable.json"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails package publish cleanly without release credentials", async () => {
    const root = mkdtempSync(join(tmpdir(), "gutu-cli-publish-"));
    try {
      const harness = createIo(root);
      const code = await runCli(["rollout", "publish-package", "--target", "@platform/demo"], harness.io);
      expect(code).toBe(1);
      expect(harness.read().stderr).toContain("GUTU_RELEASE_TOKEN");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails GitHub provisioning cleanly without a token", async () => {
    const root = mkdtempSync(join(tmpdir(), "gutu-cli-github-"));
    try {
      const harness = createIo(root);
      const code = await runCli(["rollout", "provision-github"], harness.io);
      expect(code).toBe(1);
      expect(harness.read().stderr).toContain("GITHUB_TOKEN");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
