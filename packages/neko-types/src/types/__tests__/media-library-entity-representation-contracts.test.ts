import { describe, expect, it } from 'vitest';

import {
  assertEntityRepresentationBindingFile,
  createEmptyEntityRepresentationBindingFile,
  decodeEntityRepresentationBindingFile,
  encodeEntityRepresentationBindingFile,
  isEntityRepresentationBinding,
  isEntityRepresentationBindingFile,
  isMediaLibraryProjectionEntry,
  type EntityRepresentationBinding,
  type MediaLibraryProjectionEntry,
} from '../index';

const representations = [
  {
    kind: 'workspace-file',
    path: 'neko/assets/Characters/alice.png',
    fingerprint: { strategy: 'sha256', value: 'sha256:alice' },
  },
  {
    kind: 'document-entry',
    source: { kind: 'workspace-file', path: 'neko/assets/Books/comic.epub' },
    entryPath: 'OPS/images/page-1.jpg',
  },
  {
    kind: 'generated-output',
    outputId: 'generated-alice',
    revision: 'revision-1',
    digest: 'sha256:generated-alice',
    path: 'neko/generated/images/alice.png',
  },
  {
    kind: 'package-resource',
    packageId: 'live2d-alice',
    revision: 'revision-1',
    resourcePath: 'model/alice.model3.json',
    digest: 'sha256:live2d-alice',
    manifestPath: 'neko/packages/live2d-alice/manifest.json',
  },
] as const;

const mediaEntry: MediaLibraryProjectionEntry = {
  locator: representations[0],
  label: 'alice.png',
  availability: 'available',
  capabilities: ['read', 'preview', 'bind'],
  metadata: { mediaType: 'image/png', byteLength: 1024, width: 512, height: 512 },
};

const binding: EntityRepresentationBinding = {
  id: 'binding-alice-portrait',
  entityId: 'char_alice',
  entityKind: 'character',
  representation: representations[0],
  role: 'portrait',
  isDefault: true,
  status: 'confirmed',
  availability: 'active',
  source: 'user',
  confidence: 1,
  updatedAt: '2026-07-21T00:00:00.000Z',
};

describe('Media Library projection contract', () => {
  it('accepts all four canonical locator branches without catalog membership', () => {
    for (const locator of representations) {
      expect(
        isMediaLibraryProjectionEntry({
          ...mediaEntry,
          locator,
        }),
      ).toBe(true);
    }
  });

  it('rejects legacy identity, routing, cache, runtime, and physical-path fields', () => {
    const poisonedEntries: readonly unknown[] = [
      { ...mediaEntry, assetId: 'asset-alice' },
      { ...mediaEntry, sourceKind: 'linked-local' },
      { ...mediaEntry, cachePath: '.neko/.cache/alice.png' },
      { ...mediaEntry, runtimeToken: 'engine-token' },
      { ...mediaEntry, linkTarget: '/Users/private/Characters' },
      {
        ...mediaEntry,
        locator: { ...representations[0], localPath: '/Users/private/Characters/alice.png' },
      },
      { ...mediaEntry, locator: { kind: 'workspace-file', path: 'project://assets/alice' } },
      {
        ...mediaEntry,
        locator: { kind: 'resource-ref', uri: 'project://assets/alice', cacheKey: 'legacy' },
      },
    ];

    expect(poisonedEntries.map(isMediaLibraryProjectionEntry)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it('requires safe diagnostics only for unavailable entries', () => {
    expect(
      isMediaLibraryProjectionEntry({
        ...mediaEntry,
        availability: 'unavailable',
        diagnostic: { code: 'resource-missing' },
        capabilities: [],
      }),
    ).toBe(true);
    expect(
      isMediaLibraryProjectionEntry({
        ...mediaEntry,
        diagnostic: { code: 'resource-missing' },
      }),
    ).toBe(false);
    expect(
      isMediaLibraryProjectionEntry({
        ...mediaEntry,
        availability: 'unavailable',
        diagnostic: { code: 'resource-missing', localPath: '/Users/private/alice.png' },
      }),
    ).toBe(false);
  });
});

describe('Creative Entity representation binding contract', () => {
  it('accepts all four direct representation targets', () => {
    for (const representation of representations) {
      expect(isEntityRepresentationBinding({ ...binding, representation })).toBe(true);
    }
  });

  it('rejects legacy identity, dual refs, ResourceRef, routing, and internal storage fields', () => {
    const poisonedBindings: readonly unknown[] = [
      { ...binding, assetRef: 'project://assets/alice' },
      { ...binding, assetEntityId: 'asset-alice' },
      { ...binding, resourceRef: { uri: 'project://assets/alice' } },
      { ...binding, cachePath: '.neko/.cache/alice.png' },
      { ...binding, runtimeToken: 'webview-token' },
      { ...binding, linkTarget: '/Users/private/Characters/alice.png' },
      { ...binding, sourceKind: 'generated' },
      { ...binding, representation: 'project://assets/alice' },
      {
        ...binding,
        representation: { ...representations[0], cacheKey: 'thumbnail:alice' },
      },
      { ...binding, role: 'puppet-bone' },
      { ...binding, source: 'generated' },
    ];

    expect(poisonedBindings.map(isEntityRepresentationBinding)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it('enforces v2 persistence and visible orphan/default state', () => {
    expect(isEntityRepresentationBindingFile({ version: 2, bindings: [binding] })).toBe(true);
    expect(isEntityRepresentationBindingFile({ version: 1, bindings: [binding] })).toBe(false);
    expect(
      isEntityRepresentationBinding({
        ...binding,
        isDefault: false,
        availability: 'orphaned',
        orphanedAt: '2026-07-21T01:00:00.000Z',
      }),
    ).toBe(true);
    expect(
      isEntityRepresentationBinding({
        ...binding,
        isDefault: false,
        availability: 'orphaned',
      }),
    ).toBe(false);
    expect(
      isEntityRepresentationBinding({
        ...binding,
        status: 'suggested',
      }),
    ).toBe(false);
  });

  it('decodes only canonical v2 files and fails closed for legacy or unknown versions', () => {
    const file = { version: 2 as const, bindings: [binding] };
    expect(decodeEntityRepresentationBindingFile(file)).toMatchObject({ ok: true });
    expect(decodeEntityRepresentationBindingFile({ version: 1, bindings: [] })).toEqual({
      ok: false,
      code: 'legacy-version',
      message: 'Legacy Entity Asset bindings require explicit inspection and migration.',
    });
    expect(decodeEntityRepresentationBindingFile({ version: 3, bindings: [] })).toMatchObject({
      ok: false,
      code: 'unsupported-version',
    });
    expect(() => assertEntityRepresentationBindingFile({ version: 1, bindings: [] })).toThrow(
      'explicit inspection and migration',
    );
    expect(createEmptyEntityRepresentationBindingFile()).toEqual({ version: 2, bindings: [] });
    expect(JSON.parse(encodeEntityRepresentationBindingFile(file))).toEqual(file);
  });
});

// Compile-time poison fixtures complement runtime validation for literal producers.
const compileTimeMediaEntry: MediaLibraryProjectionEntry = {
  ...mediaEntry,
  // @ts-expect-error Media Library projections cannot carry catalog identity.
  assetId: 'asset-alice',
};

const compileTimeBinding: EntityRepresentationBinding = {
  ...binding,
  // @ts-expect-error Direct representation bindings cannot carry a legacy assetRef.
  assetRef: 'project://assets/alice',
};

void compileTimeMediaEntry;
void compileTimeBinding;
