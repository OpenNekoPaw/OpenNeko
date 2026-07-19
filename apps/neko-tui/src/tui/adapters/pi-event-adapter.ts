import type { PiProductAgentEvent, PiProductEventSink } from '@neko/agent/pi';
import type { ToolResultArtifactTransfer, ToolResultAttachment } from '@neko/shared';

import type { TuiConversationStores } from '../runtime/tui-runtime-context';

export interface TuiPiEventAdapter extends PiProductEventSink {
  reset(): void;
  getTerminalToolResults(): readonly {
    readonly name: string;
    readonly success: boolean;
    readonly data?: unknown;
    readonly attachments?: readonly ToolResultAttachment[];
    readonly artifacts?: readonly ToolResultArtifactTransfer[];
  }[];
}

export function createTuiPiEventAdapter(stores: TuiConversationStores): TuiPiEventAdapter {
  let assistantStarted = false;
  let accumulatedText = '';
  let terminalToolResults: {
    readonly name: string;
    readonly success: boolean;
    readonly data?: unknown;
    readonly attachments?: readonly ToolResultAttachment[];
    readonly artifacts?: readonly ToolResultArtifactTransfer[];
  }[] = [];

  const ensureAssistant = (): void => {
    if (assistantStarted) return;
    stores.conversation.getState().startAssistantMessage();
    assistantStarted = true;
  };

  return {
    emit(event: PiProductAgentEvent): void {
      switch (event.type) {
        case 'turn.started':
          stores.agent.getState().setRunning();
          return;
        case 'assistant.text.delta':
          ensureAssistant();
          accumulatedText += event.delta;
          stores.conversation.getState().appendDelta(event.delta);
          return;
        case 'assistant.thinking.delta':
          ensureAssistant();
          stores.conversation.getState().setThinking(event.delta);
          return;
        case 'assistant.message.completed': {
          ensureAssistant();
          const completed = assistantText(event.message.content);
          stores.conversation.getState().completeMessage(completed || accumulatedText);
          accumulatedText = '';
          return;
        }
        case 'tool.started':
          ensureAssistant();
          stores.conversation.getState().addToolCall({
            id: event.toolCallId,
            name: event.toolName,
            arguments: objectArguments(event.args),
          });
          return;
        case 'tool.updated':
          return;
        case 'tool.completed': {
          const details = toolResultDetails(event.result);
          terminalToolResults.push({
            name: event.toolName,
            success: !event.isError,
            data: details.data,
            ...(details.attachments ? { attachments: details.attachments } : {}),
            ...(details.artifacts ? { artifacts: details.artifacts } : {}),
          });
          stores.conversation.getState().updateToolResult({
            toolCallId: event.toolCallId,
            success: !event.isError,
            data: details.data,
            ...(details.error === undefined ? {} : { error: details.error }),
          });
          return;
        }
        case 'usage':
          stores.agent.getState().updateUsage({
            inputTokens: event.usage.input,
            outputTokens: event.usage.output,
            totalTokens: event.usage.totalTokens,
          });
          return;
        case 'confirmation.required':
          stores.agent.getState().setWaitingConfirmation();
          return;
        case 'task.observed':
          return;
        case 'turn.persistence':
          stores.agent.getState().setTurnPersistence({
            turnId: event.identity.turnId,
            state: event.state,
            ...(event.diagnostic === undefined ? {} : { diagnostic: event.diagnostic }),
          });
          return;
        case 'turn.completed':
          stores.agent.getState().setIdle();
          assistantStarted = false;
          accumulatedText = '';
          return;
        case 'turn.cancelled':
          stores.agent.getState().setIdle();
          assistantStarted = false;
          accumulatedText = '';
          return;
        case 'turn.failed': {
          const error = new Error(event.error);
          stores.agent.getState().setError(error);
          stores.conversation.getState().addError(error);
          assistantStarted = false;
          accumulatedText = '';
          return;
        }
      }
    },
    reset(): void {
      assistantStarted = false;
      accumulatedText = '';
      terminalToolResults = [];
    },
    getTerminalToolResults(): readonly {
      readonly name: string;
      readonly success: boolean;
      readonly data?: unknown;
      readonly attachments?: readonly ToolResultAttachment[];
      readonly artifacts?: readonly ToolResultArtifactTransfer[];
    }[] {
      return structuredClone(terminalToolResults);
    },
  };
}

function assistantText(content: readonly unknown[]): string {
  return content
    .flatMap((part) => {
      if (typeof part !== 'object' || part === null) return [];
      if (!('type' in part) || part.type !== 'text') return [];
      if (!('text' in part) || typeof part.text !== 'string') return [];
      return [part.text];
    })
    .join('');
}

function objectArguments(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value));
}

function toolResultDetails(value: unknown): {
  readonly data: unknown;
  readonly error?: string;
  readonly attachments?: readonly ToolResultAttachment[];
  readonly artifacts?: readonly ToolResultArtifactTransfer[];
} {
  if (!isRecord(value) || !('details' in value)) {
    return { data: value, ...readToolResultCollections(value) };
  }
  const details = value.details;
  if (!isRecord(details)) {
    return { data: details, ...readToolResultCollections(details) };
  }
  const data =
    typeof details.success === 'boolean'
      ? details.data
      : 'data' in details
        ? details.data
        : details;
  const error = 'error' in details && typeof details.error === 'string' ? details.error : undefined;
  return {
    data,
    ...(error === undefined ? {} : { error }),
    ...readToolResultCollections(details),
  };
}

function readToolResultCollections(value: unknown): {
  readonly attachments?: readonly ToolResultAttachment[];
  readonly artifacts?: readonly ToolResultArtifactTransfer[];
} {
  if (!isRecord(value)) return {};
  const attachments = value['attachments'];
  const artifacts = value['artifacts'];
  return {
    ...(Array.isArray(attachments)
      ? { attachments: attachments.filter(isToolResultAttachment) }
      : {}),
    ...(Array.isArray(artifacts)
      ? { artifacts: artifacts.filter(isToolResultArtifactTransfer) }
      : {}),
  };
}

function isToolResultAttachment(value: unknown): value is ToolResultAttachment {
  if (!isRecord(value)) return false;
  const type = value['type'];
  return (
    (type === 'image' || type === 'audio' || type === 'video') && typeof value['path'] === 'string'
  );
}

function isToolResultArtifactTransfer(value: unknown): value is ToolResultArtifactTransfer {
  if (!isRecord(value)) return false;
  const type = value['type'];
  return (
    type === 'artifactSnapshot' ||
    type === 'artifactBackfill' ||
    type === 'artifactBlockPage' ||
    type === 'artifactExecutionSummary'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
