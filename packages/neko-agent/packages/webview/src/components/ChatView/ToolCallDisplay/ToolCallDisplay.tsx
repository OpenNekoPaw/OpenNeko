/**
 * ToolCallDisplay - Renders a single tool call with status, summary, and results
 *
 * Routes between confirmation UI and normal display based on tool state.
 * Delegates media extraction and rendering to sub-modules.
 */

import { useState, useCallback, memo, type ReactNode } from 'react';
import { ToolCall } from '@neko-agent/types';
import { useTranslation } from '@/i18n/I18nContext';
import { RichContentRenderer } from '@/components/ChatView/RichContent';
import { AgentHostMessages } from '@/messages';
import { useMessageActions } from '@/components/ChatView/MessageActionsContext';
import { TaskCard } from '@/components/ChatView/TaskCard/TaskCard';
import { SubAgentCard } from '@/components/ChatView/SubAgentCard';
import type { AgentArtifactTransferPayload } from '@neko-agent/types';
import type { CompositeArtifactPageRichData } from '@/components/ChatView/RichContent/renderers';
import { getTaskWorkItemById, selectRelatedSubAgentWorkItems } from '@/components/AgentWorkItem';
import {
  projectToolCallDisplayState,
  type CanvasAuthoringResultProjection,
  type CanvasAuthoringDiagnosticProjection,
  type CanvasAuthoringPromptFieldAlignmentProjection,
} from '@/presenters/tool-call-presenter';
import { isTaskWorkItem } from '@/presenters/work-item-projection-presenter';
import { getLogger } from '../../../utils/logger';
import { CopyIcon } from '@neko/shared/icons';
import {
  FileIcon,
  ChevronIcon,
  SuccessIcon,
  ErrorIcon,
  WarningIcon,
  ToolLoadingSpinner,
} from './icons';
import { DocumentImageThumbnails } from './DocumentImageThumbnails';

const logger = getLogger('ToolCallDisplay');

interface ToolCallDisplayProps {
  toolCall: ToolCall;
  conversationId: string | null;
  workItemIds?: string[];
}

