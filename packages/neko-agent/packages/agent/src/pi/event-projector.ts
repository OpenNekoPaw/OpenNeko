import type { AgentEvent, AgentMessage } from '@earendil-works/pi-agent-core';
import type { AssistantMessage, Usage } from '@earendil-works/pi-ai';

import type { PiToolRunIdentity } from './capability-tool-bridge';
import type { PiTurnDurabilityState } from './node-conversation-authority';

export interface PiProductEventBase {
  readonly identity: PiToolRunIdentity;
  readonly timestamp: number;
}

export type PiProductEventPayload =
  | { readonly type: 'turn.started' }
  | {
      readonly type: 'assistant.text.delta';
      readonly delta: string;
    }
  | {
      readonly type: 'assistant.thinking.delta';
      readonly delta: string;
    }
  | {
      readonly type: 'assistant.message.completed';
      readonly message: AssistantMessage;
    }
  | {
      readonly type: 'tool.started';
      readonly toolCallId: string;
      readonly toolName: string;
      readonly args: unknown;
    }
  | {
      readonly type: 'tool.updated';
      readonly toolCallId: string;
      readonly toolName: string;
      readonly update: unknown;
    }
  | {
      readonly type: 'tool.completed';
      readonly toolCallId: string;
      readonly toolName: string;
      readonly result: unknown;
      readonly isError: boolean;
    }
  | {
      readonly type: 'usage';
      readonly usage: Usage;
      readonly provider: string;
      readonly model: string;
    }
  | {
      readonly type: 'confirmation.required';
      readonly confirmationId: string;
      readonly toolCallId: string;
      readonly toolName: string;
      readonly summary: string;
    }
  | {
      readonly type: 'task.observed';
      readonly taskRef: string;
      readonly observation: unknown;
    }
  | {
      readonly type: 'turn.persistence';
      readonly state: PiTurnDurabilityState;
      readonly diagnostic?: string;
    }
  | {
      readonly type: 'turn.completed';
    }
  | {
      readonly type: 'turn.cancelled';
      readonly reason?: string;
    }
  | {
      readonly type: 'turn.failed';
      readonly error: string;
    };

export type PiProductAgentEvent = PiProductEventBase & PiProductEventPayload;

export interface PiProductEventSink {
  emit(event: PiProductAgentEvent): void | Promise<void>;
}

export class PiEventProjector {
  private terminal = false;

  constructor(
    private readonly identity: PiToolRunIdentity,
    private readonly sink: PiProductEventSink,
    private readonly now: () => number = Date.now,
    private readonly resolveToolName: (wireName: string) => string = identityToolName,
  ) {
    validateIdentity(identity);
  }

  async project(event: AgentEvent): Promise<void> {
    if (this.terminal) {
      throw new Error(`Pi event ${event.type} arrived after terminal turn state.`);
    }
    switch (event.type) {
      case 'agent_start':
        await this.emit({ type: 'turn.started' });
        return;
      case 'message_update':
        await this.projectMessageUpdate(event.assistantMessageEvent);
        return;
      case 'message_end':
        if (isAssistantMessage(event.message)) {
          await this.emit({
            type: 'assistant.message.completed',
            message: freezeAssistantMessage(event.message),
          });
          await this.emit({
            type: 'usage',
            usage: structuredClone(event.message.usage),
            provider: event.message.provider,
            model: event.message.model,
          });
        }
        return;
      case 'tool_execution_start':
        await this.emit({
          type: 'tool.started',
          toolCallId: event.toolCallId,
          toolName: this.resolveToolName(event.toolName),
          args: structuredClone(event.args),
        });
        return;
      case 'tool_execution_update':
        await this.emit({
          type: 'tool.updated',
          toolCallId: event.toolCallId,
          toolName: this.resolveToolName(event.toolName),
          update: structuredClone(event.partialResult),
        });
        return;
      case 'tool_execution_end':
        await this.emit({
          type: 'tool.completed',
          toolCallId: event.toolCallId,
          toolName: this.resolveToolName(event.toolName),
          result: projectToolResult(event.result, event.isError),
          isError: event.isError,
        });
        return;
      case 'agent_end':
        await this.projectTerminal(event.messages);
        return;
      case 'turn_start':
      case 'turn_end':
      case 'message_start':
        return;
    }
  }

