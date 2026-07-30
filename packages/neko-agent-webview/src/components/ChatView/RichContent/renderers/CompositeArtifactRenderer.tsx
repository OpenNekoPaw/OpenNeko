import type { RichContentProps, RichContentRendererEntry } from '../types';
import type { ReactNode } from 'react';
import type {
  ArtifactAction,
  ArtifactDiagnostic,
  ArtifactMediaItem,
  ArtifactResourceRef,
  CompositeArtifact,
  CompositeArtifactBlock,
  GenericTable,
  GenericTableCell,
  GenericTableColumn,
  GenericTableRow,
} from '@neko/shared';

export type CompositeArtifactRichData = CompositeArtifact | CompositeArtifactPageRichData;

export interface CompositeArtifactPageRichData {
  readonly kind: 'composite-artifact-page';
  readonly artifactId: string;
  readonly title?: string;
  readonly blocks: readonly CompositeArtifactBlock[];
  readonly cursor?: string;
  readonly complete: boolean;
}

const MAX_INLINE_TABLE_ROWS = 30;

function isCompositeArtifactRichData(data: unknown): data is CompositeArtifactRichData {
  if (!isRecord(data)) return false;
  const kind = data['kind'];
  return (
    (kind === 'composite-artifact' || kind === 'composite-artifact-page') &&
    typeof data['artifactId'] === 'string' &&
    Array.isArray(data['blocks'])
  );
}

