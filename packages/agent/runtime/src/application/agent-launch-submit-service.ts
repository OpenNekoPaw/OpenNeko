import {
  sameAgentDomainBinding,
  type AgentBoundDomainBinding,
  type AgentDomainBinding,
  type AgentDraftInputIntent,
  type AgentDraftSubmitInput,
  type AgentDraftSubmitProjection,
  type AgentLaunchConnectionIdentity,
} from '@neko/agent-contracts';
import type { AgentConversationLifecycleService } from './agent-conversation-lifecycle-service';
import type { AgentDomainBindingApplicationService } from './agent-domain-binding-service';
import type { AgentLaunchApplicationService } from './agent-launch-service';

export interface AgentLaunchResourceCommitPort {
  validate(input: {
    readonly connection: AgentLaunchConnectionIdentity;
    readonly conversationId?: string;
    readonly resourceGrantIds: readonly string[];
    readonly references: AgentDraftSubmitInput['references'];
  }): void;
  commit(input: {
    readonly connection: AgentLaunchConnectionIdentity;
    readonly conversationId: string;
    readonly resourceGrantIds: readonly string[];
    readonly references: AgentDraftSubmitInput['references'];
  }): Promise<void>;
}

export interface AgentLaunchSceneHandoffPort {
  validate(input: {
    readonly connection: AgentLaunchConnectionIdentity;
    readonly draftId: string;
    readonly binding: AgentDomainBinding;
    readonly conversationId?: string;
  }): Promise<void>;
  handoff(input: {
    readonly connection: AgentLaunchConnectionIdentity;
    readonly draftId: string;
    readonly conversationId: string;
    readonly context: AgentBoundDomainBinding;
  }): Promise<void>;
}

export interface AgentEntryConversationBindingPort {
  materialize(): Promise<Extract<AgentBoundDomainBinding, { readonly kind: 'assistant' }>>;
}

export interface AgentLaunchCommandPreparationPort {
  validate(intent: Extract<AgentDraftInputIntent, { readonly kind: 'command' }>): void;
}

export interface AgentLaunchDraftSubmissionApplicationService {
  submit(input: {
    readonly requestId: string;
    readonly connection: AgentLaunchConnectionIdentity;
    readonly draftInput: AgentDraftSubmitInput;
  }): Promise<AgentDraftSubmitProjection>;
}

export const AGENT_LAUNCH_BUILTIN_COMMAND_HANDLER_IDS: ReadonlySet<string> = new Set([
  'builtin:new',
]);

export function isAgentLaunchConversationCreationCommand(intent: AgentDraftInputIntent): boolean {
  return (
    intent.kind === 'command' && intent.commandId === 'new' && intent.handlerId === 'builtin:new'
  );
}

export function createAgentLaunchDraftSubmissionApplicationService(options: {
  readonly launch: Pick<AgentLaunchApplicationService, 'validateDraftSubmit'>;
  readonly entry: AgentEntryConversationBindingPort;
  readonly bindings: AgentDomainBindingApplicationService;
  readonly lifecycle: AgentConversationLifecycleService;
  readonly resources: AgentLaunchResourceCommitPort;
  readonly scene: AgentLaunchSceneHandoffPort;
  readonly commands: AgentLaunchCommandPreparationPort;
}): AgentLaunchDraftSubmissionApplicationService {
  return {
    async submit({ requestId, connection, draftInput }) {
      const configurationProjection = options.launch.validateDraftSubmit(connection, draftInput);
      const requestedBinding = draftInput.draft.binding;
      if (draftInput.input.kind === 'command') {
        options.commands.validate(draftInput.input);
      }

      const existing = await options.lifecycle.readFirstSubmitByRequest(requestId);
      options.resources.validate({
        connection,
        ...(existing === undefined ? {} : { conversationId: existing.conversationId }),
        resourceGrantIds: draftInput.resourceGrantIds,
        references: draftInput.references,
      });
      await options.scene.validate({
        connection,
        draftId: draftInput.draft.draftId,
        binding: requestedBinding,
        ...(existing === undefined ? {} : { conversationId: existing.conversationId }),
      });
      const context =
        existing?.context ??
        (requestedBinding.kind === 'unbound'
          ? await options.entry.materialize()
          : await resolveBinding(options.bindings, requestedBinding));
      if (!bindingMaterializesRequestedOwner(requestedBinding, context)) {
        throw new Error(
          `Agent first-submit request '${requestId}' is already committed to another domain owner.`,
        );
      }
      const record = await options.lifecycle.firstSubmit({
        requestId,
        context,
        input: draftInput.input,
        references: draftInput.references,
        resourceGrantIds: draftInput.resourceGrantIds,
        configuration: {
          request: draftInput.configuration,
          projection: configurationProjection,
        },
      });
      await options.resources.commit({
        connection,
        conversationId: record.conversationId,
        resourceGrantIds: record.initialInput.resourceGrantIds,
        references: record.initialInput.references,
      });
      await options.scene.handoff({
        connection,
        draftId: draftInput.draft.draftId,
        conversationId: record.conversationId,
        context: record.context,
      });
      const execution = await options.lifecycle.startProviderExecution(record.conversationId);
      return {
        session: {
          phase: 'session',
          conversationId: execution.conversationId,
          binding: execution.context,
        },
        turnId: execution.pendingTurn.turnId,
        turnStatus: execution.pendingTurn.status,
        ...(execution.pendingTurn.diagnostic === undefined
          ? {}
          : { diagnostic: execution.pendingTurn.diagnostic }),
      };
    },
  };
}

async function resolveBinding(
  service: AgentDomainBindingApplicationService,
  binding: AgentBoundDomainBinding,
): Promise<AgentBoundDomainBinding> {
  const resolution = await service.resolve(binding);
  if (resolution.status === 'unavailable') {
    throw new Error(
      `[${resolution.diagnostic.owner}/${resolution.diagnostic.code}] ${resolution.diagnostic.message}`,
    );
  }
  return resolution.binding;
}

function bindingMaterializesRequestedOwner(
  requested: AgentDomainBinding,
  committed: AgentBoundDomainBinding,
): boolean {
  if (requested.kind === 'unbound') return committed.kind === 'assistant';
  if (requested.kind !== committed.kind) return false;
  if (requested.kind === 'character' && committed.kind === 'character') {
    return (
      requested.characterId === committed.characterId &&
      requested.characterVersionId === committed.characterVersionId &&
      requested.roleProfileId === committed.roleProfileId &&
      (requested.characterRunId === undefined ||
        requested.characterRunId === committed.characterRunId)
    );
  }
  if (requested.kind === 'world' && committed.kind === 'world') {
    return (
      requested.worldExperienceId === committed.worldExperienceId &&
      requested.worldExperienceVersionId === committed.worldExperienceVersionId &&
      requested.participantId === committed.participantId &&
      requested.roleScopeId === committed.roleScopeId &&
      (requested.worldRunId === undefined || requested.worldRunId === committed.worldRunId)
    );
  }
  return sameAgentDomainBinding(requested, committed);
}
