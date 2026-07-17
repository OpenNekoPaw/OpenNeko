/**
 * ContentBlockItem - Individual content block renderer
 *
 * Renders a single content block (thinking, text, tool_call, code_diff, composite)
 * as an independent visual unit in the message list.
 */

import { memo } from 'react';
import {
  extractCompositeContentFenceCandidates,
  parseCompositeContentJson,
  type ContentBlock,
  type ToolCall,
} from '@neko-agent/types';
import { ToolCallDisplay, ToolCallGroupDisplay } from '@/components/ChatView/ToolCallDisplay';
import { DiffBlock } from '@/components/ChatView/DiffBlock';
import { RichContentRenderer } from '@/components/ChatView/RichContent';
import { MarkdownRenderer, ThinkingBlock } from '@/components/ChatView/MessageContent';
import { MessageAvatar } from '@/components/ChatView/MessageAvatar';
import { useMessageActions } from '@/components/ChatView/MessageActionsContext';
import { SendToMenu } from '@/components/ChatView/SendToMenu';
import { useTranslation } from '@/i18n/I18nContext';
import { AgentHostMessages } from '@/messages';
import { projectCanonicalStoryboardCanvasAuthoringHandoff } from '@/presenters/storyboard-transfer-presenter';
import { projectMarkdownResourceRendering } from '@/presenters/markdown-resource-rendering-presenter';
import {
  formatCanvasLifecycleActionLabel,
  formatCanvasLifecycleArtifactRef,
  formatCanvasLifecycleDiagnosticMessage,
  formatCanvasLifecycleDiagnosticSeverity,
  formatCanvasLifecycleStatus,
  type ChatTranslation,
} from '@/presenters/canvas-lifecycle-localization-presenter';
import { EditIcon, FileIcon, InfoIcon, PackageIcon, SettingsIcon } from '@neko/shared/icons';
import {
  projectContentBlockUi,
  type ContentBlockHeaderIconKind,
  type ContentBlockHeaderTone,
  type ContentBlockUiProjection,
} from '@/presenters/content-block-presenter';
import {
  isCanvasMarkdownCapabilityInput,
  isCanvasMarkdownCapabilityResult,
  normalizeCanonicalStoryboardTable,
  type AgentCapabilityAction,
  type AgentCapabilityInvocationInput,
  type AgentCapabilityInvocationResult,
  type CanvasMarkdownCapabilityResult,
} from '@neko/shared';
import type { MessageSpeakerIdentity } from '@/components/ChatView/message-identity';
import { createAgentMarkdownSessionKey } from '@/markdown/agent-markdown-session-registry';

interface ContentBlockItemProps {
  /** The content block to render */
  block?: ContentBlock;
  /** Projected content block display model, used by message-level aggregation. */
  projection?: ContentBlockUiProjection;
  /** Whether this is the first block in the message */
  isFirst: boolean;
  /** Whether this is the last block in the message */
  isLast: boolean;
  /** Whether the parent message is streaming */
  isStreaming: boolean;
  /** Current conversation for scoped UI actions */
  conversationId: string | null;
  /** Stable owner message identity for Markdown session reuse. */
  messageId?: string;
  /** Work items linked to the parent message */
  workItemIds?: string[];
  /** Sibling blocks from the owner message, used for composite media resolution */
  siblingBlocks?: ContentBlock[];
  /** Tool calls collected from prior assistant messages in the same conversation. */
  ambientToolCalls?: readonly ToolCall[];
  /** Speaker identity for assistant-owned content blocks. */
  assistantIdentity?: MessageSpeakerIdentity;
}

const blockHeaderIconByKind: Record<ContentBlockHeaderIconKind, string> = {
  thinking: 'thinking',
  response: 'response',
  tool: 'tool',
  edit: 'edit',
  composite: '[]',
};

const blockHeaderToneClassByTone: Record<ContentBlockHeaderTone, string> = {
  purple: 'text-[var(--vscode-charts-purple)]',
  green: 'text-[var(--vscode-charts-green)]',
  blue: 'text-[var(--vscode-charts-blue)]',
  orange: 'text-[var(--vscode-charts-orange)]',
  yellow: 'text-[var(--vscode-charts-yellow)]',
};

