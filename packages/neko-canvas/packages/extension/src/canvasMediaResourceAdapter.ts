import {
  validateDurableResourceRef,
  type DurableResourceRefDiagnostic,
  type ResourceRef,
  type StoryboardMediaRef,
} from '@neko/shared';

/**
 * Convert Canvas storyboard media lineage into canonical durable identity.
 * Canvas node/tool-result/story-source handles are projections, not provider media identity.
 */
export function toCanvasStableMediaResourceRef(ref: StoryboardMediaRef): ResourceRef {
  if (ref.locator.type !== 'asset' && ref.locator.type !== 'workspace-path') {
    throw new Error(
      `Storyboard media ref ${ref.refId} uses runtime/projection locator ${ref.locator.type}; a durable asset or workspace-path ref is required.`,
    );
  }

  if (ref.resourceRef) {
    assertDurableResourceRef(ref.resourceRef, ref.refId);
    return ref.resourceRef;
  }

  const resourceRef =
    ref.locator.type === 'asset'
      ? resourceRefFromAssetLocator(ref)
      : resourceRefFromWorkspacePath(ref);
  assertDurableResourceRef(resourceRef, ref.refId);
  return resourceRef;
}

function resourceRefFromAssetLocator(ref: StoryboardMediaRef): ResourceRef {
  if (ref.locator.type !== 'asset') {
    throw new Error(`Storyboard media ref ${ref.refId} is not an asset locator.`);
  }
  const version = ref.locator.assetVersion ?? 'unversioned';
  return {
    id: `storyboard-media:${ref.refId}`,
    scope: 'project',
    provider: 'neko-assets',
    kind: 'generated',
    source: {
      kind: 'generated-asset',
      generatedAssetId: ref.locator.assetId,
    },
    locator: {
      kind: 'generated-asset',
      assetId: ref.locator.assetId,
      ...(ref.locator.assetVersion ? { variantId: ref.locator.assetVersion } : {}),
    },
    fingerprint: {
      strategy: 'provider',
      value: `${ref.locator.assetId}:${version}`,
      providerId: 'neko-assets',
    },
  };
}

function resourceRefFromWorkspacePath(ref: StoryboardMediaRef): ResourceRef {
  if (ref.locator.type !== 'workspace-path') {
    throw new Error(`Storyboard media ref ${ref.refId} is not a workspace-path locator.`);
  }
  const path = ref.locator.path.trim();
  if (!isPortableWorkspacePath(path)) {
    throw new Error(
      `Storyboard media ref ${ref.refId} must use a project-relative or variable workspace path, not ${path}.`,
    );
  }
  return {
    id: `storyboard-media:${ref.refId}`,
    scope: 'project',
    provider: 'workspace',
    kind: 'media',
    source: path.startsWith('${')
      ? { kind: 'file', filePath: path }
      : { kind: 'file', projectRelativePath: path },
    locator: { kind: 'file', path },
    fingerprint: { strategy: 'none', value: ref.refId },
  };
}

function assertDurableResourceRef(resourceRef: ResourceRef, refId: string): void {
  const validation = validateDurableResourceRef(resourceRef);
  if (!validation.ok) {
    throw new Error(
      `Storyboard media ref ${refId} is not durable: ${validation.diagnostics
        .map((diagnostic: DurableResourceRefDiagnostic) => diagnostic.message)
        .join('; ')}`,
    );
  }
}

function isPortableWorkspacePath(path: string): boolean {
  if (!path || path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path)) return false;
  if (path === '..' || path.startsWith('../') || path.includes('/../')) return false;
  return !/(?:^|[\\/])(?:\.neko[\\/])?cache(?:[\\/]|$)/i.test(path);
}
