import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectSearchAdapter, ProjectSearchItem } from '@neko/shared';
import { commands } from '../../__mocks__/vscode';
import { createAgentProjectSearchAdapters } from '../agentProjectSearchAdapters';

vi.mock('vscode', async () => await import('../../__mocks__/vscode'));

const tempRoots: string[] = [];

describe('createAgentProjectSearchAdapters', () => {
  afterEach(async () => {
    vi.clearAllMocks();
    for (const root of tempRoots.splice(0)) {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps non-creative compatibility adapters unchanged', () => {
    const storyAdapter = createCompatibilityStoryAdapter();
    const adapters = createAgentProjectSearchAdapters(
      {},
      {
        createCompatibilityAdapters: () => [
          storyAdapter,
          createLegacyCreativeEntityAdapter('/workspace'),
        ],
      },
    );

    expect(adapters).toContain(storyAdapter);
  });

  it('passes automatic Entity projections to the canonical Entity adapter', async () => {
    const projection = {
      repository: { list: vi.fn(async () => []) },
      partition: {
        scope: 'workspace' as const,
        workspaceId: 'workspace-1',
        domain: 'entity-asset-projection',
      },
      readRevision: vi.fn(async () => null),
    };
    const projectedItem: ProjectSearchItem = {
      id: 'entity-projection:candidate:auto:character:小橘',
      kind: 'entity-candidate',
      label: '小橘',
      source: {
        partition: 'creative-entities',
        sourceId: 'workspace:cases/test.fountain',
        sourceKind: 'candidate',
      },
      projectRoot: '/workspace',
      canonicalName: '小橘',
      searchText: '小橘 character open',
      freshness: 'fresh',
    };
    const createEntityAdapter = vi.fn((): ProjectSearchAdapter => ({
      partition: 'creative-entities',
      ensureInitialized: async () => undefined,
      query: async () => [projectedItem],
      getStatus: () => ({
        partition: 'creative-entities',
        status: 'ready',
        freshness: 'fresh',
      }),
    }));
    const creativeEntities = createAgentProjectSearchAdapters(
      { entityAssetProjection: projection },
      { createCompatibilityAdapters: () => [], createEntityAdapter },
    ).find((adapter) => adapter.partition === 'creative-entities');

    await creativeEntities?.query(
      { text: '', mode: 'entity-picker', kinds: ['entity-candidate'] },
      { projectRoot: '/workspace' },
    );

    expect(createEntityAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        projectRoot: '/workspace',
        automaticCandidateProjection: projection,
      }),
    );
  });

  it('uses the canonical Entity adapter and discards creative compatibility projections', async () => {
    const projectRoot = await createProjectRootWithEntity({
      id: 'scene-narration',
      kind: 'scene',
      canonicalName: '讲述',
      aliases: ['旁白段落'],
    });
    const legacy = createLegacyCreativeEntityAdapter(projectRoot);
    const dispose = vi.spyOn(legacy, 'dispose');
    const adapters = createAgentProjectSearchAdapters(
      {},
      {
        createCompatibilityAdapters: () => [legacy],
      },
    );
    const creativeEntities = adapters.find((adapter) => adapter.partition === 'creative-entities');

    const items = await creativeEntities?.query(
      { text: '', mode: 'mention', kinds: ['creative-entity'] },
      { projectRoot },
    );

    expect(dispose).toHaveBeenCalledOnce();
    expect(items).toEqual([
      expect.objectContaining({
        id: 'entity:scene:scene-narration',
        label: '讲述',
        source: expect.objectContaining({ sourceId: 'neko-entity' }),
      }),
    ]);
    expect(items).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: 'legacy' })]));
  });

  it('never executes removed Dashboard source or state commands', async () => {
    const projectRoot = await createProjectRootWithEntity({
      id: 'char-xiaoju',
      kind: 'character',
      canonicalName: '小橘',
      aliases: [],
    });
    const creativeEntities = createAgentProjectSearchAdapters(
      {},
      { createCompatibilityAdapters: () => [] },
    ).find((adapter) => adapter.partition === 'creative-entities');

    await creativeEntities?.query(
      { text: '小橘', mode: 'mention', kinds: ['creative-entity'] },
      { projectRoot },
    );

    expect(commands.executeCommand).not.toHaveBeenCalled();
  });

  it('extracts context script character candidates through the owned adapter', async () => {
    const projectRoot = await createEmptyProjectRoot();
    const filePath = join(projectRoot, 'cases', 'test.fountain');
    const script = [
      'EXT. 猫猫家门口 - 清晨',
      '',
      '@小橘',
      '今天是上学第一天！',
      '',
      '@猫妈妈',
    ].join('\n');
    const adapters = createAgentProjectSearchAdapters(
      {},
      {
        createCompatibilityAdapters: () => [],
        readTextFile: async () => script,
      },
    );
    const creativeEntities = adapters.find((adapter) => adapter.partition === 'creative-entities');

    const items = await creativeEntities?.query(
      { text: '小橘', mode: 'mention', kinds: ['entity-candidate'] },
      {
        projectRoot,
        resolvedContextFilePath: filePath,
      },
    );

    expect(items).toEqual([
      expect.objectContaining({
        kind: 'entity-candidate',
        label: '小橘',
        filePath,
        source: expect.objectContaining({
          sourceId: 'agent-context-script',
          sourceKind: 'script',
          metadata: expect.objectContaining({ entityKind: 'character' }),
        }),
        navigationData: expect.objectContaining({
          entityKind: 'character',
          line: 2,
        }),
      }),
    ]);
  });
});

async function createEmptyProjectRoot(): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), 'neko-agent-entity-search-'));
  tempRoots.push(projectRoot);
  return projectRoot;
}

async function createProjectRootWithEntity(entity: {
  readonly id: string;
  readonly kind: 'scene' | 'character';
  readonly canonicalName: string;
  readonly aliases: readonly string[];
}): Promise<string> {
  const projectRoot = await createEmptyProjectRoot();
  const entityDir = join(projectRoot, 'neko', 'entities');
  await mkdir(entityDir, { recursive: true });
  const fileName = entity.kind === 'scene' ? 'scenes.json' : 'characters.json';
  await writeFile(
    join(entityDir, fileName),
    `${JSON.stringify(
      {
        version: 1,
        kind: entity.kind,
        entities: [
          {
            id: entity.id,
            kind: entity.kind,
            canonicalName: entity.canonicalName,
            aliases: entity.aliases,
            status: 'confirmed',
          },
        ],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  return projectRoot;
}

function createCompatibilityStoryAdapter(): ProjectSearchAdapter {
  return {
    partition: 'story-symbols',
    ensureInitialized: async () => undefined,
    query: async () => [],
    getStatus: () => ({ partition: 'story-symbols', status: 'ready', freshness: 'fresh' }),
  };
}

function createLegacyCreativeEntityAdapter(projectRoot: string): ProjectSearchAdapter {
  const item: ProjectSearchItem = {
    id: 'legacy',
    kind: 'creative-entity',
    label: '旧投影',
    source: {
      partition: 'creative-entities',
      sourceId: 'legacy',
      sourceKind: 'character',
    },
    projectRoot,
    canonicalName: '旧投影',
    searchText: '旧投影',
    freshness: 'fresh',
  };
  return {
    partition: 'creative-entities',
    ensureInitialized: async () => undefined,
    query: async () => [item],
    getStatus: () => ({
      partition: 'creative-entities',
      status: 'ready',
      freshness: 'fresh',
      itemCount: 1,
    }),
    dispose: vi.fn(),
  };
}
