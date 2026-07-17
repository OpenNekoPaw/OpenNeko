/**
 * Event Adapter
 *
 * Maps AgentEvent stream from @neko/agent to TUI store actions.
 * Single responsibility: event → state transition mapping.
 *
 * This is the critical bridge between the agent execution layer
 * and the Ink rendering layer.
 */

import type { AgentEvent } from '@neko/agent';
import {
  getAgentWorkItemRuntimeKey,
  projectAgentWorkItemsToTodo,
  type AgentWorkItem,
} from '@neko-agent/types';
import type { ConversationSlice } from '../stores/conversation-store';
import type { AgentSlice } from '../stores/agent-store';
import type { UISlice, PendingApproval } from '../stores/ui-store';
import type { AgentTerminalPresentationContext } from '../presentation/context';
import type { AgentTerminalMessageKey } from '../presentation/terminal-messages';
import { presentQueuedContinuation } from '../presentation/runtime-presentation';
import {
  createTerminalTimelineProjector,
  type TerminalTimelineMessage,
} from '../core/timeline-projector';

type ConversationStore = ConversationSlice;
type AgentStore = AgentSlice;
type UIStore = UISlice;
type StoreAccessor<TStore> = TStore | (() => TStore);

/**
 * Event adapter interface
 */
export interface IEventAdapter {
  /** Process a single agent event and dispatch to stores */
  handleEvent(event: AgentEvent): void;
  /** Process a host-neutral timeline/task message and dispatch to stores */
  handleMessage(message: TerminalTimelineMessage): void;
  /** Reset adapter state between executions */
  reset(): void;
}

export interface EventAdapterDeps {
  readonly conversationStore: StoreAccessor<ConversationStore>;
  readonly agentStore: StoreAccessor<AgentStore>;
  readonly uiStore: StoreAccessor<UIStore>;
  readonly presentation: AgentTerminalPresentationContext<AgentTerminalMessageKey>;
}

/**
 * Create an event adapter that routes AgentEvent to Zustand stores.
 *
 * Event mapping:
 * - text_delta     → conversationStore.appendDelta
 * - text           → conversationStore.completeMessage
 * - thinking_content → conversationStore.setThinking
 * - tool_call/result/progress → conversationStore.applyTimelineRows
 * - tool_confirmation → uiStore.showToolApproval
 * - iteration      → agentStore.setIteration
 * - done           → agentStore.setIdle + updateUsage
 * - error          → agentStore.setError
 */
