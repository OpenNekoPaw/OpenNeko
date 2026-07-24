import type {
  CutAudioSettings,
  CutClipIdentity,
  CutEditState,
  CutProjectProfile,
  CutTrackIdentity,
  OtioMetadata,
} from './types';
import type { OtioDiagnostic } from './diagnostics';

const PROJECT_KEYS = new Set([
  'profile',
  'editRateNumerator',
  'editRateDenominator',
  'width',
  'height',
]);
const LINK_KEYS = new Set(['linkedAudioClipId', 'linkedVideoClipId']);
const AUDIO_KEYS = new Set(['gainDb', 'muted', 'fadeInSeconds', 'fadeOutSeconds']);
const CLIP_CUT_KEYS = new Set(['clipId', 'locked']);
const TRACK_CUT_KEYS = new Set(['trackId', 'locked']);
const OPENNEKO_KEYS = new Set(['cut', 'link', 'audio']);

export function validateOpenNekoMetadata(
  metadata: OtioMetadata,
  path: string,
  kind:
    | 'timeline'
    | 'video-clip'
    | 'audio-clip'
    | 'subtitle-clip'
    | 'gap'
    | 'track'
    | 'media-reference',
): readonly OtioDiagnostic[] {
  const openneko = metadata['openneko'];
  if (openneko === undefined) return [];
  if (!isRecord(openneko)) return [diagnostic(`${path}.openneko`, 'must be an object')];

  const diagnostics: OtioDiagnostic[] = [];
  rejectUnknownKeys(openneko, OPENNEKO_KEYS, `${path}.openneko`, diagnostics);
  const allowedSections = allowedSectionsFor(kind);
  for (const section of OPENNEKO_KEYS) {
    if (openneko[section] !== undefined && !allowedSections.has(section)) {
      diagnostics.push(diagnostic(`${path}.openneko.${section}`, `is not valid for ${kind}`));
    }
  }
  validateSection(
    openneko['cut'],
    kind === 'timeline' ? PROJECT_KEYS : kind === 'track' ? TRACK_CUT_KEYS : CLIP_CUT_KEYS,
    `${path}.openneko.cut`,
    diagnostics,
  );
  validateSection(openneko['link'], LINK_KEYS, `${path}.openneko.link`, diagnostics);
  validateSection(openneko['audio'], AUDIO_KEYS, `${path}.openneko.audio`, diagnostics);
  validateKnownValues(openneko, kind, path, diagnostics);
  return diagnostics;
}

export function readProjectProfile(metadata: OtioMetadata): CutProjectProfile | undefined {
  const cut = readSection(metadata, 'cut');
  if (!cut) return undefined;
  const profile = cut['profile'];
  const editRateNumerator = cut['editRateNumerator'];
  const editRateDenominator = cut['editRateDenominator'];
  const width = cut['width'];
  const height = cut['height'];
  if (
    typeof profile !== 'string' ||
    !isPositiveInteger(editRateNumerator) ||
    !isPositiveInteger(editRateDenominator) ||
    !isPositiveInteger(width) ||
    !isPositiveInteger(height)
  ) {
    return undefined;
  }
  return { profile, editRateNumerator, editRateDenominator, width, height };
}

export function withProjectProfile(
  metadata: OtioMetadata,
  profile: CutProjectProfile,
): OtioMetadata {
  const openneko = isRecord(metadata['openneko']) ? metadata['openneko'] : {};
  const cut = isRecord(openneko['cut']) ? openneko['cut'] : {};
  return {
    ...metadata,
    openneko: {
      ...openneko,
      cut: { ...cut, ...profile },
    },
  };
}

export function readClipIdentity(metadata: OtioMetadata): CutClipIdentity | undefined {
  const cut = readSection(metadata, 'cut');
  const clipId = cut?.['clipId'];
  if (typeof clipId !== 'string' || clipId.length === 0) return undefined;
  const link = readSection(metadata, 'link');
  const linkedAudioClipId = readOptionalString(link?.['linkedAudioClipId']);
  const linkedVideoClipId = readOptionalString(link?.['linkedVideoClipId']);
  return {
    clipId,
    ...(linkedAudioClipId ? { linkedAudioClipId } : {}),
    ...(linkedVideoClipId ? { linkedVideoClipId } : {}),
  };
}

