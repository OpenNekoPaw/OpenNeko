import { describe, expect, it } from 'vitest';
import type { CanvasNode } from '@neko/shared';
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

    expect(resolveConnectionDirectionLabel(node('shot'), node('scene'))).toBe('镜头 → 场景');
    expect(resolveConnectionTitle({ type: 'reference' }, node('shot'), node('scene'))).toBe(
      '引用：镜头 → 场景',
    );
    expect(resolveAggregateConnectionCountLabel(3)).toBe('3 条连接');
  });
});
