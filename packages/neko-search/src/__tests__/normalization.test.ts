import { describe, expect, it } from 'vitest';
import {
  matchesProjectSearchItem,
  projectSearchItemMatchesFilters,
  rankProjectSearchItems,
} from '../core/normalization';
import { createProjectSearchItem } from '../testing/testAdapters';

describe('project search normalization and filters', () => {
  it('matches Chinese substrings and aliases through normalized search text', () => {
    const item = {
      ...createProjectSearchItem({
        id: 'entity:xiaoju',
        kind: 'creative-entity',
        label: '小橘',
        partition: 'creative-entities',
      }),
      aliases: ['橘猫'],
      searchText: '小橘 橘猫 character',
    };

    expect(matchesProjectSearchItem(item, { text: '橘' })).toBe(true);
    expect(matchesProjectSearchItem(item, { text: '橘猫' })).toBe(true);
    expect(matchesProjectSearchItem(item, { text: '小灰' })).toBe(false);
  });

  it('applies explicit partition, kind, media, file, and scope filters centrally', () => {
    const item = {
      ...createProjectSearchItem({
        id: 'asset:portrait',
        kind: 'asset',
        label: 'Portrait',
        partition: 'asset-library',
      }),
      filePath: '/workspace/assets/portrait.png',
      metadata: {
        mediaType: 'image',
        fileType: 'png',
      },
    };

    expect(
      projectSearchItemMatchesFilters(item, {
        text: '',
        partitions: ['asset-library'],
        kinds: ['asset'],
        mediaTypes: ['image'],
        fileTypes: ['png'],
        scopes: [{ kind: 'workspace', id: '/workspace' }],
      }),
    ).toBe(true);
    expect(projectSearchItemMatchesFilters(item, { text: '', mediaTypes: ['video'] })).toBe(false);
    expect(projectSearchItemMatchesFilters(item, { text: '', partitions: ['story-symbols'] })).toBe(
      false,
    );
  });

  it('keeps ranking deterministic with explicit priority hints', () => {
    const low = createProjectSearchItem({
      id: 'asset:low',
      kind: 'asset',
      label: '小橘 reference',
      partition: 'asset-library',
      priority: 1,
    });
    const high = createProjectSearchItem({
      id: 'entity:high',
      kind: 'creative-entity',
      label: '小橘',
      partition: 'creative-entities',
      priority: 2,
    });

    expect(rankProjectSearchItems([low, high], { text: '小橘' }).map((item) => item.id)).toEqual([
      'entity:high',
      'asset:low',
    ]);
  });
});
