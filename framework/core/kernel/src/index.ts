import { z } from "zod";

export const packageKindSchema = z.enum(["core", "library", "plugin", "app"]);
export type PackageKind = z.infer<typeof packageKindSchema>;

export const repositoryRoleSchema = z.enum(["core", "library", "plugin", "integration", "catalog"]);
export type RepositoryRole = z.infer<typeof repositoryRoleSchema>;

export const packageManifestSchema = z.object({
  id: z.string().min(1),
  kind: packageKindSchema,
  version: z.string().min(1),
  description: z.string().min(1),
  sourceRepo: z.string().min(1).optional()
});
export type PackageManifest = z.infer<typeof packageManifestSchema>;

export function definePackageManifest(input: PackageManifest): PackageManifest {
  return packageManifestSchema.parse(input);
}

export function packageAllowedInRepository(repositoryRole: RepositoryRole, packageKind: PackageKind): boolean {
  if (repositoryRole === "core") {
    return packageKind === "core" || packageKind === "library";
  }

  if (repositoryRole === "plugin") {
    return packageKind === "plugin";
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
