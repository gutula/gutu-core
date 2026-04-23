export type SolvableDependencyClass = "required" | "optional" | "capability-enhancing" | "integration-only";

export type SolvableDependencyContract = {
  packageId: string;
  class: SolvableDependencyClass;
  capabilities?: string[] | undefined;
  rationale?: string | undefined;
};

export type SolvableManifest = {
  id: string;
  dependsOn?: string[] | undefined;
  dependencyContracts?: SolvableDependencyContract[] | undefined;
  optionalWith?: string[] | undefined;
  recommendedPlugins?: string[] | undefined;
  capabilityEnhancingPlugins?: string[] | undefined;
  integrationOnlyPlugins?: string[] | undefined;
  suggestedPacks?: string[] | undefined;
  trustTier?: string | undefined;
  commands?: string[] | undefined;
  emits?: string[] | undefined;
  subscribesTo?: string[] | undefined;
  [key: string]: unknown;
};

export type InstallRecommendation = {
  packageId: string;
  dependencyId: string;
  class: Exclude<SolvableDependencyClass, "required">;
  present: boolean;
  rationale?: string | undefined;
};

export type SolvePackageGraphResult = {
  orderedActivation: string[];
  warnings: string[];
  missingDependencies: Array<{
    packageId: string;
    dependencyId: string;
  }>;
  unresolvedSubscriptions: Array<{
    packageId: string;
      eventType: string;
  }>;
  duplicateCommands: string[];
  optionalDependencies: InstallRecommendation[];
  capabilityEnhancingDependencies: InstallRecommendation[];
  integrationOnlyDependencies: InstallRecommendation[];
  suggestedPacks: Array<{
    packageId: string;
    packId: string;
  }>;
};

function normalizeDependencyContracts(manifest: SolvableManifest): SolvableDependencyContract[] {
  const contracts: SolvableDependencyContract[] = [];
  const seen = new Set<string>();

  const push = (contract: SolvableDependencyContract) => {
    const key = `${contract.class}:${contract.packageId}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    contracts.push(contract);
  };

  for (const packageId of manifest.dependsOn ?? []) {
    push({ packageId, class: "required" });
  }
  for (const contract of manifest.dependencyContracts ?? []) {
    push(contract);
  }
  for (const packageId of manifest.optionalWith ?? []) {
    push({ packageId, class: "optional" });
  }
  for (const packageId of manifest.recommendedPlugins ?? []) {
    push({ packageId, class: "optional" });
  }
  for (const packageId of manifest.capabilityEnhancingPlugins ?? []) {
    push({ packageId, class: "capability-enhancing" });
  }
  for (const packageId of manifest.integrationOnlyPlugins ?? []) {
    push({ packageId, class: "integration-only" });
  }

  return contracts;
}

export function solvePackageGraph(input: {
  requested: string[];
  manifests: SolvableManifest[];
  platformVersion?: string | undefined;
  runtimeVersion?: string | undefined;
  dbEngine?: string | undefined;
  allowRestrictedPreviewForUnknownPlugins?: boolean | undefined;
}): SolvePackageGraphResult {
  const manifestMap = new Map(input.manifests.map((manifest) => [manifest.id, manifest]));
  const dependencyMap = new Map(input.manifests.map((manifest) => [manifest.id, normalizeDependencyContracts(manifest)]));
  const orderedActivation: string[] = [];
  const warnings: string[] = [];
  const missingDependencies: Array<{ packageId: string; dependencyId: string }> = [];
  const optionalDependencies: InstallRecommendation[] = [];
  const capabilityEnhancingDependencies: InstallRecommendation[] = [];
  const integrationOnlyDependencies: InstallRecommendation[] = [];
  const suggestedPacks: Array<{ packageId: string; packId: string }> = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const emittedEvents = new Set(input.manifests.flatMap((manifest) => manifest.emits ?? []));
  const commandCounts = new Map<string, number>();
  for (const manifest of input.manifests) {
    for (const command of manifest.commands ?? []) {
      commandCounts.set(command, (commandCounts.get(command) ?? 0) + 1);
    }
  }

  function visit(id: string) {
    if (visited.has(id)) {
      return;
    }
    if (visiting.has(id)) {
      warnings.push(`cycle detected while solving ${id}`);
      return;
    }

    visiting.add(id);
    const manifest = manifestMap.get(id);
    if (!manifest) {
      warnings.push(`missing manifest for ${id}`);
      visiting.delete(id);
      return;
    }

    for (const dependency of (dependencyMap.get(manifest.id) ?? []).filter((entry) => entry.class === "required")) {
      const dependencyId = dependency.packageId;
      if (!manifestMap.has(dependencyId)) {
        missingDependencies.push({
          packageId: manifest.id,
          dependencyId
        });
        warnings.push(`missing manifest for dependency ${dependencyId} required by ${manifest.id}`);
        continue;
      }
      visit(dependencyId);
    }

    if (manifest.trustTier === "unknown" && input.allowRestrictedPreviewForUnknownPlugins) {
      warnings.push(`restricted preview enabled for ${manifest.id}`);
    }

    orderedActivation.push(manifest.id);
    visiting.delete(id);
    visited.add(id);
  }

  for (const id of input.requested) {
    visit(id);
  }

  const recommendationSeen = new Set<string>();
  const suggestedPackSeen = new Set<string>();
  for (const id of input.requested) {
    const manifest = manifestMap.get(id);
    if (!manifest) {
      continue;
    }

    for (const dependency of dependencyMap.get(id) ?? []) {
      if (dependency.class === "required") {
        continue;
      }

      const recommendation: InstallRecommendation = {
        packageId: id,
        dependencyId: dependency.packageId,
        class: dependency.class,
        present: manifestMap.has(dependency.packageId),
        rationale: dependency.rationale
      };
      const key = `${recommendation.packageId}:${recommendation.class}:${recommendation.dependencyId}`;
      if (recommendationSeen.has(key)) {
        continue;
      }
      recommendationSeen.add(key);

      if (recommendation.class === "optional") {
        optionalDependencies.push(recommendation);
      } else if (recommendation.class === "capability-enhancing") {
        capabilityEnhancingDependencies.push(recommendation);
      } else {
        integrationOnlyDependencies.push(recommendation);
      }
    }

    for (const packId of manifest.suggestedPacks ?? []) {
      const key = `${id}:${packId}`;
      if (suggestedPackSeen.has(key)) {
        continue;
      }
      suggestedPackSeen.add(key);
      suggestedPacks.push({
        packageId: id,
        packId
      });
    }
  }

  const unresolvedSubscriptions = input.manifests.flatMap((manifest) =>
    (manifest.subscribesTo ?? [])
      .filter((eventType) => !emittedEvents.has(eventType))
      .map((eventType) => ({
        packageId: manifest.id,
        eventType
      }))
  );

  const duplicateCommands = [...commandCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([command]) => command)
    .sort();

  return {
    orderedActivation,
    warnings,
    missingDependencies,
    unresolvedSubscriptions,
    duplicateCommands,
    optionalDependencies,
    capabilityEnhancingDependencies,
    integrationOnlyDependencies,
    suggestedPacks
  };
}
