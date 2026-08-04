import { beforeEach, describe, expect, it } from 'vitest';
import {
  ProjectEntityAssetUpdateService,
  type ProjectEntityAssetSnapshot,
  type ProjectEntityDocument,
  type ProjectEntityOperationCommitRequest,
} from '../index';

describe('ProjectEntityAssetUpdateService', () => {
  let harness: UpdateHarness;

  beforeEach(() => {
    harness = new UpdateHarness();
  });

  it('projects update availability and a three-way semantic diff', async () => {
    const result = await harness.service.inspect({
      entityId: 'character-rin',
      available: AVAILABLE_REF,
    });

    expect(result.availability.status).toBe('update-available');
    expect(result.diff.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'kind', status: 'conflict' }),
        expect.objectContaining({ field: 'names.canonical', status: 'applicable' }),
        expect.objectContaining({ field: 'facts/role', status: 'conflict' }),
        expect.objectContaining({ field: 'facts/local-note', status: 'local-only' }),
        expect.objectContaining({ field: 'facts/already', status: 'already-applied' }),
        expect.objectContaining({ field: 'representations', status: 'applicable' }),
      ]),
    );
  });

  it('applies selected changes, preserves explicit current conflicts, and advances the import base', async () => {
    const updated = await harness.service.apply({
      entityId: 'character-rin',
      available: AVAILABLE_REF,
      expectedRevision: 3,
      selected: ['names.canonical', 'representations'],
      conflicts: [
        { field: 'kind', resolution: 'current' },
        { field: 'facts/role', resolution: 'incoming' },
      ],
      updatedAt: UPDATED_AT,
    });

    expect(updated.kind).toBe('character');
    expect(updated.names.canonical).toBe('Rin v2');
    expect(updated.facts).toMatchObject({ role: 'lead', 'local-note': 'kept' });
    expect(updated.representations.map((binding) => binding.bindingId)).toEqual([
      'project-binding-rin',
      'character-rin:asset-binding-extra',
    ]);
    expect(updated.provenance).toEqual({
      origin: ORIGIN_REF,
      applied: AVAILABLE_REF,
      importBase: AVAILABLE.semantic,
      representationOrigins: [
        { assetBindingId: 'asset-binding-rin', projectBindingId: 'project-binding-rin' },
        {
          assetBindingId: 'asset-binding-extra',
          projectBindingId: 'character-rin:asset-binding-extra',
        },
      ],
    });
    expect(harness.document.revision).toBe(4);
  });

  it('requires every conflict resolution and rejects incoming kind changes', async () => {
    await expect(
      harness.service.apply({
        entityId: 'character-rin',
        available: AVAILABLE_REF,
        expectedRevision: 3,
        selected: [],
        conflicts: [{ field: 'facts/role', resolution: 'current' }],
        updatedAt: UPDATED_AT,
      }),
    ).rejects.toMatchObject({ diagnostics: [{ code: 'project-entity-operation-invalid' }] });
    await expect(
      harness.service.apply({
        entityId: 'character-rin',
        available: AVAILABLE_REF,
        expectedRevision: 3,
        selected: [],
        conflicts: [
          { field: 'kind', resolution: 'incoming' },
          { field: 'facts/role', resolution: 'current' },
        ],
        updatedAt: UPDATED_AT,
      }),
    ).rejects.toMatchObject({ diagnostics: [{ code: 'project-entity-operation-invalid' }] });
    expect(harness.commits).toHaveLength(0);
  });

  it('rejects foreign, unavailable, and stale update inputs before commit', async () => {
    await expect(
      harness.service.inspect({
        entityId: 'character-rin',
        available: { ...AVAILABLE_REF, assetId: 'asset-other' },
      }),
    ).rejects.toMatchObject({ diagnostics: [{ code: 'invalid-project-entity-asset-provenance' }] });
    harness.available = null;
    await expect(
      harness.service.inspect({ entityId: 'character-rin', available: AVAILABLE_REF }),
    ).rejects.toMatchObject({ diagnostics: [{ code: 'project-entity-asset-not-found' }] });
    harness.available = AVAILABLE;
    await expect(
      harness.service.apply({
        entityId: 'character-rin',
        available: AVAILABLE_REF,
        expectedRevision: 2,
        selected: [],
        conflicts: [],
        updatedAt: UPDATED_AT,
      }),
    ).rejects.toMatchObject({ diagnostics: [{ code: 'project-entity-revision-conflict' }] });
    expect(harness.commits).toHaveLength(0);
  });
});

