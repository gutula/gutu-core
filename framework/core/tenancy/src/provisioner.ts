import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import type { Dbx } from "./dbx/types";
import type { TenancyConfig } from "./config";
import { migrateTenantSchema } from "./migrations";

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  schemaName: string;
  status: "active" | "suspended" | "archived";
  plan: string;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface TenantRow {
  id: string;
  slug: string;
  name: string;
  schema_name: string;
  status: string;
  plan: string;
  settings: string | Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

function hydrate(row: TenantRow): Tenant {
  const s =
    typeof row.settings === "string"
      ? ((): Record<string, unknown> => {
          try { return JSON.parse(row.settings) as Record<string, unknown>; }
          catch { return {}; }
        })()
      : (row.settings as Record<string, unknown> | null) ?? {};
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    schemaName: row.schema_name,
    status: (row.status as Tenant["status"]) ?? "active",
    plan: row.plan ?? "free",
    settings: s,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Validate + normalize a slug. Schema identifiers must match
 *  [a-z_][a-z0-9_]{0,62}. The slug is also safe to use in URLs. */
export function normalizeSlug(raw: string): string {
  const s = raw.toLowerCase().trim().replace(/[^a-z0-9_-]/g, "-").replace(/^-+|-+$/g, "");
  if (!/^[a-z][a-z0-9_-]{1,62}$/.test(s)) {
    throw new Error(
      `Invalid tenant slug "${raw}". Must start with a letter, 2-63 chars, a-z/0-9/- only.`,
    );
  }
  return s;
}

export function schemaForSlug(prefix: string, slug: string): string {
  return `${prefix}${slug.replace(/-/g, "_")}`;
}

function globalPrefix(db: Dbx): string {
  return db.kind === "postgres" ? "public." : "";
}

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

export async function listTenants(db: Dbx): Promise<Tenant[]> {
  const rows = await db.all<TenantRow>(
    `SELECT * FROM ${globalPrefix(db)}tenants ORDER BY name ASC`,
  );
  return rows.map(hydrate);
}

export async function getTenant(db: Dbx, id: string): Promise<Tenant | null> {
  const row = await db.get<TenantRow>(
    `SELECT * FROM ${globalPrefix(db)}tenants WHERE id = ?`,
    [id],
  );
  return row ? hydrate(row) : null;
}

export async function getTenantBySlug(db: Dbx, slug: string): Promise<Tenant | null> {
  const row = await db.get<TenantRow>(
    `SELECT * FROM ${globalPrefix(db)}tenants WHERE slug = ?`,
    [slug],
  );
  return row ? hydrate(row) : null;
}

export async function getTenantByDomain(db: Dbx, domain: string): Promise<Tenant | null> {
  const row = await db.get<TenantRow>(
    `SELECT t.* FROM ${globalPrefix(db)}tenants t
     JOIN ${globalPrefix(db)}tenant_domains d ON d.tenant_id = t.id
     WHERE d.domain = ?`,
    [domain.toLowerCase()],
  );
  return row ? hydrate(row) : null;
}

export async function listMembershipsForUser(
  db: Dbx,
  userId: string,
): Promise<{ tenant: Tenant; role: string }[]> {
  const rows = await db.all<TenantRow & { mem_role: string }>(
    `SELECT t.*, m.role AS mem_role
     FROM ${globalPrefix(db)}tenant_memberships m
     JOIN ${globalPrefix(db)}tenants t ON t.id = m.tenant_id
     WHERE m.user_id = ?
     ORDER BY t.name ASC`,
    [userId],
  );
  return rows.map((r) => ({ tenant: hydrate(r), role: r.mem_role }));
}

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */

export interface CreateTenantInput {
  slug: string;
  name: string;
  plan?: string;
  initialOwnerUserId?: string;
  settings?: Record<string, unknown>;
}

export async function createTenant(
  db: Dbx,
  cfg: TenancyConfig,
  input: CreateTenantInput,
): Promise<Tenant> {
  const slug = normalizeSlug(input.slug);
  const existing = await getTenantBySlug(db, slug);
  if (existing) throw new Error(`Tenant with slug "${slug}" already exists`);

  const id = randomUUID();
  const schemaName = schemaForSlug(cfg.tenantSchemaPrefix, slug);
  const now = new Date().toISOString();
  const prefix = globalPrefix(db);

  await db.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO ${prefix}tenants (id, slug, name, schema_name, status, plan, settings, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
      [
        id,
        slug,
        input.name,
        schemaName,
        input.plan ?? "free",
        JSON.stringify(input.settings ?? {}),
        now,
        now,
      ],
    );
    if (input.initialOwnerUserId) {
      await tx.run(
        `INSERT INTO ${prefix}tenant_memberships (tenant_id, user_id, role, joined_at)
         VALUES (?, ?, 'owner', ?)`,
        [id, input.initialOwnerUserId, now],
      );
    }
  });

  await migrateTenantSchema(db, schemaName);

  try {
    await mkdir(path.join(cfg.filesRoot, schemaName), { recursive: true });
  } catch {
    /* already exists */
  }

  const created = await getTenant(db, id);
  if (!created) throw new Error("Created tenant could not be re-read");
  return created;
}

/* ------------------------------------------------------------------ */
/* Update / lifecycle                                                  */
/* ------------------------------------------------------------------ */

