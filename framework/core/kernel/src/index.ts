import { z } from "zod";

export const packageKindSchema = z.enum([
  "core",
  "library",
  "plugin",
  "app",
  "ai-pack",
  "ui-surface",
  "foundation-pack",
  "addon-pack",
  "sector-pack",
  "localization-pack",
  "starter-pack"
]);
export type PackageKind = z.infer<typeof packageKindSchema>;

export const repositoryRoleSchema = z.enum(["core", "library", "plugin", "integration", "catalog"]);
export type RepositoryRole = z.infer<typeof repositoryRoleSchema>;

export const pluginCategoryRegistry = [
  {
    id: "platform_governance",
    label: "Platform Governance",
    iconToken: "shield-check",
    sortOrder: 0,
    subcategories: [
      { id: "admin_shell", label: "Admin Shell" },
      { id: "audit_compliance", label: "Audit & Compliance" },
      { id: "automation", label: "Automation" },
      { id: "job_orchestration", label: "Job Orchestration" },
      { id: "workflow_approvals", label: "Workflow & Approvals" },
      { id: "uncategorized", label: "Uncategorized" }
    ]
  },
  {
    id: "user_management",
    label: "User Management",
    iconToken: "users",
    sortOrder: 1,
    subcategories: [
      { id: "authentication", label: "Authentication" },
      { id: "organizations_tenants", label: "Organizations & Tenants" },
      { id: "roles_permissions", label: "Roles & Permissions" },
      { id: "directory_profiles", label: "Directory & Profiles" },
      { id: "community_membership", label: "Community & Membership" }
    ]
  },
  {
    id: "business",
    label: "Business",
    iconToken: "briefcase",
    sortOrder: 2,
    subcategories: [
      { id: "party_relationships", label: "Party & Relationships" },
      { id: "product_catalog", label: "Product & Catalog" },
      { id: "pricing_tax", label: "Pricing & Tax" },
      { id: "traceability_dimensions", label: "Traceability & Dimensions" },
      { id: "accounting_finance", label: "Accounting & Finance" },
      { id: "crm_pipeline", label: "CRM & Pipeline" },
      { id: "sales_commerce", label: "Sales & Commerce" },
      { id: "procurement_sourcing", label: "Procurement & Sourcing" },
      { id: "inventory_warehouse", label: "Inventory & Warehouse" },
      { id: "projects_delivery", label: "Projects & Delivery" },
      { id: "support_service", label: "Support & Service" },
      { id: "pos_retail", label: "POS & Retail" },
      { id: "manufacturing_production", label: "Manufacturing & Production" },
      { id: "quality_compliance", label: "Quality & Compliance" },
      { id: "assets_lifecycle", label: "Assets & Lifecycle" },
      { id: "hr_payroll", label: "HR & Payroll" },
      { id: "booking_reservations", label: "Booking & Reservations" },
      { id: "payments", label: "Payments" },
      { id: "communications", label: "Communications" },
      { id: "analytics_reporting", label: "Analytics & Reporting" },
      { id: "work_management", label: "Work Management" }
    ]
  },
  {
    id: "content_experience",
    label: "Content & Experience",
    iconToken: "layout-template",
    sortOrder: 3,
    subcategories: [
      { id: "content_management", label: "Content Management" },
      { id: "documents", label: "Documents" },
      { id: "files_assets", label: "Files & Assets" },
      { id: "forms_submissions", label: "Forms & Submissions" },
      { id: "knowledge_base", label: "Knowledge Base" },
      { id: "page_building", label: "Page Building" },
      { id: "portal_experience", label: "Portal Experience" },
      { id: "search_discovery", label: "Search & Discovery" },
      { id: "templates", label: "Templates" }
    ]
  },
  {
    id: "ai_automation",
    label: "AI & Automation",
    iconToken: "bot",
    sortOrder: 4,
    subcategories: [
      { id: "agent_runtime", label: "Agent Runtime" },
      { id: "evaluation_governance", label: "Evaluation & Governance" },
      { id: "retrieval_knowledge", label: "Retrieval & Knowledge" },
      { id: "skills_profiles", label: "Skills & Profiles" },
      { id: "operating_models", label: "Operating Models" },
      { id: "execution_workspaces", label: "Execution Workspaces" },
      { id: "runtime_bridges", label: "Runtime Bridges" }
    ]
  },
  {
    id: "integrations",
    label: "Integrations",
    iconToken: "plug-zap",
    sortOrder: 5,
    subcategories: [{ id: "connectors_webhooks", label: "Connectors & Webhooks" }]
  }
] as const;