export function readTrackIdentity(metadata: OtioMetadata): CutTrackIdentity | undefined {
  const cut = readSection(metadata, 'cut');
  const trackId = cut?.['trackId'];
  return typeof trackId === 'string' && trackId.length > 0 ? { trackId } : undefined;
}

export function readEditState(metadata: OtioMetadata): CutEditState {
  const cut = readSection(metadata, 'cut');
  return { locked: cut?.['locked'] === true };
}

export function readAudioSettings(metadata: OtioMetadata): CutAudioSettings | undefined {
  const audio = readSection(metadata, 'audio');
  if (!audio || typeof audio['muted'] !== 'boolean') return undefined;
  return {
    muted: audio['muted'],
    ...(typeof audio['gainDb'] === 'number' ? { gainDb: audio['gainDb'] } : {}),
    ...(typeof audio['fadeInSeconds'] === 'number'
      ? { fadeInSeconds: audio['fadeInSeconds'] }
      : {}),
    ...(typeof audio['fadeOutSeconds'] === 'number'
      ? { fadeOutSeconds: audio['fadeOutSeconds'] }
      : {}),
  };
}

export function withClipIdentity(metadata: OtioMetadata, identity: CutClipIdentity): OtioMetadata {
  const openneko = isRecord(metadata['openneko']) ? metadata['openneko'] : {};
  const cut = isRecord(openneko['cut']) ? openneko['cut'] : {};
  return {
    ...metadata,
    openneko: {
      ...openneko,
      cut: { ...cut, clipId: identity.clipId },
      ...(identity.linkedAudioClipId || identity.linkedVideoClipId
        ? {
            link: {
              ...(identity.linkedAudioClipId
                ? { linkedAudioClipId: identity.linkedAudioClipId }
                : {}),
              ...(identity.linkedVideoClipId
                ? { linkedVideoClipId: identity.linkedVideoClipId }
                : {}),
            },
          }
        : {}),
    },
  };
}

export function withTrackIdentity(
  metadata: OtioMetadata,
  identity: CutTrackIdentity,
): OtioMetadata {
  const openneko = isRecord(metadata['openneko']) ? metadata['openneko'] : {};
  const cut = isRecord(openneko['cut']) ? openneko['cut'] : {};
  return {
    ...metadata,
    openneko: {
      ...openneko,
      cut: { ...cut, trackId: identity.trackId },
    },
  };
}

export function withEditState(metadata: OtioMetadata, state: CutEditState): OtioMetadata {
  const openneko = isRecord(metadata['openneko']) ? metadata['openneko'] : {};
  const cut = isRecord(openneko['cut']) ? openneko['cut'] : {};
  const { locked: _locked, ...unlockedCut } = cut;
  return {
    ...metadata,
    openneko: {
      ...openneko,
      cut: {
        ...unlockedCut,
        ...(state.locked ? { locked: true } : {}),
      },
    },
  };
}

export function withAudioSettings(
  metadata: OtioMetadata,
  settings: CutAudioSettings,
): OtioMetadata {
  const openneko = isRecord(metadata['openneko']) ? metadata['openneko'] : {};
  return {
    ...metadata,
    openneko: {
      ...openneko,
      audio: { ...settings },
    },
  };
}

function allowedSectionsFor(kind: Parameters<typeof validateOpenNekoMetadata>[2]): Set<string> {
  if (kind === 'timeline') return new Set(['cut']);
  if (kind === 'track') return new Set(['cut', 'audio']);
  if (kind === 'video-clip') return new Set(['cut', 'link', 'audio']);
  if (kind === 'audio-clip') return new Set(['cut', 'link', 'audio']);
  if (kind === 'subtitle-clip') return new Set(['cut']);
  return new Set();
}

function validateSection(
  value: unknown,
  keys: ReadonlySet<string>,
  path: string,
  diagnostics: OtioDiagnostic[],
): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    diagnostics.push(diagnostic(path, 'must be an object'));
    return;
  }
  rejectUnknownKeys(value, keys, path, diagnostics);
}

