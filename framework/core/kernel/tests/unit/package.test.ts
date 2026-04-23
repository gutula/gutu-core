import { describe, expect, it } from "bun:test";

import {
  assertRepositoryBoundary,
  definePackManifest,
  definePackageManifest,
  getPackageNamespaceMetadata,
  resolvePluginCategory
} from "../../src";

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
      description: "Should not live in gutu-core.",
      defaultCategory: {
        id: "integrations",
        label: "Integrations",
        subcategoryId: "connectors_webhooks",
        subcategoryLabel: "Connectors & Webhooks"
      }
    });

    const result = assertRepositoryBoundary("core", [manifest]);
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
  });

  it("accepts plugin manifests with a valid default category", () => {
    const manifest = definePackageManifest({
      id: "@plugins/dashboard-core",
      kind: "plugin",
      version: "0.1.0",
      description: "Dashboard plugin.",
      defaultCategory: resolvePluginCategory("business", "analytics_reporting")
    });

    expect(manifest.defaultCategory?.id).toBe("business");
    expect(manifest.defaultCategory?.subcategoryId).toBe("analytics_reporting");
  });

  it("accepts business and pack-flavored package kinds in plugin repositories", () => {
    const manifest = definePackageManifest({
      id: "@plugins/company-builder-core",
      kind: "ai-pack",
      version: "0.1.0",
      description: "Governed AI operating model pack.",
      defaultCategory: resolvePluginCategory("ai_automation", "operating_models"),
      publicCommands: ["company.work-intakes.classify"],
      publicQueries: ["company.operating-model-summary"],
      publicEvents: ["company.operating-model-published.v1"]
    });

    expect(assertRepositoryBoundary("plugin", [manifest]).ok).toBe(true);
    expect(manifest.publicEvents).toContain("company.operating-model-published.v1");
  });

  it("rejects plugin manifests without a default category", () => {
    expect(() =>
      definePackageManifest({
        id: "@plugins/dashboard-core",
        kind: "plugin",
        version: "0.1.0",
        description: "Dashboard plugin."
      })
    ).toThrow();
  });

  it("rejects invalid subcategories for a valid category", () => {
    expect(() =>
      definePackageManifest({
        id: "@plugins/payments-core",
        kind: "plugin",
        version: "0.1.0",
        description: "Payments plugin.",
        defaultCategory: {
          id: "business",
          label: "Business",
          subcategoryId: "authentication",
          subcategoryLabel: "Authentication"
        }
      })
    ).toThrow();
  });

  it("derives canonical namespace metadata for legacy framework packages", () => {
    const metadata = getPackageNamespaceMetadata("@platform/schema");

    expect(metadata.scopeKind).toBe("legacy_framework");
    expect(metadata.isCanonical).toBe(false);
    expect(metadata.canonicalId).toBe("@gutu/schema");
    expect(metadata.legacyIds).toEqual(["@platform/schema"]);
  });

  it("parses pack manifests with merge and rollback metadata", () => {
    const pack = definePackManifest({
      packType: "sector-template",
      name: "manufacturing-starter",
      version: "0.1.0",
      publisher: "gutula",
      platformVersion: ">=0.1.0 <1.0.0",
      pluginConstraints: {
        "manufacturing-core": "^0.1.0"
      },
      mergePolicy: {
        workflows: "replace",
        settings: "merge"
      },
      rollbackStrategy: "inverse-patch",
      environmentScope: "sector"
    });

    expect(pack.packType).toBe("sector-template");
    expect(pack.mergePolicy.workflows).toBe("replace");
    expect(pack.rollbackStrategy).toBe("inverse-patch");
  });
});
