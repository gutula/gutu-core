import type { Dbx } from "./dbx/types";

/** Dialect-aware type helpers. SQLite takes TEXT/INTEGER and tolerates most
 *  things. Postgres gets proper types. The schema is structurally the same
 *  across both.
 *
 *  Host-agnostic: takes a Dbx explicitly rather than resolving one from a
 *  global factory, so callers can share or isolate connections as they see
 *  fit.
 */

function typeFor(kind: Dbx["kind"], t: "text" | "int" | "bool" | "ts" | "json" | "uuid"): string {
  if (kind === "sqlite") {
    switch (t) {
      case "text": return "TEXT";
      case "int": return "INTEGER";
      case "bool": return "INTEGER";
      case "ts": return "TEXT";
      case "json": return "TEXT";
      case "uuid": return "TEXT";
    }
  }
  switch (t) {
    case "text": return "text";
    case "int": return "integer";
    case "bool": return "boolean";
    case "ts": return "timestamptz";
    case "json": return "jsonb";
    case "uuid": return "uuid";
  }
}

function ifNotExists(_kind: Dbx["kind"]): string {
  return "IF NOT EXISTS";
}

/* ------------------------------------------------------------------ */
/* Global schema                                                       */
/* ------------------------------------------------------------------ */

/** Migrate the GLOBAL schema (shared across tenants).
 *  In SQLite this is just the main database.
 *  In Postgres this is the `public` schema. */
export async function migrateGlobal(db: Dbx): Promise<void> {
  const T = (t: Parameters<typeof typeFor>[1]) => typeFor(db.kind, t);
  const schema = db.kind === "postgres" ? "public." : "";

  await db.exec(`
    CREATE TABLE ${ifNotExists(db.kind)} ${schema}meta (
      key   ${T("text")} PRIMARY KEY,
      value ${T("text")} NOT NULL
    );

    CREATE TABLE ${ifNotExists(db.kind)} ${schema}tenants (
      id          ${T("text")} PRIMARY KEY,
      slug        ${T("text")} NOT NULL UNIQUE,
      name        ${T("text")} NOT NULL,
      schema_name ${T("text")} NOT NULL,
      status      ${T("text")} NOT NULL DEFAULT 'active',
      plan        ${T("text")} NOT NULL DEFAULT 'free',
      settings    ${T("json")},
      created_at  ${T("ts")} NOT NULL,
      updated_at  ${T("ts")} NOT NULL
    );
    CREATE INDEX ${ifNotExists(db.kind)} tenants_slug_idx ON ${schema}tenants(slug);

    CREATE TABLE ${ifNotExists(db.kind)} ${schema}users (
      id            ${T("text")} PRIMARY KEY,
      email         ${T("text")} NOT NULL UNIQUE,
      name          ${T("text")} NOT NULL,
      role          ${T("text")} NOT NULL DEFAULT 'member',
      password_hash ${T("text")} NOT NULL,
      email_verified_at ${T("ts")},
      mfa_secret    ${T("text")},
      mfa_enabled   ${T("int")} NOT NULL DEFAULT 0,
      created_at    ${T("ts")} NOT NULL,
      updated_at    ${T("ts")} NOT NULL
    );
    CREATE INDEX ${ifNotExists(db.kind)} users_email_idx ON ${schema}users(${db.kind === "postgres" ? "lower(email)" : "LOWER(email)"});

    CREATE TABLE ${ifNotExists(db.kind)} ${schema}tenant_memberships (
      tenant_id ${T("text")} NOT NULL,
      user_id   ${T("text")} NOT NULL,
      role      ${T("text")} NOT NULL DEFAULT 'member',
      joined_at ${T("ts")} NOT NULL,
      PRIMARY KEY (tenant_id, user_id)
    );
    CREATE INDEX ${ifNotExists(db.kind)} memberships_user_idx ON ${schema}tenant_memberships(user_id);

    CREATE TABLE ${ifNotExists(db.kind)} ${schema}tenant_domains (
      domain     ${T("text")} PRIMARY KEY,
      tenant_id  ${T("text")} NOT NULL,
      is_primary ${T("int")} NOT NULL DEFAULT 0,
      created_at ${T("ts")} NOT NULL
    );
    CREATE INDEX ${ifNotExists(db.kind)} tenant_domains_tenant_idx ON ${schema}tenant_domains(tenant_id);

    CREATE TABLE ${ifNotExists(db.kind)} ${schema}sessions (
      token      ${T("text")} PRIMARY KEY,
      user_id    ${T("text")} NOT NULL,
      tenant_id  ${T("text")},
      created_at ${T("ts")} NOT NULL,
      expires_at ${T("ts")} NOT NULL,
      ua         ${T("text")},
      ip         ${T("text")}
    );
    CREATE INDEX ${ifNotExists(db.kind)} sessions_user_idx ON ${schema}sessions(user_id);
  `);

  // SQLite idempotent ALTERs for installs that predate multi-tenancy.
  if (db.kind === "sqlite") {
    const cols = await db.all<{ name: string }>(`PRAGMA table_info(users)`);
    const have = new Set(cols.map((c) => c.name));
    if (!have.has("email_verified_at"))
      await db.exec(`ALTER TABLE users ADD COLUMN email_verified_at TEXT`);
    if (!have.has("mfa_secret"))
      await db.exec(`ALTER TABLE users ADD COLUMN mfa_secret TEXT`);
    if (!have.has("mfa_enabled"))
      await db.exec(`ALTER TABLE users ADD COLUMN mfa_enabled INTEGER NOT NULL DEFAULT 0`);
    const sessionCols = await db.all<{ name: string }>(`PRAGMA table_info(sessions)`);
    const haveSess = new Set(sessionCols.map((c) => c.name));
    if (!haveSess.has("tenant_id"))
      await db.exec(`ALTER TABLE sessions ADD COLUMN tenant_id TEXT`);
  }

  // Index sessions.tenant_id AFTER the ALTER guarantees the column exists.
  await db.exec(
    `CREATE INDEX ${ifNotExists(db.kind)} sessions_tenant_idx ON ${schema}sessions(tenant_id)`,
  );
}