export const packageNamespacePolicy = {
  canonicalFrameworkScope: "@gutu",
  legacyFrameworkScope: "@platform",
  pluginScope: "@plugins"
} as const;

export type PluginCategoryDefinition = (typeof pluginCategoryRegistry)[number];
export type PluginCategorySubcategoryDefinition = PluginCategoryDefinition["subcategories"][number];
export type PluginCategoryId = PluginCategoryDefinition["id"];
export type PluginCategorySubcategoryId = PluginCategorySubcategoryDefinition["id"];
export type PackageNamespaceScopeKind = "canonical_framework" | "legacy_framework" | "plugin" | "other";
export type PackageNamespaceMetadata = {
  id: string;
  canonicalId: string;
  legacyIds: string[];
  scopeKind: PackageNamespaceScopeKind;
  isCanonical: boolean;
};

const pluginCategoryMap = new Map(pluginCategoryRegistry.map((entry) => [entry.id, entry]));

export const pluginCategoryOrder = pluginCategoryRegistry
  .slice()
  .sort((left, right) => left.sortOrder - right.sortOrder)
  .map((entry) => entry.id);

export const defaultPluginCategory = {
  id: "platform_governance",
  label: "Platform Governance",
  subcategoryId: "uncategorized",
  subcategoryLabel: "Uncategorized"
} as const;

export const pluginCategorySchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    subcategoryId: z.string().min(1),
    subcategoryLabel: z.string().min(1)
  })
  .superRefine((value, context) => {
    const category = getPluginCategoryDefinition(value.id);
    if (!category) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unknown plugin category '${value.id}'.`,
        path: ["id"]
      });
      return;
    }

    if (value.label !== category.label) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Plugin category label must be '${category.label}'.`,
        path: ["label"]
      });
    }

    const subcategory = category.subcategories.find((entry) => entry.id === value.subcategoryId);
    if (!subcategory) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unknown subcategory '${value.subcategoryId}' for plugin category '${value.id}'.`,
        path: ["subcategoryId"]
      });
      return;
    }

    if (value.subcategoryLabel !== subcategory.label) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Plugin subcategory label must be '${subcategory.label}'.`,
        path: ["subcategoryLabel"]
      });
    }
  });
export type PluginCategory = z.infer<typeof pluginCategorySchema>;

export const packageDependencyClassSchema = z.enum([
  "required",
  "optional",
  "capability-enhancing",
  "integration-only"
]);
export type PackageDependencyClass = z.infer<typeof packageDependencyClassSchema>;

export const packageDependencyContractSchema = z.object({
  packageId: z.string().min(1),
  class: packageDependencyClassSchema,
  version: z.string().min(1).optional(),
  capabilities: z.array(z.string().min(1)).default([]),
  rationale: z.string().min(1).optional()
});
export type PackageDependencyContract = z.infer<typeof packageDependencyContractSchema>;

export const packageContractSurfaceSchema = z.array(z.string().min(1)).default([]);

