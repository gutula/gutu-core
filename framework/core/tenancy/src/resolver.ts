import type { Dbx } from "./dbx/types";
import type { TenancyConfig } from "./config";
import {
  ensureDefaultTenant,
  getTenant,
  getTenantByDomain,
  getTenantBySlug,
  type Tenant,
} from "./provisioner";

/** Resolve the active tenant from a request.
 *
 *  Priority order:
 *    1. Session's bound `tenant_id` (set when a user switched tenants)
 *    2. Explicit header / subdomain / path — according to config
 *    3. Default tenant (singleton in single-site mode)
 */
export interface ResolveInput {
  host: string | null;
  headers: Record<string, string>;
  pathname: string;
  sessionTenantId: string | null;
}

export type ResolveSource =
  | "session"
  | "domain"
  | "subdomain"
  | "header"
  | "path"
  | "default";

export interface ResolveResult {
  tenant: Tenant;
  source: ResolveSource;
}

export async function resolveTenant(
  db: Dbx,
  cfg: TenancyConfig,
  input: ResolveInput,
): Promise<ResolveResult> {
  // 1. Session-bound tenant wins — this is how users switch workspaces.
  if (input.sessionTenantId) {
    const byId = await getTenant(db, input.sessionTenantId);
    if (byId) return { tenant: byId, source: "session" };
  }

  if (!cfg.multisite) {
    const t = await ensureDefaultTenant(db, cfg);
    return { tenant: t, source: "default" };
  }

  const host = (input.host ?? "").toLowerCase();

  // Domain table first — an exact host match always wins if the admin has
  // attached a domain to a tenant.
  if (host) {
    const byDomain = await getTenantByDomain(db, host);
    if (byDomain) return { tenant: byDomain, source: "domain" };
  }

  if (cfg.tenantResolution === "subdomain" && cfg.rootDomain && host.endsWith(cfg.rootDomain)) {
    const sub = host.slice(0, -cfg.rootDomain.length).replace(/\.$/, "");
    if (sub && sub !== "www" && sub !== cfg.rootDomain) {
      const bySlug = await getTenantBySlug(db, sub);
      if (bySlug) return { tenant: bySlug, source: "subdomain" };
    }
  }

  if (cfg.tenantResolution === "header") {
    const slug = input.headers[cfg.tenantHeader];
    if (slug) {
      const bySlug = await getTenantBySlug(db, slug.toLowerCase());
      if (bySlug) return { tenant: bySlug, source: "header" };
    }
  }

  if (cfg.tenantResolution === "path" && input.pathname.startsWith(cfg.tenantPathPrefix + "/")) {
    const remainder = input.pathname.slice(cfg.tenantPathPrefix.length + 1);
    const slug = remainder.split("/")[0];
    if (slug) {
      const bySlug = await getTenantBySlug(db, slug.toLowerCase());
      if (bySlug) return { tenant: bySlug, source: "path" };
    }
  }

  const t = await ensureDefaultTenant(db, cfg);
  return { tenant: t, source: "default" };
}
