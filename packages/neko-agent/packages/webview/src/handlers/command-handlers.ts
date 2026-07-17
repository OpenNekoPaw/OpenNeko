/**
 * Command Message Handlers
 *
 * Handles: slashCommandResult
 */

import { defineHandler } from './types';
import type { MessageHandler, HandlerRegistration, MessageHandlerContext } from './types';
import type { AgentCapabilityLifecycleResultMessage, SlashCommandResultMessage } from './messages';
import type { SlashCommandResultEffect } from '@neko-agent/types';
import type { ContentBlock } from '@neko-agent/types';
import {
  projectCloseCurrentConversationTab,
  projectSlashCommandResultMessage,
} from '../presenters/command-result-presenter';
import {
  formatCanvasLifecycleActionLabel,
  formatCanvasLifecycleArtifactRef,
  formatCanvasLifecycleDiagnosticMessage,
  formatCanvasLifecycleDiagnosticSeverity,
  formatCanvasLifecycleStatus,
} from '../presenters/canvas-lifecycle-localization-presenter';
import { t } from '../i18n';
import { updateConversation } from './message-updater';

/**
 * Handle 'slashCommandResult' message - Result from slash command execution
 */
const handleSlashCommandResult: MessageHandler<'slashCommandResult'> = (
  message: SlashCommandResultMessage,
  context,
) => {
  const projection = projectSlashCommandResultMessage(message);
  for (const effect of projection.effects) {
    applySlashCommandEffect(effect, context, message.conversationId);
  }
};

const handleAgentCapabilityLifecycleResult: MessageHandler<'agentCapabilityLifecycleResult'> = (
  message: AgentCapabilityLifecycleResultMessage,
  context,
) => {
  updateConversation(context, message.conversationId, (messages, streamingMessageId) => ({
    messages: [
      ...messages,
      {
        id: `canvas-markdown-capability-${message.requestId}`,
        role: 'assistant',
        content: projectCanvasMarkdownCapabilityResultContent(message),
        ...(message.lifecycleResult
          ? {
              contentBlocks: [projectCanvasMarkdownLifecycleContentBlock(message)],
            }
          : {}),
        timestamp: Date.now(),
      },
    ],
    streamingMessageId,
  }));
};

function applySlashCommandEffect(
  effect: SlashCommandResultEffect,
  context: MessageHandlerContext,
  conversationId: string | undefined,
): void {
  switch (effect.type) {
    case 'appendAssistantMessage':
      updateConversation(context, conversationId, (messages, streamingMessageId) => ({
        messages: [...messages, effect.message],
        streamingMessageId,
      }));
      break;
    case 'closeCurrentTab': {
      if (!conversationId || !context.isCurrentConversation(conversationId)) return;
      const projection = projectCloseCurrentConversationTab({
        openTabs: context.openTabs,
        activeConversationId: context.activeConversationId,
      });
      if (!projection.updated) return;
      context.setOpenTabs(projection.openTabs);
      context.setActiveTabId(projection.activeTabId);
      context.setActiveConversationId(projection.activeConversationId);
      context.activeConversationIdRef.current = projection.activeConversationId;
      break;
    }
    case 'setActiveTab':
      context.setActiveTab(effect.activeTab);
      break;
  }
}

/**
 * All command handler registrations
 */
export const commandHandlers: HandlerRegistration[] = [
  defineHandler('slashCommandResult', handleSlashCommandResult),
  defineHandler('agentCapabilityLifecycleResult', handleAgentCapabilityLifecycleResult),
];

function projectCanvasMarkdownLifecycleContentBlock(
  message: AgentCapabilityLifecycleResultMessage,
): ContentBlock {
  if (!message.lifecycleResult) {
    throw new Error('Canvas Markdown lifecycle content block requires a lifecycle result.');
  }
  return {
    id: `canvas-lifecycle-${message.requestId}`,
    type: 'canvas_lifecycle',
    timestamp: Date.now(),
    canvasLifecycle: {
      requestId: message.requestId,
      success: message.success,
      result: message.lifecycleResult,
      ...(message.error ? { error: message.error } : {}),
    },
  };
}

