import { describe, expect, it } from 'vitest';

import {
  isMediaLibraryProjectionEntry,
  type MediaLibraryProjectionEntry,
} from '../media-library-projection';
import { decodeProjectEntityDocument, type ProjectEntityDocument } from '@neko/entity-domain';

const representations = [
  { file: { authority: 'workspace', path: 'neko/assets/Characters/alice.png' } },
  {
    file: { authority: 'workspace', path: 'references/comic.epub' },
    selector: { kind: 'entry', path: 'OPS/images/page-1.jpg' },
  },
  { file: { authority: 'workspace', path: 'neko/generated/images/alice.png' } },
  {
    file: {
      authority: 'package',
      packageId: 'live2d-alice',
      revision: 'revision-1',
      path: 'model/alice.model3.json',
    },
  },
] as const;

const mediaEntry: MediaLibraryProjectionEntry = {
  locator: representations[0],
  label: 'alice.png',
  availability: 'available',
  capabilities: ['read', 'preview', 'bind'],
  metadata: { mediaType: 'image/png', byteLength: 1024, width: 512, height: 512 },
};

describe('Media Library projection contract', () => {
  it('accepts canonical locator branches without catalog membership', () => {
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

describe('Project Entity accepted representation contract', () => {
  it('accepts direct canonical representation targets in the Entity document', () => {
    const document: ProjectEntityDocument = {
      projectId: 'project-alice',
      entities: [
        {
          entityId: 'char_alice',
          kind: 'character',
          names: { canonical: 'Alice', aliases: [] },
          lifecycle: { state: 'active' },
          representations: representations.map((target, index) => ({
            bindingId: `binding-alice-${String(index)}`,
            role: index === 0 ? 'portrait' : 'reference',
            target,
            source: 'user',
            acceptedAt: '2026-07-21T00:00:00.000Z',
          })),
          createdAt: '2026-07-21T00:00:00.000Z',
          updatedAt: '2026-07-21T00:00:00.000Z',
        },
      ],
    };

    expect(decodeProjectEntityDocument(document)).toEqual({
      ok: true,
      document,
      diagnostics: [],
    });
  });
});
