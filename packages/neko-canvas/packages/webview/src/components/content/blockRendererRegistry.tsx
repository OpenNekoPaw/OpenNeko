import React from 'react';
import {
  isResourceRef,
  parseDocumentArchiveResourceRef,
  type CanvasBlock,
  type FieldBinding,
  type JsonPointerPath,
} from '@neko/shared';
import { readNodeBinding } from './fieldBinding';
import type { BlockRendererContext, BlockRendererRegistry } from './types';
import { PreviewSurface, isSafeWebviewUrl, type PreviewSourceDescriptor } from '../../preview';
import { NodeCard } from './node-card';
import { t } from '../../i18n';
import { resolveCanvasOptionLabel } from '../../i18n/canvasValueLabels';
import { projectShotCharacterEntityReference } from './shotEntityReference';
import {
  confirmCanvasEntityCandidate,
  inspectCanvasEntity,
  requestCanvasEntitySummary,
} from './canvasEntityRouteClient';

const FORM_CONTROL_CLASS =
  'min-w-0 rounded border border-[var(--node-border)] bg-white px-2 py-1 text-gray-900 outline-none focus:border-[var(--node-selected)] disabled:bg-gray-100 disabled:text-gray-500';

const TEXTAREA_CONTROL_CLASS =
  'min-h-[64px] flex-1 resize-none rounded border border-[var(--node-border)] bg-white px-2 py-1 text-gray-900 outline-none focus:border-[var(--node-selected)] disabled:bg-gray-100 disabled:text-gray-500';

export function createBuiltInBlockRendererRegistry(): BlockRendererRegistry {
  return {
    text: renderTextBlock,
    'editable-text': renderEditableTextBlock,
    input: renderInputBlock,
    textarea: renderTextareaBlock,
    number: renderNumberBlock,
    status: renderStatusBlock,
    'tag-list': renderTagListBlock,
    'asset-preview': renderAssetPreviewBlock,
    button: renderButtonBlock,
    list: renderListBlock,
    'key-value': renderKeyValueBlock,
    collection: renderCollectionBlock,
    projection: renderProjectionBlock,
    'child-node-slot': renderChildNodeSlotBlock,
    select: renderSelectBlock,
    custom: renderCustomBlock,
  };
}

export function renderCanvasBlock(
  registry: BlockRendererRegistry,
  context: BlockRendererContext,
): React.ReactNode {
  const renderer = registry[context.block.kind] ?? renderDefaultBlock;
  return renderer(context);
}

function renderTextBlock(context: BlockRendererContext): React.ReactNode {
  const value = getBlockValue(context);
  return (
    <div className="text-xs leading-snug text-[var(--node-fg)] whitespace-pre-wrap break-words">
      {stringifyValue(value, resolveLabel(context.block.label))}
    </div>
  );
}

function renderEditableTextBlock(context: BlockRendererContext): React.ReactNode {
  return renderTextareaBlock(context);
}

function renderInputBlock(context: BlockRendererContext): React.ReactNode {
  const value = getBlockValue(context);
  return (
    <label className="flex flex-col gap-1 text-xs text-[var(--node-fg-secondary)]">
      {context.block.label && <span>{resolveLabel(context.block.label)}</span>}
      <input
        className={FORM_CONTROL_CLASS}
        value={toInputValue(value)}
        disabled={!isWritable(context.block.binding)}
        onMouseDown={(event) => event.stopPropagation()}
        onChange={(event) => updateBinding(context, event.target.value)}
      />
    </label>
  );
}

function renderTextareaBlock(context: BlockRendererContext): React.ReactNode {
  const value = getBlockValue(context);
  return (
    <label className="flex min-h-0 flex-1 basis-0 flex-col gap-1 text-xs text-[var(--node-fg-secondary)]">
      {context.block.label && <span>{resolveLabel(context.block.label)}</span>}
      <textarea
        className={TEXTAREA_CONTROL_CLASS}
        value={toInputValue(value)}
        disabled={!isWritable(context.block.binding)}
        onMouseDown={(event) => event.stopPropagation()}
        onChange={(event) => updateBinding(context, event.target.value)}
      />
    </label>
  );
}

