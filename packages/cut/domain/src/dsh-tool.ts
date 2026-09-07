import { normalizeWorkspaceContentPath } from '@neko/content-domain';

import type { CutCommand } from './commands';
import type { CutProjectSnapshot } from './cut-project-authoring-service';
import type { CutExportTaskSnapshot } from './export-tasks';
import type { CutExportSettings } from './media-ports';
import type { TimelineItemView } from './projection';

export const CUT_DSH_TOOL_NAME = 'openneko_cut' as const;
export const CUT_DSH_TOOL_OPERATIONS = [
  'query',
  'apply',
  'export-submit',
  'export-describe',
  'export-cancel',
] as const;
export const CUT_DSH_MAX_COMMANDS = 32;
export const CUT_DSH_MAX_TRACKS = 16;
export const CUT_DSH_MAX_ITEMS_PER_TRACK = 64;

export type CutDshToolOperation = (typeof CUT_DSH_TOOL_OPERATIONS)[number];

type CutDshCommandType =
  | 'split'
  | 'trim'
  | 'rename-clip'
  | 'set-playback-rate'
  | 'ripple-delete'
  | 'trim-trailing-gaps'
  | 'set-audio'
  | 'set-clip-enabled'
  | 'set-track-muted';

export type CutDshCommand = Extract<CutCommand, { readonly type: CutDshCommandType }>;

export type CutDshToolInput =
  | {
      readonly operation: 'query';
      readonly input: { readonly documentPath: string };
    }
  | {
      readonly operation: 'apply';
      readonly input: {
        readonly documentPath: string;
        readonly commands: readonly CutDshCommand[];
      };
    }
  | {
      readonly operation: 'export-submit';
      readonly input: {
        readonly documentPath: string;
        readonly sessionId: string;
        readonly outputWorkspaceRelativePath: string;
        readonly settings: CutExportSettings;
      };
    }
  | {
      readonly operation: 'export-describe' | 'export-cancel';
      readonly input: { readonly documentPath: string; readonly jobId: string };
    };

export interface CutDshExportFacts {
  readonly jobId: string;
  readonly documentPath: string;
  readonly sessionId: string;
  readonly sourceSnapshotId: string;
  readonly outputWorkspaceRelativePath: string;
  readonly status: CutExportTaskSnapshot['status'];
  readonly startedAt: number;
  readonly finishedAt?: number;
  readonly diagnosticCode?: string;
}

export interface CutDshToolFacts {
  readonly documentPath: string;
  readonly name: string;
  readonly durationSeconds: number;
  readonly trackCount: number;
  readonly tracksTruncated: boolean;
  readonly tracks: readonly CutDshTrackFacts[];
}

export interface CutDshTrackFacts {
  readonly trackId: string;
  readonly name: string;
  readonly kind: 'Video' | 'Audio' | 'Subtitle';
  readonly enabled: boolean;
  readonly locked: boolean;
  readonly audioMuted: boolean;
  readonly itemCount: number;
  readonly itemsTruncated: boolean;
  readonly items: readonly CutDshItemFacts[];
}

export type CutDshItemFacts =
  | {
      readonly kind: 'clip';
      readonly clipId: string;
      readonly name: string;
      readonly startSeconds: number;
      readonly durationSeconds: number;
      readonly playbackRate: number;
      readonly enabled: boolean;
      readonly locked: boolean;
      readonly linkedAudioClipId?: string;
      readonly linkedVideoClipId?: string;
    }
  | {
      readonly kind: 'gap';
      readonly startSeconds: number;
      readonly durationSeconds: number;
    };

export function decodeCutDshToolInput(operation: unknown, input: unknown): CutDshToolInput {
  if (operation === 'query') {
    const record = requireRecord(input, 'input');
    requireExactKeys(record, ['documentPath'], 'input');
    return {
      operation,
      input: { documentPath: requireDocumentPath(record.documentPath, 'input.documentPath') },
    };
  }
  if (operation === 'apply') {
    const record = requireRecord(input, 'input');
    requireExactKeys(record, ['documentPath', 'commands'], 'input');
    return {
      operation,
      input: {
        documentPath: requireDocumentPath(record.documentPath, 'input.documentPath'),
        commands: requireCommands(record.commands, 'input.commands'),
      },
    };
  }
  if (operation === 'export-submit') {
    const record = requireRecord(input, 'input');
    requireExactKeys(
      record,
      ['documentPath', 'sessionId', 'outputWorkspaceRelativePath', 'settings'],
      'input',
    );
    const outputWorkspaceRelativePath = requireOutputPath(
      record.outputWorkspaceRelativePath,
      'input.outputWorkspaceRelativePath',
    );
    const settings = requireExportSettings(record.settings, 'input.settings');
    if (!outputWorkspaceRelativePath.toLowerCase().endsWith(`.${settings.container}`)) {
      throw new Error(
        `input.outputWorkspaceRelativePath must end with .${settings.container} for the selected container.`,
      );
    }
    return {
      operation,
      input: {
        documentPath: requireDocumentPath(record.documentPath, 'input.documentPath'),
        sessionId: requireIdentity(record.sessionId, 'input.sessionId'),
        outputWorkspaceRelativePath,
        settings,
      },
    };
  }
  if (operation === 'export-describe' || operation === 'export-cancel') {
    const record = requireRecord(input, 'input');
    requireExactKeys(record, ['documentPath', 'jobId'], 'input');
    return {
      operation,
      input: {
        documentPath: requireDocumentPath(record.documentPath, 'input.documentPath'),
        jobId: requireIdentity(record.jobId, 'input.jobId'),
      },
    };
  }
  throw new Error(`Cut DSH tool operation must be one of ${CUT_DSH_TOOL_OPERATIONS.join(', ')}.`);
}

