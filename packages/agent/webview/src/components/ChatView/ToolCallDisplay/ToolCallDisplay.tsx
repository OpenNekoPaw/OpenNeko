/**
 * ToolCallDisplay - Renders a single tool call with status, summary, and results
 *
 * Routes between confirmation UI and normal display based on tool state.
 * Delegates media extraction and rendering to sub-modules.
 */

import { useState, useCallback, memo, type ReactNode } from 'react';
import type { ToolCall, ToolCallProgress } from '@neko/agent-contracts';
import { useTranslation } from '../../../i18n/I18nContext';
import { RichContentRenderer } from '../RichContent';
import { useAgentHostMessages } from '../../../host-runtime-context';
import { useMessageActions } from '../MessageActionsContext';
import { SubAgentCard } from '../SubAgentCard';
import type { AgentArtifactTransferPayload } from '@neko/agent-contracts';
import type { CompositeArtifactPageRichData } from '../RichContent/renderers';
import { selectRelatedSubAgentWorkItems } from '../../AgentWorkItem';
import {
  projectToolCallDisplayState,
  type CanvasAuthoringResultProjection,
  type CanvasAuthoringDiagnosticProjection,
  type CanvasAuthoringPromptFieldAlignmentProjection,
} from '../../../presenters/tool-call-presenter';
import { getLogger } from '../../../utils/logger';
import { CopyIcon } from '@neko/ui/icons';
import {
  FileIcon,
  ChevronIcon,
  SuccessIcon,
  ErrorIcon,
  WarningIcon,
  ToolLoadingSpinner,
} from './icons';
import { DocumentImageThumbnails } from './DocumentImageThumbnails';
import { GenerationJobCard } from './GenerationJobCard';
import { AgentPreviewCollection } from '../MediaPreview/AgentPreviewCollection';
import { useToolCallAccessoryRenderer } from '../ToolCallAccessoryContext';

const logger = getLogger('ToolCallDisplay');

interface ToolCallDisplayProps {
  toolCall: ToolCall;
  progress?: ToolCallProgress;
  conversationId: string | null;
  workItemIds?: string[];
}

