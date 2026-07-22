import { describe, expect, it } from 'vitest';

import {
  createSafeLegacyAssetMigrationDiagnostic,
  isLegacyAssetCatalogInspection,
  isLegacyAssetCatalogMigrationPlan,
  type LegacyAssetCatalogInspection,
  type LegacyAssetCatalogMigrationPlan,
} from '../legacy-asset-catalog-migration';

const sources = [
  {
    kind: 'project-file',
    sourceId: 'asset-catalog',
    role: 'asset-catalog',
    workspacePath: 'neko/assets/library.json',
    digest: 'sha256:catalog',
    byteLength: 2048,
    schemaVersion: '1',
  },
  {
    kind: 'local-projection',
    sourceId: 'asset-search',
    partition: 'asset-library',
    revision: 'revision-1',
    digest: 'sha256:search',
    recordCount: 12,
  },
] as const;

const precondition = {
  projectRevision: 'revision-1',
  sources: sources.map((source) => ({ sourceId: source.sourceId, digest: source.digest })),
} as const;

const inspection: LegacyAssetCatalogInspection = {
  version: 1,
  inspectionId: 'inspection-1',
  inspectedAt: '2026-07-21T00:00:00.000Z',
  status: 'ready',
  precondition,
  sources,
  legacyRecordCount: 8,
  diagnostics: [],
};

const plan: LegacyAssetCatalogMigrationPlan = {
  version: 1,
  planId: 'plan-1',
  inspectionId: inspection.inspectionId,
  createdAt: '2026-07-21T00:01:00.000Z',
  status: 'confirmation-required',
  precondition,
  archive: {
    status: 'planned',
    archiveId: 'archive-1',
    digest: 'sha256:archive',
    byteLength: 4096,
    workspacePath: 'neko/migrations/asset-catalog/sha256-archive.json',
    sources: precondition.sources,
  },
  classifications: [
    {
      kind: 'representation-reference',
      itemId: 'item-representation',
      sourceId: 'asset-catalog',
      fieldPath: ['entities', 0, 'files', 0, 'path'],
      target: {
        kind: 'workspace-file',
        path: 'neko/assets/Characters/alice.png',
        fingerprint: { strategy: 'sha256', value: 'sha256:alice' },
      },
    },
    {
      kind: 'existing-entity-association',
      itemId: 'item-existing-entity',
      sourceId: 'asset-catalog',
      fieldPath: ['entities', 0, 'metadata', 'characterId'],
      entityId: 'char_alice',
      entityKind: 'character',
      role: 'portrait',
    },
    {
      kind: 'entity-proposal',
      itemId: 'item-entity-proposal',
      sourceId: 'asset-catalog',
      fieldPath: ['entities', 1, 'name'],
      proposalId: 'proposal-1',
      entityKind: 'character',
      suggestedName: 'Alice',
      requiresConfirmation: true,
    },
    {
      kind: 'owner-provenance',
      itemId: 'item-owner-provenance',
      sourceId: 'asset-catalog',
      fieldPath: ['entities', 0, 'provenance'],
      owner: 'generated-output',
      ownerId: 'generated-alice',
      valueDigest: 'sha256:provenance',
    },
    {
      kind: 'rebuildable-projection',
      itemId: 'item-projection',
      sourceId: 'asset-search',
      fieldPath: ['records'],
      projection: 'media-library-search',
    },
    {
      kind: 'unresolved',
      itemId: 'item-unresolved',
      sourceId: 'asset-catalog',
      fieldPath: ['entities', 0, 'metadata', 'license'],
      unresolvedId: 'unresolved-license',
    },
  ],
  unresolvedFields: [
    {
      unresolvedId: 'unresolved-license',
      sourceId: 'asset-catalog',
      fieldPath: ['entities', 0, 'metadata', 'license'],
      valueDigest: 'sha256:license',
      reason: 'unsupported-field',
      disposition: 'confirmation-required',
    },
  ],
  outputs: [
    {
      kind: 'write-project-file',
      workspacePath: 'neko/entity-representation-bindings.json',
      expectedCurrentDigest: null,
      digest: 'sha256:bindings-v2',
    },
    {
      kind: 'remove-legacy-file',
      workspacePath: 'neko/assets/library.json',
      expectedDigest: 'sha256:catalog',
    },
    { kind: 'rebuild-projection', projection: 'media-library-search' },
  ],
  confirmationIds: ['proposal-1', 'unresolved-license'],
  diagnostics: [
    createSafeLegacyAssetMigrationDiagnostic('confirmation-required', {
      sourceId: 'asset-catalog',
    }),
  ],
};

describe('legacy Asset catalog migration contracts', () => {
  it('accepts versioned inspection metadata with matching revision preconditions', () => {
    expect(isLegacyAssetCatalogInspection(inspection)).toBe(true);
  });

  it('accepts explicit classifications, archive intent, unresolved fields, and outputs', () => {
    expect(isLegacyAssetCatalogMigrationPlan(plan)).toBe(true);
  });

  it('rejects physical, cache, runtime, and legacy resolver values', () => {
    const poisoned: readonly unknown[] = [
      {
        ...inspection,
        sources: [{ ...sources[0], workspacePath: '/Users/private/neko/assets/library.json' }],
      },
      {
        ...plan,
        archive: { ...plan.archive, workspacePath: '/Users/private/archive.json' },
      },
      {
        ...plan,
        archive: { ...plan.archive, physicalPath: '/Users/private/archive.json' },
      },
      {
        ...plan,
        classifications: [
          {
            ...plan.classifications[0],
            target: 'project://assets/asset-alice',
          },
        ],
      },
      {
        ...plan,
        classifications: [
          {
            ...plan.classifications[0],
            target: {
              kind: 'workspace-file',
              path: 'neko/assets/Characters/alice.png',
              localPath: '/Users/private/alice.png',
            },
          },
        ],
      },
      { ...plan, runtimeToken: 'migration-runtime-token' },
      { ...plan, cachePath: '.neko/.cache/migration-plan.json' },
    ];

    expect(poisoned.map(isLegacyAssetCatalogMigrationPlan)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it('rejects mismatched source digests and unsafe diagnostics', () => {
    expect(
      isLegacyAssetCatalogInspection({
        ...inspection,
        precondition: {
          ...precondition,
          sources: [{ sourceId: 'asset-catalog', digest: 'sha256:changed' }],
        },
      }),
    ).toBe(false);

    expect(
      isLegacyAssetCatalogInspection({
        ...inspection,
        status: 'blocked',
        diagnostics: [
          {
            ...createSafeLegacyAssetMigrationDiagnostic('source-missing'),
            message: 'Missing /Users/private/neko/assets/library.json',
          },
        ],
      }),
    ).toBe(false);
  });

  it('requires verified archive evidence to use the verified state', () => {
    expect(
      isLegacyAssetCatalogMigrationPlan({
        ...plan,
        archive: { ...plan.archive, status: 'verified' },
      }),
    ).toBe(false);
    expect(
      isLegacyAssetCatalogMigrationPlan({
        ...plan,
        archive: {
          ...plan.archive,
          status: 'verified',
          verifiedAt: '2026-07-21T00:02:00.000Z',
        },
      }),
    ).toBe(true);
  });
});
