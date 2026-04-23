import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

import {
  definePackManifest,
  definePackageManifest,
  type PackEnvironmentScope,
  type PackManifest,
  type PackManifestInput,
  type PackMergeStrategy,
  type PackObjectIdentity,
  type PackPreviewSummary,
  type PackRollbackSnapshot,
  type PackageManifest,
  type PackageManifestInput
} from "@platform/kernel";
import { normalizeActionInput } from "@platform/schema";
import { buildBusinessRuntimeMigrationSql } from "./postgres";
import { buildBusinessRuntimeSqliteMigrationSql } from "./sqlite";

export const packageId = "business-runtime" as const;
export const packageDisplayName = "Business Runtime" as const;
export const packageDescription =
  "Shared numbering, localization, import, pack, contract, traceability, and reconciliation primitives for business plugins." as const;

export { definePackManifest, definePackageManifest };
export * from "./postgres";
export * from "./sqlite";

export function resolveStateDirectory(): string {
  return path.resolve(process.env.GUTU_STATE_DIR ?? path.join(process.cwd(), ".gutu", "state"));
}

export function resolveStateFile(fileName: string): string {
  return path.join(resolveStateDirectory(), fileName);
}

export function loadJsonState<TState>(fileName: string, seedFactory: () => TState): TState {
  const filePath = resolveStateFile(fileName);
  if (!existsSync(filePath)) {
    const seededState = seedFactory();
    saveJsonState(fileName, seededState);
    return structuredClone(seededState);
  }

  return JSON.parse(readFileSync(filePath, "utf8")) as TState;
}

export function saveJsonState<TState>(fileName: string, state: TState): void {
  const filePath = resolveStateFile(fileName);
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  renameSync(tempPath, filePath);
}

export function updateJsonState<TState>(
  fileName: string,
  seedFactory: () => TState,
  updater: (current: TState) => TState
): TState {
  const current = loadJsonState(fileName, seedFactory);
  const next = updater(structuredClone(current));
  saveJsonState(fileName, next);
  return structuredClone(next);
}

export type NumberSeriesDefinition = {
  id: string;
  docType: string;
  pattern: string;
  sequencePadding?: number | undefined;
  allocationMode?: "draft" | "posting" | undefined;
  nextSequence?: number | undefined;
  scope?: {
    company?: boolean | undefined;
    branch?: boolean | undefined;
    fiscalYear?: boolean | undefined;
  };
};

export type NumberingContext = {
  companyId?: string | undefined;
  branchId?: string | undefined;
  fiscalYear?: string | undefined;
  date?: string | undefined;
};

export type NumberAllocation = {
  id: string;
  seriesId: string;
  docType: string;
  scopeKey: string;
  sequence: number;
  value: string;
  status: "allocated" | "void";
  allocatedAt: string;
  idempotencyKey?: string | undefined;
  reasonCode?: string | undefined;
  voidedAt?: string | undefined;
};

export type CurrencyDefinition = {
  code: string;
  precision?: number | undefined;
  symbol?: string | undefined;
  label?: string | undefined;
};

export type ExchangeRateDefinition = {
  id?: string | undefined;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  effectiveAt: string;
  source: string;
  tenantId?: string | null | undefined;
};

export type TaxRuleDefinition = {
  id: string;
  category: string;
  rate: number;
  priority?: number | undefined;
  conditions?: Record<string, string | number | boolean | null> | undefined;
};

export type TaxRegimeDefinition = {
  id: string;
  countryCode: string;
  currencyCode: string;
  rules: TaxRuleDefinition[];
};

export type MoneyConversionResult = {
  amountMinor: number;
  rate: number;
  fromCurrency: string;
  toCurrency: string;
  effectiveAt: string;
  source: string;
};

export type TaxResolutionResult = {
  regimeId: string;
  ruleId: string;
  rate: number;
  amountMinor: number;
  totalAmountMinor: number;
};

export type BusinessDocumentLink = {
  id: string;
  tenantId: string;
  sourceDocumentId: string;
  targetDocumentId: string;
  relation: string;
  createdAt: string;
  correlationId?: string | undefined;
  processId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
};

export type ReconciliationItem = {
  id: string;
  tenantId: string;
  pluginId: string;
  documentId: string;
  severity: "info" | "warning" | "critical";
  status: "open" | "in-progress" | "resolved" | "closed";
  reasonCode: string;
  createdAt: string;
  updatedAt: string;
  correlationId?: string | undefined;
  processId?: string | undefined;
  ownerId?: string | undefined;
};

export type TraceabilityLineage = {
  nodes: string[];
  edges: BusinessDocumentLink[];
};

export type ImportRowStatus = "staged" | "validated" | "quarantined" | "committed" | "rolled-back";

export type ImportBatchRow = {
  id: string;
  naturalKey: string | null;
  payload: unknown;
  status: ImportRowStatus;
  errors: string[];
  receipt?: unknown;
  compensation?: unknown;
};

export type ImportBatch = {
  id: string;
  entity: string;
  status: "staged" | "validated" | "partially-committed" | "committed" | "rolled-back";
  createdAt: string;
  updatedAt: string;
  rows: ImportBatchRow[];
};

export type RowValidationResult = {
  ok: boolean;
  errors?: string[] | undefined;
};

export type CommitRowResult = {
  receipt?: unknown;
  compensation?: unknown;
};

export type PackRuntimeObject<TPayload = unknown> = PackObjectIdentity & {
  immutable?: boolean | undefined;
  payload: TPayload;
};

export type PackApplyOperation = {
  objectKey: string;
  action: "add" | "update" | "replace" | "blocked";
  strategy: PackMergeStrategy;
  warning?: string | undefined;
};

export type PackRuntimePreview = PackPreviewSummary & {
  operations: PackApplyOperation[];
};

export type PackRollbackEntry = {
  objectKey: string;
  before: PackRuntimeObject | null;
};

export type DetailedPackRollbackSnapshot = PackRollbackSnapshot & {
  packName: string;
  packVersion: string;
  entries: PackRollbackEntry[];
};

export type BusinessOutboxStatus = "pending" | "processed" | "dead-letter";
export type BusinessInboxStatus = "pending" | "retrying" | "processed" | "dead-letter";
export type BusinessProjectionStatus = "pending" | "materialized" | "stale";

export type BusinessOutboxMessage = {
  id: string;
  tenantId: string;
  pluginId: string;
  documentId: string;
  type: string;
  payload: unknown;
  correlationId?: string | undefined;
  processId?: string | undefined;
  status: BusinessOutboxStatus;
  consumerCount: number;
  deliveredCount: number;
  createdAt: string;
  updatedAt: string;
};

export type BusinessInboxItem = {
  id: string;
  messageId: string;
  tenantId: string;
  pluginId: string;
  documentId: string;
  target: string;
  status: BusinessInboxStatus;
  attemptCount: number;
  lastError?: string | undefined;
  updatedAt: string;
};

export type BusinessDeadLetterRecord = {
  id: string;
  messageId: string;
  inboxId: string;
  tenantId: string;
  pluginId: string;
  documentId: string;
  target: string;
  reason: string;
  attemptCount: number;
  failedAt: string;
};

export type BusinessProjectionRecord = {
  id: string;
  tenantId: string;
  pluginId: string;
  documentId: string;
  projectionKey: string;
  status: BusinessProjectionStatus;
  relatedMessageIds: string[];
  summary: Record<string, unknown>;
  updatedAt: string;
};

export type BusinessOrchestrationState = {
  outbox: BusinessOutboxMessage[];
  inbox: BusinessInboxItem[];
  deadLetters: BusinessDeadLetterRecord[];
  projections: BusinessProjectionRecord[];
};

export type BusinessOrchestrationSummary = {
  outbox: Record<BusinessOutboxStatus | "total", number>;
  inbox: Record<BusinessInboxStatus | "total", number>;
  deadLetters: number;
  projections: Record<BusinessProjectionStatus | "total", number>;
  pendingTargets: string[];
};

export type BusinessPrimaryRecordLike = {
  id: string;
  tenantId: string;
  title: string;
  counterpartyId: string;
  companyId: string;
  branchId: string;
  recordState: string;
  approvalState: string;
  postingState: string;
  fulfillmentState: string;
  amountMinor: number;
  currencyCode: string;
  revisionNo: number;
  reasonCode: string | null;
  effectiveAt: string;
  correlationId: string;
  processId: string;
  upstreamRefs: string[];
  downstreamRefs: string[];
  updatedAt: string;
};

export type BusinessSecondaryRecordLike = {
  id: string;
  tenantId: string;
  primaryRecordId: string;
  label: string;
  status: string;
  requestedAction: string;
  reasonCode: string | null;
  correlationId: string;
  processId: string;
  updatedAt: string;
};

export type BusinessExceptionRecordLike = {
  id: string;
  tenantId: string;
  primaryRecordId: string;
  severity: string;
  status: string;
  reasonCode: string;
  upstreamRef: string | null;
  downstreamRef: string | null;
  updatedAt: string;
};

export type BusinessPluginState<
  TPrimary extends BusinessPrimaryRecordLike = BusinessPrimaryRecordLike,
  TSecondary extends BusinessSecondaryRecordLike = BusinessSecondaryRecordLike,
  TException extends BusinessExceptionRecordLike = BusinessExceptionRecordLike
> = {
  primaryRecords: TPrimary[];
  secondaryRecords: TSecondary[];
  exceptionRecords: TException[];
  orchestration: BusinessOrchestrationState;
};

export type BusinessCreatePrimaryRecordInput = {
  tenantId: string;
  actorId: string;
  recordId: string;
  title: string;
  counterpartyId: string;
  companyId: string;
  branchId: string;
  amountMinor: number;
  currencyCode: string;
  effectiveAt: string;
  correlationId: string;
  processId: string;
  upstreamRefs?: string[] | undefined;
  reasonCode?: string | undefined;
};

export type BusinessAdvancePrimaryRecordInput = {
  tenantId: string;
  actorId: string;
  recordId: string;
  expectedRevisionNo?: number | undefined;
  recordState?: string | undefined;
  approvalState?: string | undefined;
  postingState?: string | undefined;
  fulfillmentState?: string | undefined;
  downstreamRef?: string | undefined;
  reasonCode?: string | undefined;
};

export type BusinessPlacePrimaryRecordOnHoldInput = {
  tenantId: string;
  actorId: string;
  recordId: string;
  expectedRevisionNo?: number | undefined;
  reasonCode: string;
};

export type BusinessReleasePrimaryRecordHoldInput = {
  tenantId: string;
  actorId: string;
  recordId: string;
  expectedRevisionNo?: number | undefined;
  reasonCode?: string | undefined;
};

export type BusinessAmendPrimaryRecordInput = {
  tenantId: string;
  actorId: string;
  recordId: string;
  amendedRecordId: string;
  expectedRevisionNo?: number | undefined;
  title?: string | undefined;
  amountMinor?: number | undefined;
  effectiveAt?: string | undefined;
  reasonCode: string;
};

export type BusinessReversePrimaryRecordInput = {
  tenantId: string;
  actorId: string;
  recordId: string;
  reversalRecordId: string;
  expectedRevisionNo?: number | undefined;
  reasonCode: string;
};

export type BusinessReconcilePrimaryRecordInput = {
  tenantId: string;
  actorId: string;
  recordId: string;
  exceptionId: string;
  expectedRevisionNo?: number | undefined;
  severity: string;
  reasonCode: string;
  upstreamRef?: string | undefined;
  downstreamRef?: string | undefined;
};

export type BusinessResolvePendingDownstreamItemInput = {
  tenantId: string;
  actorId: string;
  inboxId: string;
  resolutionRef?: string | undefined;
};

export type BusinessFailPendingDownstreamItemInput = {
  tenantId: string;
  actorId: string;
  inboxId: string;
  error: string;
  maxAttempts?: number | undefined;
};

export type BusinessReplayDeadLetterInput = {
  tenantId: string;
  actorId: string;
  deadLetterId: string;
};

export type BusinessStateStore<
  TPrimary extends BusinessPrimaryRecordLike = BusinessPrimaryRecordLike,
  TSecondary extends BusinessSecondaryRecordLike = BusinessSecondaryRecordLike,
  TException extends BusinessExceptionRecordLike = BusinessExceptionRecordLike
> = {
  engine: "sqlite" | "postgres";
  loadState(): Promise<BusinessPluginState<TPrimary, TSecondary, TException>>;
  updateState(
    updater:
      | ((
          current: BusinessPluginState<TPrimary, TSecondary, TException>
        ) =>
          | BusinessPluginState<TPrimary, TSecondary, TException>
          | Promise<BusinessPluginState<TPrimary, TSecondary, TException>>)
  ): Promise<BusinessPluginState<TPrimary, TSecondary, TException>>;
  resetState(): Promise<void>;
};

export type BusinessPluginServiceConfig<
  TPrimary extends BusinessPrimaryRecordLike = BusinessPrimaryRecordLike,
  TSecondary extends BusinessSecondaryRecordLike = BusinessSecondaryRecordLike,
  TException extends BusinessExceptionRecordLike = BusinessExceptionRecordLike
> = {
  pluginId: string;
  displayName: string;
  primaryResourceId: string;
  secondaryResourceId: string;
  exceptionResourceId: string;
  createEvent: string;
  advanceEvent: string;
  reconcileEvent: string;
  projectionJobId: string;
  reconciliationJobId: string;
  advanceActionLabel: string;
  orchestrationTargets: {
    create: readonly string[];
    advance: readonly string[];
    reconcile: readonly string[];
  };
  store: BusinessStateStore<TPrimary, TSecondary, TException>;
};

export type BusinessDomainStateStoreOptions<
  TPrimary extends BusinessPrimaryRecordLike = BusinessPrimaryRecordLike,
  TSecondary extends BusinessSecondaryRecordLike = BusinessSecondaryRecordLike,
  TException extends BusinessExceptionRecordLike = BusinessExceptionRecordLike
> = {
  pluginId: string;
  sqlite: {
    primaryTable: string;
    secondaryTable: string;
    exceptionTable: string;
    dbFileName?: string | undefined;
    runtimeTablePrefix?: string | undefined;
  };
  postgres: {
    schemaName: string;
    runtimeSchemaName?: string | undefined;
    connectionString?: string | undefined;
  };
  seedStateFactory: () => BusinessPluginState<TPrimary, TSecondary, TException>;
};

export type ContractRegistryFinding = {
  severity: "error" | "warning";
  code:
    | "OWNERSHIP_CONFLICT"
    | "MISSING_DEPENDENCY"
    | "VERSION_MISMATCH"
    | "MISSING_CAPABILITY"
    | "DEPRECATED_PACKAGE_PRESENT"
    | "MISSING_PACK_DEPENDENCY"
    | "PACK_PLUGIN_CONSTRAINT";
  subject: string;
  message: string;
};

export type ContractRegistryReport = {
  ok: boolean;
  findings: ContractRegistryFinding[];
  capabilityProviders: Record<string, string[]>;
  dataOwners: Record<string, string[]>;
};

export function defineNumberSeries<T extends NumberSeriesDefinition>(definition: T): Readonly<T> {
  return Object.freeze({
    sequencePadding: definition.sequencePadding ?? 4,
    allocationMode: definition.allocationMode ?? "posting",
    nextSequence: definition.nextSequence ?? 1,
    scope: {
      company: definition.scope?.company ?? true,
      branch: definition.scope?.branch ?? true,
      fiscalYear: definition.scope?.fiscalYear ?? true
    },
    ...definition
  });
}

export function createNumberingRuntime(options: { series?: readonly NumberSeriesDefinition[] | undefined } = {}) {
  const series = new Map<string, NumberSeriesDefinition>();
  const counters = new Map<string, number>();
  const allocations = new Map<string, NumberAllocation>();
  const idempotency = new Map<string, string>();

  for (const definition of options.series ?? []) {
    registerSeries(definition);
  }

  function registerSeries(definition: NumberSeriesDefinition): NumberSeriesDefinition {
    const normalized = defineNumberSeries(definition);
    series.set(normalized.id, normalized);
    return normalized;
  }

  function preview(input: { seriesId: string; context?: NumberingContext | undefined }): string {
    const definition = requireSeries(input.seriesId);
    const scopeKey = createScopeKey(definition, input.context);
    const sequence = findNextSequence(definition, scopeKey, input.context);
    return renderSeriesValue(definition, input.context, sequence);
  }

  function allocate(input: {
    seriesId: string;
    context?: NumberingContext | undefined;
    idempotencyKey?: string | undefined;
    allocatedAt?: string | undefined;
  }): NumberAllocation {
    const definition = requireSeries(input.seriesId);
    const context = input.context;
    const scopeKey = createScopeKey(definition, context);
    const idempotencyToken = input.idempotencyKey ? `${definition.id}:${scopeKey}:${input.idempotencyKey}` : null;

    if (idempotencyToken && idempotency.has(idempotencyToken)) {
      const allocationId = idempotency.get(idempotencyToken) as string;
      return cloneNumberAllocation(allocations.get(allocationId) as NumberAllocation);
    }

    const sequence = findNextSequence(definition, scopeKey, context);
    const allocation: NumberAllocation = {
      id: randomUUID(),
      seriesId: definition.id,
      docType: definition.docType,
      scopeKey,
      sequence,
      value: renderSeriesValue(definition, context, sequence),
      status: "allocated",
      allocatedAt: input.allocatedAt ?? new Date().toISOString(),
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {})
    };

    allocations.set(allocation.id, allocation);
    counters.set(counterKey(definition.id, scopeKey), sequence + 1);
    if (idempotencyToken) {
      idempotency.set(idempotencyToken, allocation.id);
    }
    return cloneNumberAllocation(allocation);
  }

  function voidAllocation(allocationId: string, reasonCode: string): NumberAllocation {
    const allocation = allocations.get(allocationId);
    if (!allocation) {
      throw new Error(`Unknown numbering allocation '${allocationId}'.`);
    }

    const nextAllocation: NumberAllocation = {
      ...allocation,
      status: "void",
      reasonCode,
      voidedAt: new Date().toISOString()
    };
    allocations.set(allocationId, nextAllocation);
    return cloneNumberAllocation(nextAllocation);
  }

  function listAllocations(seriesId?: string | undefined): NumberAllocation[] {
    return [...allocations.values()]
      .filter((entry) => !seriesId || entry.seriesId === seriesId)
      .map((entry) => cloneNumberAllocation(entry));
  }

  return {
    registerSeries,
    preview,
    allocate,
    voidAllocation,
    listAllocations
  };

  function requireSeries(seriesId: string): NumberSeriesDefinition {
    const definition = series.get(seriesId);
    if (!definition) {
      throw new Error(`Unknown numbering series '${seriesId}'.`);
    }
    return definition;
  }

  function findNextSequence(
    definition: NumberSeriesDefinition,
    scopeKey: string,
    context: NumberingContext | undefined
  ): number {
    let sequence = counters.get(counterKey(definition.id, scopeKey)) ?? definition.nextSequence ?? 1;
    while (numberValueExists(definition.id, renderSeriesValue(definition, context, sequence))) {
      sequence += 1;
    }
    return sequence;
  }

  function numberValueExists(seriesId: string, value: string): boolean {
    return [...allocations.values()].some((entry) => entry.seriesId === seriesId && entry.value === value);
  }
}

