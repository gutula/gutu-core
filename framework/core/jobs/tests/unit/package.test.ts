import { describe, expect, it } from "bun:test";
import { z } from "zod";

import { calculateNextRunAt, createInMemoryJobRuntime, defineJob, defineWorkflow, getWorkflowTransition } from "../../src";

describe("@platform/jobs", () => {
  it("runs jobs and captures retry and dead-letter state", async () => {
    let attempts = 0;
    const runtime = createInMemoryJobRuntime({
      definitions: [
        defineJob({
          id: "notifications.dispatch",
          queue: "notifications",
          payload: z.object({
            tenantId: z.string()
          }),
          retryPolicy: {
            attempts: 2,
            backoff: "immediate",
            delayMs: 0
          },
          handler: () => {
            attempts += 1;
            throw new Error("provider unavailable");
          }
        })
      ]
    });

    runtime.enqueue({
      definitionId: "notifications.dispatch",
      payload: {
        tenantId: "tenant-1"
      }
    });

    const first = await runtime.drain({ now: new Date(0) });
    expect(first.retried).toBe(1);
    expect(runtime.listJobs()[0]?.status).toBe("retrying");

    const second = await runtime.drain({ now: new Date(1000) });
    expect(second.deadLettered).toBe(1);
    expect(runtime.listDeadLetters()).toHaveLength(1);
    expect(attempts).toBe(2);
  });

  it("calculates workflow transitions and validates workflow definitions", () => {
    const workflow = defineWorkflow({
      id: "invoice-approval",
      initialState: "draft",
      states: {
        draft: { on: { submit: "pending" } },
        pending: { on: { approve: "approved" } },
        approved: {}
      }
    });

    expect(getWorkflowTransition(workflow, "draft", "submit")).toBe("pending");
    expect(calculateNextRunAt(new Date(0).toISOString(), 2, { attempts: 3, backoff: "linear", delayMs: 1000 })).toBe(
      new Date(2000).toISOString()
    );
  });
});
