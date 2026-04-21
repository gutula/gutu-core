import { randomUUID } from "node:crypto";

import type { SchemaLike } from "@platform/schema";
import { normalizeActionInput } from "@platform/schema";

export type JobRetryBackoff = "immediate" | "linear" | "exponential";

export type JobRetryPolicy = {
  attempts: number;
  backoff: JobRetryBackoff;
  delayMs: number;
};

type JobHandler<TPayload, TResult> = {
  bivarianceHack(context: { payload: TPayload; services?: Record<string, unknown> | undefined }): Promise<TResult> | TResult;
}["bivarianceHack"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RuntimeJobDefinition = JobDefinition<any, any>;

export type JobDefinition<TPayload = unknown, TResult = unknown> = {
  id: string;
  queue: string;
  payload?: SchemaLike<TPayload> | undefined;
  concurrency?: number | undefined;
  retryPolicy?: JobRetryPolicy | undefined;
  timeoutMs?: number | undefined;
  handler?: JobHandler<TPayload, TResult> | undefined;
  [key: string]: unknown;
};

export type WorkflowDefinition = {
  id: string;
  initialState: string;
  states: Record<string, { on?: Record<string, string> | undefined }>;
  [key: string]: unknown;
};

export type EnqueueJobInput = {
  definitionId: string;
  payload: unknown;
  runAt?: string | undefined;
  jobId?: string | undefined;
};

export type JobStatus = "queued" | "running" | "succeeded" | "retrying" | "dead-letter";

export type JobRecord = {
  id: string;
  definitionId: string;
  queue: string;
  payload: unknown;
  status: JobStatus;
  attemptCount: number;
  maxAttempts: number;
  runAt?: string | undefined;
  result?: unknown;
  lastError?: string | undefined;
  createdAt: string;
  updatedAt: string;
};

export type JobDeadLetterRecord = {
  id: string;
  jobId: string;
  definitionId: string;
  reason: string;
  attemptCount: number;
  failedAt: string;
};

export type JobDrainSummary = {
  processed: number;
  succeeded: number;
  retried: number;
  deadLettered: number;
};

export function defineJob<TPayload = unknown, TResult = unknown>(
  definition: JobDefinition<TPayload, TResult>
): Readonly<JobDefinition<TPayload, TResult>> {
  return Object.freeze({
    ...definition
  });
}

export function defineWorkflow<T extends WorkflowDefinition>(definition: T): Readonly<T> {
  validateWorkflowDefinition(definition);
  return Object.freeze({
    ...definition
  });
}

export function getWorkflowTransition(
  workflow: WorkflowDefinition,
  currentState: string,
  transition: string
): string {
  const state = workflow.states[currentState];
  const nextState = state?.on?.[transition];
  if (!nextState) {
    throw new Error(`State '${currentState}' cannot execute transition '${transition}'.`);
  }

  return nextState;
}

export function calculateNextRunAt(
  attemptedAt: string,
  attemptCount: number,
  retryPolicy: JobRetryPolicy
): string {
  const multiplier =
    retryPolicy.backoff === "exponential" ? 2 ** Math.max(0, attemptCount - 1) : retryPolicy.backoff === "linear" ? attemptCount : 1;
  return new Date(Date.parse(attemptedAt) + retryPolicy.delayMs * multiplier).toISOString();
}

export function createInMemoryJobRuntime(runtimeOptions: {
  definitions?: readonly RuntimeJobDefinition[] | undefined;
  services?: Record<string, unknown> | undefined;
} = {}) {
  const definitions = new Map<string, RuntimeJobDefinition>((runtimeOptions.definitions ?? []).map((definition) => [definition.id, definition]));
  const jobs: JobRecord[] = [];
  const deadLetters: JobDeadLetterRecord[] = [];

  function register(definition: RuntimeJobDefinition) {
    definitions.set(definition.id, definition);
    return definition;
  }

  function enqueue(input: EnqueueJobInput): JobRecord {
    const definition = definitions.get(input.definitionId);
    if (!definition) {
      throw new Error(`Unknown job definition '${input.definitionId}'.`);
    }

    const timestamp = new Date().toISOString();
    const payload = normalizePayload(definition.payload, input.payload);
    const record: JobRecord = {
      id: input.jobId ?? randomUUID(),
      definitionId: definition.id,
      queue: definition.queue,
      payload,
      status: "queued",
      attemptCount: 0,
      maxAttempts: definition.retryPolicy?.attempts ?? 1,
      ...(input.runAt ? { runAt: input.runAt } : {}),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    jobs.push(record);
    return cloneJobRecord(record);
  }

  function enqueueMany(inputs: readonly EnqueueJobInput[]): JobRecord[] {
    return inputs.map((input) => enqueue(input));
  }

  async function drain(options: { now?: string | Date | undefined } = {}): Promise<JobDrainSummary> {
    const now = toIsoTimestamp(options.now);
    const summary: JobDrainSummary = {
      processed: 0,
      succeeded: 0,
      retried: 0,
      deadLettered: 0
    };

    const eligibleJobs = jobs.filter((job) => isEligible(job, now));
    for (const job of eligibleJobs) {
      const definition = definitions.get(job.definitionId);
      if (!definition) {
        throw new Error(`Unknown job definition '${job.definitionId}'.`);
      }

      const nextAttempt = job.attemptCount + 1;
      job.attemptCount = nextAttempt;
      job.status = "running";
      job.updatedAt = now;

      try {
        const result = await withTimeout(
          async () =>
            definition.handler?.({
              payload: normalizePayload(definition.payload, job.payload),
              services: runtimeOptions.services
            }),
          definition.timeoutMs
        );

        job.status = "succeeded";
        job.updatedAt = now;
        if (result !== undefined) {
          job.result = result;
        }
        summary.processed += 1;
        summary.succeeded += 1;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        job.lastError = reason;
        job.updatedAt = now;
        summary.processed += 1;

        if (nextAttempt >= (definition.retryPolicy?.attempts ?? 1)) {
          job.status = "dead-letter";
          deadLetters.push({
            id: randomUUID(),
            jobId: job.id,
            definitionId: job.definitionId,
            reason,
            attemptCount: nextAttempt,
            failedAt: now
          });
          summary.deadLettered += 1;
        } else {
          job.status = "retrying";
          job.runAt = calculateNextRunAt(now, nextAttempt, definition.retryPolicy ?? defaultRetryPolicy());
          summary.retried += 1;
        }
      }
    }

    return summary;
  }

  function listJobs(): JobRecord[] {
    return jobs.map((record) => cloneJobRecord(record));
  }

  function listDeadLetters(): JobDeadLetterRecord[] {
    return deadLetters.map((record) => ({
      ...record
    }));
  }

  function replayDeadLetter(deadLetterId: string, options: { now?: string | Date | undefined } = {}): JobRecord {
    const index = deadLetters.findIndex((entry) => entry.id === deadLetterId);
    if (index < 0) {
      throw new Error(`Unknown dead-letter record '${deadLetterId}'.`);
    }

    const deadLetter = deadLetters.splice(index, 1)[0] as JobDeadLetterRecord;
    const job = jobs.find((entry) => entry.id === deadLetter.jobId);
    if (!job) {
      throw new Error(`Cannot replay missing job '${deadLetter.jobId}'.`);
    }

    const now = toIsoTimestamp(options.now);
    job.status = "queued";
    job.attemptCount = 0;
    job.runAt = now;
    job.updatedAt = now;
    delete job.lastError;
    return cloneJobRecord(job);
  }

  return {
    register,
    enqueue,
    enqueueMany,
    drain,
    listJobs,
    listDeadLetters,
    replayDeadLetter
  };
}

function validateWorkflowDefinition(definition: WorkflowDefinition) {
  if (!definition.states[definition.initialState]) {
    throw new Error(`Workflow '${definition.id}' is missing initial state '${definition.initialState}'.`);
  }

  for (const [stateName, state] of Object.entries(definition.states)) {
    for (const [transition, target] of Object.entries(state.on ?? {})) {
      if (!definition.states[target]) {
        throw new Error(`Workflow '${definition.id}' transition '${stateName}.${transition}' targets missing state '${target}'.`);
      }
    }
  }
}

function isEligible(job: JobRecord, now: string): boolean {
  if (job.status !== "queued" && job.status !== "retrying") {
    return false;
  }

  return !job.runAt || Date.parse(job.runAt) <= Date.parse(now);
}

function normalizePayload<T>(schema: SchemaLike<T> | undefined, input: unknown): T | unknown {
  if (schema) {
    return schema.parse(input);
  }

  return normalizeActionInput(input);
}

async function withTimeout<T>(callback: () => Promise<T> | T, timeoutMs: number | undefined): Promise<T | undefined> {
  if (!timeoutMs || timeoutMs <= 0) {
    return callback();
  }

  return Promise.race([
    Promise.resolve().then(() => callback()),
    new Promise<undefined>((_, reject) => {
      const timer = setTimeout(() => {
        clearTimeout(timer);
        reject(new Error(`Job timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
    })
  ]);
}

function cloneJobRecord(record: JobRecord): JobRecord {
  return {
    ...record,
    payload: normalizeActionInput(record.payload),
    ...(record.result === undefined ? {} : { result: normalizeActionInput(record.result) })
  };
}

function defaultRetryPolicy(): JobRetryPolicy {
  return {
    attempts: 2,
    backoff: "immediate",
    delayMs: 0
  };
}

function toIsoTimestamp(input?: string | Date): string {
  if (input instanceof Date) {
    return input.toISOString();
  }

  return input ?? new Date().toISOString();
}
