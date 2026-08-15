import { describe, expect, it } from 'vitest';
import {
  extractScriptCharacterCandidates,
  scriptCharacterCandidateToProjectSearchItem,
} from './project-search-projection';
import { createEntitySearchAdapter } from './entity-search-adapter';

describe('Entity project search projections', () => {
  it('extracts forced characters through the canonical Fountain parser', () => {
    const script = [
      'EXT. 猫猫家门口 - 清晨',
      '',
      '@小橘',
      '今天是上学第一天！',
      '',
      '@猫妈妈',
      '回家吃饭。',
      '',
      '@校长',
      '欢迎。',
    ].join('\n');

    const candidates = extractScriptCharacterCandidates(script);

    expect(candidates).toEqual([
      { name: '小橘', firstLine: 2 },
      { name: '猫妈妈', firstLine: 5 },
      { name: '校长', firstLine: 8 },
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
      domain: 'project-entity-projection',
    };
    const adapter = createEntitySearchAdapter({
      projectRoot: '/workspace',
      entities: {
        load: async () => ({
          projectId: 'project-neko',
          entities: [],
        }),
      },
      derivedProjection: {
        partition,
        repository: {
          list: async () => ({
            records: [
              {
                projectionId:
                  'workspace:cases/test.fountain:candidate:candidate:auto:character:小橘',
                kind: 'entity-candidate' as const,
                sourceId: 'workspace:cases/test.fountain',
                candidateId: 'candidate:auto:character:小橘',
                freshness: 'fresh' as const,
                updatedAt: '2026-07-19T00:00:00.000Z',
                value: {
                  candidateId: 'candidate:auto:character:小橘',
                  kind: 'character' as const,
                  proposedNames: { canonical: '小橘', aliases: ['橘仔'] },
                  freshness: 'fresh' as const,
                  evidence: [
                    {
                      evidenceId: 'evidence:小橘',
                      owner: 'workspace' as const,
                      sourceId: 'workspace:cases/test.fountain',
                      locator: { kind: 'workspace-file' as const, path: 'cases/test.fountain' },
                    },
                  ],
                },
              },
            ],
            diagnostics: [],
          }),
        },
      },
    });

    const projected = await adapter.query(
      {
        text: '',
        mode: 'entity-picker',
        kinds: ['entity-candidate'],
        partitions: ['creative-entities'],
      },
      { projectRoot: '/workspace' },
    );
    expect(projected).toEqual([
      expect.objectContaining({
        id: 'candidate:candidate:auto:character:小橘',
        kind: 'entity-candidate',
        label: '小橘',
        navigationData: expect.objectContaining({
          candidateId: 'candidate:auto:character:小橘',
          sourceRef: 'workspace:cases/test.fountain',
        }),
        metadata: expect.objectContaining({ freshness: 'fresh', evidenceCount: 1 }),
      }),
    ]);

    await expect(
      adapter.query(
        {
          text: projected[0]!.id,
          mode: 'entity-picker',
          limit: 1,
          kinds: ['entity-candidate'],
          partitions: ['creative-entities'],
        },
        { projectRoot: '/workspace' },
      ),
    ).resolves.toEqual(projected);
  });

  it('projects canonical lifecycle and binding attention from the Entity repository', async () => {
    const partition = {
      scope: 'workspace' as const,
      workspaceId: 'workspace-1',
      domain: 'project-entity-projection',
    };
    const adapter = createEntitySearchAdapter({
      projectRoot: '/workspace',
      entities: {
        load: async () => ({
          projectId: 'project-neko',
          entities: [
            projectEntity('character-rin', 'Rin', { state: 'active' }, true),
            projectEntity('location-school', 'School', {
              state: 'deprecated',
              deprecatedAt: '2026-07-19T00:00:00.000Z',
            }),
          ],
        }),
      },
      derivedProjection: {
        partition,
        repository: {
          list: async () => ({
            records: [
              {
                projectionId: 'availability:rin',
                kind: 'binding-availability' as const,
                sourceId: 'binding-owner',
                entityId: 'character-rin',
                freshness: 'fresh' as const,
                updatedAt: '2026-07-19T00:00:00.000Z',
                value: {
                  bindingId: 'binding-rin',
                  entityId: 'character-rin',
                  entityKind: 'character' as const,
                  representation: { kind: 'workspace-file' as const, path: 'rin.png' },
                  role: 'portrait' as const,
                  owner: 'workspace-file' as const,
                  availability: 'needs-attention' as const,
                  attention: {
                    diagnostic: { code: 'content-missing' as const },
                    action: 'rebind' as const,
                  },
                  checkedAt: '2026-07-19T00:00:00.000Z',
                },
              },
            ],
            diagnostics: [],
          }),
        },
      },
    });

    const items = await adapter.query(
      { text: '', mode: 'entity-picker', partitions: ['creative-entities'] },
      { projectRoot: '/workspace' },
    );
    expect(items.map((item) => [item.id, item.metadata?.['status']])).toEqual([
      ['entity:character-rin', 'needs-attention'],
      ['entity:location-school', 'deprecated'],
    ]);
    expect(items[0]?.source).toMatchObject({
      sourceKind: 'project-entity',
      metadata: { owners: ['project-entity'] },
    });
  });
});

function projectEntity(
  entityId: string,
  canonical: string,
  lifecycle:
    { readonly state: 'active' } | { readonly state: 'deprecated'; readonly deprecatedAt: string },
  withBinding = false,
) {
  return {
    entityId,
    kind: entityId.startsWith('location') ? ('location' as const) : ('character' as const),
    names: { canonical, aliases: [] },
    representations: withBinding
      ? [
          {
            bindingId: 'binding-rin',
            role: 'portrait' as const,
            target: { kind: 'workspace-file' as const, path: 'rin.png' },
            source: 'user' as const,
            acceptedAt: '2026-07-19T00:00:00.000Z',
          },
        ]
      : [],
    lifecycle,
    createdAt: '2026-07-19T00:00:00.000Z',
    updatedAt: '2026-07-19T00:00:00.000Z',
  };
}
