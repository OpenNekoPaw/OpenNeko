import {
  parseCharacterAvatarSurfaceProjection,
  parseCharacterRun,
  parseRoomRun,
  parseCharacterRunPresentationConfiguration,
  parseCharacterTtsConfiguration,
  parseCharacterTurnPresentationReceipt,
  parseCharacterVersion,
  parseCharacterVoiceTimingProjection,
  type CharacterAvatarSurfaceProjection,
  type CharacterRepresentationKind,
  type CharacterRepresentationRef,
  type CharacterRun,
  type CharacterRunPresentationConfiguration,
  type CharacterTtsConfiguration,
  type CharacterTurnPresentationReceipt,
  type CharacterVersion,
  type CharacterVoiceTimingProjection,
  type RoomRun,
} from '@neko/chara/contracts';

const MAX_PRESENTATION_BATCH_SIZE = 16;

export interface CharacterPresentationRepository {
  readCharacterRun(characterRunId: string, signal?: AbortSignal): Promise<CharacterRun | undefined>;
  readPublication(
    characterVersionId: string,
    signal?: AbortSignal,
  ): Promise<CharacterVersion | undefined>;
  readPresentationConfiguration(
    characterRunId: string,
    signal?: AbortSignal,
  ): Promise<CharacterRunPresentationConfiguration | undefined>;
  storePresentationConfigurations(
    configurations: readonly CharacterRunPresentationConfiguration[],
    signal?: AbortSignal,
  ): Promise<void>;
  freezePresentationTurn(
    input: {
      readonly turnId: string;
      readonly configuration: CharacterRunPresentationConfiguration;
      readonly startedAt: string;
    },
    signal?: AbortSignal,
  ): Promise<CharacterTurnPresentationReceipt>;
  readPresentationTurnReceipt(
    turnId: string,
    signal?: AbortSignal,
  ): Promise<CharacterTurnPresentationReceipt | undefined>;
}

export interface CharacterTtsProviderPort {
  readonly providerRef: string;
  synthesize(
    input: {
      readonly receipt: CharacterTurnPresentationReceipt;
      readonly content: string;
    },
    signal?: AbortSignal,
  ): Promise<CharacterVoiceTimingProjection>;
}

export interface CharacterAvatarRendererPort {
  readonly kind: CharacterRepresentationKind;
  readonly rendererId: string;
  openSurface(
    projection: CharacterAvatarSurfaceProjection,
    signal?: AbortSignal,
  ): Promise<{ readonly dispose: () => void | Promise<void> }>;
}

export interface CharacterAvatarAuthorityRepository {
  readCharacterRun(characterRunId: string, signal?: AbortSignal): Promise<CharacterRun | undefined>;
  readPublication(
    characterVersionId: string,
    signal?: AbortSignal,
  ): Promise<CharacterVersion | undefined>;
  readRoomRun(roomRunId: string, signal?: AbortSignal): Promise<RoomRun | undefined>;
}

export type CharacterPresentationDiagnosticCode =
  | 'character-presentation-run-unavailable'
  | 'character-presentation-participant-mismatch'
  | 'character-presentation-voice-default-unavailable'
  | 'character-presentation-voice-unavailable'
  | 'character-presentation-batch-invalid'
  | 'character-presentation-config-unavailable'
  | 'character-presentation-turn-unavailable'
  | 'character-tts-provider-unavailable'
  | 'character-avatar-renderer-unavailable'
  | 'character-avatar-renderer-mismatch'
  | 'character-avatar-representation-unavailable'
  | 'character-avatar-room-membership-mismatch';

export class CharacterPresentationError extends Error {
  constructor(
    readonly code: CharacterPresentationDiagnosticCode,
    message: string,
    readonly characterRunId?: string,
  ) {
    super(message);
    this.name = 'CharacterPresentationError';
  }
}

export class CharacterPresentationService {
  private readonly now: () => string;
  private readonly ttsProviders: ReadonlyMap<string, CharacterTtsProviderPort>;

