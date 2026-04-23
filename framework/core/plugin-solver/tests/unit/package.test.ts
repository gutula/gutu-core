import { describe, expect, it } from "bun:test";

import { solvePackageGraph } from "../../src";

describe("@platform/plugin-solver", () => {
  it("orders dependencies and reports unresolved subscriptions and duplicate commands", () => {
    const result = solvePackageGraph({
      requested: ["notifications-core"],
      allowRestrictedPreviewForUnknownPlugins: true,
      manifests: [
        {
          id: "notifications-core",
          dependsOn: ["audit-core"],
          dependencyContracts: [
            {
              packageId: "dashboard-core",
              class: "optional",
              rationale: "Improves notification visibility."
            },
            {
              packageId: "portal-core",
              class: "capability-enhancing",
              rationale: "Adds portal delivery surfaces."
            },
            {
              packageId: "integration-core",
              class: "integration-only",
              rationale: "Needed only for webhook bridge installs."
            }
          ],
          suggestedPacks: ["sector-retail"],
          subscribesTo: ["erp.invoice.paid"],
          commands: ["notifications.messages.queue"],
          trustTier: "first-party"
        },
        {
          id: "audit-core",
          emits: ["audit.event.recorded"],
          commands: ["audit.events.record"],
          trustTier: "unknown"
        },
        {
          id: "erp-core",
          emits: ["erp.invoice.paid"],
          commands: ["notifications.messages.queue"]
        }
      ]
    });

    expect(result.orderedActivation).toEqual(["audit-core", "notifications-core"]);
    expect(result.unresolvedSubscriptions).toEqual([]);
    expect(result.duplicateCommands).toEqual(["notifications.messages.queue"]);
    expect(result.warnings).toContain("restricted preview enabled for audit-core");
    expect(result.optionalDependencies).toEqual([
      expect.objectContaining({
        packageId: "notifications-core",
        dependencyId: "dashboard-core",
        class: "optional",
        present: false
      })
    ]);
    expect(result.capabilityEnhancingDependencies).toEqual([
      expect.objectContaining({
        packageId: "notifications-core",
        dependencyId: "portal-core",
        class: "capability-enhancing",
        present: false
      })
    ]);
    expect(result.integrationOnlyDependencies).toEqual([
      expect.objectContaining({
        packageId: "notifications-core",
        dependencyId: "integration-core",
        class: "integration-only",
        present: false
      })
    ]);
    expect(result.suggestedPacks).toEqual([{ packageId: "notifications-core", packId: "sector-retail" }]);
  });
});
