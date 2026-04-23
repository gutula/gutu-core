import { describe, expect, it } from "bun:test";

import { ValidationError, definePackManifest, definePackage, getPackageNamespaceMetadata } from "../../src";

describe("@platform/kernel", () => {
  it("freezes valid package definitions", () => {
    const definition = definePackage({
      id: "notifications-core",
      kind: "app",
      version: "0.1.0",
      description: "Notification plugin.",
      defaultCategory: {
        id: "business",
        label: "Business",
        subcategoryId: "communications",
        subcategoryLabel: "Communications"
      }
    });

    expect(definition.id).toBe("notifications-core");
    expect(Object.isFrozen(definition)).toBe(true);
  });

  it("throws a validation error when required fields are missing", () => {
    expect(
      () =>
        definePackage({
          id: "",
          kind: "app",
          version: "0.1.0",
          description: "Broken.",
          defaultCategory: {
            id: "business",
            label: "Business",
            subcategoryId: "communications",
            subcategoryLabel: "Communications"
          }
        })
    ).toThrow(ValidationError);
  });

  it("throws a validation error when plugin category metadata is missing", () => {
    expect(
      () =>
        definePackage({
          id: "notifications-core",
          kind: "app",
          version: "0.1.0",
          description: "Broken."
        })
    ).toThrow(ValidationError);
  });

  it("throws a validation error when plugin category metadata is invalid", () => {
    expect(
      () =>
        definePackage({
          id: "notifications-core",
          kind: "app",
          version: "0.1.0",
          description: "Broken.",
          defaultCategory: {
            id: "business",
            label: "Business",
            subcategoryId: "authentication",
            subcategoryLabel: "Authentication"
          }
        })
    ).toThrow(ValidationError);
  });

  it("re-exports package namespace helpers", () => {
    const metadata = getPackageNamespaceMetadata("@platform/jobs");

    expect(metadata.canonicalId).toBe("@gutu/jobs");
    expect(metadata.scopeKind).toBe("legacy_framework");
  });

  it("accepts rich business package metadata", () => {
    const definition = definePackage({
      id: "sales-core",
      kind: "plugin",
      version: "0.1.0",
      contractVersion: "1.0.0",
      description: "Sales demand truth.",
      displayName: "Sales Core",
      domainGroup: "Operational Data",
      defaultCategory: {
        id: "business",
        label: "Business",
        subcategoryId: "sales_commerce",
        subcategoryLabel: "Sales & Commerce"
      },
      dependencyContracts: [
        {
          packageId: "pricing-tax-core",
          class: "required",
          rationale: "Commercial policy is required for quote evaluation."
        }
      ],
      recommendedPlugins: ["inventory-core"],
      capabilityEnhancingPlugins: ["analytics-bi-core"],
      integrationOnlyPlugins: ["business-portals-core"],
      suggestedPacks: ["sector-trading-distribution"],
      standaloneSupported: true,
      installNotes: ["Inventory is recommended for physical fulfillment scenarios."],
      providesCapabilities: ["sales.orders"],
      requestedCapabilities: ["events.publish.sales"],
      ownsData: ["sales.orders"],
      extendsData: [],
      publicCommands: ["sales.orders.confirm"],
      publicQueries: ["sales.order-summary"],
      publicEvents: ["sales.order-confirmed.v1"]
    });

    expect(definition.publicCommands).toContain("sales.orders.confirm");
    expect(definition.dependencyContracts[0]?.class).toBe("required");
    expect(definition.recommendedPlugins).toContain("inventory-core");
    expect(definition.suggestedPacks).toContain("sector-trading-distribution");
  });

  it("re-exports pack manifest helpers", () => {
    const pack = definePackManifest({
      packType: "starter-pack",
      name: "sales-starter",
      version: "0.1.0",
      publisher: "gutula",
      platformVersion: ">=0.1.0 <1.0.0"
    });

    expect(pack.compatibilityChannel).toBe("next");
    expect(pack.environmentScope).toBe("base");
  });
});
