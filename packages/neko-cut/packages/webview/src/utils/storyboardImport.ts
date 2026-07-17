import {
  CENTERED_TRANSFORM,
  STORYBOARD_TEXT_CUE_KINDS,
  validateCanvasCutDraftPayload,
  isReferenceDescriptor,
  type CanvasTimelineSyncPayload,
  type CanvasCutDraftDiagnostic,
  type CanvasCutDraftPayload,
  type CanvasCutDraftUnit,
  type ReferenceDescriptor,
  type StoryboardMediaRef,
  type StoryboardTextCue,
  type StoryboardVoiceCue,
} from '@neko/shared';
import type { MediaElement } from '../types';

export interface CutStoryboardImportShot {
  id: string;
  shotNumber: number;
  duration: number;
  preparedKeyframeRef?: StoryboardMediaRef;
  referenceDescriptors?: readonly ReferenceDescriptor[];
  imagePath?: string;
  imageDataUrl?: string;
  dialogue?: string;
  voiceOver?: string;
  soundCue?: string;
  textCues?: readonly StoryboardTextCue[];
  voiceCues?: readonly StoryboardVoiceCue[];
  sourceMapping?: CanvasCutDraftUnit['sourceMapping'];
  label: string;
}

export interface CutStoryboardImportPayload {
  projectName: string;
  shots: readonly CutStoryboardImportShot[];
}

export type CanvasDraftStoryboardProjectionResult =
  | {
      readonly ok: true;
      readonly payload: CutStoryboardImportPayload;
      readonly source: CanvasCutDraftPayload;
      readonly diagnostics: readonly CanvasCutDraftDiagnostic[];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly CanvasCutDraftDiagnostic[];
    };

export interface TimelineStoryboardImageClip {
  id: string;
  path: string;
  name: string;
  duration: number;
  startTime: number;
  sourceMapping?: CanvasCutDraftUnit['sourceMapping'];
}

export type TimelineStoryboardCueKind = 'dialogue' | 'voiceOver' | 'soundCue';

export interface TimelineStoryboardCue {
  id: string;
  kind: TimelineStoryboardCueKind;
  text: string;
  name: string;
  duration: number;
  startTime: number;
  speakerName?: string;
  speakerCharacterId?: string;
  speakerEntityId?: string;
  voiceAssetId?: string;
  sourceCueId?: string;
  emotion?: string;
  delivery?: string;
}

export function normalizeCutStoryboardImportPayload(
  value: unknown,
): CutStoryboardImportPayload | null {
  if (!isRecord(value)) return null;
  const projectName = readNonEmptyString(value.projectName) ?? 'Storyboard';
  if (!Array.isArray(value.shots)) return null;

  const shots = value.shots.flatMap((shot, index) => {
    const normalized = normalizeCutStoryboardImportShot(shot, index);
    return normalized ? [normalized] : [];
  });

  return shots.length > 0 ? { projectName, shots } : null;
}

export function buildStoryboardImageClips(
  payload: CutStoryboardImportPayload,
  startTime = 0,
): readonly TimelineStoryboardImageClip[] {
  let cursor = startTime;
  return payload.shots.flatMap((shot) => {
    const path =
      projectPreparedKeyframePath(shot.preparedKeyframeRef) ?? shot.imagePath ?? shot.imageDataUrl;
    const duration = normalizeDuration(shot.duration);
    const shotStartTime = cursor;
    cursor += duration;
    if (!path) return [];
    const clip: TimelineStoryboardImageClip = {
      id: shot.id,
      path,
      name: shot.label || `Shot ${shot.shotNumber}`,
      duration,
      startTime: shotStartTime,
      ...(shot.sourceMapping ? { sourceMapping: shot.sourceMapping } : {}),
    };
    return [clip];
  });
}

