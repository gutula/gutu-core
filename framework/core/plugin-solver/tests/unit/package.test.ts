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
  });
});
