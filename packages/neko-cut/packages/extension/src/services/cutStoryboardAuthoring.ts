import type {
  CanvasCutDraftDiagnostic,
  CanvasCutDraftPayload,
  CanvasCutDraftUnit,
  CanvasTimelineSyncPayload,
  ProjectData,
  ReferenceDescriptor,
  StoryboardMediaRef,
  StoryboardTextCue,
  StoryboardVoiceCue,
  TextElement,
  TimelineElement,
  TimelineTrack,
} from '@neko/shared';
import {
  CENTERED_TRANSFORM,
  STORYBOARD_TEXT_CUE_KINDS,
  isReferenceDescriptor,
  validateCanvasCutDraftPayload,
} from '@neko/shared';

export interface CutStoryboardImportShot {
  readonly id: string;
  readonly shotNumber: number;
  readonly duration: number;
  readonly preparedKeyframeRef?: StoryboardMediaRef;
  readonly referenceDescriptors?: readonly ReferenceDescriptor[];
  readonly imagePath?: string;
  readonly imageDataUrl?: string;
  readonly dialogue?: string;
  readonly voiceOver?: string;
  readonly soundCue?: string;
  readonly textCues?: readonly StoryboardTextCue[];
  readonly voiceCues?: readonly StoryboardVoiceCue[];
  readonly sourceMapping?: CanvasCutDraftUnit['sourceMapping'];
  readonly label: string;
}

export interface CutStoryboardImportPayload {
  readonly projectName: string;
  readonly shots: readonly CutStoryboardImportShot[];
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

export interface CutStoryboardTimelineRef {
  readonly kind: 'media' | 'dialogue' | 'voiceOver' | 'soundCue';
  readonly shotId: string;
  readonly trackId: string;
  readonly elementId: string;
  readonly sourcePath?: string;
}

export interface CutStoryboardTimelineAuthoringResult {
  readonly projectData: ProjectData;
  readonly refs: readonly CutStoryboardTimelineRef[];
  readonly importedAt: number;
  readonly syncPayload: CanvasTimelineSyncPayload;
}

interface TimelineStoryboardImageClip {
  readonly id: string;
  readonly path: string;
  readonly name: string;
  readonly duration: number;
  readonly startTime: number;
  readonly sourceMapping?: CanvasCutDraftUnit['sourceMapping'];
}

type TimelineStoryboardCueKind = 'dialogue' | 'voiceOver' | 'soundCue';

interface TimelineStoryboardCue {
  readonly id: string;
  readonly shotId: string;
  readonly kind: TimelineStoryboardCueKind;
  readonly text: string;
  readonly name: string;
  readonly duration: number;
  readonly startTime: number;
  readonly speakerName?: string;
  readonly speakerCharacterId?: string;
  readonly speakerEntityId?: string;
  readonly voiceAssetId?: string;
  readonly sourceCueId?: string;
  readonly emotion?: string;
  readonly delivery?: string;
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
        imagePath,
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

export function addCutStoryboardToTimeline(input: {
  readonly projectData: ProjectData;
  readonly payload: CutStoryboardImportPayload;
  readonly importedAt?: number;
  readonly createId?: () => string;
}): CutStoryboardTimelineAuthoringResult {
  const importedAt = input.importedAt ?? Date.now();
  const createId = input.createId ?? createAuthoringId;
  const tracks = input.projectData.tracks.map((track) => ({
    ...track,
    elements: [...track.elements],
  }));
  const startTime = getProjectTotalDuration(input.projectData);
  const refs: CutStoryboardTimelineRef[] = [];

  for (const clip of buildStoryboardImageClips(input.payload, startTime)) {
    const mediaTrack = findOrCreateTrack(tracks, 'media', 'Canvas Draft Media', createId);
    const elementId = createId();
    mediaTrack.elements.push(createStoryboardMediaElement(clip, elementId, importedAt));
    refs.push({
      kind: 'media',
      shotId: clip.id,
      trackId: mediaTrack.id,
      elementId,
      sourcePath: clip.path,
    });
  }

  const cues = buildStoryboardMetadataCues(input.payload, startTime);
  for (const cue of cues.filter((item) => item.kind === 'dialogue')) {
    const subtitleTrack = findOrCreateTrack(tracks, 'subtitle', 'Storyboard Dialogue', createId);
    const elementId = createId();
    subtitleTrack.elements.push(createStoryboardSubtitleElement(cue, elementId));
    refs.push({ kind: 'dialogue', shotId: cue.shotId, trackId: subtitleTrack.id, elementId });
  }

  for (const cue of cues.filter((item) => item.kind !== 'dialogue')) {
    const textTrack = findOrCreateTrack(tracks, 'text', 'Storyboard Audio Notes', createId);
    const elementId = createId();
    textTrack.elements.push(createStoryboardTextElement(cue, elementId));
    refs.push({ kind: cue.kind, shotId: cue.shotId, trackId: textTrack.id, elementId });
  }

  return {
    projectData: { ...input.projectData, tracks },
    refs,
    importedAt,
    syncPayload: buildCanvasDraftTimelineSyncPayload(input.payload, importedAt),
  };
}

function buildStoryboardImageClips(
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
    if (!path || !isDurableStoryboardMediaPath(path)) return [];
    return [
      {
        id: shot.id,
        path,
        name: shot.label || `Shot ${shot.shotNumber}`,
        duration,
        startTime: shotStartTime,
        ...(shot.sourceMapping ? { sourceMapping: shot.sourceMapping } : {}),
      },
    ];
  });
}