export function buildStoryboardMediaElement(
  clip: TimelineStoryboardImageClip,
  importedAt = Date.now(),
): Omit<MediaElement, 'id'> {
  return {
    type: 'media',
    src: clip.path,
    name: clip.name,
    duration: clip.duration,
    startTime: clip.startTime,
    trimStart: 0,
    trimEnd: 0,
    transform: CENTERED_TRANSFORM,
    opacity: 1,
    blendMode: 'normal',
    effects: [],
    muted: false,
    hidden: false,
    locked: false,
    ...(clip.sourceMapping
      ? {
          lineage: {
            shotNodeId: clip.sourceMapping.shotId ?? clip.sourceMapping.canvasNodeId,
            generationId: '',
            planId: clip.sourceMapping.routeId,
            routeLevel: 'canvas-route',
            recordedAt: importedAt,
          },
        }
      : {}),
  };
}

export function projectCanvasCutDraftToStoryboardImport(
  value: unknown,
): CutStoryboardImportPayload | null {
  const result = projectCanvasCutDraftToStoryboardImportResult(value);
  return result.ok ? result.payload : null;
}

export function projectCanvasCutDraftToStoryboardImportResult(
  value: unknown,
): CanvasDraftStoryboardProjectionResult {
  const validation = validateCanvasCutDraftPayload(value, {
    requireMediaSource: true,
  });
  if (!validation.valid || !validation.payload) {
    return { ok: false, diagnostics: validation.diagnostics };
  }
  const payload = validation.payload;
  const blockingDiagnostics = [
    ...validation.diagnostics,
    ...(payload.diagnostics ?? []),
    ...payload.units.flatMap((unit) => unit.diagnostics ?? []),
  ].filter((item) => item.severity === 'error');
  if (blockingDiagnostics.length > 0) {
    return { ok: false, diagnostics: blockingDiagnostics };
  }
  const shots = payload.units.flatMap((unit, index): CutStoryboardImportShot[] => {
    const imagePath = resolveCanvasDraftUnitMediaPath(unit);
    if (!imagePath) return [];
    const cues = unit.cues ?? [];
    const dialogue = findCanvasDraftCueText(cues, 'dialogue');
    const voiceOver = findCanvasDraftCueText(cues, 'voiceOver');
    const soundCue = findCanvasDraftCueText(cues, 'soundCue');
    return [
      {
        id: unit.id,
        shotNumber: index + 1,
        duration: unit.durationMs ? unit.durationMs / 1000 : 3,
        ...(imagePath ? { imagePath } : {}),
        ...(dialogue ? { dialogue } : {}),
        ...(voiceOver ? { voiceOver } : {}),
        ...(soundCue ? { soundCue } : {}),
        sourceMapping: unit.sourceMapping,
        label: unit.label ?? unit.id,
      },
    ];
  });
  if (shots.length === 0) {
    return {
      ok: false,
      diagnostics: [
        ...validation.diagnostics,
        {
          code: 'draft-missing-media-source',
          severity: 'error',
          message: 'CanvasCutDraftPayload does not contain any media that Cut can import.',
        },
      ],
    };
  }
  return {
    ok: true,
    payload: { projectName: payload.projectName, shots },
    source: payload,
    diagnostics: validation.diagnostics,
  };
}

export function buildCanvasDraftTimelineSyncPayload(
  payload: CutStoryboardImportPayload,
  importedAt = Date.now(),
): CanvasTimelineSyncPayload {
  return {
    source: 'neko-cut',
    reason: 'storyboard-import',
    shots: payload.shots.flatMap((shot) => {
      const mapping = shot.sourceMapping;
      const shotId = mapping?.shotId ?? mapping?.canvasNodeId;
      if (!shotId) return [];
      return [
        {
          shotId,
          projectName: payload.projectName,
          importedAt,
          duration: normalizeDuration(shot.duration),
          selectedInTimeline: true,
        },
      ];
    }),
  };
}