export function createLocalizationRuntime(options: {
  currencies?: readonly CurrencyDefinition[] | undefined;
  exchangeRates?: readonly ExchangeRateDefinition[] | undefined;
  taxRegimes?: readonly TaxRegimeDefinition[] | undefined;
} = {}) {
  const currencies = new Map<string, CurrencyDefinition>();
  const exchangeRates: ExchangeRateDefinition[] = [];
  const taxRegimes = new Map<string, TaxRegimeDefinition>();

  for (const currency of options.currencies ?? []) {
    registerCurrency(currency);
  }
  for (const rate of options.exchangeRates ?? []) {
    registerExchangeRate(rate);
  }
  for (const regime of options.taxRegimes ?? []) {
    registerTaxRegime(regime);
  }

  function registerCurrency(definition: CurrencyDefinition): CurrencyDefinition {
    const normalized = {
      precision: 2,
      ...definition
    };
    currencies.set(normalized.code, normalized);
    return { ...normalized };
  }

  function registerExchangeRate(definition: ExchangeRateDefinition): ExchangeRateDefinition {
    const normalized = {
      id: definition.id ?? randomUUID(),
      ...definition
    };
    exchangeRates.push(normalized);
    return { ...normalized };
  }

  function registerTaxRegime(definition: TaxRegimeDefinition): TaxRegimeDefinition {
    const normalized = {
      ...definition,
      rules: [...definition.rules].map((rule) => ({
        priority: 0,
        ...rule,
        conditions: rule.conditions ? { ...rule.conditions } : undefined
      }))
    };
    taxRegimes.set(normalized.id, normalized);
    return normalizeActionInput(normalized);
  }

  function resolveExchangeRate(input: {
    fromCurrency: string;
    toCurrency: string;
    effectiveAt?: string | undefined;
    tenantId?: string | null | undefined;
  }): ExchangeRateDefinition {
    if (input.fromCurrency === input.toCurrency) {
      return {
        id: "identity",
        fromCurrency: input.fromCurrency,
        toCurrency: input.toCurrency,
        rate: 1,
        effectiveAt: input.effectiveAt ?? new Date().toISOString(),
        source: "identity",
        tenantId: input.tenantId ?? null
      };
    }

    const effectiveAt = input.effectiveAt ?? new Date().toISOString();
    const direct = pickExchangeRate(exchangeRates, {
      fromCurrency: input.fromCurrency,
      toCurrency: input.toCurrency,
      effectiveAt,
      tenantId: input.tenantId
    });
    if (direct) {
      return { ...direct };
    }

    const inverse = pickExchangeRate(exchangeRates, {
      fromCurrency: input.toCurrency,
      toCurrency: input.fromCurrency,
      effectiveAt,
      tenantId: input.tenantId
    });
    if (!inverse) {
      throw new Error(`Missing exchange rate '${input.fromCurrency}->${input.toCurrency}' at '${effectiveAt}'.`);
    }

    return {
      id: `${inverse.id}:inverse`,
      fromCurrency: input.fromCurrency,
      toCurrency: input.toCurrency,
      rate: 1 / inverse.rate,
      effectiveAt: inverse.effectiveAt,
      source: `${inverse.source}:inverse`,
      tenantId: inverse.tenantId ?? null
    };
  }

  function convertMoney(input: {
    amountMinor: number;
    fromCurrency: string;
    toCurrency: string;
    effectiveAt?: string | undefined;
    tenantId?: string | null | undefined;
  }): MoneyConversionResult {
    const sourceCurrency = requireCurrency(input.fromCurrency);
    const targetCurrency = requireCurrency(input.toCurrency);
    const rate = resolveExchangeRate(input);
    const sourceMajor = input.amountMinor / 10 ** (sourceCurrency.precision ?? 2);
    const targetMajor = sourceMajor * rate.rate;
    return {
      amountMinor: Math.round(targetMajor * 10 ** (targetCurrency.precision ?? 2)),
      rate: rate.rate,
      fromCurrency: input.fromCurrency,
      toCurrency: input.toCurrency,
      effectiveAt: rate.effectiveAt,
      source: rate.source
    };
  }

  function determineTax(input: {
    regimeId: string;
    category: string;
    amountMinor: number;
    attributes?: Record<string, string | number | boolean | null> | undefined;
  }): TaxResolutionResult {
    const regime = taxRegimes.get(input.regimeId);
    if (!regime) {
      throw new Error(`Unknown tax regime '${input.regimeId}'.`);
    }

    const matchingRules = regime.rules
      .filter((rule) => rule.category === input.category || rule.category === "*")
      .filter((rule) => conditionsMatch(rule.conditions, input.attributes))
      .sort((left, right) => {
        const specificityDelta = countConditionKeys(right.conditions) - countConditionKeys(left.conditions);
        if (specificityDelta !== 0) {
          return specificityDelta;
        }
        return (right.priority ?? 0) - (left.priority ?? 0);
      });
    if (matchingRules.length === 0) {
      throw new Error(`No tax rule matched regime '${input.regimeId}' category '${input.category}'.`);
    }

    const rule = matchingRules[0] as TaxRuleDefinition;
    const amountMinor = Math.round(input.amountMinor * rule.rate);
    return {
      regimeId: regime.id,
      ruleId: rule.id,
      rate: rule.rate,
      amountMinor,
      totalAmountMinor: input.amountMinor + amountMinor
    };
  }

  return {
    registerCurrency,
    registerExchangeRate,
    registerTaxRegime,
    resolveExchangeRate,
    convertMoney,
    determineTax
  };

  function requireCurrency(currencyCode: string): CurrencyDefinition {
    const currency = currencies.get(currencyCode);
    if (!currency) {
      throw new Error(`Unknown currency '${currencyCode}'.`);
    }
    return currency;
  }
}

export function createTraceabilityRuntime(options: {
  links?: readonly BusinessDocumentLink[] | undefined;
  reconciliationItems?: readonly ReconciliationItem[] | undefined;
} = {}) {
  const links = new Map<string, BusinessDocumentLink>((options.links ?? []).map((entry) => [entry.id, cloneLink(entry)]));
  const reconciliation = new Map<string, ReconciliationItem>(
    (options.reconciliationItems ?? []).map((entry) => [entry.id, cloneReconciliationItem(entry)])
  );

  function recordLink(input: Omit<BusinessDocumentLink, "id" | "createdAt"> & { id?: string | undefined; createdAt?: string | undefined }) {
    const link: BusinessDocumentLink = {
      ...input,
      id: input.id ?? randomUUID(),
      createdAt: input.createdAt ?? new Date().toISOString(),
      ...(input.metadata ? { metadata: normalizeActionInput(input.metadata) } : {})
    };
    links.set(link.id, link);
    return cloneLink(link);
  }

  function listLinks(documentId?: string | undefined): BusinessDocumentLink[] {
    return [...links.values()]
      .filter((entry) => !documentId || entry.sourceDocumentId === documentId || entry.targetDocumentId === documentId)
      .map((entry) => cloneLink(entry));
  }

  function getLineage(documentId: string, options: { direction?: "upstream" | "downstream" | "both"; depth?: number | undefined } = {}): TraceabilityLineage {
    const direction = options.direction ?? "both";
    const depth = options.depth ?? 12;
    const nodes = new Set<string>([documentId]);
    const edges = new Map<string, BusinessDocumentLink>();
    const queue: Array<{ id: string; depth: number }> = [{ id: documentId, depth: 0 }];

    while (queue.length > 0) {
      const current = queue.shift() as { id: string; depth: number };
      if (current.depth >= depth) {
        continue;
      }

      for (const link of links.values()) {
        const isUpstream = link.targetDocumentId === current.id;
        const isDownstream = link.sourceDocumentId === current.id;
        if ((direction === "upstream" || direction === "both") && isUpstream) {
          edges.set(link.id, cloneLink(link));
          if (!nodes.has(link.sourceDocumentId)) {
            nodes.add(link.sourceDocumentId);
            queue.push({ id: link.sourceDocumentId, depth: current.depth + 1 });
          }
        }
        if ((direction === "downstream" || direction === "both") && isDownstream) {
          edges.set(link.id, cloneLink(link));
          if (!nodes.has(link.targetDocumentId)) {
            nodes.add(link.targetDocumentId);
            queue.push({ id: link.targetDocumentId, depth: current.depth + 1 });
          }
        }
      }
    }

    return {
      nodes: [...nodes],
      edges: [...edges.values()]
    };
  }

  function queueReconciliation(
    input: Omit<ReconciliationItem, "id" | "createdAt" | "updatedAt"> & {
      id?: string | undefined;
      createdAt?: string | undefined;
      updatedAt?: string | undefined;
    }
  ): ReconciliationItem {
    const timestamp = input.createdAt ?? new Date().toISOString();
    const item: ReconciliationItem = {
      ...input,
      id: input.id ?? randomUUID(),
      createdAt: timestamp,
      updatedAt: input.updatedAt ?? timestamp
    };
    reconciliation.set(item.id, item);
    return cloneReconciliationItem(item);
  }

  function transitionReconciliation(itemId: string, status: ReconciliationItem["status"], ownerId?: string | undefined): ReconciliationItem {
    const current = reconciliation.get(itemId);
    if (!current) {
      throw new Error(`Unknown reconciliation item '${itemId}'.`);
    }

    const nextItem: ReconciliationItem = {
      ...current,
      status,
      updatedAt: new Date().toISOString(),
      ...(ownerId ? { ownerId } : {})
    };
    reconciliation.set(itemId, nextItem);
    return cloneReconciliationItem(nextItem);
  }

  function listReconciliation(pluginId?: string | undefined): ReconciliationItem[] {
    return [...reconciliation.values()]
      .filter((entry) => !pluginId || entry.pluginId === pluginId)
      .map((entry) => cloneReconciliationItem(entry));
  }

  function summarizeReconciliation(pluginId?: string | undefined) {
    const items = listReconciliation(pluginId);
    return {
      total: items.length,
      byStatus: summarizeCounts(items.map((entry) => entry.status)),
      bySeverity: summarizeCounts(items.map((entry) => entry.severity))
    };
  }

  return {
    recordLink,
    listLinks,
    getLineage,
    queueReconciliation,
    transitionReconciliation,
    listReconciliation,
    summarizeReconciliation
  };
}

export function createBusinessDomainStateStore<
  TPrimary extends BusinessPrimaryRecordLike = BusinessPrimaryRecordLike,
  TSecondary extends BusinessSecondaryRecordLike = BusinessSecondaryRecordLike,
  TException extends BusinessExceptionRecordLike = BusinessExceptionRecordLike
>(
  options: BusinessDomainStateStoreOptions<TPrimary, TSecondary, TException>
): BusinessStateStore<TPrimary, TSecondary, TException> {
  const initialRuntimeConfig = resolveBusinessDomainStoreRuntimeConfig(options);
  const getRuntimeConfig = () => resolveBusinessDomainStoreRuntimeConfig(options);

  if (initialRuntimeConfig.engine === "postgres") {
    return {
      engine: "postgres",
      loadState: async () => {
        const runtimeConfig = getRuntimeConfig();
        if (runtimeConfig.engine !== "postgres") {
          throw new Error("Business state store runtime changed from postgres to sqlite after initialization.");
        }
        const state = await withPostgresBusinessStore(runtimeConfig, options, async (client) => {
          const loaded = await readPostgresBusinessPluginState(client, runtimeConfig, options);
          if (!businessPluginStateHasPersistedRows(loaded)) {
            const seeded = cloneBusinessPluginState(options.seedStateFactory());
            await writePostgresBusinessPluginState(client, runtimeConfig, options, seeded);
            return seeded;
          }
          return loaded;
        });
        return cloneBusinessPluginState(state);
      },
      updateState: async (updater) => {
        const runtimeConfig = getRuntimeConfig();
        if (runtimeConfig.engine !== "postgres") {
          throw new Error("Business state store runtime changed from postgres to sqlite after initialization.");
        }
        return await withPostgresBusinessStore(runtimeConfig, options, async (client) => {
          await client.raw.unsafe("BEGIN");
          try {
            const currentLoaded = await readPostgresBusinessPluginState(client, runtimeConfig, options);
            const current = businessPluginStateHasPersistedRows(currentLoaded)
              ? currentLoaded
              : cloneBusinessPluginState(options.seedStateFactory());
            const next = await updater(cloneBusinessPluginState(current));
            await writePostgresBusinessPluginState(client, runtimeConfig, options, next);
            await client.raw.unsafe("COMMIT");
            return cloneBusinessPluginState(next);
          } catch (error) {
            await client.raw.unsafe("ROLLBACK");
            throw error;
          }
        });
      },
      resetState: async () => {
        const runtimeConfig = getRuntimeConfig();
        if (runtimeConfig.engine !== "postgres") {
          throw new Error("Business state store runtime changed from postgres to sqlite after initialization.");
        }
        await withPostgresBusinessStore(runtimeConfig, options, async (client) => {
          await client.raw.unsafe("BEGIN");
          try {
            await deletePostgresBusinessPluginState(client, runtimeConfig, options);
            await client.raw.unsafe("COMMIT");
          } catch (error) {
            await client.raw.unsafe("ROLLBACK");
            throw error;
          }
        });
      }
    };
  }

  return {
    engine: "sqlite",
    loadState: async () => {
      const runtimeConfig = getRuntimeConfig();
      if (runtimeConfig.engine !== "sqlite") {
        throw new Error("Business state store runtime changed from sqlite to postgres after initialization.");
      }
      const state = await withSqliteBusinessStore(runtimeConfig, options, async (database) => {
        const loaded = readSqliteBusinessPluginState(database, runtimeConfig, options);
        if (!businessPluginStateHasPersistedRows(loaded)) {
          const seeded = cloneBusinessPluginState(options.seedStateFactory());
          writeSqliteBusinessPluginState(database, runtimeConfig, options, seeded);
          return seeded;
        }
        return loaded;
      });
      return cloneBusinessPluginState(state);
    },
    updateState: async (updater) => {
      const runtimeConfig = getRuntimeConfig();
      if (runtimeConfig.engine !== "sqlite") {
        throw new Error("Business state store runtime changed from sqlite to postgres after initialization.");
      }
      return await withSqliteBusinessStore(runtimeConfig, options, async (database) => {
        database.exec("BEGIN IMMEDIATE");
        try {
          const currentLoaded = readSqliteBusinessPluginState(database, runtimeConfig, options);
          const current = businessPluginStateHasPersistedRows(currentLoaded)
            ? currentLoaded
            : cloneBusinessPluginState(options.seedStateFactory());
          const next = await updater(cloneBusinessPluginState(current));
          writeSqliteBusinessPluginState(database, runtimeConfig, options, next);
          database.exec("COMMIT");
          return cloneBusinessPluginState(next);
        } catch (error) {
          database.exec("ROLLBACK");
          throw error;
        }
      });
    },
    resetState: async () => {
      const runtimeConfig = getRuntimeConfig();
      if (runtimeConfig.engine !== "sqlite") {
        throw new Error("Business state store runtime changed from sqlite to postgres after initialization.");
      }
      await withSqliteBusinessStore(runtimeConfig, options, async (database) => {
        database.exec("BEGIN IMMEDIATE");
        try {
          deleteSqliteBusinessPluginState(database, runtimeConfig, options);
          database.exec("COMMIT");
        } catch (error) {
          database.exec("ROLLBACK");
          throw error;
        }
      });
    }
  };
}