export async function updateTenant(
  db: Dbx,
  id: string,
  patch: Partial<Pick<Tenant, "name" | "plan" | "status" | "settings">>,
): Promise<Tenant> {
  const current = await getTenant(db, id);
  if (!current) throw new Error(`Tenant ${id} not found`);
  const prefix = globalPrefix(db);
  const now = new Date().toISOString();
  const next = { ...current, ...patch };
  await db.run(
    `UPDATE ${prefix}tenants SET name = ?, plan = ?, status = ?, settings = ?, updated_at = ? WHERE id = ?`,
    [
      next.name,
      next.plan,
      next.status,
      JSON.stringify(next.settings),
      now,
      id,
    ],
  );
  const reread = await getTenant(db, id);
  if (!reread) throw new Error(`Tenant ${id} disappeared during update`);
  return reread;
}

export async function addMembership(
  db: Dbx,
  tenantId: string,
  userId: string,
  role = "member",
): Promise<void> {
  const prefix = globalPrefix(db);
  const now = new Date().toISOString();
  if (db.kind === "postgres") {
    await db.run(
      `INSERT INTO ${prefix}tenant_memberships (tenant_id, user_id, role, joined_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [tenantId, userId, role, now],
    );
  } else {
    await db.run(
      `INSERT OR REPLACE INTO tenant_memberships (tenant_id, user_id, role, joined_at)
       VALUES (?, ?, ?, ?)`,
      [tenantId, userId, role, now],
    );
  }
}

export async function removeMembership(
  db: Dbx,
  tenantId: string,
  userId: string,
): Promise<void> {
  await db.run(
    `DELETE FROM ${globalPrefix(db)}tenant_memberships WHERE tenant_id = ? AND user_id = ?`,
    [tenantId, userId],
  );
}

export async function setPrimaryDomain(
  db: Dbx,
  tenantId: string,
  domain: string,
): Promise<void> {
  const prefix = globalPrefix(db);
  const now = new Date().toISOString();
  await db.transaction(async (tx) => {
    await tx.run(
      `UPDATE ${prefix}tenant_domains SET is_primary = 0 WHERE tenant_id = ?`,
      [tenantId],
    );
    if (tx.kind === "postgres") {
      await tx.run(
        `INSERT INTO ${prefix}tenant_domains (domain, tenant_id, is_primary, created_at)
         VALUES (?, ?, 1, ?)
         ON CONFLICT (domain) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, is_primary = 1`,
        [domain.toLowerCase(), tenantId, now],
      );
    } else {
      await tx.run(
        `INSERT OR REPLACE INTO tenant_domains (domain, tenant_id, is_primary, created_at)
         VALUES (?, ?, 1, ?)`,
        [domain.toLowerCase(), tenantId, now],
      );
    }
  });
}

/* ------------------------------------------------------------------ */
/* Off-board                                                           */
/* ------------------------------------------------------------------ */

/** Archive a tenant — hides it from switchers but keeps data.
 *  Safe, reversible. */
export async function archiveTenant(db: Dbx, id: string): Promise<void> {
  await updateTenant(db, id, { status: "archived" });
}

/** Drops the tenant schema, memberships, domains, files. Irreversible. */
export async function deleteTenantHard(
  db: Dbx,
  cfg: TenancyConfig,
  id: string,
): Promise<void> {
  const tenant = await getTenant(db, id);
  if (!tenant) return;
  const prefix = globalPrefix(db);

  await db.transaction(async (tx) => {
    await tx.run(`DELETE FROM ${prefix}tenant_memberships WHERE tenant_id = ?`, [id]);
    await tx.run(`DELETE FROM ${prefix}tenant_domains WHERE tenant_id = ?`, [id]);
    await tx.run(`DELETE FROM ${prefix}sessions WHERE tenant_id = ?`, [id]);
    await tx.run(`DELETE FROM ${prefix}tenants WHERE id = ?`, [id]);
  });

  if (db.kind === "postgres") {
    try {
      await db.exec(`DROP SCHEMA IF EXISTS ${tenant.schemaName} CASCADE`);
    } catch (err) {
      console.error(`[tenancy] drop schema failed`, err);
    }
  }

  try {
    await rm(path.join(cfg.filesRoot, tenant.schemaName), { recursive: true, force: true });
  } catch {
    /* missing is fine */
  }
}

/* ------------------------------------------------------------------ */
/* Bootstrap                                                           */
/* ------------------------------------------------------------------ */

export async function ensureDefaultTenant(
  db: Dbx,
  cfg: TenancyConfig,
): Promise<Tenant> {
  let t = await getTenantBySlug(db, cfg.defaultTenantSlug);
  if (t) return t;
  t = await createTenant(db, cfg, {
    slug: cfg.defaultTenantSlug,
    name: "Main",
    plan: "builtin",
  });
  return t;
}

/** In single-site mode every authenticated user implicitly belongs to the
 *  default tenant. This backfills memberships for users predating
 *  multi-tenancy. Returns count of new memberships created. */
export async function backfillDefaultMemberships(
  db: Dbx,
  cfg: TenancyConfig,
): Promise<number> {
  const tenant = await ensureDefaultTenant(db, cfg);
  const prefix = globalPrefix(db);
  const users = await db.all<{ id: string; role: string }>(
    `SELECT u.id, u.role
     FROM ${prefix}users u
     WHERE NOT EXISTS (
       SELECT 1 FROM ${prefix}tenant_memberships m
       WHERE m.user_id = u.id AND m.tenant_id = ?
     )`,
    [tenant.id],
  );
  for (const u of users) {
    const role = u.role === "admin" ? "owner" : u.role === "viewer" ? "viewer" : "member";
    await addMembership(db, tenant.id, u.id, role);
  }
  return users.length;
}
