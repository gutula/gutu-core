import { randomUUID } from "node:crypto";

import type { EnqueueJobInput } from "@platform/jobs";
import { normalizeActionInput } from "@platform/schema";

export type EventDefinition = {
  type: string;
  payload?: unknown;
  [key: string]: unknown;
};

export type EventEnvelope<TPayload = Record<string, unknown>> = {
  id: string;
  type: string;
  source: string;
  occurredAt: string;
  payload: TPayload;
  correlation?: Record<string, unknown> | undefined;
  metadata?: Record<string, unknown> | undefined;
};

export type EventEnvelopeInput<TPayload = Record<string, unknown>> = {
  id?: string | undefined;
  type: string;
  source: string;
  occurredAt?: string | undefined;
  payload: TPayload;
  correlation?: Record<string, unknown> | undefined;
  metadata?: Record<string, unknown> | undefined;
};

export type EventOutboxRecord<TPayload = Record<string, unknown>> = {
  id: string;
  eventId: string;
  tenantId: string | null;
  type: string;
  source: string;
  occurredAt: string;
  payload: TPayload;
  correlation?: Record<string, unknown> | undefined;
  metadata?: Record<string, unknown> | undefined;
  status: "pending" | "processed" | "dead-letter";
  subscriberCount: number;
  deliveredCount: number;
  createdAt: string;
  updatedAt: string;
};

export type EventSubscriberResult = {
  events?: EventEnvelopeInput[] | undefined;
  jobs?: EnqueueJobInput[] | undefined;
};

export type EventSubscriber<TPayload = Record<string, unknown>> = {
  id: string;
  eventType: string;
  retryPolicy?:
    | {
        attempts: number;
      }
    | undefined;
  handler:
    | ((context: { event: EventEnvelope<TPayload>; services?: Record<string, unknown> | undefined }) => Promise<EventSubscriberResult | void> | EventSubscriberResult | void)
    | undefined;
};

export type EventDeliveryRecord = {
  id: string;
  eventId: string;
  subscriptionId: string;
  status: "pending" | "retrying" | "processed" | "dead-letter";
  attemptCount: number;
  lastError?: string | undefined;
  updatedAt: string;
};

export type EventDeadLetterRecord = {
  id: string;
  eventId: string;
  subscriptionId: string;
  reason: string;
  attemptCount: number;
  failedAt: string;
};

export type EventDrainSummary = {
  processed: number;
  retried: number;
  deadLettered: number;
  appended: number;
  enqueuedJobs: number;
  skippedDuplicates: number;
};

export function defineEvent<T extends EventDefinition>(definition: T): Readonly<T> {
  return Object.freeze({
    ...definition
  });
}

export function defineSubscriber<T extends EventSubscriber>(definition: T): Readonly<T> {
  return Object.freeze({
    ...definition
  });
}

export function createEventIdempotencyKey(type: string, key: string): string {
  return `${type}:${key}`;
}

export function createEventEnvelope<TPayload>(input: EventEnvelopeInput<TPayload>): EventEnvelope<TPayload> {
  return {
    id: input.id ?? randomUUID(),
    type: input.type,
    source: input.source,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    payload: normalizeActionInput(input.payload),
    ...(input.correlation ? { correlation: normalizeActionInput(input.correlation) } : {}),
    ...(input.metadata ? { metadata: normalizeActionInput(input.metadata) } : {})
  };
}