export function createBusinessPluginService(
  config: BusinessPluginServiceConfig<BusinessPrimaryRecordLike, BusinessSecondaryRecordLike, BusinessExceptionRecordLike>
) {
  const genericEventIds = {
    hold: `${config.pluginId}.record-held.v1`,
    release: `${config.pluginId}.record-released.v1`,
    amend: `${config.pluginId}.record-amended.v1`,
    reverse: `${config.pluginId}.record-reversed.v1`
  } as const;

  function requirePrimaryRecord(
    current: BusinessPluginState<BusinessPrimaryRecordLike, BusinessSecondaryRecordLike, BusinessExceptionRecordLike>,
    input: {
      tenantId: string;
      recordId: string;
      expectedRevisionNo?: number | undefined;
    }
  ): BusinessPrimaryRecordLike {
    const existing = current.primaryRecords.find((entry) => entry.id === input.recordId && entry.tenantId === input.tenantId);
    if (!existing) {
      throw new Error(`Unknown primary record '${input.recordId}'.`);
    }
    if (input.expectedRevisionNo !== undefined && existing.revisionNo !== input.expectedRevisionNo) {
      throw new Error(
        `Revision mismatch for '${input.recordId}': expected ${input.expectedRevisionNo}, received ${existing.revisionNo}.`
      );
    }
    return existing;
  }

  function targetActionLabel(requestedAction: string, target: string): string {
    return `${requestedAction} -> ${target}`;
  }

  function buildSecondaryRecords(input: {
    current: BusinessPluginState<BusinessPrimaryRecordLike, BusinessSecondaryRecordLike, BusinessExceptionRecordLike>;
    tenantId: string;
    primaryRecordId: string;
    correlationId: string;
    processId: string;
    requestedAction: string;
    reasonCode: string | null;
    targets: readonly string[];
    terminalStatus?: string | undefined;
    labelPrefix?: string | undefined;
  }): BusinessSecondaryRecordLike[] {
    const timestamp = new Date().toISOString();
    if (input.targets.length === 0) {
      return [
        {
          id: `${input.primaryRecordId}:followup:${input.current.secondaryRecords.length + 1}`,
          tenantId: input.tenantId,
          primaryRecordId: input.primaryRecordId,
          label: input.labelPrefix ?? `${config.displayName} Follow-up`,
          status: input.terminalStatus ?? "completed",
          requestedAction: input.requestedAction,
          reasonCode: input.reasonCode,
          correlationId: input.correlationId,
          processId: input.processId,
          updatedAt: timestamp
        } satisfies BusinessSecondaryRecordLike
      ];
    }

    return input.targets.map((target, index) => ({
      id: `${input.primaryRecordId}:followup:${input.current.secondaryRecords.length + index + 1}`,
      tenantId: input.tenantId,
      primaryRecordId: input.primaryRecordId,
      label: `${input.labelPrefix ?? config.displayName} ${target}`,
      status: "requested",
      requestedAction: targetActionLabel(input.requestedAction, target),
      reasonCode: input.reasonCode,
      correlationId: input.correlationId,
      processId: input.processId,
      updatedAt: timestamp
    }));
  }

  function applySecondaryProjections(
    state: BusinessOrchestrationState,
    secondaryRecords: readonly BusinessSecondaryRecordLike[],
    relatedMessageId: string
  ): BusinessOrchestrationState {
    let nextState = state;
    for (const secondaryRecord of secondaryRecords) {
      nextState = recordBusinessProjection(nextState, {
        tenantId: secondaryRecord.tenantId,
        pluginId: config.pluginId,
        documentId: secondaryRecord.id,
        projectionKey: `${config.secondaryResourceId}:${secondaryRecord.id}`,
        relatedMessageIds: [relatedMessageId],
        summary: {
          status: secondaryRecord.status,
          requestedAction: secondaryRecord.requestedAction
        }
      }).state;
    }
    return nextState;
  }

  function closeResolvedExceptions(
    current: readonly BusinessExceptionRecordLike[],
    tenantId: string,
    primaryRecordId: string,
    updatedAt: string
  ): BusinessExceptionRecordLike[] {
    return current.map((entry) =>
      entry.primaryRecordId === primaryRecordId && entry.tenantId === tenantId && entry.status !== "closed"
        ? ({
            ...entry,
            status: "closed",
            updatedAt
          } as BusinessExceptionRecordLike)
        : entry
    );
  }

  function upsertProjectionForPrimary(
    state: BusinessOrchestrationState,
    record: BusinessPrimaryRecordLike,
    relatedMessageIds: readonly string[],
    status: BusinessProjectionStatus
  ): BusinessOrchestrationState {
    return recordBusinessProjection(state, {
      tenantId: record.tenantId,
      pluginId: config.pluginId,
      documentId: record.id,
      projectionKey: `${config.primaryResourceId}:${record.id}`,
      status,
      relatedMessageIds,
      summary: {
        title: record.title,
        recordState: record.recordState,
        approvalState: record.approvalState,
        postingState: record.postingState,
        fulfillmentState: record.fulfillmentState,
        reasonCode: record.reasonCode,
        revisionNo: record.revisionNo
      }
    }).state;
  }

  function matchSecondaryRecordForTarget(
    entry: BusinessSecondaryRecordLike,
    documentId: string,
    tenantId: string,
    target: string
  ): boolean {
    return (
      entry.primaryRecordId === documentId &&
      entry.tenantId === tenantId &&
      entry.requestedAction.includes(`-> ${target}`)
    );
  }

  return {
    async listPrimaryRecords(): Promise<BusinessPrimaryRecordLike[]> {
      const state = await config.store.loadState();
      return [...state.primaryRecords].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    },

    async listSecondaryRecords(): Promise<BusinessSecondaryRecordLike[]> {
      const state = await config.store.loadState();
      return [...state.secondaryRecords].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    },

    async listExceptionRecords(): Promise<BusinessExceptionRecordLike[]> {
      const state = await config.store.loadState();
      return [...state.exceptionRecords].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    },

    async listPublishedMessages() {
      const state = await config.store.loadState();
      return listBusinessMessages(state.orchestration, config.pluginId);
    },

    async listPendingDownstreamItems() {
      const state = await config.store.loadState();
      return listBusinessInboxItems(state.orchestration, {
        pluginId: config.pluginId,
        status: ["pending", "retrying"]
      });
    },

    async listDeadLetters() {
      const state = await config.store.loadState();
      return listBusinessDeadLetters(state.orchestration, config.pluginId);
    },

    async listProjectionRecords() {
      const state = await config.store.loadState();
      return listBusinessProjections(state.orchestration, config.pluginId);
    },

    async getBusinessOverview() {
      const state = await config.store.loadState();
      const orchestration = summarizeBusinessOrchestration(state.orchestration, config.pluginId);
      return {
        totals: {
          primaryRecords: state.primaryRecords.length,
          secondaryRecords: state.secondaryRecords.length,
          pendingApproval: state.primaryRecords.filter((entry) => entry.approvalState === "pending").length,
          posted: state.primaryRecords.filter((entry) => entry.postingState === "posted").length,
          canceled: state.primaryRecords.filter((entry) => entry.recordState === "canceled").length,
          archived: state.primaryRecords.filter((entry) => entry.recordState === "archived").length,
          openExceptions: state.exceptionRecords.filter((entry) => entry.status !== "closed").length
        },
        orchestration
      };
    },

    async createPrimaryRecord(input: BusinessCreatePrimaryRecordInput) {
      normalizeActionInput(input);
      let nextRecord: BusinessPrimaryRecordLike | null = null;

      await config.store.updateState((current) => {
        const existing = current.primaryRecords.find((entry) => entry.id === input.recordId && entry.tenantId === input.tenantId);
        if (existing) {
          nextRecord = clonePrimaryRecordLike(existing);
          return current;
        }

        const primaryRecord = {
          id: input.recordId,
          tenantId: input.tenantId,
          title: input.title,
          counterpartyId: input.counterpartyId,
          companyId: input.companyId,
          branchId: input.branchId,
          recordState: "active",
          approvalState: "pending",
          postingState: "unposted",
          fulfillmentState: "none",
          amountMinor: input.amountMinor,
          currencyCode: input.currencyCode,
          revisionNo: 1,
          reasonCode: input.reasonCode ?? null,
          effectiveAt: input.effectiveAt,
          correlationId: input.correlationId,
          processId: input.processId,
          upstreamRefs: input.upstreamRefs ?? [],
          downstreamRefs: [],
          updatedAt: new Date().toISOString()
        } satisfies BusinessPrimaryRecordLike;

        nextRecord = clonePrimaryRecordLike(primaryRecord);
        const published = publishBusinessMessage(current.orchestration, {
          tenantId: input.tenantId,
          pluginId: config.pluginId,
          documentId: input.recordId,
          type: config.createEvent,
          correlationId: input.correlationId,
          processId: input.processId,
          payload: {
            title: input.title,
            recordState: primaryRecord.recordState,
            approvalState: primaryRecord.approvalState,
            postingState: primaryRecord.postingState,
            fulfillmentState: primaryRecord.fulfillmentState,
            revisionNo: primaryRecord.revisionNo
          },
          targets: config.orchestrationTargets.create
        });
        const projected = recordBusinessProjection(published.state, {
          tenantId: input.tenantId,
          pluginId: config.pluginId,
          documentId: input.recordId,
          projectionKey: `${config.primaryResourceId}:${input.recordId}`,
          status: published.inboxItems.length > 0 ? "pending" : "materialized",
          relatedMessageIds: [published.message.id],
          summary: {
            title: input.title,
            recordState: primaryRecord.recordState,
            approvalState: primaryRecord.approvalState,
            postingState: primaryRecord.postingState,
            fulfillmentState: primaryRecord.fulfillmentState,
            revisionNo: primaryRecord.revisionNo
          }
        });

        return {
          ...current,
          primaryRecords: upsertBusinessEntity(current.primaryRecords, primaryRecord),
          orchestration: projected.state
        };
      });

      const createdRecord =
        nextRecord ??
        (await config.store.loadState()).primaryRecords.find(
          (entry) => entry.id === input.recordId && entry.tenantId === input.tenantId
        ) ??
        null;
      if (!createdRecord) {
        throw new Error("Failed to create business record.");
      }

      return {
        ok: true as const,
        recordId: input.recordId,
        recordState: createdRecord.recordState,
        approvalState: createdRecord.approvalState,
        postingState: createdRecord.postingState,
        fulfillmentState: createdRecord.fulfillmentState,
        revisionNo: createdRecord.revisionNo,
        eventIds: [config.createEvent],
        jobIds: [config.projectionJobId]
      };
    },

    async advancePrimaryRecord(input: BusinessAdvancePrimaryRecordInput) {
      normalizeActionInput(input);
      let nextRecord: BusinessPrimaryRecordLike | null = null;

      await config.store.updateState((current) => {
        const existing = requirePrimaryRecord(current, input);

        const downstreamRefs =
          input.downstreamRef && !existing.downstreamRefs.includes(input.downstreamRef)
            ? [...existing.downstreamRefs, input.downstreamRef]
            : existing.downstreamRefs;

        const primaryRecord = {
          ...existing,
          recordState: input.recordState ?? existing.recordState,
          approvalState: input.approvalState ?? existing.approvalState,
          postingState: input.postingState ?? existing.postingState,
          fulfillmentState: input.fulfillmentState ?? existing.fulfillmentState,
          reasonCode: input.reasonCode ?? existing.reasonCode,
          downstreamRefs,
          revisionNo: existing.revisionNo + 1,
          updatedAt: new Date().toISOString()
        } satisfies BusinessPrimaryRecordLike;
        nextRecord = clonePrimaryRecordLike(primaryRecord);

        const secondaryRecords = buildSecondaryRecords({
          current,
          tenantId: input.tenantId,
          primaryRecordId: input.recordId,
          correlationId: primaryRecord.correlationId,
          processId: primaryRecord.processId,
          requestedAction: config.advanceActionLabel,
          reasonCode: input.reasonCode ?? existing.reasonCode,
          targets: config.orchestrationTargets.advance,
          terminalStatus:
            input.recordState === "canceled" || input.fulfillmentState === "closed" ? "closed" : "completed",
          labelPrefix: `${config.displayName} Advance`
        });

        const published = publishBusinessMessage(current.orchestration, {
          tenantId: input.tenantId,
          pluginId: config.pluginId,
          documentId: input.recordId,
          type: config.advanceEvent,
          correlationId: primaryRecord.correlationId,
          processId: primaryRecord.processId,
          payload: {
            recordState: primaryRecord.recordState,
            approvalState: primaryRecord.approvalState,
            postingState: primaryRecord.postingState,
            fulfillmentState: primaryRecord.fulfillmentState,
            requestedAction: secondaryRecords[0]?.requestedAction ?? config.advanceActionLabel,
            revisionNo: primaryRecord.revisionNo
          },
          targets: config.orchestrationTargets.advance
        });
        let nextOrchestration = upsertProjectionForPrimary(
          published.state,
          primaryRecord,
          [published.message.id],
          published.inboxItems.length > 0 ? "pending" : "materialized"
        );
        nextOrchestration = applySecondaryProjections(nextOrchestration, secondaryRecords, published.message.id);

        return {
          ...current,
          primaryRecords: upsertBusinessEntity(current.primaryRecords, primaryRecord),
          secondaryRecords: secondaryRecords.reduce(
            (entries, secondaryRecord) => upsertBusinessEntity(entries, secondaryRecord),
            current.secondaryRecords
          ),
          orchestration: nextOrchestration
        };
      });

      const advancedRecord =
        nextRecord ??
        (await config.store.loadState()).primaryRecords.find(
          (entry) => entry.id === input.recordId && entry.tenantId === input.tenantId
        ) ??
        null;
      if (!advancedRecord) {
        throw new Error("Failed to advance business record.");
      }

      return {
        ok: true as const,
        recordId: input.recordId,
        recordState: advancedRecord.recordState,
        approvalState: advancedRecord.approvalState,
        postingState: advancedRecord.postingState,
        fulfillmentState: advancedRecord.fulfillmentState,
        revisionNo: advancedRecord.revisionNo,
        eventIds: [config.advanceEvent],
        jobIds: [config.projectionJobId]
      };
    },

    async placePrimaryRecordOnHold(input: BusinessPlacePrimaryRecordOnHoldInput) {
      normalizeActionInput(input);
      let nextRecord: BusinessPrimaryRecordLike | null = null;
      const exceptionId = `${input.recordId}:hold:${input.expectedRevisionNo ?? "latest"}`;

      await config.store.updateState((current) => {
        const existing = requirePrimaryRecord(current, input);
        const updatedAt = new Date().toISOString();
        const primaryRecord = {
          ...existing,
          approvalState: "pending",
          reasonCode: `hold:${input.reasonCode}`,
          revisionNo: existing.revisionNo + 1,
          updatedAt
        } satisfies BusinessPrimaryRecordLike;
        const exceptionRecord = {
          id: exceptionId,
          tenantId: input.tenantId,
          primaryRecordId: input.recordId,
          severity: "low",
          status: "open",
          reasonCode: `hold:${input.reasonCode}`,
          upstreamRef: null,
          downstreamRef: null,
          updatedAt
        } satisfies BusinessExceptionRecordLike;
        const projected = upsertProjectionForPrimary(current.orchestration, primaryRecord, [], "materialized");
        nextRecord = clonePrimaryRecordLike(primaryRecord);

        return {
          ...current,
          primaryRecords: upsertBusinessEntity(current.primaryRecords, primaryRecord),
          exceptionRecords: upsertBusinessEntity(current.exceptionRecords, exceptionRecord),
          orchestration: projected
        };
      });

      if (!nextRecord) {
        throw new Error("Failed to place business record on hold.");
      }
      const heldRecord = nextRecord as BusinessPrimaryRecordLike;

      return {
        ok: true as const,
        recordId: input.recordId,
        status: "open" as const,
        revisionNo: heldRecord.revisionNo,
        eventIds: [genericEventIds.hold],
        jobIds: [config.reconciliationJobId]
      };
    },

    async releasePrimaryRecordHold(input: BusinessReleasePrimaryRecordHoldInput) {
      normalizeActionInput(input);
      let nextRecord: BusinessPrimaryRecordLike | null = null;

      await config.store.updateState((current) => {
        const existing = requirePrimaryRecord(current, input);
        const updatedAt = new Date().toISOString();
        const primaryRecord = {
          ...existing,
          reasonCode: input.reasonCode ?? existing.reasonCode,
          revisionNo: existing.revisionNo + 1,
          updatedAt
        } satisfies BusinessPrimaryRecordLike;
        nextRecord = clonePrimaryRecordLike(primaryRecord);

        return {
          ...current,
          primaryRecords: upsertBusinessEntity(current.primaryRecords, primaryRecord),
          exceptionRecords: current.exceptionRecords.map((entry) =>
            entry.primaryRecordId === input.recordId &&
            entry.tenantId === input.tenantId &&
            entry.status !== "closed" &&
            entry.reasonCode.startsWith("hold:")
              ? ({
                  ...entry,
                  status: "closed",
                  updatedAt
                } as BusinessExceptionRecordLike)
              : entry
          ),
          orchestration: upsertProjectionForPrimary(current.orchestration, primaryRecord, [], "materialized")
        };
      });

      if (!nextRecord) {
        throw new Error("Failed to release business record hold.");
      }
      const releasedRecord = nextRecord as BusinessPrimaryRecordLike;

      return {
        ok: true as const,
        recordId: input.recordId,
        status: "closed" as const,
        revisionNo: releasedRecord.revisionNo,
        eventIds: [genericEventIds.release],
        jobIds: [config.reconciliationJobId]
      };
    },

    async amendPrimaryRecord(input: BusinessAmendPrimaryRecordInput) {
      normalizeActionInput(input);
      let amendedRecord: BusinessPrimaryRecordLike | null = null;

      await config.store.updateState((current) => {
        const existing = requirePrimaryRecord(current, input);
        const updatedAt = new Date().toISOString();
        const archivedOriginal = {
          ...existing,
          recordState: "archived",
          reasonCode: `amended:${input.reasonCode}`,
          downstreamRefs: existing.downstreamRefs.includes(input.amendedRecordId)
            ? existing.downstreamRefs
            : [...existing.downstreamRefs, input.amendedRecordId],
          revisionNo: existing.revisionNo + 1,
          updatedAt
        } satisfies BusinessPrimaryRecordLike;
        const nextAmendedRecord = {
          ...existing,
          id: input.amendedRecordId,
          title: input.title ?? existing.title,
          amountMinor: input.amountMinor ?? existing.amountMinor,
          effectiveAt: input.effectiveAt ?? existing.effectiveAt,
          approvalState: "pending",
          postingState: "unposted",
          fulfillmentState: "none",
          revisionNo: 1,
          reasonCode: input.reasonCode,
          correlationId: `${existing.correlationId}:amend:${input.amendedRecordId}`,
          processId: `${existing.processId}:amend`,
          upstreamRefs: [...new Set([...existing.upstreamRefs, existing.id])],
          downstreamRefs: [],
          updatedAt
        } satisfies BusinessPrimaryRecordLike;
        amendedRecord = clonePrimaryRecordLike(nextAmendedRecord);

        let nextOrchestration = upsertProjectionForPrimary(current.orchestration, archivedOriginal, [], "materialized");
        nextOrchestration = upsertProjectionForPrimary(nextOrchestration, nextAmendedRecord, [], "materialized");

        return {
          ...current,
          primaryRecords: upsertBusinessEntity(
            upsertBusinessEntity(current.primaryRecords, archivedOriginal),
            nextAmendedRecord
          ),
          orchestration: nextOrchestration
        };
      });

      if (!amendedRecord) {
        throw new Error("Failed to amend business record.");
      }
      const nextAmendedRecord = amendedRecord as BusinessPrimaryRecordLike;

      return {
        ok: true as const,
        recordId: input.recordId,
        amendedRecordId: input.amendedRecordId,
        revisionNo: nextAmendedRecord.revisionNo,
        eventIds: [genericEventIds.amend],
        jobIds: [config.projectionJobId]
      };
    },

    async reconcilePrimaryRecord(input: BusinessReconcilePrimaryRecordInput) {
      normalizeActionInput(input);
      let nextRecord: BusinessPrimaryRecordLike | null = null;

      await config.store.updateState((current) => {
        const existing = requirePrimaryRecord(current, input);

        const exceptionRecord = {
          id: input.exceptionId,
          tenantId: input.tenantId,
          primaryRecordId: input.recordId,
          severity: input.severity,
          status: "open",
          reasonCode: input.reasonCode,
          upstreamRef: input.upstreamRef ?? null,
          downstreamRef: input.downstreamRef ?? null,
          updatedAt: new Date().toISOString()
        } satisfies BusinessExceptionRecordLike;

        const primaryRecord = {
          ...existing,
          reasonCode: input.reasonCode,
          downstreamRefs:
            input.downstreamRef && !existing.downstreamRefs.includes(input.downstreamRef)
              ? [...existing.downstreamRefs, input.downstreamRef]
              : existing.downstreamRefs,
          revisionNo: existing.revisionNo + 1,
          updatedAt: new Date().toISOString()
        } satisfies BusinessPrimaryRecordLike;
        nextRecord = clonePrimaryRecordLike(primaryRecord);

        const secondaryRecords = buildSecondaryRecords({
          current,
          tenantId: input.tenantId,
          primaryRecordId: input.recordId,
          correlationId: primaryRecord.correlationId,
          processId: primaryRecord.processId,
          requestedAction: "Reconcile Downstream Effects",
          reasonCode: input.reasonCode,
          targets: config.orchestrationTargets.reconcile,
          terminalStatus: "completed",
          labelPrefix: `${config.displayName} Reconcile`
        });
        const published = publishBusinessMessage(current.orchestration, {
          tenantId: input.tenantId,
          pluginId: config.pluginId,
          documentId: input.recordId,
          type: config.reconcileEvent,
          correlationId: primaryRecord.correlationId,
          processId: primaryRecord.processId,
          payload: {
            severity: exceptionRecord.severity,
            status: exceptionRecord.status,
            reasonCode: exceptionRecord.reasonCode,
            revisionNo: primaryRecord.revisionNo
          },
          targets: config.orchestrationTargets.reconcile
        });
        let nextOrchestration = upsertProjectionForPrimary(
          published.state,
          primaryRecord,
          [published.message.id],
          published.inboxItems.length > 0 ? "pending" : "materialized"
        );
        nextOrchestration = applySecondaryProjections(nextOrchestration, secondaryRecords, published.message.id);
        nextOrchestration = recordBusinessProjection(nextOrchestration, {
          tenantId: input.tenantId,
          pluginId: config.pluginId,
          documentId: exceptionRecord.id,
          projectionKey: `${config.exceptionResourceId}:${exceptionRecord.id}`,
          relatedMessageIds: [published.message.id],
          summary: {
            severity: exceptionRecord.severity,
            status: exceptionRecord.status,
            reasonCode: exceptionRecord.reasonCode
          }
        }).state;

        return {
          ...current,
          primaryRecords: upsertBusinessEntity(current.primaryRecords, primaryRecord),
          secondaryRecords: secondaryRecords.reduce(
            (entries, secondaryRecord) => upsertBusinessEntity(entries, secondaryRecord),
            current.secondaryRecords
          ),
          exceptionRecords: upsertBusinessEntity(current.exceptionRecords, exceptionRecord),
          orchestration: nextOrchestration
        };
      });

      const reconciledRecord =
        nextRecord ??
        (await config.store.loadState()).primaryRecords.find(
          (entry) => entry.id === input.recordId && entry.tenantId === input.tenantId
        ) ??
        null;
      if (!reconciledRecord) {
        throw new Error("Failed to reconcile business record.");
      }

      return {
        ok: true as const,
        recordId: input.recordId,
        exceptionId: input.exceptionId,
        status: "open" as const,
        revisionNo: reconciledRecord.revisionNo,
        eventIds: [config.reconcileEvent],
        jobIds: [config.reconciliationJobId]
      };
    },

    async reversePrimaryRecord(input: BusinessReversePrimaryRecordInput) {
      normalizeActionInput(input);
      let reversalRecord: BusinessPrimaryRecordLike | null = null;

      await config.store.updateState((current) => {
        const existing = requirePrimaryRecord(current, input);
        const updatedAt = new Date().toISOString();
        const reversedOriginal = {
          ...existing,
          recordState: "canceled",
          postingState: "reversed",
          fulfillmentState: existing.fulfillmentState === "closed" ? existing.fulfillmentState : "closed",
          reasonCode: `reversed:${input.reasonCode}`,
          downstreamRefs: existing.downstreamRefs.includes(input.reversalRecordId)
            ? existing.downstreamRefs
            : [...existing.downstreamRefs, input.reversalRecordId],
          revisionNo: existing.revisionNo + 1,
          updatedAt
        } satisfies BusinessPrimaryRecordLike;
        const nextReversalRecord = {
          ...existing,
          id: input.reversalRecordId,
          title: `${existing.title} Reversal`,
          amountMinor: Math.abs(existing.amountMinor) * -1,
          recordState: "canceled",
          approvalState: "approved",
          postingState: "reversed",
          fulfillmentState: "closed",
          revisionNo: 1,
          reasonCode: input.reasonCode,
          correlationId: `${existing.correlationId}:reverse:${input.reversalRecordId}`,
          processId: `${existing.processId}:reverse`,
          upstreamRefs: [...new Set([...existing.upstreamRefs, existing.id])],
          downstreamRefs: [],
          updatedAt
        } satisfies BusinessPrimaryRecordLike;
        reversalRecord = clonePrimaryRecordLike(nextReversalRecord);

        const secondaryRecords = buildSecondaryRecords({
          current,
          tenantId: input.tenantId,
          primaryRecordId: nextReversalRecord.id,
          correlationId: nextReversalRecord.correlationId,
          processId: nextReversalRecord.processId,
          requestedAction: "Post Reversal Downstream",
          reasonCode: input.reasonCode,
          targets: config.orchestrationTargets.reconcile,
          terminalStatus: "completed",
          labelPrefix: `${config.displayName} Reversal`
        });
        const published = publishBusinessMessage(current.orchestration, {
          tenantId: input.tenantId,
          pluginId: config.pluginId,
          documentId: nextReversalRecord.id,
          type: genericEventIds.reverse,
          correlationId: nextReversalRecord.correlationId,
          processId: nextReversalRecord.processId,
          payload: {
            title: nextReversalRecord.title,
            amountMinor: nextReversalRecord.amountMinor,
            reasonCode: nextReversalRecord.reasonCode,
            revisionNo: nextReversalRecord.revisionNo
          },
          targets: config.orchestrationTargets.reconcile
        });

        let nextOrchestration = upsertProjectionForPrimary(
          published.state,
          reversedOriginal,
          [],
          "materialized"
        );
        nextOrchestration = upsertProjectionForPrimary(
          nextOrchestration,
          nextReversalRecord,
          [published.message.id],
          published.inboxItems.length > 0 ? "pending" : "materialized"
        );
        nextOrchestration = applySecondaryProjections(nextOrchestration, secondaryRecords, published.message.id);

        return {
          ...current,
          primaryRecords: upsertBusinessEntity(
            upsertBusinessEntity(current.primaryRecords, reversedOriginal),
            nextReversalRecord
          ),
          secondaryRecords: secondaryRecords.reduce(
            (entries, secondaryRecord) => upsertBusinessEntity(entries, secondaryRecord),
            current.secondaryRecords
          ),
          orchestration: nextOrchestration
        };
      });

      if (!reversalRecord) {
        throw new Error("Failed to reverse business record.");
      }
      const nextReversalRecord = reversalRecord as BusinessPrimaryRecordLike;

      return {
        ok: true as const,
        recordId: input.recordId,
        reversalRecordId: input.reversalRecordId,
        revisionNo: nextReversalRecord.revisionNo,
        eventIds: [genericEventIds.reverse],
        jobIds: [config.reconciliationJobId]
      };
    },

    async resolvePendingDownstreamItem(input: BusinessResolvePendingDownstreamItemInput) {
      normalizeActionInput(input);
      let target = "";

      await config.store.updateState((current) => {
        const currentItem = current.orchestration.inbox.find(
          (entry) => entry.id === input.inboxId && entry.tenantId === input.tenantId
        );
        if (!currentItem) {
          throw new Error(`Unknown pending downstream item '${input.inboxId}'.`);
        }

        target = currentItem.target;
        const resolved = resolveBusinessInboxItem(current.orchestration, input.inboxId);
        const documentHasPendingDownstream = resolved.state.inbox.some(
          (entry) =>
            entry.tenantId === input.tenantId &&
            entry.pluginId === config.pluginId &&
            entry.documentId === currentItem.documentId &&
            (entry.status === "pending" || entry.status === "retrying")
        );
        const resolutionRef = input.resolutionRef;
        const resolvedAt = new Date().toISOString();
        const nextPrimaryRecords = resolutionRef
          ? current.primaryRecords.map((entry) =>
              entry.id === currentItem.documentId && entry.tenantId === input.tenantId
                ? ({
                    ...entry,
                    downstreamRefs: entry.downstreamRefs.includes(resolutionRef)
                      ? entry.downstreamRefs
                      : [...entry.downstreamRefs, resolutionRef],
                    updatedAt: resolvedAt
                  } as BusinessPrimaryRecordLike)
                : entry
            )
          : current.primaryRecords;
        const nextSecondaryRecords = current.secondaryRecords.map((entry) =>
          matchSecondaryRecordForTarget(entry, currentItem.documentId, input.tenantId, currentItem.target) &&
          entry.status !== "closed"
            ? ({
                ...entry,
                status: documentHasPendingDownstream ? "completed" : "closed",
                reasonCode: input.resolutionRef ?? entry.reasonCode,
                updatedAt: resolvedAt
              } as BusinessSecondaryRecordLike)
            : entry
        );
        const nextExceptionRecords = documentHasPendingDownstream
          ? current.exceptionRecords
          : closeResolvedExceptions(current.exceptionRecords, input.tenantId, currentItem.documentId, resolvedAt);
        const projected = recordBusinessProjection(resolved.state, {
          tenantId: input.tenantId,
          pluginId: config.pluginId,
          documentId: currentItem.documentId,
          projectionKey: `${config.primaryResourceId}:${currentItem.documentId}`,
          status: documentHasPendingDownstream ? "pending" : "materialized",
          summary: {
            downstreamTarget: currentItem.target,
            resolutionRef: input.resolutionRef ?? null,
            documentHasPendingDownstream
          }
        });

        return {
          ...current,
          primaryRecords: nextPrimaryRecords,
          secondaryRecords: nextSecondaryRecords,
          exceptionRecords: nextExceptionRecords,
          orchestration: projected.state
        };
      });

      return {
        ok: true as const,
        inboxId: input.inboxId,
        target,
        status: "processed" as const
      };
    },

    async failPendingDownstreamItem(input: BusinessFailPendingDownstreamItemInput) {
      normalizeActionInput(input);
      let target = "";

      const state = await config.store.updateState((current) => {
        const currentItem = current.orchestration.inbox.find(
          (entry) => entry.id === input.inboxId && entry.tenantId === input.tenantId
        );
        if (!currentItem) {
          throw new Error(`Unknown pending downstream item '${input.inboxId}'.`);
        }

        target = currentItem.target;
        const failed = failBusinessInboxItem(current.orchestration, {
          inboxId: input.inboxId,
          error: input.error,
          maxAttempts: input.maxAttempts
        });
        const updatedAt = new Date().toISOString();
        const exceptionRecord = {
          id: `${currentItem.documentId}:downstream:${sanitizeIdentifier(currentItem.target)}`,
          tenantId: input.tenantId,
          primaryRecordId: currentItem.documentId,
          severity: failed.inboxItem.status === "dead-letter" ? "high" : "medium",
          status: "open",
          reasonCode: input.error,
          upstreamRef: currentItem.messageId,
          downstreamRef: currentItem.target,
          updatedAt
        } satisfies BusinessExceptionRecordLike;
        const projected = recordBusinessProjection(failed.state, {
          tenantId: input.tenantId,
          pluginId: config.pluginId,
          documentId: currentItem.documentId,
          projectionKey: `${config.primaryResourceId}:${currentItem.documentId}`,
          status: "stale",
          summary: {
            downstreamTarget: currentItem.target,
            lastError: input.error
          }
        });

        return {
          ...current,
          secondaryRecords: current.secondaryRecords.map((entry) =>
            matchSecondaryRecordForTarget(entry, currentItem.documentId, input.tenantId, currentItem.target)
              ? ({
                  ...entry,
                  status: failed.inboxItem.status === "dead-letter" ? "failed" : "in-progress",
                  reasonCode: input.error,
                  updatedAt
                } as BusinessSecondaryRecordLike)
              : entry
          ),
          exceptionRecords: upsertBusinessEntity(current.exceptionRecords, exceptionRecord),
          orchestration: projected.state
        };
      });

      const inboxItem = state.orchestration.inbox.find((entry) => entry.id === input.inboxId && entry.tenantId === input.tenantId);
      if (!inboxItem || (inboxItem.status !== "retrying" && inboxItem.status !== "dead-letter")) {
        throw new Error("Failed to update pending downstream item.");
      }
      const deadLetter = state.orchestration.deadLetters.find((entry) => entry.inboxId === input.inboxId) ?? null;

      return {
        ok: true as const,
        inboxId: input.inboxId,
        target,
        status: inboxItem.status,
        deadLetterId: deadLetter?.id ?? null
      };
    },

    async replayDeadLetter(input: BusinessReplayDeadLetterInput) {
      normalizeActionInput(input);
      let target = "";

      await config.store.updateState((current) => {
        const deadLetter = current.orchestration.deadLetters.find(
          (entry) => entry.id === input.deadLetterId && entry.tenantId === input.tenantId
        );
        if (!deadLetter) {
          throw new Error(`Unknown business dead-letter '${input.deadLetterId}'.`);
        }

        target = deadLetter.target;
        const replayed = replayBusinessDeadLetter(current.orchestration, input.deadLetterId);
        const updatedAt = new Date().toISOString();
        const projected = recordBusinessProjection(replayed.state, {
          tenantId: input.tenantId,
          pluginId: config.pluginId,
          documentId: deadLetter.documentId,
          projectionKey: `${config.primaryResourceId}:${deadLetter.documentId}`,
          status: "pending",
          summary: {
            downstreamTarget: deadLetter.target,
            replayed: true
          }
        });

        return {
          ...current,
          secondaryRecords: current.secondaryRecords.map((entry) =>
            matchSecondaryRecordForTarget(entry, deadLetter.documentId, input.tenantId, deadLetter.target)
              ? ({
                  ...entry,
                  status: "requested",
                  updatedAt
                } as BusinessSecondaryRecordLike)
              : entry
          ),
          orchestration: projected.state
        };
      });

      return {
        ok: true as const,
        deadLetterId: input.deadLetterId,
        target,
        status: "retrying" as const
      };
    }
  };
}

