import { beforeEach, describe, expect, it } from 'vitest';
import {
  ProjectEntityAssetInstantiationService,
  type ProjectEntityAssetRevisionRef,
  type ProjectEntityAssetSnapshot,
  type ProjectEntityDocument,
  type ProjectEntityOperationCommitRequest,
} from '../index';

describe('ProjectEntityAssetInstantiationService', () => {
  let harness: InstantiationHarness;

  beforeEach(() => {
    harness = new InstantiationHarness();
  });

  it('instantiates the same immutable Asset twice as independent Project Entities', async () => {
    await expect(
      harness.service.instantiate({ asset: ASSET_REF, createdAt: NOW }),
    ).resolves.toMatchObject({ entityId: 'project-entity-1' });
    await expect(
      harness.service.instantiate({ asset: ASSET_REF, createdAt: LATER }),
    ).resolves.toMatchObject({ entityId: 'project-entity-2' });

    expect(harness.document.entities.map((entity) => entity.entityId)).toEqual([
      'project-entity-1',
      'project-entity-2',
    ]);
    expect(harness.document.entities[0]?.provenance).toEqual({
      origin: ASSET_REF,
      applied: ASSET_REF,
      importBase: SNAPSHOT.semantic,
      representationOrigins: [
        {
          assetBindingId: 'asset-binding-rin',
          projectBindingId: 'project-entity-1:asset-binding-rin',
        },
      ],
    });
    expect(harness.document.entities[0]?.provenance).not.toBe(
      harness.document.entities[1]?.provenance,
    );
    expect(harness.document.entities.map((entity) => entity.representations[0]?.bindingId)).toEqual(
      ['project-entity-1:asset-binding-rin', 'project-entity-2:asset-binding-rin'],
    );
    expect(harness.snapshot).toEqual(SNAPSHOT);
  });

  it('freezes the import base independently from later project edits', async () => {
    const instantiated = await harness.service.instantiate({
      asset: ASSET_REF,
      createdAt: NOW,
    });
    const edited = {
      ...instantiated,
      facts: { ...instantiated.facts, role: 'local-lead' },
      names: { ...instantiated.names, canonical: 'Local Rin' },
    };

    expect(edited.provenance?.importBase).toEqual(SNAPSHOT.semantic);
    expect(edited.provenance?.importBase.names.canonical).toBe('Rin');
    expect(edited.provenance?.importBase.facts).toEqual({ role: 'support' });
  });

  it('rejects unavailable or mismatched managed Asset revisions', async () => {
    harness.snapshot = null;
    await expect(
      harness.service.instantiate({ asset: ASSET_REF, createdAt: NOW }),
    ).rejects.toMatchObject({ diagnostics: [{ code: 'project-entity-asset-not-found' }] });

    harness.snapshot = {
      ...SNAPSHOT,
      revision: { ...ASSET_REF, revision: '3' },
    };
    await expect(
      harness.service.instantiate({ asset: ASSET_REF, createdAt: NOW }),
    ).rejects.toMatchObject({ diagnostics: [{ code: 'invalid-project-entity-asset-snapshot' }] });
    expect(harness.commits).toHaveLength(0);
  });

  it('rejects Asset identity reuse and duplicate generated Project Entity IDs', async () => {
    harness.ids = [ASSET_REF.assetId];
    await expect(
      harness.service.instantiate({ asset: ASSET_REF, createdAt: NOW }),
    ).rejects.toMatchObject({ diagnostics: [{ code: 'project-entity-operation-invalid' }] });

    harness.document = {
      ...harness.document,
      entities: [
        {
          entityId: 'project-entity-1',
          ...SNAPSHOT.semantic,
          lifecycle: { state: 'active' },
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    };
    harness.ids = ['project-entity-1'];
    await expect(
      harness.service.instantiate({ asset: ASSET_REF, createdAt: NOW }),
    ).rejects.toMatchObject({ diagnostics: [{ code: 'project-entity-operation-invalid' }] });
  });
});

class InstantiationHarness {
  document: ProjectEntityDocument = {
    projectId: 'project-neko',
    entities: [],
  };
  snapshot: ProjectEntityAssetSnapshot | null = structuredClone(SNAPSHOT);
  ids = ['project-entity-1', 'project-entity-2'];
  readonly commits: ProjectEntityOperationCommitRequest[] = [];

  readonly service = new ProjectEntityAssetInstantiationService({
    assets: {
      readExact: async () => this.snapshot,
    },
    commits: {
      commit: async (mutation) => {
        const request = await mutation(this.document);
        this.commits.push(request);
        this.document = request.next;
        return this.document;
      },
    },
    createEntityId: () => this.ids.shift() ?? 'project-entity-exhausted',
    createBindingId: (entityId, assetBindingId) => `${entityId}:${assetBindingId}`,
  });
}

const ASSET_REF: ProjectEntityAssetRevisionRef = {
  assetId: 'entity-asset-rin',
  revision: '2',
  digest: 'a'.repeat(64),
};
const SNAPSHOT: ProjectEntityAssetSnapshot = {
  revision: ASSET_REF,
  semantic: {
    kind: 'character',
    names: { canonical: 'Rin', aliases: ['Rin-chan'] },
    facts: { role: 'support' },
    representations: [
      {
        bindingId: 'asset-binding-rin',
        role: 'portrait',
        target: {
          kind: 'package-resource',
          packageId: ASSET_REF.assetId,
          revision: ASSET_REF.revision,
          digest: ASSET_REF.digest,
          resourcePath: 'portrait.png',
        },
        source: 'import',
        acceptedAt: '2026-08-04T00:00:00.000Z',
      },
    ],
  },
};
const NOW = '2026-08-05T00:00:00.000Z';
const LATER = '2026-08-05T01:00:00.000Z';
