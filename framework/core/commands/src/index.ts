import type { EventEnvelopeInput, EventOutboxRecord } from "@platform/events";
import type { EnqueueJobInput, JobRecord } from "@platform/jobs";
import type { SchemaLike } from "@platform/schema";
import { normalizeActionInput } from "@platform/schema";

export type CommandHandlerResult<TOutput> =
  | TOutput
  | {
      output: TOutput;
      events?: EventEnvelopeInput[] | undefined;
      jobs?: EnqueueJobInput[] | undefined;
    };

type CommandHandler<TInput, TOutput> = {
  bivarianceHack(
    context: { input: TInput; services?: Record<string, unknown> | undefined }
  ): Promise<CommandHandlerResult<TOutput>> | CommandHandlerResult<TOutput>;
}["bivarianceHack"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RuntimeCommandDefinition = CommandDefinition<any, any>;

export type CommandDefinition<TInput = unknown, TOutput = unknown> = {
  id: string;
  input?: SchemaLike<TInput> | undefined;
  output?: SchemaLike<TOutput> | undefined;
  idempotent?: boolean | undefined;
  permission?: string | undefined;
  handler: CommandHandler<TInput, TOutput>;
  [key: string]: unknown;
};

export type CommandDispatchReceipt<TOutput = unknown> = {
  commandId: string;
  duplicate: boolean;
  output: TOutput;
  events: EventOutboxRecord[];
  jobs: JobRecord[];
};

export function defineCommand<TInput = unknown, TOutput = unknown>(
  definition: CommandDefinition<TInput, TOutput>
): Readonly<CommandDefinition<TInput, TOutput>> {
  return Object.freeze({
    ...definition
  });
}

export function createInMemoryCommandBus(options: {
  commands?: readonly RuntimeCommandDefinition[] | undefined;
  eventBus?:
    | {
        append(input: EventEnvelopeInput, tenantId?: string | null): EventOutboxRecord;
      }
    | undefined;
  jobRuntime?:
    | {
        enqueue(input: EnqueueJobInput): JobRecord;
      }
    | undefined;
  services?: Record<string, unknown> | undefined;
} = {}) {
  const commands = new Map<string, RuntimeCommandDefinition>((options.commands ?? []).map((command) => [command.id, command]));
  const idempotencyCache = new Map<string, CommandDispatchReceipt>();

  function register(command: RuntimeCommandDefinition) {
    commands.set(command.id, command);
    return command;
  }

  async function dispatch<TOutput = unknown>(input: {
    commandId: string;
    payload: unknown;
    idempotencyKey?: string | undefined;
  }): Promise<CommandDispatchReceipt<TOutput>> {
    const command = commands.get(input.commandId);
    if (!command) {
      throw new Error(`Unknown command '${input.commandId}'.`);
    }

    const cacheKey = input.idempotencyKey && command.idempotent ? `${command.id}:${input.idempotencyKey}` : undefined;
    if (cacheKey && idempotencyCache.has(cacheKey)) {
      const cached = idempotencyCache.get(cacheKey) as CommandDispatchReceipt<TOutput>;
      return {
        ...cached,
        duplicate: true
      };
    }

    const normalizedInput = command.input ? command.input.parse(input.payload) : normalizeActionInput(input.payload);
    const rawResult = await command.handler({
      input: normalizedInput,
      services: options.services
    });
    const result = normalizeCommandResult(rawResult);
    const output = (command.output ? command.output.parse(result.output) : result.output) as TOutput;

    const events: EventOutboxRecord[] = [];
    for (const event of result.events) {
      if (!options.eventBus) {
        throw new Error(`Command '${command.id}' returned events but no event bus is configured.`);
      }
      const tenantId =
        typeof event.correlation?.tenantId === "string" && event.correlation.tenantId.length > 0 ? event.correlation.tenantId : null;
      events.push(options.eventBus.append(event, tenantId));
    }

    const jobs: JobRecord[] = [];
    for (const job of result.jobs) {
      if (!options.jobRuntime) {
        throw new Error(`Command '${command.id}' returned jobs but no job runtime is configured.`);
      }
      jobs.push(options.jobRuntime.enqueue(job));
    }

    const receipt: CommandDispatchReceipt<TOutput> = {
      commandId: command.id,
      duplicate: false,
      output,
      events,
      jobs
    };

    if (cacheKey) {
      idempotencyCache.set(cacheKey, receipt);
    }

    return receipt;
  }

  return {
    register,
    dispatch
  };
}

function normalizeCommandResult<TOutput>(input: CommandHandlerResult<TOutput>): {
  output: TOutput;
  events: EventEnvelopeInput[];
  jobs: EnqueueJobInput[];
} {
  if (input && typeof input === "object" && "output" in input) {
    const normalized = input as {
      output: TOutput;
      events?: EventEnvelopeInput[] | undefined;
      jobs?: EnqueueJobInput[] | undefined;
    };
    return {
      output: normalized.output,
      events: [...(normalized.events ?? [])],
      jobs: [...(normalized.jobs ?? [])]
    };
  }

  return {
    output: input as TOutput,
    events: [],
    jobs: []
  };
}