export function projectCutDshExportFacts(task: CutExportTaskSnapshot): CutDshExportFacts {
  return {
    jobId: requireProjectedIdentity(task.jobId, 'Cut export Job identity'),
    documentPath: requireDocumentPath(task.documentUri, 'Cut export document path'),
    sessionId: requireProjectedIdentity(task.sessionId, 'Cut export Session identity'),
    sourceSnapshotId: requireProjectedIdentity(
      task.sourceSnapshotId,
      'Cut export source snapshot identity',
    ),
    outputWorkspaceRelativePath: requireOutputPath(
      task.outputWorkspaceRelativePath,
      'Cut export output path',
    ),
    status: task.status,
    startedAt: task.startedAt,
    ...(task.finishedAt === undefined ? {} : { finishedAt: task.finishedAt }),
    ...(task.diagnostic?.code === undefined ? {} : { diagnosticCode: task.diagnostic.code }),
  };
}

export function projectCutDshToolFacts(snapshot: CutProjectSnapshot): CutDshToolFacts {
  const tracks = snapshot.timeline.tracks.slice(0, CUT_DSH_MAX_TRACKS).map((track) => ({
    trackId: requireProjectedIdentity(track.trackId, 'Cut track identity'),
    name: boundedText(track.name),
    kind: track.kind,
    enabled: track.enabled,
    locked: track.locked,
    audioMuted: track.audioMuted,
    itemCount: track.items.length,
    itemsTruncated: track.items.length > CUT_DSH_MAX_ITEMS_PER_TRACK,
    items: track.items.slice(0, CUT_DSH_MAX_ITEMS_PER_TRACK).map(projectItem),
  }));
  return {
    documentPath: snapshot.documentPath,
    name: boundedText(snapshot.timeline.name),
    durationSeconds: snapshot.timeline.durationSeconds,
    trackCount: snapshot.timeline.tracks.length,
    tracksTruncated: snapshot.timeline.tracks.length > CUT_DSH_MAX_TRACKS,
    tracks,
  };
}

function projectItem(item: TimelineItemView): CutDshItemFacts {
  if (item.kind === 'gap') {
    return {
      kind: item.kind,
      startSeconds: item.startSeconds,
      durationSeconds: item.durationSeconds,
    };
  }
  return {
    kind: item.kind,
    clipId: requireProjectedIdentity(item.clipId, 'Cut clip identity'),
    name: boundedText(item.name),
    startSeconds: item.startSeconds,
    durationSeconds: item.durationSeconds,
    playbackRate: item.playbackRate,
    enabled: item.enabled,
    locked: item.locked,
    ...(item.linkedAudioClipId === undefined
      ? {}
      : {
          linkedAudioClipId: requireProjectedIdentity(item.linkedAudioClipId, 'Linked audio Clip'),
        }),
    ...(item.linkedVideoClipId === undefined
      ? {}
      : {
          linkedVideoClipId: requireProjectedIdentity(item.linkedVideoClipId, 'Linked video Clip'),
        }),
  };
}

function requireCommands(input: unknown, field: string): readonly CutDshCommand[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) {
    throw new Error(`${field} must be an array.`);
  }
  if (input.length === 0 || input.length > CUT_DSH_MAX_COMMANDS) {
    throw new Error(`${field} must contain from 1 through ${CUT_DSH_MAX_COMMANDS} commands.`);
  }
  return input.map((command, index) => requireCommand(command, `${field}[${index}]`));
}