  constructor(
    private readonly repository: CharacterPresentationRepository,
    options: {
      readonly ttsProviders?: readonly CharacterTtsProviderPort[];
      readonly now?: () => string;
    } = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.ttsProviders = exactRegistry(
      options.ttsProviders ?? [],
      (provider) => provider.providerRef,
      'Character TTS provider',
    );
  }

  async initializeConfiguration(
    input: {
      readonly characterRunId: string;
      readonly participantId: string;
      readonly tts?: CharacterTtsConfiguration;
    },
    signal?: AbortSignal,
  ): Promise<CharacterRunPresentationConfiguration> {
    const { run, publication } = await this.requireRunAuthority(
      input.characterRunId,
      input.participantId,
      signal,
    );
    const tts = input.tts ?? ttsFromVersionDefaults(publication, run.characterRunId);
    const configuration = parseCharacterRunPresentationConfiguration({
      characterRunId: run.characterRunId,
      participantId: run.participantId,
      tts: parseCharacterTtsConfiguration(tts),
      updatedAt: this.now(),
    });
    assertVoiceAuthority(publication, configuration.tts, run.characterRunId);
    await this.repository.storePresentationConfigurations([configuration], signal);
    return structuredClone(configuration);
  }

  async updateConfigurations(
    configurations: readonly CharacterRunPresentationConfiguration[],
    signal?: AbortSignal,
  ): Promise<readonly CharacterRunPresentationConfiguration[]> {
    if (
      configurations.length === 0 ||
      configurations.length > MAX_PRESENTATION_BATCH_SIZE ||
      new Set(configurations.map((item) => item.characterRunId)).size !== configurations.length
    ) {
      throw presentationError(
        'character-presentation-batch-invalid',
        `Presentation updates require 1-${MAX_PRESENTATION_BATCH_SIZE} distinct CharacterRuns.`,
      );
    }
    const validated: CharacterRunPresentationConfiguration[] = [];
    for (const proposed of configurations) {
      const parsed = parseCharacterRunPresentationConfiguration({
        ...proposed,
        updatedAt: this.now(),
      });
      const { publication } = await this.requireRunAuthority(
        parsed.characterRunId,
        parsed.participantId,
        signal,
      );
      assertVoiceAuthority(publication, parsed.tts, parsed.characterRunId);
      validated.push(parsed);
    }
    await this.repository.storePresentationConfigurations(validated, signal);
    return structuredClone(validated);
  }

  async startTurn(
    input: { readonly turnId: string; readonly characterRunId: string },
    signal?: AbortSignal,
  ): Promise<CharacterTurnPresentationReceipt> {
    const configuration = await this.prepareNextTurn(input.characterRunId, signal);
    if (!configuration) {
      throw presentationError(
        'character-presentation-config-unavailable',
        `CharacterRun '${input.characterRunId}' has no presentation configuration.`,
        input.characterRunId,
      );
    }
    return this.freezePreparedTurn({ turnId: input.turnId, configuration }, signal);
  }

  async prepareNextTurn(
    characterRunId: string,
    signal?: AbortSignal,
  ): Promise<CharacterRunPresentationConfiguration | undefined> {
    const configuration = await this.repository.readPresentationConfiguration(
      characterRunId,
      signal,
    );
    return configuration === undefined
      ? undefined
      : deepFreeze(parseCharacterRunPresentationConfiguration(configuration));
  }

  async freezePreparedTurn(
    input: {
      readonly turnId: string;
      readonly configuration: CharacterRunPresentationConfiguration;
    },
    signal?: AbortSignal,
  ): Promise<CharacterTurnPresentationReceipt> {
    const configuration = parseCharacterRunPresentationConfiguration(input.configuration);
    const receipt = await this.repository.freezePresentationTurn(
      { turnId: input.turnId, configuration, startedAt: this.now() },
      signal,
    );
    return deepFreeze(parseCharacterTurnPresentationReceipt(receipt));
  }

