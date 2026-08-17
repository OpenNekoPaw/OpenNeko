/** Renders one typed block body inside the owning Assistant turn. */

import { memo } from 'react';
import { ToolCallDisplay, ToolCallGroupDisplay } from './ToolCallDisplay';
import { DiffBlock } from './DiffBlock';
import { RichContentRenderer } from './RichContent';
import { MarkdownRenderer } from './MessageContent';
import { useMessageActions } from './MessageActionsContext';
import { useTranslation } from '../../i18n/I18nContext';
import { useAgentHostMessages } from '../../host-runtime-context';
import { projectMarkdownResourceRendering } from '../../presenters/markdown-resource-rendering-presenter';
import {
  formatCanvasLifecycleActionLabel,
  formatCanvasLifecycleArtifactRef,
  formatCanvasLifecycleDiagnosticMessage,
  formatCanvasLifecycleDiagnosticSeverity,
  formatCanvasLifecycleStatus,
  type ChatTranslation,
} from '../../presenters/canvas-lifecycle-localization-presenter';
import type { ContentBlockUiProjection } from '../../presenters/content-block-presenter';
import {
  isCanvasMarkdownCapabilityInput,
  isCanvasMarkdownCapabilityResult,
  type CanvasMarkdownCapabilityResult,
} from '@neko/canvas-domain';
import {
  type AgentCapabilityAction,
  type AgentCapabilityInvocationInput,
  type AgentCapabilityInvocationResult,
} from '@neko/agent-contracts';

interface ContentBlockItemProps {
  projection: ContentBlockUiProjection;
  /** Current conversation for scoped UI actions */
  conversationId: string | null;
  /** Stable owner message identity for Markdown session reuse. */
  messageId: string;
  /** Work items linked to the parent message */
  workItemIds?: string[];
}

export const ContentBlockItem = memo(function ContentBlockItem({
  projection,
  conversationId,
  workItemIds,
}: ContentBlockItemProps) {
  const { t } = useTranslation();
  const actions = useMessageActions();

  return (
    <div
      className={
        projection.renderKind === 'markdown'
          ? 'agent-turn-text-lane min-w-0'
          : 'agent-turn-wide-lane min-w-0'
      }
    >
      {renderBlockContent(projection, conversationId, actions, t, workItemIds)}
    </div>
  );
});

/**
 * Render the content of a block based on its type
 */
function renderBlockContent(
  projection: ContentBlockUiProjection,
  conversationId: string | null,
  callbacks: Pick<
    import('./MessageActionsContext').MessageActionsContextValue,
    'onAcceptDiff' | 'onRejectDiff' | 'pluginsAvailable' | 'contextChips' | 'ambientNodes'
  >,
  t: ChatTranslation,
  workItemIds?: string[],
) {
  switch (projection.renderKind) {
    case 'thinking':
      throw new Error('Thinking projections must render through AssistantTurnActivity.');

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
      return (
        <div className="agent-assistant-document min-w-0 text-[13px] leading-relaxed">
          <MarkdownRenderer
            content={projection.content}
            isStreaming={projection.renderStreaming}
            markdownResources={markdownResources}
          />
        </div>
      );
    }

    case 'tool':
      return (
        <div className="w-full">
          <ToolCallDisplay
            toolCall={projection.toolCall}
            progress={projection.toolProgress}
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
        <span className="font-mono text-[10px] text-[var(--neko-descriptionForeground)]">
          {lifecycle.capabilityId}
        </span>
        <CanvasLifecycleDataBadge result={readCanvasMarkdownLifecycleData(lifecycle)} t={t} />
        {!success && (
          <span className="rounded border border-[var(--neko-errorForeground)] px-1.5 py-0.5 text-[10px] text-[var(--neko-errorForeground)]">
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
        <div className="mt-1.5 rounded border border-[var(--neko-errorForeground)] px-1.5 py-1 text-[11px] text-[var(--neko-errorForeground)]">
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
}: {
  result: CanvasMarkdownCapabilityResult | null;
  t: ChatTranslation;
}) {
  void result;
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
  const agentHostMessages = useAgentHostMessages();
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
        agentHostMessages.invokeAgentCapabilityLifecycle(
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
