/**
 * PropertyPanel - Node property inspector panel
 *
 * Displays and allows editing of selected node properties:
 * - Position (x, y)
 * - Size (width, height)
 * - Lock state
 * - Node-type-specific properties
 */

import { useCallback } from 'react';
import type { PropertyValue } from '@neko/ui/creative';
import { PropertyPanel as SharedPropertyPanel } from '@neko/ui/creative';
import { Button, Collapsible } from '@neko/ui/primitives';
import { toCodiconClassName } from '@neko/ui/icons';
import type {
  CanvasBlock,
  CanvasConnection,
  CanvasNode,
  CanvasNodeType,
  CollectionView,
  ConnectionType,
  FieldBinding,
  JsonPointerPath,
} from '@neko/shared';
import {
  getContainerChildIds,
  readFieldBinding,
  summarizeReferencesFromCanvasNode,
  writeFieldBinding,
} from '@neko/shared';
import { t } from '../../i18n';
import { PortEditor } from './PortEditor';
import { getNodeLabel } from '../nodes/nodeTypeDescriptor';
import { createBuiltInNodeTypeDescriptors } from '../nodes/nodeTypeDescriptors';
import { getContainerActionDescriptors } from '../content/node-card';
import {
  mapCanvasNodePropertyCommit,
  mapCanvasNodeTransformToProperties,
} from '../adapters/sharedCanvasUiAdapter';
import { resolveCanvasOptionLabel } from '../../i18n/canvasValueLabels';
import { resolveConnectionTypeLabel } from '../../i18n/connectionLabels';

// =============================================================================
// Types
// =============================================================================

export interface PropertyPanelProps {
  selectedNodes: CanvasNode[];
  selectedConnections?: CanvasConnection[];
  onUpdateNode: (id: string, updates: Partial<CanvasNode>) => void;
  onUpdateNodeData: (id: string, data: Record<string, unknown>) => void;
  onUpdateConnection?: (id: string, updates: Partial<CanvasConnection>) => void;
  onUpdatePorts?: (id: string, ports: import('@neko/shared').PortDefinition[]) => void;
  onDeleteNode: (id: string) => void;
  onToggleLock: (id: string) => void;
  onAction?: (nodeId: string, action: string, payload?: Record<string, unknown>) => void;
  width?: number;
}

interface NodeSpecificPropertiesProps {
  node: CanvasNode;
  onUpdateData: (data: Record<string, unknown>) => void;
  onAction?: (action: string, payload?: Record<string, unknown>) => void;
}

type NodePropertiesRenderer = (props: NodeSpecificPropertiesProps) => React.ReactNode;
type NodePropertiesRendererRegistry = Partial<Record<CanvasNodeType, NodePropertiesRenderer>>;

type ComposablePropertyItem =
  | {
      kind: 'field';
      blockId: string;
      label: string;
      blockKind: CanvasBlock['kind'];
      binding: FieldBinding;
      value: unknown;
      options?: string[];
      readOnly: boolean;
    }
  | {
      kind: 'collection';
      blockId: string;
      label: string;
      collection: CollectionView;
      items: unknown[];
    }
  | {
      kind: 'action';
      blockId: string;
      label: string;
      action: string;
      disabledReasonPath?: string;
      requiresCapability?: string;
    }
  | {
      kind: 'preview';
      blockId: string;
      label: string;
      role: string;
    };

// =============================================================================
// Component
// =============================================================================

