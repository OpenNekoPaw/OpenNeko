import { describe, expect, it } from 'vitest';

import { classifyLegacyAssetCatalog } from '../legacy-asset-catalog-classifier';
import {
  inspectLegacyAssetCatalog,
  type LegacyAssetInspectionReader,
} from '../legacy-asset-catalog-inspector';

describe('legacy Asset catalog classifier', () => {
  it('classifies direct, generated, document, package, entity, projection, and unresolved values', async () => {
    const session = await inspectLegacyAssetCatalog({
      projectRevision: 'revision-1',
      inspectedAt: '2026-07-21T01:00:00.000Z',
      reader: new MapReader(
        new Map([
          ['neko/assets/library.json', jsonBytes(catalog())],
          [
            'neko/entity-bindings.json',
            jsonBytes({
              version: 1,
              bindings: [
                { id: 'binding-alice', assetRef: 'project://assets/asset-alice' },
                { id: 'binding-bob', assetRef: 'project://assets/asset-bob' },
                { id: 'binding-package', assetRef: 'project://assets/asset-package' },
                { id: 'binding-missing', assetRef: 'project://assets/asset-missing' },
              ],
            }),
          ],
          ['boards/main.nkc', jsonBytes({ nodes: [{ source: 'project://assets/asset-alice' }] })],
        ]),
      ),
      files: [
        {
          sourceId: 'asset-catalog',
          role: 'asset-catalog',
          workspacePath: 'neko/assets/library.json',
          required: true,
        },
        {
          sourceId: 'entity-bindings',
          role: 'entity-bindings',
          workspacePath: 'neko/entity-bindings.json',
          required: true,
        },
        {
          sourceId: 'canvas-main',
          role: 'canvas-document',
          workspacePath: 'boards/main.nkc',
        },
      ],
      searchProjection: {
        sourceId: 'asset-search',
        revision: 'search-revision-1',
        records: [{ id: 'search-asset-alice' }],
      },
    });

    const result = classifyLegacyAssetCatalog({
      session,
      existingEntities: [
        { entityId: 'char_alice', entityKind: 'character' },
        { entityId: 'char_bob', entityKind: 'character' },
      ],
      knownPackages: [
        {
          legacyAssetId: 'asset-package',
          target: {
            kind: 'package-resource',
            packageId: 'motion-pack',
            revision: 'revision-1',
            resourcePath: 'motions/wave.motion3.json',
            manifestPath: 'neko/packages/motion-pack/manifest.json',
          },
        },
      ],
    });

    expect(result.classifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'existing-entity-association',
          entityId: 'char_alice',
          entityKind: 'character',
        }),
        expect.objectContaining({
          kind: 'entity-proposal',
          entityKind: 'character',
          suggestedName: 'Bob',
          requiresConfirmation: true,
        }),
        expect.objectContaining({
          kind: 'owner-provenance',
          owner: 'generated-output',
          ownerId: 'candidate-bob',
        }),
        expect.objectContaining({
          kind: 'owner-provenance',
          owner: 'package',
          ownerId: 'motion-pack',
        }),
        expect.objectContaining({
          kind: 'rebuildable-projection',
          sourceId: 'asset-search',
          projection: 'media-library-search',
        }),
      ]),
    );

    const targets = result.classifications
      .filter((item) => item.kind === 'representation-reference')
      .map((item) => item.target.kind);
    expect(targets).toEqual(
      expect.arrayContaining([
        'workspace-file',
        'generated-output',
        'document-entry',
        'package-resource',
      ]),
    );
    expect(result.unresolvedFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: 'unsupported-field', disposition: 'archive-only' }),
        expect.objectContaining({
          sourceId: 'asset-catalog',
          reason: 'ambiguous-identity',
          disposition: 'confirmation-required',
        }),
        expect.objectContaining({
          sourceId: 'entity-bindings',
          reason: 'missing-resource',
          disposition: 'confirmation-required',
        }),
      ]),
    );
    expect(result.confirmationIds.length).toBeGreaterThanOrEqual(3);

    const bobAssociation = result.classifications.find(
      (item) => item.kind === 'existing-entity-association' && item.entityId === 'char_bob',
    );
    expect(bobAssociation).toBeUndefined();
  });

  it('does not choose among multiple ordinary files without one explicit default/main target', async () => {
    const data = catalog();
    const ambiguous = data.entities.find((entity) => entity.id === 'asset-environment');
    expect(ambiguous).toBeDefined();
    const session = await inspectLegacyAssetCatalog({
      projectRevision: 'revision-1',
      inspectedAt: '2026-07-21T01:00:00.000Z',
      reader: new MapReader(
        new Map([
          ['neko/assets/library.json', jsonBytes(data)],
          ['boards/main.nkc', jsonBytes({ source: 'project://assets/asset-environment' })],
        ]),
      ),
      files: [
        {
          sourceId: 'asset-catalog',
          role: 'asset-catalog',
          workspacePath: 'neko/assets/library.json',
          required: true,
        },
        {
          sourceId: 'canvas-main',
          role: 'canvas-document',
          workspacePath: 'boards/main.nkc',
        },
      ],
    });

    const result = classifyLegacyAssetCatalog({ session });
    expect(result.classifications).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'representation-reference',
          sourceId: 'canvas-main',
        }),
      ]),
    );
    expect(result.unresolvedFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: 'canvas-main',
          reason: 'missing-resource',
          disposition: 'confirmation-required',
        }),
      ]),
    );
  });
});

