export type BusinessRuntimeSqlOptions = {
  schemaName?: string;
  dropSchema?: boolean;
};

export function buildBusinessRuntimeMigrationSql(options: BusinessRuntimeSqlOptions = {}): string[] {
  const schemaName = normalizeIdentifier(options.schemaName ?? "business_runtime", "schemaName");
  return [
    `CREATE SCHEMA IF NOT EXISTS ${schemaName};`,
    `CREATE TABLE IF NOT EXISTS ${schemaName}.number_series (id text PRIMARY KEY, doc_type text NOT NULL, pattern text NOT NULL, sequence_padding integer NOT NULL, allocation_mode text NOT NULL, next_sequence integer NOT NULL, scope_company boolean NOT NULL DEFAULT true, scope_branch boolean NOT NULL DEFAULT true, scope_fiscal_year boolean NOT NULL DEFAULT true, updated_at timestamptz NOT NULL DEFAULT now());`,
    `CREATE TABLE IF NOT EXISTS ${schemaName}.number_allocations (id text PRIMARY KEY, series_id text NOT NULL, doc_type text NOT NULL, scope_key text NOT NULL, sequence integer NOT NULL, value text NOT NULL, status text NOT NULL, allocated_at timestamptz NOT NULL, idempotency_key text NULL, reason_code text NULL, voided_at timestamptz NULL);`,
    `CREATE TABLE IF NOT EXISTS ${schemaName}.currencies (code text PRIMARY KEY, precision integer NOT NULL, symbol text NULL, label text NULL, updated_at timestamptz NOT NULL DEFAULT now());`,
    `CREATE TABLE IF NOT EXISTS ${schemaName}.exchange_rates (id text PRIMARY KEY, tenant_id text NULL, from_currency text NOT NULL, to_currency text NOT NULL, rate numeric(20,10) NOT NULL, effective_at timestamptz NOT NULL, source text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());`,
    `CREATE TABLE IF NOT EXISTS ${schemaName}.tax_regimes (id text PRIMARY KEY, country_code text NOT NULL, currency_code text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());`,
    `CREATE TABLE IF NOT EXISTS ${schemaName}.tax_rules (id text PRIMARY KEY, regime_id text NOT NULL, category text NOT NULL, rate numeric(20,10) NOT NULL, priority integer NOT NULL DEFAULT 0, conditions jsonb NULL, updated_at timestamptz NOT NULL DEFAULT now());`,
    `CREATE TABLE IF NOT EXISTS ${schemaName}.import_batches (id text PRIMARY KEY, entity text NOT NULL, status text NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL);`,
    `CREATE TABLE IF NOT EXISTS ${schemaName}.import_rows (id text PRIMARY KEY, batch_id text NOT NULL, natural_key text NULL, payload jsonb NOT NULL, status text NOT NULL, errors jsonb NOT NULL, receipt jsonb NULL, compensation jsonb NULL);`,
    `CREATE TABLE IF NOT EXISTS ${schemaName}.document_links (id text PRIMARY KEY, tenant_id text NOT NULL, source_document_id text NOT NULL, target_document_id text NOT NULL, relation text NOT NULL, created_at timestamptz NOT NULL, correlation_id text NULL, process_id text NULL, metadata jsonb NULL);`,
    `CREATE TABLE IF NOT EXISTS ${schemaName}.reconciliation_items (id text PRIMARY KEY, tenant_id text NOT NULL, plugin_id text NOT NULL, document_id text NOT NULL, severity text NOT NULL, status text NOT NULL, reason_code text NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, correlation_id text NULL, process_id text NULL, owner_id text NULL);`,
    `CREATE TABLE IF NOT EXISTS ${schemaName}.business_outbox_messages (id text PRIMARY KEY, tenant_id text NOT NULL, plugin_id text NOT NULL, document_id text NOT NULL, type text NOT NULL, payload jsonb NOT NULL, correlation_id text NULL, process_id text NULL, status text NOT NULL, consumer_count integer NOT NULL DEFAULT 0, delivered_count integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL);`,
    `CREATE TABLE IF NOT EXISTS ${schemaName}.business_inbox_items (id text PRIMARY KEY, message_id text NOT NULL, tenant_id text NOT NULL, plugin_id text NOT NULL, document_id text NOT NULL, target text NOT NULL, status text NOT NULL, attempt_count integer NOT NULL DEFAULT 0, last_error text NULL, updated_at timestamptz NOT NULL);`,
    `CREATE TABLE IF NOT EXISTS ${schemaName}.business_dead_letters (id text PRIMARY KEY, message_id text NOT NULL, inbox_id text NOT NULL, tenant_id text NOT NULL, plugin_id text NOT NULL, document_id text NOT NULL, target text NOT NULL, reason text NOT NULL, attempt_count integer NOT NULL DEFAULT 0, failed_at timestamptz NOT NULL);`,
    `CREATE TABLE IF NOT EXISTS ${schemaName}.business_projections (id text PRIMARY KEY, tenant_id text NOT NULL, plugin_id text NOT NULL, document_id text NOT NULL, projection_key text NOT NULL, status text NOT NULL, related_message_ids jsonb NOT NULL, summary jsonb NOT NULL, updated_at timestamptz NOT NULL);`,
    `CREATE TABLE IF NOT EXISTS ${schemaName}.pack_snapshots (snapshot_id text PRIMARY KEY, pack_name text NOT NULL, pack_version text NOT NULL, strategy text NOT NULL, reversible boolean NOT NULL, created_at timestamptz NOT NULL, preview_summary jsonb NULL);`,
    `CREATE TABLE IF NOT EXISTS ${schemaName}.pack_snapshot_entries (id text PRIMARY KEY, snapshot_id text NOT NULL, object_key text NOT NULL, before_payload jsonb NULL, before_metadata jsonb NULL, created_at timestamptz NOT NULL DEFAULT now());`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ${getBusinessRuntimeAllocationValueIndexName()} ON ${schemaName}.number_allocations (series_id, value);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ${getBusinessRuntimeAllocationIdempotencyIndexName()} ON ${schemaName}.number_allocations (series_id, scope_key, idempotency_key);`,
    `CREATE INDEX IF NOT EXISTS ${getBusinessRuntimeExchangeRateLookupIndexName()} ON ${schemaName}.exchange_rates (from_currency, to_currency, effective_at);`,
    `CREATE INDEX IF NOT EXISTS ${getBusinessRuntimeImportBatchStatusIndexName()} ON ${schemaName}.import_rows (batch_id, status);`,
    `CREATE INDEX IF NOT EXISTS ${getBusinessRuntimeDocumentLinkSourceIndexName()} ON ${schemaName}.document_links (tenant_id, source_document_id);`,
    `CREATE INDEX IF NOT EXISTS ${getBusinessRuntimeDocumentLinkTargetIndexName()} ON ${schemaName}.document_links (tenant_id, target_document_id);`,
    `CREATE INDEX IF NOT EXISTS ${getBusinessRuntimeReconciliationIndexName()} ON ${schemaName}.reconciliation_items (tenant_id, plugin_id, status, severity);`,
    `CREATE INDEX IF NOT EXISTS ${getBusinessRuntimeMessageStatusIndexName()} ON ${schemaName}.business_outbox_messages (tenant_id, plugin_id, status, type);`,
    `CREATE INDEX IF NOT EXISTS ${getBusinessRuntimeInboxStatusIndexName()} ON ${schemaName}.business_inbox_items (tenant_id, plugin_id, status, target);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ${getBusinessRuntimeProjectionLookupIndexName()} ON ${schemaName}.business_projections (tenant_id, plugin_id, projection_key);`,
    `CREATE INDEX IF NOT EXISTS ${getBusinessRuntimePackSnapshotIndexName()} ON ${schemaName}.pack_snapshot_entries (snapshot_id, object_key);`
  ];
}

export function buildBusinessRuntimeRollbackSql(options: BusinessRuntimeSqlOptions = {}): string[] {
  const schemaName = normalizeIdentifier(options.schemaName ?? "business_runtime", "schemaName");
  const dropSchema = options.dropSchema ?? schemaName !== "business_runtime";
  return [
    `DROP TABLE IF EXISTS ${schemaName}.pack_snapshot_entries CASCADE;`,
    `DROP TABLE IF EXISTS ${schemaName}.pack_snapshots CASCADE;`,
    `DROP TABLE IF EXISTS ${schemaName}.business_projections CASCADE;`,
    `DROP TABLE IF EXISTS ${schemaName}.business_dead_letters CASCADE;`,
    `DROP TABLE IF EXISTS ${schemaName}.business_inbox_items CASCADE;`,
    `DROP TABLE IF EXISTS ${schemaName}.business_outbox_messages CASCADE;`,
    `DROP TABLE IF EXISTS ${schemaName}.reconciliation_items CASCADE;`,
    `DROP TABLE IF EXISTS ${schemaName}.document_links CASCADE;`,
    `DROP TABLE IF EXISTS ${schemaName}.import_rows CASCADE;`,
    `DROP TABLE IF EXISTS ${schemaName}.import_batches CASCADE;`,
    `DROP TABLE IF EXISTS ${schemaName}.tax_rules CASCADE;`,
    `DROP TABLE IF EXISTS ${schemaName}.tax_regimes CASCADE;`,
    `DROP TABLE IF EXISTS ${schemaName}.exchange_rates CASCADE;`,
    `DROP TABLE IF EXISTS ${schemaName}.currencies CASCADE;`,
    `DROP TABLE IF EXISTS ${schemaName}.number_allocations CASCADE;`,
    `DROP TABLE IF EXISTS ${schemaName}.number_series CASCADE;`,
    ...(dropSchema ? [`DROP SCHEMA IF EXISTS ${schemaName} CASCADE;`] : [])
  ];
}

export function getBusinessRuntimeAllocationValueIndexName(): string {
  return "business_runtime_number_value_idx";
}

export function getBusinessRuntimeAllocationIdempotencyIndexName(): string {
  return "business_runtime_number_idempotency_idx";
}

export function getBusinessRuntimeExchangeRateLookupIndexName(): string {
  return "business_runtime_exchange_rate_lookup_idx";
}

export function getBusinessRuntimeImportBatchStatusIndexName(): string {
  return "business_runtime_import_batch_status_idx";
}

export function getBusinessRuntimeDocumentLinkSourceIndexName(): string {
  return "business_runtime_document_link_source_idx";
}

export function getBusinessRuntimeDocumentLinkTargetIndexName(): string {
  return "business_runtime_document_link_target_idx";
}

export function getBusinessRuntimeReconciliationIndexName(): string {
  return "business_runtime_reconciliation_idx";
}

export function getBusinessRuntimeMessageStatusIndexName(): string {
  return "business_runtime_message_status_idx";
}

export function getBusinessRuntimeInboxStatusIndexName(): string {
  return "business_runtime_inbox_status_idx";
}

export function getBusinessRuntimeProjectionLookupIndexName(): string {
  return "business_runtime_projection_lookup_idx";
}

export function getBusinessRuntimePackSnapshotIndexName(): string {
  return "business_runtime_pack_snapshot_idx";
}

function normalizeIdentifier(value: string, label: string): string {
  if (!/^[a-z][a-z0-9_]*$/i.test(value)) {
    throw new Error(`${label} must use simple alphanumeric or underscore SQL identifiers`);
  }
  return value.toLowerCase();
}
