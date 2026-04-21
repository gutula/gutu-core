import { describe, expect, it } from "bun:test";

import { ValidationError, definePackage } from "../../src";

describe("@platform/kernel", () => {
  it("freezes valid package definitions", () => {
    const definition = definePackage({
      id: "notifications-core",
      kind: "app",
      version: "0.1.0",
      description: "Notification plugin."
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
          description: "Broken."
        })
    ).toThrow(ValidationError);
  });
});
