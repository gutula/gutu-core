import { describe, expect, it } from "bun:test";

import {
  buildBusinessRuntimeSqliteMigrationSql,
  buildBusinessRuntimeSqliteRollbackSql,
  getBusinessRuntimeSqliteAllocationIdempotencyIndexName,
  getBusinessRuntimeSqliteAllocationValueIndexName,
  getBusinessRuntimeSqliteDocumentLinkSourceIndexName,
  getBusinessRuntimeSqliteDocumentLinkTargetIndexName,
  getBusinessRuntimeSqliteExchangeRateLookupIndexName,
  getBusinessRuntimeSqliteInboxStatusIndexName,
  getBusinessRuntimeSqliteImportBatchStatusIndexName,
  getBusinessRuntimeSqliteMessageStatusIndexName,
  getBusinessRuntimeSqlitePackSnapshotIndexName,
  getBusinessRuntimeSqliteProjectionLookupIndexName,
  getBusinessRuntimeSqliteReconciliationIndexName
} from "../../src/sqlite";

describe("business-runtime sqlite helpers", () => {
  it("creates shared business runtime tables and indexes", () => {
    const sql = buildBusinessRuntimeSqliteMigrationSql().join("\n");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS business_runtime_number_series");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS business_runtime_import_batches");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS business_runtime_document_links");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS business_runtime_business_outbox_messages");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS business_runtime_business_inbox_items");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS business_runtime_business_projections");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS business_runtime_pack_snapshots");
    expect(sql).toContain(getBusinessRuntimeSqliteAllocationValueIndexName());
    expect(sql).toContain(getBusinessRuntimeSqliteAllocationIdempotencyIndexName());
    expect(sql).toContain(getBusinessRuntimeSqliteExchangeRateLookupIndexName());
    expect(sql).toContain(getBusinessRuntimeSqliteImportBatchStatusIndexName());
    expect(sql).toContain(getBusinessRuntimeSqliteDocumentLinkSourceIndexName());
    expect(sql).toContain(getBusinessRuntimeSqliteDocumentLinkTargetIndexName());
    expect(sql).toContain(getBusinessRuntimeSqliteReconciliationIndexName());
    expect(sql).toContain(getBusinessRuntimeSqliteMessageStatusIndexName());
    expect(sql).toContain(getBusinessRuntimeSqliteInboxStatusIndexName());
    expect(sql).toContain(getBusinessRuntimeSqliteProjectionLookupIndexName());
    expect(sql).toContain(getBusinessRuntimeSqlitePackSnapshotIndexName());
  });

  it("rolls the shared sqlite tables back safely", () => {
    const sql = buildBusinessRuntimeSqliteRollbackSql({ tablePrefix: "business_runtime_preview_" }).join("\n");
    expect(sql).toContain("DROP TABLE IF EXISTS business_runtime_preview_pack_snapshot_entries");
    expect(sql).toContain("DROP TABLE IF EXISTS business_runtime_preview_business_outbox_messages");
    expect(sql).toContain("DROP TABLE IF EXISTS business_runtime_preview_number_series");
  });
});
