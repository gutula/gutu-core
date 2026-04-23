export type BusinessRuntimeSqliteOptions = {
  tablePrefix?: string;
};

export function buildBusinessRuntimeSqliteMigrationSql(options: BusinessRuntimeSqliteOptions = {}): string[] {
  const tablePrefix = normalizePrefix(options.tablePrefix ?? "business_runtime_");
  return [
    `CREATE TABLE IF NOT EXISTS ${tablePrefix}number_series (id TEXT PRIMARY KEY, doc_type TEXT NOT NULL, pattern TEXT NOT NULL, sequence_padding INTEGER NOT NULL, allocation_mode TEXT NOT NULL, next_sequence INTEGER NOT NULL, scope_company INTEGER NOT NULL DEFAULT 1, scope_branch INTEGER NOT NULL DEFAULT 1, scope_fiscal_year INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`,
    `CREATE TABLE IF NOT EXISTS ${tablePrefix}number_allocations (id TEXT PRIMARY KEY, series_id TEXT NOT NULL, doc_type TEXT NOT NULL, scope_key TEXT NOT NULL, sequence INTEGER NOT NULL, value TEXT NOT NULL, status TEXT NOT NULL, allocated_at TEXT NOT NULL, idempotency_key TEXT NULL, reason_code TEXT NULL, voided_at TEXT NULL);`,
    `CREATE TABLE IF NOT EXISTS ${tablePrefix}currencies (code TEXT PRIMARY KEY, precision INTEGER NOT NULL, symbol TEXT NULL, label TEXT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`,
    `CREATE TABLE IF NOT EXISTS ${tablePrefix}exchange_rates (id TEXT PRIMARY KEY, tenant_id TEXT NULL, from_currency TEXT NOT NULL, to_currency TEXT NOT NULL, rate REAL NOT NULL, effective_at TEXT NOT NULL, source TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`,
    `CREATE TABLE IF NOT EXISTS ${tablePrefix}tax_regimes (id TEXT PRIMARY KEY, country_code TEXT NOT NULL, currency_code TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`,
    `CREATE TABLE IF NOT EXISTS ${tablePrefix}tax_rules (id TEXT PRIMARY KEY, regime_id TEXT NOT NULL, category TEXT NOT NULL, rate REAL NOT NULL, priority INTEGER NOT NULL DEFAULT 0, conditions TEXT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`,
    `CREATE TABLE IF NOT EXISTS ${tablePrefix}import_batches (id TEXT PRIMARY KEY, entity TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);`,
    `CREATE TABLE IF NOT EXISTS ${tablePrefix}import_rows (id TEXT PRIMARY KEY, batch_id TEXT NOT NULL, natural_key TEXT NULL, payload TEXT NOT NULL, status TEXT NOT NULL, errors TEXT NOT NULL, receipt TEXT NULL, compensation TEXT NULL);`,
    `CREATE TABLE IF NOT EXISTS ${tablePrefix}document_links (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, source_document_id TEXT NOT NULL, target_document_id TEXT NOT NULL, relation TEXT NOT NULL, created_at TEXT NOT NULL, correlation_id TEXT NULL, process_id TEXT NULL, metadata TEXT NULL);`,
    `CREATE TABLE IF NOT EXISTS ${tablePrefix}reconciliation_items (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, plugin_id TEXT NOT NULL, document_id TEXT NOT NULL, severity TEXT NOT NULL, status TEXT NOT NULL, reason_code TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, correlation_id TEXT NULL, process_id TEXT NULL, owner_id TEXT NULL);`,
    `CREATE TABLE IF NOT EXISTS ${tablePrefix}business_outbox_messages (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, plugin_id TEXT NOT NULL, document_id TEXT NOT NULL, type TEXT NOT NULL, payload TEXT NOT NULL, correlation_id TEXT NULL, process_id TEXT NULL, status TEXT NOT NULL, consumer_count INTEGER NOT NULL DEFAULT 0, delivered_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);`,
    `CREATE TABLE IF NOT EXISTS ${tablePrefix}business_inbox_items (id TEXT PRIMARY KEY, message_id TEXT NOT NULL, tenant_id TEXT NOT NULL, plugin_id TEXT NOT NULL, document_id TEXT NOT NULL, target TEXT NOT NULL, status TEXT NOT NULL, attempt_count INTEGER NOT NULL DEFAULT 0, last_error TEXT NULL, updated_at TEXT NOT NULL);`,
    `CREATE TABLE IF NOT EXISTS ${tablePrefix}business_dead_letters (id TEXT PRIMARY KEY, message_id TEXT NOT NULL, inbox_id TEXT NOT NULL, tenant_id TEXT NOT NULL, plugin_id TEXT NOT NULL, document_id TEXT NOT NULL, target TEXT NOT NULL, reason TEXT NOT NULL, attempt_count INTEGER NOT NULL DEFAULT 0, failed_at TEXT NOT NULL);`,
    `CREATE TABLE IF NOT EXISTS ${tablePrefix}business_projections (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, plugin_id TEXT NOT NULL, document_id TEXT NOT NULL, projection_key TEXT NOT NULL, status TEXT NOT NULL, related_message_ids TEXT NOT NULL, summary TEXT NOT NULL, updated_at TEXT NOT NULL);`,
    `CREATE TABLE IF NOT EXISTS ${tablePrefix}pack_snapshots (snapshot_id TEXT PRIMARY KEY, pack_name TEXT NOT NULL, pack_version TEXT NOT NULL, strategy TEXT NOT NULL, reversible INTEGER NOT NULL, created_at TEXT NOT NULL, preview_summary TEXT NULL);`,
    `CREATE TABLE IF NOT EXISTS ${tablePrefix}pack_snapshot_entries (id TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL, object_key TEXT NOT NULL, before_payload TEXT NULL, before_metadata TEXT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ${getBusinessRuntimeSqliteAllocationValueIndexName(tablePrefix)} ON ${tablePrefix}number_allocations (series_id, value);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ${getBusinessRuntimeSqliteAllocationIdempotencyIndexName(tablePrefix)} ON ${tablePrefix}number_allocations (series_id, scope_key, idempotency_key);`,
    `CREATE INDEX IF NOT EXISTS ${getBusinessRuntimeSqliteExchangeRateLookupIndexName(tablePrefix)} ON ${tablePrefix}exchange_rates (from_currency, to_currency, effective_at);`,
    `CREATE INDEX IF NOT EXISTS ${getBusinessRuntimeSqliteImportBatchStatusIndexName(tablePrefix)} ON ${tablePrefix}import_rows (batch_id, status);`,
    `CREATE INDEX IF NOT EXISTS ${getBusinessRuntimeSqliteDocumentLinkSourceIndexName(tablePrefix)} ON ${tablePrefix}document_links (tenant_id, source_document_id);`,
    `CREATE INDEX IF NOT EXISTS ${getBusinessRuntimeSqliteDocumentLinkTargetIndexName(tablePrefix)} ON ${tablePrefix}document_links (tenant_id, target_document_id);`,
    `CREATE INDEX IF NOT EXISTS ${getBusinessRuntimeSqliteReconciliationIndexName(tablePrefix)} ON ${tablePrefix}reconciliation_items (tenant_id, plugin_id, status, severity);`,
    `CREATE INDEX IF NOT EXISTS ${getBusinessRuntimeSqliteMessageStatusIndexName(tablePrefix)} ON ${tablePrefix}business_outbox_messages (tenant_id, plugin_id, status, type);`,
    `CREATE INDEX IF NOT EXISTS ${getBusinessRuntimeSqliteInboxStatusIndexName(tablePrefix)} ON ${tablePrefix}business_inbox_items (tenant_id, plugin_id, status, target);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ${getBusinessRuntimeSqliteProjectionLookupIndexName(tablePrefix)} ON ${tablePrefix}business_projections (tenant_id, plugin_id, projection_key);`,
    `CREATE INDEX IF NOT EXISTS ${getBusinessRuntimeSqlitePackSnapshotIndexName(tablePrefix)} ON ${tablePrefix}pack_snapshot_entries (snapshot_id, object_key);`
  ];
}

