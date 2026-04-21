export type PolicyRule = {
  permission: string;
  allowIf?: string[] | undefined;
  requireReason?: boolean | undefined;
  audit?: boolean | undefined;
  [key: string]: unknown;
};

export type PolicyDefinition = {
  id: string;
  rules?: PolicyRule[] | undefined;
  [key: string]: unknown;
};

export type PermissionDecision = {
  allowed: boolean;
  matchedRules: PolicyRule[];
  requireReason: boolean;
  audit: boolean;
};

export type InstallReviewPlan = {
  mode: "approved" | "restricted-preview";
  effectiveManifest: Record<string, unknown> & {
    isolationProfile: string;
  };
  strippedCapabilities: string[];
  strippedHosts: string[];
  requiredApprovals: string[];
};

export function definePolicy<T extends PolicyDefinition>(definition: T): Readonly<T> {
  return Object.freeze({
    ...definition
  });
}

export function evaluatePermission(
  policy: PolicyDefinition,
  permission: string,
  claims: readonly string[] = []
): PermissionDecision {
  const matchedRules = (policy.rules ?? []).filter((rule) => rule.permission === permission);
  const allowed = matchedRules.some((rule) => (rule.allowIf ?? []).some((claim) => claims.includes(claim)));

  return {
    allowed,
    matchedRules,
    requireReason: matchedRules.some((rule) => Boolean(rule.requireReason)),
    audit: matchedRules.some((rule) => Boolean(rule.audit))
  };
}

export function createInstallReviewPlan(
  manifest: Record<string, unknown> & {
    requestedCapabilities?: string[] | undefined;
    requestedHosts?: string[] | undefined;
    isolationProfile?: string | undefined;
    trustTier?: string | undefined;
  },
  options: { allowRestrictedPreview?: boolean | undefined } = {}
): InstallReviewPlan {
  const canRestrict = manifest.trustTier === "unknown" && options.allowRestrictedPreview;

  return {
    mode: canRestrict ? "restricted-preview" : "approved",
    effectiveManifest: {
      ...manifest,
      isolationProfile: canRestrict ? "declarative-only" : manifest.isolationProfile ?? "same-process-trusted"
    },
    strippedCapabilities: canRestrict ? [...(manifest.requestedCapabilities ?? [])] : [],
    strippedHosts: canRestrict ? [...(manifest.requestedHosts ?? [])] : [],
    requiredApprovals: canRestrict ? ["maintainer-review", "signature-verification"] : []
  };
}
