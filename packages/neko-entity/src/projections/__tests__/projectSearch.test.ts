import { describe, expect, it } from 'vitest';
import type { DashboardCreativeEntityRow } from '@neko/shared/types/dashboard-creative-entity';
import {
  dashboardCreativeEntityRowsToProjectSearchItems,
  dashboardCreativeEntityStateFreshnessValues,
  extractScriptCharacterCandidates,
  scriptCharacterCandidateToProjectSearchItem,
} from '../projectSearch';

describe('entity project search projections', () => {
  it('projects Dashboard creative entity rows into canonical project search items', () => {
    const items = dashboardCreativeEntityRowsToProjectSearchItems(
      [
        createDashboardRow({
          label: '小橘',
          sourceEntityId: 'candidate:character:小橘',
          status: 'candidate',
        }),
      ],
      '/workspace/neko',
    );

    expect(items).toEqual([
      expect.objectContaining({
        id: 'dashboard:neko-story:candidate:character:小橘',
        kind: 'entity-candidate',
        label: '小橘',
        source: expect.objectContaining({
          sourceId: 'neko-story',
          metadata: expect.objectContaining({ entityKind: 'character' }),
        }),
        navigationData: expect.objectContaining({
          source: 'neko-story',
          sourceEntityId: 'candidate:character:小橘',
        }),
      }),
    ]);
  });

  it('keeps rows with relative project roots and filters mismatched absolute project roots', () => {
    const items = dashboardCreativeEntityRowsToProjectSearchItems(
      [
        createDashboardRow({
          label: '相对项目',
          sourceEntityId: 'candidate:relative',
          status: 'candidate',
          projectRoot: 'neko',
        }),
        createDashboardRow({
          label: '其它项目',
          sourceEntityId: 'candidate:foreign',
          status: 'candidate',
          projectRoot: '/workspace/other',
        }),
      ],
      '/workspace/neko',
    );

    expect(items.map((item) => item.label)).toEqual(['相对项目']);
  });

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

  it('combines Dashboard source and item freshness values', () => {
    const row = createDashboardRow({
      label: '小橘',
      sourceEntityId: 'candidate:character:小橘',
      status: 'candidate',
    });
    const items = dashboardCreativeEntityRowsToProjectSearchItems([row], '/workspace/neko');

    expect(
      dashboardCreativeEntityStateFreshnessValues(
        {
          statuses: [{ source: 'neko-story', available: true, freshness: 'building' }],
          rows: [row],
        },
        items,
      ),
    ).toEqual(['building', 'fresh']);
  });
});

function createDashboardRow(row: {
  readonly label: string;
  readonly sourceEntityId: string;
  readonly status: 'candidate' | 'confirmed';
  readonly kind?: 'character' | 'scene';
  readonly projectRoot?: string;
}): DashboardCreativeEntityRow {
  const kind = row.kind ?? 'character';
  return {
    ref: {
      source: 'neko-story',
      sourceEntityId: row.sourceEntityId,
      entityId: row.label,
      entityKind: kind,
      ...(row.projectRoot ? { projectRoot: row.projectRoot } : {}),
    },
    label: row.label,
    kind,
    status: row.status,
    sourceKind: row.status === 'candidate' ? 'script' : 'registry',
    summary: 'Dashboard entity state row',
    occurrenceCount: 1,
    freshness: 'fresh',
    actions: [],
    searchText: `${row.label} ${kind}`,
  };
}