export const packageManifestSchema = z
  .object({
    id: z.string().min(1),
    kind: packageKindSchema,
    version: z.string().min(1),
    contractVersion: z.string().min(1).default("1.0.0"),
    description: z.string().min(1),
    sourceRepo: z.string().min(1).optional(),
    displayName: z.string().min(1).optional(),
    domainGroup: z.string().min(1).optional(),
    defaultCategory: pluginCategorySchema.optional(),
    dependencyContracts: z.array(packageDependencyContractSchema).default([]),
    providesCapabilities: packageContractSurfaceSchema,
    requestedCapabilities: packageContractSurfaceSchema,
    ownsData: packageContractSurfaceSchema,
    extendsData: packageContractSurfaceSchema,
    publicCommands: packageContractSurfaceSchema,
    publicQueries: packageContractSurfaceSchema,
    publicEvents: packageContractSurfaceSchema,
    deprecates: packageContractSurfaceSchema
  })
  .superRefine((value, context) => {
    const categoryRequired = value.kind !== "core" && value.kind !== "library";
    if (categoryRequired && !value.defaultCategory) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Non-core package manifests must declare a valid defaultCategory.",
        path: ["defaultCategory"]
      });
    }
  });
export type PackageManifest = z.infer<typeof packageManifestSchema>;
export type PackageManifestInput = z.input<typeof packageManifestSchema>;

export const packTypeSchema = z.enum([
  "base-template",
  "localization-pack",
  "sector-template",
  "starter-pack",
  "addon-pack",
  "sample-data",
  "company-overlay",
  "environment-overlay"
]);
export type PackType = z.infer<typeof packTypeSchema>;

export const packMergeStrategySchema = z.enum([
  "merge",
  "replace",
  "patch",
  "upsert",
  "disabled-on-conflict"
]);
export type PackMergeStrategy = z.infer<typeof packMergeStrategySchema>;

export const packTrustTierSchema = z.enum([
  "first-party-signed",
  "partner-signed",
  "internal-signed",
  "unsigned-dev"
]);
export type PackTrustTier = z.infer<typeof packTrustTierSchema>;

export const packEnvironmentScopeSchema = z.enum(["base", "localization", "sector", "company", "environment"]);
export type PackEnvironmentScope = z.infer<typeof packEnvironmentScopeSchema>;

export const packManifestSchema = z.object({
  packType: packTypeSchema,
  name: z.string().min(1),
  version: z.string().min(1),
  publisher: z.string().min(1),
  platformVersion: z.string().min(1),
  pluginConstraints: z.record(z.string(), z.string()).default({}),
  dependsOnPacks: z.array(z.string().min(1)).default([]),
  mergePolicy: z.record(z.string(), packMergeStrategySchema).default({}),
  trustTier: packTrustTierSchema.default("unsigned-dev"),
  compatibilityChannel: z.enum(["stable", "next"]).default("next"),
  dryRunSupported: z.boolean().default(true),
  rollbackStrategy: z.enum(["transaction", "inverse-patch", "snapshot-required"]).default("snapshot-required"),
  environmentScope: packEnvironmentScopeSchema.default("base"),
  signaturesFile: z.string().min(1).default("signatures.json"),
  dependenciesFile: z.string().min(1).default("dependencies.json")
});
export type PackManifest = z.infer<typeof packManifestSchema>;
export type PackManifestInput = z.input<typeof packManifestSchema>;

export const packObjectIdentitySchema = z.object({
  type: z.string().min(1),
  logicalKey: z.string().min(1),
  uuid: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  owningPlugin: z.string().min(1).optional(),
  version: z.string().min(1).optional(),
  environmentScope: packEnvironmentScopeSchema.optional(),
  dependencyRefs: z.array(z.string().min(1)).default([])
});
export type PackObjectIdentity = z.infer<typeof packObjectIdentitySchema>;

export const packPreviewSummarySchema = z.object({
  added: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  replaced: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(),
  warnings: z.array(z.string().min(1)).default([])
});
export type PackPreviewSummary = z.infer<typeof packPreviewSummarySchema>;

export const packRollbackSnapshotSchema = z.object({
  snapshotId: z.string().min(1),
  createdAt: z.string().min(1),
  strategy: z.enum(["transaction", "inverse-patch", "snapshot-required"]),
  reversible: z.boolean(),
  objects: z.array(packObjectIdentitySchema).default([])
});
export type PackRollbackSnapshot = z.infer<typeof packRollbackSnapshotSchema>;