/* ------------------------------------------------------------------ */
/* Per-tenant schema                                                   */
/* ------------------------------------------------------------------ */

export async function migrateTenantSchema(db: Dbx, schemaName: string): Promise<void> {
  const T = (t: Parameters<typeof typeFor>[1]) => typeFor(db.kind, t);

  const prefix = db.kind === "postgres" ? `${schemaName}.` : "";

  if (db.kind === "postgres") {
    await db.exec(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
  }

  await db.exec(`
    CREATE TABLE ${ifNotExists(db.kind)} ${prefix}records (
      resource   ${T("text")} NOT NULL,
      id         ${T("text")} NOT NULL,
      data       ${T("json")} NOT NULL,
      created_at ${T("ts")} NOT NULL,
      updated_at ${T("ts")} NOT NULL,
      created_by ${T("text")},
      updated_by ${T("text")},
      PRIMARY KEY (resource, id)
    );
    CREATE INDEX ${ifNotExists(db.kind)} records_resource_idx ON ${prefix}records(resource);
    CREATE INDEX ${ifNotExists(db.kind)} records_updated_idx ON ${prefix}records(resource, updated_at DESC);

    CREATE TABLE ${ifNotExists(db.kind)} ${prefix}audit_events (
      id          ${T("text")} PRIMARY KEY,
      actor       ${T("text")} NOT NULL,
      action      ${T("text")} NOT NULL,
      resource    ${T("text")} NOT NULL,
      record_id   ${T("text")},
      level       ${T("text")} NOT NULL DEFAULT 'info',
      ip          ${T("text")},
      occurred_at ${T("ts")} NOT NULL,
      payload     ${T("json")}
    );
    CREATE INDEX ${ifNotExists(db.kind)} audit_occurred_idx ON ${prefix}audit_events(occurred_at DESC);

    CREATE TABLE ${ifNotExists(db.kind)} ${prefix}files (
      id         ${T("text")} PRIMARY KEY,
      resource   ${T("text")},
      record_id  ${T("text")},
      name       ${T("text")} NOT NULL,
      mime       ${T("text")} NOT NULL,
      size       ${T("int")} NOT NULL,
      storage    ${T("text")} NOT NULL,
      uploader   ${T("text")},
      created_at ${T("ts")} NOT NULL
    );
    CREATE INDEX ${ifNotExists(db.kind)} files_record_idx ON ${prefix}files(resource, record_id);
  `);
}
