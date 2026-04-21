export type SolvableManifest = {
  id: string;
  dependsOn?: string[] | undefined;
  trustTier?: string | undefined;
  commands?: string[] | undefined;
  emits?: string[] | undefined;
  subscribesTo?: string[] | undefined;
  [key: string]: unknown;
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
};

export function solvePackageGraph(input: {
  requested: string[];
  manifests: SolvableManifest[];
  platformVersion?: string | undefined;
  runtimeVersion?: string | undefined;
  dbEngine?: string | undefined;
  allowRestrictedPreviewForUnknownPlugins?: boolean | undefined;
}): SolvePackageGraphResult {
  const manifestMap = new Map(input.manifests.map((manifest) => [manifest.id, manifest]));
  const orderedActivation: string[] = [];
  const warnings: string[] = [];
  const missingDependencies: Array<{ packageId: string; dependencyId: string }> = [];
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

    for (const dependency of manifest.dependsOn ?? []) {
      if (!manifestMap.has(dependency)) {
        missingDependencies.push({
          packageId: manifest.id,
          dependencyId: dependency
        });
        warnings.push(`missing manifest for dependency ${dependency} required by ${manifest.id}`);
        continue;
      }
      visit(dependency);
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
    duplicateCommands
  };
}
