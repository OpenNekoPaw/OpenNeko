import { describe, expect, it } from 'vitest';
import type { CanvasNode } from '@neko/canvas-domain';
import { setLocale } from './index';
import {
  resolveAggregateConnectionCountLabel,
  resolveConnectionDirectionLabel,
  resolveConnectionTitle,
  resolveConnectionTypeLabel,
} from './connectionLabels';

function node(type: CanvasNode['type']): Pick<CanvasNode, 'type'> {
  return { type };
}

describe('connectionLabels', () => {
  it('localizes connection type labels', () => {
    setLocale('en');
    expect(resolveConnectionTypeLabel('sequence')).toBe('Sequence');

    setLocale('zh-cn');
    expect(resolveConnectionTypeLabel('sequence')).toBe('顺序');
  });

  it('localizes connection direction and aggregate labels', () => {
    setLocale('zh-cn');

    expect(resolveConnectionDirectionLabel(node('markdown'), node('media'))).toBe(
      'Markdown → 媒体',
    );
    expect(resolveConnectionTitle({ type: 'reference' }, node('markdown'), node('media'))).toBe(
      '引用：Markdown → 媒体',
    );
    expect(resolveAggregateConnectionCountLabel(3)).toBe('3 条连接');
  });
});