function requireCommand(input: unknown, field: string): CutDshCommand {
  const record = requireRecord(input, field);
  switch (record.type) {
    case 'split':
      requireExactKeys(record, ['type', 'clipId', 'offsetFrames', 'rightClipId'], field);
      return {
        type: record.type,
        clipId: requireIdentity(record.clipId, `${field}.clipId`),
        offsetFrames: requirePositiveInteger(record.offsetFrames, `${field}.offsetFrames`),
        rightClipId: requireIdentity(record.rightClipId, `${field}.rightClipId`),
      };
    case 'trim':
      requireExactKeys(record, ['type', 'clipId', 'startDeltaFrames', 'endDeltaFrames'], field);
      return {
        type: record.type,
        clipId: requireIdentity(record.clipId, `${field}.clipId`),
        startDeltaFrames: requireInteger(record.startDeltaFrames, `${field}.startDeltaFrames`),
        endDeltaFrames: requireInteger(record.endDeltaFrames, `${field}.endDeltaFrames`),
      };
    case 'rename-clip':
      requireExactKeys(record, ['type', 'clipId', 'name'], field);
      return {
        type: record.type,
        clipId: requireIdentity(record.clipId, `${field}.clipId`),
        name: requireIdentity(record.name, `${field}.name`),
      };
    case 'set-playback-rate':
      requireExactKeys(record, ['type', 'clipId', 'playbackRate'], field);
      return {
        type: record.type,
        clipId: requireIdentity(record.clipId, `${field}.clipId`),
        playbackRate: requireFiniteNumber(record.playbackRate, `${field}.playbackRate`),
      };
    case 'ripple-delete':
      requireExactKeys(record, ['type', 'clipId'], field);
      return { type: record.type, clipId: requireIdentity(record.clipId, `${field}.clipId`) };
    case 'trim-trailing-gaps':
      requireExactKeys(record, ['type'], field);
      return { type: record.type };
    case 'set-audio':
      requireExactKeys(record, ['type', 'clipId', 'settings'], field);
      return {
        type: record.type,
        clipId: requireIdentity(record.clipId, `${field}.clipId`),
        settings: requireAudioSettings(record.settings, `${field}.settings`),
      };
    case 'set-clip-enabled':
      requireExactKeys(record, ['type', 'clipId', 'enabled'], field);
      return {
        type: record.type,
        clipId: requireIdentity(record.clipId, `${field}.clipId`),
        enabled: requireBoolean(record.enabled, `${field}.enabled`),
      };
    case 'set-track-muted':
      requireExactKeys(record, ['type', 'trackId', 'muted'], field);
      return {
        type: record.type,
        trackId: requireIdentity(record.trackId, `${field}.trackId`),
        muted: requireBoolean(record.muted, `${field}.muted`),
      };
    default:
      throw new Error(`${field}.type is not supported by the Cut DSH tool.`);
  }
}

function requireAudioSettings(
  input: unknown,
  field: string,
): Extract<CutDshCommand, { readonly type: 'set-audio' }>['settings'] {
  const record = requireRecord(input, field);
  const allowed = ['muted', 'gainDb', 'fadeInSeconds', 'fadeOutSeconds'] as const;
  requireAllowedKeys(record, allowed, field);
  if (!Object.hasOwn(record, 'muted')) throw new Error(`${field}.muted is required.`);
  return {
    muted: requireBoolean(record.muted, `${field}.muted`),
    ...(record.gainDb === undefined
      ? {}
      : { gainDb: requireFiniteNumber(record.gainDb, `${field}.gainDb`) }),
    ...(record.fadeInSeconds === undefined
      ? {}
      : {
          fadeInSeconds: requireNonNegativeNumber(record.fadeInSeconds, `${field}.fadeInSeconds`),
        }),
    ...(record.fadeOutSeconds === undefined
      ? {}
      : {
          fadeOutSeconds: requireNonNegativeNumber(
            record.fadeOutSeconds,
            `${field}.fadeOutSeconds`,
          ),
        }),
  };
}

function requireDocumentPath(input: unknown, field: string): string {
  if (typeof input !== 'string') throw new Error(`${field} must be a string.`);
  const normalized = normalizeWorkspaceContentPath(input);
  if (normalized !== input || !normalized.toLowerCase().endsWith('.otio')) {
    throw new Error(`${field} must be a normalized Workspace-relative .otio path.`);
  }
  return input;
}

function requireOutputPath(input: unknown, field: string): string {
  if (typeof input !== 'string') throw new Error(`${field} must be a string.`);
  const normalized = normalizeWorkspaceContentPath(input);
  const basename = input.split('/').at(-1) ?? input;
  if (
    normalized !== input ||
    input.toLowerCase().endsWith('.otio') ||
    input === '.' ||
    input.endsWith('/') ||
    basename === '.mp4' ||
    basename === '.mov'
  ) {
    throw new Error(`${field} must be a normalized Workspace-relative output path.`);
  }
  return input;
}

