import {
  requireArray,
  requireExactRecord,
  requireIdentity,
  requireIsoDate,
  requireNonNegativeInteger,
  requireOneOf,
  requireUniqueIdentities,
} from './codec';
import {
  CHARACTER_REPRESENTATION_KINDS,
  parseCharacterRepresentationRef,
  type CharacterRepresentationKind,
  type CharacterRepresentationRef,
} from './character';

export interface CharacterChatConfiguration {
  readonly providerRef: string;
  readonly modelRef: string;
}

export interface CharacterTtsConfiguration {
  readonly providerRef: string;
  readonly voiceRepresentationId: string;
  readonly speed: number;
  readonly autoRead: boolean;
}

export interface CharacterRunPresentationConfiguration {
  readonly characterRunId: string;
  readonly participantId: string;
  readonly chat: CharacterChatConfiguration;
  readonly tts: CharacterTtsConfiguration;
  readonly updatedAt: string;
}

export interface CharacterTurnPresentationReceipt {
  readonly turnId: string;
  readonly characterRunId: string;
  readonly participantId: string;
  readonly chat: CharacterChatConfiguration;
  readonly tts: CharacterTtsConfiguration;
  readonly startedAt: string;
}

export interface CharacterVoiceViseme {
  readonly offsetMs: number;
  readonly durationMs: number;
  readonly value: string;
}

export interface CharacterVoiceTimingProjection {
  readonly turnId: string;
  readonly audioRef: string;
  readonly visemes: readonly CharacterVoiceViseme[];
}

export interface CharacterAvatarSurfaceProjection {
  readonly characterRunId: string;
  readonly participantId: string;
  readonly representation: CharacterRepresentationRef;
  readonly rendererId: string;
  readonly voiceTiming?: CharacterVoiceTimingProjection;
}

export interface CharacterAvatarRendererAvailability {
  readonly kind: CharacterRepresentationKind;
  readonly rendererId: string;
}

export function parseCharacterRunPresentationConfiguration(
  value: unknown,
): CharacterRunPresentationConfiguration {
  const record = requireExactRecord(
    value,
    ['characterRunId', 'participantId', 'chat', 'tts', 'updatedAt'],
    'CharacterRun presentation configuration',
  );
  return {
    characterRunId: requireIdentity(record['characterRunId'], 'Presentation CharacterRun'),
    participantId: requireIdentity(record['participantId'], 'Presentation participant'),
    chat: parseCharacterChatConfiguration(record['chat']),
    tts: parseCharacterTtsConfiguration(record['tts']),
    updatedAt: requireIsoDate(record['updatedAt'], 'Presentation configuration updatedAt'),
  };
}

export function parseCharacterTurnPresentationReceipt(
  value: unknown,
): CharacterTurnPresentationReceipt {
  const record = requireExactRecord(
    value,
    ['turnId', 'characterRunId', 'participantId', 'chat', 'tts', 'startedAt'],
    'Character turn presentation receipt',
  );
  return {
    turnId: requireIdentity(record['turnId'], 'Presentation receipt turn'),
    characterRunId: requireIdentity(record['characterRunId'], 'Presentation receipt CharacterRun'),
    participantId: requireIdentity(record['participantId'], 'Presentation receipt participant'),
    chat: parseCharacterChatConfiguration(record['chat']),
    tts: parseCharacterTtsConfiguration(record['tts']),
    startedAt: requireIsoDate(record['startedAt'], 'Presentation receipt startedAt'),
  };
}

export function parseCharacterAvatarSurfaceProjection(
  value: unknown,
): CharacterAvatarSurfaceProjection {
  const record = requireExactRecord(
    value,
    ['characterRunId', 'participantId', 'representation', 'rendererId', 'voiceTiming'],
    'Character Avatar Surface projection',
  );
  const voiceTiming =
    record['voiceTiming'] === undefined
      ? undefined
      : parseCharacterVoiceTimingProjection(record['voiceTiming']);
  return {
    characterRunId: requireIdentity(record['characterRunId'], 'Avatar CharacterRun'),
    participantId: requireIdentity(record['participantId'], 'Avatar participant'),
    representation: parseCharacterRepresentationRef(record['representation']),
    rendererId: requireIdentity(record['rendererId'], 'Avatar renderer'),
    ...(voiceTiming === undefined ? {} : { voiceTiming }),
  };
}

