import { describe, expect, it } from "bun:test";

import {
  buildBusinessRuntimeMigrationSql,
  buildBusinessRuntimeRollbackSql,
  getBusinessRuntimeAllocationIdempotencyIndexName,
  getBusinessRuntimeAllocationValueIndexName,
  getBusinessRuntimeDocumentLinkSourceIndexName,
  getBusinessRuntimeDocumentLinkTargetIndexName,
  getBusinessRuntimeExchangeRateLookupIndexName,
  getBusinessRuntimeInboxStatusIndexName,
  getBusinessRuntimeImportBatchStatusIndexName,
  getBusinessRuntimeMessageStatusIndexName,
  getBusinessRuntimePackSnapshotIndexName,
  getBusinessRuntimeProjectionLookupIndexName,
  getBusinessRuntimeReconciliationIndexName
} from "../../src/postgres";

describe("business-runtime postgres helpers", () => {
  it("creates shared business runtime tables and indexes", () => {
    const sql = buildBusinessRuntimeMigrationSql().join("\n");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS business_runtime.number_series");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS business_runtime.import_batches");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS business_runtime.document_links");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS business_runtime.business_outbox_messages");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS business_runtime.business_inbox_items");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS business_runtime.business_projections");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS business_runtime.pack_snapshots");
    expect(sql).toContain(getBusinessRuntimeAllocationValueIndexName());
    expect(sql).toContain(getBusinessRuntimeAllocationIdempotencyIndexName());
    expect(sql).toContain(getBusinessRuntimeExchangeRateLookupIndexName());
    expect(sql).toContain(getBusinessRuntimeImportBatchStatusIndexName());
    expect(sql).toContain(getBusinessRuntimeDocumentLinkSourceIndexName());
    expect(sql).toContain(getBusinessRuntimeDocumentLinkTargetIndexName());
    expect(sql).toContain(getBusinessRuntimeReconciliationIndexName());
    expect(sql).toContain(getBusinessRuntimeMessageStatusIndexName());
    expect(sql).toContain(getBusinessRuntimeInboxStatusIndexName());
    expect(sql).toContain(getBusinessRuntimeProjectionLookupIndexName());
    expect(sql).toContain(getBusinessRuntimePackSnapshotIndexName());
  });

  it("rolls the shared schema back safely", () => {
    const sql = buildBusinessRuntimeRollbackSql({ schemaName: "business_runtime_preview", dropSchema: true }).join("\n");
    expect(sql).toContain("DROP TABLE IF EXISTS business_runtime_preview.pack_snapshot_entries");
    expect(sql).toContain("DROP TABLE IF EXISTS business_runtime_preview.business_outbox_messages");
    expect(sql).toContain("DROP TABLE IF EXISTS business_runtime_preview.number_series");
    expect(sql).toContain("DROP SCHEMA IF EXISTS business_runtime_preview CASCADE");
  });
});