export function createBusinessOrchestrationState(
  input: Partial<BusinessOrchestrationState> | undefined = undefined
): BusinessOrchestrationState {
  return {
    outbox: (input?.outbox ?? []).map((entry) => cloneBusinessOutboxMessage(entry)),
    inbox: (input?.inbox ?? []).map((entry) => cloneBusinessInboxItem(entry)),
    deadLetters: (input?.deadLetters ?? []).map((entry) => cloneBusinessDeadLetterRecord(entry)),
    projections: (input?.projections ?? []).map((entry) => cloneBusinessProjectionRecord(entry))
  };
}

export function publishBusinessMessage(
  state: BusinessOrchestrationState,
  input: {
    id?: string | undefined;
    tenantId: string;
    pluginId: string;
    documentId: string;
    type: string;
    payload?: unknown;
    correlationId?: string | undefined;
    processId?: string | undefined;
    targets?: readonly string[] | undefined;
    createdAt?: string | undefined;
  }
): { state: BusinessOrchestrationState; message: BusinessOutboxMessage; inboxItems: BusinessInboxItem[] } {
  const nextState = createBusinessOrchestrationState(state);
  const timestamp = input.createdAt ?? new Date().toISOString();
  const targets = [...new Set((input.targets ?? []).filter((entry) => entry.trim().length > 0))];

  const message: BusinessOutboxMessage = {
    id: input.id ?? randomUUID(),
    tenantId: input.tenantId,
    pluginId: input.pluginId,
    documentId: input.documentId,
    type: input.type,
    payload: normalizeActionInput(input.payload ?? {}),
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    ...(input.processId ? { processId: input.processId } : {}),
    status: targets.length > 0 ? "pending" : "processed",
    consumerCount: targets.length,
    deliveredCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  const inboxItems = targets.map((target) => {
    const inboxItem: BusinessInboxItem = {
      id: randomUUID(),
      messageId: message.id,
      tenantId: input.tenantId,
      pluginId: input.pluginId,
      documentId: input.documentId,
      target,
      status: "pending",
      attemptCount: 0,
      updatedAt: timestamp
    };
    nextState.inbox.push(inboxItem);
    return cloneBusinessInboxItem(inboxItem);
  });

  nextState.outbox.push(message);
  return {
    state: refreshBusinessMessageStatus(nextState, message.id),
    message: cloneBusinessOutboxMessage(message),
    inboxItems
  };
}

export function resolveBusinessInboxItem(
  state: BusinessOrchestrationState,
  inboxId: string
): { state: BusinessOrchestrationState; inboxItem: BusinessInboxItem } {
  const nextState = createBusinessOrchestrationState(state);
  const inboxIndex = nextState.inbox.findIndex((entry) => entry.id === inboxId);
  if (inboxIndex === -1) {
    throw new Error(`Unknown business inbox item '${inboxId}'.`);
  }

  const current = nextState.inbox[inboxIndex] as BusinessInboxItem;
  const nextItem: BusinessInboxItem = {
    ...current,
    status: "processed",
    updatedAt: new Date().toISOString()
  };
  delete nextItem.lastError;
  nextState.inbox[inboxIndex] = nextItem;
  return {
    state: refreshBusinessMessageStatus(nextState, current.messageId),
    inboxItem: cloneBusinessInboxItem(nextItem)
  };
}

export function failBusinessInboxItem(
  state: BusinessOrchestrationState,
  input: {
    inboxId: string;
    error: string;
    maxAttempts?: number | undefined;
  }
): { state: BusinessOrchestrationState; inboxItem: BusinessInboxItem; deadLetter?: BusinessDeadLetterRecord | undefined } {
  const nextState = createBusinessOrchestrationState(state);
  const inboxIndex = nextState.inbox.findIndex((entry) => entry.id === input.inboxId);
  if (inboxIndex === -1) {
    throw new Error(`Unknown business inbox item '${input.inboxId}'.`);
  }

  const current = nextState.inbox[inboxIndex] as BusinessInboxItem;
  const attemptCount = current.attemptCount + 1;
  const updatedAt = new Date().toISOString();
  const maxAttempts = input.maxAttempts ?? 1;
  const status: BusinessInboxStatus = attemptCount >= maxAttempts ? "dead-letter" : "retrying";
  const nextItem: BusinessInboxItem = {
    ...current,
    status,
    attemptCount,
    lastError: input.error,
    updatedAt
  };
  nextState.inbox[inboxIndex] = nextItem;

  let deadLetter: BusinessDeadLetterRecord | undefined;
  if (status === "dead-letter") {
    deadLetter = {
      id: randomUUID(),
      messageId: current.messageId,
      inboxId: current.id,
      tenantId: current.tenantId,
      pluginId: current.pluginId,
      documentId: current.documentId,
      target: current.target,
      reason: input.error,
      attemptCount,
      failedAt: updatedAt
    };
    nextState.deadLetters.push(deadLetter);
  }

  return {
    state: refreshBusinessMessageStatus(nextState, current.messageId),
    inboxItem: cloneBusinessInboxItem(nextItem),
    ...(deadLetter ? { deadLetter: cloneBusinessDeadLetterRecord(deadLetter) } : {})
  };
}

export function replayBusinessDeadLetter(
  state: BusinessOrchestrationState,
  deadLetterId: string
): { state: BusinessOrchestrationState; inboxItem: BusinessInboxItem } {
  const nextState = createBusinessOrchestrationState(state);
  const deadLetterIndex = nextState.deadLetters.findIndex((entry) => entry.id === deadLetterId);
  if (deadLetterIndex === -1) {
    throw new Error(`Unknown business dead-letter '${deadLetterId}'.`);
  }

  const deadLetter = nextState.deadLetters.splice(deadLetterIndex, 1)[0] as BusinessDeadLetterRecord;
  const inboxIndex = nextState.inbox.findIndex((entry) => entry.id === deadLetter.inboxId);
  if (inboxIndex === -1) {
    throw new Error(`Missing inbox item '${deadLetter.inboxId}' for business dead-letter '${deadLetterId}'.`);
  }

  const current = nextState.inbox[inboxIndex] as BusinessInboxItem;
  const nextItem: BusinessInboxItem = {
    ...current,
    status: "retrying",
    attemptCount: 0,
    updatedAt: new Date().toISOString()
  };
  delete nextItem.lastError;
  nextState.inbox[inboxIndex] = nextItem;
  return {
    state: refreshBusinessMessageStatus(nextState, current.messageId),
    inboxItem: cloneBusinessInboxItem(nextItem)
  };
}

export function recordBusinessProjection(
  state: BusinessOrchestrationState,
  input: {
    id?: string | undefined;
    tenantId: string;
    pluginId: string;
    documentId: string;
    projectionKey: string;
    status?: BusinessProjectionStatus | undefined;
    relatedMessageIds?: readonly string[] | undefined;
    summary?: Record<string, unknown> | undefined;
    updatedAt?: string | undefined;
  }
): { state: BusinessOrchestrationState; projection: BusinessProjectionRecord } {
  const nextState = createBusinessOrchestrationState(state);
  const currentIndex = nextState.projections.findIndex(
    (entry) =>
      entry.tenantId === input.tenantId && entry.pluginId === input.pluginId && entry.projectionKey === input.projectionKey
  );
  const projection: BusinessProjectionRecord = {
    id: input.id ?? (currentIndex === -1 ? randomUUID() : (nextState.projections[currentIndex] as BusinessProjectionRecord).id),
    tenantId: input.tenantId,
    pluginId: input.pluginId,
    documentId: input.documentId,
    projectionKey: input.projectionKey,
    status: input.status ?? "materialized",
    relatedMessageIds: [...new Set(input.relatedMessageIds ?? [])],
    summary: normalizeActionInput(input.summary ?? {}),
    updatedAt: input.updatedAt ?? new Date().toISOString()
  };

  if (currentIndex === -1) {
    nextState.projections.push(projection);
  } else {
    nextState.projections[currentIndex] = projection;
  }

  return {
    state: nextState,
    projection: cloneBusinessProjectionRecord(projection)
  };
}

export function listBusinessMessages(
  state: BusinessOrchestrationState,
  pluginId?: string | undefined
): BusinessOutboxMessage[] {
  return state.outbox
    .filter((entry) => !pluginId || entry.pluginId === pluginId)
    .map((entry) => cloneBusinessOutboxMessage(entry));
}

export function listBusinessInboxItems(
  state: BusinessOrchestrationState,
  options: { pluginId?: string | undefined; status?: BusinessInboxStatus | readonly BusinessInboxStatus[] | undefined } = {}
): BusinessInboxItem[] {
  const statuses = Array.isArray(options.status) ? options.status : options.status ? [options.status] : null;
  return state.inbox
    .filter((entry) => !options.pluginId || entry.pluginId === options.pluginId)
    .filter((entry) => !statuses || statuses.includes(entry.status))
    .map((entry) => cloneBusinessInboxItem(entry));
}

export function listBusinessDeadLetters(
  state: BusinessOrchestrationState,
  pluginId?: string | undefined
): BusinessDeadLetterRecord[] {
  return state.deadLetters
    .filter((entry) => !pluginId || entry.pluginId === pluginId)
    .map((entry) => cloneBusinessDeadLetterRecord(entry));
}

export function listBusinessProjections(
  state: BusinessOrchestrationState,
  pluginId?: string | undefined
): BusinessProjectionRecord[] {
  return state.projections
    .filter((entry) => !pluginId || entry.pluginId === pluginId)
    .map((entry) => cloneBusinessProjectionRecord(entry));
}

export function summarizeBusinessOrchestration(
  state: BusinessOrchestrationState,
  pluginId?: string | undefined
): BusinessOrchestrationSummary {
  const outbox = listBusinessMessages(state, pluginId);
  const inbox = listBusinessInboxItems(state, { pluginId });
  const deadLetters = listBusinessDeadLetters(state, pluginId);
  const projections = listBusinessProjections(state, pluginId);
  const pendingTargets = [...new Set(inbox.filter((entry) => entry.status !== "processed").map((entry) => entry.target))].sort();

  return {
    outbox: {
      pending: outbox.filter((entry) => entry.status === "pending").length,
      processed: outbox.filter((entry) => entry.status === "processed").length,
      "dead-letter": outbox.filter((entry) => entry.status === "dead-letter").length,
      total: outbox.length
    },
    inbox: {
      pending: inbox.filter((entry) => entry.status === "pending").length,
      retrying: inbox.filter((entry) => entry.status === "retrying").length,
      processed: inbox.filter((entry) => entry.status === "processed").length,
      "dead-letter": inbox.filter((entry) => entry.status === "dead-letter").length,
      total: inbox.length
    },
    deadLetters: deadLetters.length,
    projections: {
      pending: projections.filter((entry) => entry.status === "pending").length,
      materialized: projections.filter((entry) => entry.status === "materialized").length,
      stale: projections.filter((entry) => entry.status === "stale").length,
      total: projections.length
    },
    pendingTargets
  };
}

export function createImportRuntime() {
  const batches = new Map<string, ImportBatch>();

  function stageBatch(input: {
    batchId?: string | undefined;
    entity: string;
    rows: Array<{ id?: string | undefined; naturalKey?: string | null | undefined; payload: unknown }>;
    dedupeByNaturalKey?: boolean | undefined;
  }): ImportBatch {
    const createdAt = new Date().toISOString();
    const seenKeys = new Set<string>();
    const rows = input.rows.map((row) => {
      const naturalKey = row.naturalKey ?? null;
      const duplicate = Boolean(input.dedupeByNaturalKey ?? true) && naturalKey !== null && seenKeys.has(naturalKey);
      if (naturalKey !== null) {
        seenKeys.add(naturalKey);
      }
      return {
        id: row.id ?? randomUUID(),
        naturalKey,
        payload: normalizeActionInput(row.payload),
        status: duplicate ? ("quarantined" as const) : ("staged" as const),
        errors: duplicate ? [`Duplicate natural key '${naturalKey}' in import batch.`] : []
      } satisfies ImportBatchRow;
    });
    const batch: ImportBatch = {
      id: input.batchId ?? randomUUID(),
      entity: input.entity,
      status: rows.some((row) => row.status === "quarantined") ? "staged" : "staged",
      createdAt,
      updatedAt: createdAt,
      rows
    };
    batches.set(batch.id, cloneBatch(batch));
    return cloneBatch(batch);
  }

  function getBatch(batchId: string): ImportBatch {
    const batch = batches.get(batchId);
    if (!batch) {
      throw new Error(`Unknown import batch '${batchId}'.`);
    }
    return cloneBatch(batch);
  }

  function listBatches(): ImportBatch[] {
    return [...batches.values()].map((batch) => cloneBatch(batch));
  }

  function validateBatch(
    batchId: string,
    validator: (row: ImportBatchRow) => RowValidationResult | Promise<RowValidationResult>
  ): Promise<ImportBatch> {
    return updateBatch(batchId, async (current) => {
      const rows: ImportBatchRow[] = [];
      for (const row of current.rows) {
        if (row.status === "quarantined") {
          rows.push(row);
          continue;
        }

        const result = await validator(cloneRow(row));
        rows.push({
          ...row,
          status: result.ok ? "validated" : "quarantined",
          errors: result.ok ? [] : [...(result.errors ?? ["Validation failed."])]
        });
      }

      return {
        ...current,
        status: rows.every((row) => row.status === "validated" || row.status === "quarantined") ? "validated" : current.status,
        updatedAt: new Date().toISOString(),
        rows
      };
    });
  }

  function commitBatch(
    batchId: string,
    committer: (row: ImportBatchRow) => CommitRowResult | Promise<CommitRowResult>
  ): Promise<ImportBatch> {
    return updateBatch(batchId, async (current) => {
      const rows: ImportBatchRow[] = [];
      for (const row of current.rows) {
        if (row.status === "quarantined" || row.status === "committed" || row.status === "rolled-back") {
          rows.push(row);
          continue;
        }

        try {
          const result = await committer(cloneRow(row));
          rows.push({
            ...row,
            status: "committed",
            errors: [],
            ...(result.receipt === undefined ? {} : { receipt: normalizeActionInput(result.receipt) }),
            ...(result.compensation === undefined ? {} : { compensation: normalizeActionInput(result.compensation) })
          });
        } catch (error) {
          rows.push({
            ...row,
            status: "quarantined",
            errors: [error instanceof Error ? error.message : String(error)]
          });
        }
      }

      return {
        ...current,
        status: deriveBatchCommitStatus(rows),
        updatedAt: new Date().toISOString(),
        rows
      };
    });
  }

  function rollbackBatch(
    batchId: string,
    compensator: (row: ImportBatchRow) => void | Promise<void>
  ): Promise<ImportBatch> {
    return updateBatch(batchId, async (current) => {
      const rows: ImportBatchRow[] = [];
      for (const row of current.rows) {
        if (row.status !== "committed") {
          rows.push(row);
          continue;
        }

        await compensator(cloneRow(row));
        rows.push({
          ...row,
          status: "rolled-back"
        });
      }

      return {
        ...current,
        status: "rolled-back",
        updatedAt: new Date().toISOString(),
        rows
      };
    });
  }

  return {
    stageBatch,
    getBatch,
    listBatches,
    validateBatch,
    commitBatch,
    rollbackBatch
  };

  async function updateBatch(batchId: string, updater: (current: ImportBatch) => Promise<ImportBatch>): Promise<ImportBatch> {
    const current = batches.get(batchId);
    if (!current) {
      throw new Error(`Unknown import batch '${batchId}'.`);
    }
    const nextBatch = await updater(cloneBatch(current));
    batches.set(batchId, cloneBatch(nextBatch));
    return cloneBatch(nextBatch);
  }
}

export function createContractRegistry(options: {
  packages?: readonly PackageManifestInput[] | undefined;
  packs?: readonly PackManifestInput[] | undefined;
} = {}) {
  const packages = new Map<string, PackageManifest>();
  const packs = new Map<string, PackManifest>();

  for (const entry of options.packages ?? []) {
    registerPackage(entry);
  }
  for (const entry of options.packs ?? []) {
    registerPack(entry);
  }

  function registerPackage(manifest: PackageManifestInput): PackageManifest {
    const normalized = definePackageManifest(manifest);
    packages.set(normalized.id, normalized);
    return normalizeActionInput(normalized);
  }

  function registerPack(manifest: PackManifestInput): PackManifest {
    const normalized = definePackManifest(manifest);
    packs.set(normalized.name, normalized);
    return normalizeActionInput(normalized);
  }

  function listPackages(): PackageManifest[] {
    return [...packages.values()].map((entry) => normalizeActionInput(entry));
  }

  function listPacks(): PackManifest[] {
    return [...packs.values()].map((entry) => normalizeActionInput(entry));
  }

  function capabilityProviders(capability: string): string[] {
    return [...packages.values()].filter((entry) => entry.providesCapabilities.includes(capability)).map((entry) => entry.id);
  }

  function evaluate(options: { platformVersion?: string | undefined } = {}): ContractRegistryReport {
    const findings: ContractRegistryFinding[] = [];
    const capabilityIndex = Object.fromEntries(
      [...new Set([...packages.values()].flatMap((entry) => entry.providesCapabilities))].map((capability) => [
        capability,
        capabilityProviders(capability)
      ])
    );
    const dataOwners = summarizeOwners(packages.values());

    for (const [dataKey, owners] of Object.entries(dataOwners)) {
      if (owners.length > 1) {
        findings.push({
          severity: "error",
          code: "OWNERSHIP_CONFLICT",
          subject: dataKey,
          message: `Multiple packages claim write ownership of '${dataKey}': ${owners.join(", ")}.`
        });
      }
    }

    for (const manifest of packages.values()) {
      for (const dependency of manifest.dependencyContracts) {
        const target = packages.get(dependency.packageId);
        if (!target) {
          findings.push({
            severity: dependency.class === "required" ? "error" : "warning",
            code: "MISSING_DEPENDENCY",
            subject: `${manifest.id}->${dependency.packageId}`,
            message: `Package '${manifest.id}' requires missing dependency '${dependency.packageId}'.`
          });
          continue;
        }

        if (dependency.version && !satisfiesVersionRange(target.version, dependency.version)) {
          findings.push({
            severity: dependency.class === "required" ? "error" : "warning",
            code: "VERSION_MISMATCH",
            subject: `${manifest.id}->${dependency.packageId}`,
            message: `Package '${manifest.id}' expects '${dependency.packageId}' version '${dependency.version}' but found '${target.version}'.`
          });
        }

        for (const capability of dependency.capabilities) {
          if (!target.providesCapabilities.includes(capability)) {
            findings.push({
              severity: dependency.class === "required" ? "error" : "warning",
              code: "MISSING_CAPABILITY",
              subject: `${manifest.id}->${capability}`,
              message: `Dependency '${dependency.packageId}' does not provide required capability '${capability}' for '${manifest.id}'.`
            });
          }
        }
      }

      for (const capability of manifest.requestedCapabilities) {
        if ((capabilityIndex[capability] ?? []).length === 0) {
          findings.push({
            severity: "warning",
            code: "MISSING_CAPABILITY",
            subject: `${manifest.id}->${capability}`,
            message: `Package '${manifest.id}' requests capability '${capability}' but no provider is registered.`
          });
        }
      }

      for (const deprecatedId of manifest.deprecates) {
        if (packages.has(deprecatedId)) {
          findings.push({
            severity: "warning",
            code: "DEPRECATED_PACKAGE_PRESENT",
            subject: deprecatedId,
            message: `Package '${manifest.id}' deprecates '${deprecatedId}', which is still registered.`
          });
        }
      }
    }

    for (const manifest of packs.values()) {
      for (const dependencyName of manifest.dependsOnPacks) {
        const normalizedDependencyName = dependencyName.split("@")[0] ?? dependencyName;
        if (!packs.has(normalizedDependencyName)) {
          findings.push({
            severity: "error",
            code: "MISSING_PACK_DEPENDENCY",
            subject: `${manifest.name}->${dependencyName}`,
            message: `Pack '${manifest.name}' depends on missing pack '${dependencyName}'.`
          });
        }
      }

      if (options.platformVersion && !satisfiesVersionRange(options.platformVersion, manifest.platformVersion)) {
        findings.push({
          severity: "error",
          code: "PACK_PLUGIN_CONSTRAINT",
          subject: `${manifest.name}->platform`,
          message: `Pack '${manifest.name}' expects platform version '${manifest.platformVersion}' but found '${options.platformVersion}'.`
        });
      }

      for (const [packageId, versionRange] of Object.entries(manifest.pluginConstraints) as Array<[string, string]>) {
        const target = packages.get(packageId);
        if (!target || !satisfiesVersionRange(target.version, versionRange)) {
          findings.push({
            severity: "error",
            code: "PACK_PLUGIN_CONSTRAINT",
            subject: `${manifest.name}->${packageId}`,
            message: `Pack '${manifest.name}' expects package '${packageId}' to satisfy '${versionRange}'.`
          });
        }
      }
    }

    return {
      ok: findings.every((entry) => entry.severity !== "error"),
      findings,
      capabilityProviders: capabilityIndex,
      dataOwners
    };
  }

  return {
    registerPackage,
    registerPack,
    listPackages,
    listPacks,
    capabilityProviders,
    evaluate
  };
}

export function previewPackInstall(input: {
  manifest: PackManifest;
  objects: readonly PackRuntimeObject[];
  currentObjects?: readonly PackRuntimeObject[] | undefined;
}): PackRuntimePreview {
  const manifest = definePackManifest(input.manifest);
  const objectMap = new Map<string, PackRuntimeObject>((input.currentObjects ?? []).map((entry) => [packObjectKey(entry), clonePackObject(entry)]));
  const batchKeys = new Set(input.objects.map((entry) => packObjectKey(entry)));
  const summary: PackRuntimePreview = {
    added: 0,
    updated: 0,
    replaced: 0,
    blocked: 0,
    warnings: [],
    operations: []
  };

  for (const object of input.objects) {
    const current = objectMap.get(packObjectKey(object));
    const strategy = resolvePackMergeStrategy(manifest, object.type);
    const missingDependencies = object.dependencyRefs.filter((reference: string) => !batchKeys.has(reference) && !objectMap.has(reference));
    if (missingDependencies.length > 0) {
      summary.blocked += 1;
      summary.warnings.push(`Object '${packObjectKey(object)}' is blocked by missing dependencies: ${missingDependencies.join(", ")}.`);
      summary.operations.push({
        objectKey: packObjectKey(object),
        action: "blocked",
        strategy,
        warning: `Missing dependencies: ${missingDependencies.join(", ")}`
      });
      continue;
    }

    if (!current) {
      summary.added += 1;
      summary.operations.push({
        objectKey: packObjectKey(object),
        action: "add",
        strategy
      });
      continue;
    }

    if (current.immutable && !payloadEquals(current.payload, object.payload)) {
      summary.blocked += 1;
      summary.warnings.push(`Object '${packObjectKey(object)}' is immutable and cannot be overwritten.`);
      summary.operations.push({
        objectKey: packObjectKey(object),
        action: "blocked",
        strategy,
        warning: "Immutable object conflict."
      });
      continue;
    }

    if (strategy === "disabled-on-conflict") {
      summary.blocked += 1;
      summary.warnings.push(`Object '${packObjectKey(object)}' is disabled on conflict.`);
      summary.operations.push({
        objectKey: packObjectKey(object),
        action: "blocked",
        strategy,
        warning: "Conflict strategy disabled-on-conflict."
      });
      continue;
    }

    if (strategy === "replace") {
      summary.replaced += 1;
      summary.operations.push({
        objectKey: packObjectKey(object),
        action: "replace",
        strategy
      });
      continue;
    }

    summary.updated += 1;
    summary.operations.push({
      objectKey: packObjectKey(object),
      action: "update",
      strategy
    });
  }

  return summary;
}

export function applyPackInstall(input: {
  manifest: PackManifest;
  objects: readonly PackRuntimeObject[];
  currentObjects?: readonly PackRuntimeObject[] | undefined;
}): {
  preview: PackRuntimePreview;
  objects: PackRuntimeObject[];
  snapshot: DetailedPackRollbackSnapshot;
} {
  const manifest = definePackManifest(input.manifest);
  const preview = previewPackInstall(input);
  const current = new Map<string, PackRuntimeObject>((input.currentObjects ?? []).map((entry) => [packObjectKey(entry), clonePackObject(entry)]));
  const snapshotEntries: PackRollbackEntry[] = [];

  for (const operation of preview.operations) {
    if (operation.action === "blocked") {
      continue;
    }

    const object = input.objects.find((entry) => packObjectKey(entry) === operation.objectKey) as PackRuntimeObject;
    snapshotEntries.push({
      objectKey: operation.objectKey,
      before: current.has(operation.objectKey) ? clonePackObject(current.get(operation.objectKey) as PackRuntimeObject) : null
    });

    const strategy = resolvePackMergeStrategy(manifest, object.type);
    const existing = current.get(operation.objectKey);
    if (!existing || operation.action === "add" || strategy === "replace" || strategy === "upsert") {
      current.set(operation.objectKey, clonePackObject(object));
      continue;
    }

    current.set(operation.objectKey, {
      ...existing,
      ...clonePackObject(object),
      payload: mergePackPayload(existing.payload, object.payload)
    });
  }

  const snapshot: DetailedPackRollbackSnapshot = {
    snapshotId: randomUUID(),
    createdAt: new Date().toISOString(),
    strategy: manifest.rollbackStrategy,
    reversible: true,
    objects: snapshotEntries.map((entry) =>
      entry.before
        ? {
            type: entry.before.type,
            logicalKey: entry.before.logicalKey,
            uuid: entry.before.uuid,
            label: entry.before.label,
            owningPlugin: entry.before.owningPlugin,
            version: entry.before.version,
            environmentScope: entry.before.environmentScope,
            dependencyRefs: [...entry.before.dependencyRefs]
          }
        : {
            type: operationObjectType(entry.objectKey),
            logicalKey: operationLogicalKey(entry.objectKey),
            dependencyRefs: []
          }
    ),
    packName: manifest.name,
    packVersion: manifest.version,
    entries: snapshotEntries
  };

  return {
    preview,
    objects: [...current.values()].map((entry) => clonePackObject(entry)),
    snapshot
  };
}

export function rollbackPackInstall(
  snapshot: DetailedPackRollbackSnapshot,
  currentObjects: readonly PackRuntimeObject[]
): PackRuntimeObject[] {
  const objects = new Map<string, PackRuntimeObject>(currentObjects.map((entry) => [packObjectKey(entry), clonePackObject(entry)]));
  for (const entry of snapshot.entries) {
    if (entry.before === null) {
      objects.delete(entry.objectKey);
      continue;
    }
    objects.set(entry.objectKey, clonePackObject(entry.before));
  }
  return [...objects.values()].map((entry) => clonePackObject(entry));
}

export function trustAllowsPack(manifest: PackManifest, allowedTiers: readonly PackManifest["trustTier"][]): boolean {
  const normalized = definePackManifest(manifest);
  return allowedTiers.includes(normalized.trustTier);
}

export function satisfiesVersionRange(version: string, range: string): boolean {
  const normalizedRange = range.trim();
  if (!normalizedRange || normalizedRange === "*") {
    return true;
  }

  if (normalizedRange.startsWith("^")) {
    const base = parseSemver(normalizedRange.slice(1));
    const upper: Semver = [base[0] + 1, 0, 0];
    return compareSemver(parseSemver(version), base) >= 0 && compareSemver(parseSemver(version), upper) < 0;
  }

  return normalizedRange.split(/\s+/).every((token) => evaluateComparator(version, token));
}

type Semver = [number, number, number];

function parseSemver(input: string): Semver {
  const cleaned = input.trim().replace(/^v/i, "").split(/[+-]/)[0] ?? "0.0.0";
  const parts = cleaned.split(".").map((entry) => Number.parseInt(entry, 10));
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function compareSemver(left: Semver, right: Semver): number {
  for (let index = 0; index < 3; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    if (delta !== 0) {
      return delta < 0 ? -1 : 1;
    }
  }
  return 0;
}

function evaluateComparator(version: string, comparator: string): boolean {
  const normalizedVersion = parseSemver(version);
  const operators = [">=", "<=", ">", "<", "="];
  const operator = operators.find((entry) => comparator.startsWith(entry));
  if (!operator) {
    return compareSemver(normalizedVersion, parseSemver(comparator)) === 0;
  }

  const comparison = compareSemver(normalizedVersion, parseSemver(comparator.slice(operator.length)));
  switch (operator) {
    case ">=":
      return comparison >= 0;
    case "<=":
      return comparison <= 0;
    case ">":
      return comparison > 0;
    case "<":
      return comparison < 0;
    default:
      return comparison === 0;
  }
}

function createScopeKey(definition: NumberSeriesDefinition, context: NumberingContext | undefined): string {
  const normalized = defineNumberSeries(definition);
  const dimensions: string[] = [];
  if (normalized.scope?.company) {
    dimensions.push(`company:${context?.companyId ?? "*"}`);
  }
  if (normalized.scope?.branch) {
    dimensions.push(`branch:${context?.branchId ?? "*"}`);
  }
  if (normalized.scope?.fiscalYear) {
    dimensions.push(`fiscalYear:${context?.fiscalYear ?? "*"}`);
  }
  return dimensions.join("|");
}

function counterKey(seriesId: string, scopeKey: string): string {
  return `${seriesId}:${scopeKey}`;
}

function renderSeriesValue(definition: NumberSeriesDefinition, context: NumberingContext | undefined, sequence: number): string {
  const date = context?.date ? new Date(context.date) : new Date();
  const replacements: Record<string, string> = {
    company: context?.companyId ?? "",
    branch: context?.branchId ?? "",
    fiscalYear: context?.fiscalYear ?? "",
    yyyy: String(date.getUTCFullYear()),
    mm: String(date.getUTCMonth() + 1).padStart(2, "0"),
    dd: String(date.getUTCDate()).padStart(2, "0"),
    seq: String(sequence).padStart(definition.sequencePadding ?? 4, "0")
  };
  return definition.pattern
    .replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, token) => replacements[token] ?? "")
    .replace(/--+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/(^[-/]+|[-/]+$)/g, "");
}