  async synthesizeTurn(
    input: { readonly turnId: string; readonly content: string },
    signal?: AbortSignal,
  ): Promise<CharacterVoiceTimingProjection> {
    const storedReceipt = await this.repository.readPresentationTurnReceipt(input.turnId, signal);
    if (!storedReceipt) {
      throw presentationError(
        'character-presentation-turn-unavailable',
        `Presentation receipt for turn '${input.turnId}' is unavailable.`,
      );
    }
    const receipt = parseCharacterTurnPresentationReceipt(storedReceipt);
    const provider = this.ttsProviders.get(receipt.tts.providerRef);
    if (!provider) {
      throw presentationError(
        'character-tts-provider-unavailable',
        `TTS provider '${receipt.tts.providerRef}' is unavailable for turn '${input.turnId}'.`,
        receipt.characterRunId,
      );
    }
    const timing = parseCharacterVoiceTimingProjection(
      await provider.synthesize({ receipt, content: input.content }, signal),
    );
    if (timing.turnId !== receipt.turnId) {
      throw presentationError(
        'character-presentation-turn-unavailable',
        'TTS timing does not bind the exact frozen turn.',
        receipt.characterRunId,
      );
    }
    return deepFreeze(timing);
  }

  private async requireRunAuthority(
    characterRunId: string,
    participantId: string,
    signal?: AbortSignal,
  ): Promise<{ readonly run: CharacterRun; readonly publication: CharacterVersion }> {
    const storedRun = await this.repository.readCharacterRun(characterRunId, signal);
    const run = storedRun ? parseCharacterRun(storedRun) : undefined;
    if (!run) {
      throw presentationError(
        'character-presentation-run-unavailable',
        `CharacterRun '${characterRunId}' is unavailable.`,
        characterRunId,
      );
    }
    if (run.participantId !== participantId) {
      throw presentationError(
        'character-presentation-participant-mismatch',
        `Participant '${participantId}' does not own CharacterRun '${characterRunId}'.`,
        characterRunId,
      );
    }
    const storedPublication = await this.repository.readPublication(run.characterVersionId, signal);
    if (!storedPublication) {
      throw presentationError(
        'character-presentation-run-unavailable',
        `CharacterVersion '${run.characterVersionId}' is unavailable.`,
        characterRunId,
      );
    }
    return { run, publication: parseCharacterVersion(storedPublication) };
  }
}

export class CharacterAvatarSurfaceService {
  private readonly renderers: ReadonlyMap<CharacterRepresentationKind, CharacterAvatarRendererPort>;

  constructor(renderers: readonly CharacterAvatarRendererPort[]) {
    this.renderers = exactRegistry(renderers, (renderer) => renderer.kind, 'Avatar renderer kind');
  }

  createProjection(input: {
    readonly characterRunId: string;
    readonly participantId: string;
    readonly representation: CharacterRepresentationRef;
    readonly voiceTiming?: CharacterVoiceTimingProjection;
  }): CharacterAvatarSurfaceProjection {
    const renderer = this.renderers.get(input.representation.kind);
    if (!renderer) {
      throw presentationError(
        'character-avatar-renderer-unavailable',
        `No renderer is registered for '${input.representation.kind}'.`,
        input.characterRunId,
      );
    }
    return parseCharacterAvatarSurfaceProjection({
      ...input,
      rendererId: renderer.rendererId,
    });
  }

  async openSurface(
    projection: CharacterAvatarSurfaceProjection,
    signal?: AbortSignal,
  ): Promise<{ readonly dispose: () => Promise<void> }> {
    const parsed = parseCharacterAvatarSurfaceProjection(projection);
    const renderer = this.renderers.get(parsed.representation.kind);
    if (!renderer) {
      throw presentationError(
        'character-avatar-renderer-unavailable',
        `No renderer is registered for '${parsed.representation.kind}'.`,
        parsed.characterRunId,
      );
    }
    if (renderer.rendererId !== parsed.rendererId) {
      throw presentationError(
        'character-avatar-renderer-mismatch',
        `Avatar projection requires renderer '${parsed.rendererId}', not '${renderer.rendererId}'.`,
        parsed.characterRunId,
      );
    }
    const handle = await renderer.openSurface(parsed, signal);
    let disposed = false;
    return {
      dispose: async () => {
        if (disposed) return;
        disposed = true;
        await handle.dispose();
      },
    };
  }
}

