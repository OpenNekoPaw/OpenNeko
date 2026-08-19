import type {
  AgentBoundDomainBinding,
  AgentCharacterDialogueLaunchBinding,
  AgentWorldExperienceLaunchBinding,
} from '@neko/agent-contracts';
import type { AgentEntryRuntimeMaterializationPort } from '@neko/agent-runtime/application';
import type {
  CharacterConversationLaunchResult,
  CharacterConversationLaunchSelection,
  GlobalCharacterCatalog,
  CharacterVersion,
} from '@neko/chara/contracts';

interface DesktopCharacterConversationLaunchPort {
  validateSelection(selection: CharacterConversationLaunchSelection): Promise<void>;
  launch(input: {
    readonly requestId: string;
    readonly userId: string;
    readonly userDisplayName: string;
    readonly selection: CharacterConversationLaunchSelection;
  }): Promise<CharacterConversationLaunchResult>;
}

interface DesktopCharacterPublicationReader {
  readPublication(characterVersionId: string): Promise<CharacterVersion | undefined>;
  readCatalog(): Promise<GlobalCharacterCatalog>;
}

interface DesktopCharacterInteractionPort {
  validateDialogueBinding(input: {
    readonly characterProjectId: string;
    readonly characterVersionId: string;
    readonly characterRunId: string;
    readonly dialogueRunId: string;
  }): Promise<void>;
}

interface DesktopCharacterRoomPort {
  readRun(roomRunId: string): Promise<{ readonly characterRoomId: string }>;
}

interface DesktopWorldRuntimePort {
  createRun(input: {
    readonly worldVersionId: string;
    readonly worldRunId: string;
    readonly worldSaveId: string;
    readonly branchId: string;
    readonly saveLabel: string;
  }): Promise<void>;
  validateBinding(input: {
    readonly worldVersionId: string;
    readonly worldRunId: string;
    readonly worldSaveId?: string;
    readonly branchId?: string;
  }): Promise<void>;
  readRuntime(worldRunId: string): Promise<
    | {
        readonly publication: { readonly worldVersionId: string };
        readonly run: {
          readonly worldRunId: string;
          readonly worldVersionId: string;
          readonly worldSaveId: string;
          readonly branchId: string;
        };
        readonly save: { readonly worldSaveId: string };
      }
    | undefined
  >;
}

export interface DesktopAgentRuntimeEntryService extends AgentEntryRuntimeMaterializationPort {
  validateContext(
    context: Extract<AgentBoundDomainBinding, { readonly kind: 'character' | 'room' | 'world' }>,
  ): Promise<void>;
}

export function createDesktopAgentCharacterDialogueTargetValidator(options: {
  readonly conversations: Pick<DesktopCharacterConversationLaunchPort, 'validateSelection'>;
  readonly publications: DesktopCharacterPublicationReader;
}) {
  return async (binding: AgentCharacterDialogueLaunchBinding): Promise<void> => {
    const selection = projectCharacterSelection(binding);
    await options.conversations.validateSelection(selection);
    const catalog = await options.publications.readCatalog();
    for (const participant of binding.participants) {
      const character = catalog.characters.find(
        (candidate) => candidate.globalCharacterId === participant.globalCharacterId,
      );
      if (!character?.characterVersionIds.includes(participant.characterVersionId)) {
        throw new Error(
          `CharacterVersion '${participant.characterVersionId}' does not belong to exact GlobalCharacter '${participant.globalCharacterId}'.`,
        );
      }
    }
  };
}

