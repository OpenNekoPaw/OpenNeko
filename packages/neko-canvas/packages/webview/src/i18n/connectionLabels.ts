import type { CanvasConnection, CanvasNode } from '@neko/shared';
import { t } from './index';

export function resolveConnectionTypeLabel(type: CanvasConnection['type'] | 'default'): string {
  return translateWithDefault(`connection.type.${type ?? 'default'}`, type ?? 'default');
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
    type: resolveConnectionTypeLabel(connection.type ?? 'default'),
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
    annotation: 'note',
    group: 'group',
    scene: 'sceneGroup',
    'narrative-start': 'narrativeStart',
    'narrative-scene': 'narrativeScene',
    'narrative-note': 'narrativeNote',
    'narrative-ending': 'narrativeEnding',
    'representation-slot': 'representationSlot',
    'generated-asset': 'generatedAsset',
    'canvas-embed': 'canvasEmbed',
  };
  return overrides[type] ?? toCamelCase(type);
}

function toCamelCase(value: string): string {
  return value.replace(/-([a-z])/g, (_, next: string) => next.toUpperCase());
}
