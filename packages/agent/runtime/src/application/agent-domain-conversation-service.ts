import type {
  AgentBoundDomainBinding,
  AgentConfigurationPolicyProjection,
  AgentConfigurationRequest,
  AgentConversationConfiguration,
  AgentEntryTargetReceipt,
  AgentTurnCapabilityConstraint,
} from '@neko/agent-contracts';
import type { AgentConversationContextAuthorityPort } from './agent-conversation-lifecycle-repository';
import type {
  AgentConversationLifecycleService,
  AgentProviderExecutionResult,
} from './agent-conversation-lifecycle-service';

export interface AgentDomainConversationConfigurationPort {
  createInitialConfiguration(conversationId: string): Promise<{
    readonly request: AgentConfigurationRequest;
    readonly projection: AgentConfigurationPolicyProjection;
  }>;
}

export interface AgentDomainConversationTurnExecutionPort {
  start(input: {
    readonly conversationId: string;
    readonly message: string;
    readonly context: AgentBoundDomainBinding;
    readonly configuration: AgentConversationConfiguration;
    readonly entryTargetReceipt: AgentEntryTargetReceipt | null;
    readonly capabilityConstraint: AgentTurnCapabilityConstraint;
  }): Promise<AgentProviderExecutionResult>;
}

export interface AgentDomainConversationService {
  reserve(input: {
    readonly conversationId: string;
    readonly context: AgentBoundDomainBinding;
  }): Promise<void>;
  releaseReservation(conversationId: string): Promise<void>;
  submitTurn(input: {
    readonly requestId: string;
    readonly conversationId: string;
    readonly message: string;
  }): Promise<AgentProviderExecutionResult>;
}

export function createAgentDomainConversationService(options: {
  readonly contexts: AgentConversationContextAuthorityPort;
  readonly lifecycle: Pick<
    AgentConversationLifecycleService,
    | 'firstSubmit'
    | 'executeProviderTurn'
    | 'readFirstSubmitRecord'
    | 'readConversationConfiguration'
    | 'readConversationEntryTargetReceipt'
    | 'readConversationCapabilityConstraint'
  >;
  readonly configuration: AgentDomainConversationConfigurationPort;
  readonly turns: AgentDomainConversationTurnExecutionPort;
}): AgentDomainConversationService {
  return {
    async reserve(input) {
      const conversationId = requireIdentity(input.conversationId, 'Agent Conversation');
      if (await options.lifecycle.readFirstSubmitRecord(conversationId)) {
        throw new Error(`Agent Conversation '${conversationId}' is already committed.`);
      }
      if (await options.contexts.readContext(conversationId)) {
        throw new Error(`Agent Conversation '${conversationId}' is already reserved.`);
      }
      await options.contexts.bindContext(conversationId, input.context);
    },

    async releaseReservation(conversationIdValue) {
      const conversationId = requireIdentity(conversationIdValue, 'Agent Conversation');
      if (await options.lifecycle.readFirstSubmitRecord(conversationId)) {
        throw new Error(
          `Committed Agent Conversation '${conversationId}' cannot be released as a reservation.`,
        );
      }
      await options.contexts.releaseContext(conversationId);
    },

    async submitTurn(input) {
      const requestId = requireIdentity(input.requestId, 'Agent domain Turn request');
      const conversationId = requireIdentity(input.conversationId, 'Agent Conversation');
      const message = requireMessage(input.message);
      const existing = await options.lifecycle.readFirstSubmitRecord(conversationId);
      if (!existing) {
        const context = await options.contexts.readContext(conversationId);
        if (!context) {
          throw new Error(`Agent Conversation '${conversationId}' has no reserved domain owner.`);
        }
        if (context.kind === 'authoring') {
          throw new Error(
            `Agent Conversation '${conversationId}' uses a DSH authoring context and is not handled by the retired domain conversation service.`,
          );
        }
        const configuration =
          await options.configuration.createInitialConfiguration(conversationId);
        await options.lifecycle.firstSubmit({
          requestId,
          conversationId,
          context,
          input: { kind: 'message', text: message },
          entryTargetReceipt: null,
          references: [],
          contextReferences: [],
          resourceGrantIds: [],
          configuration,
        });
        return requireAssistantContent(
          conversationId,
          await options.lifecycle.executeProviderTurn(conversationId),
        );
      }
      const [configuration, entryTargetReceipt, capabilityConstraint] = await Promise.all([
        options.lifecycle.readConversationConfiguration(conversationId),
        options.lifecycle.readConversationEntryTargetReceipt(conversationId),
        options.lifecycle.readConversationCapabilityConstraint(conversationId),
      ]);
      return requireAssistantContent(
        conversationId,
        await options.turns.start({
          conversationId,
          message,
          context: existing.context,
          configuration,
          entryTargetReceipt,
          capabilityConstraint,
        }),
      );
    },
  };
}

function requireAssistantContent(
  conversationId: string,
  result: AgentProviderExecutionResult,
): AgentProviderExecutionResult {
  if (result.content.trim().length === 0) {
    throw new Error(
      `Agent Conversation '${conversationId}' Turn '${result.turnId}' completed without assistant content.`,
    );
  }
  return result;
}

function requireIdentity(value: string, label: string): string {
  if (value.trim().length === 0) throw new Error(`${label} identity is required.`);
  return value;
}

function requireMessage(value: string): string {
  if (value.trim().length === 0) throw new Error('Agent domain Turn message is required.');
  return value;
}
