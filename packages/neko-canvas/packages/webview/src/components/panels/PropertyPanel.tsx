import { Button, Collapsible } from '@neko/ui/primitives';
import { toCodiconClassName } from '@neko/ui/icons';
import { PropertyPanel as SharedPropertyPanel } from '@neko/ui/creative';
import type { PropertyValue } from '@neko/ui/creative';
import type {
  CanvasConnection,
  CanvasNode,
  CanvasNodeType,
  ConnectionType,
  GroupCanvasNode,
  MarkdownCanvasNode,
} from '@neko/shared';
import { getContainerChildIds } from '@neko/shared';
import { t } from '../../i18n';
import { resolveConnectionTypeLabel } from '../../i18n/connectionLabels';
import {
  mapCanvasNodePropertyCommit,
  mapCanvasNodeTransformToProperties,
} from '../adapters/sharedCanvasUiAdapter';
import { getNodeLabel } from '../nodes/nodeTypeDescriptor';
import { createBuiltInNodeTypeDescriptors } from '../nodes/nodeTypeDescriptors';
import { PortEditor } from './PortEditor';

export interface PropertyPanelProps {
  readonly selectedNodes: CanvasNode[];
  readonly selectedConnections?: CanvasConnection[];
  readonly onUpdateNode: (id: string, updates: Partial<CanvasNode>) => void;
  readonly onUpdateNodeData: (id: string, data: Record<string, unknown>) => void;
  readonly onUpdateConnection?: (id: string, updates: Partial<CanvasConnection>) => void;
  readonly onUpdatePorts?: (id: string, ports: import('@neko/shared').PortDefinition[]) => void;
  readonly onDeleteNode: (id: string) => void;
  readonly onToggleLock: (id: string) => void;
  readonly width?: number;
}

interface NodeSpecificPropertiesProps {
  readonly node: CanvasNode;
  readonly onUpdateData: (data: Record<string, unknown>) => void;
}

type NodePropertiesRenderer = (props: NodeSpecificPropertiesProps) => React.ReactNode;
type NodePropertiesRendererRegistry = Partial<Record<CanvasNodeType, NodePropertiesRenderer>>;

const NODE_TYPE_DESCRIPTORS = createBuiltInNodeTypeDescriptors();
const NODE_PROPERTIES_RENDERERS = createBuiltInNodePropertiesRendererRegistry();

export function PropertyPanel({
  selectedNodes,
  selectedConnections = [],
  onUpdateNode,
  onUpdateNodeData,
  onUpdateConnection,
  onUpdatePorts,
  onDeleteNode,
  onToggleLock,
  width = 240,
}: PropertyPanelProps) {
  if (selectedNodes.length === 0 && selectedConnections.length === 1) {
    const connection = selectedConnections[0]!;
    return (
      <PanelFrame width={width}>
        <PanelHeader title={t('panel.connection')} />
        <ConnectionProperties connection={connection} onUpdate={onUpdateConnection} />
      </PanelFrame>
    );
  }

  if (selectedNodes.length === 0) {
    return (
      <PanelFrame width={width}>
        <PanelHeader title={t('panel.properties')} />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-xs" style={{ color: 'var(--neko-fg-secondary)' }}>
            {t('panel.noSelection')}
          </p>
        </div>
      </PanelFrame>
    );
  }

  if (selectedNodes.length > 1) {
    return (
      <PanelFrame width={width}>
        <PanelHeader title={t('panel.multiSelected', { count: selectedNodes.length })} />
        <MultiSelectionInfo nodes={selectedNodes} />
      </PanelFrame>
    );
  }

  const node = selectedNodes[0]!;
  const transformAdapter = mapCanvasNodeTransformToProperties(node, t);
  const handleTransformChange = (propertyId: string, value: PropertyValue): void => {
    const updates = mapCanvasNodePropertyCommit(node, propertyId, value);
    if (Object.keys(updates).length > 0) {
      onUpdateNode(node.id, updates);
    }
  };

  return (
    <PanelFrame width={width}>
      <PanelHeader title={getNodeLabel(NODE_TYPE_DESCRIPTORS, node.type as CanvasNodeType, t)} />
      {renderNodeSpecificProperties(NODE_PROPERTIES_RENDERERS, {
        node,
        onUpdateData: (data) => onUpdateNodeData(node.id, data),
      })}
      <PanelSection title={t('panel.transform')}>
        <SharedPropertyPanel
          properties={transformAdapter.properties}
          onCommit={handleTransformChange}
          onPreviewChange={handleTransformChange}
        />
      </PanelSection>
      <PanelSection title={t('panel.layer')}>
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: 'var(--neko-fg-secondary)' }}>
            Z-Index: {node.zIndex}
          </span>
          <Button
            leadingIcon={<Codicon name={node.locked ? 'lock' : 'unlock'} />}
            size="xs"
            variant={node.locked ? 'secondary' : 'ghost'}
            onClick={() => onToggleLock(node.id)}
          >
            {node.locked ? t('menu.unlock') : t('menu.lock')}
          </Button>
        </div>
      </PanelSection>
      {onUpdatePorts ? <PortEditor node={node} onUpdatePorts={onUpdatePorts} /> : null}
      <PanelSection title={t('panel.actions')}>
        <Button
          className="w-full"
          leadingIcon={<Codicon name="trash" />}
          size="sm"
          variant="danger"
          onClick={() => onDeleteNode(node.id)}
        >
          {t('menu.delete')}
        </Button>
      </PanelSection>
    </PanelFrame>
  );
}

