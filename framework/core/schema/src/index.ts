export type SchemaLike<T = unknown> = {
  parse(value: unknown): T;
  _def?: unknown;
};

type AiMetadata = {
  purpose?: string | undefined;
  riskLevel?: "low" | "moderate" | "high" | "critical" | undefined;
  approvalMode?: "none" | "required" | "conditional" | undefined;
  toolPolicies?: string[] | undefined;
  outputRedactionPathHints?: string[] | undefined;
  groundingInputs?:
    | Array<{
        sourceId: string;
        label?: string | undefined;
        required?: boolean | undefined;
        freshnessWindowMs?: number | undefined;
      }>
    | undefined;
  resultSummaryHint?: string | undefined;
  curatedReadModel?: string | undefined;
  replay?:
    | {
        deterministic?: boolean | undefined;
        includeInputHash?: boolean | undefined;
        includeOutputHash?: boolean | undefined;
        note?: string | undefined;
      }
    | undefined;
  [key: string]: unknown;
};

type ActionHandler<TInput, TOutput> = {
  bivarianceHack(context: { input: TInput; services?: Record<string, unknown> | undefined }): Promise<TOutput> | TOutput;
}["bivarianceHack"];

export type ActionDefinition<TInput = unknown, TOutput = unknown> = {
  id: string;
  input?: SchemaLike<TInput> | undefined;
  output?: SchemaLike<TOutput> | undefined;
  permission?: string | undefined;
  idempotent?: boolean | undefined;
  audit?: boolean | undefined;
  ai?: AiMetadata | undefined;
  handler: ActionHandler<TInput, TOutput>;
  [key: string]: unknown;
};

export type ResourceDefinition<TContract = unknown> = {
  id: string;
  table?: unknown;
  contract?: TContract;
  ai?:
    | {
        purpose?: string | undefined;
        curatedReadModel?: boolean | undefined;
        [key: string]: unknown;
      }
    | undefined;
  fields?: Record<
    string,
    {
      label?: string | undefined;
      filter?: string | undefined;
      searchable?: boolean | undefined;
      sortable?: boolean | undefined;
      [key: string]: unknown;
    }
  >;
  admin?:
    | {
        defaultColumns?: string[] | undefined;
        [key: string]: unknown;
      }
    | undefined;
  [key: string]: unknown;
};

export function defineAction<TInput = unknown, TOutput = unknown>(
  definition: ActionDefinition<TInput, TOutput>
): Readonly<ActionDefinition<TInput, TOutput>> {
  return Object.freeze({
    ...definition
  });
}

export async function executeAction<TInput = unknown, TOutput = unknown>(
  action: ActionDefinition<TInput, TOutput>,
  input: unknown,
  context: { services?: Record<string, unknown> | undefined } = {}
): Promise<TOutput> {
  const normalized = isSchemaLike<TInput>(action.input) ? action.input.parse(input) : normalizeActionInput(input as TInput);
  const result = await action.handler({
    input: normalized,
    services: context.services
  });
  return isSchemaLike<TOutput>(action.output) ? action.output.parse(result) : result;
}

export function normalizeActionInput<T>(input: T): T {
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    return input;
  }

  return JSON.parse(JSON.stringify(input)) as T;
}

export function defineResource<TContract>(
  definition: ResourceDefinition<TContract>
): Readonly<ResourceDefinition<TContract>> {
  return Object.freeze({
    ...definition
  });
}

export function toJsonSchema(schema: unknown): Record<string, unknown> {
  return convertZodSchema(schema);
}

function convertZodSchema(schema: unknown): Record<string, unknown> {
  const definition =
    schema && typeof schema === "object" ? (((schema as { _def?: unknown })._def as Record<string, unknown> | undefined) ?? {}) : {};
  const typeName = String(definition.typeName ?? definition.type ?? "");

  if (typeName.includes("ZodString")) {
    return { type: "string" };
  }
  if (typeName.includes("ZodNumber")) {
    return { type: "number" };
  }
  if (typeName.includes("ZodBoolean")) {
    return { type: "boolean" };
  }
  if (typeName.includes("ZodLiteral")) {
    return { const: definition.value };
  }
  if (typeName.includes("ZodEnum")) {
    return { type: "string", enum: definition.values };
  }
  if (typeName.includes("ZodArray")) {
    return {
      type: "array",
      items: convertZodSchema(definition.type)
    };
  }
  if (typeName.includes("ZodRecord")) {
    return {
      type: "object",
      additionalProperties: convertZodSchema(definition.valueType)
    };
  }
  if (typeName.includes("ZodObject")) {
    const shapeFactory = definition.shape;
    const shape = typeof shapeFactory === "function" ? shapeFactory() : shapeFactory;
    const properties = Object.fromEntries(
      Object.entries((shape as Record<string, unknown>) ?? {}).map(([key, value]) => [key, convertZodSchema(value)])
    );
    return {
      type: "object",
      properties,
      required: Object.keys((shape as Record<string, unknown>) ?? {})
    };
  }
  if (typeName.includes("ZodUnion")) {
    return {
      anyOf: Array.isArray(definition.options) ? definition.options.map((option) => convertZodSchema(option)) : []
    };
  }
  if (typeName.includes("ZodOptional") || typeName.includes("ZodNullable")) {
    return convertZodSchema(definition.innerType);
  }
  if (typeName.includes("ZodDefault")) {
    return convertZodSchema(definition.innerType);
  }

  return {
    type: "object"
  };
}

function isSchemaLike<T>(schema: unknown): schema is SchemaLike<T> {
  return typeof schema === "object" && schema !== null && "parse" in schema && typeof (schema as { parse?: unknown }).parse === "function";
}