type BusinessDomainStoreRuntimeConfig =
  | {
      engine: "sqlite";
      filePath: string;
      runtimeTablePrefix: string;
    }
  | {
      engine: "postgres";
      connectionString: string;
      runtimeSchemaName: string;
    };

function resolveBusinessDomainStoreRuntimeConfig<
  TPrimary extends BusinessPrimaryRecordLike,
  TSecondary extends BusinessSecondaryRecordLike,
  TException extends BusinessExceptionRecordLike
>(
  options: BusinessDomainStateStoreOptions<TPrimary, TSecondary, TException>
): BusinessDomainStoreRuntimeConfig {
  const engine = process.env.GUTU_DB_ENGINE?.toLowerCase();
  if (engine === "postgres") {
    const connectionString =
      options.postgres.connectionString ??
      process.env.GUTU_BUSINESS_POSTGRES_URL ??
      process.env.TEST_POSTGRES_URL ??
      process.env.DATABASE_TEST_URL ??
      process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("GUTU_DB_ENGINE=postgres requires GUTU_BUSINESS_POSTGRES_URL or DATABASE_URL.");
    }

    return {
      engine: "postgres",
      connectionString,
      runtimeSchemaName: normalizeIdentifier(
        options.postgres.runtimeSchemaName ?? process.env.GUTU_BUSINESS_RUNTIME_SCHEMA ?? "business_runtime",
        "runtimeSchemaName"
      )
    };
  }

  return {
    engine: "sqlite",
    filePath: path.resolve(
      process.env.GUTU_BUSINESS_SQLITE_PATH ??
        resolveStateFile(options.sqlite.dbFileName ?? process.env.GUTU_BUSINESS_SQLITE_FILE ?? "business-runtime.sqlite")
    ),
    runtimeTablePrefix: normalizePrefix(
      options.sqlite.runtimeTablePrefix ?? process.env.GUTU_BUSINESS_SQLITE_PREFIX ?? "business_runtime_"
    )
  };
}