export const ContentBlockItem = memo(function ContentBlockItem({
  block,
  projection: projectedBlock,
  isFirst,
  isStreaming,
  conversationId,
  messageId,
  workItemIds,
  siblingBlocks,
  ambientToolCalls,
  assistantIdentity,
}: ContentBlockItemProps) {
  const { t } = useTranslation();
  const actions = useMessageActions();
  const projection =
    projectedBlock ??
    (block
      ? projectContentBlockUi({
          block,
          siblingBlocks,
          ambientToolCalls,
          parentIsStreaming: isStreaming,
        })
      : null);

  if (!projection) return null;

  return (
    <div className="agent-message-row group">
      <div className="flex gap-2 px-2 py-1">
        {/* Avatar - only show on first block */}
        <div className="flex-shrink-0 w-5 pt-0.5">
          {isFirst ? (
            <MessageAvatar
              role="assistant"
              label={assistantIdentity?.avatarLabel}
              imageUri={assistantIdentity?.avatarUri}
              title={assistantIdentity?.title}
            />
          ) : (
            <div className="w-5" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 max-w-[85%]">
          {/* Header: Block type + timestamp */}
          <div className="flex items-center gap-2 mb-0.5">
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-medium ${blockHeaderToneClassByTone[projection.header.tone]}`}
            >
              <ContentBlockHeaderIcon
                kind={projection.header.iconKind}
                className="h-3 w-3 flex-shrink-0"
              />
              {projection.header.label}
            </span>
            <span className="text-[10px] text-[var(--vscode-descriptionForeground)] opacity-0 group-hover:opacity-100 transition-opacity">
              {projection.header.timestampLabel}
            </span>
            {projection.header.showStreamingBadge && (
              <span className="text-[10px] text-[var(--vscode-charts-green)] animate-pulse">
                {projection.header.streamingLabel}
              </span>
            )}
          </div>

          {/* Block content */}
          {renderBlockContent(
            projection,
            conversationId,
            messageId ?? projection.id,
            actions,
            t,
            workItemIds,
          )}
        </div>
      </div>
    </div>
  );
});

function ContentBlockHeaderIcon({
  kind,
  className,
}: {
  kind: ContentBlockHeaderIconKind;
  className?: string;
}) {
  switch (blockHeaderIconByKind[kind]) {
    case 'thinking':
      return <InfoIcon className={className} />;
    case 'response':
      return <FileIcon className={className} />;
    case 'tool':
      return <SettingsIcon className={className} />;
    case 'edit':
      return <EditIcon className={className} />;
    case '[]':
      return <PackageIcon className={className} />;
  }
}

/**
 * Render the content of a block based on its type
 */
function renderBlockContent(
  projection: ContentBlockUiProjection,
  conversationId: string | null,
  messageId: string,
  callbacks: Pick<
    import('@/components/ChatView/MessageActionsContext').MessageActionsContextValue,
    'onAcceptDiff' | 'onRejectDiff' | 'pluginsAvailable' | 'contextChips' | 'ambientNodes'
  >,
  t: ChatTranslation,
  workItemIds?: string[],
) {
  switch (projection.renderKind) {
    case 'thinking':
      return (
        <ThinkingBlock
          content={projection.thinking}
          isComplete={projection.isThinkingComplete}
          sessionKey={createAgentMarkdownSessionKey({
            conversationId,
            messageId,
            itemId: projection.id,
          })}
        />
      );

    case 'markdown': {
      const markdownResources = !projection.renderStreaming
        ? projectMarkdownResourceRendering({
            markdown: projection.content,
            siblingBlocks: projection.siblingBlocks,
            toolCalls: projection.toolCalls,
            contextChips: callbacks.contextChips,
            ambientNodes: callbacks.ambientNodes,
          })
        : undefined;
      const canonicalStoryboardHandoff =
        !projection.renderStreaming && callbacks.pluginsAvailable?.canvas
          ? projectEmbeddedCanonicalStoryboardHandoff({
              markdown: projection.content,
              contentBlockId: projection.id,
              siblingBlocks: projection.siblingBlocks,
            })
          : null;
      return (
        <div className="agent-bubble agent-bubble-assistant block w-fit max-w-full min-w-0 rounded-2xl rounded-tl-md px-2.5 py-1.5 text-[13px] leading-relaxed">
          <MarkdownRenderer
            content={projection.content}
            isStreaming={projection.renderStreaming}
            markdownResources={markdownResources}
            contentBlockId={projection.id}
            siblingBlocks={projection.siblingBlocks}
            conversationId={conversationId}
            plugins={callbacks.pluginsAvailable}
            sessionKey={createAgentMarkdownSessionKey({
              conversationId,
              messageId,
              itemId: projection.id,
            })}
          />
          {canonicalStoryboardHandoff && callbacks.pluginsAvailable && (
            <div className="mt-1.5 flex flex-wrap gap-1.5 border-t border-[var(--agent-divider)] pt-1">
              <SendToMenu
                canvasAuthoringHandoff={canonicalStoryboardHandoff ?? undefined}
                conversationId={conversationId}
                mediaType="image"
                plugins={callbacks.pluginsAvailable}
                allowedTargets={['canvas']}
              />
            </div>
          )}
        </div>
      );
    }

    case 'tool':
      return (
        <div className="w-full">
          <ToolCallDisplay
            toolCall={projection.toolCall}
            conversationId={conversationId}
            workItemIds={workItemIds}
          />
        </div>
      );

    case 'toolGroup':
      return (
        <div className="w-full">
          <ToolCallGroupDisplay
            projection={projection}
            conversationId={conversationId}
            workItemIds={workItemIds}
          />
        </div>
      );

    case 'diff':
      return (
        <div className="w-full">
          <DiffBlock
            diff={projection.codeDiff}
            onAccept={callbacks.onAcceptDiff}
            onReject={callbacks.onRejectDiff}
          />
        </div>
      );

    case 'composite':
      return (
        <div className="w-full">
          <RichContentRenderer
            kind={projection.richContent.kind}
            data={projection.richContent.data}
            conversationId={conversationId}
          />
        </div>
      );

    case 'canvasLifecycle':
      return (
        <CanvasLifecycleResultCard
          lifecycle={projection.canvasLifecycle.result}
          success={projection.canvasLifecycle.success}
          requestId={projection.canvasLifecycle.requestId}
          error={projection.canvasLifecycle.error}
          conversationId={conversationId}
          t={t}
        />
      );

    case 'empty':
      return null;
  }
}

function projectEmbeddedCanonicalStoryboardHandoff(input: {
  readonly markdown: string;
  readonly contentBlockId: string;
  readonly siblingBlocks?: readonly ContentBlock[];
}) {
  const derivedComposites = (input.siblingBlocks ?? [])
    .filter((block) => {
      const source = block.compositeSource;
      return (
        block.type === 'composite' &&
        block.composite !== undefined &&
        source !== undefined &&
        source.sourceBlockId === input.contentBlockId
      );
    })
    .flatMap((block) => (block.composite ? [block.composite] : []));
  const composites =
    derivedComposites.length > 0
      ? derivedComposites
      : extractCompositeContentFenceCandidates(input.markdown).flatMap((candidate) =>
          parseCompositeContentJson(candidate.rawJson),
        );

  for (const composite of composites) {
    if (composite.template !== 'storyboard-table' || !composite.storyboardTable) continue;
    const normalized = normalizeCanonicalStoryboardTable({ value: composite.storyboardTable });
    if (!normalized.table) return null;
    return projectCanonicalStoryboardCanvasAuthoringHandoff(normalized.table);
  }
  return null;
}

function CanvasLifecycleResultCard({
  lifecycle,
  success,
  requestId,
  error,
  conversationId,
  t,
}: {
  lifecycle: AgentCapabilityInvocationResult;
  success: boolean;
  requestId: string;
  error?: string;
  conversationId: string | null;
  t: ChatTranslation;
}) {
  return (
    <div className="agent-bubble agent-bubble-assistant w-fit max-w-full rounded-2xl rounded-tl-md px-2.5 py-2 text-[12px] leading-relaxed">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="font-medium text-[var(--agent-fg)]">
          Canvas {formatCanvasLifecycleStatus(t, lifecycle.status)}
        </span>
        <span className="font-mono text-[10px] text-[var(--vscode-descriptionForeground)]">
          {lifecycle.capabilityId}
        </span>
        <CanvasLifecycleDataBadge result={readCanvasMarkdownLifecycleData(lifecycle)} t={t} />
        {!success && (
          <span className="rounded border border-[var(--vscode-errorForeground)] px-1.5 py-0.5 text-[10px] text-[var(--vscode-errorForeground)]">
            {t('chat.canvasLifecycle.blocked')}
          </span>
        )}
      </div>
      {lifecycle.reviewArtifact && (
        <div className="mt-1 text-[11px] text-[var(--agent-fg-secondary)]">
          {t('chat.canvasLifecycle.reviewArtifact', {
            artifact: formatCanvasLifecycleArtifactRef(lifecycle.reviewArtifact),
          })}
        </div>
      )}
      {lifecycle.changedRefs?.length ? (
        <div className="mt-1 text-[11px] text-[var(--agent-fg-secondary)]">
          {t('chat.canvasLifecycle.changedRefs', {
            refs: lifecycle.changedRefs.map(formatCanvasLifecycleArtifactRef).join(', '),
          })}
        </div>
      ) : null}
      {lifecycle.diagnostics.length > 0 && (
        <div className="mt-1.5 space-y-1">
          {lifecycle.diagnostics.map((diagnostic, index) => (
            <div
              key={`${diagnostic.code}:${index}`}
              className="rounded border border-[var(--agent-divider)] bg-[var(--agent-elevated)] px-1.5 py-1 text-[11px]"
            >
              <span className="font-medium">
                {formatCanvasLifecycleDiagnosticSeverity(t, diagnostic.severity)}
              </span>{' '}
              <span className="font-mono">{diagnostic.code}</span>:{' '}
              <span>{formatCanvasLifecycleDiagnosticMessage(t, diagnostic)}</span>
            </div>
          ))}
        </div>
      )}
      {error && (
        <div className="mt-1.5 rounded border border-[var(--vscode-errorForeground)] px-1.5 py-1 text-[11px] text-[var(--vscode-errorForeground)]">
          {error}
        </div>
      )}
      <CanvasLifecycleActionList
        actions={lifecycle.actions}
        conversationId={conversationId}
        parentRequestId={requestId}
        t={t}
      />
    </div>
  );
}

function CanvasLifecycleDataBadge({
  result,
  t,
}: {
  result: CanvasMarkdownCapabilityResult | null;
  t: ChatTranslation;
}) {
  if (!result) return null;
  if (result.displayFallback) {
    return (
      <span className="rounded border border-[var(--vscode-editorWarning-foreground)] px-1.5 py-0.5 text-[10px] text-[var(--vscode-editorWarning-foreground)]">
        {t('chat.canvasLifecycle.badge.displayFallback')}
      </span>
    );
  }
  if (result.resolvedKind === 'generic-table') {
    return (
      <span className="rounded border border-[var(--agent-divider)] px-1.5 py-0.5 text-[10px] text-[var(--vscode-descriptionForeground)]">
        {t('chat.canvasLifecycle.badge.genericTable')}
      </span>
    );
  }
  if (result.resolvedKind === 'creative-table') {
    return (
      <span className="rounded border border-[var(--agent-divider)] px-1.5 py-0.5 text-[10px] text-[var(--vscode-descriptionForeground)]">
        {t('chat.canvasLifecycle.badge.creativeTable')}
      </span>
    );
  }
  return null;
}

function readCanvasMarkdownLifecycleData(
  lifecycle: AgentCapabilityInvocationResult,
): CanvasMarkdownCapabilityResult | null {
  return isCanvasMarkdownCapabilityResult(lifecycle.data) ? lifecycle.data : null;
}

function CanvasLifecycleActionList({
  actions,
  conversationId,
  parentRequestId,
  t,
}: {
  actions: AgentCapabilityInvocationResult['actions'];
  conversationId: string | null;
  parentRequestId: string;
  t: ChatTranslation;
}) {
  if (!actions?.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {actions.map((action) => (
        <CanvasLifecycleActionButton
          key={action.actionId}
          action={action}
          conversationId={conversationId}
          parentRequestId={parentRequestId}
          t={t}
        />
      ))}
    </div>
  );
}

function CanvasLifecycleActionButton({
  action,
  conversationId,
  parentRequestId,
  t,
}: {
  action: AgentCapabilityAction;
  conversationId: string | null;
  parentRequestId: string;
  t: ChatTranslation;
}) {
  const invocation = projectCanvasLifecycleActionInvocation(action);
  const disabledReason = !conversationId
    ? t('chat.canvasLifecycle.disabled.conversationUnavailable')
    : !invocation
      ? t('chat.canvasLifecycle.disabled.unsupportedActionPayload')
      : undefined;
  const disabled = disabledReason !== undefined;

  return (
    <button
      type="button"
      disabled={disabled}
      title={disabledReason ?? `${action.capabilityId} ${action.phase}`}
      onClick={() => {
        if (!conversationId || !invocation) return;
        AgentHostMessages.invokeAgentCapabilityLifecycle(
          conversationId,
          `${action.capabilityId}:${action.actionId}:${parentRequestId}`,
          invocation,
        );
      }}
      className="inline-flex min-h-6 max-w-full items-center gap-1 rounded border border-[var(--agent-input-border)] bg-[var(--agent-surface)] px-2 py-1 text-[11px] font-medium text-[var(--agent-fg)] transition-colors hover:border-[var(--agent-accent)] hover:bg-[var(--agent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="truncate">{formatCanvasLifecycleActionLabel(t, action)}</span>
      {action.requiresApproval && (
        <span className="text-[10px] opacity-70">{t('chat.canvasLifecycle.approvalRequired')}</span>
      )}
    </button>
  );
}

function projectCanvasLifecycleActionInvocation(
  action: AgentCapabilityAction,
): AgentCapabilityInvocationInput | null {
  if (!isCanvasMarkdownCapabilityInput(action.payload)) return null;
  if (action.capabilityId !== action.payload.capabilityId) return null;
  const approval =
    action.requiresApproval && (action.phase === 'apply' || action.phase === 'execute')
      ? {
          source: 'user-confirmation' as const,
          approvedAt: Date.now(),
        }
      : undefined;
  return {
    capabilityId: action.capabilityId,
    phase: action.phase,
    payload: action.payload,
    ...(action.target ? { target: action.target } : {}),
    ...(approval ? { approval } : {}),
    provenance: { source: 'webview' },
  };
}