export function parseCharacterAvatarRendererAvailability(
  value: unknown,
): CharacterAvatarRendererAvailability {
  const record = requireExactRecord(
    value,
    ['kind', 'rendererId'],
    'Character Avatar renderer availability',
  );
  return {
    kind: requireOneOf(
      record['kind'],
      CHARACTER_REPRESENTATION_KINDS,
      'Character Avatar renderer kind',
    ),
    rendererId: requireIdentity(record['rendererId'], 'Character Avatar renderer identity'),
  };
}

export function parseCharacterAvatarRendererAvailabilities(
  value: unknown,
): readonly CharacterAvatarRendererAvailability[] {
  return requireUniqueIdentities(
    requireArray(
      value,
      parseCharacterAvatarRendererAvailability,
      'Character Avatar renderer availabilities',
    ),
    (availability) => availability.kind,
    'Character Avatar renderer availabilities',
  );
}

export function parseCharacterChatConfiguration(value: unknown): CharacterChatConfiguration {
  const record = requireExactRecord(
    value,
    ['providerRef', 'modelRef'],
    'Character Chat configuration',
  );
  return {
    providerRef: requireOpaqueRef(record['providerRef'], 'Character Chat provider'),
    modelRef: requireOpaqueRef(record['modelRef'], 'Character Chat model'),
  };
}

export function parseCharacterTtsConfiguration(value: unknown): CharacterTtsConfiguration {
  const record = requireExactRecord(
    value,
    ['providerRef', 'voiceRepresentationId', 'speed', 'autoRead'],
    'Character TTS configuration',
  );
  return {
    providerRef: requireOpaqueRef(record['providerRef'], 'Character TTS provider'),
    voiceRepresentationId: requireIdentity(
      record['voiceRepresentationId'],
      'Character TTS voice representation',
    ),
    speed: requireSpeed(record['speed']),
    autoRead: requireBoolean(record['autoRead'], 'Character TTS autoRead'),
  };
}

export function parseCharacterVoiceTimingProjection(
  value: unknown,
): CharacterVoiceTimingProjection {
  const record = requireExactRecord(
    value,
    ['turnId', 'audioRef', 'visemes'],
    'Character Voice timing projection',
  );
  const audioRef = requireOpaqueRef(record['audioRef'], 'Character Voice audio');
  const visemes = requireArray(
    record['visemes'],
    (item) => {
      const viseme = requireExactRecord(
        item,
        ['offsetMs', 'durationMs', 'value'],
        'Character Voice viseme',
      );
      return {
        offsetMs: requireNonNegativeInteger(viseme['offsetMs'], 'Viseme offsetMs'),
        durationMs: requireNonNegativeInteger(viseme['durationMs'], 'Viseme durationMs'),
        value: requireIdentity(viseme['value'], 'Viseme value'),
      };
    },
    'Character Voice visemes',
  );
  let previousOffset = -1;
  for (const viseme of visemes) {
    if (viseme.offsetMs < previousOffset) {
      throw new Error('Character Voice visemes must be ordered by offset.');
    }
    previousOffset = viseme.offsetMs;
  }
  return {
    turnId: requireIdentity(record['turnId'], 'Character Voice turn'),
    audioRef,
    visemes,
  };
}

function requireOpaqueRef(value: unknown, label: string): string {
  const ref = requireIdentity(value, label);
  if (!/^[a-z][a-z0-9+.-]*:[^\s]+$/u.test(ref) || /^file:/u.test(ref)) {
    throw new Error(`${label} must be an opaque non-file reference.`);
  }
  return ref;
}

function requireSpeed(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0.5 || value > 2) {
    throw new Error('Character TTS speed must be between 0.5 and 2.');
  }
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be a boolean.`);
  return value;
}