export function createOutboxRecord<TPayload>(
  event: EventEnvelope<TPayload>,
  tenantId: string | null
): EventOutboxRecord<TPayload> {
  const timestamp = new Date().toISOString();
  return {
    id: randomUUID(),
    eventId: event.id,
    tenantId,
    type: event.type,
    source: event.source,
    occurredAt: event.occurredAt,
    payload: normalizeActionInput(event.payload),
    ...(event.correlation ? { correlation: normalizeActionInput(event.correlation) } : {}),
    ...(event.metadata ? { metadata: normalizeActionInput(event.metadata) } : {}),
    status: "pending",
    subscriberCount: 0,
    deliveredCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createInMemoryEventBus(options: {
  subscribers?: readonly EventSubscriber[] | undefined;
  jobRuntime?:
    | {
        enqueue(input: EnqueueJobInput): unknown;
        enqueueMany(inputs: readonly EnqueueJobInput[]): unknown[];
      }
    | undefined;
  services?: Record<string, unknown> | undefined;
} = {}) {
  const subscribers = new Map((options.subscribers ?? []).map((subscriber) => [subscriber.id, subscriber]));
  const events = new Map<string, EventEnvelope>();
  const outbox = new Map<string, EventOutboxRecord>();
  const deliveries = new Map<string, EventDeliveryRecord>();
  const deadLetters = new Map<string, EventDeadLetterRecord>();
  const processedKeys = new Set<string>();

  function subscribe(subscriber: EventSubscriber) {
    subscribers.set(subscriber.id, subscriber);
    return subscriber;
  }

  function append(input: EventEnvelopeInput, tenantId: string | null = null): EventOutboxRecord {
    return appendInternal(input, tenantId).record;
  }

  function appendMany(inputs: readonly EventEnvelopeInput[], tenantId: string | null = null): EventOutboxRecord[] {
    return inputs.map((input) => append(input, tenantId));
  }

  async function drain(): Promise<EventDrainSummary> {
    const queue = [...deliveries.values()]
      .filter((delivery) => delivery.status === "pending" || delivery.status === "retrying")
      .map((delivery) => delivery.id);
    const summary: EventDrainSummary = {
      processed: 0,
      retried: 0,
      deadLettered: 0,
      appended: 0,
      enqueuedJobs: 0,
      skippedDuplicates: 0
    };

    while (queue.length > 0) {
      const deliveryId = queue.shift() as string;
      const delivery = deliveries.get(deliveryId);
      if (!delivery || (delivery.status !== "pending" && delivery.status !== "retrying")) {
        continue;
      }

      const subscriber = subscribers.get(delivery.subscriptionId);
      const event = events.get(delivery.eventId);
      if (!subscriber || !event) {
        continue;
      }

      const dedupeKey = `${subscriber.id}:${resolveEventIdempotencyKey(event)}`;
      if (processedKeys.has(dedupeKey)) {
        delivery.status = "processed";
        delivery.updatedAt = new Date().toISOString();
        refreshOutbox(event.id);
        summary.skippedDuplicates += 1;
        continue;
      }

      delivery.attemptCount += 1;
      delivery.updatedAt = new Date().toISOString();

      try {
        const result = await subscriber.handler?.({
          event,
          services: options.services
        });

        processedKeys.add(dedupeKey);
        delivery.status = "processed";
        refreshOutbox(event.id);
        summary.processed += 1;

        if (result?.events && result.events.length > 0) {
          for (const appended of result.events) {
            const appendedResult = appendInternal(appended, deriveTenantId(event));
            summary.appended += 1;
            for (const nextDeliveryId of appendedResult.deliveryIds) {
              queue.push(nextDeliveryId);
            }
          }
        }

        if (result?.jobs && result.jobs.length > 0) {
          if (!options.jobRuntime) {
            throw new Error(`Subscriber '${subscriber.id}' returned jobs but no job runtime is configured.`);
          }
          options.jobRuntime.enqueueMany(result.jobs);
          summary.enqueuedJobs += result.jobs.length;
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        delivery.lastError = reason;
        delivery.updatedAt = new Date().toISOString();

        if (delivery.attemptCount >= (subscriber.retryPolicy?.attempts ?? 1)) {
          delivery.status = "dead-letter";
          const deadLetterId = randomUUID();
          deadLetters.set(deadLetterId, {
            id: deadLetterId,
            eventId: delivery.eventId,
            subscriptionId: delivery.subscriptionId,
            reason,
            attemptCount: delivery.attemptCount,
            failedAt: delivery.updatedAt
          });
          refreshOutbox(event.id);
          summary.deadLettered += 1;
        } else {
          delivery.status = "retrying";
          refreshOutbox(event.id);
          summary.retried += 1;
        }
      }
    }

    return summary;
  }

  function listOutbox(): EventOutboxRecord[] {
    return [...outbox.values()].map((record) => ({
      ...record,
      payload: normalizeActionInput(record.payload)
    }));
  }

  function listDeliveries(): EventDeliveryRecord[] {
    return [...deliveries.values()].map((record) => ({
      ...record
    }));
  }

  function listDeadLetters(): EventDeadLetterRecord[] {
    return [...deadLetters.values()].map((record) => ({
      ...record
    }));
  }

  function replayDeadLetter(deadLetterId: string): EventDeliveryRecord {
    const deadLetter = deadLetters.get(deadLetterId);
    if (!deadLetter) {
      throw new Error(`Unknown dead-letter record '${deadLetterId}'.`);
    }

    deadLetters.delete(deadLetterId);
    const delivery = [...deliveries.values()].find(
      (record) => record.eventId === deadLetter.eventId && record.subscriptionId === deadLetter.subscriptionId
    );
    if (!delivery) {
      throw new Error(`Missing delivery for dead-letter record '${deadLetterId}'.`);
    }

    delivery.status = "retrying";
    delivery.attemptCount = 0;
    delivery.updatedAt = new Date().toISOString();
    delete delivery.lastError;
    const event = events.get(delivery.eventId);
    if (event) {
      refreshOutbox(event.id);
    }
    return {
      ...delivery
    };
  }

  return {
    subscribe,
    append,
    appendMany,
    drain,
    listOutbox,
    listDeliveries,
    listDeadLetters,
    replayDeadLetter
  };

  function appendInternal(input: EventEnvelopeInput, tenantId: string | null) {
    const event = createEventEnvelope(input);
    events.set(event.id, event);

    const record = createOutboxRecord(event, tenantId);
    const matchingSubscribers = [...subscribers.values()].filter((subscriber) => subscriber.eventType === event.type);
    record.subscriberCount = matchingSubscribers.length;

    const deliveryIds: string[] = [];
    for (const subscriber of matchingSubscribers) {
      const deliveryId = randomUUID();
      deliveryIds.push(deliveryId);
      deliveries.set(deliveryId, {
        id: deliveryId,
        eventId: event.id,
        subscriptionId: subscriber.id,
        status: "pending",
        attemptCount: 0,
        updatedAt: record.updatedAt
      });
    }

    if (matchingSubscribers.length === 0) {
      record.status = "processed";
    }

    outbox.set(record.id, record);
    return {
      event,
      record,
      deliveryIds
    };
  }

  function refreshOutbox(eventId: string) {
    const record = [...outbox.values()].find((entry) => entry.eventId === eventId);
    if (!record) {
      return;
    }

    const eventDeliveries = [...deliveries.values()].filter((delivery) => delivery.eventId === eventId);
    record.deliveredCount = eventDeliveries.filter((delivery) => delivery.status === "processed").length;
    if (eventDeliveries.some((delivery) => delivery.status === "pending" || delivery.status === "retrying")) {
      record.status = "pending";
    } else if (eventDeliveries.some((delivery) => delivery.status === "dead-letter")) {
      record.status = "dead-letter";
    } else {
      record.status = "processed";
    }
    record.updatedAt = new Date().toISOString();
  }
}

function deriveTenantId(event: EventEnvelope): string | null {
  const tenantId = event.correlation?.tenantId;
  return typeof tenantId === "string" && tenantId.length > 0 ? tenantId : null;
}

function resolveEventIdempotencyKey(event: EventEnvelope): string {
  const metadataKey = event.metadata?.idempotencyKey;
  if (typeof metadataKey === "string" && metadataKey.length > 0) {
    return metadataKey;
  }

  const correlationKey = event.correlation?.idempotencyKey;
  if (typeof correlationKey === "string" && correlationKey.length > 0) {
    return correlationKey;
  }

  return event.id;
}