function requireExportSettings(input: unknown, field: string): CutExportSettings {
  const record = requireRecord(input, field);
  requireExactKeys(
    record,
    [
      'outputName',
      'container',
      'width',
      'height',
      'framesPerSecond',
      'videoBitrate',
      'includeAudio',
      'audioBitrate',
      'audioSampleRate',
    ],
    field,
  );
  const settings: CutExportSettings = {
    outputName: requireIdentity(record.outputName, `${field}.outputName`),
    container:
      record.container === 'mp4' || record.container === 'mov'
        ? record.container
        : (() => {
            throw new Error(`${field}.container must be mp4 or mov.`);
          })(),
    width: requireIntegerInRange(record.width, `${field}.width`, 16, 16_384),
    height: requireIntegerInRange(record.height, `${field}.height`, 16, 16_384),
    framesPerSecond: requireNumberInRange(
      record.framesPerSecond,
      `${field}.framesPerSecond`,
      1,
      240,
    ),
    videoBitrate: requireIntegerInRange(
      record.videoBitrate,
      `${field}.videoBitrate`,
      100_000,
      200_000_000,
    ),
    includeAudio: requireBoolean(record.includeAudio, `${field}.includeAudio`),
    audioBitrate: requireIntegerInRange(
      record.audioBitrate,
      `${field}.audioBitrate`,
      32_000,
      1_000_000,
    ),
    audioSampleRate:
      record.audioSampleRate === 44_100 || record.audioSampleRate === 48_000
        ? record.audioSampleRate
        : (() => {
            throw new Error(`${field}.audioSampleRate must be 44100 or 48000.`);
          })(),
  };
  if (settings.outputName.includes('/') || settings.outputName.includes('\\')) {
    throw new Error(`${field}.outputName must be a file name.`);
  }
  return settings;
}

function requireRecord(input: unknown, field: string): Record<string, unknown> {
  if (
    input === null ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype ||
    Reflect.ownKeys(input).some(
      (key) => typeof key !== 'string' || !Object.prototype.propertyIsEnumerable.call(input, key),
    )
  ) {
    throw new Error(`${field} must be a plain JSON object.`);
  }
  return input as Record<string, unknown>;
}

function requireExactKeys(
  input: Record<string, unknown>,
  keys: readonly string[],
  field: string,
): void {
  requireAllowedKeys(input, keys, field);
  const missing = keys.find((key) => !Object.hasOwn(input, key));
  if (missing !== undefined) throw new Error(`${field}.${missing} is required.`);
}

function requireAllowedKeys(
  input: Record<string, unknown>,
  keys: readonly string[],
  field: string,
): void {
  const unknown = Object.keys(input).find((key) => !keys.includes(key));
  if (unknown !== undefined) throw new Error(`${field}.${unknown} is not supported.`);
}

function requireIdentity(input: unknown, field: string): string {
  if (
    typeof input !== 'string' ||
    input.length === 0 ||
    input.length > 256 ||
    input.trim() !== input
  ) {
    throw new Error(`${field} must be a trimmed identity of at most 256 characters.`);
  }
  return input;
}

function requirePositiveInteger(input: unknown, field: string): number {
  const value = requireInteger(input, field);
  if (value <= 0) throw new Error(`${field} must be positive.`);
  return value;
}

function requireInteger(input: unknown, field: string): number {
  if (!Number.isSafeInteger(input)) throw new Error(`${field} must be a safe integer.`);
  return input as number;
}

function requireIntegerInRange(input: unknown, field: string, min: number, max: number): number {
  const value = requireInteger(input, field);
  if (value < min || value > max) throw new Error(`${field} must be between ${min} and ${max}.`);
  return value;
}

function requireNumberInRange(input: unknown, field: string, min: number, max: number): number {
  const value = requireFiniteNumber(input, field);
  if (value < min || value > max) throw new Error(`${field} must be between ${min} and ${max}.`);
  return value;
}

function requireFiniteNumber(input: unknown, field: string): number {
  if (typeof input !== 'number' || !Number.isFinite(input) || Object.is(input, -0)) {
    throw new Error(`${field} must be a finite number.`);
  }
  return input;
}

function requireNonNegativeNumber(input: unknown, field: string): number {
  const value = requireFiniteNumber(input, field);
  if (value < 0) throw new Error(`${field} must be non-negative.`);
  return value;
}

function requireBoolean(input: unknown, field: string): boolean {
  if (typeof input !== 'boolean') throw new Error(`${field} must be a boolean.`);
  return input;
}

function requireProjectedIdentity(input: string, field: string): string {
  if (input.length === 0 || input.length > 256) {
    throw new Error(`${field} cannot be projected as a bounded DSH Tool result.`);
  }
  return input;
}

function boundedText(input: string): string {
  return input.length <= 256 ? input : input.slice(0, 256);
}
