import type { AgentContextPayload } from './agent-context';
import type { AgentFileReference } from './agent-file-reference';
import type { MessageAttachment } from './message-attachment';

export type SessionMode = 'agent';
export type ConversationKind = 'chat' | 'character-dialogue' | 'embody-character';
export type ShellExecutionMode = 'plan' | 'ask' | 'auto';
export type AgentModelSlots = Partial<
  Record<
    string,
    { readonly providerId: string; readonly modelId: string; readonly category: 'llm' }
  >
>;
export interface AgentQueuedMessageItem {
  readonly id: string;
  readonly conversationId: string;
  readonly content: string;
  readonly createdAt: number;
  readonly source: 'composer' | 'subagent-result-continuation' | 'system-continuation' | 'user';
  readonly draft?: {
    readonly contextPayloads?: readonly AgentContextPayload[];
    readonly fileReferences?: readonly AgentFileReference[];
    readonly attachments?: readonly MessageAttachment[];
  };
}
export interface AmbientCanvasNode {
  readonly nodeId: string;
  readonly type: string;
  readonly summary: string;
}
