import type {
  CanvasNode,
  CanvasStoryboardActionIntentId,
  CanvasStoryboardNextCreativeState,
  CanvasStoryboardNextCreativeStateSeverity,
  CanvasStoryboardPromptState,
  CanvasStoryboardSemanticPromptDocument,
} from '@neko/shared';
import {
  isCanvasStoryboardPromptState,
  projectCanvasStoryboardReviewRow,
  resolveCanvasStoryboardNextCreativeState,
  SHOT_IMAGE_PREP_COMIC_IMAGE_AUDIT_EXTENSION_KEY,
} from '@neko/shared';

export type CreatorSceneViewMode = 'storyboard-table' | 'creative-view';

export type SceneShotTableColumnId =
  | 'shot'
  | 'reference-media'
  | 'image-prompt'
  | 'video-prompt'
  | 'duration'
  | 'dialogue'
  | 'state'
  | 'action';

export type SceneShotTableColumnProfileId = 'creator-review' | 'professional';

export interface SceneShotTableColumnProfile {
  readonly id: SceneShotTableColumnProfileId;
  readonly columnIds: readonly SceneShotTableColumnId[];
}

export type SceneShotTableFilterId =
  | 'all'
  | 'missing-image'
  | 'missing-dialogue'
  | 'failed-generation'
  | 'ungenerated'
  | 'has-diagnostics'
  | 'current-character'
  | 'current-scene-tag';

export interface SceneShotTableFilterContext {
  readonly currentCharacter?: string;
  readonly currentSceneTag?: string;
}

export interface SceneShotTableRow {
  readonly id: string;
  readonly node: CanvasNode;
  readonly ordinal: number;
  readonly shotNumber: string;
  readonly referenceMedia: string;
  readonly imagePrompt: string;
  readonly imagePromptDocument?: CanvasStoryboardSemanticPromptDocument;
  readonly videoPrompt: string;
  readonly videoPromptDocument?: CanvasStoryboardSemanticPromptDocument;
  readonly duration: string;
  readonly dialogue: string;
  readonly stateId: string;
  readonly state: string;
  readonly stateSeverity: CanvasStoryboardNextCreativeStateSeverity;
  readonly stateTarget: string;
  readonly nextActionId?: CanvasStoryboardActionIntentId;
  readonly actionLabel: string;
  readonly camera: string;
  readonly visualAction: string;
  readonly characters: string;
  readonly dialogueSfx: string;
  readonly tagsStyle: string;
  readonly imagePrep: string;
  readonly status: string;
  readonly characterDescription: string;
  readonly characterReference: string;
  readonly referenceImage: string;
  readonly storyboardPrompt: string;
  readonly videoCameraPrompt: string;
  readonly imageStrategy: string;
  readonly mediaRefs: string;
  readonly diagnostics: string;
  readonly hasImage: boolean;
  readonly hasDialogue: boolean;
  readonly generationStatus?: string;
  readonly sceneTags: readonly string[];
  readonly characterNames: readonly string[];
  readonly diagnosticCount: number;
}

export const DEFAULT_SCENE_SHOT_TABLE_COLUMNS = [
  'shot',
  'reference-media',
  'image-prompt',
  'duration',
  'dialogue',
  'state',
  'action',
] as const satisfies readonly SceneShotTableColumnId[];

export const PROFESSIONAL_SCENE_SHOT_TABLE_COLUMNS =
  [] as const satisfies readonly SceneShotTableColumnId[];

export const SCENE_SHOT_TABLE_COLUMN_PROFILES = [
  {
    id: 'creator-review',
    columnIds: DEFAULT_SCENE_SHOT_TABLE_COLUMNS,
  },
  {
    id: 'professional',
    columnIds: [...DEFAULT_SCENE_SHOT_TABLE_COLUMNS, ...PROFESSIONAL_SCENE_SHOT_TABLE_COLUMNS],
  },
] as const satisfies readonly SceneShotTableColumnProfile[];

export const SCENE_SHOT_TABLE_FILTERS = [
  'all',
  'missing-image',
  'missing-dialogue',
  'failed-generation',
  'ungenerated',
  'has-diagnostics',
  'current-character',
  'current-scene-tag',
] as const satisfies readonly SceneShotTableFilterId[];

export function projectSceneShotTableRows(
  scene: CanvasNode,
  childNodes: readonly CanvasNode[],
): readonly SceneShotTableRow[] {
  const shotNodes = childNodes.filter((child): child is CanvasNode => child.type === 'shot');
  return shotNodes.map((shot, index) => projectSceneShotTableRow(scene, shot, index));
}

