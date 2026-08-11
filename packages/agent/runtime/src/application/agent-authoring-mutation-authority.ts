import {
  parseAgentEntryTargetReceipt,
  type AgentAuthoringBinding,
  type AgentAuthoringTargetRef,
  type AgentEntryTargetReceipt,
} from '@neko/agent-contracts';

export interface AgentAuthoringMutationTargetProvider<
  TKind extends AgentAuthoringTargetRef['kind'],
> {
  validate(
    binding: AgentAuthoringBinding & {
      readonly target: Extract<AgentAuthoringTargetRef, { readonly kind: TKind }>;
    },
    signal?: AbortSignal,
  ): Promise<void>;
}

export interface AgentAuthoringMutationAuthority {
  authorize(input: {
    readonly receipt: AgentEntryTargetReceipt;
    readonly expectedTargetKind: AgentAuthoringTargetRef['kind'];
    readonly signal?: AbortSignal;
  }): Promise<AgentAuthoringBinding>;
}

export function createAgentAuthoringMutationAuthority(options: {
  readonly content: AgentAuthoringMutationTargetProvider<'content-project'>;
  readonly character: AgentAuthoringMutationTargetProvider<'character-project'>;
  readonly world: AgentAuthoringMutationTargetProvider<'world-project'>;
}): AgentAuthoringMutationAuthority {
  return {
    async authorize({ receipt: receiptValue, expectedTargetKind, signal }) {
      signal?.throwIfAborted();
      const receipt = parseAgentEntryTargetReceipt(receiptValue);
      if (receipt.mode !== 'authoring' || receipt.binding.kind !== 'authoring') {
        throw new Error('Agent authoring mutation requires an exact Authoring target receipt.');
      }
      if (receipt.binding.target.kind !== expectedTargetKind) {
        throw new Error(
          `Agent authoring mutation for '${expectedTargetKind}' cannot use '${receipt.binding.target.kind}' authority.`,
        );
      }
      if (receipt.binding.target.kind === 'content-project') {
        await options.content.validate(
          { ...receipt.binding, target: receipt.binding.target },
          signal,
        );
      } else if (receipt.binding.target.kind === 'character-project') {
        await options.character.validate(
          { ...receipt.binding, target: receipt.binding.target },
          signal,
        );
      } else {
        await options.world.validate(
          { ...receipt.binding, target: receipt.binding.target },
          signal,
        );
      }
      return structuredClone(receipt.binding);
    },
  };
}
