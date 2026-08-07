import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type {
  EntityAssetProjectionRecord,
  EntityAssetProjectionReplaceSourceRequest,
  EntityAssetProjectionRepository,
} from '@neko/entity-domain';
import { NodeProjectEntityInspectorRuntime } from './node-project-entity-inspector-runtime';
import { NodeProjectEntityRepository } from './node-project-entity-repository';

describe('NodeProjectEntityInspectorRuntime', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('confirms through the canonical repository and consumes every candidate source', async () => {
    const root = await createRoot(roots);
    const projections = new MemoryProjectionRepository([
      candidateRecord('source-story'),
      candidateRecord('source-notes'),
    ]);
    const runtime = createRuntime(root, projections);

    await runtime.execute(confirmIntent());

    const document = await repository(root).load();
    expect(document).toMatchObject({
      entities: [
        {
          entityId: 'entity-rin',
          names: { canonical: 'Rin' },
          facts: { role: 'lead' },
        },
      ],
    });
    await expect(
      projections.list({
        partition: partition(),
        candidateId: 'candidate-rin',
        kinds: ['entity-candidate'],
      }),
    ).resolves.toEqual({ records: [], diagnostics: [] });
    await expect(
      readFile(path.join(root, 'neko', 'entity-operation-journal.json'), 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('recovers a canonical commit when candidate projection mutation was interrupted', async () => {
    const root = await createRoot(roots);
    const projections = new MemoryProjectionRepository([candidateRecord('source-story')]);
    projections.failNextReplace = true;
    const runtime = createRuntime(root, projections);

    await expect(runtime.execute(confirmIntent())).rejects.toThrow('projection interruption');
    await expect(repository(root).load()).resolves.toMatchObject({
      entities: [{ entityId: 'entity-rin' }],
    });
    await expect(
      readFile(path.join(root, 'neko', 'entity-operation-journal.json'), 'utf8'),
    ).resolves.toContain('candidate-rin');

    await runtime.execute({
      type: 'edit',
      entityId: 'entity-rin',
      changes: { facts: { role: 'protagonist' } },
    });

    await expect(repository(root).load()).resolves.toMatchObject({
      entities: [{ facts: { role: 'protagonist' } }],
    });
    await expect(
      projections.list({
        partition: partition(),
        candidateId: 'candidate-rin',
        kinds: ['entity-candidate'],
      }),
    ).resolves.toEqual({ records: [], diagnostics: [] });
  });

  it('fails before a canonical commit when the candidate owner is absent', async () => {
    const root = await createRoot(roots);
    const runtime = createRuntime(root);

    await expect(runtime.execute(confirmIntent())).rejects.toMatchObject({
      diagnostics: [{ code: 'project-entity-candidate-not-found' }],
    });
    await expect(repository(root).load()).resolves.toMatchObject({ entities: [] });
  });

  it('fails visibly on a corrupt recovery journal before applying another operation', async () => {
    const root = await createRoot(roots);
    await mkdir(path.join(root, 'neko'), { recursive: true });
    await writeFile(path.join(root, 'neko', 'entity-operation-journal.json'), '{invalid', 'utf8');
    const runtime = createRuntime(root);

    await expect(
      runtime.execute({
        type: 'edit',
        entityId: 'entity-rin',
        changes: { facts: { role: 'lead' } },
      }),
    ).rejects.toMatchObject({
      diagnostics: [{ code: 'project-entity-io-failed' }],
    });
    await expect(repository(root).load()).resolves.toMatchObject({ entities: [] });
  });
});

class MemoryProjectionRepository implements Pick<
  EntityAssetProjectionRepository,
  'list' | 'replaceSource'
> {
  failNextReplace = false;
  private records: EntityAssetProjectionRecord[];

  constructor(records: readonly EntityAssetProjectionRecord[]) {
    this.records = [...records];
  }

  async list(query: Parameters<EntityAssetProjectionRepository['list']>[0]) {
    return {
      records: this.records.filter(
        (record) =>
          (!query.sourceId || record.sourceId === query.sourceId) &&
          (!query.candidateId || record.candidateId === query.candidateId) &&
          (!query.kinds || query.kinds.includes(record.kind)),
      ),
      diagnostics: [],
    };
  }

  async replaceSource(request: EntityAssetProjectionReplaceSourceRequest): Promise<void> {
    if (this.failNextReplace) {
      this.failNextReplace = false;
      throw new Error('projection interruption');
    }
    this.records = [
      ...this.records.filter((record) => record.sourceId !== request.sourceId),
      ...request.records,
    ];
  }
}

function createRuntime(root: string, projections?: MemoryProjectionRepository) {
  return new NodeProjectEntityInspectorRuntime({
    workspace: { workspaceId: 'project-neko', workspacePath: root },
    ...(projections ? { projections } : {}),
    now: () => NOW,
    createEntityId: () => 'entity-rin',
    createBindingId: () => 'binding-rin',
  });
}

function repository(root: string) {
  return new NodeProjectEntityRepository({ workspacePath: root, projectId: 'project-neko' });
}

function confirmIntent() {
  return {
    type: 'confirm' as const,
    candidateId: 'candidate-rin',
    accepted: {
      kind: 'character' as const,
      names: { canonical: 'Rin', aliases: [] },
      facts: { role: 'lead' },
    },
  };
}

function candidateRecord(sourceId: string): EntityAssetProjectionRecord {
  return {
    projectionId: `${sourceId}:candidate-rin`,
    kind: 'entity-candidate',
    sourceId,
    candidateId: 'candidate-rin',
    freshness: 'fresh',
    value: {
      candidateId: 'candidate-rin',
      kind: 'character',
      proposedNames: { canonical: 'Rin', aliases: [] },
      freshness: 'fresh',
      evidence: [{ evidenceId: `${sourceId}:rin`, owner: 'document', sourceId }],
    },
    updatedAt: NOW,
  };
}

function partition() {
  return {
    scope: 'workspace' as const,
    workspaceId: 'project-neko',
    domain: 'entity-asset-projection',
  };
}

async function createRoot(roots: string[]): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'openneko-entity-inspector-'));
  roots.push(root);
  return root;
}

const NOW = '2026-08-05T00:00:00.000Z';