export function PropertyPanel({
  selectedNodes,
  selectedConnections = [],
  onUpdateNode,
  onUpdateNodeData,
  onUpdateConnection,
  onUpdatePorts,
  onDeleteNode,
  onToggleLock,
  onAction,
  width = 240,
}: PropertyPanelProps) {
  // Show connection properties when a connection is selected and no nodes
  if (selectedNodes.length === 0 && selectedConnections.length === 1) {
    const conn = selectedConnections[0]!;
    return (
      <div
        className="flex flex-col h-full overflow-y-auto"
        style={{
          backgroundColor: 'var(--neko-surface)',
          borderLeft: '1px solid var(--neko-border)',
          width,
        }}
      >
        <PanelHeader title={t('panel.connection')} />
        <ConnectionProperties connection={conn} onUpdate={onUpdateConnection} />
      </div>
    );
  }

  if (selectedNodes.length === 0) {
    return (
      <div
        className="flex flex-col h-full"
        style={{
          backgroundColor: 'var(--neko-surface)',
          borderLeft: '1px solid var(--neko-border)',
          width,
        }}
      >
        <PanelHeader title={t('panel.properties')} />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs" style={{ color: 'var(--neko-fg-secondary)' }}>
            {t('panel.noSelection')}
          </p>
        </div>
      </div>
    );
  }

  const isMulti = selectedNodes.length > 1;
  const node = selectedNodes[0]!;
  const transformAdapter = mapCanvasNodeTransformToProperties(node, t);
  const handleTransformChange = (propertyId: string, value: PropertyValue): void => {
    const updates = mapCanvasNodePropertyCommit(node, propertyId, value);
    if (Object.keys(updates).length > 0) {
      onUpdateNode(node.id, updates);
    }
  };

  // Creator nodes (shot/scene/gallery) collapse technical fields by default
  const isCreatorNode = node.type === 'shot' || node.type === 'scene' || node.type === 'gallery';

  return (
    <div
      className="flex flex-col h-full overflow-y-auto"
      style={{
        backgroundColor: 'var(--neko-surface)',
        borderLeft: '1px solid var(--neko-border)',
        width,
        minWidth: 200,
        maxWidth: 400,
      }}
    >
      <PanelHeader
        title={
          isMulti
            ? t('panel.multiSelected', { count: selectedNodes.length })
            : getNodeLabel(NODE_TYPE_DESCRIPTORS, node.type as CanvasNodeType, t)
        }
      />

      {isMulti ? (
        <MultiSelectionInfo nodes={selectedNodes} />
      ) : (
        <>
          {/* Node-specific properties */}
          <NodeSpecificProperties
            node={node}
            onUpdateData={(data) => onUpdateNodeData(node.id, data)}
            onAction={(action, payload) => onAction?.(node.id, action, payload)}
          />

          {/* Technical sections — hidden for creator nodes */}
          {!isCreatorNode && (
            <>
              <CanvasSection title={t('panel.transform')}>
                <SharedPropertyPanel
                  properties={transformAdapter.properties}
                  onCommit={handleTransformChange}
                  onPreviewChange={handleTransformChange}
                />
              </CanvasSection>

              <CanvasSection title={t('panel.layer')}>
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
              </CanvasSection>

              {onUpdatePorts && <PortEditor node={node} onUpdatePorts={onUpdatePorts} />}
            </>
          )}

          {/* Actions */}
          <CanvasSection title={t('panel.actions')}>
            <Button
              className="w-full"
              leadingIcon={<Codicon name="trash" />}
              size="sm"
              variant="danger"
              onClick={() => onDeleteNode(node.id)}
            >
              {t('menu.delete')}
            </Button>
          </CanvasSection>
        </>
      )}
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function PanelHeader({ title }: { title: string }) {
  return <div className="neko-panel-header">{title}</div>;
}

function CanvasSection({
  children,
  defaultExpanded = true,
  title,
}: {
  readonly children: React.ReactNode;
  readonly defaultExpanded?: boolean;
  readonly title: string;
}) {
  return (
    <Collapsible
      defaultOpen={defaultExpanded}
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

function CollapsibleSection({
  children,
  defaultExpanded = true,
  title,
}: {
  readonly children: React.ReactNode;
  readonly defaultExpanded?: boolean;
  readonly title: string;
}) {
  return (
    <CanvasSection defaultExpanded={defaultExpanded} title={title}>
      {children}
    </CanvasSection>
  );
}

function Codicon({ name }: { readonly name: Parameters<typeof toCodiconClassName>[0] }) {
  return <span aria-hidden="true" className={toCodiconClassName(name)} />;
}

function MultiSelectionInfo({ nodes }: { nodes: CanvasNode[] }) {
  const typeCounts = new Map<string, number>();
  for (const node of nodes) {
    typeCounts.set(node.type, (typeCounts.get(node.type) ?? 0) + 1);
  }

  return (
    <div className="px-3 py-3">
      <p className="text-xs mb-2" style={{ color: 'var(--neko-fg-secondary)' }}>
        {t('panel.multiSelected', { count: nodes.length })}
      </p>
      <div className="space-y-1">
        {Array.from(typeCounts.entries()).map(([type, count]) => (
          <div
            key={type}
            className="flex items-center justify-between text-xs"
            style={{ color: 'var(--neko-fg)' }}
          >
            <span>{getNodeLabel(NODE_TYPE_DESCRIPTORS, type as CanvasNodeType, t)}</span>
            <span style={{ color: 'var(--neko-fg-secondary)' }}>×{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NodeSpecificProperties({ node, onUpdateData, onAction }: NodeSpecificPropertiesProps) {
  const referenceSummary = summarizeReferencesFromCanvasNode(node);
  const referenceSection =
    referenceSummary.total > 0 ? <ReferenceSummarySection node={node} /> : null;
  if (node.content) {
    return (
      <>
        {referenceSection}
        <ComposableNodeProperties node={node} onUpdateData={onUpdateData} onAction={onAction} />
      </>
    );
  }

  return (
    <>
      {referenceSection}
      {renderNodeSpecificProperties(NODE_PROPERTIES_RENDERERS, { node, onUpdateData, onAction })}
    </>
  );
}

export function ReferenceSummarySection({ node }: { readonly node: CanvasNode }) {
  const summary = summarizeReferencesFromCanvasNode(node);
  if (summary.total === 0) return null;
  return (
    <CollapsibleSection title="References">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span style={{ color: 'var(--neko-fg-secondary)' }}>Total</span>
          <span style={{ color: 'var(--neko-fg)' }}>{summary.total}</span>
        </div>
        <div className="space-y-1">
          {summary.groups.map((group) => (
            <div
              key={`${group.role}:${group.modality}`}
              className="flex min-w-0 items-center justify-between gap-2 rounded border px-2 py-1 text-xs"
              style={{
                backgroundColor: 'var(--control-bg)',
                borderColor: 'var(--control-border)',
                color: 'var(--control-fg)',
              }}
            >
              <span className="truncate">{referenceGroupLabel(group.role)}</span>
              <span
                className="flex-shrink-0 text-[10px]"
                style={{ color: 'var(--neko-fg-secondary)' }}
              >
                {group.modality} x{group.count}
              </span>
            </div>
          ))}
        </div>
        {summary.diagnostics.length > 0 ? (
          <div className="space-y-1">
            {summary.diagnostics.slice(0, 3).map((item, index) => (
              <div
                key={`${item.code}:${index}`}
                className="rounded px-2 py-1 text-[10px] leading-snug"
                style={{
                  backgroundColor:
                    item.severity === 'error' ? 'var(--danger-soft)' : 'var(--control-bg)',
                  color:
                    item.severity === 'error' ? 'var(--neko-danger)' : 'var(--neko-fg-secondary)',
                }}
              >
                {item.message}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </CollapsibleSection>
  );
}

function referenceGroupLabel(role: string): string {
  return role
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function AnnotationNodeProperties({ node, onUpdateData }: NodeSpecificPropertiesProps) {
  const data = node.data as Record<string, unknown>;
  return (
    <CollapsibleSection title={t('panel.content')}>
      <textarea
        className="w-full text-xs px-2 py-1.5 rounded border outline-none resize-none"
        style={{
          backgroundColor: 'var(--control-bg)',
          borderColor: 'var(--control-border)',
          color: 'var(--control-fg)',
          minHeight: 60,
        }}
        value={(data.content as string) ?? ''}
        onChange={(e) => onUpdateData({ content: e.target.value })}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--node-selected)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'var(--control-border)';
        }}
      />
    </CollapsibleSection>
  );
}

export function StoryboardNodeProperties({ node, onUpdateData }: NodeSpecificPropertiesProps) {
  const data = node.data as Record<string, unknown>;
  return (
    <CollapsibleSection title={t('panel.storyboard')}>
      <div className="space-y-2">
        <div>
          <label className="text-xs block mb-1" style={{ color: 'var(--neko-fg-secondary)' }}>
            {t('panel.title')}
          </label>
          <input
            type="text"
            className="w-full text-xs px-2 py-1 rounded border outline-none"
            style={{
              backgroundColor: 'var(--control-bg)',
              borderColor: 'var(--control-border)',
              color: 'var(--control-fg)',
            }}
            value={(data.title as string) ?? ''}
            onChange={(e) => onUpdateData({ title: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs block mb-1" style={{ color: 'var(--neko-fg-secondary)' }}>
            {t('panel.description')}
          </label>
          <textarea
            className="w-full text-xs px-2 py-1.5 rounded border outline-none resize-none"
            style={{
              backgroundColor: 'var(--control-bg)',
              borderColor: 'var(--control-border)',
              color: 'var(--control-fg)',
              minHeight: 40,
            }}
            value={(data.description as string) ?? ''}
            onChange={(e) => onUpdateData({ description: e.target.value })}
          />
        </div>
      </div>
    </CollapsibleSection>
  );
}

export function TextNodeProperties({ node, onUpdateData }: NodeSpecificPropertiesProps) {
  const data = node.data as Record<string, unknown>;
  const textStyle = (data.style as Record<string, unknown>) ?? {};
  return (
    <CollapsibleSection title={t('panel.textStyle')}>
      <div className="space-y-2">
        <div>
          <label className="text-xs block mb-1" style={{ color: 'var(--neko-fg-secondary)' }}>
            {t('panel.fontSize')}
          </label>
          <select
            className="w-full text-xs px-2 py-1 rounded border outline-none"
            style={{
              backgroundColor: 'var(--control-bg)',
              borderColor: 'var(--control-border)',
              color: 'var(--control-fg)',
            }}
            value={(textStyle.fontSize as number) ?? 14}
            onChange={(e) =>
              onUpdateData({
                style: { ...textStyle, fontSize: Number(e.target.value) },
              })
            }
          >
            {[10, 12, 14, 16, 18, 20, 24, 28, 32].map((s) => (
              <option key={s} value={s}>
                {s}px
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs" style={{ color: 'var(--neko-fg-secondary)' }}>
            {t('panel.fontWeight')}
          </label>
          <button
            className="text-xs px-2 py-0.5 rounded border transition-colors"
            style={{
              backgroundColor:
                textStyle.fontWeight === 'bold' ? 'var(--node-selected)' : 'var(--control-bg)',
              borderColor: 'var(--control-border)',
              color: textStyle.fontWeight === 'bold' ? 'var(--neko-fg)' : 'var(--control-fg)',
              fontWeight: 'bold',
            }}
            onClick={() =>
              onUpdateData({
                style: {
                  ...textStyle,
                  fontWeight: textStyle.fontWeight === 'bold' ? 'normal' : 'bold',
                },
              })
            }
          >
            B
          </button>
        </div>
        <div>
          <label className="text-xs block mb-1" style={{ color: 'var(--neko-fg-secondary)' }}>
            {t('panel.textAlign')}
          </label>
          <div className="flex gap-1">
            {(['left', 'center', 'right'] as const).map((align) => (
              <button
                key={align}
                style={{
                  flex: 1,
                  fontSize: 11,
                  padding: '3px 0',
                  borderRadius: 5,
                  border: '1px solid',
                  cursor: 'pointer',
                  transition: 'background 0.15s, border-color 0.15s',
                  backgroundColor:
                    (textStyle.textAlign ?? 'left') === align
                      ? 'var(--selection-bg)'
                      : 'var(--control-bg)',
                  borderColor:
                    (textStyle.textAlign ?? 'left') === align
                      ? 'var(--selection-border)'
                      : 'var(--control-border)',
                  color:
                    (textStyle.textAlign ?? 'left') === align
                      ? 'var(--badge-fg)'
                      : 'var(--neko-fg)',
                }}
                onClick={() => onUpdateData({ style: { ...textStyle, textAlign: align } })}
              >
                {align.charAt(0).toUpperCase() + align.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs" style={{ color: 'var(--neko-fg-secondary)' }}>
            {t('panel.textColor')}
          </label>
          <input
            type="color"
            className="w-6 h-6 rounded cursor-pointer border-0 p-0"
            value={(textStyle.color as string) ?? '#e5e5e5'}
            onChange={(e) => onUpdateData({ style: { ...textStyle, color: e.target.value } })}
          />
        </div>
      </div>
    </CollapsibleSection>
  );
}

export function GroupNodeProperties({ node, onUpdateData }: NodeSpecificPropertiesProps) {
  const data = node.data as Record<string, unknown>;
  const childIds = getContainerChildIds(node);
  return (
    <CollapsibleSection title={t('panel.group')}>
      <div className="space-y-2">
        <div>
          <label className="text-xs block mb-1" style={{ color: 'var(--neko-fg-secondary)' }}>
            {t('panel.groupLabel')}
          </label>
          <input
            type="text"
            className="w-full text-xs px-2 py-1 rounded border outline-none"
            style={{
              backgroundColor: 'var(--control-bg)',
              borderColor: 'var(--control-border)',
              color: 'var(--control-fg)',
            }}
            value={(data.label as string) ?? ''}
            onChange={(e) => onUpdateData({ label: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs" style={{ color: 'var(--neko-fg-secondary)' }}>
            {t('panel.groupColor')}
          </label>
          <input
            type="color"
            className="w-6 h-6 rounded cursor-pointer border-0 p-0"
            value={(data.color as string) ?? '#6b7280'}
            onChange={(e) => onUpdateData({ color: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs block mb-1" style={{ color: 'var(--neko-fg-secondary)' }}>
            {t('panel.groupChildren')} ({childIds.length})
          </label>
          <div className="space-y-0.5 max-h-[120px] overflow-auto">
            {childIds.length === 0 ? (
              <span className="text-[10px] italic" style={{ color: 'var(--neko-fg-secondary)' }}>
                {t('group.empty')}
              </span>
            ) : (
              childIds.map((id) => (
                <div
                  key={id}
                  className="text-[10px] px-1.5 py-0.5 rounded truncate"
                  style={{
                    backgroundColor: 'var(--control-bg)',
                    color: 'var(--control-fg)',
                  }}
                >
                  {id.slice(-8)}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </CollapsibleSection>
  );
}

export function ComposableNodeProperties({
  node,
  onUpdateData,
  onAction,
}: NodeSpecificPropertiesProps) {
  const items = enumerateComposablePropertyItems(node);
  const fieldItems = items.filter((item) => item.kind === 'field');
  const collectionItems = items.filter((item) => item.kind === 'collection');
  const previewItems = items.filter((item) => item.kind === 'preview');
  const actionItems = items.filter((item) => item.kind === 'action');

  return (
    <>
      {fieldItems.length > 0 && (
        <CollapsibleSection title={t('panel.content')}>
          <div className="space-y-2">
            {fieldItems.map((item) => (
              <ComposableFieldEditor
                key={`${item.blockId}:${item.binding.path}`}
                item={item}
                onChange={(value) =>
                  onUpdateData(writeComposablePropertyBinding(node, item.binding, value))
                }
              />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {collectionItems.map((item) => (
        <ComposableCollectionEditor
          key={item.blockId}
          node={node}
          item={item}
          onUpdateData={onUpdateData}
        />
      ))}

      {previewItems.length > 0 && (
        <CollapsibleSection title="Preview" defaultExpanded={false}>
          <div className="space-y-1 text-xs" style={{ color: 'var(--neko-fg-secondary)' }}>
            {previewItems.map((item) => (
              <div key={item.blockId} className="flex justify-between gap-2">
                <span>{item.label}</span>
                <span className="truncate" style={{ color: 'var(--neko-fg)' }}>
                  {item.role}
                </span>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {actionItems.length > 0 && (
        <CollapsibleSection title={t('panel.actions')} defaultExpanded={false}>
          <div className="space-y-1">
            {actionItems.map((item) => {
              const disabledReason = resolveComposableActionDisabledReason(node, item);
              return (
                <button
                  key={item.blockId}
                  type="button"
                  className="w-full rounded border px-2 py-1 text-xs disabled:opacity-55"
                  style={{
                    borderColor: 'var(--control-border)',
                    backgroundColor: 'var(--control-bg)',
                    color: 'var(--control-fg)',
                  }}
                  disabled={Boolean(disabledReason)}
                  title={disabledReason}
                  onClick={() => onAction?.(item.action, { blockId: item.blockId })}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </CollapsibleSection>
      )}
    </>
  );
}

function resolveComposableActionDisabledReason(
  node: CanvasNode,
  item: Extract<ComposablePropertyItem, { kind: 'action' }>,
): string | undefined {
  return resolveComposableActionDisabledReasonPath(node, item.disabledReasonPath);
}

export function resolveComposableActionDisabledReasonPath(
  node: CanvasNode,
  disabledReasonPath: string | undefined,
): string | undefined {
  const path = toJsonPointerPath(disabledReasonPath);
  if (!path) return undefined;
  const result = readFieldBinding(node.data, {
    path,
    valueType: 'unknown',
  });
  return hasBlockingActionValue(result.value) ? path : undefined;
}

function hasBlockingActionValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return Boolean(value);
}

function toJsonPointerPath(value: string | undefined): JsonPointerPath | undefined {
  if (value === '' || value?.startsWith('/')) return value as JsonPointerPath;
  return undefined;
}

function ComposableFieldEditor({
  item,
  onChange,
}: {
  item: Extract<ComposablePropertyItem, { kind: 'field' }>;
  onChange: (value: unknown) => void;
}) {
  if (item.blockKind === 'textarea') {
    return (
      <TextareaField
        label={item.label}
        value={toEditableString(item.value)}
        onChange={(value) => onChange(value)}
        minHeight={72}
      />
    );
  }

  if (item.blockKind === 'select') {
    return (
      <SelectField
        label={item.label}
        value={toEditableString(item.value)}
        options={(item.options ?? []).map((option) => ({
          value: option,
          label: resolveCanvasOptionLabel(item.binding.path, option),
        }))}
        onChange={(value) => onChange(value || undefined)}
      />
    );
  }

  if (item.blockKind === 'number' || item.binding.valueType === 'number') {
    return (
      <div>
        <FieldLabel>{item.label}</FieldLabel>
        <input
          type="number"
          className="w-full text-xs px-2 py-1 rounded border outline-none"
          style={{
            backgroundColor: 'var(--control-bg)',
            borderColor: 'var(--control-border)',
            color: 'var(--control-fg)',
          }}
          value={typeof item.value === 'number' ? item.value : Number(item.value) || 0}
          disabled={item.readOnly}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </div>
    );
  }

  if (
    item.blockKind === 'tag-list' ||
    item.blockKind === 'list' ||
    item.binding.valueType === 'array'
  ) {
    return (
      <TextField
        label={item.label}
        value={arrayToEditableString(item.value)}
        onChange={(value) => onChange(splitEditableList(value))}
      />
    );
  }

  if (item.readOnly || item.blockKind === 'status' || item.blockKind === 'asset-preview') {
    return (
      <div>
        <FieldLabel>{item.label}</FieldLabel>
        <div
          className="truncate rounded border px-2 py-1 text-xs"
          style={{
            backgroundColor: 'var(--control-bg)',
            borderColor: 'var(--control-border)',
            color: 'var(--neko-fg-secondary)',
          }}
        >
          {resolveCanvasOptionLabel(item.binding.path, toEditableString(item.value))}
        </div>
      </div>
    );
  }

  return <TextField label={item.label} value={toEditableString(item.value)} onChange={onChange} />;
}

function ComposableCollectionEditor({
  node,
  item,
  onUpdateData,
}: {
  node: CanvasNode;
  item: Extract<ComposablePropertyItem, { kind: 'collection' }>;
  onUpdateData: (data: Record<string, unknown>) => void;
}) {
  const editorBlocks = getCollectionItemEditorBlocks(item.collection);
  const readOnly = item.collection.source.mode === 'read';

  const handleAddItem = useCallback(() => {
    if (readOnly) {
      return;
    }
    const newItem: Record<string, unknown> = {
      id: `cell-${Date.now()}-${item.items.length}`,
      label: '',
      generationStatus: 'idle',
    };
    const nextArray = [...item.items, newItem];
    onUpdateData(
      writeComposablePropertyBinding(
        node,
        { path: item.collection.source.path, mode: 'readwrite' },
        nextArray,
      ),
    );
  }, [node, item, onUpdateData, readOnly]);

  const handleRemoveItem = useCallback(
    (index: number) => {
      if (readOnly) {
        return;
      }
      const nextArray = item.items.filter((_, i) => i !== index);
      onUpdateData(
        writeComposablePropertyBinding(
          node,
          { path: item.collection.source.path, mode: 'readwrite' },
          nextArray,
        ),
      );
    },
    [node, item, onUpdateData, readOnly],
  );

  return (
    <CollapsibleSection title={item.label} defaultExpanded={false}>
      <div className="space-y-2">
        {item.items.length === 0 ? (
          <span className="text-[10px] italic" style={{ color: 'var(--neko-fg-secondary)' }}>
            {item.collection.emptyLabel ?? 'Empty'}
          </span>
        ) : (
          item.items.map((entry, index) => (
            <div key={readCollectionKey(entry, item.collection, index)} className="space-y-1">
              <div className="flex items-center justify-between">
                <FieldLabel>{readCollectionLabel(entry, item.collection, index)}</FieldLabel>
                {!readOnly && (
                  <button
                    type="button"
                    className="text-[10px] px-1 rounded hover:bg-[var(--neko-bg-hover)]"
                    style={{ color: 'var(--neko-fg-secondary)' }}
                    onClick={() => handleRemoveItem(index)}
                    title={t('collection.removeItem')}
                  >
                    x
                  </button>
                )}
              </div>
              {editorBlocks.map((block) => (
                <CollectionItemField
                  key={block.id}
                  node={node}
                  collection={item.collection}
                  entry={entry}
                  itemIndex={index}
                  block={block}
                  onUpdateData={onUpdateData}
                />
              ))}
            </div>
          ))
        )}
        {!readOnly && (
          <button
            type="button"
            className="w-full text-[10px] py-1 rounded border border-dashed hover:bg-[var(--neko-bg-hover)]"
            style={{ color: 'var(--neko-fg-secondary)', borderColor: 'var(--neko-border)' }}
            onClick={handleAddItem}
          >
            + {t('collection.addItem')}
          </button>
        )}
      </div>
    </CollapsibleSection>
  );
}

function CollectionItemField({
  node,
  collection,
  entry,
  itemIndex,
  block,
  onUpdateData,
}: {
  node: CanvasNode;
  collection: CollectionView;
  entry: unknown;
  itemIndex: number;
  block: CanvasBlock;
  onUpdateData: (data: Record<string, unknown>) => void;
}) {
  const binding = block.binding;
  if (!binding) {
    return null;
  }

  const path = joinCollectionItemPath(collection.source.path, itemIndex, binding.path);
  const value = readCollectionPathString(entry, binding.path);
  const readOnly = collection.source.mode === 'read' || binding.mode === 'read';
  const handleChange = (nextValue: string) =>
    onUpdateData(
      writeComposablePropertyPath(
        node,
        path,
        normalizeCollectionEditorValue(nextValue, binding, collection),
      ),
    );

  if (readOnly) {
    return (
      <div>
        <FieldLabel>{resolveComposableLabel(block.label ?? block.id)}</FieldLabel>
        <div
          className="whitespace-pre-wrap break-words rounded border px-2 py-1 text-xs"
          style={{
            backgroundColor: 'var(--control-bg)',
            borderColor: 'var(--control-border)',
            color: 'var(--neko-fg-secondary)',
          }}
        >
          {value || '-'}
        </div>
      </div>
    );
  }

  if (block.kind === 'textarea') {
    return (
      <TextareaField
        label={resolveComposableLabel(block.label ?? block.id)}
        value={value}
        onChange={handleChange}
        minHeight={48}
      />
    );
  }

  return (
    <TextField
      label={resolveComposableLabel(block.label ?? block.id)}
      value={value}
      onChange={handleChange}
    />
  );
}

export function createBuiltInNodePropertiesRendererRegistry(): NodePropertiesRendererRegistry {
  return {
    annotation: AnnotationNodeProperties,
    storyboard: StoryboardNodeProperties,
    text: TextNodeProperties,
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

const NODE_PROPERTIES_RENDERERS = createBuiltInNodePropertiesRendererRegistry();
const NODE_TYPE_DESCRIPTORS = createBuiltInNodeTypeDescriptors();

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-xs block mb-1" style={{ color: 'var(--neko-fg-secondary)' }}>
      {children}
    </label>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  minHeight = 52,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  minHeight?: number;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <textarea
        className="w-full text-xs px-2 py-1.5 rounded border outline-none resize-none"
        style={{
          backgroundColor: 'var(--control-bg)',
          borderColor: 'var(--control-border)',
          color: 'var(--control-fg)',
          minHeight,
        }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--node-selected)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'var(--control-border)';
        }}
      />
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        type="text"
        className="w-full text-xs px-2 py-1 rounded border outline-none"
        style={{
          backgroundColor: 'var(--control-bg)',
          borderColor: 'var(--control-border)',
          color: 'var(--control-fg)',
        }}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--node-selected)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'var(--control-border)';
        }}
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <select
        className="w-full text-xs px-2 py-1 rounded border outline-none"
        style={{
          backgroundColor: 'var(--control-bg)',
          borderColor: 'var(--control-border)',
          color: 'var(--control-fg)',
        }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ConnectionProperties({
  connection,
  onUpdate,
}: {
  connection: CanvasConnection;
  onUpdate?: (id: string, updates: Partial<CanvasConnection>) => void;
}) {
  return (
    <>
      <CollapsibleSection title={t('panel.connectionLabel')}>
        <input
          type="text"
          className="w-full text-xs px-2 py-1 rounded border outline-none"
          style={{
            backgroundColor: 'var(--control-bg)',
            borderColor: 'var(--control-border)',
            color: 'var(--control-fg)',
          }}
          value={connection.label ?? ''}
          placeholder={t('panel.connectionLabelPlaceholder')}
          onChange={(e) => onUpdate?.(connection.id, { label: e.target.value || undefined })}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--node-selected)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--control-border)';
          }}
        />
      </CollapsibleSection>

      <CollapsibleSection title={t('panel.connectionType')}>
        <select
          className="w-full text-xs px-2 py-1 rounded border outline-none"
          style={{
            backgroundColor: 'var(--control-bg)',
            borderColor: 'var(--control-border)',
            color: 'var(--control-fg)',
          }}
          value={connection.type ?? 'default'}
          onChange={(e) => onUpdate?.(connection.id, { type: e.target.value as ConnectionType })}
        >
          <option value="default">{resolveConnectionTypeLabel('default')}</option>
          <option value="sequence">{resolveConnectionTypeLabel('sequence')}</option>
          <option value="reference">{resolveConnectionTypeLabel('reference')}</option>
        </select>
      </CollapsibleSection>

      <CollapsibleSection title={t('panel.connectionInfo')}>
        <div className="space-y-1 text-xs" style={{ color: 'var(--neko-fg-secondary)' }}>
          <div className="flex justify-between">
            <span>ID</span>
            <span className="truncate max-w-[120px]" style={{ color: 'var(--neko-fg)' }}>
              {connection.id.slice(-8)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>{t('connection.source')}</span>
            <span className="truncate max-w-[120px]" style={{ color: 'var(--neko-fg)' }}>
              {connection.sourceId.slice(-8)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>{t('connection.target')}</span>
            <span className="truncate max-w-[120px]" style={{ color: 'var(--neko-fg)' }}>
              {connection.targetId.slice(-8)}
            </span>
          </div>
        </div>
      </CollapsibleSection>
    </>
  );
}

// =============================================================================
// Helpers
// =============================================================================

// getNodeTypeLabel removed — now sourced from NodeTypeDescriptorRegistry via getNodeLabel()

export function enumerateComposablePropertyItems(node: CanvasNode): ComposablePropertyItem[] {
  if (!node.content) {
    return [];
  }

  const items: ComposablePropertyItem[] = [];

  for (const action of getContainerActionDescriptors(node)) {
    items.push({
      kind: 'action',
      blockId: `container-action:${action.id}`,
      label: resolveComposableLabel(action.label),
      action: action.id,
    });
  }

  for (const block of collectComposableBlocks(node.content)) {
    if (block.binding) {
      const value = readFieldBinding(node.data, block.binding).value;
      items.push({
        kind: 'field',
        blockId: block.id,
        label: resolveComposableLabel(block.label ?? block.id),
        blockKind: block.kind,
        binding: block.binding,
        value,
        options: getStringArrayMetadata(block, 'options'),
        readOnly: block.binding.mode === 'read',
      });
    }

    if (block.collection) {
      const value = readFieldBinding(node.data, block.collection.source).value;
      items.push({
        kind: 'collection',
        blockId: block.id,
        label: resolveComposableLabel(block.label ?? block.collection.id),
        collection: block.collection,
        items: Array.isArray(value) ? value : [],
      });
    }

    if (block.kind === 'button') {
      const action = getStringMetadata(block, 'action');
      if (action) {
        items.push({
          kind: 'action',
          blockId: block.id,
          label: resolveComposableLabel(block.label ?? action),
          action,
          disabledReasonPath: getStringMetadata(block, 'disabledReasonPath'),
          requiresCapability: getStringMetadata(block, 'requiresCapability'),
        });
      }
    }

    for (const capability of block.capabilities ?? []) {
      if (capability.kind === 'delegate') {
        for (const action of capability.actions) {
          items.push({
            kind: 'action',
            blockId: `${block.id}:${action.id}`,
            label: resolveComposableLabel(action.label),
            action: action.id,
          });
        }
      }

      if (
        capability.kind === 'preview' ||
        capability.kind === 'generation-preview' ||
        capability.kind === 'collection-preview' ||
        capability.kind === 'asset-identity'
      ) {
        items.push({
          kind: 'preview',
          blockId: `${block.id}:${capability.kind}`,
          label: resolveComposableLabel(block.label ?? block.id),
          role: capability.kind,
        });
      }
    }
  }

  return items;
}

function resolveComposableLabel(label: string): string {
  return isComposableI18nKey(label) ? t(label) : label;
}

function isComposableI18nKey(label: string): boolean {
  return label.startsWith('preset.') || label.startsWith('preview.');
}

export function writeComposablePropertyBinding(
  node: CanvasNode,
  binding: FieldBinding,
  value: unknown,
): Record<string, unknown> {
  const written = writeFieldBinding(node.data, binding, value);
  return isRecord(written.data) ? written.data : (node.data as Record<string, unknown>);
}

export function writeComposablePropertyPath(
  node: CanvasNode,
  path: JsonPointerPath,
  value: unknown,
): Record<string, unknown> {
  return writeComposablePropertyBinding(node, { path, mode: 'readwrite' }, value);
}

function collectComposableBlocks(content: NonNullable<CanvasNode['content']>): CanvasBlock[] {
  const blocks: CanvasBlock[] = [];
  const sections = [content];

  while (sections.length > 0) {
    const section = sections.shift();
    if (!section) continue;

    for (const block of section.blocks ?? []) {
      blocks.push(block);
      blocks.push(...collectNestedBlocks(block));
    }

    for (const slot of section.childSlots ?? []) {
      blocks.push({
        id: slot.id,
        kind: 'child-node-slot',
        label: slot.emptyLabel ?? slot.id,
        childSlot: slot,
      });
    }

    sections.push(...(section.sections ?? []));
  }

  return blocks;
}

function collectNestedBlocks(block: CanvasBlock): CanvasBlock[] {
  const nested: CanvasBlock[] = [];
  for (const child of block.children ?? []) {
    nested.push(child, ...collectNestedBlocks(child));
  }
  return nested;
}

function getStringArrayMetadata(block: CanvasBlock, key: string): string[] | undefined {
  const value = block.metadata?.[key];
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((entry): entry is string => typeof entry === 'string');
}

function getStringMetadata(block: CanvasBlock, key: string): string | undefined {
  const value = block.metadata?.[key];
  return typeof value === 'string' ? value : undefined;
}

function toEditableString(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return arrayToEditableString(value);
  }

  return JSON.stringify(value);
}

function arrayToEditableString(value: unknown): string {
  if (!Array.isArray(value)) {
    return toEditableString(value);
  }

  return value.map((entry) => toEditableString(entry)).join(', ');
}

function splitEditableList(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function readCollectionKey(entry: unknown, collection: CollectionView, index: number): string {
  const keyPath = collection.itemKeyPath ?? '/id';
  const value = isRecord(entry) ? readShallowPath(entry, keyPath) : undefined;
  return typeof value === 'string' && value.length > 0 ? value : String(index);
}

function readCollectionLabel(entry: unknown, collection: CollectionView, index: number): string {
  const labelPath = collection.itemLabelPath ?? '/label';
  const value = isRecord(entry) ? readShallowPath(entry, labelPath) : undefined;
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  const key = isRecord(entry) ? readShallowPath(entry, collection.itemKeyPath ?? '/id') : undefined;
  return typeof key === 'string' && key.length > 0 ? key : `Item ${index + 1}`;
}

function getCollectionItemEditorBlocks(collection: CollectionView): CanvasBlock[] {
  if (collection.itemBlocks && collection.itemBlocks.length > 0) {
    return collection.itemBlocks.filter((block) => block.binding);
  }

  const blocks: CanvasBlock[] = [];
  if (collection.itemLabelPath) {
    blocks.push({
      id: `${collection.id}-label`,
      kind: 'input',
      label: 'Label',
      binding: { path: collection.itemLabelPath, valueType: 'string' },
    });
  }

  if (collection.itemPreviewPath) {
    blocks.push({
      id: `${collection.id}-preview`,
      kind: 'input',
      label: 'Preview',
      binding: { path: collection.itemPreviewPath, valueType: 'asset' },
    });
  }

  return blocks;
}

function joinCollectionItemPath(
  collectionPath: JsonPointerPath,
  index: number,
  itemPath: JsonPointerPath,
): JsonPointerPath {
  const itemSuffix = itemPath.startsWith('/') ? itemPath : `/${itemPath}`;
  return `${collectionPath}/${index}${itemSuffix}` as JsonPointerPath;
}

function normalizeCollectionEditorValue(
  value: string,
  binding: FieldBinding,
  collection: CollectionView,
): string | undefined {
  if (value.length > 0 || binding.required || binding.path === collection.itemLabelPath) {
    return value;
  }

  return undefined;
}

function readCollectionPathString(entry: unknown, path: JsonPointerPath): string {
  if (!isRecord(entry)) {
    return '';
  }

  const value = readShallowPath(entry, path);
  return toEditableString(value);
}

function readShallowPath(entry: Record<string, unknown>, path: JsonPointerPath): unknown {
  const keys = path
    .replace(/^\//, '')
    .split('/')
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
  let current: unknown = entry;
  for (const key of keys) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