function validateKnownValues(
  openneko: Record<string, unknown>,
  kind: Parameters<typeof validateOpenNekoMetadata>[2],
  path: string,
  diagnostics: OtioDiagnostic[],
): void {
  const cut = asRecord(openneko['cut']);
  if (cut) {
    if (kind === 'timeline') {
      requireNonEmptyString(cut['profile'], `${path}.openneko.cut.profile`, diagnostics);
      requirePositiveInteger(
        cut['editRateNumerator'],
        `${path}.openneko.cut.editRateNumerator`,
        diagnostics,
      );
      requirePositiveInteger(
        cut['editRateDenominator'],
        `${path}.openneko.cut.editRateDenominator`,
        diagnostics,
      );
      requirePositiveInteger(cut['width'], `${path}.openneko.cut.width`, diagnostics);
      requirePositiveInteger(cut['height'], `${path}.openneko.cut.height`, diagnostics);
    } else if (kind === 'track') {
      requireNonEmptyString(cut['trackId'], `${path}.openneko.cut.trackId`, diagnostics);
    } else if (kind === 'video-clip' || kind === 'audio-clip' || kind === 'subtitle-clip') {
      requireNonEmptyString(cut['clipId'], `${path}.openneko.cut.clipId`, diagnostics);
    }
    if (kind !== 'timeline' && cut['locked'] !== undefined && typeof cut['locked'] !== 'boolean') {
      diagnostics.push(diagnostic(`${path}.openneko.cut.locked`, 'must be a boolean'));
    }
  }

  const link = asRecord(openneko['link']);
  if (link) {
    if (kind === 'video-clip') {
      requireNonEmptyString(
        link['linkedAudioClipId'],
        `${path}.openneko.link.linkedAudioClipId`,
        diagnostics,
      );
      rejectPresent(
        link['linkedVideoClipId'],
        `${path}.openneko.link.linkedVideoClipId`,
        'Video Clips cannot link to linkedVideoClipId.',
        diagnostics,
      );
    } else if (kind === 'audio-clip') {
      requireNonEmptyString(
        link['linkedVideoClipId'],
        `${path}.openneko.link.linkedVideoClipId`,
        diagnostics,
      );
      rejectPresent(
        link['linkedAudioClipId'],
        `${path}.openneko.link.linkedAudioClipId`,
        'Audio Clips cannot link to linkedAudioClipId.',
        diagnostics,
      );
    }
  }

  const audio = asRecord(openneko['audio']);
  if (audio) {
    if (typeof audio['muted'] !== 'boolean') {
      diagnostics.push(diagnostic(`${path}.openneko.audio.muted`, 'must be a boolean'));
    }
    validateFiniteNumber(audio['gainDb'], `${path}.openneko.audio.gainDb`, false, diagnostics);
    validateFiniteNumber(
      audio['fadeInSeconds'],
      `${path}.openneko.audio.fadeInSeconds`,
      true,
      diagnostics,
    );
    validateFiniteNumber(
      audio['fadeOutSeconds'],
      `${path}.openneko.audio.fadeOutSeconds`,
      true,
      diagnostics,
    );
  }
}

function requireNonEmptyString(value: unknown, path: string, diagnostics: OtioDiagnostic[]): void {
  if (typeof value !== 'string' || value.length === 0) {
    diagnostics.push(diagnostic(path, 'must be a non-empty string'));
  }
}

function requirePositiveInteger(value: unknown, path: string, diagnostics: OtioDiagnostic[]): void {
  if (!isPositiveInteger(value)) diagnostics.push(diagnostic(path, 'must be a positive integer'));
}

function validateFiniteNumber(
  value: unknown,
  path: string,
  nonNegative: boolean,
  diagnostics: OtioDiagnostic[],
): void {
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || (nonNegative && value < 0)) {
    diagnostics.push(
      diagnostic(
        path,
        nonNegative ? 'must be a non-negative finite number' : 'must be a finite number',
      ),
    );
  }
}

function rejectPresent(
  value: unknown,
  path: string,
  message: string,
  diagnostics: OtioDiagnostic[],
): void {
  if (value !== undefined) diagnostics.push(diagnostic(path, message));
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  diagnostics: OtioDiagnostic[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) diagnostics.push(diagnostic(`${path}.${key}`, 'is not supported'));
  }
}

function readSection(metadata: OtioMetadata, section: string): Record<string, unknown> | undefined {
  const openneko = metadata['openneko'];
  if (!isRecord(openneko)) return undefined;
  const value = openneko[section];
  return isRecord(value) ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function diagnostic(path: string, detail: string): OtioDiagnostic {
  return {
    code: 'unsupported-openneko-metadata',
    path,
    message: `OpenNeko metadata ${detail}.`,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
