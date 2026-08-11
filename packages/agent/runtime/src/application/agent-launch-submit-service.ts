import {
  sameAgentDomainBinding,
  type AgentBoundDomainBinding,
  type AgentDomainBinding,
  type AgentDraftInputIntent,
  type AgentDraftSubmitInput,
  type AgentDraftSubmitProjection,
  type AgentEntryTargetReceipt,
  type AgentLaunchConnectionIdentity,
  type MessageContextReference,
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
  }): readonly MessageContextReference[];
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

type AgentRuntimeEntryTargetReceipt = AgentEntryTargetReceipt & {
  readonly binding: Extract<
    AgentEntryTargetReceipt['binding'],
    { readonly kind: 'character-dialogue' | 'world-experience' }
  >;
};

export interface AgentEntryRuntimeMaterializationPort {
  materialize(input: {
    readonly requestId: string;
    readonly connection: AgentLaunchConnectionIdentity;
    readonly receipt: AgentRuntimeEntryTargetReceipt;
    readonly input: AgentDraftInputIntent;
  }): Promise<{
    readonly conversationId: string;
    readonly context: Extract<
      AgentBoundDomainBinding,
      { readonly kind: 'character' | 'room' | 'world' }
    >;
  }>;
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
  readonly runtimeEntry: AgentEntryRuntimeMaterializationPort;
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
      const contextReferences = options.resources.validate({
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
      const runtimeMaterialization =
        existing === undefined && isRuntimeEntryTargetReceipt(draftInput.entryTargetReceipt)
          ? await options.runtimeEntry.materialize({
              requestId,
              connection,
              receipt: draftInput.entryTargetReceipt,
              input: draftInput.input,
            })
          : undefined;
      const context =
        existing?.context ??
        runtimeMaterialization?.context ??
        (requestedBinding.kind === 'unbound'
          ? await options.entry.materialize()
          : await resolveBinding(options.bindings, requestedBinding));
      if (
        !entryMaterializesRequestedOwner(draftInput.entryTargetReceipt, requestedBinding, context)
      ) {
        throw new Error(
          `Agent first-submit request '${requestId}' is already committed to another domain owner.`,
        );
      }
      const record = await options.lifecycle.firstSubmit({
        requestId,
        ...(runtimeMaterialization === undefined
          ? {}
          : { conversationId: runtimeMaterialization.conversationId }),
        context,
        entryTargetReceipt: draftInput.entryTargetReceipt,
        input: draftInput.input,
        references: draftInput.references,
        contextReferences,
        resourceGrantIds: draftInput.resourceGrantIds,
        ...(draftInput.purposeModels === undefined
          ? {}
          : { purposeModels: draftInput.purposeModels }),
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

function isRuntimeEntryTargetReceipt(
  receipt: AgentEntryTargetReceipt | null,
): receipt is AgentRuntimeEntryTargetReceipt {
  return (
    receipt?.binding.kind === 'character-dialogue' || receipt?.binding.kind === 'world-experience'
  );
}

function entryMaterializesRequestedOwner(
  receipt: AgentEntryTargetReceipt | null,
  requested: AgentDomainBinding,
  committed: AgentBoundDomainBinding,
): boolean {
  if (!isRuntimeEntryTargetReceipt(receipt)) {
    return bindingMaterializesRequestedOwner(requested, committed);
  }
  if (requested.kind !== 'unbound') return false;
  if (receipt.binding.kind === 'character-dialogue') {
    if (receipt.binding.participants.length > 1) return committed.kind === 'room';
    const participant = receipt.binding.participants[0]!;
    return (
      committed.kind === 'character' &&
      committed.characterId === participant.characterProjectId &&
      committed.characterVersionId === participant.characterVersionId &&
      committed.roleProfileId === participant.roleProfileId &&
      committed.characterRunId !== undefined &&
      committed.dialogueRunId !== undefined
    );
  }
  return (
    committed.kind === 'world' &&
    committed.worldExperienceId === receipt.binding.worldExperienceId &&
    committed.worldExperienceVersionId === receipt.binding.worldExperienceVersionId &&
    committed.worldRunId !== undefined &&
    (receipt.binding.launch.kind === 'new'
      ? committed.participantId === receipt.binding.launch.participantId &&
        committed.roleScopeId === receipt.binding.launch.roleScopeId
      : committed.worldRunId === receipt.binding.launch.worldRunId)
  );
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
