import { describe, expect, it } from "bun:test";

import { createInstallReviewPlan, definePolicy, evaluatePermission } from "../../src";

describe("@platform/permissions", () => {
  it("evaluates matching claims for a permission", () => {
    const policy = definePolicy({
      id: "notifications.default",
      rules: [
        {
          permission: "notifications.messages.queue",
          allowIf: ["role:admin"],
          requireReason: true,
          audit: true
        }
      ]
    });

    const decision = evaluatePermission(policy, "notifications.messages.queue", ["role:admin"]);
    expect(decision.allowed).toBe(true);
    expect(decision.requireReason).toBe(true);
    expect(decision.audit).toBe(true);
  });

  it("restricts unknown trust-tier installs when restricted preview is enabled", () => {
    const plan = createInstallReviewPlan(
      {
        id: "example-plugin",
        trustTier: "unknown",
        requestedCapabilities: ["events.publish.example"]
      },
      { allowRestrictedPreview: true }
    );

    expect(plan.mode).toBe("restricted-preview");
    expect(plan.effectiveManifest.isolationProfile).toBe("declarative-only");
    expect(plan.strippedCapabilities).toEqual(["events.publish.example"]);
  });
});