export function buildStoryboardMetadataCues(
  payload: CutStoryboardImportPayload,
  startTime = 0,
): readonly TimelineStoryboardCue[] {
  let cursor = startTime;
  return payload.shots.flatMap((shot) => {
    const duration = normalizeDuration(shot.duration);
    const cues: TimelineStoryboardCue[] = [];
    const mergedCueIds = new Set<string>();

    if (shot.dialogue) {
      const structuredCue = findStructuredCue(shot, 'dialogue', shot.dialogue);
      if (structuredCue) mergedCueIds.add(structuredCue.cueId);
      cues.push({
        id: structuredCue?.cueId ?? `${shot.id}-dialogue`,
        kind: 'dialogue',
        text: structuredCue?.text ?? shot.dialogue,
        name: buildCueName('Dialogue', shot),
        duration,
        startTime: cursor,
        ...projectStructuredCueMetadata(structuredCue),
      });
    }

    if (shot.voiceOver) {
      const structuredCue = findStructuredCue(shot, 'voiceOver', shot.voiceOver);
      if (structuredCue) mergedCueIds.add(structuredCue.cueId);
      cues.push({
        id: structuredCue?.cueId ?? `${shot.id}-voice-over`,
        kind: 'voiceOver',
        text: structuredCue?.text ?? shot.voiceOver,
        name: buildCueName('Voice Over', shot),
        duration,
        startTime: cursor,
        ...projectStructuredCueMetadata(structuredCue),
      });
    }

    for (const cue of shot.voiceCues ?? []) {
      if (mergedCueIds.has(cue.cueId)) continue;
      cues.push({
        id: cue.cueId,
        kind: cue.kind,
        text: cue.text,
        name: buildCueName(cue.kind === 'dialogue' ? 'Dialogue' : 'Voice Over', shot),
        duration,
        startTime: cursor,
        ...projectStructuredCueMetadata(cue),
      });
    }

    if (shot.soundCue) {
      cues.push({
        id: `${shot.id}-sound-cue`,
        kind: 'soundCue',
        text: shot.soundCue,
        name: buildCueName('Sound Cue', shot),
        duration,
        startTime: cursor,
      });
    }

    cursor += duration;
    return cues;
  });
}

function normalizeCutStoryboardImportShot(
  value: unknown,
  index: number,
): CutStoryboardImportShot | null {
  if (!isRecord(value)) return null;
  const id = readNonEmptyString(value.id) ?? `shot-${index + 1}`;
  const shotNumber = readFiniteNumber(value.shotNumber) ?? index + 1;
  const duration = normalizeDuration(readFiniteNumber(value.duration));
  const imagePath = readNonEmptyString(value.imagePath);
  const imageDataUrl = readNonEmptyString(value.imageDataUrl);
  const preparedKeyframeRef = normalizeStoryboardMediaRef(value.preparedKeyframeRef);
  const referenceDescriptors = normalizeReferenceDescriptors(value.referenceDescriptors);
  const label = readNonEmptyString(value.label) ?? `#${String(shotNumber).padStart(3, '0')}`;
  const dialogue = readNonEmptyString(value.dialogue);
  const voiceOver = readNonEmptyString(value.voiceOver);
  const soundCue = readNonEmptyString(value.soundCue);
  const textCues = normalizeTextCues(value.textCues);
  const voiceCues = normalizeVoiceCues(value.voiceCues);
  const sourceMapping = normalizeCanvasDraftSourceMapping(value.sourceMapping);

  return {
    id,
    shotNumber,
    duration,
    ...(preparedKeyframeRef ? { preparedKeyframeRef } : {}),
    ...(referenceDescriptors.length > 0 ? { referenceDescriptors } : {}),
    ...(imagePath ? { imagePath } : {}),
    ...(imageDataUrl ? { imageDataUrl } : {}),
    ...(dialogue ? { dialogue } : {}),
    ...(voiceOver ? { voiceOver } : {}),
    ...(soundCue ? { soundCue } : {}),
    ...(textCues.length > 0 ? { textCues } : {}),
    ...(voiceCues.length > 0 ? { voiceCues } : {}),
    ...(sourceMapping ? { sourceMapping } : {}),
    label,
  };
}

