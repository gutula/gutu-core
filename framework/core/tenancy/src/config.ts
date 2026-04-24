/** Tenancy configuration.
 *
 *  Host-agnostic: the application reads its own env vars (or any config
 *  source) and constructs this object, then passes it to resolveTenant and
 *  the provisioner. This package does not read process.env on its own.
 */

export type DbKind = "sqlite" | "postgres";
export type TenantResolution = "subdomain" | "header" | "path";

export interface TenancyConfig {
  multisite: boolean;
  tenantResolution: TenantResolution;
  defaultTenantSlug: string;
  /** Root domain for subdomain resolution (e.g. "gutu.app"). */
  rootDomain?: string;
  /** HTTP header name when resolution = "header". */
  tenantHeader: string;
  /** Path prefix when resolution = "path" (e.g. "/t"). */
  tenantPathPrefix: string;
  /** Schema-name prefix for provisioned tenant schemas. */
  tenantSchemaPrefix: string;
  /** DB kind — required so the provisioner picks the right DDL dialect. */
  dbKind: DbKind;
  /** Where per-tenant file storage lives on disk. */
  filesRoot: string;
}

export const DEFAULT_TENANCY_CONFIG: TenancyConfig = {
  multisite: false,
  tenantResolution: "subdomain",
  defaultTenantSlug: "main",
  tenantHeader: "x-tenant",
  tenantPathPrefix: "/t",
  tenantSchemaPrefix: "tenant_",
  dbKind: "sqlite",
  filesRoot: "./files",
};
