import { AsyncLocalStorage } from "node:async_hooks";

/** Context carried through the request lifecycle via AsyncLocalStorage.
 *  Every database-facing helper reads this context to scope queries to the
 *  active tenant (or the "main" tenant in single-site mode). */
export interface TenantContext {
  /** Stable uuid of the tenant. */
  tenantId: string;
  /** URL-safe slug. */
  slug: string;
  /** Display name. */
  name: string;
  /** Postgres schema that owns this tenant's data. Always "public" in
   *  single-site mode; "tenant_<slug>" in multi-site mode. */
  schema: string;
}

const store = new AsyncLocalStorage<TenantContext>();

export function runWithTenant<T>(ctx: TenantContext, fn: () => T | Promise<T>): Promise<T> {
  return Promise.resolve(store.run(ctx, fn));
}

export function getTenantContext(): TenantContext | undefined {
  return store.getStore();
}

export function requireTenantContext(): TenantContext {
  const ctx = store.getStore();
  if (!ctx) {
    throw new Error(
      "No tenant context. Call requireTenantContext() only inside a request that passed through tenantMiddleware.",
    );
  }
  return ctx;
}

/** Return the schema prefix to embed in `FROM <schema>.table` queries.
 *  In SQLite this is always an empty string (no schema concept). */
export function currentSchemaPrefix(kind: "sqlite" | "postgres"): string {
  if (kind === "sqlite") return "";
  const ctx = store.getStore();
  const schema = ctx?.schema ?? "public";
  // Defensive — schema names come from our own code / validated slug, not users.
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) {
    throw new Error(`Invalid schema name: ${schema}`);
  }
  return `${schema}.`;
}

/** Return the global/shared schema prefix. In multi-site mode this is
 *  "public." (where tenants/users/sessions live). In single-site mode it's
 *  always empty. */
export function globalSchemaPrefix(kind: "sqlite" | "postgres"): string {
  if (kind === "sqlite") return "";
  return "public.";
}
