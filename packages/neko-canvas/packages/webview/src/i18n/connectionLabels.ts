import type { CanvasConnection, CanvasNode } from '@neko/shared';
import { t } from './index';

export function resolveConnectionTypeLabel(type: CanvasConnection['type']): string {
  return translateWithDefault(`connection.type.${type ?? 'reference'}`, type ?? 'reference');
}

export function resolveConnectionDirectionLabel(
  sourceNode: Pick<CanvasNode, 'type'>,
  targetNode: Pick<CanvasNode, 'type'>,
): string {
  return t('connection.direction', {
    source: resolveConnectionNodeTypeLabel(sourceNode.type),
    target: resolveConnectionNodeTypeLabel(targetNode.type),
  });
}

export function resolveConnectionTitle(
  connection: Pick<CanvasConnection, 'type'>,
  sourceNode: Pick<CanvasNode, 'type'>,
  targetNode: Pick<CanvasNode, 'type'>,
): string {
  return t('connection.title', {
    type: resolveConnectionTypeLabel(connection.type ?? 'reference'),
    direction: resolveConnectionDirectionLabel(sourceNode, targetNode),
  });
}

export function resolveAggregateConnectionCountLabel(count: number): string {
  return t('connection.aggregateCount', { count });
}

export function resolveInternalConnectionCountLabel(count: number): string {
  return t('connection.internalCount', { count });
}

function resolveConnectionNodeTypeLabel(type: CanvasNode['type']): string {
  return translateWithDefault(`node.${toNodeLabelKeySegment(type)}`, type);
}

function translateWithDefault(key: string, defaultValue: string): string {
  const translated = t(key);
  return translated === key ? defaultValue : translated;
}

function toNodeLabelKeySegment(type: CanvasNode['type']): string {
  const overrides: Partial<Record<CanvasNode['type'], string>> = {
    'canvas-embed': 'canvasEmbed',
  };
  return overrides[type] ?? toCamelCase(type);
}

function toCamelCase(value: string): string {
  return value.replace(/-([a-z])/g, (_, next: string) => next.toUpperCase());
}
