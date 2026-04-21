import { describe, expect, it } from "bun:test";

import { assertRepositoryBoundary, definePackageManifest } from "../../src";

describe("@gutu/kernel", () => {
  it("accepts core manifests in the core repository", () => {
    const manifest = definePackageManifest({
      id: "@gutu/kernel",
      kind: "core",
      version: "0.0.1",
      description: "Core contracts."
    });

    expect(assertRepositoryBoundary("core", [manifest]).ok).toBe(true);
  });

  it("rejects plugin manifests in the core repository", () => {
    const manifest = definePackageManifest({
      id: "@gutu/plugin-mailer",
      kind: "plugin",
      version: "0.0.1",
      description: "Should not live in gutu-core."
    });

    const result = assertRepositoryBoundary("core", [manifest]);
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
  });
});