export function definePackageManifest(input: PackageManifestInput): PackageManifest {
  return packageManifestSchema.parse(input);
}

export function definePackManifest(input: PackManifestInput): PackManifest {
  return packManifestSchema.parse(input);
}

export function listPluginCategoryDefinitions(): readonly PluginCategoryDefinition[] {
  return pluginCategoryRegistry;
}

export function getPluginCategoryDefinition(categoryId: string): PluginCategoryDefinition | undefined {
  return pluginCategoryMap.get(categoryId as PluginCategoryId);
}

export function resolvePluginCategory(categoryId: string, subcategoryId: string): PluginCategory | undefined {
  const category = getPluginCategoryDefinition(categoryId);
  if (!category) {
    return undefined;
  }

  const subcategory = category.subcategories.find((entry) => entry.id === subcategoryId);
  if (!subcategory) {
    return undefined;
  }

  return {
    id: category.id,
    label: category.label,
    subcategoryId: subcategory.id,
    subcategoryLabel: subcategory.label
  };
}

export function toCanonicalPackageId(packageId: string): string {
  if (packageId.startsWith(`${packageNamespacePolicy.legacyFrameworkScope}/`)) {
    return `${packageNamespacePolicy.canonicalFrameworkScope}/${packageId.slice(packageNamespacePolicy.legacyFrameworkScope.length + 1)}`;
  }

  return packageId;
}

export function getLegacyPackageIds(packageId: string): string[] {
  if (packageId.startsWith(`${packageNamespacePolicy.canonicalFrameworkScope}/`)) {
    return [`${packageNamespacePolicy.legacyFrameworkScope}/${packageId.slice(packageNamespacePolicy.canonicalFrameworkScope.length + 1)}`];
  }

  if (packageId.startsWith(`${packageNamespacePolicy.legacyFrameworkScope}/`)) {
    return [packageId];
  }

  return [];
}

export function getPackageNamespaceMetadata(packageId: string): PackageNamespaceMetadata {
  if (packageId.startsWith(`${packageNamespacePolicy.legacyFrameworkScope}/`)) {
    return {
      id: packageId,
      canonicalId: toCanonicalPackageId(packageId),
      legacyIds: [packageId],
      scopeKind: "legacy_framework",
      isCanonical: false
    };
  }

  if (packageId.startsWith(`${packageNamespacePolicy.canonicalFrameworkScope}/`)) {
    return {
      id: packageId,
      canonicalId: packageId,
      legacyIds: getLegacyPackageIds(packageId),
      scopeKind: "canonical_framework",
      isCanonical: true
    };
  }

  if (packageId.startsWith(`${packageNamespacePolicy.pluginScope}/`)) {
    return {
      id: packageId,
      canonicalId: packageId,
      legacyIds: [],
      scopeKind: "plugin",
      isCanonical: true
    };
  }

  return {
    id: packageId,
    canonicalId: packageId,
    legacyIds: [],
    scopeKind: "other",
    isCanonical: true
  };
}

export function packageAllowedInRepository(repositoryRole: RepositoryRole, packageKind: PackageKind): boolean {
  if (repositoryRole === "core") {
    return packageKind === "core" || packageKind === "library";
  }

  if (repositoryRole === "plugin") {
    return packageKind !== "core" && packageKind !== "library";
  }

  if (repositoryRole === "library") {
    return packageKind === "library";
  }

  if (repositoryRole === "catalog") {
    return false;
  }

  return true;
}

export function assertRepositoryBoundary(repositoryRole: RepositoryRole, manifests: readonly PackageManifest[]) {
  const violations = manifests.filter((manifest) => !packageAllowedInRepository(repositoryRole, manifest.kind));
  return {
    ok: violations.length === 0,
    violations
  };
}
