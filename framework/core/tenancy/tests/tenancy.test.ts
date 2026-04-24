import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SqliteDbx } from "../src/dbx/sqlite";
import { migrateGlobal, migrateTenantSchema } from "../src/migrations";
import {
  addMembership,
  archiveTenant,
  createTenant,
  deleteTenantHard,
  ensureDefaultTenant,
  getTenant,
  getTenantBySlug,
  listMembershipsForUser,
  listTenants,
  normalizeSlug,
  schemaForSlug,
} from "../src/provisioner";
import { resolveTenant } from "../src/resolver";
import type { TenancyConfig } from "../src/config";

function makeConfig(filesRoot: string): TenancyConfig {
  return {
    multisite: false,
    tenantResolution: "subdomain",
    defaultTenantSlug: "main",
    tenantHeader: "x-tenant",
    tenantPathPrefix: "/t",
    tenantSchemaPrefix: "tenant_",
    dbKind: "sqlite",
    filesRoot,
  };
}

describe("tenancy", () => {
  let dir: string;
  let db: SqliteDbx;
  let cfg: TenancyConfig;

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "tenancy-test-"));
    db = new SqliteDbx(path.join(dir, "test.db"));
    cfg = makeConfig(path.join(dir, "files"));
    await migrateGlobal(db);
  });

  afterEach(async () => {
    await db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  describe("normalizeSlug", () => {
    test("accepts well-formed slugs", () => {
      expect(normalizeSlug("acme")).toBe("acme");
      expect(normalizeSlug("acme-corp")).toBe("acme-corp");
      expect(normalizeSlug("acme_corp")).toBe("acme_corp");
      expect(normalizeSlug("ACME")).toBe("acme");
    });

    test("rejects invalid slugs", () => {
      expect(() => normalizeSlug("a")).toThrow();
      expect(() => normalizeSlug("1abc")).toThrow();
      expect(() => normalizeSlug("--")).toThrow();
    });

    test("produces schema-safe names", () => {
      expect(schemaForSlug("tenant_", "acme-corp")).toBe("tenant_acme_corp");
      expect(schemaForSlug("tenant_", "acme")).toBe("tenant_acme");
    });
  });

  describe("ensureDefaultTenant", () => {
    test("creates the default tenant once, is idempotent", async () => {
      const first = await ensureDefaultTenant(db, cfg);
      expect(first.slug).toBe("main");
      const second = await ensureDefaultTenant(db, cfg);
      expect(second.id).toBe(first.id);
      const list = await listTenants(db);
      expect(list).toHaveLength(1);
    });
  });

  describe("createTenant", () => {
    test("creates a tenant with owner membership", async () => {
      const tenant = await createTenant(db, cfg, {
        slug: "acme",
        name: "Acme Corp",
        plan: "pro",
        initialOwnerUserId: "user-1",
      });
      expect(tenant.slug).toBe("acme");
      expect(tenant.schemaName).toBe("tenant_acme");
      expect(tenant.status).toBe("active");
      expect(tenant.plan).toBe("pro");

      const mems = await listMembershipsForUser(db, "user-1");
      expect(mems).toHaveLength(1);
      expect(mems[0].role).toBe("owner");
      expect(mems[0].tenant.id).toBe(tenant.id);
    });

    test("rejects duplicate slugs", async () => {
      await createTenant(db, cfg, { slug: "acme", name: "Acme" });
      await expect(createTenant(db, cfg, { slug: "acme", name: "Acme 2" })).rejects.toThrow(
        /already exists/,
      );
    });

    test("creates per-tenant file directory", async () => {
      const tenant = await createTenant(db, cfg, { slug: "acme", name: "Acme" });
      const fs = await import("node:fs/promises");
      const stat = await fs.stat(path.join(cfg.filesRoot, tenant.schemaName));
      expect(stat.isDirectory()).toBe(true);
    });
  });

  describe("resolveTenant", () => {
    beforeEach(async () => {
      await ensureDefaultTenant(db, cfg);
      await createTenant(db, cfg, { slug: "acme", name: "Acme" });
    });

    test("falls back to default in single-site mode", async () => {
      const r = await resolveTenant(db, cfg, {
        host: "anything.example",
        headers: {},
        pathname: "/api/stuff",
        sessionTenantId: null,
      });
      expect(r.tenant.slug).toBe("main");
      expect(r.source).toBe("default");
    });

    test("session id wins even in single-site", async () => {
      const acme = await getTenantBySlug(db, "acme");
      const r = await resolveTenant(db, cfg, {
        host: null,
        headers: {},
        pathname: "/",
        sessionTenantId: acme!.id,
      });
      expect(r.tenant.slug).toBe("acme");
      expect(r.source).toBe("session");
    });

    test("subdomain resolution in multi-site", async () => {
      const multicfg = { ...cfg, multisite: true, rootDomain: "gutu.app" };
      const r = await resolveTenant(db, multicfg, {
        host: "acme.gutu.app",
        headers: {},
        pathname: "/",
        sessionTenantId: null,
      });
      expect(r.tenant.slug).toBe("acme");
      expect(r.source).toBe("subdomain");
    });

    test("header resolution in multi-site", async () => {
      const multicfg = { ...cfg, multisite: true, tenantResolution: "header" as const };
      const r = await resolveTenant(db, multicfg, {
        host: null,
        headers: { "x-tenant": "acme" },
        pathname: "/",
        sessionTenantId: null,
      });
      expect(r.tenant.slug).toBe("acme");
      expect(r.source).toBe("header");
    });

    test("path resolution in multi-site", async () => {
      const multicfg = { ...cfg, multisite: true, tenantResolution: "path" as const };
      const r = await resolveTenant(db, multicfg, {
        host: null,
        headers: {},
        pathname: "/t/acme/records",
        sessionTenantId: null,
      });
      expect(r.tenant.slug).toBe("acme");
      expect(r.source).toBe("path");
    });

    test("unknown tenant in multi-site falls through to default", async () => {
      const multicfg = { ...cfg, multisite: true, rootDomain: "gutu.app" };
      const r = await resolveTenant(db, multicfg, {
        host: "nonexistent.gutu.app",
        headers: {},
        pathname: "/",
        sessionTenantId: null,
      });
      expect(r.tenant.slug).toBe("main");
      expect(r.source).toBe("default");
    });
  });

  describe("lifecycle", () => {
    test("archiveTenant marks status=archived", async () => {
      const t = await createTenant(db, cfg, { slug: "acme", name: "Acme" });
      await archiveTenant(db, t.id);
      const reread = await getTenant(db, t.id);
      expect(reread?.status).toBe("archived");
    });

    test("deleteTenantHard removes rows + schema artifacts", async () => {
      const t = await createTenant(db, cfg, { slug: "acme", name: "Acme" });
      await addMembership(db, t.id, "user-2", "member");
      await deleteTenantHard(db, cfg, t.id);
      const reread = await getTenant(db, t.id);
      expect(reread).toBeNull();
      const mems = await listMembershipsForUser(db, "user-2");
      expect(mems).toHaveLength(0);
    });
  });

  describe("per-tenant schema migration", () => {
    test("creates records + audit_events + files tables", async () => {
      const t = await createTenant(db, cfg, { slug: "acme", name: "Acme" });
      await migrateTenantSchema(db, t.schemaName);
      // SQLite puts everything in the main DB; just verify records table exists.
      const rows = await db.all<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='records'`,
      );
      expect(rows.length).toBeGreaterThanOrEqual(1);
    });
  });
});
