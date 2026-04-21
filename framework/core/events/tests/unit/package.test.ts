import { describe, expect, it } from "bun:test";

import { createInMemoryJobRuntime, defineJob } from "@platform/jobs";

import { createEventEnvelope, createEventIdempotencyKey, createInMemoryEventBus, createOutboxRecord, defineSubscriber } from "../../src";

describe("@platform/events", () => {
  it("creates stable event helpers for audit-style emitters", () => {
    const event = createEventEnvelope({
      type: "audit.event.recorded",
      source: "audit-core",
      occurredAt: new Date(0).toISOString(),
      payload: {
        eventId: "evt-1"
      },
      correlation: {
        tenantId: "tenant-1",
        idempotencyKey: createEventIdempotencyKey("audit.event.recorded", "evt-1")
      }
    });
    const outbox = createOutboxRecord(event, "tenant-1");

    expect(outbox.type).toBe("audit.event.recorded");
    expect(outbox.tenantId).toBe("tenant-1");
  });

  it("retries failed subscribers, dead-letters them, and supports replay", async () => {
    let attempts = 0;
    const jobRuntime = createInMemoryJobRuntime({
      definitions: [
        defineJob({
          id: "notifications.dispatch",
          queue: "notifications",
          handler: () => undefined
        })
      ]
    });
    const bus = createInMemoryEventBus({
      jobRuntime,
      subscribers: [
        defineSubscriber({
          id: "erp.invoice-paid",
          eventType: "payment.received",
          retryPolicy: {
            attempts: 2
          },
          handler: () => {
            attempts += 1;
            throw new Error("erp unavailable");
          }
        })
      ]
    });

    bus.append({
      type: "payment.received",
      source: "payment-core",
      payload: {
        paymentId: "pay-1"
      },
      correlation: {
        tenantId: "tenant-1",
        idempotencyKey: createEventIdempotencyKey("payment.received", "pay-1")
      }
    });

    const first = await bus.drain();
    expect(first.retried).toBe(1);

    const second = await bus.drain();
    expect(second.deadLettered).toBe(1);
    expect(bus.listDeadLetters()).toHaveLength(1);

    bus.replayDeadLetter(bus.listDeadLetters()[0]?.id as string);
    await bus.drain();
    expect(attempts).toBe(3);
  });
});
