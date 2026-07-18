import { describe, expect, it } from 'vitest';
import {
  extractScriptCharacterCandidates,
  scriptCharacterCandidateToProjectSearchItem,
} from '../projectSearch';
import { createEntitySearchAdapter } from '../index';

describe('Entity project search projections', () => {
  it('extracts @character markers and Story parser character elements without VSCode', () => {
    const script = [
      'EXT. 猫猫家门口 - 清晨',
      '',
      '@小橘',
      '今天是上学第一天！',
      '',
      '@猫妈妈',
    ].join('\n');

    const candidates = extractScriptCharacterCandidates(script, () => ({
      elements: [
        { type: 'character', text: '校长' },
        { type: 'dialogue', text: '欢迎。' },
        { type: 'character', text: '@小橘' },
      ],
    }));

    expect(candidates).toEqual([
      { name: '小橘', firstLine: 2 },
      { name: '猫妈妈', firstLine: 5 },
      { name: '校长' },
    ]);
  });

  it('projects script character candidates without host APIs', () => {
    const item = scriptCharacterCandidateToProjectSearchItem(
      { name: '小橘', firstLine: 2 },
      {
        projectRoot: '/workspace/neko',
        filePath: '/workspace/neko/story/test.fountain',
        projectRelativePath: 'story/test.fountain',
        uri: 'file:///workspace/neko/story/test.fountain',
      },
    );

    expect(item).toEqual(
      expect.objectContaining({
        id: 'context-script-entity:/workspace/neko/story/test.fountain:小橘',
        kind: 'entity-candidate',
        label: '小橘',
        filePath: '/workspace/neko/story/test.fountain',
        source: expect.objectContaining({
          sourceId: 'agent-context-script',
          projectRelativePath: 'story/test.fountain',
          uri: 'file:///workspace/neko/story/test.fountain',
        }),
        navigationData: expect.objectContaining({
          entityKind: 'character',
          line: 2,
        }),
      }),
    );
  });

  it('projects automatic character candidates from the canonical metadata repository', async () => {
    const partition = {
      scope: 'workspace' as const,
      workspaceId: 'workspace-1',
      domain: 'entity-asset-projection',
    };
    const adapter = createEntitySearchAdapter({
      projectRoot: '/workspace',
      service: {
        list: async () => [],
        listCandidates: async () => [],
      },
      automaticCandidateProjection: {
        partition,
        readRevision: async () => ({
          partition,
          revision: 1,
          freshness: 'fresh',
          diagnostic: null,
          updatedAt: '2026-07-19T00:00:00.000Z',
        }),
        repository: {
          list: async () => [
            {
              projectionId: 'workspace:cases/test.fountain:candidate:candidate:auto:character:小橘',
              kind: 'entity-candidate' as const,
              sourceId: 'workspace:cases/test.fountain',
              candidateId: 'candidate:auto:character:小橘',
              freshness: 'fresh' as const,
              updatedAt: '2026-07-19T00:00:00.000Z',
              value: {
                id: 'candidate:auto:character:小橘',
                kind: 'character' as const,
                name: '小橘',
                aliases: ['橘仔'],
                status: 'open' as const,
                identityBasis: 'user-named' as const,
                provenance: [],
                sourceRefs: ['${WORKSPACE}/cases/test.fountain'],
                createdAt: '2026-07-19T00:00:00.000Z',
                updatedAt: '2026-07-19T00:00:00.000Z',
                metadata: { projectionKind: 'automatic-entity-candidate' },
              },
            },
          ],
        },
      },
    });

    await expect(
      adapter.query(
        {
          text: '',
          mode: 'entity-picker',
          kinds: ['entity-candidate'],
          partitions: ['creative-entities'],
        },
        { projectRoot: '/workspace' },
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'entity-projection:workspace:cases/test.fountain:candidate:candidate:auto:character:小橘',
        kind: 'entity-candidate',
        label: '小橘',
        navigationData: expect.objectContaining({
          candidateId: 'candidate:auto:character:小橘',
          sourceRef: '${WORKSPACE}/cases/test.fountain',
        }),
        metadata: expect.objectContaining({ status: 'open' }),
      }),
    ]);
  });
});