function resolveCanvasDraftUnitMediaPath(unit: CanvasCutDraftUnit): string | undefined {
  const preferred =
    unit.media?.find((media) => media.role === 'source' && resolveCanvasDraftMediaPath(media)) ??
    unit.media?.find((media) => resolveCanvasDraftMediaPath(media));
  return preferred ? resolveCanvasDraftMediaPath(preferred) : undefined;
}

function resolveCanvasDraftMediaPath(
  media: NonNullable<CanvasCutDraftUnit['media']>[number],
): string | undefined {
  if (media.assetPath) return media.assetPath;
  const ref = media.resourceRef;
  const path =
    ref?.source.projectRelativePath ??
    (ref?.locator?.kind === 'file' ? ref.locator.path : undefined) ??
    ref?.source.filePath;
  return path && isManagedDraftPath(path) ? path : undefined;
}

function isManagedDraftPath(value: string): boolean {
  return (
    value.startsWith('${') ||
    (!value.startsWith('/') && !value.startsWith('\\\\') && !/^[A-Za-z]:[\\/]/.test(value))
  );
}

function findCanvasDraftCueText(
  cues: readonly NonNullable<CanvasCutDraftUnit['cues']>[number][],
  kind: 'dialogue' | 'voiceOver' | 'soundCue',
): string | undefined {
  return cues.find((cue) => cue.kind === kind)?.text;
}

function normalizeCanvasDraftSourceMapping(
  value: unknown,
): CanvasCutDraftUnit['sourceMapping'] | undefined {
  if (!isRecord(value)) return undefined;
  const routeId = readNonEmptyString(value.routeId);
  const canvasUnitId = readNonEmptyString(value.canvasUnitId);
  const canvasNodeId = readNonEmptyString(value.canvasNodeId);
  const canvasUnitKind = readNonEmptyString(value.canvasUnitKind);
  if (!routeId || !canvasUnitId || !canvasNodeId || !canvasUnitKind) return undefined;
  return {
    routeId,
    canvasUnitId,
    canvasNodeId,
    canvasUnitKind: canvasUnitKind as CanvasCutDraftUnit['kind'],
    ...(readNonEmptyString(value.sceneId) ? { sceneId: readNonEmptyString(value.sceneId) } : {}),
    ...(readNonEmptyString(value.shotId) ? { shotId: readNonEmptyString(value.shotId) } : {}),
  };
}

function normalizeReferenceDescriptors(value: unknown): readonly ReferenceDescriptor[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): readonly ReferenceDescriptor[] =>
    isReferenceDescriptor(item) ? [item] : [],
  );
}

function normalizeStoryboardMediaRef(value: unknown): StoryboardMediaRef | undefined {
  if (!isRecord(value)) return undefined;
  const refId = readNonEmptyString(value.refId);
  const role = value.role;
  const locator = normalizeStoryboardMediaLocator(value.locator);
  if (!refId || !locator) return undefined;
  return {
    refId,
    role:
      role === 'derived' ||
      role === 'generated' ||
      role === 'source' ||
      role === 'reference' ||
      role === 'thumbnail' ||
      role === 'mask'
        ? role
        : 'generated',
    locator,
    ...(readNonEmptyString(value.label) ? { label: readNonEmptyString(value.label) } : {}),
    ...(readNonEmptyString(value.mimeType) ? { mimeType: readNonEmptyString(value.mimeType) } : {}),
  };
}