class MapReader implements LegacyAssetInspectionReader {
  constructor(private readonly files: ReadonlyMap<string, Uint8Array>) {}

  async readWorkspaceFile(workspacePath: string): Promise<Uint8Array | undefined> {
    return this.files.get(workspacePath)?.slice();
  }
}

function catalog() {
  return {
    version: 1,
    entities: [
      {
        id: 'asset-alice',
        name: 'Alice',
        category: 'character',
        description: 'User-authored description',
        metadata: {
          character: { registryId: 'char_alice' },
          source: { type: 'manual', license: 'private-license' },
        },
        variants: [
          {
            id: 'variant-alice',
            files: [
              {
                id: 'file-alice',
                path: 'neko/assets/Characters/alice.png',
                purpose: 'main',
                metadata: { mimeType: 'image/png' },
              },
            ],
          },
        ],
      },
      {
        id: 'asset-bob',
        name: 'Bob',
        category: 'character',
        metadata: {
          source: {
            type: 'ai-generated',
            generated: {
              projectionId: 'projection-bob',
              candidateId: 'candidate-bob',
              taskId: 'task-bob',
              revision: 'revision-1',
              contentDigest: 'sha256:bob',
            },
          },
        },
        variants: [
          {
            id: 'variant-bob',
            files: [
              {
                id: 'file-bob',
                path: 'neko/generated/images/bob.png',
                purpose: 'main',
              },
            ],
          },
        ],
      },
      {
        id: 'asset-document-entry',
        name: 'Page',
        category: 'document',
        metadata: {},
        variants: [
          {
            id: 'variant-page',
            files: [
              {
                id: 'file-page',
                path: 'unused-legacy-path',
                purpose: 'main',
                characterAsset: {
                  storageMode: 'bundle-memory',
                  bundleLocator: {
                    bundlePath: 'neko/assets/Books/comic.epub',
                    entryPath: 'OPS/images/page-1.jpg',
                  },
                },
              },
            ],
          },
        ],
      },
      {
        id: 'asset-package',
        name: 'Wave Motion',
        category: 'audio',
        metadata: {},
        variants: [
          {
            id: 'variant-package',
            files: [{ id: 'file-package', path: 'legacy/package/path', purpose: 'main' }],
          },
        ],
      },
      {
        id: 'asset-environment',
        name: 'Street',
        category: 'environment',
        metadata: {},
        variants: [
          {
            id: 'variant-environment',
            files: [
              { id: 'file-day', path: 'neko/assets/Scenes/street-day.png' },
              { id: 'file-night', path: 'neko/assets/Scenes/street-night.png' },
            ],
          },
        ],
      },
    ],
  };
}

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}