export function filterSceneShotTableRows(
  rows: readonly SceneShotTableRow[],
  filterId: SceneShotTableFilterId,
  context: SceneShotTableFilterContext = {},
): readonly SceneShotTableRow[] {
  return rows.filter((row) => matchesSceneShotTableFilter(row, filterId, context));
}

export function matchesSceneShotTableFilter(
  row: SceneShotTableRow,
  filterId: SceneShotTableFilterId,
  context: SceneShotTableFilterContext = {},
): boolean {
  switch (filterId) {
    case 'all':
      return true;
    case 'missing-image':
      return !row.hasImage;
    case 'missing-dialogue':
      return !row.hasDialogue;
    case 'failed-generation':
      return row.stateSeverity === 'error' || row.stateSeverity === 'blocked';
    case 'ungenerated':
      return row.nextActionId === 'generate-video' || row.nextActionId === 'generate-image';
    case 'has-diagnostics':
      return row.diagnosticCount > 0;
    case 'current-character': {
      const currentCharacter = context.currentCharacter;
      return Boolean(
        currentCharacter &&
        row.characterNames.some((name) => equalNormalizedText(name, currentCharacter)),
      );
    }
    case 'current-scene-tag': {
      const currentSceneTag = context.currentSceneTag;
      return Boolean(
        currentSceneTag && row.sceneTags.some((tag) => equalNormalizedText(tag, currentSceneTag)),
      );
    }
  }
}

export function resolveSceneShotTableColumns(
  profileId: SceneShotTableColumnProfileId,
  extraColumnIds: readonly SceneShotTableColumnId[] = [],
): readonly SceneShotTableColumnId[] {
  const profile =
    SCENE_SHOT_TABLE_COLUMN_PROFILES.find((candidate) => candidate.id === profileId) ??
    SCENE_SHOT_TABLE_COLUMN_PROFILES[0];
  return uniqueColumnIds([...profile.columnIds, ...extraColumnIds]);
}