async function withSqliteBusinessStore<
  TResult,
  TPrimary extends BusinessPrimaryRecordLike,
  TSecondary extends BusinessSecondaryRecordLike,
  TException extends BusinessExceptionRecordLike
>(
  runtimeConfig: Extract<BusinessDomainStoreRuntimeConfig, { engine: "sqlite" }>,
  options: BusinessDomainStateStoreOptions<TPrimary, TSecondary, TException>,
  worker: (database: {
    exec(sql: string): void;
    query(statement: string): {
      all(...params: unknown[]): Array<Record<string, unknown>>;
      run(...params: unknown[]): unknown;
    };
    close(): void;
  }) => Promise<TResult> | TResult
): Promise<TResult> {
  const { Database } = await import("bun:sqlite");
  mkdirSync(path.dirname(runtimeConfig.filePath), { recursive: true });
  const database = new Database(runtimeConfig.filePath, { create: true, strict: true });

  try {
    database.exec("PRAGMA journal_mode = WAL;");
    database.exec("PRAGMA foreign_keys = ON;");
    ensureSqliteBusinessStore(database, runtimeConfig, options);
    return await worker(database);
  } finally {
    database.close();
  }
}

async function withPostgresBusinessStore<
  TResult,
  TPrimary extends BusinessPrimaryRecordLike,
  TSecondary extends BusinessSecondaryRecordLike,
  TException extends BusinessExceptionRecordLike
>(
  runtimeConfig: Extract<BusinessDomainStoreRuntimeConfig, { engine: "postgres" }>,
  options: BusinessDomainStateStoreOptions<TPrimary, TSecondary, TException>,
  worker: (client: { raw: { unsafe(statement: string): Promise<Array<Record<string, unknown>>> } }) => Promise<TResult>
): Promise<TResult> {
  const { createDbClient } = await import("@platform/db-drizzle");
  const client = createDbClient({
    engine: "postgres",
    connectionString: runtimeConfig.connectionString,
    maxConnections: 1
  });

  try {
    await ensurePostgresBusinessStore(client, runtimeConfig, options);
    return await worker(client);
  } finally {
    await client.close();
  }
}

function ensureSqliteBusinessStore<
  TPrimary extends BusinessPrimaryRecordLike,
  TSecondary extends BusinessSecondaryRecordLike,
  TException extends BusinessExceptionRecordLike
>(
  database: {
    exec(sql: string): void;
  },
  runtimeConfig: Extract<BusinessDomainStoreRuntimeConfig, { engine: "sqlite" }>,
  options: BusinessDomainStateStoreOptions<TPrimary, TSecondary, TException>
): void {
  for (const statement of buildBusinessRuntimeSqliteMigrationSql({ tablePrefix: runtimeConfig.runtimeTablePrefix })) {
    database.exec(statement);
  }
  for (const statement of buildGenericBusinessDomainSqliteMigrationSql(options.sqlite)) {
    database.exec(statement);
  }
}

async function ensurePostgresBusinessStore<
  TPrimary extends BusinessPrimaryRecordLike,
  TSecondary extends BusinessSecondaryRecordLike,
  TException extends BusinessExceptionRecordLike
>(
  client: { raw: { unsafe(statement: string): Promise<Array<Record<string, unknown>>> } },
  runtimeConfig: Extract<BusinessDomainStoreRuntimeConfig, { engine: "postgres" }>,
  options: BusinessDomainStateStoreOptions<TPrimary, TSecondary, TException>
): Promise<void> {
  for (const statement of buildBusinessRuntimeMigrationSql({ schemaName: runtimeConfig.runtimeSchemaName })) {
    await client.raw.unsafe(statement);
  }
  for (const statement of buildGenericBusinessDomainPostgresMigrationSql(options.postgres.schemaName)) {
    await client.raw.unsafe(statement);
  }
}

function buildGenericBusinessDomainSqliteMigrationSql(input: {
  primaryTable: string;
  secondaryTable: string;
  exceptionTable: string;
}): string[] {
  const primaryTable = normalizeIdentifier(input.primaryTable, "primaryTable");
  const secondaryTable = normalizeIdentifier(input.secondaryTable, "secondaryTable");
  const exceptionTable = normalizeIdentifier(input.exceptionTable, "exceptionTable");

  return [
    `CREATE TABLE IF NOT EXISTS ${primaryTable} (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, title TEXT NOT NULL, counterparty_id TEXT NOT NULL, company_id TEXT NOT NULL, branch_id TEXT NOT NULL, record_state TEXT NOT NULL, approval_state TEXT NOT NULL, posting_state TEXT NOT NULL, fulfillment_state TEXT NOT NULL, amount_minor INTEGER NOT NULL, currency_code TEXT NOT NULL, revision_no INTEGER NOT NULL, reason_code TEXT NULL, effective_at TEXT NOT NULL, correlation_id TEXT NOT NULL, process_id TEXT NOT NULL, upstream_refs TEXT NOT NULL, downstream_refs TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`,
    `CREATE TABLE IF NOT EXISTS ${secondaryTable} (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, primary_record_id TEXT NOT NULL, label TEXT NOT NULL, status TEXT NOT NULL, requested_action TEXT NOT NULL, reason_code TEXT NULL, correlation_id TEXT NOT NULL, process_id TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`,
    `CREATE TABLE IF NOT EXISTS ${exceptionTable} (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, primary_record_id TEXT NOT NULL, severity TEXT NOT NULL, status TEXT NOT NULL, reason_code TEXT NOT NULL, upstream_ref TEXT NULL, downstream_ref TEXT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ${primaryTable}_lookup_idx ON ${primaryTable} (tenant_id, title, correlation_id);`,
    `CREATE INDEX IF NOT EXISTS ${exceptionTable}_status_idx ON ${exceptionTable} (tenant_id, status, severity);`
  ];
}

