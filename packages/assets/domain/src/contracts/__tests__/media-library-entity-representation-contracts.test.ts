import { describe, expect, it } from 'vitest';

import {
  isMediaLibraryProjectionEntry,
  type MediaLibraryProjectionEntry,
} from '../media-library-projection';
import {
  assertEntityRepresentationBindingFile,
  createEmptyEntityRepresentationBindingFile,
  decodeEntityRepresentationBindingFile,
  encodeEntityRepresentationBindingFile,
  isEntityRepresentationBinding,
  isEntityRepresentationBindingFile,
  type EntityRepresentationBinding,
} from '@neko/entity-domain';

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

  it('rejects unsupported fields', () => {
    expect(isEntityRepresentationBinding({ ...binding, unexpectedField: true })).toBe(false);
  });

  it('enforces strict persistence and visible orphan/default state', () => {
    expect(isEntityRepresentationBindingFile({ bindings: [binding] })).toBe(true);
    expect(isEntityRepresentationBindingFile({ unexpectedField: 1, bindings: [binding] })).toBe(
      false,
    );
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

  it('decodes only the canonical file and rejects unknown fields', () => {
    const file = { bindings: [binding] };
    expect(decodeEntityRepresentationBindingFile(file)).toMatchObject({ ok: true });
    expect(
      decodeEntityRepresentationBindingFile({ unexpectedField: 1, bindings: [] }),
    ).toMatchObject({
      ok: false,
      code: 'invalid-file',
    });
    expect(() =>
      assertEntityRepresentationBindingFile({ unexpectedField: 1, bindings: [] }),
    ).toThrow('binding data is invalid');
    expect(createEmptyEntityRepresentationBindingFile()).toEqual({ bindings: [] });
    expect(JSON.parse(encodeEntityRepresentationBindingFile(file))).toEqual(file);
  });
});