function projectSceneShotTableRow(
  scene: CanvasNode,
  shot: CanvasNode,
  index: number,
): SceneShotTableRow {
  const data = readRecord(shot.data);
  const sceneData = readRecord(scene.data);
  const characterNames = readCharacterNames(data['characters']);
  const sceneTags = readStringArray(data['sceneTags']);
  const generationStatus = readString(data, 'generationStatus');
  const duration = readNumber(data, 'duration');
  const diagnostics = collectDiagnosticMessages(data);
  const sourceMediaRefs = readReadonlyArray(data['sourceMediaRefs']);
  const generatedMediaRefs = readReadonlyArray(data['generatedMediaRefs']);
  const mediaRefs = readReadonlyArray(data['mediaRefs']);
  const shotImagePrepPlan = readRecord(data['shotImagePrepPlan']);
  const imageStrategy =
    readString(shotImagePrepPlan, 'imageStrategy') ?? readString(data, 'imageStrategy');
  const storyboardPromptState = readStoryboardPromptStateForRow(shot.id, data['storyboardPrompt']);
  const sceneStoryboardPromptState = readStoryboardPromptStateForRow(
    scene.id,
    sceneData['storyboardPrompt'],
  );
  const semanticRow = projectCanvasStoryboardReviewRow({
    nodeId: shot.id,
    sceneNodeId: scene.id,
    data,
  });
  const nextCreativeState = resolveSceneAwareShotState(
    storyboardPromptState,
    sceneStoryboardPromptState,
    semanticRow.state,
  );
  const semanticDiagnostics = semanticRow.diagnostics.map((diagnostic) => diagnostic.message);

  return {
    id: shot.id,
    node: shot,
    ordinal: index + 1,
    shotNumber: readShotNumber(shot, index),
    referenceMedia: semanticRow.referenceMedia || summarizeLegacyReferenceMedia(data),
    imagePrompt: semanticRow.imagePrompt,
    imagePromptDocument: storyboardPromptState?.promptBlocks?.imagePromptDocument,
    videoPrompt: semanticRow.videoPrompt,
    videoPromptDocument: storyboardPromptState?.promptBlocks?.videoPromptDocument,
    duration: semanticRow.duration || (duration === undefined ? '' : formatSeconds(duration)),
    dialogue: semanticRow.dialogue,
    stateId: nextCreativeState.id,
    state: nextCreativeState.label,
    stateSeverity: nextCreativeState.severity,
    stateTarget: nextCreativeState.target,
    nextActionId: nextCreativeState.nextActionId,
    actionLabel: nextCreativeState.nextActionId
      ? formatStoryboardActionLabel(nextCreativeState.nextActionId)
      : '',
    camera: joinDisplayParts([
      readString(data, 'shotScale'),
      readString(data, 'cameraAngle'),
      readString(data, 'cameraMovement'),
    ]),
    visualAction: joinDisplayParts([
      readString(data, 'visualDescription'),
      readString(data, 'characterAction'),
    ]),
    characters: characterNames.join(', '),
    dialogueSfx: joinDisplayParts([
      readString(data, 'dialogue'),
      readString(data, 'voiceOver'),
      readString(data, 'soundCue'),
      summarizeCueTexts(data['textCues']),
      summarizeCueTexts(data['voiceCues']),
    ]),
    tagsStyle: joinDisplayParts([
      ...sceneTags,
      ...readStringArray(data['emotion']),
      readString(data, 'visualStyle'),
      ...readStringArray(data['vfx']),
    ]),
    imagePrep: summarizeImagePrep(shot, data, shotImagePrepPlan),
    status: semanticRow.state.label,
    characterDescription: summarizeCharacterField(data['characters'], 'appearanceNotes'),
    characterReference: summarizeCharacterRefs(data['characters']),
    referenceImage: joinDisplayParts([
      readString(data, 'referenceImagePath'),
      summarizeRecordRef(data['referenceImageResourceRef']),
      summarizeRecordRef(data['referenceResourceRef']),
    ]),
    storyboardPrompt: semanticRow.imagePrompt || semanticRow.videoPrompt,
    videoCameraPrompt: semanticRow.videoPrompt,
    imageStrategy: imageStrategy ?? readString(data, 'imageStrategy') ?? '',
    mediaRefs: joinDisplayParts([
      summarizeMediaRefs(sourceMediaRefs, 'source'),
      summarizeMediaRefs(generatedMediaRefs, 'generated'),
      summarizeMediaRefs(mediaRefs, 'media'),
    ]),
    diagnostics: [...semanticDiagnostics, ...diagnostics].join(' · '),
    hasImage: hasShotImage(data) || Boolean(semanticRow.referenceMedia),
    hasDialogue: hasShotDialogue(data),
    generationStatus,
    sceneTags: sceneTags.length > 0 ? sceneTags : readStringArray(sceneData['sceneTags']),
    characterNames,
    diagnosticCount: semanticDiagnostics.length + diagnostics.length,
  };
}

function resolveSceneAwareShotState(
  shotState: CanvasStoryboardPromptState | undefined,
  sceneState: CanvasStoryboardPromptState | undefined,
  fallback: CanvasStoryboardNextCreativeState,
): CanvasStoryboardNextCreativeState {
  const sceneVideoPromptDocument = sceneState?.promptBlocks?.videoPromptDocument;
  if (!shotState || !sceneVideoPromptDocument || shotState.promptBlocks?.videoPromptDocument) {
    return fallback;
  }
  if (fallback.taskRef || fallback.resultRef || fallback.target === 'result-review') {
    return fallback;
  }
  return resolveCanvasStoryboardNextCreativeState({
    promptBlocks: {
      ...(shotState.promptBlocks ?? {}),
      videoPromptDocument: sceneVideoPromptDocument,
    },
    referenceMedia: shotState.referenceMedia,
    generationParams: shotState.generationParams,
    executionRefs: shotState.executionRefs,
    diagnostics: shotState.diagnostics,
  });
}

function readStoryboardPromptStateForRow(
  nodeId: string,
  value: unknown,
): CanvasStoryboardPromptState | undefined {
  if (value === undefined) return undefined;
  if (!isCanvasStoryboardPromptState(value)) {
    throw new Error(`Invalid storyboardPrompt state on shot node ${nodeId}.`);
  }
  return value;
}

function summarizeImagePrep(
  node: CanvasNode,
  data: Record<string, unknown>,
  shotImagePrepPlan: Record<string, unknown>,
): string {
  const planMetadata = readRecord(shotImagePrepPlan['metadata']);
  return joinDisplayParts([
    readString(shotImagePrepPlan, 'status'),
    readString(shotImagePrepPlan, 'imageStrategy') ?? readString(data, 'imageStrategy'),
    summarizeOperationPlan(shotImagePrepPlan['operationPlan']),
    summarizeRegenerationRecommendation(planMetadata['regenerationRecommendation']),
    summarizeComicImageAudit(planMetadata['imageAudit']),
    summarizeComicImageAudit(readStoryboardComicImageAuditExtension(node, data)),
  ]);
}