class UpdateHarness {
  document: ProjectEntityDocument = DOCUMENT;
  available: ProjectEntityAssetSnapshot | null = AVAILABLE;
  readonly commits: ProjectEntityOperationCommitRequest[] = [];
  readonly service = new ProjectEntityAssetUpdateService({
    repository: {
      load: async () => this.document,
      commit: async () => {
        throw new Error('Entity Asset update must use the canonical operation commit port.');
      },
    },
    assets: { readExact: async () => this.available },
    commits: {
      commit: async (request) => {
        this.commits.push(request);
        this.document = request.next;
        return this.document;
      },
    },
    createBindingId: (entityId, assetBindingId) => `${entityId}:${assetBindingId}`,
  });
}

const ORIGIN_REF = {
  assetId: 'entity-asset-rin',
  revision: '1',
  digest: 'a'.repeat(64),
};
const APPLIED_REF = {
  assetId: 'entity-asset-rin',
  revision: '2',
  digest: 'b'.repeat(64),
};
const AVAILABLE_REF = {
  assetId: 'entity-asset-rin',
  revision: '3',
  digest: 'c'.repeat(64),
};
const BASE = {
  kind: 'character' as const,
  names: { canonical: 'Rin', aliases: [] },
  facts: { role: 'support', 'local-note': 'base', already: 'base', skipped: 'old' },
  representations: [assetBinding('asset-binding-rin', 'portrait-v1.png')],
};
const AVAILABLE: ProjectEntityAssetSnapshot = {
  revision: AVAILABLE_REF,
  semantic: {
    kind: 'scene',
    names: { canonical: 'Rin v2', aliases: [] },
    facts: { role: 'lead', 'local-note': 'base', already: 'new', skipped: 'new' },
    representations: [
      assetBinding('asset-binding-rin', 'portrait-v2.png'),
      assetBinding('asset-binding-extra', 'reference.png'),
    ],
  },
};
const DOCUMENT: ProjectEntityDocument = {
  schemaVersion: 1,
  projectId: 'project-neko',
  revision: 3,
  entities: [
    {
      entityId: 'character-rin',
      kind: 'character',
      names: { canonical: 'Rin', aliases: [] },
      facts: { role: 'local-lead', 'local-note': 'kept', already: 'new', skipped: 'old' },
      representations: [projectBinding('project-binding-rin', 'portrait-v1.png')],
      lifecycle: { state: 'active' },
      provenance: {
        origin: ORIGIN_REF,
        applied: APPLIED_REF,
        importBase: BASE,
        representationOrigins: [
          { assetBindingId: 'asset-binding-rin', projectBindingId: 'project-binding-rin' },
        ],
      },
      createdAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-05T00:00:00.000Z',
    },
  ],
};

function assetBinding(bindingId: string, resourcePath: string) {
  return {
    bindingId,
    role: 'portrait' as const,
    target: {
      kind: 'package-resource' as const,
      packageId: 'entity-asset-rin',
      revision: 'asset-snapshot',
      digest: 'd'.repeat(64),
      resourcePath,
    },
    source: 'import' as const,
    acceptedAt: '2026-08-04T00:00:00.000Z',
  };
}

function projectBinding(bindingId: string, resourcePath: string) {
  return { ...assetBinding(bindingId, resourcePath), source: 'import' as const };
}

const UPDATED_AT = '2026-08-05T02:00:00.000Z';