function projectCanvasMarkdownCapabilityResultContent(
  message: AgentCapabilityLifecycleResultMessage,
): string {
  const lifecycle = message.lifecycleResult;
  if (lifecycle) {
    const diagnostics = projectCanvasLifecycleDiagnostics(lifecycle.diagnostics);
    const changed = lifecycle.changedRefs?.length
      ? `\n${t('chat.canvasLifecycle.changedRefs', {
          refs: lifecycle.changedRefs.map(formatCanvasLifecycleArtifactRef).join(', '),
        })}`
      : lifecycle.reviewArtifact
        ? `\n${t('chat.canvasLifecycle.reviewArtifact', {
            artifact: formatCanvasLifecycleArtifactRef(lifecycle.reviewArtifact),
          })}`
        : '';
    const actions = projectLifecycleActions(lifecycle.actions);
    return [
      t('chat.canvasLifecycle.summary.lifecycleAction', {
        status: formatCanvasLifecycleStatus(t, lifecycle.status),
        capability: lifecycle.capabilityId,
      }),
      diagnostics ? `${t('chat.canvasLifecycle.summary.diagnostics')}:\n${diagnostics}` : '',
      changed.trim(),
      actions.trim(),
      message.error ? t('chat.canvasLifecycle.summary.error', { error: message.error }) : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  const result = message.result;
  if (!result) {
    return t('chat.canvasLifecycle.summary.markdownActionFailed', {
      error: message.error ?? t('chat.canvasLifecycle.summary.unknownError'),
    });
  }

  const diagnostics = projectCanvasLifecycleDiagnostics(result.diagnostics);
  const created = result.nodeIds?.length
    ? `\n${t('chat.canvasLifecycle.summary.createdNodes', {
        nodes: result.nodeIds.join(', '),
      })}`
    : result.tableNodeId
      ? `\n${t('chat.canvasLifecycle.summary.createdTable', { node: result.tableNodeId })}`
      : '';
  const actions = result.actions?.length
    ? [
        t('chat.canvasLifecycle.summary.availableActions'),
        ...result.actions.map(
          (action) =>
            `- ${formatCanvasLifecycleActionLabel(t, action)} (${
              action.capabilityId ?? result.capabilityId
            })`,
        ),
      ].join('\n')
    : '';
  const status = message.success ? result.status : 'blocked';
  return [
    t('chat.canvasLifecycle.summary.markdownAction', {
      status: formatCanvasMarkdownCapabilityStatus(status),
      capability: result.capabilityId,
    }),
    diagnostics ? `${t('chat.canvasLifecycle.summary.diagnostics')}:\n${diagnostics}` : '',
    created.trim(),
    actions.trim(),
    message.error ? t('chat.canvasLifecycle.summary.error', { error: message.error }) : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

type CanvasCapabilityDiagnostics =
  | NonNullable<AgentCapabilityLifecycleResultMessage['lifecycleResult']>['diagnostics']
  | NonNullable<AgentCapabilityLifecycleResultMessage['result']>['diagnostics'];

function projectCanvasLifecycleDiagnostics(diagnostics: CanvasCapabilityDiagnostics): string {
  return diagnostics
    .map(
      (diagnostic) =>
        `- ${formatCanvasLifecycleDiagnosticSeverity(t, diagnostic.severity)} ${
          diagnostic.code
        }: ${formatCanvasLifecycleDiagnosticMessage(t, diagnostic)}`,
    )
    .join('\n');
}

function projectLifecycleActions(
  actions:
    | NonNullable<NonNullable<AgentCapabilityLifecycleResultMessage['lifecycleResult']>['actions']>
    | undefined,
): string {
  if (!actions?.length) return '';
  return [
    t('chat.canvasLifecycle.summary.availableLifecycleActions'),
    ...actions.map((action) => {
      const detail = [
        action.capabilityId,
        action.phase,
        action.requiresApproval
          ? t('chat.canvasLifecycle.summary.approvalRequired')
          : t('chat.canvasLifecycle.summary.noApprovalRequired'),
        action.sourceRef
          ? t('chat.canvasLifecycle.summary.sourceRef', {
              ref: formatCanvasLifecycleArtifactRef(action.sourceRef),
            })
          : undefined,
      ]
        .filter(Boolean)
        .join(', ');
      return `- ${formatCanvasLifecycleActionLabel(t, action)}${detail ? ` (${detail})` : ''}`;
    }),
  ].join('\n');
}

function formatCanvasMarkdownCapabilityStatus(
  status: NonNullable<AgentCapabilityLifecycleResultMessage['result']>['status'] | 'blocked',
): string {
  switch (status) {
    case 'created':
      return t('chat.canvasLifecycle.capabilityStatus.created');
    case 'changed':
      return t('chat.canvasLifecycle.capabilityStatus.changed');
    case 'validated':
      return t('chat.canvasLifecycle.capabilityStatus.validated');
    case 'needs-review':
      return t('chat.canvasLifecycle.capabilityStatus.needs-review');
    case 'blocked':
      return t('chat.canvasLifecycle.capabilityStatus.blocked');
  }
}
