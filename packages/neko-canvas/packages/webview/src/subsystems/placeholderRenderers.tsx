import type { CanvasNode, CanvasViewport, RegisteredCanvasNode } from '@neko/shared';
import { BaseNode } from '../components/nodes/BaseNode';
import type { NodeRendererCommonProps, NodeRendererRegistry } from '../components/nodes';
import { t } from '../i18n';
import {
  getPlaceholderNodeDefinition,
  getPlaceholderNodeDefinitions,
  type PlaceholderSubsystemId,
} from './placeholderDescriptors';

type PlaceholderNode = RegisteredCanvasNode & { data: Record<string, unknown> };

interface PlaceholderNodeProps extends NodeRendererCommonProps {
  node: CanvasNode;
}

export function createPlaceholderNodeRendererRegistry(
  subsystemId: PlaceholderSubsystemId,
): NodeRendererRegistry {
  return Object.fromEntries(
    getPlaceholderNodeDefinitions(subsystemId).map((definition) => [
      definition.type,
      (context: Parameters<NonNullable<NodeRendererRegistry[typeof definition.type]>>[0]) => (
        <PlaceholderNodeCard key={context.node.id} {...context} />
      ),
    ]),
  ) as NodeRendererRegistry;
}

function PlaceholderNodeCard({
  node,
  viewport,
  isSelected,
  containerRef,
  onSelect,
  onDrag,
  onMove,
  onResize,
  onResizeEnd,
  onRotate,
  onRotateEnd,
  onConnectionStart,
}: PlaceholderNodeProps) {
  const typedNode = node as PlaceholderNode;
  const definition = getPlaceholderNodeDefinition(node.type);
  const tagLabel = definition?.tagLabel ?? node.type.toUpperCase();
  const tagColor = definition?.tagColor ?? '#6b7280';
  const label = definition ? t(definition.labelKey) : node.type;
  const title = readFirstString(typedNode.data, definition?.titleKeys ?? []) || label;
  const detail = readFirstString(typedNode.data, definition?.detailKeys ?? []);

  return (
    <BaseNode
      node={node}
      viewport={viewport as CanvasViewport}
      isSelected={isSelected}
      containerRef={containerRef}
      onSelect={onSelect}
      onDrag={onDrag}
      onMove={onMove}
      onResize={onResize}
      onResizeEnd={onResizeEnd}
      onRotate={onRotate}
      onRotateEnd={onRotateEnd}
      onConnectionStart={onConnectionStart}
    >
      <div className="flex h-full flex-col overflow-hidden">
        <div
          className="flex items-center gap-2 border-b px-2 py-1.5"
          style={{
            backgroundColor: 'var(--node-header-bg)',
            borderColor: 'var(--node-divider)',
          }}
        >
          <span
            className="rounded px-1.5 py-0.5 text-xs font-medium"
            style={{ backgroundColor: `${tagColor}20`, color: tagColor }}
          >
            {tagLabel}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--node-fg)]">
            {title}
          </span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 p-3 text-xs">
          <div className="truncate text-[var(--node-fg-secondary)]">{label}</div>
          {detail ? (
            <div className="line-clamp-3 whitespace-pre-wrap break-words text-[var(--node-fg)]">
              {detail}
            </div>
          ) : (
            <div className="text-[var(--node-fg-secondary)]">{t('node.placeholderReady')}</div>
          )}
        </div>
      </div>
    </BaseNode>
  );
}

function readFirstString(
  data: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return undefined;
}
