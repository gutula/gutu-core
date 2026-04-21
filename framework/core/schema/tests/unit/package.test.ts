import { describe, expect, it } from "bun:test";
import { z } from "zod";

import { defineAction, defineResource, executeAction, toJsonSchema } from "../../src";

describe("@platform/schema", () => {
  it("executes typed actions against zod inputs and outputs", async () => {
    const action = defineAction({
      id: "payments.capture",
      input: z.object({
        amount: z.number()
      }),
      output: z.object({
        ok: z.boolean()
      }),
      handler: ({ input }) => ({
        ok: input.amount > 0
      })
    });

    await expect(executeAction(action, { amount: 10 })).resolves.toEqual({ ok: true });
  });

  it("freezes resources and converts zod to json schema", () => {
    const resource = defineResource({
      id: "invoices",
      contract: {
        primaryKey: "id"
      }
    });

    expect(Object.isFrozen(resource)).toBe(true);
    expect(
      toJsonSchema(
        z.object({
          tenantId: z.string(),
          amount: z.number()
        })
      )
    ).toEqual({
      type: "object",
      properties: {
        tenantId: { type: "string" },
        amount: { type: "number" }
      },
      required: ["tenantId", "amount"]
    });
  });
});