function buildGenericBusinessDomainPostgresMigrationSql(schemaName: string): string[] {
  const normalizedSchema = normalizeIdentifier(schemaName, "schemaName");
  return [
    `CREATE SCHEMA IF NOT EXISTS ${normalizedSchema};`,
    `CREATE TABLE IF NOT EXISTS ${normalizedSchema}.primary_records (id text PRIMARY KEY, tenant_id text NOT NULL, title text NOT NULL, counterparty_id text NOT NULL, company_id text NOT NULL, branch_id text NOT NULL, record_state text NOT NULL, approval_state text NOT NULL, posting_state text NOT NULL, fulfillment_state text NOT NULL, amount_minor integer NOT NULL, currency_code text NOT NULL, revision_no integer NOT NULL, reason_code text NULL, effective_at timestamptz NOT NULL, correlation_id text NOT NULL, process_id text NOT NULL, upstream_refs jsonb NOT NULL, downstream_refs jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());`,
    `CREATE TABLE IF NOT EXISTS ${normalizedSchema}.secondary_records (id text PRIMARY KEY, tenant_id text NOT NULL, primary_record_id text NOT NULL, label text NOT NULL, status text NOT NULL, requested_action text NOT NULL, reason_code text NULL, correlation_id text NOT NULL, process_id text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());`,
    `CREATE TABLE IF NOT EXISTS ${normalizedSchema}.exception_records (id text PRIMARY KEY, tenant_id text NOT NULL, primary_record_id text NOT NULL, severity text NOT NULL, status text NOT NULL, reason_code text NOT NULL, upstream_ref text NULL, downstream_ref text NULL, updated_at timestamptz NOT NULL DEFAULT now());`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ${normalizedSchema}_primary_lookup_idx ON ${normalizedSchema}.primary_records (tenant_id, title, correlation_id);`,
    `CREATE INDEX IF NOT EXISTS ${normalizedSchema}_exception_status_idx ON ${normalizedSchema}.exception_records (tenant_id, status, severity);`
  ];
}

function readSqliteBusinessPluginState<
  TPrimary extends BusinessPrimaryRecordLike,
  TSecondary extends BusinessSecondaryRecordLike,
  TException extends BusinessExceptionRecordLike
>(
  database: {
    query(statement: string): {
      all(...params: unknown[]): Array<Record<string, unknown>>;
    };
  },
  runtimeConfig: Extract<BusinessDomainStoreRuntimeConfig, { engine: "sqlite" }>,
  options: BusinessDomainStateStoreOptions<TPrimary, TSecondary, TException>
): BusinessPluginState<TPrimary, TSecondary, TException> {
  const runtimeTables = runtimeSqliteTableNames(runtimeConfig.runtimeTablePrefix);
  const primaryRecords = database
    .query(`SELECT * FROM ${normalizeIdentifier(options.sqlite.primaryTable, "primaryTable")} ORDER BY updated_at DESC`)
    .all()
    .map((row) => deserializeSqlitePrimaryRecord(row) as TPrimary);
  const secondaryRecords = database
    .query(`SELECT * FROM ${normalizeIdentifier(options.sqlite.secondaryTable, "secondaryTable")} ORDER BY updated_at DESC`)
    .all()
    .map((row) => deserializeSqliteSecondaryRecord(row) as TSecondary);
  const exceptionRecords = database
    .query(`SELECT * FROM ${normalizeIdentifier(options.sqlite.exceptionTable, "exceptionTable")} ORDER BY updated_at DESC`)
    .all()
    .map((row) => deserializeSqliteExceptionRecord(row) as TException);

  return {
    primaryRecords,
    secondaryRecords,
    exceptionRecords,
    orchestration: createBusinessOrchestrationState({
      outbox: database
        .query(
          `SELECT * FROM ${runtimeTables.outbox} WHERE plugin_id = ? ORDER BY created_at ASC`
        )
        .all(options.pluginId)
        .map((row) => deserializeSqliteOutboxMessage(row)),
      inbox: database
        .query(
          `SELECT * FROM ${runtimeTables.inbox} WHERE plugin_id = ? ORDER BY updated_at ASC`
        )
        .all(options.pluginId)
        .map((row) => deserializeSqliteInboxItem(row)),
      deadLetters: database
        .query(
          `SELECT * FROM ${runtimeTables.deadLetters} WHERE plugin_id = ? ORDER BY failed_at ASC`
        )
        .all(options.pluginId)
        .map((row) => deserializeSqliteDeadLetter(row)),
      projections: database
        .query(
          `SELECT * FROM ${runtimeTables.projections} WHERE plugin_id = ? ORDER BY updated_at ASC`
        )
        .all(options.pluginId)
        .map((row) => deserializeSqliteProjection(row))
    })
  };
}

function writeSqliteBusinessPluginState<
  TPrimary extends BusinessPrimaryRecordLike,
  TSecondary extends BusinessSecondaryRecordLike,
  TException extends BusinessExceptionRecordLike
>(
  database: {
    query(statement: string): {
      run(...params: unknown[]): unknown;
    };
  },
  runtimeConfig: Extract<BusinessDomainStoreRuntimeConfig, { engine: "sqlite" }>,
  options: BusinessDomainStateStoreOptions<TPrimary, TSecondary, TException>,
  state: BusinessPluginState<TPrimary, TSecondary, TException>
): void {
  deleteSqliteBusinessPluginState(database, runtimeConfig, options);

  const primaryInsert = database.query(
    `INSERT INTO ${normalizeIdentifier(options.sqlite.primaryTable, "primaryTable")} (id, tenant_id, title, counterparty_id, company_id, branch_id, record_state, approval_state, posting_state, fulfillment_state, amount_minor, currency_code, revision_no, reason_code, effective_at, correlation_id, process_id, upstream_refs, downstream_refs, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const entry of state.primaryRecords) {
    primaryInsert.run(
      entry.id,
      entry.tenantId,
      entry.title,
      entry.counterpartyId,
      entry.companyId,
      entry.branchId,
      entry.recordState,
      entry.approvalState,
      entry.postingState,
      entry.fulfillmentState,
      entry.amountMinor,
      entry.currencyCode,
      entry.revisionNo,
      entry.reasonCode,
      entry.effectiveAt,
      entry.correlationId,
      entry.processId,
      JSON.stringify(entry.upstreamRefs),
      JSON.stringify(entry.downstreamRefs),
      entry.updatedAt
    );
  }

  const secondaryInsert = database.query(
    `INSERT INTO ${normalizeIdentifier(options.sqlite.secondaryTable, "secondaryTable")} (id, tenant_id, primary_record_id, label, status, requested_action, reason_code, correlation_id, process_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const entry of state.secondaryRecords) {
    secondaryInsert.run(
      entry.id,
      entry.tenantId,
      entry.primaryRecordId,
      entry.label,
      entry.status,
      entry.requestedAction,
      entry.reasonCode,
      entry.correlationId,
      entry.processId,
      entry.updatedAt
    );
  }

  const exceptionInsert = database.query(
    `INSERT INTO ${normalizeIdentifier(options.sqlite.exceptionTable, "exceptionTable")} (id, tenant_id, primary_record_id, severity, status, reason_code, upstream_ref, downstream_ref, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const entry of state.exceptionRecords) {
    exceptionInsert.run(
      entry.id,
      entry.tenantId,
      entry.primaryRecordId,
      entry.severity,
      entry.status,
      entry.reasonCode,
      entry.upstreamRef,
      entry.downstreamRef,
      entry.updatedAt
    );
  }

  const runtimeTables = runtimeSqliteTableNames(runtimeConfig.runtimeTablePrefix);
  const outboxInsert = database.query(
    `INSERT INTO ${runtimeTables.outbox} (id, tenant_id, plugin_id, document_id, type, payload, correlation_id, process_id, status, consumer_count, delivered_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const message of state.orchestration.outbox) {
    outboxInsert.run(
      message.id,
      message.tenantId,
      message.pluginId,
      message.documentId,
      message.type,
      JSON.stringify(message.payload),
      message.correlationId ?? null,
      message.processId ?? null,
      message.status,
      message.consumerCount,
      message.deliveredCount,
      message.createdAt,
      message.updatedAt
    );
  }

  const inboxInsert = database.query(
    `INSERT INTO ${runtimeTables.inbox} (id, message_id, tenant_id, plugin_id, document_id, target, status, attempt_count, last_error, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const item of state.orchestration.inbox) {
    inboxInsert.run(
      item.id,
      item.messageId,
      item.tenantId,
      item.pluginId,
      item.documentId,
      item.target,
      item.status,
      item.attemptCount,
      item.lastError ?? null,
      item.updatedAt
    );
  }

  const deadLetterInsert = database.query(
    `INSERT INTO ${runtimeTables.deadLetters} (id, message_id, inbox_id, tenant_id, plugin_id, document_id, target, reason, attempt_count, failed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const item of state.orchestration.deadLetters) {
    deadLetterInsert.run(
      item.id,
      item.messageId,
      item.inboxId,
      item.tenantId,
      item.pluginId,
      item.documentId,
      item.target,
      item.reason,
      item.attemptCount,
      item.failedAt
    );
  }

  const projectionInsert = database.query(
    `INSERT INTO ${runtimeTables.projections} (id, tenant_id, plugin_id, document_id, projection_key, status, related_message_ids, summary, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const item of state.orchestration.projections) {
    projectionInsert.run(
      item.id,
      item.tenantId,
      item.pluginId,
      item.documentId,
      item.projectionKey,
      item.status,
      JSON.stringify(item.relatedMessageIds),
      JSON.stringify(item.summary),
      item.updatedAt
    );
  }
}

function deleteSqliteBusinessPluginState<
  TPrimary extends BusinessPrimaryRecordLike,
  TSecondary extends BusinessSecondaryRecordLike,
  TException extends BusinessExceptionRecordLike
>(
  database: {
    query(statement: string): {
      run(...params: unknown[]): unknown;
    };
  },
  runtimeConfig: Extract<BusinessDomainStoreRuntimeConfig, { engine: "sqlite" }>,
  options: BusinessDomainStateStoreOptions<TPrimary, TSecondary, TException>
): void {
  const runtimeTables = runtimeSqliteTableNames(runtimeConfig.runtimeTablePrefix);
  database.query(`DELETE FROM ${normalizeIdentifier(options.sqlite.primaryTable, "primaryTable")}`).run();
  database.query(`DELETE FROM ${normalizeIdentifier(options.sqlite.secondaryTable, "secondaryTable")}`).run();
  database.query(`DELETE FROM ${normalizeIdentifier(options.sqlite.exceptionTable, "exceptionTable")}`).run();
  database.query(`DELETE FROM ${runtimeTables.outbox} WHERE plugin_id = ?`).run(options.pluginId);
  database.query(`DELETE FROM ${runtimeTables.inbox} WHERE plugin_id = ?`).run(options.pluginId);
  database.query(`DELETE FROM ${runtimeTables.deadLetters} WHERE plugin_id = ?`).run(options.pluginId);
  database.query(`DELETE FROM ${runtimeTables.projections} WHERE plugin_id = ?`).run(options.pluginId);
}

async function readPostgresBusinessPluginState<
  TPrimary extends BusinessPrimaryRecordLike,
  TSecondary extends BusinessSecondaryRecordLike,
  TException extends BusinessExceptionRecordLike
>(
  client: { raw: { unsafe(statement: string): Promise<Array<Record<string, unknown>>> } },
  runtimeConfig: Extract<BusinessDomainStoreRuntimeConfig, { engine: "postgres" }>,
  options: BusinessDomainStateStoreOptions<TPrimary, TSecondary, TException>
): Promise<BusinessPluginState<TPrimary, TSecondary, TException>> {
  const schemaName = normalizeIdentifier(options.postgres.schemaName, "schemaName");
  const primaryRecords = (
    await client.raw.unsafe(`SELECT * FROM ${schemaName}.primary_records ORDER BY updated_at DESC`)
  ).map((row) => deserializePostgresPrimaryRecord(row) as TPrimary);
  const secondaryRecords = (
    await client.raw.unsafe(`SELECT * FROM ${schemaName}.secondary_records ORDER BY updated_at DESC`)
  ).map((row) => deserializePostgresSecondaryRecord(row) as TSecondary);
  const exceptionRecords = (
    await client.raw.unsafe(`SELECT * FROM ${schemaName}.exception_records ORDER BY updated_at DESC`)
  ).map((row) => deserializePostgresExceptionRecord(row) as TException);

  return {
    primaryRecords,
    secondaryRecords,
    exceptionRecords,
    orchestration: createBusinessOrchestrationState({
      outbox: (
        await client.raw.unsafe(
          `SELECT * FROM ${runtimeConfig.runtimeSchemaName}.business_outbox_messages WHERE plugin_id = ${toPostgresLiteral(options.pluginId)} ORDER BY created_at ASC`
        )
      ).map((row) => deserializePostgresOutboxMessage(row)),
      inbox: (
        await client.raw.unsafe(
          `SELECT * FROM ${runtimeConfig.runtimeSchemaName}.business_inbox_items WHERE plugin_id = ${toPostgresLiteral(options.pluginId)} ORDER BY updated_at ASC`
        )
      ).map((row) => deserializePostgresInboxItem(row)),
      deadLetters: (
        await client.raw.unsafe(
          `SELECT * FROM ${runtimeConfig.runtimeSchemaName}.business_dead_letters WHERE plugin_id = ${toPostgresLiteral(options.pluginId)} ORDER BY failed_at ASC`
        )
      ).map((row) => deserializePostgresDeadLetter(row)),
      projections: (
        await client.raw.unsafe(
          `SELECT * FROM ${runtimeConfig.runtimeSchemaName}.business_projections WHERE plugin_id = ${toPostgresLiteral(options.pluginId)} ORDER BY updated_at ASC`
        )
      ).map((row) => deserializePostgresProjection(row))
    })
  };
}

async function writePostgresBusinessPluginState<
  TPrimary extends BusinessPrimaryRecordLike,
  TSecondary extends BusinessSecondaryRecordLike,
  TException extends BusinessExceptionRecordLike
>(
  client: { raw: { unsafe(statement: string): Promise<Array<Record<string, unknown>>> } },
  runtimeConfig: Extract<BusinessDomainStoreRuntimeConfig, { engine: "postgres" }>,
  options: BusinessDomainStateStoreOptions<TPrimary, TSecondary, TException>,
  state: BusinessPluginState<TPrimary, TSecondary, TException>
): Promise<void> {
  await deletePostgresBusinessPluginState(client, runtimeConfig, options);
  const schemaName = normalizeIdentifier(options.postgres.schemaName, "schemaName");

  for (const entry of state.primaryRecords) {
    await client.raw.unsafe(
      `INSERT INTO ${schemaName}.primary_records (id, tenant_id, title, counterparty_id, company_id, branch_id, record_state, approval_state, posting_state, fulfillment_state, amount_minor, currency_code, revision_no, reason_code, effective_at, correlation_id, process_id, upstream_refs, downstream_refs, updated_at) VALUES (${toPostgresLiteral(entry.id)}, ${toPostgresLiteral(entry.tenantId)}, ${toPostgresLiteral(entry.title)}, ${toPostgresLiteral(entry.counterpartyId)}, ${toPostgresLiteral(entry.companyId)}, ${toPostgresLiteral(entry.branchId)}, ${toPostgresLiteral(entry.recordState)}, ${toPostgresLiteral(entry.approvalState)}, ${toPostgresLiteral(entry.postingState)}, ${toPostgresLiteral(entry.fulfillmentState)}, ${toPostgresLiteral(entry.amountMinor)}, ${toPostgresLiteral(entry.currencyCode)}, ${toPostgresLiteral(entry.revisionNo)}, ${toPostgresLiteral(entry.reasonCode)}, ${toPostgresLiteral(entry.effectiveAt)}, ${toPostgresLiteral(entry.correlationId)}, ${toPostgresLiteral(entry.processId)}, ${toPostgresJson(entry.upstreamRefs)}, ${toPostgresJson(entry.downstreamRefs)}, ${toPostgresLiteral(entry.updatedAt)})`
    );
  }

  for (const entry of state.secondaryRecords) {
    await client.raw.unsafe(
      `INSERT INTO ${schemaName}.secondary_records (id, tenant_id, primary_record_id, label, status, requested_action, reason_code, correlation_id, process_id, updated_at) VALUES (${toPostgresLiteral(entry.id)}, ${toPostgresLiteral(entry.tenantId)}, ${toPostgresLiteral(entry.primaryRecordId)}, ${toPostgresLiteral(entry.label)}, ${toPostgresLiteral(entry.status)}, ${toPostgresLiteral(entry.requestedAction)}, ${toPostgresLiteral(entry.reasonCode)}, ${toPostgresLiteral(entry.correlationId)}, ${toPostgresLiteral(entry.processId)}, ${toPostgresLiteral(entry.updatedAt)})`
    );
  }

  for (const entry of state.exceptionRecords) {
    await client.raw.unsafe(
      `INSERT INTO ${schemaName}.exception_records (id, tenant_id, primary_record_id, severity, status, reason_code, upstream_ref, downstream_ref, updated_at) VALUES (${toPostgresLiteral(entry.id)}, ${toPostgresLiteral(entry.tenantId)}, ${toPostgresLiteral(entry.primaryRecordId)}, ${toPostgresLiteral(entry.severity)}, ${toPostgresLiteral(entry.status)}, ${toPostgresLiteral(entry.reasonCode)}, ${toPostgresLiteral(entry.upstreamRef)}, ${toPostgresLiteral(entry.downstreamRef)}, ${toPostgresLiteral(entry.updatedAt)})`
    );
  }

  for (const entry of state.orchestration.outbox) {
    await client.raw.unsafe(
      `INSERT INTO ${runtimeConfig.runtimeSchemaName}.business_outbox_messages (id, tenant_id, plugin_id, document_id, type, payload, correlation_id, process_id, status, consumer_count, delivered_count, created_at, updated_at) VALUES (${toPostgresLiteral(entry.id)}, ${toPostgresLiteral(entry.tenantId)}, ${toPostgresLiteral(entry.pluginId)}, ${toPostgresLiteral(entry.documentId)}, ${toPostgresLiteral(entry.type)}, ${toPostgresJson(entry.payload)}, ${toPostgresLiteral(entry.correlationId ?? null)}, ${toPostgresLiteral(entry.processId ?? null)}, ${toPostgresLiteral(entry.status)}, ${toPostgresLiteral(entry.consumerCount)}, ${toPostgresLiteral(entry.deliveredCount)}, ${toPostgresLiteral(entry.createdAt)}, ${toPostgresLiteral(entry.updatedAt)})`
    );
  }

  for (const entry of state.orchestration.inbox) {
    await client.raw.unsafe(
      `INSERT INTO ${runtimeConfig.runtimeSchemaName}.business_inbox_items (id, message_id, tenant_id, plugin_id, document_id, target, status, attempt_count, last_error, updated_at) VALUES (${toPostgresLiteral(entry.id)}, ${toPostgresLiteral(entry.messageId)}, ${toPostgresLiteral(entry.tenantId)}, ${toPostgresLiteral(entry.pluginId)}, ${toPostgresLiteral(entry.documentId)}, ${toPostgresLiteral(entry.target)}, ${toPostgresLiteral(entry.status)}, ${toPostgresLiteral(entry.attemptCount)}, ${toPostgresLiteral(entry.lastError ?? null)}, ${toPostgresLiteral(entry.updatedAt)})`
    );
  }

  for (const entry of state.orchestration.deadLetters) {
    await client.raw.unsafe(
      `INSERT INTO ${runtimeConfig.runtimeSchemaName}.business_dead_letters (id, message_id, inbox_id, tenant_id, plugin_id, document_id, target, reason, attempt_count, failed_at) VALUES (${toPostgresLiteral(entry.id)}, ${toPostgresLiteral(entry.messageId)}, ${toPostgresLiteral(entry.inboxId)}, ${toPostgresLiteral(entry.tenantId)}, ${toPostgresLiteral(entry.pluginId)}, ${toPostgresLiteral(entry.documentId)}, ${toPostgresLiteral(entry.target)}, ${toPostgresLiteral(entry.reason)}, ${toPostgresLiteral(entry.attemptCount)}, ${toPostgresLiteral(entry.failedAt)})`
    );
  }

  for (const entry of state.orchestration.projections) {
    await client.raw.unsafe(
      `INSERT INTO ${runtimeConfig.runtimeSchemaName}.business_projections (id, tenant_id, plugin_id, document_id, projection_key, status, related_message_ids, summary, updated_at) VALUES (${toPostgresLiteral(entry.id)}, ${toPostgresLiteral(entry.tenantId)}, ${toPostgresLiteral(entry.pluginId)}, ${toPostgresLiteral(entry.documentId)}, ${toPostgresLiteral(entry.projectionKey)}, ${toPostgresLiteral(entry.status)}, ${toPostgresJson(entry.relatedMessageIds)}, ${toPostgresJson(entry.summary)}, ${toPostgresLiteral(entry.updatedAt)})`
    );
  }
}

async function deletePostgresBusinessPluginState<
  TPrimary extends BusinessPrimaryRecordLike,
  TSecondary extends BusinessSecondaryRecordLike,
  TException extends BusinessExceptionRecordLike
>(
  client: { raw: { unsafe(statement: string): Promise<Array<Record<string, unknown>>> } },
  runtimeConfig: Extract<BusinessDomainStoreRuntimeConfig, { engine: "postgres" }>,
  options: BusinessDomainStateStoreOptions<TPrimary, TSecondary, TException>
): Promise<void> {
  const schemaName = normalizeIdentifier(options.postgres.schemaName, "schemaName");
  await client.raw.unsafe(`DELETE FROM ${schemaName}.primary_records`);
  await client.raw.unsafe(`DELETE FROM ${schemaName}.secondary_records`);
  await client.raw.unsafe(`DELETE FROM ${schemaName}.exception_records`);
  await client.raw.unsafe(
    `DELETE FROM ${runtimeConfig.runtimeSchemaName}.business_outbox_messages WHERE plugin_id = ${toPostgresLiteral(options.pluginId)}`
  );
  await client.raw.unsafe(
    `DELETE FROM ${runtimeConfig.runtimeSchemaName}.business_inbox_items WHERE plugin_id = ${toPostgresLiteral(options.pluginId)}`
  );
  await client.raw.unsafe(
    `DELETE FROM ${runtimeConfig.runtimeSchemaName}.business_dead_letters WHERE plugin_id = ${toPostgresLiteral(options.pluginId)}`
  );
  await client.raw.unsafe(
    `DELETE FROM ${runtimeConfig.runtimeSchemaName}.business_projections WHERE plugin_id = ${toPostgresLiteral(options.pluginId)}`
  );
}

function runtimeSqliteTableNames(tablePrefix: string) {
  const prefix = normalizePrefix(tablePrefix);
  return {
    outbox: `${prefix}business_outbox_messages`,
    inbox: `${prefix}business_inbox_items`,
    deadLetters: `${prefix}business_dead_letters`,
    projections: `${prefix}business_projections`
  };
}

function deserializeSqlitePrimaryRecord(row: Record<string, unknown>): BusinessPrimaryRecordLike {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    title: String(row.title),
    counterpartyId: String(row.counterparty_id),
    companyId: String(row.company_id),
    branchId: String(row.branch_id),
    recordState: String(row.record_state),
    approvalState: String(row.approval_state),
    postingState: String(row.posting_state),
    fulfillmentState: String(row.fulfillment_state),
    amountMinor: Number(row.amount_minor),
    currencyCode: String(row.currency_code),
    revisionNo: Number(row.revision_no),
    reasonCode: row.reason_code == null ? null : String(row.reason_code),
    effectiveAt: String(row.effective_at),
    correlationId: String(row.correlation_id),
    processId: String(row.process_id),
    upstreamRefs: parseJsonStringArray(row.upstream_refs),
    downstreamRefs: parseJsonStringArray(row.downstream_refs),
    updatedAt: String(row.updated_at)
  };
}

function deserializeSqliteSecondaryRecord(row: Record<string, unknown>): BusinessSecondaryRecordLike {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    primaryRecordId: String(row.primary_record_id),
    label: String(row.label),
    status: String(row.status),
    requestedAction: String(row.requested_action),
    reasonCode: row.reason_code == null ? null : String(row.reason_code),
    correlationId: String(row.correlation_id),
    processId: String(row.process_id),
    updatedAt: String(row.updated_at)
  };
}

function deserializeSqliteExceptionRecord(row: Record<string, unknown>): BusinessExceptionRecordLike {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    primaryRecordId: String(row.primary_record_id),
    severity: String(row.severity),
    status: String(row.status),
    reasonCode: String(row.reason_code),
    upstreamRef: row.upstream_ref == null ? null : String(row.upstream_ref),
    downstreamRef: row.downstream_ref == null ? null : String(row.downstream_ref),
    updatedAt: String(row.updated_at)
  };
}

function deserializeSqliteOutboxMessage(row: Record<string, unknown>): BusinessOutboxMessage {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    pluginId: String(row.plugin_id),
    documentId: String(row.document_id),
    type: String(row.type),
    payload: parseJsonValue(row.payload),
    correlationId: row.correlation_id == null ? undefined : String(row.correlation_id),
    processId: row.process_id == null ? undefined : String(row.process_id),
    status: String(row.status) as BusinessOutboxStatus,
    consumerCount: Number(row.consumer_count),
    deliveredCount: Number(row.delivered_count),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function deserializeSqliteInboxItem(row: Record<string, unknown>): BusinessInboxItem {
  return {
    id: String(row.id),
    messageId: String(row.message_id),
    tenantId: String(row.tenant_id),
    pluginId: String(row.plugin_id),
    documentId: String(row.document_id),
    target: String(row.target),
    status: String(row.status) as BusinessInboxStatus,
    attemptCount: Number(row.attempt_count),
    lastError: row.last_error == null ? undefined : String(row.last_error),
    updatedAt: String(row.updated_at)
  };
}

function deserializeSqliteDeadLetter(row: Record<string, unknown>): BusinessDeadLetterRecord {
  return {
    id: String(row.id),
    messageId: String(row.message_id),
    inboxId: String(row.inbox_id),
    tenantId: String(row.tenant_id),
    pluginId: String(row.plugin_id),
    documentId: String(row.document_id),
    target: String(row.target),
    reason: String(row.reason),
    attemptCount: Number(row.attempt_count),
    failedAt: String(row.failed_at)
  };
}

function deserializeSqliteProjection(row: Record<string, unknown>): BusinessProjectionRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    pluginId: String(row.plugin_id),
    documentId: String(row.document_id),
    projectionKey: String(row.projection_key),
    status: String(row.status) as BusinessProjectionStatus,
    relatedMessageIds: parseJsonStringArray(row.related_message_ids),
    summary: parseJsonRecord(row.summary),
    updatedAt: String(row.updated_at)
  };
}