function PanelFrame({
  children,
  width,
}: {
  readonly children: React.ReactNode;
  readonly width: number;
}) {
  return (
    <div
      className="flex h-full flex-col overflow-y-auto"
      style={{
        backgroundColor: 'var(--neko-surface)',
        borderLeft: '1px solid var(--neko-border)',
        width,
        minWidth: 200,
        maxWidth: 400,
      }}
    >
      {children}
    </div>
  );
}

function PanelHeader({ title }: { readonly title: string }) {
  return <div className="neko-panel-header">{title}</div>;
}

function PanelSection({
  children,
  title,
}: {
  readonly children: React.ReactNode;
  readonly title: string;
}) {
  return (
    <Collapsible
      defaultOpen
      className="border-b border-[var(--panel-divider)] px-3 py-2"
      contentClassName="pt-2"
      trigger={
        <button
          type="button"
          className="flex w-full items-center justify-between text-left text-xs font-semibold uppercase text-[var(--neko-fg-secondary)]"
        >
          <span>{title}</span>
          <Codicon name="chevron-down" />
        </button>
      }
    >
      {children}
    </Collapsible>
  );
}

function Codicon({ name }: { readonly name: Parameters<typeof toCodiconClassName>[0] }) {
  return <span aria-hidden="true" className={toCodiconClassName(name)} />;
}

function MultiSelectionInfo({ nodes }: { readonly nodes: CanvasNode[] }) {
  const typeCounts = new Map<string, number>();
  for (const node of nodes) {
    typeCounts.set(node.type, (typeCounts.get(node.type) ?? 0) + 1);
  }

  return (
    <div className="space-y-1 px-3 py-3">
      {Array.from(typeCounts.entries()).map(([type, count]) => (
        <div
          key={type}
          className="flex items-center justify-between text-xs"
          style={{ color: 'var(--neko-fg)' }}
        >
          <span>{getNodeLabel(NODE_TYPE_DESCRIPTORS, type as CanvasNodeType, t)}</span>
          <span style={{ color: 'var(--neko-fg-secondary)' }}>x{count}</span>
        </div>
      ))}
    </div>
  );
}

export function MarkdownNodeProperties({ node, onUpdateData }: NodeSpecificPropertiesProps) {
  if (node.type !== 'markdown') {
    throw new Error(`MarkdownNodeProperties received "${node.type}"`);
  }
  const markdownNode: MarkdownCanvasNode = node;
  return (
    <PanelSection title={t('panel.content')}>
      <div className="space-y-2">
        <TextField
          value={markdownNode.data.title ?? ''}
          onChange={(title) => onUpdateData({ ...markdownNode.data, title: title || undefined })}
        />
        <textarea
          aria-label={t('node.markdownInput')}
          className="min-h-[120px] w-full resize-y rounded border bg-transparent p-2 text-xs outline-none"
          style={{ borderColor: 'var(--control-border)', color: 'var(--control-fg)' }}
          value={markdownNode.data.content}
          onChange={(event) =>
            onUpdateData({ ...markdownNode.data, content: event.currentTarget.value })
          }
        />
      </div>
    </PanelSection>
  );
}

