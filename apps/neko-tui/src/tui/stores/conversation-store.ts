/**
 * Conversation Store
 *
 * Manages chat messages, streaming text delta accumulation,
 * tool call lifecycle, and todo items.
 */

import { createStore, type StateCreator, type StoreApi } from 'zustand/vanilla';
import type { Message, TerminalTimelineRow, ToolCallState, TodoItem } from '../types/state';
import { deriveTodoProjection } from '../core/todo-projection';

type SystemMessageInput =
  string | Omit<Message, 'id' | 'role' | 'toolCalls' | 'todos' | 'timestamp'>;

export interface ConversationSlice {
  // State
  readonly messages: Message[];
  readonly currentDelta: string;
  readonly isStreaming: boolean;
  readonly currentThinking: string;

  // Actions
  addUserMessage: (content: string) => void;
  startAssistantMessage: () => void;
  appendDelta: (delta: string) => void;
  completeMessage: (content: string) => void;
  setThinking: (thinking: string) => void;
  addToolCall: (toolCall: { id: string; name: string; arguments: Record<string, unknown> }) => void;
  updateToolResult: (result: {
    toolCallId: string;
    success: boolean;
    data: unknown;
    error?: string;
  }) => void;
  applyTimelineRows: (rows: readonly TerminalTimelineRow[]) => void;
  updateTodos: (todos: TodoItem[]) => void;
  addError: (error: Error) => void;
  addSystemMessage: (input: SystemMessageInput) => void;
  replaceMessages: (messages: Message[]) => void;
  clearMessages: () => void;
}

export type ConversationStore = StoreApi<ConversationSlice>;

export function createConversationStore(
  assertMutable: () => void = () => undefined,
): ConversationStore {
  return createStore<ConversationSlice>(createConversationState(assertMutable));
}

function createConversationState(assertMutable: () => void): StateCreator<ConversationSlice> {
  let messageCounter = 0;
  const nextId = (): string => `msg-${++messageCounter}-${Date.now()}`;

  return (set) => {
    const update = (
      next:
        | ConversationSlice
        | Partial<ConversationSlice>
        | ((state: ConversationSlice) => ConversationSlice | Partial<ConversationSlice>),
    ): void => {
      assertMutable();
      set(next);
    };

    return {
      messages: [],
      currentDelta: '',
      isStreaming: false,
      currentThinking: '',

      addUserMessage: (content) => {
        update((state) => ({
          messages: [
            ...state.messages,
            {
              id: nextId(),
              role: 'user' as const,
              content,
              toolCalls: [],
              todos: [],
              timestamp: Date.now(),
            },
          ],
        }));
      },

      startAssistantMessage: () => {
        update((state) => ({
          messages: [
            ...state.messages,
            {
              id: nextId(),
              role: 'assistant' as const,
              content: '',
              toolCalls: [],
              todos: [],
              timestamp: Date.now(),
            },
          ],
          currentDelta: '',
          isStreaming: true,
          currentThinking: '',
        }));
      },

      appendDelta: (delta) => {
        update((state) => ({
          currentDelta: state.currentDelta + delta,
        }));
      },

      completeMessage: (content) => {
        update((state) => {
          const messages = [...state.messages];
          const last = messages[messages.length - 1];
          if (last?.role === 'assistant') {
            const derivedTodos = deriveTodoProjection(content);
            messages[messages.length - 1] = {
              ...last,
              content,
              todos: derivedTodos.length > 0 ? derivedTodos : last.todos,
            };
          }
          return { messages, currentDelta: '', isStreaming: false };
        });
      },

      setThinking: (thinking) => {
        update((state) => ({
          currentThinking: state.currentThinking + thinking,
        }));
      },

      addToolCall: (toolCall) => {
        update((state) => {
          const messages = [...state.messages];
          const last = messages[messages.length - 1];
          if (last?.role === 'assistant') {
            const tc: ToolCallState = {
              id: toolCall.id,
              name: toolCall.name,
              arguments: toolCall.arguments,
              status: 'running',
            };
            messages[messages.length - 1] = {
              ...last,
              toolCalls: [...last.toolCalls, tc],
            };
          }
          return { messages };
        });
      },

      updateToolResult: (result) => {
        update((state) => {
          const messages = [...state.messages];
          const last = messages[messages.length - 1];
          if (last?.role === 'assistant') {
            const toolCalls = last.toolCalls.map((tc) =>
              tc.id === result.toolCallId
                ? {
                    ...tc,
                    status: (result.success ? 'success' : 'error') as ToolCallState['status'],
                    result: result.data,
                    error: result.error,
                  }
                : tc,
            );
            messages[messages.length - 1] = { ...last, toolCalls };
          }
          return { messages };
        });
      },

      applyTimelineRows: (rows) => {
        if (rows.length === 0) return;
        update((state) => {
          const messages = [...state.messages];
          const last = messages[messages.length - 1];
          if (last?.role !== 'assistant') {
            messages.push({
              id: nextId(),
              role: 'assistant' as const,
              content: '',
              toolCalls: [],
              todos: [],
              timelineRows: normalizeTimelineRows(rows),
              timestamp: Date.now(),
            });
            return { messages, isStreaming: rows.some((row) => row.status === 'streaming') };
          }

          const timelineRows = mergeTimelineRows(last.timelineRows ?? [], rows);
          messages[messages.length - 1] = {
            ...last,
            timelineRows,
          };
          return { messages, isStreaming: timelineRows.some((row) => row.status === 'streaming') };
        });
      },

      updateTodos: (todos) => {
        update((state) => {
          const messages = [...state.messages];
          const last = messages[messages.length - 1];
          if (last?.role === 'assistant') {
            messages[messages.length - 1] = { ...last, todos };
          }
          return { messages };
        });
      },

      addError: (error) => {
        update((state) => ({
          messages: [
            ...state.messages,
            {
              id: nextId(),
              role: 'system' as const,
              content: error.message,
              toolCalls: [],
              todos: [],
              timestamp: Date.now(),
              isError: true,
            },
          ],
          isStreaming: false,
        }));
      },

      addSystemMessage: (input) => {
        const messageInput = typeof input === 'string' ? { content: input } : input;
        update((state) => ({
          messages: [
            ...state.messages,
            {
              id: nextId(),
              role: 'system' as const,
              ...messageInput,
              toolCalls: [],
              todos: [],
              timestamp: Date.now(),
              isError: messageInput.isError ?? false,
            },
          ],
        }));
      },

      replaceMessages: (messages) => {
        update({
          messages: [...messages],
          currentDelta: '',
          isStreaming: false,
          currentThinking: '',
        });
      },

      clearMessages: () => {
        update({ messages: [], currentDelta: '', isStreaming: false, currentThinking: '' });
      },
    };
  };
}

function mergeTimelineRows(
  currentRows: readonly TerminalTimelineRow[],
  incomingRows: readonly TerminalTimelineRow[],
): TerminalTimelineRow[] {
  return normalizeTimelineRows([...currentRows, ...incomingRows]);
}

function normalizeTimelineRows(rows: readonly TerminalTimelineRow[]): TerminalTimelineRow[] {
  const rowsById = new Map<string, TerminalTimelineRow>();
  for (const row of rows) {
    rowsById.set(row.id, row);
  }
  return [...rowsById.values()].sort(
    (a, b) => a.sequence - b.sequence || a.timestamp - b.timestamp,
  );
}