function summarizeLegacyReferenceMedia(data: Record<string, unknown>): string {
  return joinDisplayParts([
    summarizeMediaRefs(readReadonlyArray(data['sourceMediaRefs']), 'source'),
    summarizeMediaRefs(readReadonlyArray(data['mediaRefs']), 'media'),
    readString(data, 'referenceImagePath'),
    summarizeRecordRef(data['referenceImageResourceRef']),
    summarizeRecordRef(data['referenceResourceRef']),
  ]);
}

function formatStoryboardActionLabel(actionId: CanvasStoryboardActionIntentId): string {
  switch (actionId) {
    case 'process-reference':
      return 'Process reference';
    case 'optimize-image-prompt':
      return 'Optimize image prompt';
    case 'optimize-video-prompt':
      return 'Optimize scene video prompt';
    case 'generate-image':
      return 'Generate image';
    case 'generate-video':
      return 'Generate video';
    case 'review-result':
      return 'Review result';
    case 'fix-alignment':
      return 'Fix alignment';
    case 'accept-result':
      return 'Accept result';
    case 'retry':
      return 'Retry';
  }
}

function readStoryboardComicImageAuditExtension(
  node: CanvasNode,
  data: Record<string, unknown>,
): unknown {
  return (
    readRecord(data['extensions'])[SHOT_IMAGE_PREP_COMIC_IMAGE_AUDIT_EXTENSION_KEY] ??
    readRecord(node.extension)[SHOT_IMAGE_PREP_COMIC_IMAGE_AUDIT_EXTENSION_KEY]
  );
}

function summarizeOperationPlan(value: unknown): string | undefined {
  const operations = readStringArray(value);
  return operations.length > 0 ? operations.join(', ') : undefined;
}

function summarizeRegenerationRecommendation(value: unknown): string | undefined {
  const recommendation = readRecord(value);
  return readString(recommendation, 'label') ?? readString(recommendation, 'decision');
}

function summarizeComicImageAudit(value: unknown): string | undefined {
  const audit = readRecord(value);
  if (Object.keys(audit).length === 0) {
    return undefined;
  }
  return joinDisplayParts([
    readString(audit, 'orientation'),
    summarizeCount(audit, 'panelCount', 'panel'),
    summarizeCount(audit, 'derivedShotCount', 'shot'),
    summarizeRequiredImageOperations(audit),
    readString(audit, 'notes'),
  ]);
}

function summarizeRequiredImageOperations(audit: Record<string, unknown>): string | undefined {
  const requiredOperations = readStringArray(audit['requiredOperations']);
  const flags = [
    ['requiresRotation', 'rotate'],
    ['requiresSplit', 'split'],
    ['requiresTextRemoval', 'remove text'],
    ['requiresInpaint', 'inpaint'],
    ['requiresOutpaint', 'outpaint'],
    ['requiresColorize', 'colorize'],
    ['requiresUpscale', 'upscale'],
    ['requiresStyleNormalize', 'style normalize'],
    ['requiresRedraw', 'redraw'],
    ['requiresKeyframeGeneration', 'keyframe'],
  ] as const;
  const flaggedOperations = flags.flatMap(([key, label]) => (audit[key] === true ? [label] : []));
  const operations = [...requiredOperations, ...flaggedOperations];
  return operations.length > 0 ? Array.from(new Set(operations)).join(', ') : undefined;
}

function summarizeCount(
  data: Record<string, unknown>,
  key: string,
  singularLabel: string,
): string | undefined {
  const count = readNumber(data, key);
  if (count === undefined) {
    return undefined;
  }
  return `${count} ${count === 1 ? singularLabel : `${singularLabel}s`}`;
}

function readShotNumber(shot: CanvasNode, index: number): string {
  const data = readRecord(shot.data);
  const shotNumber = readNumber(data, 'shotNumber');
  if (shotNumber !== undefined) {
    return String(shotNumber);
  }
  const title = shot.preview?.title;
  return title && title.trim().length > 0 ? title.trim() : String(index + 1);
}