export function createDesktopAgentRuntimeEntryService(options: {
  readonly characterConversations: DesktopCharacterConversationLaunchPort;
  readonly characterInteractions: DesktopCharacterInteractionPort;
  readonly characterRooms: DesktopCharacterRoomPort;
  readonly characterPublications: DesktopCharacterPublicationReader;
  readonly validateCharacterDialogue: (
    binding: AgentCharacterDialogueLaunchBinding,
  ) => Promise<void>;
  readonly worldRuntime: DesktopWorldRuntimePort;
  readonly validateWorldExperience: (binding: AgentWorldExperienceLaunchBinding) => Promise<void>;
  readonly userId: string;
  readonly userDisplayName: string;
}): DesktopAgentRuntimeEntryService {
  return {
    async validate({ receipt, input, references, resourceGrantIds }) {
      if (input.kind !== 'message') {
        throw new Error('Runtime Entry first submit requires an ordinary message input.');
      }
      if (receipt.binding.kind === 'world-experience') {
        await options.validateWorldExperience(receipt.binding);
        return;
      }
      await options.validateCharacterDialogue(receipt.binding);
      if (
        receipt.binding.mode === 'narrative' &&
        (references.length > 0 || resourceGrantIds.length > 0)
      ) {
        throw new Error('Narrative Character Dialogue forbids external references.');
      }
      if (
        receipt.binding.participants.length > 1 &&
        (references.length > 0 || resourceGrantIds.length > 0)
      ) {
        throw new Error(
          'Character Room references require an exact participant turn and are unavailable.',
        );
      }
    },
    async materialize({ requestId, connection, receipt, input }) {
      if (
        receipt.draftId !== connection.draftId ||
        receipt.connectionId !== connection.connectionId
      ) {
        throw new Error('Agent runtime Entry receipt belongs to another Draft or connection.');
      }
      if (receipt.binding.kind === 'world-experience') {
        await options.validateWorldExperience(receipt.binding);
        return materializeWorldExperience(options, requestId, receipt.binding);
      }
      if (input.kind !== 'message') {
        throw new Error('Character Dialogue first submit requires an ordinary message input.');
      }
      await options.validateCharacterDialogue(receipt.binding);
      const result = await options.characterConversations.launch({
        requestId,
        userId: options.userId,
        userDisplayName: options.userDisplayName,
        selection: projectCharacterSelection(receipt.binding),
      });
      return {
        conversationId:
          result.topology === 'dialogue'
            ? result.primaryAgentSessionId
            : `conversation:room:${result.roomRunId}`,
        context: await projectCharacterContext(
          receipt.binding,
          result,
          options.characterPublications,
        ),
      };
    },
    async validateContext(context) {
      if (context.kind === 'world') {
        if (!context.worldRunId) {
          throw new Error('World Conversation has no exact WorldRun authority.');
        }
        await options.worldRuntime.validateBinding({
          worldVersionId: context.worldExperienceVersionId,
          worldRunId: context.worldRunId,
        });
        return;
      }
      if (context.kind === 'character') {
        if (!context.characterRunId || !context.dialogueRunId) {
          throw new Error('Character Conversation has no exact Run and Dialogue authority.');
        }
        const publication = await requireCharacterPublication(
          context.characterId,
          context.characterVersionId,
          options.characterPublications,
        );
        await options.characterInteractions.validateDialogueBinding({
          characterProjectId: publication.characterProjectId,
          characterVersionId: context.characterVersionId,
          characterRunId: context.characterRunId,
          dialogueRunId: context.dialogueRunId,
        });
        return;
      }
      const run = await options.characterRooms.readRun(context.roomRunId);
      if (run.characterRoomId !== context.roomId) {
        throw new Error('Room Conversation does not match the exact CharacterRoom authority.');
      }
    },
  };
}

async function materializeWorldExperience(
  options: Parameters<typeof createDesktopAgentRuntimeEntryService>[0],
  requestId: string,
  binding: AgentWorldExperienceLaunchBinding,
): Promise<{
  readonly conversationId: string;
  readonly context: Extract<AgentBoundDomainBinding, { readonly kind: 'world' }>;
}> {
  const participantId = `world-participant:${requestId}`;
  const roleScopeId = `world-role:${requestId}`;
  let worldRunId: string;
  if (binding.launch.kind === 'continue') {
    worldRunId = binding.launch.worldRunId;
    await options.worldRuntime.validateBinding({
      worldVersionId: binding.worldVersionId,
      worldRunId,
      worldSaveId: binding.launch.worldSaveId,
      ...(binding.launch.branchId === undefined ? {} : { branchId: binding.launch.branchId }),
    });
  } else {
    worldRunId = `world-run:${requestId}`;
    const worldSaveId = `world-save:${requestId}`;
    const branchId = `world-branch:${requestId}`;
    const existing = await options.worldRuntime.readRuntime(worldRunId);
    if (existing) {
      if (
        existing.publication.worldVersionId !== binding.worldVersionId ||
        existing.run.worldVersionId !== binding.worldVersionId ||
        existing.run.worldSaveId !== worldSaveId ||
        existing.save.worldSaveId !== worldSaveId ||
        existing.run.branchId !== branchId
      ) {
        throw new Error(`WorldRun '${worldRunId}' belongs to another exact launch request.`);
      }
    } else {
      await options.worldRuntime.createRun({
        worldVersionId: binding.worldVersionId,
        worldRunId,
        worldSaveId,
        branchId,
        saveLabel: 'Agent World Experience',
      });
    }
  }
  return {
    conversationId: `conversation:world:${worldRunId}:${participantId}`,
    context: {
      kind: 'world',
      worldExperienceId: binding.globalWorldId,
      worldExperienceVersionId: binding.worldVersionId,
      worldRunId,
      participantId,
      roleScopeId,
      characters: binding.participants.map((participant) => ({
        characterId: participant.globalCharacterId,
        characterVersionId: participant.characterVersionId,
      })),
    },
  };
}

