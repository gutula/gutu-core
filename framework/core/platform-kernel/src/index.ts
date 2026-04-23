import {
  assertRepositoryBoundary as assertRepositoryBoundaryBase,
  defaultPluginCategory,
  definePackManifest as definePackManifestBase,
  definePackageManifest as definePackageManifestBase,
  getLegacyPackageIds,
  getPackageNamespaceMetadata,
  getPluginCategoryDefinition,
  listPluginCategoryDefinitions,
  packEnvironmentScopeSchema,
  packManifestSchema,
  packMergeStrategySchema,
  packObjectIdentitySchema,
  packPreviewSummarySchema,
  packRollbackSnapshotSchema,
  packTrustTierSchema,
  packTypeSchema,
  packageAllowedInRepository,
  packageDependencyClassSchema,
  packageDependencyContractSchema,
  packageKindSchema,
  packageManifestSchema,
  packageNamespacePolicy,
  pluginCategoryOrder,
  pluginCategoryRegistry,
  pluginCategorySchema,
  repositoryRoleSchema,
  resolvePluginCategory,
  type PackEnvironmentScope,
  type PackManifest,
  type PackManifestInput,
  type PackMergeStrategy,
  type PackObjectIdentity,
  type PackPreviewSummary,
  type PackRollbackSnapshot,
  type PackTrustTier,
  type PackType,
  type PackageDependencyClass,
  type PackageDependencyContract,
  type PackageKind,
  type PackageManifest,
  type PackageManifestInput,
  type PackageNamespaceMetadata,
  type PackageNamespaceScopeKind,
  type PluginCategory,
  type PluginCategoryDefinition,
  type RepositoryRole
} from "@gutu/kernel";
import { z } from "zod";

export function definePackageManifest(input: PackageManifestInput): PackageManifest {
  return definePackageManifestBase(input);
}

export function definePackManifest(input: PackManifestInput): PackManifest {
  return definePackManifestBase(input);
}

export function assertRepositoryBoundary(repositoryRole: RepositoryRole, manifests: readonly PackageManifest[]) {
  return assertRepositoryBoundaryBase(repositoryRole, manifests);
}

export type ValidationIssue = {
  code: string;
  message: string;
  path?: string | undefined;
  [key: string]: unknown;
};

export class ValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(message: string, issues: ValidationIssue[] = []) {
    super(message);
    this.name = "ValidationError";
    this.issues = issues;
  }
}

export const packageDefinitionSchema = z
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
    recommendedPlugins: z.array(z.string().min(1)).default([]),
    capabilityEnhancingPlugins: z.array(z.string().min(1)).default([]),
    integrationOnlyPlugins: z.array(z.string().min(1)).default([]),
    suggestedPacks: z.array(z.string().min(1)).default([]),
    standaloneSupported: z.boolean().default(true),
    installNotes: z.array(z.string().min(1)).default([]),
    providesCapabilities: z.array(z.string().min(1)).default([]),
    requestedCapabilities: z.array(z.string().min(1)).default([]),
    ownsData: z.array(z.string().min(1)).default([]),
    extendsData: z.array(z.string().min(1)).default([]),
    publicCommands: z.array(z.string().min(1)).default([]),
    publicQueries: z.array(z.string().min(1)).default([]),
    publicEvents: z.array(z.string().min(1)).default([]),
    deprecates: z.array(z.string().min(1)).default([]),
    extends: z.array(z.string().min(1)).default([]),
    dependsOn: z.array(z.string().min(1)).default([]),
    optionalWith: z.array(z.string().min(1)).default([]),
    conflictsWith: z.array(z.string().min(1)).default([]),
    slotClaims: z.array(z.string().min(1)).default([]),
    trustTier: z.string().min(1).optional(),
    reviewTier: z.string().min(1).optional(),
    isolationProfile: z.string().min(1).optional(),
    compatibility: z
      .object({
        framework: z.string().min(1),
        runtime: z.string().min(1),
        db: z.array(z.string().min(1)).default([])
      })
      .optional()
  })
  .passthrough()
  .superRefine((value, context) => {
    const parsed = packageManifestSchema.safeParse(value);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        context.addIssue(issue);
      }
    }
  });

export type PackageDefinition = z.infer<typeof packageDefinitionSchema>;
export type PackageDefinitionInput = z.input<typeof packageDefinitionSchema>;

export function definePackage(input: PackageDefinitionInput): Readonly<PackageDefinition> {
  const parsed = packageDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      "Package definitions must include valid manifest metadata.",
      parsed.error.issues.map((issue) => ({
        code: issue.code,
        message: issue.message,
        path: issue.path.length > 0 ? issue.path.join(".") : undefined
      }))
    );
  }

  return Object.freeze({
    ...parsed.data
  });
}

export {
  defaultPluginCategory,
  getLegacyPackageIds,
  getPackageNamespaceMetadata,
  getPluginCategoryDefinition,
  listPluginCategoryDefinitions,
  packEnvironmentScopeSchema,
  packManifestSchema,
  packMergeStrategySchema,
  packObjectIdentitySchema,
  packPreviewSummarySchema,
  packRollbackSnapshotSchema,
  packTrustTierSchema,
  packTypeSchema,
  packageAllowedInRepository,
  packageDependencyClassSchema,
  packageDependencyContractSchema,
  packageKindSchema,
  packageManifestSchema,
  packageNamespacePolicy,
  pluginCategoryOrder,
  pluginCategoryRegistry,
  pluginCategorySchema,
  repositoryRoleSchema,
  resolvePluginCategory
};

export type {
  PackEnvironmentScope,
  PackManifest,
  PackManifestInput,
  PackMergeStrategy,
  PackObjectIdentity,
  PackPreviewSummary,
  PackRollbackSnapshot,
  PackTrustTier,
  PackType,
  PackageDependencyClass,
  PackageDependencyContract,
  PackageKind,
  PackageManifest,
  PackageManifestInput,
  PackageNamespaceMetadata,
  PackageNamespaceScopeKind,
  PluginCategory,
  PluginCategoryDefinition,
  RepositoryRole
};