  async confirmationRequired(input: {
    readonly confirmationId: string;
    readonly toolCallId: string;
    readonly toolName: string;
    readonly summary: string;
  }): Promise<void> {
    await this.emit({ type: 'confirmation.required', ...input });
  }

  async taskObserved(taskRef: string, observation: unknown): Promise<void> {
    if (taskRef.trim().length === 0) throw new Error('Task observation requires a TaskRef.');
    await this.emit({
      type: 'task.observed',
      taskRef,
      observation: structuredClone(observation),
    });
  }

  async persistenceChanged(state: PiTurnDurabilityState, diagnostic?: string): Promise<void> {
    await this.emit({
      type: 'turn.persistence',
      state,
      ...(diagnostic === undefined ? {} : { diagnostic }),
    });
  }

  private async projectMessageUpdate(
    event: Extract<AgentEvent, { type: 'message_update' }>['assistantMessageEvent'],
  ): Promise<void> {
    if (event.type === 'text_delta') {
      await this.emit({ type: 'assistant.text.delta', delta: event.delta });
    } else if (event.type === 'thinking_delta') {
      await this.emit({ type: 'assistant.thinking.delta', delta: event.delta });
    }
  }

  private async projectTerminal(messages: AgentMessage[]): Promise<void> {
    const assistant = findLastAssistant(messages);
    this.terminal = true;
    if (assistant?.stopReason === 'aborted') {
      await this.emit({
        type: 'turn.cancelled',
        ...(assistant.errorMessage === undefined ? {} : { reason: assistant.errorMessage }),
      });
      return;
    }
    if (assistant?.stopReason === 'error') {
      await this.emit({
        type: 'turn.failed',
        error: assistant.errorMessage ?? 'Pi Agent turn failed without an error message.',
      });
      return;
    }
    await this.emit({ type: 'turn.completed' });
  }

  private emit(event: PiProductEventPayload): Promise<void> {
    return Promise.resolve(
      this.sink.emit({ ...event, identity: this.identity, timestamp: this.now() }),
    );
  }
}

function isAssistantMessage(message: AgentMessage): message is AssistantMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'role' in message &&
    message.role === 'assistant'
  );
}

function findLastAssistant(messages: readonly AgentMessage[]): AssistantMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message !== undefined && isAssistantMessage(message)) return message;
  }
  return undefined;
}

function freezeAssistantMessage(message: AssistantMessage): AssistantMessage {
  const snapshot = structuredClone(message);
  Object.freeze(snapshot.content);
  Object.freeze(snapshot.usage.cost);
  Object.freeze(snapshot.usage);
  return Object.freeze(snapshot);
}

function validateIdentity(identity: PiToolRunIdentity): void {
  for (const [field, value] of Object.entries(identity)) {
    if (value.trim().length === 0) throw new Error(`Pi event identity ${field} must be non-empty.`);
  }
}

function identityToolName(toolName: string): string {
  return toolName;
}

function projectToolResult(result: unknown, isError: boolean): unknown {
  const snapshot = structuredClone(result);
  if (!isError) return snapshot;

  const resultRecord = asRecord(snapshot);
  const details = asRecord(resultRecord?.['details']);
  if (details?.['success'] === false && typeof details['error'] === 'string') {
    return snapshot;
  }

  const error = readToolErrorText(resultRecord?.['content']);
  const preservedData =
    details && Object.keys(details).length > 0
      ? (details['data'] ?? details)
      : resultRecord === undefined
        ? snapshot
        : undefined;
  return {
    ...(resultRecord ?? {}),
    details: {
      success: false,
      ...(preservedData === undefined ? {} : { data: preservedData }),
      error: error ?? 'Pi tool execution failed without a diagnostic.',
    },
  };
}

function readToolErrorText(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const text = value
    .flatMap((part) => {
      const record = asRecord(part);
      return record?.['type'] === 'text' && typeof record['text'] === 'string'
        ? [record['text'].trim()]
        : [];
    })
    .filter((part) => part.length > 0)
    .join('\n');
  return text.length > 0 ? text : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