function deserializePostgresPrimaryRecord(row: Record<string, unknown>): BusinessPrimaryRecordLike {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    title: String(row.title),
    counterpartyId: String(row.counterparty_id),
    companyId: String(row.company_id),
    branchId: String(row.branch_id),
    recordState: String(row.record_state),
    approvalState: String(row.approval_state),
    postingState: String(row.posting_state),
    fulfillmentState: String(row.fulfillment_state),
    amountMinor: Number(row.amount_minor),
    currencyCode: String(row.currency_code),
    revisionNo: Number(row.revision_no),
    reasonCode: row.reason_code == null ? null : String(row.reason_code),
    effectiveAt: normalizeTimestamp(row.effective_at),
    correlationId: String(row.correlation_id),
    processId: String(row.process_id),
    upstreamRefs: normalizeStringArray(row.upstream_refs),
    downstreamRefs: normalizeStringArray(row.downstream_refs),
    updatedAt: normalizeTimestamp(row.updated_at)
  };
}

function deserializePostgresSecondaryRecord(row: Record<string, unknown>): BusinessSecondaryRecordLike {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    primaryRecordId: String(row.primary_record_id),
    label: String(row.label),
    status: String(row.status),
    requestedAction: String(row.requested_action),
    reasonCode: row.reason_code == null ? null : String(row.reason_code),
    correlationId: String(row.correlation_id),
    processId: String(row.process_id),
    updatedAt: normalizeTimestamp(row.updated_at)
  };
}

function deserializePostgresExceptionRecord(row: Record<string, unknown>): BusinessExceptionRecordLike {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    primaryRecordId: String(row.primary_record_id),
    severity: String(row.severity),
    status: String(row.status),
    reasonCode: String(row.reason_code),
    upstreamRef: row.upstream_ref == null ? null : String(row.upstream_ref),
    downstreamRef: row.downstream_ref == null ? null : String(row.downstream_ref),
    updatedAt: normalizeTimestamp(row.updated_at)
  };
}

function deserializePostgresOutboxMessage(row: Record<string, unknown>): BusinessOutboxMessage {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    pluginId: String(row.plugin_id),
    documentId: String(row.document_id),
    type: String(row.type),
    payload: normalizeActionInput(row.payload),
    correlationId: row.correlation_id == null ? undefined : String(row.correlation_id),
    processId: row.process_id == null ? undefined : String(row.process_id),
    status: String(row.status) as BusinessOutboxStatus,
    consumerCount: Number(row.consumer_count),
    deliveredCount: Number(row.delivered_count),
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at)
  };
}

function deserializePostgresInboxItem(row: Record<string, unknown>): BusinessInboxItem {
  return {
    id: String(row.id),
    messageId: String(row.message_id),
    tenantId: String(row.tenant_id),
    pluginId: String(row.plugin_id),
    documentId: String(row.document_id),
    target: String(row.target),
    status: String(row.status) as BusinessInboxStatus,
    attemptCount: Number(row.attempt_count),
    lastError: row.last_error == null ? undefined : String(row.last_error),
    updatedAt: normalizeTimestamp(row.updated_at)
  };
}

function deserializePostgresDeadLetter(row: Record<string, unknown>): BusinessDeadLetterRecord {
  return {
    id: String(row.id),
    messageId: String(row.message_id),
    inboxId: String(row.inbox_id),
    tenantId: String(row.tenant_id),
    pluginId: String(row.plugin_id),
    documentId: String(row.document_id),
    target: String(row.target),
    reason: String(row.reason),
    attemptCount: Number(row.attempt_count),
    failedAt: normalizeTimestamp(row.failed_at)
  };
}

function deserializePostgresProjection(row: Record<string, unknown>): BusinessProjectionRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    pluginId: String(row.plugin_id),
    documentId: String(row.document_id),
    projectionKey: String(row.projection_key),
    status: String(row.status) as BusinessProjectionStatus,
    relatedMessageIds: normalizeStringArray(row.related_message_ids),
    summary: normalizeRecord(row.summary),
    updatedAt: normalizeTimestamp(row.updated_at)
  };
}

function businessPluginStateHasPersistedRows<
  TPrimary extends BusinessPrimaryRecordLike,
  TSecondary extends BusinessSecondaryRecordLike,
  TException extends BusinessExceptionRecordLike
>(state: BusinessPluginState<TPrimary, TSecondary, TException>): boolean {
  return (
    state.primaryRecords.length > 0 ||
    state.secondaryRecords.length > 0 ||
    state.exceptionRecords.length > 0 ||
    state.orchestration.outbox.length > 0 ||
    state.orchestration.inbox.length > 0 ||
    state.orchestration.deadLetters.length > 0 ||
    state.orchestration.projections.length > 0
  );
}

function cloneBusinessPluginState<
  TPrimary extends BusinessPrimaryRecordLike,
  TSecondary extends BusinessSecondaryRecordLike,
  TException extends BusinessExceptionRecordLike
>(state: BusinessPluginState<TPrimary, TSecondary, TException>): BusinessPluginState<TPrimary, TSecondary, TException> {
  return {
    primaryRecords: state.primaryRecords.map((entry) => normalizeActionInput(entry)),
    secondaryRecords: state.secondaryRecords.map((entry) => normalizeActionInput(entry)),
    exceptionRecords: state.exceptionRecords.map((entry) => normalizeActionInput(entry)),
    orchestration: createBusinessOrchestrationState(state.orchestration)
  };
}

function clonePrimaryRecordLike<TPrimary extends BusinessPrimaryRecordLike>(entry: TPrimary): TPrimary {
  return normalizeActionInput(entry);
}

function upsertBusinessEntity<TEntry extends { id: string }>(entries: readonly TEntry[], nextEntry: TEntry): TEntry[] {
  const index = entries.findIndex((entry) => entry.id === nextEntry.id);
  if (index === -1) {
    return [...entries, normalizeActionInput(nextEntry)];
  }

  const nextEntries = [...entries];
  nextEntries[index] = normalizeActionInput(nextEntry);
  return nextEntries;
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return normalizeActionInput(value);
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function parseJsonStringArray(value: unknown): string[] {
  const parsed = parseJsonValue(value);
  return normalizeStringArray(parsed);
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
  return normalizeRecord(parseJsonValue(value));
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry)) : [];
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? normalizeActionInput(value) : {};
}

function sanitizeIdentifier(value: string): string {
  return value.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function normalizeTimestamp(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return new Date(String(value)).toISOString();
}

function toPostgresLiteral(value: unknown): string {
  if (value == null) {
    return "NULL";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }
  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

function toPostgresJson(value: unknown): string {
  return `${toPostgresLiteral(JSON.stringify(normalizeActionInput(value)))}::jsonb`;
}

function normalizeIdentifier(value: string, label: string): string {
  if (!/^[a-z][a-z0-9_]*$/i.test(value)) {
    throw new Error(`${label} must use simple alphanumeric or underscore SQL identifiers`);
  }
  return value.toLowerCase();
}

function normalizePrefix(value: string): string {
  if (!/^[a-z][a-z0-9_]*$/i.test(value)) {
    throw new Error("prefix must use simple alphanumeric or underscore SQL identifiers");
  }
  return value.toLowerCase();
}

function cloneNumberAllocation(allocation: NumberAllocation): NumberAllocation {
  return {
    ...allocation
  };
}

function pickExchangeRate(
  exchangeRates: readonly ExchangeRateDefinition[],
  input: { fromCurrency: string; toCurrency: string; effectiveAt: string; tenantId?: string | null | undefined }
): ExchangeRateDefinition | undefined {
  return [...exchangeRates]
    .filter((entry) => entry.fromCurrency === input.fromCurrency && entry.toCurrency === input.toCurrency)
    .filter((entry) => Date.parse(entry.effectiveAt) <= Date.parse(input.effectiveAt))
    .filter((entry) => entry.tenantId == null || entry.tenantId === input.tenantId)
    .sort((left, right) => {
      const tenantScore = Number(right.tenantId === input.tenantId) - Number(left.tenantId === input.tenantId);
      if (tenantScore !== 0) {
        return tenantScore;
      }
      return Date.parse(right.effectiveAt) - Date.parse(left.effectiveAt);
    })[0];
}

function conditionsMatch(
  conditions: Record<string, string | number | boolean | null> | undefined,
  attributes: Record<string, string | number | boolean | null> | undefined
): boolean {
  if (!conditions) {
    return true;
  }
  return Object.entries(conditions).every(([key, value]) => attributes?.[key] === value);
}

function countConditionKeys(conditions: Record<string, string | number | boolean | null> | undefined): number {
  return Object.keys(conditions ?? {}).length;
}

function cloneLink(link: BusinessDocumentLink): BusinessDocumentLink {
  return {
    ...link,
    ...(link.metadata ? { metadata: normalizeActionInput(link.metadata) } : {})
  };
}

function cloneReconciliationItem(item: ReconciliationItem): ReconciliationItem {
  return {
    ...item
  };
}

function cloneBusinessOutboxMessage(message: BusinessOutboxMessage): BusinessOutboxMessage {
  return {
    ...message,
    payload: normalizeActionInput(message.payload)
  };
}

function cloneBusinessInboxItem(item: BusinessInboxItem): BusinessInboxItem {
  return {
    ...item
  };
}

function cloneBusinessDeadLetterRecord(record: BusinessDeadLetterRecord): BusinessDeadLetterRecord {
  return {
    ...record
  };
}

function cloneBusinessProjectionRecord(record: BusinessProjectionRecord): BusinessProjectionRecord {
  return {
    ...record,
    relatedMessageIds: [...record.relatedMessageIds],
    summary: normalizeActionInput(record.summary)
  };
}

function summarizeCounts(values: readonly string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((summary, value) => {
    summary[value] = (summary[value] ?? 0) + 1;
    return summary;
  }, {});
}

function cloneRow(row: ImportBatchRow): ImportBatchRow {
  return {
    ...row,
    payload: normalizeActionInput(row.payload),
    ...(row.receipt === undefined ? {} : { receipt: normalizeActionInput(row.receipt) }),
    ...(row.compensation === undefined ? {} : { compensation: normalizeActionInput(row.compensation) }),
    errors: [...row.errors]
  };
}

function cloneBatch(batch: ImportBatch): ImportBatch {
  return {
    ...batch,
    rows: batch.rows.map((row) => cloneRow(row))
  };
}

function deriveBatchCommitStatus(rows: readonly ImportBatchRow[]): ImportBatch["status"] {
  const committed = rows.filter((row) => row.status === "committed").length;
  const quarantined = rows.filter((row) => row.status === "quarantined").length;
  if (committed > 0 && quarantined > 0) {
    return "partially-committed";
  }
  if (committed === rows.length) {
    return "committed";
  }
  if (rows.every((row) => row.status === "validated" || row.status === "quarantined")) {
    return "validated";
  }
  return "staged";
}

function summarizeOwners(entries: Iterable<PackageManifest>): Record<string, string[]> {
  const owners = new Map<string, Set<string>>();
  for (const manifest of entries) {
    for (const dataKey of manifest.ownsData) {
      if (!owners.has(dataKey)) {
        owners.set(dataKey, new Set());
      }
      (owners.get(dataKey) as Set<string>).add(manifest.id);
    }
  }
  return Object.fromEntries([...owners.entries()].map(([key, value]) => [key, [...value]]));
}

function resolvePackMergeStrategy(manifest: PackManifest, objectType: string): PackMergeStrategy {
  const exact = manifest.mergePolicy[objectType];
  if (exact) {
    return exact;
  }
  const prefix = objectType.split(".")[0] ?? objectType;
  return manifest.mergePolicy[prefix] ?? "upsert";
}

function mergePackPayload(current: unknown, incoming: unknown): unknown {
  if (!isPlainObject(current) || !isPlainObject(incoming)) {
    return normalizeActionInput(incoming);
  }

  const result: Record<string, unknown> = {
    ...normalizeActionInput(current)
  };
  for (const [key, value] of Object.entries(incoming)) {
    const currentValue = result[key];
    result[key] = isPlainObject(currentValue) && isPlainObject(value) ? mergePackPayload(currentValue, value) : normalizeActionInput(value);
  }
  return result;
}

function payloadEquals(left: unknown, right: unknown): boolean {
  return JSON.stringify(normalizeActionInput(left)) === JSON.stringify(normalizeActionInput(right));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clonePackObject(object: PackRuntimeObject): PackRuntimeObject {
  return {
    ...object,
    dependencyRefs: [...object.dependencyRefs],
    payload: normalizeActionInput(object.payload)
  };
}

function packObjectKey(object: Pick<PackRuntimeObject, "type" | "logicalKey">): string {
  return `${object.type}:${object.logicalKey}`;
}

function operationObjectType(key: string): string {
  return key.split(":")[0] ?? key;
}

function operationLogicalKey(key: string): string {
  return key.split(":").slice(1).join(":");
}

function refreshBusinessMessageStatus(state: BusinessOrchestrationState, messageId: string): BusinessOrchestrationState {
  const outboxIndex = state.outbox.findIndex((entry) => entry.id === messageId);
  if (outboxIndex === -1) {
    return state;
  }

  const message = state.outbox[outboxIndex] as BusinessOutboxMessage;
  const inboxEntries = state.inbox.filter((entry) => entry.messageId === messageId);
  const deliveredCount = inboxEntries.filter((entry) => entry.status === "processed").length;
  const hasPending = inboxEntries.some((entry) => entry.status === "pending" || entry.status === "retrying");
  const hasDeadLetter = inboxEntries.some((entry) => entry.status === "dead-letter");
  const nextMessage: BusinessOutboxMessage = {
    ...message,
    consumerCount: inboxEntries.length,
    deliveredCount,
    status: inboxEntries.length === 0 ? "processed" : hasPending ? "pending" : hasDeadLetter ? "dead-letter" : "processed",
    updatedAt: new Date().toISOString()
  };
  state.outbox[outboxIndex] = nextMessage;
  return state;
}