export function buildBusinessRuntimeSqliteRollbackSql(options: BusinessRuntimeSqliteOptions = {}): string[] {
  const tablePrefix = normalizePrefix(options.tablePrefix ?? "business_runtime_");
  return [
    `DROP TABLE IF EXISTS ${tablePrefix}pack_snapshot_entries;`,
    `DROP TABLE IF EXISTS ${tablePrefix}pack_snapshots;`,
    `DROP TABLE IF EXISTS ${tablePrefix}business_projections;`,
    `DROP TABLE IF EXISTS ${tablePrefix}business_dead_letters;`,
    `DROP TABLE IF EXISTS ${tablePrefix}business_inbox_items;`,
    `DROP TABLE IF EXISTS ${tablePrefix}business_outbox_messages;`,
    `DROP TABLE IF EXISTS ${tablePrefix}reconciliation_items;`,
    `DROP TABLE IF EXISTS ${tablePrefix}document_links;`,
    `DROP TABLE IF EXISTS ${tablePrefix}import_rows;`,
    `DROP TABLE IF EXISTS ${tablePrefix}import_batches;`,
    `DROP TABLE IF EXISTS ${tablePrefix}tax_rules;`,
    `DROP TABLE IF EXISTS ${tablePrefix}tax_regimes;`,
    `DROP TABLE IF EXISTS ${tablePrefix}exchange_rates;`,
    `DROP TABLE IF EXISTS ${tablePrefix}currencies;`,
    `DROP TABLE IF EXISTS ${tablePrefix}number_allocations;`,
    `DROP TABLE IF EXISTS ${tablePrefix}number_series;`
  ];
}