function CompositeArtifactRendererComponent({
  data,
  className,
}: RichContentProps<CompositeArtifactRichData>) {
  const blockCount = data.blocks.length;
  const diagnostics = data.kind === 'composite-artifact' ? data.diagnostics : undefined;
  const suggestedActions = data.kind === 'composite-artifact' ? data.suggestedActions : undefined;
  const profile = data.kind === 'composite-artifact' ? data.profile : undefined;
  const pageSuffix =
    data.kind === 'composite-artifact-page'
      ? data.complete
        ? 'complete page'
        : `page cursor ${data.cursor ?? 'start'}`
      : undefined;

  return (
    <div className={`agent-inline-card overflow-hidden ${className ?? ''}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--agent-divider)] bg-[var(--agent-elevated)] px-2 py-1.5">
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[var(--agent-fg)]">
          {data.title ?? data.artifactId}
        </span>
        {profile && (
          <span className="shrink-0 rounded bg-[var(--vscode-editor-background)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--agent-fg-secondary)]">
            {profile}
          </span>
        )}
        <span className="shrink-0 text-[10px] text-[var(--agent-fg-secondary)]">
          {pageSuffix ?? `${blockCount} blocks`}
        </span>
      </div>

      <div className="space-y-2 p-2">
        <ActionList actions={suggestedActions} />
        <DiagnosticList diagnostics={diagnostics} />
        {data.blocks.map((block) => (
          <CompositeArtifactBlockView key={block.blockId} block={block} />
        ))}
      </div>
    </div>
  );
}

function CompositeArtifactBlockView({ block }: { block: CompositeArtifactBlock }) {
  return (
    <section className="min-w-0 rounded border border-[var(--agent-divider)] bg-[var(--vscode-editor-background)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--agent-divider)] px-2 py-1">
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[var(--agent-fg)]">
          {block.title ?? block.blockId}
        </span>
        <span className="shrink-0 rounded bg-[var(--agent-elevated)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--agent-fg-secondary)]">
          {block.kind}
        </span>
      </div>
      <div className="p-2">
        <ActionList actions={block.actions} compact />
        <DiagnosticList diagnostics={block.diagnostics} compact />
        {renderBlockBody(block)}
      </div>
    </section>
  );
}

function renderBlockBody(block: CompositeArtifactBlock): ReactNode {
  switch (block.kind) {
    case 'text':
      return (
        <p className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-[var(--agent-fg)]">
          {block.text}
        </p>
      );
    case 'table':
      return <GenericTableView table={block.table} />;
    case 'media':
      return <MediaItemView item={block.media} />;
    case 'gallery':
      return (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {block.items.map((item) => (
            <MediaItemView key={item.itemId} item={item} />
          ))}
        </div>
      );
    case 'comparison':
      return (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {block.candidates.map((candidate) => (
            <div
              key={candidate.candidateId}
              className="rounded border border-[var(--agent-divider)] bg-[var(--agent-elevated)] p-1.5 text-[10px]"
            >
              <div className="font-medium text-[var(--agent-fg)]">
                {candidate.label ?? candidate.candidateId}
              </div>
              {candidate.score !== undefined && (
                <div className="text-[var(--agent-fg-secondary)]">
                  score {formatNumber(candidate.score)}
                </div>
              )}
              {candidate.notes && (
                <div className="mt-1 whitespace-pre-wrap break-words text-[var(--agent-fg-secondary)]">
                  {candidate.notes}
                </div>
              )}
              {candidate.media && (
                <div className="mt-1">
                  <MediaItemView item={candidate.media} />
                </div>
              )}
            </div>
          ))}
        </div>
      );
    case 'timeline':
      return (
        <div className="space-y-1">
          {block.cues.map((cue) => (
            <div
              key={cue.cueId}
              className="flex min-w-0 flex-wrap gap-2 rounded bg-[var(--agent-elevated)] px-1.5 py-1 text-[10px]"
            >
              <span className="font-mono text-[var(--agent-fg-secondary)]">
                {formatMs(cue.startMs)}
              </span>
              <span className="min-w-0 flex-1 break-words text-[var(--agent-fg)]">
                {cue.label ?? cue.cueId}
              </span>
              {cue.type && <span className="text-[var(--agent-fg-secondary)]">{cue.type}</span>}
            </div>
          ))}
        </div>
      );
    case 'domain':
      return <JsonPreview value={block.payload} />;
    case 'diagnostic':
      return <DiagnosticList diagnostics={block.diagnostics} />;
  }
}

function GenericTableView({ table }: { table: GenericTable }) {
  const visibleColumns = table.columns.filter((column) => !column.display?.hidden);
  const visibleRows = table.rows.slice(0, MAX_INLINE_TABLE_ROWS);
  const hiddenRows = table.rows.length - visibleRows.length;

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2 text-[10px] text-[var(--agent-fg-secondary)]">
        <span className="font-medium text-[var(--agent-fg)]">{table.title}</span>
        {table.profile && <span className="font-mono">{table.profile}</span>}
        <span>
          {table.rows.length} rows / {visibleColumns.length} columns
        </span>
      </div>
      <ActionList actions={table.actions} compact />
      <DiagnosticList diagnostics={table.diagnostics} compact />
      <div className="overflow-x-auto">
        <table className="min-w-[720px] w-full border-separate border-spacing-0 text-left text-[10px]">
          <thead>
            <tr className="bg-[var(--agent-elevated)] text-[var(--agent-fg-secondary)]">
              {visibleColumns.map((column) => (
                <th
                  key={column.columnId}
                  className="border-b border-[var(--agent-divider)] px-1.5 py-1 font-medium tracking-normal"
                >
                  {column.label ?? column.columnId}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <GenericTableRowView key={row.rowId} row={row} columns={visibleColumns} />
            ))}
          </tbody>
        </table>
      </div>
      {hiddenRows > 0 && (
        <div className="rounded bg-[var(--agent-elevated)] px-1.5 py-1 text-[10px] text-[var(--agent-fg-secondary)]">
          {hiddenRows} rows available in paged host data.
        </div>
      )}
    </div>
  );
}

function GenericTableRowView({
  row,
  columns,
}: {
  row: GenericTableRow;
  columns: readonly GenericTableColumn[];
}) {
  return (
    <tr className="align-top odd:bg-[color-mix(in_srgb,var(--agent-elevated)_40%,transparent)]">
      {columns.map((column) => {
        const cell = row.cells[column.columnId];
        return (
          <td
            key={column.columnId}
            className="border-b border-[var(--agent-divider)] px-1.5 py-1 text-[var(--agent-fg)]"
          >
            {cell ? (
              <GenericTableCellView cell={cell} />
            ) : (
              <span className="text-[var(--agent-fg-secondary)]">-</span>
            )}
          </td>
        );
      })}
    </tr>
  );
}

function GenericTableCellView({ cell }: { cell: GenericTableCell }) {
  switch (cell.type) {
    case 'string':
    case 'enum':
    case 'status':
      return <StatusLikeCell type={cell.type} value={cell.value} />;
    case 'number':
      return <span className="font-mono">{formatNumber(cell.value)}</span>;
    case 'boolean':
      return <span>{cell.value ? 'true' : 'false'}</span>;
    case 'tags':
      return (
        <div className="flex flex-wrap gap-1">
          {cell.value.map((tag) => (
            <span
              key={tag}
              className="rounded bg-[var(--agent-elevated)] px-1 py-0.5 text-[9px] text-[var(--agent-fg-secondary)]"
            >
              {tag}
            </span>
          ))}
        </div>
      );
    case 'diagnostic':
      return <DiagnosticPill diagnostic={cell.value} />;
    case 'resource-ref':
      return <StableRefText value={cell.value} />;
    case 'media-preview':
      return <MediaItemView item={cell.value} compact />;
    case 'duration':
      return <span className="font-mono">{formatMs(cell.valueMs)}</span>;
    case 'timecode':
      return <span className="font-mono">{formatMs(cell.valueMs)}</span>;
    case 'json':
      return <JsonPreview value={cell.value} compact />;
    case 'action':
      return <ActionPill action={cell.value} />;
  }
}

function StatusLikeCell({ type, value }: { type: 'string' | 'enum' | 'status'; value: string }) {
  if (type === 'string') {
    return <span className="whitespace-pre-wrap break-words">{value}</span>;
  }
  return (
    <span className="inline-flex max-w-full rounded bg-[var(--agent-elevated)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--agent-fg-secondary)]">
      <span className="truncate">{value}</span>
    </span>
  );
}

function MediaItemView({ item, compact = false }: { item: ArtifactMediaItem; compact?: boolean }) {
  return (
    <div className="min-w-0 rounded border border-[var(--agent-divider)] bg-[var(--agent-elevated)] p-1.5 text-[10px]">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate font-medium text-[var(--agent-fg)]">
          {item.label ?? item.itemId}
        </span>
        <span className="shrink-0 font-mono text-[var(--agent-fg-secondary)]">
          {item.mediaType}
        </span>
      </div>
      {!compact && (
        <div className="mt-1">
          <StableRefText value={item.resourceRef} />
        </div>
      )}
    </div>
  );
}

function ActionList({
  actions,
  compact = false,
}: {
  actions: readonly ArtifactAction[] | undefined;
  compact?: boolean;
}) {
  if (!actions || actions.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1 ${compact ? 'mb-1' : ''}`}>
      {actions.map((action) => (
        <ActionPill key={action.actionId} action={action} />
      ))}
    </div>
  );
}

