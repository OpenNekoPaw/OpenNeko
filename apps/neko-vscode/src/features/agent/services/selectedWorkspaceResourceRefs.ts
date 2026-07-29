import * as path from 'node:path';
import { createResourceFingerprint, createResourceRef, type ResourceRef } from '@neko/shared';
import type { AgentFileReference } from '@neko-agent/types';

export interface SelectedWorkspaceResourceRef {
  readonly id: string;
  readonly title: string;
  readonly resourceRef: ResourceRef;
}

export function createSelectedWorkspaceResourceRefs(
  workspaceRoot: string,
  references: readonly AgentFileReference[],
): readonly SelectedWorkspaceResourceRef[] {
  return references.flatMap((reference) => {
    const relativePath = normalizeSelectedWorkspacePath(workspaceRoot, reference.path);
    if (!relativePath) return [];
    return [
      {
        id: `selected-reference:${reference.id}`,
        title: reference.label,
        resourceRef: createResourceRef({
          scope: 'project',
          provider: 'workspace',
          kind:
            reference.mediaType === 'image' ||
            reference.mediaType === 'audio' ||
            reference.mediaType === 'video'
              ? 'media'
              : 'document',
          source: { kind: 'file', projectRelativePath: relativePath },
          locator: { kind: 'file', path: relativePath },
          fingerprint: createResourceFingerprint({ strategy: 'none', value: relativePath }),
        }),
      },
    ];
  });
}

function normalizeSelectedWorkspacePath(
  workspaceRoot: string,
  candidate: string,
): string | undefined {
  const absolutePath = path.isAbsolute(candidate)
    ? path.resolve(candidate)
    : path.resolve(workspaceRoot, candidate);
  const relativePath = path.relative(workspaceRoot, absolutePath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return undefined;
  }
  return relativePath.split(path.sep).join('/');
}