export function GroupNodeProperties({ node, onUpdateData }: NodeSpecificPropertiesProps) {
  if (node.type !== 'group') {
    throw new Error(`GroupNodeProperties received "${node.type}"`);
  }
  const groupNode: GroupCanvasNode = node;
  const childIds = getContainerChildIds(groupNode);
  return (
    <PanelSection title={t('panel.group')}>
      <div className="space-y-2">
        <TextField
          value={groupNode.data.label ?? ''}
          onChange={(label) => onUpdateData({ ...groupNode.data, label: label || undefined })}
        />
        <label className="flex items-center justify-between text-xs">
          <span style={{ color: 'var(--neko-fg-secondary)' }}>{t('panel.groupColor')}</span>
          <input
            type="color"
            className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0"
            value={groupNode.data.color ?? '#6b7280'}
            onChange={(event) =>
              onUpdateData({ ...groupNode.data, color: event.currentTarget.value })
            }
          />
        </label>
        <div className="text-xs" style={{ color: 'var(--neko-fg-secondary)' }}>
          {t('panel.groupChildren')}: {childIds.length}
        </div>
      </div>
    </PanelSection>
  );
}

function TextField({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <input
      type="text"
      aria-label={t('panel.groupLabel')}
      className="w-full rounded border bg-transparent px-2 py-1 text-xs outline-none"
      style={{ borderColor: 'var(--control-border)', color: 'var(--control-fg)' }}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

export function createBuiltInNodePropertiesRendererRegistry(): NodePropertiesRendererRegistry {
  return {
    markdown: MarkdownNodeProperties,
    group: GroupNodeProperties,
  };
}

export function renderNodeSpecificProperties(
  registry: NodePropertiesRendererRegistry,
  props: NodeSpecificPropertiesProps,
): React.ReactNode {
  const renderer = registry[props.node.type];
  return renderer ? renderer(props) : null;
}

export function enumerateComposablePropertyItems(_node: CanvasNode): [] {
  return [];
}

function ConnectionProperties({
  connection,
  onUpdate,
}: {
  readonly connection: CanvasConnection;
  readonly onUpdate?: (id: string, updates: Partial<CanvasConnection>) => void;
}) {
  return (
    <>
      <PanelSection title={t('panel.connectionLabel')}>
        <input
          type="text"
          className="w-full rounded border bg-transparent px-2 py-1 text-xs outline-none"
          style={{ borderColor: 'var(--control-border)', color: 'var(--control-fg)' }}
          value={connection.label ?? ''}
          placeholder={t('panel.connectionLabelPlaceholder')}
          onChange={(event) =>
            onUpdate?.(connection.id, { label: event.currentTarget.value || undefined })
          }
        />
      </PanelSection>
      <PanelSection title={t('panel.connectionType')}>
        <select
          className="w-full rounded border bg-transparent px-2 py-1 text-xs outline-none"
          style={{ borderColor: 'var(--control-border)', color: 'var(--control-fg)' }}
          value={connection.type}
          onChange={(event) =>
            onUpdate?.(connection.id, { type: event.currentTarget.value as ConnectionType })
          }
        >
          <option value="sequence">{resolveConnectionTypeLabel('sequence')}</option>
          <option value="reference">{resolveConnectionTypeLabel('reference')}</option>
          <option value="derived-from">{resolveConnectionTypeLabel('derived-from')}</option>
        </select>
      </PanelSection>
      <PanelSection title={t('panel.connectionInfo')}>
        <div className="space-y-1 text-xs" style={{ color: 'var(--neko-fg-secondary)' }}>
          <div className="truncate">ID: {connection.id}</div>
          <div className="truncate">
            {t('connection.source')}: {connection.sourceId}
          </div>
          <div className="truncate">
            {t('connection.target')}: {connection.targetId}
          </div>
        </div>
      </PanelSection>
    </>
  );
}
