import { describe, expect, it } from 'vitest';
import type { GroupCanvasNode } from '@neko/shared';
import { getContainerActionDescriptors } from './containerActions';

describe('spatial Group container action policy', () => {
  it('owns arrange, sort, fit, and collapse actions in the canonical descriptor registry', () => {
    const group: GroupCanvasNode = {
      id: 'group',
      type: 'group',
      position: { x: 0, y: 0 },
      size: { width: 400, height: 300 },
      zIndex: 1,
      container: { policy: 'group', childIds: ['child'] },
      data: { label: 'Group' },
    };

    expect(getContainerActionDescriptors(group).map((action) => action.id)).toEqual([
      'arrange-stable',
      'fit-to-content',
      'collapse-group',
      'expand-group',
      'arrange-name',
      'arrange-type',
      'arrange-created',
    ]);
  });
});