function normalizeStoryboardMediaLocator(
  value: unknown,
): StoryboardMediaRef['locator'] | undefined {
  if (!isRecord(value)) return undefined;
  switch (value.type) {
    case 'tool-result': {
      const toolCallId = readNonEmptyString(value.toolCallId);
      const assetIndex = readFiniteNumber(value.assetIndex);
      if (!toolCallId || assetIndex === undefined) return undefined;
      return {
        type: 'tool-result',
        toolCallId,
        assetIndex,
        ...(readNonEmptyString(value.taskId) ? { taskId: readNonEmptyString(value.taskId) } : {}),
      };
    }
    case 'asset': {
      const assetId = readNonEmptyString(value.assetId);
      if (!assetId) return undefined;
      return {
        type: 'asset',
        assetId,
        ...(readNonEmptyString(value.assetVersion)
          ? { assetVersion: readNonEmptyString(value.assetVersion) }
          : {}),
        ...(readNonEmptyString(value.uri) ? { uri: readNonEmptyString(value.uri) } : {}),
      };
    }
    case 'workspace-path': {
      const path = readNonEmptyString(value.path);
      return path ? { type: 'workspace-path', path } : undefined;
    }
    case 'canvas-node': {
      const canvasNodeId = readNonEmptyString(value.canvasNodeId);
      return canvasNodeId
        ? {
            type: 'canvas-node',
            canvasNodeId,
            ...(readNonEmptyString(value.outputId)
              ? { outputId: readNonEmptyString(value.outputId) }
              : {}),
          }
        : undefined;
    }
    case 'story-source': {
      const storyId = readNonEmptyString(value.storyId);
      if (!storyId) return undefined;
      return {
        type: 'story-source',
        storyId,
        ...(readNonEmptyString(value.sceneId)
          ? { sceneId: readNonEmptyString(value.sceneId) }
          : {}),
        ...(readFiniteNumber(value.frameIndex) !== undefined
          ? { frameIndex: readFiniteNumber(value.frameIndex) }
          : {}),
      };
    }
    default:
      return undefined;
  }
}

function projectPreparedKeyframePath(ref: StoryboardMediaRef | undefined): string | undefined {
  if (!ref) return undefined;
  switch (ref.locator.type) {
    case 'workspace-path':
      return ref.locator.path;
    case 'asset':
      return ref.locator.uri ?? `asset:${ref.locator.assetId}`;
    case 'tool-result':
      return `tool-result:${ref.locator.toolCallId}:${ref.locator.assetIndex}`;
    case 'canvas-node':
      return ref.locator.outputId
        ? `canvas-node:${ref.locator.canvasNodeId}:${ref.locator.outputId}`
        : `canvas-node:${ref.locator.canvasNodeId}`;
    case 'story-source':
      return ref.locator.sceneId
        ? `story-source:${ref.locator.storyId}:${ref.locator.sceneId}`
        : `story-source:${ref.locator.storyId}`;
  }
}

function normalizeTextCues(value: unknown): readonly StoryboardTextCue[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((cue) => {
    if (!isRecord(cue)) return [];
    const cueId = readNonEmptyString(cue.cueId);
    const text = readNonEmptyString(cue.text);
    const kind = isStoryboardTextCueKind(cue.kind) ? cue.kind : undefined;
    if (!cueId || !text || !kind) return [];
    const speakerEntityRef = normalizeCueSpeakerEntityRef(cue.speakerEntityRef);
    const speakerCharacterId =
      speakerEntityRef?.entityId ?? readNonEmptyString(cue.speakerCharacterId);
    const confidence = normalizeConfidence(cue.confidence);
    return [
      {
        cueId,
        kind,
        text,
        ...(readNonEmptyString(cue.speakerName)
          ? { speakerName: readNonEmptyString(cue.speakerName) }
          : {}),
        ...(speakerCharacterId ? { speakerCharacterId } : {}),
        ...(speakerEntityRef ? { speakerEntityRef } : {}),
        ...(readNonEmptyString(cue.sourceRefId)
          ? { sourceRefId: readNonEmptyString(cue.sourceRefId) }
          : {}),
        ...(readNonEmptyString(cue.language) ? { language: readNonEmptyString(cue.language) } : {}),
        ...(confidence !== undefined ? { confidence } : {}),
        ...(readNonEmptyString(cue.emotion) ? { emotion: readNonEmptyString(cue.emotion) } : {}),
        ...(readNonEmptyString(cue.delivery) ? { delivery: readNonEmptyString(cue.delivery) } : {}),
      },
    ];
  });
}

