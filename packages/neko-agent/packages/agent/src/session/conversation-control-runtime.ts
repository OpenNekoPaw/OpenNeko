import {
  buildHistoryClearedMessage,
  buildMessageCancelledMessage,
  type AgentPhaseMessage,
  type HistoryClearedMessage,
  type MessageCancelledMessage,
  type MessageQueueSnapshotMessage,
} from '@neko-agent/types';

export type ConversationControlRuntimeMessage =
  HistoryClearedMessage | MessageCancelledMessage | AgentPhaseMessage | MessageQueueSnapshotMessage;

export interface ConversationControlDisposable {
  dispose(): void;
}

export interface ConversationControlRuntimeEffects {
  createConversation?(): string | Promise<string>;
  onConversationCreated?(conversationId: string): void;
  switchConversation?(conversationId: string): boolean;
  deleteConversation?(
    conversationId: string,
    options?: DeleteConversationRuntimeOptions,
  ): boolean | void | Promise<boolean | void>;
  listConversationIds?(): readonly string[];
  clearConversations?(): void | Promise<void>;
  refreshConversationList?(): void;
  refreshActiveConversation?(): void;
  removeAgent?(conversationId: string): void | Promise<void>;
  clearAgentState?(conversationId: string): void;
  clearAgentHistory?(conversationId: string): void | Promise<void>;
  clearPendingMessages?(conversationId: string): void;
  updateConversationMessages?(conversationId: string, messages: []): void;
  confirmTool?(conversationId: string, toolCallId: string, approved: boolean): void;
  cancelAgent?(conversationId: string): void;
  isAgentRunning?(conversationId: string): boolean;
  onAgentStopped?(
    conversationId: string,
    listener: () => void,
  ): ConversationControlDisposable | undefined;
  postMessage?(message: ConversationControlRuntimeMessage): void | Promise<void>;
  now?(): number;
  onWarning?(warning: ConversationControlRuntimeWarning): void;
}

export type ConversationControlRuntimeWarningCode =
  'missing-conversation-id' | 'missing-agent-manager';

export interface ConversationControlRuntimeWarning {
  code: ConversationControlRuntimeWarningCode;
  action: ConversationControlAction;
  conversationId?: string;
}

export type ConversationControlAction =
  | 'new-conversation'
  | 'switch-conversation'
  | 'delete-conversation'
  | 'clear-history'
  | 'clear-all-conversations'
  | 'confirm-tool'
  | 'cancel-message';

export interface ConversationControlRuntimeResult {
  action: ConversationControlAction;
  handled: boolean;
  conversationId?: string;
  conversationIds?: readonly string[];
}

export interface ConversationControlConversationInput {
  conversationId: string;
}

export interface DeleteConversationRuntimeOptions {
  activateNext?: boolean;
}

export interface DeleteConversationRuntimeInput extends ConversationControlConversationInput {
  activateNext?: boolean;
}

export interface ConfirmToolRuntimeInput extends ConversationControlConversationInput {
  toolCallId: string;
  approved: boolean;
}

export function buildConversationHistoryClearedMessage(
  conversationId: string,
): HistoryClearedMessage {
  return buildHistoryClearedMessage(conversationId);
}

export async function runNewConversationRuntime(
  effects: ConversationControlRuntimeEffects,
): Promise<ConversationControlRuntimeResult> {
  const conversationId = await effects.createConversation?.();
  if (conversationId !== undefined) {
    effects.onConversationCreated?.(conversationId);
  }
  effects.refreshConversationList?.();
  effects.refreshActiveConversation?.();
  return {
    action: 'new-conversation',
    handled: conversationId !== undefined,
    ...(conversationId !== undefined ? { conversationId } : {}),
  };
}

export async function runSwitchConversationRuntime(
  input: ConversationControlConversationInput,
  effects: ConversationControlRuntimeEffects,
): Promise<ConversationControlRuntimeResult> {
  if (!requireConversationId('switch-conversation', input.conversationId, effects)) {
    return { action: 'switch-conversation', handled: false };
  }

  const switched = effects.switchConversation?.(input.conversationId) === true;
  if (switched) {
    effects.refreshActiveConversation?.();
  }

  return {
    action: 'switch-conversation',
    handled: switched,
    conversationId: input.conversationId,
  };
}

