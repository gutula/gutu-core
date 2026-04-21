import { describe, expect, it } from "bun:test";
import { z } from "zod";

import { createInMemoryEventBus, defineSubscriber } from "@platform/events";
import { createInMemoryJobRuntime, defineJob } from "@platform/jobs";

import { createInMemoryCommandBus, defineCommand } from "../../src";

describe("@platform/commands end-to-end orchestration", () => {
  it("dispatches a payment command and fans out invoice + notification side effects", async () => {
    const invoiceStatus = new Map<string, string>();
    const receiptLog: string[] = [];

    const jobRuntime = createInMemoryJobRuntime({
      definitions: [
        defineJob({
          id: "notifications.dispatch",
          queue: "notifications",
          payload: z.object({
            invoiceId: z.string()
          }),
          handler: ({ payload }) => {
            receiptLog.push(payload.invoiceId);
            return {
              delivered: true
            };
          }
        })
      ]
    });

    const eventBus = createInMemoryEventBus({
      jobRuntime,
      subscribers: [
        defineSubscriber({
          id: "erp.invoice.mark-paid",
          eventType: "payment.received",
          retryPolicy: {
            attempts: 2
          },
          handler: ({ event }) => {
            const payload = event.payload as { invoiceId: string; tenantId: string };
            invoiceStatus.set(payload.invoiceId, "paid");
            return {
              events: [
                {
                  type: "erp.invoice.paid",
                  source: "erp-core",
                  payload: {
                    invoiceId: payload.invoiceId
                  },
                  correlation: {
                    tenantId: payload.tenantId,
                    idempotencyKey: `erp.invoice.paid:${payload.invoiceId}`
                  }
                }
              ]
            };
          }
        }),
        defineSubscriber({
          id: "notifications.enqueue-receipt",
          eventType: "erp.invoice.paid",
          handler: ({ event }) => ({
            jobs: [
              {
                definitionId: "notifications.dispatch",
                payload: {
                  invoiceId: (event.payload as { invoiceId: string }).invoiceId
                }
              }
            ]
          })
        })
      ]
    });

    const commandBus = createInMemoryCommandBus({
      eventBus,
      jobRuntime,
      commands: [
        defineCommand({
          id: "payment.capture",
          idempotent: true,
          input: z.object({
            paymentId: z.string(),
            invoiceId: z.string(),
            tenantId: z.string(),
            amount: z.number()
          }),
          output: z.object({
            status: z.literal("received")
          }),
          handler: ({ input }) => ({
            output: {
              status: "received" as const
            },
            events: [
              {
                type: "payment.received",
                source: "payment-core",
                payload: input,
                correlation: {
                  tenantId: input.tenantId,
                  idempotencyKey: `payment.received:${input.paymentId}`
                }
              }
            ]
          })
        })
      ]
    });

    const receipt = await commandBus.dispatch({
      commandId: "payment.capture",
      idempotencyKey: "payment-1",
      payload: {
        paymentId: "payment-1",
        invoiceId: "invoice-1",
        tenantId: "tenant-1",
        amount: 4200
      }
    });

    expect(receipt.output).toEqual({
      status: "received"
    });
    await eventBus.drain();
    await jobRuntime.drain();

    expect(invoiceStatus.get("invoice-1")).toBe("paid");
    expect(receiptLog).toEqual(["invoice-1"]);

    const duplicate = await commandBus.dispatch({
      commandId: "payment.capture",
      idempotencyKey: "payment-1",
      payload: {
        paymentId: "payment-1",
        invoiceId: "invoice-1",
        tenantId: "tenant-1",
        amount: 4200
      }
    });

    expect(duplicate.duplicate).toBe(true);
    expect(eventBus.listOutbox()).toHaveLength(2);
  });
});
