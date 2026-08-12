import {
  entryModeAcceptsTargetBinding,
  parseAgentEntryIntentProjection,
  parseAgentEntryTargetBinding,
  type AgentAuthoringBinding,
  type AgentAvailabilityDiagnostic,
  type AgentCharacterDialogueLaunchBinding,
  type AgentEntryIntentProjection,
  type AgentEntryMode,
  type AgentEntryTargetBinding,
  type AgentLaunchConnectionIdentity,
  type AgentWorldExperienceLaunchBinding,
} from '@neko/agent-contracts';

export type AgentEntryTargetValidation<T extends AgentEntryTargetBinding> =
  | { readonly status: 'ready'; readonly binding: T }
  | { readonly status: 'unavailable'; readonly diagnostic: AgentAvailabilityDiagnostic };

export interface AgentAuthoringTargetProvider<
  TKind extends AgentAuthoringBinding['target']['kind'],
> {
  validate(
    connection: AgentLaunchConnectionIdentity,
    binding: AgentAuthoringBinding & {
      readonly target: Extract<AgentAuthoringBinding['target'], { readonly kind: TKind }>;
    },
  ): Promise<AgentEntryTargetValidation<AgentAuthoringBinding>>;
}

export interface AgentCharacterDialogueTargetProvider {
  validate(
    connection: AgentLaunchConnectionIdentity,
    binding: AgentCharacterDialogueLaunchBinding,
  ): Promise<AgentEntryTargetValidation<AgentCharacterDialogueLaunchBinding>>;
}

export interface AgentWorldExperienceTargetProvider {
  validate(
    connection: AgentLaunchConnectionIdentity,
    binding: AgentWorldExperienceLaunchBinding,
  ): Promise<AgentEntryTargetValidation<AgentWorldExperienceLaunchBinding>>;
}

export interface AgentEntryTargetApplicationService {
  configure(input: {
    readonly connection: AgentLaunchConnectionIdentity;
    readonly draftId: string;
    readonly mode: AgentEntryMode;
    readonly binding?: AgentEntryTargetBinding;
  }): Promise<AgentEntryIntentProjection>;
}

export function createAgentEntryTargetApplicationService(input: {
  readonly contentAuthoring: AgentAuthoringTargetProvider<'content-project'>;
  readonly characterAuthoring: AgentAuthoringTargetProvider<'character-project'>;
  readonly worldAuthoring: AgentAuthoringTargetProvider<'world-project'>;
  readonly characterDialogue: AgentCharacterDialogueTargetProvider;
  readonly worldExperience: AgentWorldExperienceTargetProvider;
  readonly createIdentity: () => string;
}): AgentEntryTargetApplicationService {
  return {
    async configure({ binding: bindingValue, connection, draftId, mode }) {
      if (connection.draftId !== draftId) {
        throw new Error('Agent Entry target configuration belongs to another Draft.');
      }
      if (bindingValue === undefined) return { mode, targetReceipt: null };
      const binding = parseAgentEntryTargetBinding(bindingValue);
      if (!entryModeAcceptsTargetBinding(mode, binding)) {
        throw new Error('Agent Entry target does not match the requested mode.');
      }
      const result = await validateTarget(input, connection, binding);
      if (result.status === 'unavailable') {
        throw new Error(
          `[${result.diagnostic.owner}/${result.diagnostic.code}] ${result.diagnostic.message}`,
        );
      }
      if (!sameTargetBinding(binding, result.binding)) {
        throw new Error(`Agent ${mode} target provider resolved a different authority.`);
      }
      return parseAgentEntryIntentProjection({
        mode,
        targetReceipt: {
          targetReceiptId: `entry-target:${connection.connectionId}:${input.createIdentity()}`,
          draftId,
          connectionId: connection.connectionId,
          mode,
          binding: result.binding,
        },
      });
    },
  };
}

async function validateTarget(
  providers: Parameters<typeof createAgentEntryTargetApplicationService>[0],
  connection: AgentLaunchConnectionIdentity,
  binding: AgentEntryTargetBinding,
): Promise<AgentEntryTargetValidation<AgentEntryTargetBinding>> {
  if (binding.kind === 'character-dialogue') {
    return providers.characterDialogue.validate(connection, binding);
  }
  if (binding.kind === 'world-experience') {
    return providers.worldExperience.validate(connection, binding);
  }
  if (binding.target.kind === 'content-project') {
    return providers.contentAuthoring.validate(connection, {
      ...binding,
      target: binding.target,
    });
  }
  if (binding.target.kind === 'character-project') {
    return providers.characterAuthoring.validate(connection, {
      ...binding,
      target: binding.target,
    });
  }
  return providers.worldAuthoring.validate(connection, { ...binding, target: binding.target });
}

function sameTargetBinding(left: AgentEntryTargetBinding, right: AgentEntryTargetBinding): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