function renderNumberBlock(context: BlockRendererContext): React.ReactNode {
  const value = getBlockValue(context);
  return (
    <label className="flex flex-col gap-1 text-xs text-[var(--node-fg-secondary)]">
      {context.block.label && <span>{resolveLabel(context.block.label)}</span>}
      <input
        type="number"
        className={FORM_CONTROL_CLASS}
        value={typeof value === 'number' ? value : Number(value) || 0}
        disabled={!isWritable(context.block.binding)}
        onMouseDown={(event) => event.stopPropagation()}
        onChange={(event) => updateBinding(context, Number(event.target.value))}
      />
    </label>
  );
}

function renderSelectBlock(context: BlockRendererContext): React.ReactNode {
  const value = getBlockValue(context);
  const options = getStringArrayMetadata(context.block, 'options');
  const path = context.block.binding?.path;
  return (
    <label className="flex flex-col gap-1 text-xs text-[var(--node-fg-secondary)]">
      {context.block.label && <span>{resolveLabel(context.block.label)}</span>}
      <select
        className={FORM_CONTROL_CLASS}
        value={toInputValue(value)}
        disabled={!isWritable(context.block.binding)}
        onMouseDown={(event) => event.stopPropagation()}
        onChange={(event) => updateBinding(context, event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {resolveCanvasOptionLabel(path, option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function renderStatusBlock(context: BlockRendererContext): React.ReactNode {
  const value = stringifyFieldValue(
    getBlockValue(context),
    context.block.binding?.path,
    resolveLabel(context.block.label),
  );
  return (
    <span className="inline-flex max-w-full items-center self-start rounded border border-[var(--node-border)] px-2 py-0.5 text-xs text-[var(--node-fg-secondary)]">
      <span className="truncate">{value}</span>
    </span>
  );
}

function renderTagListBlock(context: BlockRendererContext): React.ReactNode {
  const value = getBlockValue(context);
  const tags = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className="max-w-full truncate rounded border border-[var(--node-border)] px-1.5 py-0.5 text-xs text-[var(--node-fg-secondary)]"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

function renderAssetPreviewBlock(context: BlockRendererContext): React.ReactNode {
  const value = getAssetPreviewValue(context);
  const source = createPreviewSource(context, value);
  const delegateActions = context.block.capabilities
    ?.filter((capability) => capability.kind === 'delegate')
    .flatMap((capability) => capability.actions);

  return (
    <PreviewSurface
      source={source}
      delegateActions={delegateActions}
      surfaceKind={context.previewSurfaceKind ?? 'inline'}
      chrome={context.contentChrome ?? 'contained'}
    />
  );
}

function renderButtonBlock(context: BlockRendererContext): React.ReactNode {
  return (
    <button
      type="button"
      className="self-start rounded border border-[var(--node-border)] px-2 py-1 text-xs text-[var(--node-fg)] hover:border-[var(--node-selected)]"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {resolveLabel(context.block.label) ?? context.block.id}
    </button>
  );
}

function renderListBlock(context: BlockRendererContext): React.ReactNode {
  const value = getBlockValue(context);
  const items = Array.isArray(value) ? value : [];
  return (
    <ul className="space-y-1 text-xs text-[var(--node-fg-secondary)]">
      {items.map((item, index) => (
        <li key={index} className="break-words">
          {stringifyValue(item, `Item ${index + 1}`)}
        </li>
      ))}
    </ul>
  );
}

function renderKeyValueBlock(context: BlockRendererContext): React.ReactNode {
  const value = getBlockValue(context);
  const entries = isRecord(value) ? Object.entries(value) : [];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs">
      {entries.map(([key, entryValue]) => (
        <React.Fragment key={key}>
          <dt className="text-[var(--node-fg-secondary)]">{key}</dt>
          <dd className="truncate text-[var(--node-fg)]">{stringifyValue(entryValue, '')}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

function renderCollectionBlock(context: BlockRendererContext): React.ReactNode {
  if (!context.block.collection) {
    return renderDefaultBlock(context);
  }

  const { value } = readNodeBinding(context.node, context.block.collection.source);
  const items = Array.isArray(value) ? value : [];
  return (
    <div className={getCollectionClassName(context.block.collection.layout)}>
      {items.length === 0 ? (
        <span className="opacity-60">
          {resolveLabel(context.block.collection.emptyLabel) ?? 'Empty'}
        </span>
      ) : (
        items.map((item, index) => (
          <div
            key={getCollectionItemKey(item, index)}
            className="min-w-0 rounded border border-[var(--node-border)] bg-white/80 p-1.5"
          >
            {renderCollectionItem(context.block, item, index)}
          </div>
        ))
      )}
    </div>
  );
}

function renderProjectionBlock(context: BlockRendererContext): React.ReactNode {
  return (
    <div className="rounded border border-dashed border-[var(--node-border)] px-2 py-1 text-xs text-[var(--node-fg-secondary)]">
      {context.block.label ?? context.block.projection?.kind ?? 'Projection'}
    </div>
  );
}

function renderCustomBlock(context: BlockRendererContext): React.ReactNode {
  if (context.block.metadata?.['presentation'] === 'markdown-review-table') {
    return renderMarkdownReviewTableBlock(context);
  }

  return renderDefaultBlock(context);
}

function renderMarkdownReviewTableBlock(context: BlockRendererContext): React.ReactNode {
  const table = projectMarkdownReviewTable(context);
  if (!table || table.rows.length === 0 || table.columns.length === 0) {
    const emptyLabel = readStringValue(context.block.metadata?.['emptyLabel']);
    return (
      <div
        className="rounded border border-[var(--node-border)] px-2 py-1 text-xs text-[var(--node-fg-secondary)]"
        data-markdown-review-table="true"
      >
        {resolveLabel(emptyLabel) ?? t('preset.table.noMarkdownRows')}
      </div>
    );
  }

  return (
    <div
      className="min-w-0 overflow-x-auto rounded border border-[var(--node-border)] bg-white/70"
      data-markdown-review-table="true"
    >
      <table className="min-w-full table-fixed border-collapse text-xs">
        <thead className="bg-black/[0.04] text-[var(--node-fg-secondary)]">
          <tr>
            {table.columns.map((column) => (
              <th
                key={column.id}
                className="border-b border-[var(--node-border)] px-2 py-1 text-left font-medium"
                data-markdown-review-column={column.id}
                style={{ width: `${resolveMarkdownReviewColumnWidth(column.id)}px` }}
              >
                {resolveMarkdownReviewColumnLabel(column)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-[var(--node-fg)]">
          {table.rows.map((row) => (
            <tr key={row.key} className="align-top">
              {table.columns.map((column) => (
                <td
                  key={`${row.key}:${column.id}`}
                  className="border-t border-[var(--node-border)] px-2 py-1 align-top whitespace-pre-wrap break-words"
                  data-markdown-review-cell={column.id}
                >
                  {stringifyValue(row.cells[column.id], '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderChildNodeSlotBlock(context: BlockRendererContext): React.ReactNode {
  const slot = context.block.childSlot;
  const childIds = slot?.childIds ?? context.node.container?.childIds ?? [];
  return (
    <div className="rounded border border-dashed border-[var(--node-border)] p-1.5 text-xs text-[var(--node-fg-secondary)]">
      {childIds.length === 0 ? (
        <span>
          {resolveLabel(context.block.label) ?? resolveLabel(slot?.emptyLabel) ?? 'Children'}
        </span>
      ) : (
        <div className={slot?.layout === 'grid' ? 'grid grid-cols-3 gap-1.5' : 'space-y-1'}>
          {childIds.map((childId) => {
            const child = context.allNodes.find((candidate) => candidate.id === childId);
            return child ? (
              <NodeCard
                key={child.id}
                node={child}
                parentNode={context.node}
                selection={{ nodeIds: context.selectedNodeIds }}
                interactionRenderMode={context.interactionRenderMode}
                onSelect={context.onSelectNode}
              />
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}

function renderDefaultBlock(context: BlockRendererContext): React.ReactNode {
  return (
    <div className="rounded border border-[var(--node-border)] px-2 py-1 text-xs text-[var(--node-fg-secondary)]">
      {resolveLabel(context.block.label) ?? context.block.kind}
    </div>
  );
}

function getBlockValue(context: BlockRendererContext): unknown {
  if (!context.block.binding) {
    return context.block.label ?? context.block.id;
  }

  return readNodeBinding(context.node, context.block.binding).value;
}

function getAssetPreviewValue(context: BlockRendererContext): unknown {
  const generationCapability = context.block.capabilities?.find(
    (capability) => capability.kind === 'generation-preview',
  );
  if (generationCapability) {
    const { value } = readNodeBinding(context.node, generationCapability.candidates);
    const selected = Array.isArray(value)
      ? value.find(
          (candidate): candidate is { id?: string; dataUrl?: string; selected?: boolean } =>
            isRecord(candidate) && candidate['selected'] === true,
        )
      : undefined;
    if (selected?.dataUrl) {
      return selected.dataUrl;
    }
  }

  const value = getBlockValue(context);
  if (isPresentAssetValue(value)) {
    return value;
  }

  const hasStructuredResourceRef = hasPreviewSourceResourceMetadata(context);
  for (const path of getStringArrayMetadata(context.block, 'alternateAssetPaths')) {
    if (!isJsonPointerPath(path)) continue;
    const { value: alternateValue } = readNodeBinding(context.node, {
      path,
      valueType: 'asset',
    });
    if (
      isPresentAssetValue(alternateValue) &&
      (!hasStructuredResourceRef || path.includes('runtime') || alternateValue.startsWith('data:'))
    ) {
      return alternateValue;
    }
  }

  return value;
}

function isPresentAssetValue(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isJsonPointerPath(value: string): value is JsonPointerPath {
  return value === '' || value.startsWith('/');
}

function createPreviewSource(
  context: BlockRendererContext,
  value: unknown,
): PreviewSourceDescriptor {
  const assetCapability = context.block.capabilities?.find(
    (capability) => capability.kind === 'asset-identity',
  );
  const previewCapability = context.block.capabilities?.find(
    (capability) => capability.kind === 'preview',
  );
  const path = typeof value === 'string' ? value : assetCapability?.path;
  const role = previewCapability?.preferredRole ?? previewCapability?.roles[0] ?? 'unavailable';
  const metadata = resolvePreviewSourceMetadata(context);
  const hasStructuredResourceRef = Boolean(
    metadata?.['documentResourceRef'] || metadata?.['resourceRef'],
  );
  const directAssetPath = hasStructuredResourceRef ? assetCapability?.path : path;
  const directAssetUri = hasStructuredResourceRef
    ? assetCapability?.uri
    : (assetCapability?.uri ?? path);

  const variants = previewCapability?.variants ? [...previewCapability.variants] : [];
  if (typeof path === 'string' && isSafeWebviewUrl(path)) {
    variants.push({ id: 'inline', role, sourcePath: path });
  }

  return {
    id: `${context.node.id}:${context.block.id}`,
    asset: assetCapability
      ? { ...assetCapability, path: directAssetPath, uri: directAssetUri }
      : hasStructuredResourceRef
        ? undefined
        : { kind: 'asset-identity', path },
    role,
    variants: variants.length > 0 ? variants : undefined,
    title: resolvePreviewSourceTitle(context, path),
    metadata,
  };
}

function resolvePreviewSourceTitle(
  context: BlockRendererContext,
  path: string | undefined,
): string | undefined {
  if (context.node.type === 'project') {
    return (
      context.node.data.projectTitle || extractBasename(path) || resolveLabel(context.block.label)
    );
  }

  return resolveLabel(context.block.label);
}

function resolvePreviewSourceMetadata(
  context: BlockRendererContext,
): Record<string, unknown> | undefined {
  const metadata: Record<string, unknown> = {};
  if (context.node.type === 'project') {
    metadata['projectType'] = context.node.data.projectType;
  }

  for (const alternateResourceRefPath of getStringArrayMetadata(
    context.block,
    'alternateResourceRefPaths',
  )) {
    if (!isJsonPointerPath(alternateResourceRefPath)) continue;
    const { value } = readNodeBinding(context.node, {
      path: alternateResourceRefPath,
      valueType: 'object',
    });
    const documentResourceRef = parseDocumentArchiveResourceRef(value);
    if (documentResourceRef) {
      metadata['documentResourceRef'] = documentResourceRef;
      continue;
    }
    if (isResourceRef(value)) {
      metadata['resourceRef'] = value;
    }
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function hasPreviewSourceResourceMetadata(context: BlockRendererContext): boolean {
  const metadata = resolvePreviewSourceMetadata(context);
  return Boolean(metadata?.['documentResourceRef'] || metadata?.['resourceRef']);
}

function updateBinding(context: BlockRendererContext, value: unknown): void {
  const binding = context.block.binding;
  if (!isWritable(binding)) {
    return;
  }

  context.onUpdateBinding?.({ path: binding.path, value });
}

function isWritable(binding: FieldBinding | undefined): binding is FieldBinding {
  return binding !== undefined && binding.mode !== 'read';
}

function toInputValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value);
}

function stringifyValue(value: unknown, placeholder: string | undefined): string {
  if (value === undefined || value === null || value === '') {
    return placeholder ?? '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => stringifyValue(item, '')).join(', ');
  }

  if (isRecord(value)) {
    return stringifyRecordSummary(value);
  }

  return JSON.stringify(value);
}

function stringifyRecordSummary(value: Record<string, unknown>): string {
  const knownSummary = compactStrings([
    readStringValue(value['characterName']) ?? readStringValue(value['name']),
    readStringValue(value['role']),
    readStringValue(value['action']),
    readStringValue(value['emotion']),
  ]).join(' ');

  return knownSummary || JSON.stringify(value);
}

function compactStrings(values: readonly (string | undefined)[]): string[] {
  return values.filter((value): value is string => Boolean(value && value.trim()));
}

function readStringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readRecordValue(value: unknown, key: string): unknown {
  if (!isRecord(value) || !Object.prototype.hasOwnProperty.call(value, key)) {
    return undefined;
  }
  return value[key];
}

interface MarkdownReviewTableProjection {
  readonly columns: readonly MarkdownReviewColumn[];
  readonly rows: readonly MarkdownReviewRow[];
}

interface MarkdownReviewColumn {
  readonly id: string;
  readonly label: string;
}

interface MarkdownReviewRow {
  readonly key: string;
  readonly cells: Readonly<Record<string, unknown>>;
}

function projectMarkdownReviewTable(
  context: BlockRendererContext,
): MarkdownReviewTableProjection | undefined {
  const value = getBlockValue(context);
  if (!isRecord(value)) {
    return undefined;
  }

  const rows = normalizeMarkdownReviewRows(value['rows']);
  const nodeColumns = readRecordValue(context.node.data, 'columns');
  const columns =
    normalizeMarkdownReviewColumns(value['columns']) ??
    normalizeMarkdownReviewColumns(nodeColumns) ??
    deriveMarkdownReviewColumns(rows);

  return { columns, rows };
}

function normalizeMarkdownReviewColumns(
  value: unknown,
): readonly MarkdownReviewColumn[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const columns = value.flatMap((item): MarkdownReviewColumn[] => {
    if (!isRecord(item)) {
      return [];
    }
    const id = readStringValue(item['id']);
    if (!id) {
      return [];
    }
    return [{ id, label: readStringValue(item['label']) ?? id }];
  });

  return columns.length > 0 ? columns : undefined;
}

function normalizeMarkdownReviewRows(value: unknown): readonly MarkdownReviewRow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item, index): MarkdownReviewRow[] => {
    if (!isRecord(item)) {
      return [];
    }
    const cells = isRecord(item['cells']) ? item['cells'] : {};
    return [
      {
        key:
          readStringValue(item['id']) ??
          readStringValue(item['rowId']) ??
          readStringValue(item['line']) ??
          String(index + 1),
        cells,
      },
    ];
  });
}

function deriveMarkdownReviewColumns(
  rows: readonly MarkdownReviewRow[],
): readonly MarkdownReviewColumn[] {
  const columnIds: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row.cells)) {
      if (!columnIds.includes(key)) {
        columnIds.push(key);
      }
    }
  }
  return columnIds.map((id) => ({ id, label: id }));
}

function resolveMarkdownReviewColumnLabel(column: MarkdownReviewColumn): string {
  const labelKey = MARKDOWN_REVIEW_COLUMN_LABEL_KEYS[column.id];
  if (labelKey) {
    return t(labelKey);
  }
  return column.label;
}

function resolveMarkdownReviewColumnWidth(columnId: string): number {
  if (columnId === 'imagePrompt') return 260;
  if (columnId === 'videoPrompt') return 320;
  if (columnId === 'dialogue') return 180;
  if (columnId === 'source') return 150;
  if (columnId === 'scene') return 150;
  if (columnId === 'shot' || columnId === 'duration') return 88;
  return 180;
}

const MARKDOWN_REVIEW_COLUMN_LABEL_KEYS: Readonly<Record<string, string>> = {
  scene: 'scene.column.scene',
  shot: 'scene.column.shot',
  source: 'scene.column.referenceMedia',
  imagePrompt: 'scene.column.imagePrompt',
  videoPrompt: 'scene.column.videoPrompt',
  duration: 'scene.column.duration',
  dialogue: 'scene.column.dialogue',
  reviewStatus: 'scene.column.state',
  state: 'scene.column.state',
  action: 'scene.column.action',
  nextAction: 'scene.column.action',
  actionId: 'scene.column.action',
};

function stringifyFieldValue(
  value: unknown,
  path: string | undefined,
  placeholder: string | undefined,
): string {
  const rawValue = stringifyValue(value, placeholder);
  return path ? resolveCanvasOptionLabel(path, rawValue) : rawValue;
}

function getStringArrayMetadata(block: CanvasBlock, key: string): string[] {
  const value = block.metadata?.[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function renderCollectionItem(block: CanvasBlock, item: unknown, index: number): React.ReactNode {
  if (block.collection?.itemBlocks && block.collection.itemBlocks.length > 0) {
    return renderStructuredCollectionItem(block, item, index);
  }

  const label =
    readCollectionItemPath(item, block.collection?.itemLabelPath) ??
    readCollectionItemPath(item, block.collection?.itemKeyPath) ??
    `Item ${index + 1}`;
  const rawPreview = readCollectionItemPath(item, block.collection?.itemPreviewPath);
  const preview = rawPreview && isSafeWebviewUrl(rawPreview) ? rawPreview : undefined;
  const status = isRecord(item) ? stringifyValue(item['generationStatus'], undefined) : undefined;

  return (
    <div className="flex min-w-0 items-center gap-2">
      {preview ? (
        <img src={preview} alt={label} className="h-10 w-10 flex-shrink-0 rounded object-cover" />
      ) : (
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded bg-black/30 text-[10px]">
          {index + 1}
        </div>
      )}
      <div className="min-w-0">
        <div className="truncate text-xs text-[var(--node-fg)]">{label}</div>
        {status ? (
          <div className="truncate text-[10px] text-[var(--node-fg-secondary)]">{status}</div>
        ) : null}
      </div>
    </div>
  );
}

function renderStructuredCollectionItem(
  block: CanvasBlock,
  item: unknown,
  index: number,
): React.ReactNode {
  const label =
    readCollectionItemPath(item, block.collection?.itemLabelPath) ??
    readCollectionItemPath(item, block.collection?.itemKeyPath) ??
    `Item ${index + 1}`;
  const fields = (block.collection?.itemBlocks ?? []).flatMap((itemBlock) => {
    const value = readCollectionItemValue(item, itemBlock.binding?.path);
    if (!hasDisplayValue(value)) {
      return [];
    }
    return [
      {
        id: itemBlock.id,
        label: resolveLabel(itemBlock.label) ?? itemBlock.id,
        value,
        multiline: itemBlock.kind === 'textarea' || itemBlock.metadata?.['multiline'] === true,
      },
    ];
  });
  const entityReference =
    block.id === 'shot-characters' ? projectShotCharacterEntityReference(item, t) : undefined;

  return (
    <div
      className="min-w-0 space-y-1"
      data-entity-reference-state={entityReference?.state}
      title={entityReference?.title}
    >
      <div className="flex min-w-0 items-center gap-1">
        <div className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--node-fg)]">
          {label}
        </div>
        {entityReference ? renderEntityReferenceActions(entityReference) : null}
      </div>
      {fields.length > 0 ? (
        <dl className="space-y-1">
          {fields.map((field) => (
            <div
              key={field.id}
              className={
                field.multiline ? 'min-w-0' : 'grid min-w-0 grid-cols-[auto_1fr] gap-x-2 gap-y-1'
              }
            >
              <dt className="text-[10px] uppercase text-[var(--node-fg-secondary)]">
                {field.label}
              </dt>
              <dd
                className={
                  field.multiline
                    ? 'whitespace-pre-wrap break-words text-xs text-[var(--node-fg)]'
                    : 'min-w-0 truncate text-xs text-[var(--node-fg)]'
                }
              >
                {stringifyValue(field.value, undefined)}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="break-words text-xs text-[var(--node-fg-secondary)]">
          {stringifyValue(item, label)}
        </div>
      )}
    </div>
  );
}

function renderEntityReferenceActions(
  reference: ReturnType<typeof projectShotCharacterEntityReference>,
): React.ReactNode {
  return <EntityReferenceActions reference={reference} />;
}

function EntityReferenceActions({
  reference,
}: {
  readonly reference: ReturnType<typeof projectShotCharacterEntityReference>;
}): React.ReactNode {
  const [summary, setSummary] = React.useState<
    | {
        readonly status: string;
        readonly displayName: string;
        readonly metadata?: Record<string, string | undefined>;
      }
    | undefined
  >(undefined);
  const [summaryMessage, setSummaryMessage] = React.useState<string | undefined>(undefined);
  const badgeClass = entityReferenceBadgeClass(reference.state);
  const title = summary
    ? formatEntitySummaryTitle(summary.displayName, summary.metadata)
    : reference.title;
  const canRequestSummary =
    reference.entityRef !== undefined || reference.candidateId !== undefined;
  const requestSummary = () => {
    if (summary || summaryMessage || !canRequestSummary) return;
    void requestCanvasEntitySummary({
      ...(reference.entityRef ? { entityRef: reference.entityRef } : {}),
      ...(reference.candidateId ? { candidateId: reference.candidateId } : {}),
    }).then((response) => {
      if (response.summary) {
        setSummary(response.summary);
        return;
      }
      if (response.message) {
        setSummaryMessage(response.message);
      }
    });
  };
  return (
    <div
      className="group/entity-ref relative flex flex-shrink-0 items-center gap-1"
      title={title}
      onFocus={requestSummary}
      onMouseEnter={requestSummary}
    >
      <span
        className={`rounded px-1.5 py-0.5 text-[9px] font-medium uppercase ${badgeClass}`}
        data-entity-reference-badge={reference.state}
      >
        {reference.label}
      </span>
      <ConfirmCandidateButton reference={reference} />
      {canRequestSummary ? (
        <button
          type="button"
          className="rounded border border-[var(--node-border)] px-1 text-[10px] text-[var(--node-fg)] hover:bg-white/10"
          title={t('entity.inspect')}
          onClick={(event) => {
            event.stopPropagation();
            void inspectCanvasEntity({
              ...(reference.entityRef ? { entityRef: reference.entityRef } : {}),
              ...(reference.candidateId ? { candidateId: reference.candidateId } : {}),
            });
          }}
        >
          ↗
        </button>
      ) : null}
      <EntityReferenceHoverCard
        reference={reference}
        summary={summary}
        summaryMessage={summaryMessage}
      />
    </div>
  );
}

function EntityReferenceHoverCard({
  reference,
  summary,
  summaryMessage,
}: {
  readonly reference: ReturnType<typeof projectShotCharacterEntityReference>;
  readonly summary:
    | {
        readonly status: string;
        readonly displayName: string;
        readonly metadata?: Record<string, string | undefined>;
      }
    | undefined;
  readonly summaryMessage?: string;
}): React.ReactNode {
  const summaryText = summary ? readEntitySummaryText(summary.metadata) : undefined;
  return (
    <div
      className="pointer-events-none absolute right-0 top-full z-20 mt-1 hidden w-64 rounded border border-[var(--node-border)] bg-[var(--node-bg)] p-2 text-left shadow-xl group-hover/entity-ref:block group-focus-within/entity-ref:block"
      data-entity-hover-card={reference.state}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 truncate text-xs font-semibold text-[var(--node-fg)]">
          {summary?.displayName ?? reference.title}
        </div>
        <span
          className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase ${entityReferenceBadgeClass(
            reference.state,
          )}`}
        >
          {reference.label}
        </span>
      </div>
      <div className="mt-1 text-[10px] uppercase text-[var(--node-fg-secondary)]">
        {entityReferenceStatusLabel(summary?.status ?? reference.state)}
      </div>
      <div className="mt-1 whitespace-pre-wrap break-words text-xs text-[var(--node-fg-secondary)]">
        {summaryText ?? summaryMessage ?? reference.title}
      </div>
      <div className="mt-2 flex items-center gap-2 text-[10px] text-[var(--node-fg-secondary)]">
        {reference.entityRef ? (
          <span className="truncate">{reference.entityRef.entityId}</span>
        ) : null}
        {reference.candidateId ? <span className="truncate">{reference.candidateId}</span> : null}
      </div>
    </div>
  );
}

function ConfirmCandidateButton({
  reference,
}: {
  readonly reference: ReturnType<typeof projectShotCharacterEntityReference>;
}): React.ReactNode {
  if (!reference.candidateId || reference.state !== 'candidate') return null;
  const candidateId = reference.candidateId;
  return (
    <button
      type="button"
      className="rounded border border-[var(--node-border)] px-1 text-[10px] text-[var(--node-fg)] hover:bg-white/10"
      title={t('entity.confirmCandidate')}
      onClick={(event) => {
        event.stopPropagation();
        void confirmCanvasEntityCandidate({ candidateId });
      }}
    >
      ✓
    </button>
  );
}

function formatEntitySummaryTitle(
  displayName: string,
  metadata: Record<string, string | undefined> | undefined,
): string {
  const summary = readEntitySummaryText(metadata);
  return summary ? `${displayName}: ${summary}` : displayName;
}

function readEntitySummaryText(
  metadata: Record<string, string | undefined> | undefined,
): string | undefined {
  return (
    metadata?.['appearanceSummary'] ?? metadata?.['visualSummary'] ?? metadata?.['appearanceNotes']
  );
}

function entityReferenceBadgeClass(
  state: ReturnType<typeof projectShotCharacterEntityReference>['state'],
): string {
  switch (state) {
    case 'confirmed':
      return 'bg-emerald-500/20 text-emerald-200';
    case 'candidate':
      return 'bg-amber-500/20 text-amber-200';
    case 'ambiguous':
      return 'bg-rose-500/20 text-rose-200';
    case 'orphaned':
      return 'bg-orange-500/20 text-orange-200';
    case 'unlinked':
      return 'bg-white/10 text-[var(--node-fg-secondary)]';
  }
}

function entityReferenceStatusLabel(state: string): string {
  switch (state) {
    case 'confirmed':
      return t('entity.reference.confirmed');
    case 'candidate':
      return t('entity.reference.candidate');
    case 'ambiguous':
      return t('entity.reference.ambiguous');
    case 'orphaned':
      return t('entity.reference.broken');
    case 'unlinked':
      return t('entity.reference.unlinked');
    default:
      return state;
  }
}

function readCollectionItemPath(item: unknown, path: string | undefined): string | undefined {
  if (!path || !isRecord(item)) {
    return undefined;
  }

  const key = path.startsWith('/') ? path.slice(1) : path;
  const value = item[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readCollectionItemValue(item: unknown, path: string | undefined): unknown {
  if (!path || !isRecord(item)) {
    return undefined;
  }

  const keys = path
    .replace(/^\//, '')
    .split('/')
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
  let current: unknown = item;
  for (const key of keys) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

function hasDisplayValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '') {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (isRecord(value)) {
    return Object.keys(value).length > 0;
  }
  return true;
}

function getCollectionClassName(layout: string | undefined): string {
  switch (layout) {
    case 'gallery':
    case 'grid':
      return 'grid grid-cols-2 gap-1 text-xs text-[var(--node-fg-secondary)]';
    default:
      return 'space-y-1 text-xs text-[var(--node-fg-secondary)]';
  }
}

function getCollectionItemKey(item: unknown, index: number): string {
  if (isRecord(item) && typeof item['id'] === 'string') {
    return item['id'];
  }

  return String(index);
}

function resolveLabel(label: string | undefined): string | undefined {
  if (!label) return label;
  return isI18nKey(label) ? t(label) : label;
}

function extractBasename(path: string | undefined): string | undefined {
  if (!path) return undefined;
  try {
    const url = new URL(path);
    return decodeURIComponent(url.pathname.split('/').pop() ?? path);
  } catch {
    return path.split('/').pop() ?? path;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isI18nKey(label: string): boolean {
  return label.startsWith('preset.') || label.startsWith('preview.');
}