export function getBusinessRuntimeSqliteAllocationValueIndexName(tablePrefix = "business_runtime_"): string {
  return `${normalizePrefix(tablePrefix)}number_value_idx`;
}

export function getBusinessRuntimeSqliteAllocationIdempotencyIndexName(tablePrefix = "business_runtime_"): string {
  return `${normalizePrefix(tablePrefix)}number_idempotency_idx`;
}

export function getBusinessRuntimeSqliteExchangeRateLookupIndexName(tablePrefix = "business_runtime_"): string {
  return `${normalizePrefix(tablePrefix)}exchange_rate_lookup_idx`;
}

export function getBusinessRuntimeSqliteImportBatchStatusIndexName(tablePrefix = "business_runtime_"): string {
  return `${normalizePrefix(tablePrefix)}import_batch_status_idx`;
}

export function getBusinessRuntimeSqliteDocumentLinkSourceIndexName(tablePrefix = "business_runtime_"): string {
  return `${normalizePrefix(tablePrefix)}document_link_source_idx`;
}

export function getBusinessRuntimeSqliteDocumentLinkTargetIndexName(tablePrefix = "business_runtime_"): string {
  return `${normalizePrefix(tablePrefix)}document_link_target_idx`;
}

export function getBusinessRuntimeSqliteReconciliationIndexName(tablePrefix = "business_runtime_"): string {
  return `${normalizePrefix(tablePrefix)}reconciliation_idx`;
}

export function getBusinessRuntimeSqliteMessageStatusIndexName(tablePrefix = "business_runtime_"): string {
  return `${normalizePrefix(tablePrefix)}message_status_idx`;
}

export function getBusinessRuntimeSqliteInboxStatusIndexName(tablePrefix = "business_runtime_"): string {
  return `${normalizePrefix(tablePrefix)}inbox_status_idx`;
}

export function getBusinessRuntimeSqliteProjectionLookupIndexName(tablePrefix = "business_runtime_"): string {
  return `${normalizePrefix(tablePrefix)}projection_lookup_idx`;
}

export function getBusinessRuntimeSqlitePackSnapshotIndexName(tablePrefix = "business_runtime_"): string {
  return `${normalizePrefix(tablePrefix)}pack_snapshot_idx`;
}

function normalizePrefix(value: string): string {
  if (!/^[a-z][a-z0-9_]*$/i.test(value)) {
    throw new Error("tablePrefix must use simple alphanumeric or underscore SQL identifiers");
  }
  return value.toLowerCase();
}