export class CharacterAvatarAuthorityService {
  constructor(private readonly repository: CharacterAvatarAuthorityRepository) {}

  async resolveSelectedRepresentation(
    input: { readonly characterRunId: string; readonly representationId: string },
    signal?: AbortSignal,
  ): Promise<{
    readonly run: CharacterRun;
    readonly publication: CharacterVersion;
    readonly representation: CharacterRepresentationRef;
  }> {
    const storedRun = await this.repository.readCharacterRun(input.characterRunId, signal);
    if (!storedRun) {
      throw presentationError(
        'character-presentation-run-unavailable',
        `CharacterRun '${input.characterRunId}' is unavailable.`,
        input.characterRunId,
      );
    }
    const run = parseCharacterRun(storedRun);
    const storedPublication = await this.repository.readPublication(run.characterVersionId, signal);
    if (!storedPublication) {
      throw presentationError(
        'character-presentation-run-unavailable',
        `CharacterVersion '${run.characterVersionId}' is unavailable.`,
        input.characterRunId,
      );
    }
    const publication = parseCharacterVersion(storedPublication);
    if (
      publication.definition.representationDefaults?.avatarRepresentationId !==
      input.representationId
    ) {
      throw presentationError(
        'character-avatar-representation-unavailable',
        'The request does not match the exact user-selected Avatar representation.',
        input.characterRunId,
      );
    }
    const representation = publication.definition.representationRefs.find(
      (candidate) => candidate.representationId === input.representationId,
    );
    if (!representation) {
      throw presentationError(
        'character-avatar-representation-unavailable',
        `Avatar representation '${input.representationId}' is unavailable.`,
        input.characterRunId,
      );
    }
    return {
      run: structuredClone(run),
      publication: structuredClone(publication),
      representation: structuredClone(representation),
    };
  }

  async assertRoomContainsRun(
    roomRunId: string,
    characterRunId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const storedRoomRun = await this.repository.readRoomRun(roomRunId, signal);
    const roomRun = storedRoomRun ? parseRoomRun(storedRoomRun) : undefined;
    if (
      !roomRun?.participants.some(
        (participant) =>
          participant.controller.kind === 'agent' &&
          participant.controller.characterRunId === characterRunId,
      )
    ) {
      throw presentationError(
        'character-avatar-room-membership-mismatch',
        `RoomRun '${roomRunId}' does not own CharacterRun '${characterRunId}'.`,
        characterRunId,
      );
    }
  }
}

function ttsFromVersionDefaults(
  publication: CharacterVersion,
  characterRunId: string,
): CharacterTtsConfiguration {
  const defaults = publication.definition.voiceDefaults;
  if (!defaults) {
    throw presentationError(
      'character-presentation-voice-default-unavailable',
      `CharacterVersion '${publication.characterVersionId}' has no voice defaults.`,
      characterRunId,
    );
  }
  return defaults;
}

function assertVoiceAuthority(
  publication: CharacterVersion,
  tts: CharacterTtsConfiguration,
  characterRunId: string,
): void {
  const voice = publication.definition.representationRefs.find(
    (representation) => representation.representationId === tts.voiceRepresentationId,
  );
  if (!voice || voice.kind !== 'voice') {
    throw presentationError(
      'character-presentation-voice-unavailable',
      `Voice '${tts.voiceRepresentationId}' is unavailable in the exact CharacterVersion.`,
      characterRunId,
    );
  }
}

function exactRegistry<K, V>(
  values: readonly V[],
  keyOf: (value: V) => K,
  label: string,
): ReadonlyMap<K, V> {
  const registry = new Map<K, V>();
  for (const value of values) {
    const key = keyOf(value);
    if (registry.has(key)) throw new Error(`${label} '${String(key)}' is registered twice.`);
    registry.set(key, value);
  }
  return registry;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function presentationError(
  code: CharacterPresentationDiagnosticCode,
  message: string,
  characterRunId?: string,
): CharacterPresentationError {
  return new CharacterPresentationError(code, message, characterRunId);
}