function normalizeVoiceCues(value: unknown): readonly StoryboardVoiceCue[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((cue) => {
    if (!isRecord(cue)) return [];
    const cueId = readNonEmptyString(cue.cueId);
    const text = readNonEmptyString(cue.text);
    const kind = cue.kind === 'dialogue' || cue.kind === 'voiceOver' ? cue.kind : undefined;
    if (!cueId || !text || !kind) return [];
    const speakerEntityRef = normalizeCueSpeakerEntityRef(cue.speakerEntityRef);
    const speakerCharacterId =
      speakerEntityRef?.entityId ?? readNonEmptyString(cue.speakerCharacterId);
    return [
      {
        cueId,
        kind,
        text,
        ...(readNonEmptyString(cue.speakerName)
          ? { speakerName: readNonEmptyString(cue.speakerName) }
          : {}),
        ...(speakerCharacterId ? { speakerCharacterId } : {}),
        ...(speakerEntityRef ? { speakerEntityRef } : {}),
        ...(readNonEmptyString(cue.emotion) ? { emotion: readNonEmptyString(cue.emotion) } : {}),
        ...(readNonEmptyString(cue.delivery) ? { delivery: readNonEmptyString(cue.delivery) } : {}),
        ...(readNonEmptyString(cue.voiceAssetId)
          ? { voiceAssetId: readNonEmptyString(cue.voiceAssetId) }
          : {}),
        ...(readNonEmptyString(cue.sourceRefId)
          ? { sourceRefId: readNonEmptyString(cue.sourceRefId) }
          : {}),
      },
    ];
  });
}

function normalizeCueSpeakerEntityRef(
  value: unknown,
): StoryboardVoiceCue['speakerEntityRef'] | undefined {
  if (!isRecord(value)) return undefined;
  const entityId = readNonEmptyString(value.entityId);
  const entityKind = value.entityKind;
  if (!entityId || entityKind !== 'character') return undefined;
  return { entityId, entityKind };
}

function isStoryboardTextCueKind(value: unknown): value is StoryboardTextCue['kind'] {
  return STORYBOARD_TEXT_CUE_KINDS.includes(value as StoryboardTextCue['kind']);
}

function normalizeConfidence(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : undefined;
}

function findStructuredCue(
  shot: CutStoryboardImportShot,
  kind: StoryboardVoiceCue['kind'],
  summaryText?: string,
): StoryboardVoiceCue | undefined {
  const matchingKind = shot.voiceCues?.filter((cue) => cue.kind === kind) ?? [];
  const normalizedSummaryText = normalizeCueTextForMatching(summaryText);
  if (normalizedSummaryText) {
    const matchingText = matchingKind.find(
      (cue) => normalizeCueTextForMatching(cue.text) === normalizedSummaryText,
    );
    if (matchingText) return matchingText;
  }
  return matchingKind[0];
}

function projectStructuredCueMetadata(
  cue: StoryboardVoiceCue | undefined,
): Pick<
  TimelineStoryboardCue,
  | 'speakerName'
  | 'speakerCharacterId'
  | 'speakerEntityId'
  | 'voiceAssetId'
  | 'sourceCueId'
  | 'emotion'
  | 'delivery'
> {
  if (!cue) return {};
  const speakerEntityId = cue.speakerEntityRef?.entityId;
  const speakerCharacterId = speakerEntityId ?? cue.speakerCharacterId;
  return {
    ...(cue.speakerName ? { speakerName: cue.speakerName } : {}),
    ...(speakerCharacterId ? { speakerCharacterId } : {}),
    ...(speakerEntityId ? { speakerEntityId } : {}),
    ...(cue.voiceAssetId ? { voiceAssetId: cue.voiceAssetId } : {}),
    sourceCueId: cue.cueId,
    ...(cue.emotion ? { emotion: cue.emotion } : {}),
    ...(cue.delivery ? { delivery: cue.delivery } : {}),
  };
}

function normalizeDuration(value: number | undefined): number {
  return value && value > 0 ? value : 3;
}

function buildCueName(prefix: string, shot: CutStoryboardImportShot): string {
  return `${prefix} ${shot.shotNumber}: ${shot.label}`;
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeCueTextForMatching(value: string | undefined): string | undefined {
  const normalized = value?.trim().replace(/\s+/g, ' ');
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