function ToolCallDisplayComponent({ toolCall, conversationId, workItemIds }: ToolCallDisplayProps) {
  const { t } = useTranslation();
  const { workItems, pluginsAvailable, onCancelTask, onRetryTask, onViewTaskResult } =
    useMessageActions();
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const handleOpenFile = useCallback((filePath: string) => {
    AgentHostMessages.openFile(filePath);
  }, []);

  const handleCopyText = useCallback((text: string) => {
    void navigator.clipboard.writeText(text);
  }, []);

  const handleConfirm = useCallback(
    (approved: boolean) => {
      logger.info('handleConfirm called:', {
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        approved,
        conversationId,
      });
      if (!conversationId) {
        logger.warn('Cannot confirm tool without conversationId');
        return;
      }
      AgentHostMessages.confirmTool(toolCall.id, approved, conversationId);
    },
    [toolCall.id, toolCall.name, conversationId],
  );

  const projection = projectToolCallDisplayState(toolCall);
  const {
    argsJson,
    resultJson,
    hasExpandableContent,
    isBackgroundMode,
    backgroundTaskId,
    isImageTool,
    imageUrls,
    isVideoTool,
    videoUrls,
    isAudioTool,
    audioUrls,
    documentThumbnails,
    copyText,
    isFileTool,
    filePath,
    summary,
    isPending,
    isSuccess,
    isFailed,
    needsConfirmation,
    canvasAuthoringResult,
  } = projection;
  const liveTask = backgroundTaskId
    ? getTaskWorkItemById(workItems, backgroundTaskId)?.task
    : selectAnchoredTask(workItems, workItemIds, toolCall.id);
  const relatedSubAgents = selectRelatedSubAgentWorkItems({
    toolCallId: toolCall.id,
    toolResultData: toolCall.result?.data,
    workItems,
    workItemIds,
  });

  const toneClass = isFailed ? 'is-danger' : isSuccess ? 'is-success' : isPending ? 'is-info' : '';
  const compactActionClass =
    'inline-flex items-center gap-1 rounded-md border border-[var(--agent-input-border)] bg-[var(--agent-elevated)] px-1.5 py-0.5 text-[10px] text-[var(--agent-fg)] transition-colors hover:bg-[var(--agent-hover)]';

  // Confirmation UI
  if (needsConfirmation) {
    logger.info('Rendering confirmation UI for:', {
      toolCallId: toolCall.id,
      toolName: toolCall.name,
    });
    return (
      <div className="my-2">
        <div className="agent-inline-card is-warning">
          <div className="agent-inline-header flex items-center gap-2 px-3 py-2">
            <WarningIcon className="h-4 w-4 shrink-0 text-[var(--agent-warning-fg)]" />
            <span className="text-[12px] font-medium text-[var(--agent-fg)]">
              {t('toolCalls.awaitingApproval')}
            </span>
          </div>
          <div className="px-3 py-2 text-[var(--agent-fg)]">
            <div className="mb-2 flex items-center gap-2">
              <span className="agent-badge font-mono text-[11px] text-[var(--agent-fg)]">
                {toolCall.name}
              </span>
              {toolCall.confirmation?.action && (
                <span className="text-[11px] text-[var(--agent-fg-secondary)]">
                  {toolCall.confirmation.action}
                </span>
              )}
            </div>
            {toolCall.confirmation?.description && (
              <p className="mb-2 text-[11px] text-[var(--agent-fg)]">
                {toolCall.confirmation.description}
              </p>
            )}
            {summary && (
              <div className="mb-2 truncate font-mono text-[10px] text-[var(--agent-fg-secondary)]">
                {summary}
              </div>
            )}
            {hasExpandableContent && (
              <div className="mb-2">
                <button
                  onClick={toggleExpand}
                  className="flex items-center gap-1 text-[10px] text-[var(--agent-accent)] hover:underline"
                >
                  <ChevronIcon
                    className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  />
                  {t('toolCalls.args')}
                </button>
                {isExpanded && (
                  <div className="mt-1 border-l border-[var(--agent-divider)] pl-2">
                    <pre className="agent-code-block max-h-[100px] w-full max-w-full overflow-x-auto p-1.5 font-mono text-[10px]">
                      {argsJson}
                    </pre>
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-2 border-t border-[var(--agent-divider)] pt-2">
              <button
                onClick={() => handleConfirm(true)}
                className="vscode-button px-3 py-1 text-[11px] leading-4"
              >
                {t('toolCalls.approve')}
              </button>
              <button
                onClick={() => handleConfirm(false)}
                className="vscode-button vscode-button-secondary px-3 py-1 text-[11px] leading-4"
              >
                {t('toolCalls.deny')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Normal display
  return (
    <div className="my-1">
      <div className={`agent-inline-card ${toneClass}`}>
        {/* Compact single-line header */}
        <div
          className="agent-inline-header flex items-center gap-1.5 px-2 py-1.5 text-[11px] transition-colors"
          onClick={hasExpandableContent ? toggleExpand : undefined}
          role={hasExpandableContent ? 'button' : undefined}
        >
          {isPending && (
            <ToolLoadingSpinner className="h-3 w-3 shrink-0 text-[var(--agent-info)]" />
          )}
          {isSuccess && <SuccessIcon className="h-3 w-3 shrink-0 text-[var(--agent-success)]" />}
          {isFailed && <ErrorIcon className="h-3 w-3 shrink-0 text-[var(--agent-danger)]" />}

          <span className="shrink-0 font-medium text-[var(--agent-fg)]">{toolCall.name}</span>

          {summary && (
            <span className="truncate font-mono text-[10px] text-[var(--agent-fg-secondary)]">
              {summary}
            </span>
          )}
          <span className="flex-1" />

          {isFileTool && filePath && isSuccess && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleOpenFile(filePath);
              }}
              className={compactActionClass}
              title={`Open ${filePath}`}
            >
              <FileIcon className="h-3 w-3" />
              <span>Open</span>
            </button>
          )}

          {copyText && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCopyText(copyText);
              }}
              className={compactActionClass}
              title="Copy result summary"
            >
              <CopyIcon className="h-3 w-3" />
              <span>Copy</span>
            </button>
          )}

          {toolCall.result?.duration && (
            <span className="shrink-0 text-[10px] text-[var(--agent-fg-secondary)]">
              {toolCall.result.duration}ms
            </span>
          )}

          {hasExpandableContent && (
            <ChevronIcon
              className={`h-3 w-3 shrink-0 text-[var(--agent-fg-secondary)] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            />
          )}
        </div>

        {/* Error message */}
        {isFailed && toolCall.result?.error && (
          <div className="border-t border-[color-mix(in_srgb,var(--agent-danger)_24%,transparent)] bg-[color-mix(in_srgb,var(--agent-danger)_12%,transparent)] px-2 py-1 text-[10px] text-[var(--agent-danger)]">
            {toolCall.result.error}
          </div>
        )}

        {canvasAuthoringResult && (
          <CanvasAuthoringResultSummary result={canvasAuthoringResult} />
        )}

        {/* Expanded content */}
        {isExpanded && (
          <div className="border-t border-[var(--agent-divider)] px-3 py-2 text-[10px]">
            {Object.keys(toolCall.arguments).length > 0 && (
              <div className="mb-2">
                <div className="mb-0.5 flex items-center gap-2 text-[var(--agent-fg-secondary)] opacity-80">
                  <span>{t('chat.toolCall.args')}</span>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded border border-[var(--agent-input-border)] px-1 py-0.5 text-[9px] text-[var(--agent-fg)] hover:bg-[var(--agent-hover)]"
                    title="Copy input JSON"
                    onClick={() => handleCopyText(argsJson)}
                  >
                    <CopyIcon className="h-3 w-3" />
                    <span>JSON</span>
                  </button>
                </div>
                <pre className="agent-code-block max-h-[150px] w-full max-w-full overflow-x-auto p-1.5 font-mono">
                  {argsJson}
                </pre>
              </div>
            )}
            {resultJson && (
              <div>
                <div className="mb-0.5 flex items-center gap-2 text-[var(--agent-fg-secondary)] opacity-80">
                  <span>Result</span>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded border border-[var(--agent-input-border)] px-1 py-0.5 text-[9px] text-[var(--agent-fg)] hover:bg-[var(--agent-hover)]"
                    title="Copy output JSON"
                    onClick={() => handleCopyText(resultJson)}
                  >
                    <CopyIcon className="h-3 w-3" />
                    <span>JSON</span>
                  </button>
                </div>
                <pre className="agent-code-block max-h-[150px] w-full max-w-full overflow-x-auto p-1.5 font-mono">
                  {resultJson}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Inline task progress card for background media tasks */}
      {(isBackgroundMode || liveTask) && liveTask && (
        <TaskCard
          task={liveTask}
          onCancel={onCancelTask}
          onRetry={onRetryTask}
          onViewResult={onViewTaskResult}
          plugins={pluginsAvailable}
        />
      )}
      {relatedSubAgents.map((item) => (
        <SubAgentCard key={item.id} item={item} />
      ))}

      {documentThumbnails.length > 0 && <DocumentImageThumbnails thumbnails={documentThumbnails} />}

      {toolCall.result?.artifacts && toolCall.result.artifacts.length > 0 && (
        <ArtifactTransferSummary artifacts={toolCall.result.artifacts} />
      )}

      {/* Media previews — registry-driven rendering (ADR-6 §6.2) */}
      {isImageTool && imageUrls.length > 0 && (
        <div className="mt-2 space-y-2">
          {imageUrls.map((url, index) => (
            <RichContentRenderer
              key={index}
              kind="image"
              data={{
                src: url,
                alt: `Generated image ${index + 1}`,
                name: `generated_${index + 1}.png`,
              }}
            />
          ))}
        </div>
      )}
      {isVideoTool && videoUrls.length > 0 && (
        <div className="mt-2 space-y-2">
          {videoUrls.map((url, index) => (
            <RichContentRenderer
              key={index}
              kind="video"
              data={{
                src: url,
                title: `generated_${index + 1}.mp4`,
              }}
            />
          ))}
        </div>
      )}
      {isAudioTool && audioUrls.length > 0 && (
        <div className="mt-2 space-y-2">
          {audioUrls.map((url, index) => (
            <RichContentRenderer
              key={index}
              kind="audio"
              data={{
                src: url,
                title: `generated_${index + 1}.mp3`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CanvasAuthoringResultSummary({ result }: { result: CanvasAuthoringResultProjection }) {
  return (
    <div className="border-t border-[var(--agent-divider)] px-2 py-2 text-[10px] text-[var(--agent-fg)]">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="shrink-0 font-medium">Canvas authoring</span>
        <span
          className={`shrink-0 rounded border px-1.5 py-0.5 font-mono uppercase ${getCanvasAuthoringStatusClass(result.status, result.isValid)}`}
          title={result.isValid ? result.status : 'Malformed Canvas authoring result'}
        >
          {result.isValid ? result.status : 'malformed'}
        </span>
        {result.summary && (
          <span className="min-w-[12rem] flex-1 truncate text-[var(--agent-fg-secondary)]">
            {result.summary}
          </span>
        )}
      </div>

      {result.blockedReason && (
        <div className="mt-1.5 rounded border border-[color-mix(in_srgb,var(--agent-danger)_24%,transparent)] bg-[color-mix(in_srgb,var(--agent-danger)_10%,transparent)] px-1.5 py-1 text-[var(--agent-danger)]">
          {result.blockedReason}
        </div>
      )}

      {result.refs.length > 0 && (
        <CanvasAuthoringChipRow label="Refs">
          {result.refs.map((ref) => (
            <span
              key={ref.key}
              className="max-w-full truncate rounded border border-[var(--agent-input-border)] bg-[var(--agent-elevated)] px-1.5 py-0.5 font-mono text-[9px]"
              title={formatCanvasAuthoringRefTitle(ref)}
            >
              {ref.kind}:{ref.id}
            </span>
          ))}
        </CanvasAuthoringChipRow>
      )}

      {result.changedFields.length > 0 && (
        <CanvasAuthoringChipRow label="Fields">
          {result.changedFields.map((field) => (
            <span
              key={field}
              className="max-w-full truncate rounded border border-[var(--agent-input-border)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--agent-fg-secondary)]"
              title={field}
            >
              {field}
            </span>
          ))}
        </CanvasAuthoringChipRow>
      )}

      {result.promptFieldAlignments.length > 0 && (
        <CanvasAuthoringChipRow label="Prompt alignment">
          {result.promptFieldAlignments.map((alignment) => (
            <span
              key={alignment.key}
              className={`max-w-full truncate rounded border px-1.5 py-0.5 font-mono text-[9px] ${getPromptFieldAlignmentClass(alignment)}`}
              title={formatPromptFieldAlignmentTitle(alignment)}
            >
              {alignment.fieldId}:{alignment.alignmentState}
            </span>
          ))}
        </CanvasAuthoringChipRow>
      )}

      {result.diagnostics.length > 0 && (
        <div className="mt-1.5 space-y-1">
          {result.diagnostics.map((diagnostic) => (
            <div
              key={diagnostic.key}
              className={`rounded border px-1.5 py-1 ${getCanvasAuthoringDiagnosticClass(diagnostic)}`}
            >
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span className="shrink-0 font-mono uppercase">{diagnostic.severity}</span>
                <span className="min-w-[10rem] flex-1">{diagnostic.message}</span>
                <span className="shrink-0 font-mono text-[9px] opacity-75">
                  {diagnostic.code}
                </span>
              </div>
              {(diagnostic.target || diagnostic.requiredQuery || diagnostic.retryable) && (
                <div className="mt-0.5 flex flex-wrap gap-1 font-mono text-[9px] opacity-80">
                  {diagnostic.target && <span>target:{diagnostic.target}</span>}
                  {diagnostic.requiredQuery && <span>query:{diagnostic.requiredQuery}</span>}
                  {diagnostic.retryable && <span>retryable</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {result.nextActions.length > 0 && (
        <CanvasAuthoringChipRow label="Next actions">
          {result.nextActions.map((action) => (
            <span
              key={action.key}
              className="inline-flex max-w-full items-center gap-1 rounded border border-[var(--agent-input-border)] bg-[var(--agent-elevated)] px-1.5 py-0.5"
              title={action.argumentsJson}
            >
              <span className="truncate">{action.label}</span>
              {action.toolName && (
                <span className="shrink-0 font-mono text-[9px] text-[var(--agent-fg-secondary)]">
                  {action.toolName}
                </span>
              )}
              {action.requiresApproval && (
                <span className="shrink-0 rounded bg-[color-mix(in_srgb,var(--agent-warning)_18%,transparent)] px-1 font-mono text-[9px] text-[var(--agent-warning-fg)]">
                  Approval required
                </span>
              )}
            </span>
          ))}
        </CanvasAuthoringChipRow>
      )}
    </div>
  );
}

function CanvasAuthoringChipRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="shrink-0 text-[var(--agent-fg-secondary)]">{label}</span>
      {children}
    </div>
  );
}

function getCanvasAuthoringStatusClass(status: string, isValid: boolean): string {
  if (!isValid) {
    return 'border-[color-mix(in_srgb,var(--agent-danger)_30%,transparent)] text-[var(--agent-danger)]';
  }
  if (status === 'success') {
    return 'border-[color-mix(in_srgb,var(--agent-success)_30%,transparent)] text-[var(--agent-success)]';
  }
  if (status === 'blocked') {
    return 'border-[color-mix(in_srgb,var(--agent-danger)_30%,transparent)] text-[var(--agent-danger)]';
  }
  if (status === 'partial') {
    return 'border-[color-mix(in_srgb,var(--agent-warning)_30%,transparent)] text-[var(--agent-warning-fg)]';
  }
  return 'border-[var(--agent-input-border)] text-[var(--agent-fg-secondary)]';
}

function getCanvasAuthoringDiagnosticClass(
  diagnostic: CanvasAuthoringDiagnosticProjection,
): string {
  if (diagnostic.severity === 'error') {
    return 'border-[color-mix(in_srgb,var(--agent-danger)_24%,transparent)] bg-[color-mix(in_srgb,var(--agent-danger)_8%,transparent)] text-[var(--agent-danger)]';
  }
  if (diagnostic.severity === 'warning') {
    return 'border-[color-mix(in_srgb,var(--agent-warning)_24%,transparent)] bg-[color-mix(in_srgb,var(--agent-warning)_8%,transparent)] text-[var(--agent-warning-fg)]';
  }
  return 'border-[color-mix(in_srgb,var(--agent-info)_24%,transparent)] bg-[color-mix(in_srgb,var(--agent-info)_8%,transparent)] text-[var(--agent-fg)]';
}

function getPromptFieldAlignmentClass(
  alignment: CanvasAuthoringPromptFieldAlignmentProjection,
): string {
  if (alignment.alignmentState === 'in-sync') {
    return 'border-[color-mix(in_srgb,var(--agent-success)_24%,transparent)] text-[var(--agent-success)]';
  }
  if (alignment.alignmentState === 'unbound') {
    return 'border-[var(--agent-input-border)] text-[var(--agent-fg-secondary)]';
  }
  return 'border-[color-mix(in_srgb,var(--agent-warning)_24%,transparent)] text-[var(--agent-warning-fg)]';
}

function formatCanvasAuthoringRefTitle(ref: CanvasAuthoringResultProjection['refs'][number]): string {
  return [ref.label, `${ref.kind}:${ref.id}`, ...ref.details].filter(Boolean).join(' · ');
}

function formatPromptFieldAlignmentTitle(
  alignment: CanvasAuthoringPromptFieldAlignmentProjection,
): string {
  return [
    alignment.fieldId,
    alignment.alignmentState,
    alignment.sourceSpanId ? `span:${alignment.sourceSpanId}` : undefined,
    alignment.userOverride ? 'user override' : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}

function ArtifactTransferSummary({
  artifacts,
}: {
  artifacts: readonly AgentArtifactTransferPayload[];
}) {
  return (
    <div className="mt-2 space-y-1.5">
      {artifacts.map((artifact) => (
        <ArtifactTransferSummaryCard key={getArtifactTransferKey(artifact)} artifact={artifact} />
      ))}
    </div>
  );
}

function ArtifactTransferSummaryCard({ artifact }: { artifact: AgentArtifactTransferPayload }) {
  if (artifact.type === 'artifactExecutionSummary') {
    const diagnostics = artifact.summary.diagnostics?.length ?? 0;
    return (
      <div className="agent-inline-card px-2 py-1.5 text-[11px] text-[var(--agent-fg)]">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 font-medium">Execution</span>
          <span className="truncate text-[var(--agent-fg-secondary)]">
            {artifact.summary.actionId}
          </span>
          <span className="ml-auto shrink-0 rounded bg-[var(--agent-elevated)] px-1.5 py-0.5 font-mono text-[10px]">
            {artifact.summary.status}
          </span>
        </div>
        {diagnostics > 0 && (
          <div className="mt-1 text-[10px] text-[var(--agent-fg-secondary)]">
            {diagnostics} diagnostics
          </div>
        )}
      </div>
    );
  }

  if (artifact.type === 'artifactBlockPage') {
    const pageData: CompositeArtifactPageRichData = {
      kind: 'composite-artifact-page',
      artifactId: artifact.artifactId,
      title: `Artifact Page ${artifact.artifactId}`,
      blocks: artifact.blocks,
      complete: artifact.complete,
      ...(artifact.cursor ? { cursor: artifact.cursor } : {}),
    };
    return <RichContentRenderer kind="composite-artifact" data={pageData} />;
  }

  const artifactPayload = artifact.artifact;
  return <RichContentRenderer kind="composite-artifact" data={artifactPayload} />;
}

function getArtifactTransferKey(artifact: AgentArtifactTransferPayload): string {
  switch (artifact.type) {
    case 'artifactSnapshot':
      return `snapshot:${artifact.artifact.artifactId}`;
    case 'artifactBlockPage':
      return `page:${artifact.artifactId}:${artifact.cursor ?? 'start'}`;
    case 'artifactBackfill':
      return `backfill:${artifact.artifact.artifactId}`;
    case 'artifactExecutionSummary':
      return `summary:${artifact.summary.summaryId}`;
  }
}

export const ToolCallDisplay = memo(ToolCallDisplayComponent);

function selectAnchoredTask(
  workItems: readonly import('@neko-agent/types').AgentWorkItem[] | undefined,
  workItemIds: readonly string[] | undefined,
  toolCallId: string,
) {
  if (!workItems || !workItemIds || workItemIds.length === 0) {
    return undefined;
  }
  const linkedIds = new Set(workItemIds);
  const anchoredItem = workItems.find((item) => {
    return isTaskWorkItem(item) && linkedIds.has(item.id) && item.parentToolCallId === toolCallId;
  });
  return anchoredItem && isTaskWorkItem(anchoredItem) ? anchoredItem.task : undefined;
}
