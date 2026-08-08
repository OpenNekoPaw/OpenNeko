import {
  sameAgentDomainBinding,
  type AgentAvailabilityDiagnostic,
  type AgentBoundDomainBinding,
  type AgentContextPayload,
} from '@neko/agent-contracts';

type BindingOfKind<Kind extends AgentBoundDomainBinding['kind']> = Extract<
  AgentBoundDomainBinding,
  { readonly kind: Kind }
>;

export type AgentDomainBindingContextResult<
  Kind extends AgentBoundDomainBinding['kind'] = AgentBoundDomainBinding['kind'],
> =
  | {
      readonly status: 'available';
      readonly binding: BindingOfKind<Kind>;
      readonly contextPayloads: readonly AgentContextPayload[];
    }
  | {
      readonly status: 'unavailable';
      readonly diagnostic: AgentAvailabilityDiagnostic;
    };

export interface AgentAssistantBindingContextPort {
  resolve(
    binding: BindingOfKind<'assistant'>,
  ): Promise<AgentDomainBindingContextResult<'assistant'>>;
}

export interface AgentWorkspaceBindingContextPort {
  resolve(
    binding: BindingOfKind<'workspace'>,
  ): Promise<AgentDomainBindingContextResult<'workspace'>>;
}

export interface AgentCharaBindingContextPort {
  resolve(
    binding: BindingOfKind<'character'>,
  ): Promise<AgentDomainBindingContextResult<'character'>>;
}

export interface AgentWorldBindingContextPort {
  resolve(binding: BindingOfKind<'world'>): Promise<AgentDomainBindingContextResult<'world'>>;
}

export interface AgentDomainBindingApplicationService {
  resolve(binding: AgentBoundDomainBinding): Promise<AgentDomainBindingContextResult>;
}

export function createAgentDomainBindingApplicationService(input: {
  readonly assistant: AgentAssistantBindingContextPort;
  readonly workspace: AgentWorkspaceBindingContextPort;
  readonly chara?: AgentCharaBindingContextPort;
  readonly world?: AgentWorldBindingContextPort;
}): AgentDomainBindingApplicationService {
  return {
    async resolve(binding) {
      switch (binding.kind) {
        case 'assistant':
          return validateResolution(binding, await input.assistant.resolve(binding));
        case 'workspace':
          return validateResolution(binding, await input.workspace.resolve(binding));
        case 'character':
          if (!input.chara) return unavailable(binding);
          return validateResolution(binding, await input.chara.resolve(binding));
        case 'world':
          if (!input.world) return unavailable(binding);
          return validateResolution(binding, await input.world.resolve(binding));
      }
    },
  };
}

function validateResolution<Kind extends AgentBoundDomainBinding['kind']>(
  requested: BindingOfKind<Kind>,
  result: AgentDomainBindingContextResult<Kind>,
): AgentDomainBindingContextResult<Kind> {
  if (result.status === 'unavailable') return result;
  if (!bindingMaterializesRequestedOwner(requested, result.binding)) {
    throw new Error(`Agent ${requested.kind} binding provider resolved a different domain owner.`);
  }
  const resolved: AgentBoundDomainBinding = result.binding;
  if (resolved.kind === 'character' && !resolved.characterRunId) {
    throw new Error('Agent Chara binding provider did not materialize a Character Run.');
  }
  if (resolved.kind === 'world' && !resolved.worldRunId) {
    throw new Error('Agent World binding provider did not materialize a World Run.');
  }
  const duplicateContext = result.contextPayloads.find(
    (context, index) =>
      result.contextPayloads.findIndex(
        (candidate) => candidate.type === context.type && candidate.id === context.id,
      ) !== index,
  );
  if (duplicateContext) {
    throw new Error(
      `Agent ${requested.kind} binding context contains duplicate '${duplicateContext.type}:${duplicateContext.id}'.`,
    );
  }
  return result;
}

function bindingMaterializesRequestedOwner(
  requested: AgentBoundDomainBinding,
  resolved: AgentBoundDomainBinding,
): boolean {
  if (requested.kind !== resolved.kind) return false;
  if (requested.kind === 'character' && resolved.kind === 'character') {
    return (
      requested.characterId === resolved.characterId &&
      requested.characterVersionId === resolved.characterVersionId &&
      requested.roleProfileId === resolved.roleProfileId &&
      (requested.characterRunId === undefined ||
        requested.characterRunId === resolved.characterRunId)
    );
  }
  if (requested.kind === 'world' && resolved.kind === 'world') {
    return (
      requested.worldExperienceId === resolved.worldExperienceId &&
      requested.worldExperienceVersionId === resolved.worldExperienceVersionId &&
      requested.participantId === resolved.participantId &&
      requested.roleScopeId === resolved.roleScopeId &&
      (requested.worldRunId === undefined || requested.worldRunId === resolved.worldRunId)
    );
  }
  return sameAgentDomainBinding(requested, resolved);
}

function unavailable(
  binding: BindingOfKind<'character'> | BindingOfKind<'world'>,
): AgentDomainBindingContextResult<'character' | 'world'> {
  const owner =
    binding.kind === 'character'
      ? `character:${binding.characterId}:${binding.characterVersionId}`
      : `world:${binding.worldExperienceId}:${binding.worldExperienceVersionId}`;
  return {
    status: 'unavailable',
    diagnostic: {
      code: `${binding.kind}-binding-provider-unavailable`,
      owner,
      message: `Agent ${binding.kind} binding provider is unavailable for '${owner}'.`,
    },
  };
}
