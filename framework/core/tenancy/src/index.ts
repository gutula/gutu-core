/** @platform/tenancy — schema-per-tenant multi-tenancy building blocks.
 *
 *  Three supported deployment modes (pick via the Config you pass to the
 *  provisioner + resolver):
 *    singlesite + sqlite    — zero-config dev
 *    singlesite + postgres  — single-tenant production
 *    multisite  + postgres  — schema-per-tenant isolation
 *
 *  This package is host-agnostic: it does NOT depend on Hono, Express, Bun,
 *  or any one HTTP stack. Glue it into your server with a few lines that
 *  read the session token + request host and call `resolveTenant(...)`,
 *  then run the remainder of the request inside `runWithTenant(ctx, fn)`.
 *
 *  The generic DB executor (`Dbx`) lives under ./dbx and is the same
 *  interface used by the admin-panel backend. Drop in either `SqliteDbx`
 *  or `PostgresDbx` and the migrations + provisioner work for both.
 */

export * from "./context";
export * from "./resolver";
export * from "./provisioner";
export * from "./migrations";
export * from "./config";
export * from "./dbx";

export const packageId = "tenancy" as const;
export const packageVersion = "0.0.1" as const;
export const packageDescription =
  "Schema-per-tenant multi-tenancy building blocks: config, dbx abstraction, resolver, provisioner, migrations. Host-agnostic." as const;
