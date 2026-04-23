import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  applyPackInstall,
  createBusinessDomainStateStore,
  createBusinessOrchestrationState,
  createBusinessPluginService,
  createContractRegistry,
  createImportRuntime,
  createLocalizationRuntime,
  createNumberingRuntime,
  createTraceabilityRuntime,
  definePackManifest,
  failBusinessInboxItem,
  previewPackInstall,
  publishBusinessMessage,
  recordBusinessProjection,
  replayBusinessDeadLetter,
  resolveBusinessInboxItem,
  rollbackPackInstall,
  summarizeBusinessOrchestration,
  trustAllowsPack
} from "../../src";

const businessCategory = {
  id: "business",
  label: "Business",
  subcategoryId: "sales_commerce",
  subcategoryLabel: "Sales & Commerce"
} as const;

describe("@platform/business-runtime", () => {
  afterEach(() => {
    delete process.env.GUTU_DB_ENGINE;
    delete process.env.GUTU_BUSINESS_SQLITE_PATH;
  });

  it("allocates scoped document numbers with idempotency and void history", () => {
    const runtime = createNumberingRuntime({
      series: [
        {
          id: "sales-order",
          docType: "Sales Order",
          pattern: "SO-{{company}}-{{fiscalYear}}-{{seq}}"
        }
      ]
    });

    const first = runtime.allocate({
      seriesId: "sales-order",
      context: { companyId: "ACME", fiscalYear: "2026" },
      idempotencyKey: "order-1"
    });
    const replay = runtime.allocate({
      seriesId: "sales-order",
      context: { companyId: "ACME", fiscalYear: "2026" },
      idempotencyKey: "order-1"
    });
    const second = runtime.allocate({
      seriesId: "sales-order",
      context: { companyId: "ACME", fiscalYear: "2026" },
      idempotencyKey: "order-2"
    });
    const voided = runtime.voidAllocation(first.id, "customer-canceled");

    expect(first.value).toBe("SO-ACME-2026-0001");
    expect(replay.id).toBe(first.id);
    expect(second.value).toBe("SO-ACME-2026-0002");
    expect(voided.status).toBe("void");
    expect(runtime.preview({ seriesId: "sales-order", context: { companyId: "ACME", fiscalYear: "2026" } })).toBe(
      "SO-ACME-2026-0003"
    );
  });

  it("converts money with exchange rates and resolves tax rules by specificity", () => {
    const runtime = createLocalizationRuntime({
      currencies: [
        { code: "USD", precision: 2, symbol: "$" },
        { code: "INR", precision: 2, symbol: "Rs" }
      ],
      exchangeRates: [
        {
          fromCurrency: "USD",
          toCurrency: "INR",
          rate: 83.25,
          effectiveAt: "2026-04-01T00:00:00.000Z",
          source: "treasury-feed"
        }
      ],
      taxRegimes: [
        {
          id: "india-gst",
          countryCode: "IN",
          currencyCode: "INR",
          rules: [
            {
              id: "gst-standard",
              category: "standard",
              rate: 0.18,
              priority: 10,
              conditions: { placeOfSupply: "IN" }
            },
            {
              id: "gst-export-zero",
              category: "standard",
              rate: 0,
              priority: 20,
              conditions: { placeOfSupply: "export" }
            }
          ]
        }
      ]
    });

    const converted = runtime.convertMoney({
      amountMinor: 10_000,
      fromCurrency: "USD",
      toCurrency: "INR",
      effectiveAt: "2026-04-15T00:00:00.000Z"
    });
    const tax = runtime.determineTax({
      regimeId: "india-gst",
      category: "standard",
      amountMinor: converted.amountMinor,
      attributes: { placeOfSupply: "IN" }
    });

    expect(converted.amountMinor).toBe(832_500);
    expect(tax.ruleId).toBe("gst-standard");
    expect(tax.amountMinor).toBe(149_850);
  });

  it("tracks lineage and reconciliation queues explicitly", () => {
    const runtime = createTraceabilityRuntime();
    runtime.recordLink({
      tenantId: "tenant-1",
      sourceDocumentId: "lead:1",
      targetDocumentId: "quote:1",
      relation: "qualifies"
    });
    runtime.recordLink({
      tenantId: "tenant-1",
      sourceDocumentId: "quote:1",
      targetDocumentId: "order:1",
      relation: "converts"
    });
    const queued = runtime.queueReconciliation({
      tenantId: "tenant-1",
      pluginId: "sales",
      documentId: "order:1",
      severity: "warning",
      status: "open",
      reasonCode: "billing-pending"
    });
    runtime.transitionReconciliation(queued.id, "resolved", "user:ops");

    const lineage = runtime.getLineage("quote:1");
    const summary = runtime.summarizeReconciliation("sales");

    expect(lineage.nodes).toEqual(expect.arrayContaining(["lead:1", "quote:1", "order:1"]));
    expect(summary.byStatus.resolved).toBe(1);
  });

  it("tracks business outbox, inbox, dead-letter, replay, and projection state", () => {
    let state = createBusinessOrchestrationState();
    const published = publishBusinessMessage(state, {
      tenantId: "tenant-1",
      pluginId: "sales-core",
      documentId: "sales-order:1",
      type: "sales.order-confirmed.v1",
      payload: { recordId: "sales-order:1" },
      correlationId: "corr:1",
      processId: "sales-order-lifecycle:1",
      targets: ["inventory.reservations.allocate", "accounting.billing.post"]
    });
    state = published.state;

    const failed = failBusinessInboxItem(state, {
      inboxId: published.inboxItems[0]?.id as string,
      error: "inventory queue unavailable",
      maxAttempts: 1
    });
    state = failed.state;

    const replayed = replayBusinessDeadLetter(state, failed.deadLetter?.id as string);
    state = replayed.state;

    const resolvedOne = resolveBusinessInboxItem(state, replayed.inboxItem.id);
    state = resolvedOne.state;

    const resolvedTwo = resolveBusinessInboxItem(state, published.inboxItems[1]?.id as string);
    const projected = recordBusinessProjection(resolvedTwo.state, {
      tenantId: "tenant-1",
      pluginId: "sales-core",
      documentId: "sales-order:1",
      projectionKey: "sales.orders:sales-order:1",
      relatedMessageIds: [published.message.id],
      status: "materialized",
      summary: { postingState: "pending", downstream: "complete" }
    });

    const summary = summarizeBusinessOrchestration(projected.state, "sales-core");

    expect(summary.outbox.processed).toBe(1);
    expect(summary.deadLetters).toBe(0);
    expect(summary.inbox.processed).toBe(2);
    expect(summary.projections.materialized).toBe(1);
  });

  it("persists business plugin state through the shared sqlite store and generic service factory", async () => {
    const sqlitePath = join(mkdtempSync(join(tmpdir(), "business-runtime-")), "business-runtime.sqlite");
    process.env.GUTU_BUSINESS_SQLITE_PATH = sqlitePath;

    try {
      const store = createBusinessDomainStateStore({
        pluginId: "sales-core",
        sqlite: {
          primaryTable: "sales_core_primary_records",
          secondaryTable: "sales_core_secondary_records",
          exceptionTable: "sales_core_exception_records",
          dbFileName: "business-runtime.sqlite"
        },
        postgres: {
          schemaName: "sales_core"
        },
        seedStateFactory: () => ({
          primaryRecords: [
            {
              id: "sales-core:seed",
              tenantId: "tenant-platform",
              title: "Sales Seed",
              counterpartyId: "party:seed",
              companyId: "company:seed",
              branchId: "branch:seed",
              recordState: "active",
              approvalState: "approved",
              postingState: "unposted",
              fulfillmentState: "none",
              amountMinor: 1000,
              currencyCode: "USD",
              revisionNo: 1,
              reasonCode: null,
              effectiveAt: "2026-04-23T00:00:00.000Z",
              correlationId: "sales-core:seed",
              processId: "sales-flow:seed",
              upstreamRefs: [],
              downstreamRefs: [],
              updatedAt: "2026-04-23T00:00:00.000Z"
            }
          ],
          secondaryRecords: [],
          exceptionRecords: [],
          orchestration: createBusinessOrchestrationState()
        })
      });

      const service = createBusinessPluginService({
        pluginId: "sales-core",
        displayName: "Sales Core",
        primaryResourceId: "sales.orders",
        secondaryResourceId: "sales.fulfillment-requests",
        exceptionResourceId: "sales.billing-requests",
        createEvent: "sales.quote-created.v1",
        advanceEvent: "sales.order-confirmed.v1",
        reconcileEvent: "sales.billing-requested.v1",
        projectionJobId: "sales.projections.refresh",
        reconciliationJobId: "sales.reconciliation.run",
        advanceActionLabel: "Confirm Order",
        orchestrationTargets: {
          create: [],
          advance: ["inventory.reservations.allocate"],
          reconcile: ["accounting.billing.post"]
        },
        store
      });

      const created = await service.createPrimaryRecord({
        tenantId: "tenant-demo",
        actorId: "actor-admin",
        recordId: "sales-core:demo",
        title: "Sales Demo",
        counterpartyId: "party-demo",
        companyId: "company-demo",
        branchId: "branch-demo",
        amountMinor: 5000,
        currencyCode: "USD",
        effectiveAt: "2026-04-23T00:00:00.000Z",
        correlationId: "sales-core:demo",
        processId: "sales-order-lifecycle:demo"
      });

      expect(created.revisionNo).toBe(1);

      const advanced = await service.advancePrimaryRecord({
        tenantId: "tenant-demo",
        actorId: "actor-admin",
        recordId: "sales-core:demo",
        expectedRevisionNo: 1,
        approvalState: "approved",
        postingState: "posted",
        fulfillmentState: "partial",
        downstreamRef: "reservation:1"
      });

      expect(advanced.revisionNo).toBe(2);
      expect((await service.listPendingDownstreamItems()).length).toBeGreaterThan(0);

      const reloadedStore = await store.loadState();
      expect(reloadedStore.primaryRecords.find((entry) => entry.id === "sales-core:demo")?.revisionNo).toBe(2);
      expect(reloadedStore.orchestration.inbox.length).toBeGreaterThan(0);
    } finally {
      rmSync(join(sqlitePath, ".."), { recursive: true, force: true });
    }
  });

  it("stages imports, quarantines duplicates or failures, and supports rollback", async () => {
    const runtime = createImportRuntime();
    const staged = runtime.stageBatch({
      entity: "party",
      rows: [
        { naturalKey: "party:acme", payload: { name: "ACME" } },
        { naturalKey: "party:acme", payload: { name: "ACME Duplicate" } },
        { naturalKey: "party:globex", payload: { name: "Globex", valid: true } }
      ]
    });

    const validated = await runtime.validateBatch(staged.id, async (row) => ({
      ok: row.naturalKey === "party:globex" ? Boolean((row.payload as { valid?: boolean }).valid) : true,
      errors: row.naturalKey === "party:globex" ? ["missing policy evidence"] : undefined
    }));
    const committed = await runtime.commitBatch(validated.id, async (row) => {
      if (row.naturalKey === "party:acme") {
        return {
          receipt: { persistedId: "party:1" },
          compensation: { persistedId: "party:1", action: "delete" }
        };
      }
      throw new Error("unexpected row");
    });
    const rolledBack = await runtime.rollbackBatch(committed.id, async () => {});

    expect(validated.rows.filter((row) => row.status === "quarantined")).toHaveLength(1);
    expect(committed.rows.filter((row) => row.status === "committed")).toHaveLength(1);
    expect(committed.rows.filter((row) => row.status === "quarantined")).toHaveLength(2);
    expect(rolledBack.rows.filter((row) => row.status === "rolled-back")).toHaveLength(1);
  });

  it("reports contract ownership conflicts, missing dependencies, deprecations, and pack constraints", () => {
    const registry = createContractRegistry({
      packages: [
        {
          id: "sales-core",
          kind: "plugin",
          version: "1.2.0",
          description: "Sales truth.",
          defaultCategory: businessCategory,
          dependencyContracts: [{ packageId: "party-core", class: "required", version: ">=1.0 <2.0" }],
          requestedCapabilities: ["accounting.posting-intents"],
          providesCapabilities: ["sales.orders"],
          ownsData: ["sales.orders"],
          extendsData: [],
          publicCommands: ["sales.orders.confirm"],
          publicQueries: ["sales.orders.summary"],
          publicEvents: ["sales.orders.confirmed.v1"],
          deprecates: []
        },
        {
          id: "inventory-core",
          kind: "plugin",
          version: "1.0.0",
          description: "Inventory truth.",
          defaultCategory: {
            id: "business",
            label: "Business",
            subcategoryId: "inventory_warehouse",
            subcategoryLabel: "Inventory & Warehouse"
          },
          dependencyContracts: [],
          requestedCapabilities: [],
          providesCapabilities: [],
          ownsData: ["sales.orders"],
          extendsData: [],
          publicCommands: [],
          publicQueries: [],
          publicEvents: [],
          deprecates: []
        },
        {
          id: "accounting-core",
          kind: "plugin",
          version: "1.1.0",
          description: "Accounting truth.",
          defaultCategory: {
            id: "business",
            label: "Business",
            subcategoryId: "accounting_finance",
            subcategoryLabel: "Accounting & Finance"
          },
          dependencyContracts: [],
          requestedCapabilities: [],
          providesCapabilities: ["accounting.posting-intents"],
          ownsData: ["accounting.journals"],
          extendsData: [],
          publicCommands: [],
          publicQueries: [],
          publicEvents: [],
          deprecates: ["legacy-sales"]
        },
        {
          id: "legacy-sales",
          kind: "plugin",
          version: "0.9.0",
          description: "Deprecated sales package.",
          defaultCategory: businessCategory,
          dependencyContracts: [],
          requestedCapabilities: [],
          providesCapabilities: [],
          ownsData: ["legacy.sales"],
          extendsData: [],
          publicCommands: [],
          publicQueries: [],
          publicEvents: [],
          deprecates: []
        }
      ],
      packs: [
        definePackManifest({
          packType: "starter-pack",
          name: "distribution-pack",
          version: "1.0.0",
          publisher: "gutu",
          platformVersion: ">=2.0 <3.0",
          pluginConstraints: {
            "sales-core": ">=1.0 <2.0",
            "party-core": ">=1.0 <2.0"
          },
          dependsOnPacks: ["base-core@^2.0.0"],
          mergePolicy: {}
        }),
        definePackManifest({
          packType: "base-template",
          name: "base-core",
          version: "2.1.0",
          publisher: "gutu",
          platformVersion: ">=2.0 <3.0",
          pluginConstraints: {},
          dependsOnPacks: [],
          mergePolicy: {}
        })
      ]
    });

    const report = registry.evaluate({
      platformVersion: "2.3.0"
    });

    expect(report.ok).toBe(false);
    expect(report.findings.map((entry) => entry.code)).toEqual(
      expect.arrayContaining(["OWNERSHIP_CONFLICT", "MISSING_DEPENDENCY", "DEPRECATED_PACKAGE_PRESENT", "PACK_PLUGIN_CONSTRAINT"])
    );
    expect(report.capabilityProviders["accounting.posting-intents"]).toEqual(["accounting-core"]);
  });

  it("previews, applies, and rolls back pack objects with merge semantics", () => {
    const manifest = definePackManifest({
      packType: "starter-pack",
      name: "service-company",
      version: "1.0.0",
      publisher: "gutu",
      platformVersion: ">=2.0 <3.0",
      pluginConstraints: {},
      dependsOnPacks: [],
      mergePolicy: {
        settings: "merge",
        workflows: "replace",
        secrets: "disabled-on-conflict"
      },
      trustTier: "first-party-signed"
    });
    const currentObjects = [
      {
        type: "settings",
        logicalKey: "sales.defaults",
        dependencyRefs: [],
        payload: {
          rounding: "line",
          branch: "hq"
        }
      },
      {
        type: "workflows",
        logicalKey: "sales.order",
        dependencyRefs: [],
        payload: {
          states: ["draft"]
        }
      },
      {
        type: "secrets",
        logicalKey: "stripe",
        dependencyRefs: [],
        immutable: true,
        payload: {
          ref: "vault://stripe/prod"
        }
      }
    ];
    const nextObjects = [
      {
        type: "settings",
        logicalKey: "sales.defaults",
        dependencyRefs: [],
        payload: {
          branch: "blr",
          currency: "USD"
        }
      },
      {
        type: "workflows",
        logicalKey: "sales.order",
        dependencyRefs: [],
        payload: {
          states: ["draft", "approved"]
        }
      },
      {
        type: "secrets",
        logicalKey: "stripe",
        dependencyRefs: [],
        payload: {
          ref: "vault://stripe/rotated"
        }
      }
    ];

    const preview = previewPackInstall({
      manifest,
      objects: nextObjects,
      currentObjects
    });
    const applied = applyPackInstall({
      manifest,
      objects: nextObjects,
      currentObjects
    });
    const rolledBack = rollbackPackInstall(applied.snapshot, applied.objects);

    expect(preview.updated).toBe(1);
    expect(preview.replaced).toBe(1);
    expect(preview.blocked).toBe(1);
    expect(trustAllowsPack(manifest, ["first-party-signed"])).toBe(true);
    expect(
      applied.objects.find((entry) => entry.type === "settings" && entry.logicalKey === "sales.defaults")?.payload
    ).toEqual({
      rounding: "line",
      branch: "blr",
      currency: "USD"
    });
    expect(rolledBack).toEqual(currentObjects);
  });
});