function buildStoryboardMetadataCues(
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
        shotId: shot.id,
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
        shotId: shot.id,
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
        shotId: shot.id,
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
        shotId: shot.id,
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

function createStoryboardMediaElement(
  clip: TimelineStoryboardImageClip,
  elementId: string,
  importedAt: number,
): TimelineElement {
  return {
    id: elementId,
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

function createStoryboardSubtitleElement(
  cue: TimelineStoryboardCue,
  elementId: string,
): TimelineElement {
  return {
    id: elementId,
    type: 'subtitle',
    name: cue.name,
    text: cue.text,
    fontSize: 48,
    color: '#ffffff',
    fontFamily: 'Arial',
    backgroundColor: 'transparent',
    textAlign: 'center',
    strokeColor: 'transparent',
    strokeWidth: 0,
    duration: cue.duration,
    startTime: cue.startTime,
    trimStart: 0,
    trimEnd: 0,
    transform: CENTERED_TRANSFORM,
    opacity: 1,
    blendMode: 'normal',
    effects: [],
    muted: false,
    hidden: false,
    locked: false,
  };
}

function createStoryboardTextElement(cue: TimelineStoryboardCue, elementId: string): TextElement {
  const prefix = cue.kind === 'voiceOver' ? 'Voice Over' : 'Sound Cue';
  return {
    id: elementId,
    type: 'text',
    name: cue.name,
    content: `${prefix}: ${cue.text}`,
    fontSize: 36,
    fontFamily: 'Arial',
    color: '#f8fafc',
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    textAlign: 'left',
    fontWeight: 'normal',
    fontStyle: 'normal',
    duration: cue.duration,
    startTime: cue.startTime,
    trimStart: 0,
    trimEnd: 0,
    transform: CENTERED_TRANSFORM,
    opacity: 1,
    blendMode: 'normal',
    effects: [],
    muted: false,
    hidden: false,
    locked: false,
  };
}

function findOrCreateTrack(
  tracks: TimelineTrack[],
  type: TimelineTrack['type'],
  name: string,
  createId: () => string,
): TimelineTrack {
  const existing = tracks.find((track) => track.type === type && track.name === name);
  if (existing) return existing;
  const created: TimelineTrack = {
    id: createId(),
    name,
    type,
    elements: [],
    muted: false,
    locked: false,
    hidden: false,
    isMain: false,
  };
  tracks.push(created);
  return created;
}

function buildCanvasDraftTimelineSyncPayload(
  payload: CutStoryboardImportPayload,
  importedAt: number,
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

function isDurableStoryboardMediaPath(value: string): boolean {
  return (
    isManagedDraftPath(value) && !/^data:|^blob:|^vscode-webview:|^vscode-resource:/i.test(value)
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
  if (value.type === 'workspace-path') {
    const path = readNonEmptyString(value.path);
    return path ? { type: 'workspace-path', path } : undefined;
  }
  return undefined;
}

function projectPreparedKeyframePath(ref: StoryboardMediaRef | undefined): string | undefined {
  if (!ref) return undefined;
  return ref.locator.type === 'workspace-path' ? ref.locator.path : undefined;
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

function getProjectTotalDuration(projectData: ProjectData): number {
  let maxEnd = 0;
  for (const track of projectData.tracks) {
    for (const element of track.elements) {
      const endTime = element.startTime + element.duration - element.trimStart - element.trimEnd;
      if (endTime > maxEnd) maxEnd = endTime;
    }
  }
  return maxEnd;
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

function createAuthoringId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
