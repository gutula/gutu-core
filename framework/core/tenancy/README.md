# @platform/tenancy

Schema-per-tenant multi-tenancy building blocks — host-agnostic, dialect-agnostic, testable.

## Three deployment modes

| `multisite` | `dbKind` | Use case |
|---|---|---|
| `false` | `sqlite` | Dev + single-site installs without Postgres |
| `false` | `postgres` | Single-tenant production |
| `true` | `postgres` | Schema-per-tenant isolation at scale |

`multisite=true` with `dbKind=sqlite` is not supported — SQLite has no schema concept.

## Package layout

```
src/
  config.ts       TenancyConfig shape + defaults
  context.ts      AsyncLocalStorage-based TenantContext carrier
  dbx/
    types.ts      Dbx interface + dialect translators
    sqlite.ts     SqliteDbx — wraps bun:sqlite synchronously, exposes async
    postgres.ts   PostgresDbx — uses Bun.SQL, translates placeholders/JSON
    index.ts      createDbx(opts) factory
  migrations.ts   migrateGlobal, migrateTenantSchema (dialect-aware DDL)
  provisioner.ts  create/update/archive/delete tenants + memberships + domains
  resolver.ts     resolveTenant() — session/domain/subdomain/header/path
  index.ts        re-exports
tests/
  tenancy.test.ts full coverage of slug, create, resolve, lifecycle
```

## Usage — wiring into a host

```ts
import {
  createDbx,
  migrateGlobal,
  migrateTenantSchema,
  ensureDefaultTenant,
  backfillDefaultMemberships,
  resolveTenant,
  runWithTenant,
  type TenancyConfig,
} from "@platform/tenancy";

// 1. Build config from your env / settings source.
const cfg: TenancyConfig = {
  multisite: process.env.MULTISITE === "1",
  dbKind: process.env.DB_KIND === "postgres" ? "postgres" : "sqlite",
  tenantResolution: "subdomain",
  defaultTenantSlug: "main",
  tenantHeader: "x-tenant",
  tenantPathPrefix: "/t",
  tenantSchemaPrefix: "tenant_",
  rootDomain: process.env.ROOT_DOMAIN,
  filesRoot: process.env.FILES_ROOT ?? "./files",
};

// 2. Construct the DB executor.
const db = createDbx({
  kind: cfg.dbKind,
  sqlitePath: process.env.DB_PATH,
  postgresUrl: process.env.DATABASE_URL,
});

// 3. Migrate global + default tenant schemas at boot.
await migrateGlobal(db);
const defaultTenant = await ensureDefaultTenant(db, cfg);
await migrateTenantSchema(db, defaultTenant.schemaName);
await backfillDefaultMemberships(db, cfg);

// 4. In your HTTP middleware, resolve the tenant per-request.
app.use(async (req, res, next) => {
  const sessionTenantId = await readSessionTenantId(req);
  const { tenant } = await resolveTenant(db, cfg, {
    host: req.headers.host ?? null,
    headers: lowercaseHeaders(req.headers),
    pathname: req.url,
    sessionTenantId,
  });
  const ctx = {
    tenantId: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    schema: tenant.schemaName,
  };
  await runWithTenant(ctx, () => next());
});
```

## Data model

Global schema (shared across tenants, always in `public` for Postgres):

- `tenants(id, slug, name, schema_name, status, plan, settings, created_at, updated_at)`
- `users(id, email, name, role, password_hash, mfa_*, email_verified_at, ...)`
- `tenant_memberships(tenant_id, user_id, role, joined_at)` — many-to-many
- `tenant_domains(domain, tenant_id, is_primary, created_at)` — explicit host→tenant mapping
- `sessions(token, user_id, tenant_id, created_at, expires_at, ua, ip)` — `tenant_id` is nullable; set when a user switches workspaces

Per-tenant schema (one per tenant in Postgres; all share the main DB in SQLite):

- `records(resource, id, data JSON, created_at, updated_at, created_by, updated_by)`
- `audit_events(id, actor, action, resource, record_id, level, ip, occurred_at, payload)`
- `files(id, resource, record_id, name, mime, size, storage, uploader, created_at)`

## Hardening

- Tenant id is **never** read from request body — resolver derives it.
- Schema names validated `[a-z_][a-z0-9_]*` before any DDL interpolation.
- `schemaForSlug()` produces safe Postgres identifiers from URL slugs.
- Hard-delete is transactional: memberships, domains, sessions, then the row; then DROP SCHEMA CASCADE; then the file directory. Partial failures leave consistent state for retry.
- `normalizeSlug()` rejects characters that could break SQL or routing.
- `resolveTenant` never returns null — it always falls through to the default tenant so requests don't crash on missing headers.

## Tests

```
bun test
```

Covers: slug validation, tenant creation, duplicate rejection, owner membership backfill, per-tenant file directory creation, all four resolution strategies (session, subdomain, header, path), fallback to default, archive, hard-delete with file + DB cleanup.

## Host-agnostic design

This package does NOT:
- Read `process.env` directly (caller builds the config)
- Depend on Hono, Express, Bun.serve, or any HTTP framework (caller wires middleware)
- Own a global DB handle (caller passes `Dbx` explicitly)
- Assume a particular auth scheme (caller resolves `sessionTenantId`)

This means the same package powers the admin-panel backend, gutu-core's platform kernel, and any downstream application that needs the same tenancy story.
