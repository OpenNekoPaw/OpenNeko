import type {
  AgentProviderExecutionInput,
  AgentProviderExecutionPort,
  AgentProviderExecutionResult,
} from './agent-conversation-lifecycle-service';

type AgentRoomInteractionExecutionInput = AgentProviderExecutionInput & {
  readonly context: Extract<
    AgentProviderExecutionInput['context'],
    { readonly kind: 'room'; readonly scope: 'interaction' }
  >;
};

export interface AgentRoomInteractionExecutionPort {
  start(input: AgentRoomInteractionExecutionInput): Promise<void>;
}

export function createAgentProviderExecutionRouter(options: {
  readonly standard: AgentProviderExecutionPort;
  readonly roomInteraction: AgentRoomInteractionExecutionPort;
}): AgentProviderExecutionPort {
  return {
    start(input): Promise<AgentProviderExecutionResult | void> {
      if (input.context.kind === 'room' && input.context.scope === 'interaction') {
        return options.roomInteraction.start({ ...input, context: input.context });
      }
      return options.standard.start(input);
    },
  };
}