function hasShotImage(data: Record<string, unknown>): boolean {
  if (
    readString(data, 'generatedImage') ||
    readString(data, 'runtimeReferenceImagePath') ||
    readString(data, 'referenceImagePath') ||
    hasRecord(data['referenceImageResourceRef']) ||
    hasRecord(data['referenceResourceRef']) ||
    readString(readRecord(data['generatedAsset']), 'path')
  ) {
    return true;
  }
  return readReadonlyArray(data['generationHistory']).some((candidate) => {
    const record = readRecord(candidate);
    return Boolean(readString(record, 'dataUrl') || readString(record, 'path'));
  });
}

function hasShotDialogue(data: Record<string, unknown>): boolean {
  if (
    readString(data, 'dialogue') ||
    readString(data, 'voiceOver') ||
    readString(data, 'soundCue')
  ) {
    return true;
  }
  return (
    readReadonlyArray(data['textCues']).some((cue) =>
      Boolean(readString(readRecord(cue), 'text')),
    ) ||
    readReadonlyArray(data['voiceCues']).some((cue) => Boolean(readString(readRecord(cue), 'text')))
  );
}

function readCharacterNames(value: unknown): readonly string[] {
  return readReadonlyArray(value)
    .map((character) => {
      const record = readRecord(character);
      return readString(record, 'characterName') ?? readString(record, 'name');
    })
    .filter((name): name is string => Boolean(name));
}

function summarizeCharacterField(value: unknown, key: string): string {
  return readReadonlyArray(value)
    .map((character) => readString(readRecord(character), key))
    .filter((text): text is string => Boolean(text))
    .join(' · ');
}

function summarizeCharacterRefs(value: unknown): string {
  return readReadonlyArray(value)
    .map((character) => {
      const record = readRecord(character);
      return (
        readString(record, 'characterId') ??
        readString(record, 'candidateId') ??
        readString(readRecord(record['entityRef']), 'entityId')
      );
    })
    .filter((text): text is string => Boolean(text))
    .join(', ');
}

function summarizeCueTexts(value: unknown): string | undefined {
  const texts = readReadonlyArray(value)
    .map((cue) => readString(readRecord(cue), 'text'))
    .filter((text): text is string => Boolean(text));
  return texts.length > 0 ? texts.join(' · ') : undefined;
}

function collectDiagnosticMessages(data: Record<string, unknown>): readonly string[] {
  return [
    ...summarizeDiagnostics(data['continuityDiagnostics']),
    ...summarizeDiagnostics(readRecord(data['shotImagePrepPlan'])['diagnostics']),
    ...summarizeDiagnostics(readRecord(data['batchExecutionPlan'])['diagnostics']),
  ];
}

function summarizeDiagnostics(value: unknown): readonly string[] {
  return readReadonlyArray(value)
    .map((diagnostic) => {
      const record = readRecord(diagnostic);
      return readString(record, 'message') ?? readString(record, 'code');
    })
    .filter((message): message is string => Boolean(message));
}

function summarizeMediaRefs(refs: readonly unknown[], defaultLabel: string): string | undefined {
  if (refs.length === 0) {
    return undefined;
  }
  const labels = refs
    .map((ref) => {
      const record = readRecord(ref);
      return readString(record, 'label') ?? readString(record, 'refId');
    })
    .filter((label): label is string => Boolean(label));
  return labels.length > 0 ? labels.join(', ') : `${defaultLabel}: ${refs.length}`;
}

function summarizeRecordRef(value: unknown): string | undefined {
  const record = readRecord(value);
  if (Object.keys(record).length === 0) {
    return undefined;
  }
  return (
    readString(record, 'id') ??
    readString(record, 'entryPath') ??
    readString(record, 'cacheKey') ??
    readString(record, 'uri')
  );
}

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function hasRecord(value: unknown): boolean {
  return Object.keys(readRecord(value)).length > 0;
}

function readReadonlyArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function readStringArray(value: unknown): readonly string[] {
  return readReadonlyArray(value).filter((item): item is string => typeof item === 'string');
}

function readString(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readNumber(data: Record<string, unknown>, key: string): number | undefined {
  const value = data[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function formatSeconds(seconds: number): string {
  return Number.isInteger(seconds) ? `${seconds}s` : `${seconds.toFixed(1)}s`;
}

function joinDisplayParts(values: readonly (string | undefined)[]): string {
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(' · ');
}

function uniqueColumnIds(
  columnIds: readonly SceneShotTableColumnId[],
): readonly SceneShotTableColumnId[] {
  return Array.from(new Set(columnIds));
}

function equalNormalizedText(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}
