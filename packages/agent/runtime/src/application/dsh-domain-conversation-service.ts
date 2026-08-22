import type { AgentContextPayload, AgentConversationContext } from '@neko/agent-contracts';

import type {
  DshAcpProjectedEvent,
  DshAcpProjectedMessageEvent,
  DshAcpProjectedTurnEvent,
  DshAcpProjection,
} from '../acp/dsh-acp-projection';
import type { ConversationDshSessionBoundClient } from './conversation-dsh-session-client';
import type { ConversationDshSessionPublication } from './conversation-dsh-session-publication';
import type { ConversationDshSessionArchive } from './conversation-dsh-session-application';
import type { DshConversationTurnContextResolver } from './dsh-conversation-turn-context';
import type { DshTurnCanvasTargetOwner } from './dsh-turn-canvas-target-owner';

export interface DshDomainConversationService {
  publish(input: {
    readonly conversationId: string;
    readonly title: string;
    readonly context: AgentConversationContext;
  }): Promise<void>;
  archivePublishedConversation(conversationId: string): Promise<void>;
  submitTurn(input: {
    readonly requestId: string;
    readonly conversationId: string;
    readonly message: string;
    readonly contextPayloads: readonly AgentContextPayload[];
  }): Promise<{ readonly turnId: string; readonly content: string }>;
}

export function createDshDomainConversationService(options: {
  readonly publication: Pick<ConversationDshSessionPublication, 'publish'>;
  readonly archive: ConversationDshSessionArchive;
  readonly conversations: Pick<
    ConversationDshSessionBoundClient,
    'ensureLoaded' | 'setSessionContext' | 'prompt'
  >;
  readonly turnContext: Pick<DshConversationTurnContextResolver, 'resolve'>;
  readonly turnCanvasTargets: Pick<DshTurnCanvasTargetOwner, 'admit' | 'releaseAdmission'>;
  readonly projection: Pick<DshAcpProjection, 'snapshot'>;
}): DshDomainConversationService {
  return Object.freeze({
    async publish(input: Parameters<DshDomainConversationService['publish']>[0]) {
      const conversationId = requireIdentity(input.conversationId, 'Conversation');
      const result = await options.publication.publish({
        conversationId,
        title: requireIdentity(input.title, 'Conversation title'),
        context: input.context,
      });
      if (result.conversationId !== conversationId) {
        throw new Error(
          `DSH publication returned Conversation '${result.conversationId}' for '${conversationId}'.`,
        );
      }
    },

    archivePublishedConversation(conversationIdValue: string) {
      const conversationId = requireIdentity(conversationIdValue, 'Conversation');
      return options.archive.archiveConversation(conversationId);
    },

    async submitTurn(input: Parameters<DshDomainConversationService['submitTurn']>[0]) {
      requireIdentity(input.requestId, 'Character turn request');
      const conversationId = requireIdentity(input.conversationId, 'Conversation');
      const message = requireMessage(input.message);
      const dshSessionId = await options.conversations.ensureLoaded(conversationId);
      const admission = options.turnCanvasTargets.admit(dshSessionId, undefined);
      let retainAdmission = false;
      const before = options.projection.snapshot(dshSessionId);
      const previousTerminalTurns = new Set(
        before.events.flatMap((event) =>
          event.kind === 'turn' && event.phase === 'end' ? [event.turn] : [],
        ),
      );
      try {
        const context = await options.turnContext.resolve(conversationId, input.contextPayloads);
        await options.conversations.setSessionContext(conversationId, context);
        await options.conversations.prompt({
          conversationId,
          prompt: [{ type: 'text', text: message }],
        });
        retainAdmission = true;
      } finally {
        if (!retainAdmission) {
          options.turnCanvasTargets.releaseAdmission(admission.admissionId);
        }
      }
      const after = options.projection.snapshot(dshSessionId);
      const terminalTurns = after.events.filter(
        (event): event is Extract<DshAcpProjectedTurnEvent, { readonly phase: 'end' }> =>
          isTerminalTurn(event) && !previousTerminalTurns.has(event.turn),
      );
      const terminalTurn = terminalTurns.at(0);
      if (terminalTurns.length !== 1 || terminalTurn === undefined) {
        throw new Error(
          `DSH Conversation '${conversationId}' produced ${terminalTurns.length} new terminal turns for one Character request.`,
        );
      }
      const turn = terminalTurn.turn;
      const finalMessages = after.events.filter(
        (event): event is Extract<DshAcpProjectedMessageEvent, { readonly role: 'assistant' }> =>
          isFinalAssistantMessage(event) && event.turn === turn,
      );
      const finalMessage = finalMessages.at(-1);
      if (finalMessage === undefined || finalMessage.text.length === 0) {
        throw new Error(
          `DSH Conversation '${conversationId}' Turn '${turn}' completed without final assistant content.`,
        );
      }
      return {
        turnId: `${dshSessionId}:turn:${turn}`,
        content: finalMessage.text,
      };
    },
  });
}

function isTerminalTurn(
  event: DshAcpProjectedEvent,
): event is Extract<DshAcpProjectedTurnEvent, { readonly phase: 'end' }> {
  return event.kind === 'turn' && event.phase === 'end';
}

function isFinalAssistantMessage(
  event: DshAcpProjectedEvent,
): event is Extract<DshAcpProjectedMessageEvent, { readonly role: 'assistant' }> {
  return event.kind === 'message' && event.role === 'assistant' && event.state === 'final';
}

function requireIdentity(value: string, label: string): string {
  if (value.trim().length === 0) throw new Error(`${label} identity is required.`);
  return value;
}

function requireMessage(value: string): string {
  if (value.trim().length === 0) throw new Error('Character turn message is required.');
  return value;
}
