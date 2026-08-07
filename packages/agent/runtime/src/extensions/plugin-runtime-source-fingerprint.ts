import { createHash } from 'node:crypto';

import type { AgentExtensionCatalogSnapshot } from '@neko/agent-contracts';

export function createPluginRuntimeSourceFingerprint(
  snapshot: AgentExtensionCatalogSnapshot,
): string {
  const source = {
    packages: snapshot.records
      .filter((record) => record.installed && record.enabled)
      .map((record) => ({ id: record.id, version: record.version }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    runtimeDescriptors: [...snapshot.runtimeDescriptors].sort((left, right) =>
      left.pluginId.localeCompare(right.pluginId),
    ),
  };
  return `sha256:${createHash('sha256').update(JSON.stringify(source)).digest('hex')}`;
}