export function createEventAdapter(deps: EventAdapterDeps): IEventAdapter {
  const conversationStore = createStoreAccessor(deps.conversationStore);
  const agentStore = createStoreAccessor(deps.agentStore);
  const uiStore = createStoreAccessor(deps.uiStore);
  const timelineProjector = createTerminalTimelineProjector({ presentation: deps.presentation });
  const workItemsByRuntimeKey = new Map<string, AgentWorkItem>();
  let hasStartedMessage = false;
  let currentDelta = '';

  const ensureAssistantMessage = (): void => {
    if (hasStartedMessage) {
      return;
    }
    conversationStore().startAssistantMessage();
    hasStartedMessage = true;
  };

  const applyTimeline = (
    event: AgentEvent,
    options: { readonly ensureAssistant?: boolean } = {},
  ): void => {
    if (options.ensureAssistant) {
      ensureAssistantMessage();
    }
    const rows = timelineProjector.projectEvent(event);
    if (rows.length > 0) {
      conversationStore().applyTimelineRows(rows);
      hasStartedMessage = true;
    }
  };

  const projectWorkItemTodos = (conversationId: string, workItem: AgentWorkItem): void => {
    workItemsByRuntimeKey.set(getAgentWorkItemRuntimeKey(workItem), workItem);
    const todos = projectAgentWorkItemsToTodo({
      conversationId,
      items: [...workItemsByRuntimeKey.values()],
    }).map(({ content, status }) => ({ content, status }));
    conversationStore().updateTodos(todos);
  };

  return {
    handleEvent(event: AgentEvent): void {
      switch (event.type) {
        case 'text_delta': {
          applyTimeline(event, { ensureAssistant: true });
          if (event.content) {
            currentDelta += event.content;
            conversationStore().appendDelta(event.content);
          }
          break;
        }

        case 'assistant_text_replacement': {
          applyTimeline(event, { ensureAssistant: true });
          currentDelta = '';
          break;
        }

        case 'text': {
          applyTimeline(event, { ensureAssistant: true });
          if (event.content) {
            conversationStore().completeMessage(event.content);
            currentDelta = '';
          }
          break;
        }

        case 'thinking':
        case 'thinking_content': {
          applyTimeline(event, { ensureAssistant: true });
          if (event.thinking) {
            conversationStore().setThinking(event.thinking);
          }
          break;
        }

        case 'tool_call': {
          applyTimeline(event, { ensureAssistant: true });
          break;
        }

        case 'tool_progress': {
          applyTimeline(event, { ensureAssistant: true });
          break;
        }

        case 'tool_result': {
          applyTimeline(event);
          break;
        }

        case 'tool_result_backfill': {
          applyTimeline(event);
          break;
        }

        case 'tool_confirmation': {
          applyTimeline(event);
          if (event.toolConfirmation) {
            agentStore().setWaitingConfirmation();
            const approval: PendingApproval = {
              toolCallId: event.toolConfirmation.toolCall.id,
              toolName: event.toolConfirmation.toolCall.name,
              arguments: event.toolConfirmation.toolCall.arguments,
              resolve: () => {
                // Resolved via session.confirmTool — handled by useAgentSession
              },
            };
            uiStore().showToolApproval(approval);
          }
          break;
        }

        case 'iteration': {
          if (event.iteration) {
            agentStore().setIteration(event.iteration.current, event.iteration.max);
          }
          break;
        }

        case 'done': {
          applyTimeline(event);
          agentStore().setIdle();
          if (event.usage) {
            agentStore().updateUsage(event.usage);
          }
          // Finalize streaming message with accumulated delta
          if (currentDelta) {
            conversationStore().completeMessage(currentDelta);
          }
          currentDelta = '';
          hasStartedMessage = false;
          break;
        }

        case 'error': {
          applyTimeline(event);
          if (event.error) {
            const error =
              event.error instanceof Error ? event.error : new Error(event.error.message);
            agentStore().setError(error);
            conversationStore().addError(error);
          }
          currentDelta = '';
          hasStartedMessage = false;
          break;
        }

        case 'messageQueued':
          if (event.messageQueueSnapshot) {
            agentStore().setMessageQueueSnapshot(event.messageQueueSnapshot);
          } else if (typeof event.pendingCount === 'number') {
            const current = agentStore().messageQueue.snapshot;
            agentStore().setMessageQueueSnapshot({
              conversationId: current?.conversationId ?? 'unknown',
              items: current?.items ?? [],
              pendingCount: event.pendingCount,
              version: current?.version ?? 0,
            });
          }
          if (event.queuedMessageItem && isInternalContinuation(event.queuedMessageItem)) {
            conversationStore().addSystemMessage(
              presentQueuedContinuation(
                event.queuedMessageItem,
                event.pendingCount ?? 1,
                deps.presentation,
              ),
            );
          }
          break;
      }
    },

    handleMessage(message: TerminalTimelineMessage): void {
      const rows = timelineProjector.projectMessage(message);
      if (rows.length > 0) {
        conversationStore().applyTimelineRows(rows);
        hasStartedMessage = true;
      }
      switch (message.type) {
        case 'mediaTaskCreated':
        case 'mediaTaskProgress':
        case 'taskCreated':
        case 'taskUpdated':
          projectWorkItemTodos(message.conversationId, message.workItem);
          break;
        case 'agentTurnTimelineUpdate':
          for (const operation of message.operations) {
            if (operation.operation !== 'upsert' && operation.operation !== 'snapshot') {
              continue;
            }
            if (operation.item.kind !== 'task' && operation.item.kind !== 'media') {
              continue;
            }
            projectWorkItemTodos(message.conversationId, operation.item.payload.workItem);
          }
          break;
      }
    },

    reset(): void {
      timelineProjector.reset();
      workItemsByRuntimeKey.clear();
      hasStartedMessage = false;
      currentDelta = '';
    },
  };
}

function isInternalContinuation(item: import('@neko-agent/types').AgentQueuedMessageItem): boolean {
  return item.source !== 'user' && item.source !== 'composer';
}

function createStoreAccessor<TStore>(store: StoreAccessor<TStore>): () => TStore {
  return typeof store === 'function' ? (store as () => TStore) : () => store;
}