export async function runDeleteConversationRuntime(
  input: DeleteConversationRuntimeInput,
  effects: ConversationControlRuntimeEffects,
): Promise<ConversationControlRuntimeResult> {
  if (!requireConversationId('delete-conversation', input.conversationId, effects)) {
    return { action: 'delete-conversation', handled: false };
  }

  await effects.removeAgent?.(input.conversationId);
  effects.clearAgentState?.(input.conversationId);
  effects.clearPendingMessages?.(input.conversationId);
  const activateNext = input.activateNext ?? true;
  await effects.deleteConversation?.(input.conversationId, { activateNext });
  effects.refreshConversationList?.();
  if (activateNext) {
    effects.refreshActiveConversation?.();
  }

  return {
    action: 'delete-conversation',
    handled: true,
    conversationId: input.conversationId,
  };
}

export async function runClearHistoryRuntime(
  input: ConversationControlConversationInput,
  effects: ConversationControlRuntimeEffects,
): Promise<ConversationControlRuntimeResult> {
  if (!requireConversationId('clear-history', input.conversationId, effects)) {
    return { action: 'clear-history', handled: false };
  }

  await effects.clearAgentHistory?.(input.conversationId);
  effects.clearPendingMessages?.(input.conversationId);
  effects.updateConversationMessages?.(input.conversationId, []);
  await effects.postMessage?.(buildConversationHistoryClearedMessage(input.conversationId));

  return {
    action: 'clear-history',
    handled: true,
    conversationId: input.conversationId,
  };
}

export async function runClearAllConversationsRuntime(
  effects: ConversationControlRuntimeEffects,
): Promise<ConversationControlRuntimeResult> {
  const conversationIds = effects.listConversationIds?.() ?? [];
  for (const conversationId of conversationIds) {
    await effects.removeAgent?.(conversationId);
    effects.clearAgentState?.(conversationId);
    effects.clearPendingMessages?.(conversationId);
  }

  await effects.clearConversations?.();
  effects.refreshConversationList?.();

  for (const conversationId of conversationIds) {
    await effects.postMessage?.(buildConversationHistoryClearedMessage(conversationId));
  }

  return {
    action: 'clear-all-conversations',
    handled: true,
    conversationIds,
  };
}

export async function runConfirmToolRuntime(
  input: ConfirmToolRuntimeInput,
  effects: ConversationControlRuntimeEffects,
): Promise<ConversationControlRuntimeResult> {
  if (!requireConversationId('confirm-tool', input.conversationId, effects)) {
    return { action: 'confirm-tool', handled: false };
  }

  effects.confirmTool?.(input.conversationId, input.toolCallId, input.approved);
  return {
    action: 'confirm-tool',
    handled: true,
    conversationId: input.conversationId,
  };
}

export async function runCancelMessageRuntime(
  input: ConversationControlConversationInput,
  effects: ConversationControlRuntimeEffects,
): Promise<ConversationControlRuntimeResult> {
  if (!requireConversationId('cancel-message', input.conversationId, effects)) {
    return { action: 'cancel-message', handled: false };
  }
  if (!effects.cancelAgent) {
    effects.onWarning?.({
      code: 'missing-agent-manager',
      action: 'cancel-message',
      conversationId: input.conversationId,
    });
    return { action: 'cancel-message', handled: false, conversationId: input.conversationId };
  }

  if (effects.isAgentRunning?.(input.conversationId) === true) {
    const disposableRef: { current?: ConversationControlDisposable } = {};
    disposableRef.current = effects.onAgentStopped?.(input.conversationId, () => {
      disposableRef.current?.dispose();
      void effects.postMessage?.(buildMessageCancelledMessage(input.conversationId));
    });
    effects.cancelAgent(input.conversationId);
    effects.clearPendingMessages?.(input.conversationId);
    if (!disposableRef.current) {
      await effects.postMessage?.(buildMessageCancelledMessage(input.conversationId));
    }
    return { action: 'cancel-message', handled: true, conversationId: input.conversationId };
  }

  effects.cancelAgent(input.conversationId);
  effects.clearPendingMessages?.(input.conversationId);
  await effects.postMessage?.(buildMessageCancelledMessage(input.conversationId));

  return {
    action: 'cancel-message',
    handled: true,
    conversationId: input.conversationId,
  };
}

function requireConversationId(
  action: ConversationControlAction,
  conversationId: string,
  effects: ConversationControlRuntimeEffects,
): boolean {
  if (conversationId) return true;

  effects.onWarning?.({ code: 'missing-conversation-id', action });
  return false;
}
