import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "bun:test";

import {
  preparePackageReleaseBundle,
  type ReleaseManifest,
  publishGitHubRelease,
  prepareReleaseBundle,
  signReleaseManifest,
  verifyReleaseManifestSignature
} from "../../src";

function hasTar(): boolean {
  return spawnSync("tar", ["--version"], { stdio: "ignore" }).status === 0;
}

describe("@gutu/release", () => {
  it("prepares a release bundle with manifest and provenance", () => {
    if (!hasTar()) {
      return;
    }

    const root = mkdtempSync(join(tmpdir(), "gutu-release-"));
    try {
      writeFileSync(join(root, "README.md"), "# Demo\n", "utf8");
      writeFileSync(join(root, "package.json"), "{\"name\":\"demo\"}\n", "utf8");
      mkdirSync(join(root, "framework", "core"), { recursive: true });
      writeFileSync(join(root, "framework", "core", "marker.txt"), "core\n", "utf8");

      const result = prepareReleaseBundle(root, { outDir: join(root, "artifacts", "release") });
      expect(existsSync(result.artifactPath)).toBe(true);
      expect(result.manifest.artifact.sha256).toHaveLength(64);
      expect(result.provenance.artifact.sha256).toBe(result.manifest.artifact.sha256);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("signs and verifies a release manifest", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const manifest: ReleaseManifest = {
      schemaVersion: 1,
      package: "gutu-core",
      version: "0.0.1",
      createdAt: new Date(0).toISOString(),
      artifact: {
        path: "artifacts/release/gutu-core.tgz",
        sha256: createHash("sha256").update("artifact").digest("hex"),
        sizeBytes: 8
      }
    };

    const signed = signReleaseManifest(manifest, privateKey.export({ type: "pkcs8", format: "pem" }).toString());
    expect(
      verifyReleaseManifestSignature(
        manifest,
        signed.signature,
        publicKey.export({ type: "spki", format: "pem" }).toString()
      )
    ).toBe(true);

    expect(
      verifyReleaseManifestSignature(
        { ...manifest, version: "0.0.2" },
        signed.signature,
        publicKey.export({ type: "spki", format: "pem" }).toString()
      )
    ).toBe(false);
  });

  it("prepares a package release bundle with a publishable tarball filename", () => {
    const root = mkdtempSync(join(tmpdir(), "gutu-package-release-"));
    try {
      mkdirSync(join(root, "packages", "demo"), { recursive: true });
      writeFileSync(
        join(root, "packages", "demo", "package.json"),
        JSON.stringify(
          {
            name: "@demo/pkg",
            version: "1.2.3",
            type: "module"
          },
          null,
          2
        ) + "\n",
        "utf8"
      );
      writeFileSync(join(root, "packages", "demo", "index.js"), "export const demo = true;\n", "utf8");

      const result = preparePackageReleaseBundle(root, {
        packageRoot: "packages/demo",
        outDir: "artifacts/release"
      });

      expect(existsSync(result.artifactPath)).toBe(true);
      expect(result.manifest.package).toBe("@demo/pkg");
      expect(result.manifest.artifact.path.endsWith(".tgz")).toBe(true);
      expect(result.manifest.artifact.path.includes("/")).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("creates a GitHub release and uploads bundle assets", async () => {
    const root = mkdtempSync(join(tmpdir(), "gutu-release-upload-"));
    try {
      const artifactPath = join(root, "demo.tgz");
      const manifestPath = join(root, "demo.json");
      writeFileSync(artifactPath, "artifact", "utf8");
      writeFileSync(manifestPath, "{\"ok\":true}\n", "utf8");

      const calls: Array<{ url: string; method: string }> = [];
      const result = await publishGitHubRelease({
        repo: "gutula/gutu-demo",
        tag: "v1.2.3",
        token: "token",
        assets: [{ path: artifactPath }, { path: manifestPath }],
        fetchImpl: async (input, init) => {
          const url = String(input);
          const method = String(init?.method ?? "GET");
          calls.push({ url, method });

          if (url.endsWith("/releases/tags/v1.2.3")) {
            return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
          }

          if (url.endsWith("/releases") && method === "POST") {
            return new Response(
              JSON.stringify({
                id: 7,
                html_url: "https://github.com/gutula/gutu-demo/releases/tag/v1.2.3",
                upload_url: "https://uploads.github.com/repos/gutula/gutu-demo/releases/7/assets{?name,label}",
                assets: []
              }),
              { status: 201 }
            );
          }

          if (url.startsWith("https://uploads.github.com/")) {
            const assetName = new URL(url).searchParams.get("name");
            return new Response(
              JSON.stringify({
                id: calls.length,
                name: assetName,
                browser_download_url: `https://github.com/gutula/gutu-demo/releases/download/v1.2.3/${assetName}`
              }),
              { status: 201 }
            );
          }

          throw new Error(`Unexpected request: ${method} ${url}`);
        }
      });

      expect(result.created).toBe(true);
      expect(result.assets).toHaveLength(2);
      expect(calls.some((entry) => entry.url.endsWith("/releases") && entry.method === "POST")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
