import type {
  AgentState,
  AgentWorkItem,
  AgentWorkItemStore,
  ConversationStreamingState,
  Message,
} from '@neko-agent/types';
import type { ActivationProgressTimeline } from './activation-progress-presenter';

export interface ConversationAmbientNode {
  readonly nodeId: string;
  readonly type: string;
  readonly summary: string;
}

export type ConversationSessionStreamingState = ConversationStreamingState;

export interface ConversationSessionSkillProjection {
  readonly activationProgress: readonly ActivationProgressTimeline[];
}

export interface ConversationSessionContextProjection {
  readonly ambientNodes: readonly ConversationAmbientNode[];
  readonly tokenCount: number;
  readonly isCompressing: boolean;
}

export interface ConversationSessionState {
  readonly conversationId: string;
  readonly messages: readonly Message[];
  readonly streaming: ConversationSessionStreamingState;
  readonly skill: ConversationSessionSkillProjection;
  readonly context: ConversationSessionContextProjection;
  readonly agentState: AgentState | null;
  readonly workItems: readonly AgentWorkItem[];
}

export type ConversationSessionStateMap = ReadonlyMap<string, ConversationSessionState>;

export interface ProjectConversationSessionStateInput {
  readonly conversationId: string;
  readonly messagesByConversation: ReadonlyMap<string, readonly Message[]>;
  readonly streamingByConversation: ReadonlyMap<string, ConversationSessionStreamingState>;
  readonly activationProgressByConversation?: ReadonlyMap<
    string,
    readonly ActivationProgressTimeline[]
  >;
  readonly ambientNodesByConversation?: ReadonlyMap<string, readonly ConversationAmbientNode[]>;
  readonly tokenCountByConversation?: ReadonlyMap<string, number>;
  readonly compressingByConversation?: ReadonlyMap<string, boolean>;
  readonly agentStateByConversation?: ReadonlyMap<string, AgentState>;
  readonly workItemsByConversation?: AgentWorkItemStore;
}

export function projectConversationSessionState(
  input: ProjectConversationSessionStateInput,
): ConversationSessionState {
  const conversationId = input.conversationId;
  return {
    conversationId,
    messages: [...(input.messagesByConversation.get(conversationId) ?? [])],
    streaming: normalizeSessionStreamingState(input.streamingByConversation.get(conversationId)),
    skill: {
      activationProgress: [...(input.activationProgressByConversation?.get(conversationId) ?? [])],
    },
    context: {
      ambientNodes: [...(input.ambientNodesByConversation?.get(conversationId) ?? [])],
      tokenCount: input.tokenCountByConversation?.get(conversationId) ?? 0,
      isCompressing: input.compressingByConversation?.get(conversationId) ?? false,
    },
    agentState: input.agentStateByConversation?.get(conversationId) ?? null,
    workItems: [...(input.workItemsByConversation?.get(conversationId)?.values() ?? [])],
  };
}

function normalizeSessionStreamingState(
  streaming: ConversationSessionStreamingState | undefined,
): ConversationSessionStreamingState {
  if (!streaming) {
    return idleSessionStreamingState();
  }
  return {
    streamingMessageId: streaming.streamingMessageId,
    isThinking: streaming.isThinking,
    queuedMessageCount: streaming.queuedMessageCount ?? 0,
    queuedMessages: streaming.queuedMessages ? [...streaming.queuedMessages] : [],
    ...(streaming.messageQueueVersion !== undefined
      ? { messageQueueVersion: streaming.messageQueueVersion }
      : {}),
  };
}

function idleSessionStreamingState(): ConversationSessionStreamingState {
  return {
    streamingMessageId: null,
    isThinking: false,
    queuedMessageCount: 0,
    queuedMessages: [],
  };
}