function ActionPill({ action }: { action: ArtifactAction }) {
  const reason =
    action.disabledReason ?? (action.requiresApproval ? 'requires approval' : undefined);
  return (
    <span className="inline-flex max-w-full flex-col rounded border border-[var(--agent-divider)] bg-[var(--agent-elevated)] px-1.5 py-1 text-[9px]">
      <span className="truncate font-medium text-[var(--agent-fg)]">
        {action.label ?? action.actionId}
      </span>
      <span className="truncate font-mono text-[var(--agent-fg-secondary)]">
        {action.disabled ? 'disabled' : action.kind}
        {reason ? `: ${reason}` : ''}
      </span>
    </span>
  );
}

function DiagnosticList({
  diagnostics,
  compact = false,
}: {
  diagnostics: readonly ArtifactDiagnostic[] | undefined;
  compact?: boolean;
}) {
  if (!diagnostics || diagnostics.length === 0) return null;
  return (
    <div className={`space-y-1 ${compact ? 'mb-1' : ''}`}>
      {diagnostics.map((diagnostic, index) => (
        <DiagnosticPill
          key={`${diagnostic.code}:${diagnostic.path.join('.')}:${index}`}
          diagnostic={diagnostic}
        />
      ))}
    </div>
  );
}

function DiagnosticPill({ diagnostic }: { diagnostic: ArtifactDiagnostic }) {
  return (
    <div className="rounded bg-[color-mix(in_srgb,var(--agent-warning-fg)_10%,transparent)] px-1.5 py-1 text-[10px] text-[var(--agent-warning-fg)]">
      <span className="font-mono">
        {diagnostic.severity}/{diagnostic.code}
      </span>
      <span className="ml-1 whitespace-pre-wrap break-words">{diagnostic.message}</span>
    </div>
  );
}

function StableRefText({ value }: { value: ArtifactResourceRef }) {
  return (
    <span className="break-all font-mono text-[9px] text-[var(--agent-fg-secondary)]">
      {formatResourceRef(value)}
    </span>
  );
}

function JsonPreview({ value, compact = false }: { value: unknown; compact?: boolean }) {
  return (
    <pre
      className={`agent-code-block w-full max-w-full overflow-x-auto p-1.5 font-mono text-[9px] ${compact ? 'max-h-[80px]' : 'max-h-[180px]'}`}
    >
      {formatJson(value)}
    </pre>
  );
}

function formatResourceRef(ref: ArtifactResourceRef): string {
  switch (ref.kind) {
    case 'resource':
      return formatJson({
        id: ref.resource.id,
        provider: ref.resource.provider,
        kind: ref.resource.kind,
        source: ref.resource.source,
      });
    case 'document-entry':
      return `${ref.resource.source.fileId ?? ref.resource.source.filePath}:${ref.resource.entryPath ?? 'entry'}`;
    case 'generated-asset':
      return ref.assetVersion ? `${ref.assetId}@${ref.assetVersion}` : ref.assetId;
    case 'tool-result':
      return `${ref.toolCallId}:${ref.assetIndex ?? 0}`;
    case 'canvas-node':
      return ref.outputId ? `${ref.canvasNodeId}:${ref.outputId}` : ref.canvasNodeId;
    case 'story-source':
      return [ref.storyId, ref.sceneId, ref.frameIndex]
        .filter((value) => value !== undefined)
        .join(':');
    case 'perception-card':
      return ref.cardId ? `${ref.assetId}:${ref.cardId}` : ref.assetId;
  }
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? '';
  } catch {
    return String(value);
  }
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function formatMs(valueMs: number): string {
  if (!Number.isFinite(valueMs)) return '0ms';
  if (Math.abs(valueMs) < 1000) return `${Math.round(valueMs)}ms`;
  return `${formatNumber(valueMs / 1000)}s`;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

export const compositeArtifactRendererEntry: RichContentRendererEntry<CompositeArtifactRichData> = {
  kind: 'composite-artifact',
  validate: isCompositeArtifactRichData,
  component: CompositeArtifactRendererComponent,
};