function projectCharacterSelection(
  binding: AgentCharacterDialogueLaunchBinding,
): CharacterConversationLaunchSelection {
  if (
    binding.participants.length > 1 &&
    binding.participants.some((participant) => participant.roleProfileId !== undefined)
  ) {
    throw new Error(
      'Character Room role profile selection is unavailable without participant-level Room authority.',
    );
  }
  if (binding.mode === 'companion') {
    return {
      mode: binding.mode,
      characters: binding.participants.map((participant) => ({
        characterVersionId: participant.characterVersionId,
        ...(participant.roleProfileId === undefined
          ? {}
          : { roleProfileId: participant.roleProfileId }),
      })),
    };
  }
  return {
    mode: binding.mode,
    characters: binding.participants.map((participant) => ({
      characterVersionId: participant.characterVersionId,
      ...(participant.storyline === undefined ? {} : { storyline: participant.storyline }),
      ...(participant.roleProfileId === undefined
        ? {}
        : { roleProfileId: participant.roleProfileId }),
    })),
  };
}

async function projectCharacterContext(
  binding: AgentCharacterDialogueLaunchBinding,
  result: CharacterConversationLaunchResult,
  publications: DesktopCharacterPublicationReader,
): Promise<Extract<AgentBoundDomainBinding, { readonly kind: 'character' | 'room' }>> {
  if (binding.participants.length === 1) {
    const participant = binding.participants[0];
    if (!participant) {
      throw new Error('Character Dialogue target has no exact participant.');
    }
    if (
      result.topology !== 'dialogue' ||
      result.characterVersionId !== participant.characterVersionId
    ) {
      throw new Error('Chara launch result does not match the exact Character Dialogue target.');
    }
    const publication = await requireCharacterPublication(
      participant.globalCharacterId,
      participant.characterVersionId,
      publications,
    );
    if (result.characterProjectId !== publication.characterProjectId) {
      throw new Error('Chara launch result belongs to another CharacterProject source.');
    }
    return {
      kind: 'character',
      characterId: participant.globalCharacterId,
      characterVersionId: result.characterVersionId,
      characterRunId: result.characterRunId,
      dialogueRunId: result.dialogueRunId,
      ...(participant.roleProfileId === undefined
        ? {}
        : { roleProfileId: participant.roleProfileId }),
    };
  }
  if (
    result.topology !== 'chatroom' ||
    result.participants.length !== binding.participants.length ||
    result.participants.some((participant, index) => {
      const expected = binding.participants[index];
      return !expected || participant.characterVersionId !== expected.characterVersionId;
    })
  ) {
    throw new Error('Chara launch result does not match the exact Character Room target.');
  }
  return {
    kind: 'room',
    scope: 'interaction',
    roomId: result.characterRoomId,
    roomRunId: result.roomRunId,
  };
}

async function requireCharacterPublication(
  globalCharacterId: string,
  characterVersionId: string,
  publications: DesktopCharacterPublicationReader,
): Promise<CharacterVersion> {
  const [catalog, publication] = await Promise.all([
    publications.readCatalog(),
    publications.readPublication(characterVersionId),
  ]);
  const character = catalog.characters.find(
    (candidate) => candidate.globalCharacterId === globalCharacterId,
  );
  if (!character?.characterVersionIds.includes(characterVersionId) || !publication) {
    throw new Error(
      `CharacterVersion '${characterVersionId}' does not belong to exact GlobalCharacter '${globalCharacterId}'.`,
    );
  }
  return publication;
}