function ToolCallDisplayComponent({
  toolCall,
  progress,
  conversationId,
  workItemIds,
}: ToolCallDisplayProps) {
  const { t } = useTranslation();
  const agentHostMessages = useAgentHostMessages();
  const { workItems } = useMessageActions();
  const renderAccessory = useToolCallAccessoryRenderer();
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const handleOpenFile = useCallback(
    (contentLocator: import('@neko/content').ContentLocator) => {
      agentHostMessages.openFile(contentLocator);
    },
    [agentHostMessages],
  );

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
      agentHostMessages.confirmTool(toolCall.id, approved, conversationId);
    },
    [agentHostMessages, toolCall.id, toolCall.name, conversationId],
  );

  const projection = projectToolCallDisplayState(toolCall, progress);
  const {
    argsJson,
    resultJson,
    hasExpandableContent,
    isImageTool,
    imageDescriptors,
    isVideoTool,
    videoDescriptors,
    isAudioTool,
    audioDescriptors,
    documentThumbnails,
    copyText,
    isFileTool,
    filePath,
    fileContentLocator,
    summary,
    isPending,
    isSuccess,
    isFailed,
    needsConfirmation,
    canvasAuthoringResult,
    generationJob,
  } = projection;
  const relatedSubAgents = selectRelatedSubAgentWorkItems({
    toolCallId: toolCall.id,
    toolResultData: toolCall.result?.data,
    workItems,
    workItemIds,
  });
  const accessory = renderAccessory?.({ conversationId, toolCall });

  const toneClass = isFailed ? 'is-danger' : isSuccess ? 'is-success' : isPending ? 'is-info' : '';
  const compactActionClass =
    'inline-flex items-center gap-1 rounded-md border border-[var(--agent-input-border)] bg-[var(--agent-elevated)] px-1.5 py-0.5 text-[10px] text-[var(--agent-fg)] transition-colors hover:bg-[var(--agent-hover)]';
  const mediaOutputCount =
    imageDescriptors.length + videoDescriptors.length + audioDescriptors.length;
  const attachmentOutputs =
    toolCall.result?.attachments?.filter(
      (attachment) => attachment.contentLocator ?? attachment.assetRef?.contentLocator,
    ) ?? [];
  const showAttachmentOutputs = mediaOutputCount === 0 && documentThumbnails.length === 0;
  const hasProducedOutputs =
    isSuccess &&
    ((isFileTool && Boolean(filePath) && Boolean(fileContentLocator)) ||
      documentThumbnails.length > 0 ||
      (toolCall.result?.artifacts?.length ?? 0) > 0 ||
      mediaOutputCount > 0 ||
      (showAttachmentOutputs && attachmentOutputs.length > 0));

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
                className="neko-button px-3 py-1 text-[11px] leading-4"
              >
                {t('toolCalls.approve')}
              </button>
              <button
                onClick={() => handleConfirm(false)}
                className="neko-button neko-button-secondary px-3 py-1 text-[11px] leading-4"
              >
                {t('toolCalls.deny')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (generationJob) {
    return (
      <GenerationJobCard
        toolCall={toolCall}
        job={generationJob}
        imageDescriptors={imageDescriptors}
        videoDescriptors={videoDescriptors}
        audioDescriptors={audioDescriptors}
        isPending={isPending}
        isSuccess={isSuccess}
        isFailed={isFailed}
      />
    );
  }

  // Normal display
  return (
    <div className="my-1">
      <div className={`agent-inline-card ${toneClass}`} data-agent-tool-call-id={toolCall.id}>
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

        {canvasAuthoringResult && <CanvasAuthoringResultSummary result={canvasAuthoringResult} />}

        {accessory}

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

      {hasProducedOutputs && (
        <section
          className="agent-produced-outputs"
          aria-label={t('chat.toolCall.outputs')}
          data-testid="tool-produced-outputs"
        >
          <div className="agent-produced-outputs-title">
            <ChevronIcon className="h-3 w-3 rotate-180" />
            <span>{t('chat.toolCall.outputs')}</span>
          </div>
          <div className="agent-produced-outputs-content">
            {isFileTool && filePath && fileContentLocator && (
              <button
                type="button"
                onClick={() => handleOpenFile(fileContentLocator)}
                className={compactActionClass}
                title={`${t('chat.toolCall.openOutput')}: ${filePath}`}
              >
                <FileIcon className="h-3 w-3" />
                <span>{filePath.split('/').pop() ?? filePath}</span>
              </button>
            )}

            {showAttachmentOutputs &&
              attachmentOutputs.map((attachment, index) => {
                const contentLocator =
                  attachment.contentLocator ?? attachment.assetRef?.contentLocator;
                if (!contentLocator) return null;
                const label =
                  attachment.assetRef?.label ??
                  attachment.path?.split('/').pop() ??
                  `${attachment.type} ${index + 1}`;
                return (
                  <button
                    key={`${attachment.type}:${label}:${index}`}
                    type="button"
                    onClick={() => handleOpenFile(contentLocator)}
                    className={compactActionClass}
                    title={`${t('chat.toolCall.openOutput')}: ${label}`}
                  >
                    <FileIcon className="h-3 w-3" />
                    <span>{label}</span>
                  </button>
                );
              })}

            {documentThumbnails.length > 0 && (
              <DocumentImageThumbnails thumbnails={documentThumbnails} />
            )}

            {toolCall.result?.artifacts && toolCall.result.artifacts.length > 0 && (
              <ArtifactTransferSummary artifacts={toolCall.result.artifacts} />
            )}

            {isImageTool && imageDescriptors.length > 0 && (
              <AgentPreviewCollection descriptors={imageDescriptors} />
            )}
            {isVideoTool && videoDescriptors.length > 0 && (
              <AgentPreviewCollection descriptors={videoDescriptors} />
            )}
            {isAudioTool && audioDescriptors.length > 0 && (
              <AgentPreviewCollection descriptors={audioDescriptors} />
            )}
          </div>
        </section>
      )}

      {relatedSubAgents.map((item) => (
        <SubAgentCard key={item.id} item={item} />
      ))}
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
                <span className="shrink-0 font-mono text-[9px] opacity-75">{diagnostic.code}</span>
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

function CanvasAuthoringChipRow({ label, children }: { label: string; children: ReactNode }) {
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

function formatCanvasAuthoringRefTitle(
  ref: CanvasAuthoringResultProjection['refs'][number],
): string {
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
