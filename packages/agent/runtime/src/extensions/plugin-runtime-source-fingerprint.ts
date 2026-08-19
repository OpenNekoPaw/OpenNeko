import { createHash } from 'node:crypto';

import type {
  AgentExtensionCatalogSnapshot,
  AgentExtensionRuntimeDescriptor,
} from '@neko/agent-contracts';

export function createPluginRuntimeSourceFingerprint(
  snapshot: AgentExtensionCatalogSnapshot,
): string {
  const source = {
    packages: snapshot.records
      .filter((record) => record.enabled)
      .map((record) => ({ id: record.id, version: record.version }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    runtimeDescriptors: [...snapshot.runtimeDescriptors].sort((left, right) =>
      left.pluginId.localeCompare(right.pluginId),
    ),
  };
  return `sha256:${createHash('sha256').update(JSON.stringify(source)).digest('hex')}`;
}

export function createPluginRuntimeContributionFingerprint(
  snapshot: AgentExtensionCatalogSnapshot,
  descriptor: AgentExtensionRuntimeDescriptor,
): string {
  return createPluginRuntimeSourceFingerprint({
    records: snapshot.records.filter((candidate) => candidate.id === descriptor.pluginId),
    runtimeDescriptors: [
      {
        ...descriptor,
        mcpServerIds: [...descriptor.mcpServerIds].sort(),
        appIds: [...descriptor.appIds].sort(),
      },
    ],
    diagnostics: [],
  });
}
