import type {
  CanvasPlaybackDiagnostic,
  CanvasPlaybackPlan,
  CanvasPlaybackRenderMode,
  CanvasPlaybackRouteCandidate,
  CanvasPlaybackRouteSourceKind,
  CanvasPlaybackUnit,
  CanvasPlaybackUnitKind,
} from './canvas-playback';
import { resolveEffectiveCanvasPlaybackRoutes } from './canvas-playback';
import type { CanvasSerializableRecord, CanvasSerializableValue } from './canvas-serializable';
import type { ResourceRef } from './resource-cache';
import type { StoryboardTextCue, StoryboardVoiceCue } from './storyboard-table';

export const CANVAS_CUT_DRAFT_SCHEMA_VERSION = 1 as const;
export const CANVAS_CUT_DRAFT_KIND = 'canvas-cut-draft' as const;
export const CANVAS_CUT_DRAFT_DEFAULT_EXTENSION_NAMESPACES = ['neko.canvas'] as const;

export type CanvasCutDraftSchemaVersion = typeof CANVAS_CUT_DRAFT_SCHEMA_VERSION;

export type CanvasCutDraftDiagnosticSeverity = 'info' | 'warning' | 'error';

export type CanvasCutDraftDiagnosticCode =
  | 'draft-invalid-root'
  | 'draft-invalid-schema-version'
  | 'draft-stale-source'
  | 'draft-missing-route'
  | 'draft-invalid-route'
  | 'draft-missing-unit'
  | 'draft-missing-media-source'
  | 'draft-invalid-media-reference'
  | 'draft-unmanaged-path'
  | 'draft-invalid-extension-namespace'
  | 'draft-forbidden-extension-field'
  | 'draft-invalid-resource-ref'
  | 'draft-invalid-unit'
  | 'draft-cue-conflict'
  | 'draft-invalid-cue';

export interface CanvasCutDraftDiagnostic {
  readonly code: CanvasCutDraftDiagnosticCode;
  readonly severity: CanvasCutDraftDiagnosticSeverity;
  readonly message: string;
  readonly routeId?: string;
  readonly unitId?: string;
  readonly nodeId?: string;
  readonly path?: readonly (string | number)[];
}

export type CanvasCutDraftSourceRevision = string | number;

export interface CanvasCutDraftSource {
  readonly canvasUri: string;
  readonly revision?: CanvasCutDraftSourceRevision;
  readonly hash?: string;
  readonly resourceProjectionRevision?: CanvasCutDraftSourceRevision;
  readonly createdAt?: string;
}

export interface CanvasCutDraftRoute {
  readonly id: string;
  readonly title: string;
  readonly entryUnitId: string;
  readonly unitIds: readonly string[];
  readonly sourceKind: CanvasPlaybackRouteSourceKind;
  readonly sourceNodeId?: string;
  readonly totalDurationMs?: number;
}

export type CanvasCutDraftMediaRole =
  'source' | 'reference' | 'thumbnail' | 'poster' | 'proxy' | 'generated' | 'unknown';

export interface CanvasCutDraftMediaRef {
  readonly role: CanvasCutDraftMediaRole;
  readonly assetPath?: string;
  readonly resourceRef?: ResourceRef;
  readonly sourceRefId?: string;
  readonly label?: string;
  readonly mimeType?: string;
  readonly metadata?: CanvasSerializableRecord;
}

export type CanvasCutDraftCueKind =
  'dialogue' | 'voiceOver' | 'soundCue' | 'text' | 'caption' | 'narration';

export type CanvasCutDraftCueSource = 'canvas-node' | 'story-projection' | 'agent-projection';

export interface CanvasCutDraftCue {
  readonly id: string;
  readonly kind: CanvasCutDraftCueKind;
  readonly text: string;
  readonly source: CanvasCutDraftCueSource;
  readonly sourceRefId?: string;
  readonly speakerName?: string;
  readonly speakerCharacterId?: string;
  readonly language?: string;
  readonly confidence?: number;
  readonly metadata?: CanvasSerializableRecord;
}

export interface CanvasCutDraftUnitSourceMapping {
  readonly routeId: string;
  readonly canvasUnitId: string;
  readonly canvasNodeId: string;
  readonly canvasUnitKind: CanvasPlaybackUnitKind;
  readonly sceneId?: string;
  readonly shotId?: string;
}

export interface CanvasCutDraftUnit {
  readonly id: string;
  readonly label?: string;
  readonly kind: CanvasPlaybackUnitKind;
  readonly renderMode: CanvasPlaybackRenderMode;
  readonly durationMs?: number;
  readonly sourceMapping: CanvasCutDraftUnitSourceMapping;
  readonly media?: readonly CanvasCutDraftMediaRef[];
  readonly cues?: readonly CanvasCutDraftCue[];
  readonly metadata?: CanvasSerializableRecord;
  readonly diagnostics?: readonly CanvasCutDraftDiagnostic[];
}

export type CanvasCutDraftExtensions = Readonly<Record<string, CanvasSerializableRecord>>;

export interface CanvasCutDraftPayload {
  readonly kind: typeof CANVAS_CUT_DRAFT_KIND;
  readonly schemaVersion: CanvasCutDraftSchemaVersion;
  readonly source: CanvasCutDraftSource;
  readonly route: CanvasCutDraftRoute;
  readonly projectName: string;
  readonly units: readonly CanvasCutDraftUnit[];
  readonly diagnostics?: readonly CanvasCutDraftDiagnostic[];
  readonly extensions?: CanvasCutDraftExtensions;
}

export interface ValidateCanvasCutDraftPayloadOptions {
  readonly currentSourceRevision?: CanvasCutDraftSourceRevision;
  readonly allowedExtensionNamespaces?: readonly string[];
  readonly requireMediaSource?: boolean;
  readonly allowAbsoluteAssetPaths?: boolean;
}

export interface CanvasCutDraftValidationResult {
  readonly valid: boolean;
  readonly payload?: CanvasCutDraftPayload;
  readonly diagnostics: readonly CanvasCutDraftDiagnostic[];
}

export interface CreateCanvasCutDraftPayloadInput {
  readonly plan: CanvasPlaybackPlan;
  readonly sourceCanvasUri: string;
  readonly sourceRevision?: CanvasCutDraftSourceRevision;
  readonly sourceHash?: string;
  readonly currentSourceRevision?: CanvasCutDraftSourceRevision;
  readonly resourceProjectionRevision?: CanvasCutDraftSourceRevision;
  readonly routeId?: string;
  readonly projectName?: string;
  readonly createdAt?: string;
  readonly extensions?: CanvasCutDraftExtensions;
  readonly allowedExtensionNamespaces?: readonly string[];
  readonly requireMediaSource?: boolean;
  readonly allowAbsoluteAssetPaths?: boolean;
}

export type CanvasCutDraftProjectionResult =
  | {
      readonly ok: true;
      readonly payload: CanvasCutDraftPayload;
      readonly diagnostics: readonly CanvasCutDraftDiagnostic[];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly CanvasCutDraftDiagnostic[];
    };

export function projectCanvasPlaybackRouteToCutDraft(
  input: CreateCanvasCutDraftPayloadInput,
): CanvasCutDraftProjectionResult {
  const diagnostics: CanvasCutDraftDiagnostic[] = [];
  const effectiveRoutes = resolveEffectiveCanvasPlaybackRoutes(input.plan);
  diagnostics.push(...fromPlaybackDiagnostics(effectiveRoutes.diagnostics));

  const selectedRoute = selectPlaybackRoute(effectiveRoutes.routes, input.routeId);
  if (!selectedRoute) {
    return {
      ok: false,
      diagnostics: [
        ...diagnostics,
        diagnostic(
          'draft-missing-route',
          'error',
          input.routeId
            ? `Canvas playback route "${input.routeId}" is not available.`
            : 'Canvas playback plan has no route that can be projected to Cut.',
          { routeId: input.routeId },
        ),
      ],
    };
  }

  if (
    input.currentSourceRevision !== undefined &&
    input.sourceRevision !== undefined &&
    input.currentSourceRevision !== input.sourceRevision
  ) {
    return {
      ok: false,
      diagnostics: [
        ...diagnostics,
        diagnostic(
          'draft-stale-source',
          'error',
          `Canvas draft source revision "${input.sourceRevision}" is stale; current revision is "${input.currentSourceRevision}".`,
          { routeId: selectedRoute.id },
        ),
      ],
    };
  }

  const unitById = new Map(input.plan.units.map((unit) => [unit.id, unit]));
  const units = selectedRoute.unitIds.flatMap((unitId): CanvasCutDraftUnit[] => {
    const unit = unitById.get(unitId);
    if (!unit) {
      diagnostics.push(
        diagnostic(
          'draft-missing-unit',
          'error',
          `Canvas playback route "${selectedRoute.id}" references missing unit "${unitId}".`,
          { routeId: selectedRoute.id, unitId },
        ),
      );
      return [];
    }
    return [projectPlaybackUnitToDraftUnit(unit, selectedRoute, diagnostics)];
  });

  const payload: CanvasCutDraftPayload = {
    kind: CANVAS_CUT_DRAFT_KIND,
    schemaVersion: CANVAS_CUT_DRAFT_SCHEMA_VERSION,
    source: {
      canvasUri: input.sourceCanvasUri,
      ...(input.sourceRevision !== undefined ? { revision: input.sourceRevision } : {}),
      ...(input.sourceHash ? { hash: input.sourceHash } : {}),
      ...(input.resourceProjectionRevision !== undefined
        ? { resourceProjectionRevision: input.resourceProjectionRevision }
        : {}),
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    },
    route: toDraftRoute(selectedRoute),
    projectName: input.projectName ?? selectedRoute.title,
    units,
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
    ...(input.extensions ? { extensions: input.extensions } : {}),
  };

  const validation = validateCanvasCutDraftPayload(payload, {
    currentSourceRevision: input.currentSourceRevision,
    allowedExtensionNamespaces: input.allowedExtensionNamespaces,
    requireMediaSource: input.requireMediaSource,
    allowAbsoluteAssetPaths: input.allowAbsoluteAssetPaths,
  });
  const combinedDiagnostics = [...diagnostics, ...validation.diagnostics];
  if (!validation.valid || combinedDiagnostics.some((item) => item.severity === 'error')) {
    return { ok: false, diagnostics: dedupeDiagnostics(combinedDiagnostics) };
  }
  return { ok: true, payload, diagnostics: dedupeDiagnostics(combinedDiagnostics) };
}

export function validateCanvasCutDraftPayload(
  value: unknown,
  options: ValidateCanvasCutDraftPayloadOptions = {},
): CanvasCutDraftValidationResult {
  const diagnostics: CanvasCutDraftDiagnostic[] = [];
  if (!isRecord(value)) {
    return {
      valid: false,
      diagnostics: [
        diagnostic('draft-invalid-root', 'error', 'CanvasCutDraftPayload must be an object.'),
      ],
    };
  }

  if (value['kind'] !== CANVAS_CUT_DRAFT_KIND) {
    diagnostics.push(
      diagnostic('draft-invalid-root', 'error', 'CanvasCutDraftPayload kind is invalid.', {
        path: ['kind'],
      }),
    );
  }
  if (value['schemaVersion'] !== CANVAS_CUT_DRAFT_SCHEMA_VERSION) {
    diagnostics.push(
      diagnostic(
        'draft-invalid-schema-version',
        'error',
        `CanvasCutDraftPayload schemaVersion must be ${CANVAS_CUT_DRAFT_SCHEMA_VERSION}.`,
        { path: ['schemaVersion'] },
      ),
    );
  }

  validateSource(value['source'], options, diagnostics);
  validateRoute(value['route'], diagnostics);
  validateDraftUnits(value['units'], options, diagnostics);
  validateExtensions(value['extensions'], options, diagnostics);
  validateSerializableRecord(value['extensions'], ['extensions'], diagnostics);
  validateNoRuntimeValues(value['diagnostics'], ['diagnostics'], diagnostics);

  const valid = diagnostics.every((item) => item.severity !== 'error');
  return {
    valid,
    ...(valid ? { payload: value as unknown as CanvasCutDraftPayload } : {}),
    diagnostics: dedupeDiagnostics(diagnostics),
  };
}

export function isCanvasCutDraftPayload(value: unknown): value is CanvasCutDraftPayload {
  return validateCanvasCutDraftPayload(value).valid;
}

export function assertCanvasCutDraftPayload(
  value: unknown,
  options: ValidateCanvasCutDraftPayloadOptions = {},
): asserts value is CanvasCutDraftPayload {
  const validation = validateCanvasCutDraftPayload(value, options);
  if (!validation.valid) {
    throw new Error(
      `Invalid CanvasCutDraftPayload: ${validation.diagnostics
        .map((item) => item.message)
        .join('; ')}`,
    );
  }
}

function projectPlaybackUnitToDraftUnit(
  unit: CanvasPlaybackUnit,
  route: CanvasPlaybackRouteCandidate,
  diagnostics: CanvasCutDraftDiagnostic[],
): CanvasCutDraftUnit {
  const metadata = unit.metadata ? copySerializableRecord(unit.metadata) : undefined;
  const cues = collectDraftCues(unit, diagnostics);
  const media = collectDraftMedia(unit);
  return {
    id: unit.id,
    ...(unit.label ? { label: unit.label } : {}),
    kind: unit.kind,
    renderMode: unit.renderMode,
    ...(unit.durationMs !== undefined ? { durationMs: unit.durationMs } : {}),
    sourceMapping: {
      routeId: route.id,
      canvasUnitId: unit.id,
      canvasNodeId: unit.sourceNodeId,
      canvasUnitKind: unit.kind,
      ...readSourceMapping(metadata, unit),
    },
    ...(media.length > 0 ? { media } : {}),
    ...(cues.length > 0 ? { cues } : {}),
    ...(metadata && Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
}

function collectDraftMedia(unit: CanvasPlaybackUnit): readonly CanvasCutDraftMediaRef[] {
  const media: CanvasCutDraftMediaRef[] = [];
  if (unit.assetPath || unit.resourceRef) {
    media.push({
      role: 'source',
      ...(unit.assetPath ? { assetPath: unit.assetPath } : {}),
      ...(unit.resourceRef ? { resourceRef: unit.resourceRef } : {}),
    });
  }
  const metadata = unit.metadata;
  const storyboardMediaRefs = readSerializableArray(metadata?.['mediaRefs']);
  for (const item of storyboardMediaRefs) {
    const refId = readString(item['refId']);
    media.push({
      role: readMediaRole(item['role']),
      ...(refId ? { sourceRefId: refId } : {}),
      ...(readString(item['label']) ? { label: readString(item['label']) } : {}),
      ...(readString(item['mimeType']) ? { mimeType: readString(item['mimeType']) } : {}),
      metadata: copySerializableRecord(item),
    });
  }
  return media;
}

function collectDraftCues(
  unit: Pick<CanvasPlaybackUnit, 'id' | 'sourceNodeId' | 'metadata'>,
  diagnostics: CanvasCutDraftDiagnostic[],
): readonly CanvasCutDraftCue[] {
  const metadata = unit.metadata;
  if (!metadata) return [];
  const cues: CanvasCutDraftCue[] = [];
  const dialogue = readString(metadata['dialogue']);
  const voiceOver = readString(metadata['voiceOver']);
  const soundCue = readString(metadata['soundCue']);

  if (dialogue) {
    cues.push({
      id: `${unit.id}:dialogue`,
      kind: 'dialogue',
      text: dialogue,
      source: 'canvas-node',
    });
  }
  if (voiceOver) {
    cues.push({
      id: `${unit.id}:voiceOver`,
      kind: 'voiceOver',
      text: voiceOver,
      source: 'canvas-node',
    });
  }
  if (soundCue) {
    cues.push({
      id: `${unit.id}:soundCue`,
      kind: 'soundCue',
      text: soundCue,
      source: 'canvas-node',
    });
  }

  const textCues = readTextCues(metadata['textCues']);
  const voiceCues = readVoiceCues(metadata['voiceCues']);
  cues.push(...textCues.map((cue) => fromTextCue(unit.id, cue)));
  cues.push(...voiceCues.map((cue) => fromVoiceCue(unit.id, cue)));

  detectCueConflict(unit, 'dialogue', dialogue, cues, diagnostics);
  detectCueConflict(unit, 'voiceOver', voiceOver, cues, diagnostics);

  return cues;
}

function detectCueConflict(
  unit: Pick<CanvasPlaybackUnit, 'id' | 'sourceNodeId'>,
  kind: 'dialogue' | 'voiceOver',
  simpleText: string | undefined,
  cues: readonly CanvasCutDraftCue[],
  diagnostics: CanvasCutDraftDiagnostic[],
): void {
  if (!simpleText) return;
  const conflictingCue = cues.find(
    (cue) =>
      cue.source !== 'canvas-node' &&
      cue.kind === kind &&
      normalizeCueText(cue.text) !== normalizeCueText(simpleText),
  );
  if (!conflictingCue) return;
  diagnostics.push(
    diagnostic(
      'draft-cue-conflict',
      'error',
      `Canvas cue "${kind}" on unit "${unit.id}" conflicts with projected cue "${conflictingCue.id}".`,
      { unitId: unit.id, nodeId: unit.sourceNodeId },
    ),
  );
}

function fromTextCue(unitId: string, cue: StoryboardTextCue): CanvasCutDraftCue {
  const cueKind: CanvasCutDraftCueKind =
    cue.kind === 'dialogue' || cue.kind === 'caption' || cue.kind === 'narration'
      ? cue.kind
      : 'text';
  return {
    id: `${unitId}:text:${cue.cueId}`,
    kind: cueKind,
    text: cue.text,
    source: 'story-projection',
    ...(cue.sourceRefId ? { sourceRefId: cue.sourceRefId } : {}),
    ...(cue.speakerName ? { speakerName: cue.speakerName } : {}),
    ...(cue.speakerCharacterId ? { speakerCharacterId: cue.speakerCharacterId } : {}),
    ...(cue.language ? { language: cue.language } : {}),
    ...(cue.confidence !== undefined ? { confidence: cue.confidence } : {}),
  };
}

function fromVoiceCue(unitId: string, cue: StoryboardVoiceCue): CanvasCutDraftCue {
  return {
    id: `${unitId}:voice:${cue.cueId}`,
    kind: cue.kind,
    text: cue.text,
    source: 'story-projection',
    ...(cue.sourceRefId ? { sourceRefId: cue.sourceRefId } : {}),
    ...(cue.speakerName ? { speakerName: cue.speakerName } : {}),
    ...(cue.speakerCharacterId ? { speakerCharacterId: cue.speakerCharacterId } : {}),
    ...(cue.voiceAssetId ? { metadata: { voiceAssetId: cue.voiceAssetId } } : {}),
  };
}

function readTextCues(value: CanvasSerializableValue | undefined): readonly StoryboardTextCue[] {
  return readSerializableArray(value).flatMap((item): StoryboardTextCue[] => {
    const cueId = readString(item['cueId']);
    const kind = readString(item['kind']);
    const text = readString(item['text']);
    if (!cueId || !isTextCueKind(kind) || !text) return [];
    return [
      {
        cueId,
        kind,
        text,
        ...(readString(item['sourceRefId'])
          ? { sourceRefId: readString(item['sourceRefId']) }
          : {}),
        ...(readString(item['speakerName'])
          ? { speakerName: readString(item['speakerName']) }
          : {}),
        ...(readString(item['speakerCharacterId'])
          ? { speakerCharacterId: readString(item['speakerCharacterId']) }
          : {}),
        ...(readString(item['language']) ? { language: readString(item['language']) } : {}),
        ...(typeof item['confidence'] === 'number' ? { confidence: item['confidence'] } : {}),
      },
    ];
  });
}

function readVoiceCues(value: CanvasSerializableValue | undefined): readonly StoryboardVoiceCue[] {
  return readSerializableArray(value).flatMap((item): StoryboardVoiceCue[] => {
    const cueId = readString(item['cueId']);
    const kind = readString(item['kind']);
    const text = readString(item['text']);
    if (!cueId || !isVoiceCueKind(kind) || !text) return [];
    return [
      {
        cueId,
        kind,
        text,
        ...(readString(item['sourceRefId'])
          ? { sourceRefId: readString(item['sourceRefId']) }
          : {}),
        ...(readString(item['speakerName'])
          ? { speakerName: readString(item['speakerName']) }
          : {}),
        ...(readString(item['speakerCharacterId'])
          ? { speakerCharacterId: readString(item['speakerCharacterId']) }
          : {}),
        ...(readString(item['voiceAssetId'])
          ? { voiceAssetId: readString(item['voiceAssetId']) }
          : {}),
      },
    ];
  });
}

function readSourceMapping(
  metadata: CanvasSerializableRecord | undefined,
  unit: Pick<CanvasPlaybackUnit, 'kind' | 'sourceNodeId'>,
): Pick<CanvasCutDraftUnitSourceMapping, 'sceneId' | 'shotId'> {
  const sceneId = readString(metadata?.['sceneId']);
  const shotId =
    readString(metadata?.['shotId']) ?? (unit.kind === 'shot' ? unit.sourceNodeId : undefined);
  return {
    ...(sceneId ? { sceneId } : {}),
    ...(shotId ? { shotId } : {}),
  };
}

function validateSource(
  value: unknown,
  options: ValidateCanvasCutDraftPayloadOptions,
  diagnostics: CanvasCutDraftDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic('draft-invalid-root', 'error', 'CanvasCutDraftPayload source must be an object.', {
        path: ['source'],
      }),
    );
    return;
  }
  if (!readString(value['canvasUri'])) {
    diagnostics.push(
      diagnostic(
        'draft-invalid-root',
        'error',
        'CanvasCutDraftPayload source.canvasUri is required.',
        {
          path: ['source', 'canvasUri'],
        },
      ),
    );
  }
  const revision = value['revision'];
  if (
    revision !== undefined &&
    options.currentSourceRevision !== undefined &&
    revision !== options.currentSourceRevision
  ) {
    diagnostics.push(
      diagnostic(
        'draft-stale-source',
        'error',
        `Canvas draft source revision "${String(revision)}" is stale; current revision is "${String(
          options.currentSourceRevision,
        )}".`,
        { path: ['source', 'revision'] },
      ),
    );
  }
}

function validateRoute(value: unknown, diagnostics: CanvasCutDraftDiagnostic[]): void {
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic('draft-invalid-route', 'error', 'CanvasCutDraftPayload route must be an object.', {
        path: ['route'],
      }),
    );
    return;
  }
  const routeId = readString(value['id']);
  if (!routeId) {
    diagnostics.push(
      diagnostic('draft-invalid-route', 'error', 'CanvasCutDraftPayload route.id is required.', {
        path: ['route', 'id'],
      }),
    );
  }
  if (!Array.isArray(value['unitIds']) || value['unitIds'].length === 0) {
    diagnostics.push(
      diagnostic(
        'draft-invalid-route',
        'error',
        'CanvasCutDraftPayload route.unitIds must contain at least one unit id.',
        { routeId, path: ['route', 'unitIds'] },
      ),
    );
  }
}

function validateDraftUnits(
  value: unknown,
  options: ValidateCanvasCutDraftPayloadOptions,
  diagnostics: CanvasCutDraftDiagnostic[],
): void {
  if (!Array.isArray(value) || value.length === 0) {
    diagnostics.push(
      diagnostic(
        'draft-invalid-unit',
        'error',
        'CanvasCutDraftPayload units must contain at least one unit.',
        { path: ['units'] },
      ),
    );
    return;
  }

  for (const [index, unit] of value.entries()) {
    if (!isRecord(unit)) {
      diagnostics.push(
        diagnostic('draft-invalid-unit', 'error', 'CanvasCutDraftPayload unit must be an object.', {
          path: ['units', index],
        }),
      );
      continue;
    }
    const unitId = readString(unit['id']);
    if (!unitId) {
      diagnostics.push(
        diagnostic('draft-invalid-unit', 'error', 'CanvasCutDraftPayload unit.id is required.', {
          path: ['units', index, 'id'],
        }),
      );
    }
    validateSourceMapping(unit['sourceMapping'], index, unitId, diagnostics);
    validateMediaRefs(unit['media'], options, diagnostics, ['units', index, 'media'], unitId);
    validateCues(unit['cues'], diagnostics, ['units', index, 'cues'], unitId);
    validateNoRuntimeValues(unit['metadata'], ['units', index, 'metadata'], diagnostics, unitId);
  }
}

function validateSourceMapping(
  value: unknown,
  index: number,
  unitId: string | undefined,
  diagnostics: CanvasCutDraftDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic(
        'draft-invalid-unit',
        'error',
        'CanvasCutDraftPayload unit sourceMapping is required.',
        {
          unitId,
          path: ['units', index, 'sourceMapping'],
        },
      ),
    );
    return;
  }
  if (!readString(value['canvasNodeId'])) {
    diagnostics.push(
      diagnostic(
        'draft-invalid-unit',
        'error',
        'CanvasCutDraftPayload unit sourceMapping.canvasNodeId is required.',
        { unitId, path: ['units', index, 'sourceMapping', 'canvasNodeId'] },
      ),
    );
  }
}

function validateMediaRefs(
  value: unknown,
  options: ValidateCanvasCutDraftPayloadOptions,
  diagnostics: CanvasCutDraftDiagnostic[],
  path: readonly (string | number)[],
  unitId: string | undefined,
): void {
  if (value === undefined) {
    if (options.requireMediaSource) {
      diagnostics.push(
        diagnostic('draft-missing-media-source', 'error', 'Draft unit is missing media source.', {
          unitId,
          path,
        }),
      );
    }
    return;
  }
  if (!Array.isArray(value)) {
    diagnostics.push(
      diagnostic('draft-invalid-media-reference', 'error', 'Draft unit media must be an array.', {
        unitId,
        path,
      }),
    );
    return;
  }
  if (options.requireMediaSource && value.length === 0) {
    diagnostics.push(
      diagnostic('draft-missing-media-source', 'error', 'Draft unit is missing media source.', {
        unitId,
        path,
      }),
    );
  }
  for (const [index, media] of value.entries()) {
    const mediaPath = [...path, index] as const;
    if (!isRecord(media)) {
      diagnostics.push(
        diagnostic(
          'draft-invalid-media-reference',
          'error',
          'Draft media reference must be an object.',
          {
            unitId,
            path: mediaPath,
          },
        ),
      );
      continue;
    }
    const assetPath = readString(media['assetPath']);
    if (assetPath) validateAssetPath(assetPath, options, diagnostics, mediaPath, unitId);
    if (media['resourceRef'] !== undefined && !isResourceRef(media['resourceRef'])) {
      diagnostics.push(
        diagnostic('draft-invalid-resource-ref', 'error', 'Draft media resourceRef is invalid.', {
          unitId,
          path: [...mediaPath, 'resourceRef'],
        }),
      );
    }
    if (
      !assetPath &&
      media['resourceRef'] === undefined &&
      readString(media['sourceRefId']) === undefined
    ) {
      diagnostics.push(
        diagnostic(
          'draft-missing-media-source',
          'warning',
          'Draft media reference has no durable source.',
          {
            unitId,
            path: mediaPath,
          },
        ),
      );
    }
    validateNoRuntimeValues(media['metadata'], [...mediaPath, 'metadata'], diagnostics, unitId);
  }
}

function validateCues(
  value: unknown,
  diagnostics: CanvasCutDraftDiagnostic[],
  path: readonly (string | number)[],
  unitId: string | undefined,
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    diagnostics.push(
      diagnostic('draft-invalid-cue', 'error', 'Draft unit cues must be an array.', {
        unitId,
        path,
      }),
    );
    return;
  }
  for (const [index, cue] of value.entries()) {
    if (!isRecord(cue) || !readString(cue['id']) || !readString(cue['text'])) {
      diagnostics.push(
        diagnostic('draft-invalid-cue', 'error', 'Draft cue needs id and text.', {
          unitId,
          path: [...path, index],
        }),
      );
    }
  }
}

function validateExtensions(
  value: unknown,
  options: Pick<ValidateCanvasCutDraftPayloadOptions, 'allowedExtensionNamespaces'>,
  diagnostics: CanvasCutDraftDiagnostic[],
): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic(
        'draft-invalid-extension-namespace',
        'error',
        'Draft extensions must be an object.',
        {
          path: ['extensions'],
        },
      ),
    );
    return;
  }
  const allowed = new Set(
    options.allowedExtensionNamespaces ?? CANVAS_CUT_DRAFT_DEFAULT_EXTENSION_NAMESPACES,
  );
  for (const [namespace, extensionValue] of Object.entries(value)) {
    if (!isValidNekoExtensionNamespace(namespace) || !allowed.has(namespace)) {
      diagnostics.push(
        diagnostic(
          'draft-invalid-extension-namespace',
          'error',
          `Draft extension namespace "${namespace}" is not allowed.`,
          { path: ['extensions', namespace] },
        ),
      );
      continue;
    }
    validateForbiddenExtensionFields(extensionValue, ['extensions', namespace], diagnostics);
    validateNoRuntimeValues(extensionValue, ['extensions', namespace], diagnostics);
  }
}

function validateForbiddenExtensionFields(
  value: unknown,
  path: readonly (string | number)[],
  diagnostics: CanvasCutDraftDiagnostic[],
): void {
  if (!isRecord(value) && !Array.isArray(value)) return;
  const entries = Array.isArray(value) ? value.entries() : Object.entries(value);
  for (const [key, item] of entries) {
    const segment = key.toString();
    const itemPath = [...path, Array.isArray(value) ? Number(key) : segment] as const;
    if (!Array.isArray(value) && isForbiddenExtensionField(segment)) {
      diagnostics.push(
        diagnostic(
          'draft-forbidden-extension-field',
          'error',
          `Draft extension field "${segment}" must be represented by an owning-domain contract field.`,
          { path: itemPath },
        ),
      );
    }
    validateForbiddenExtensionFields(item, itemPath, diagnostics);
  }
}

function validateNoRuntimeValues(
  value: unknown,
  path: readonly (string | number)[],
  diagnostics: CanvasCutDraftDiagnostic[],
  unitId?: string,
): void {
  if (value === undefined) return;
  if (typeof value === 'string') {
    if (isRuntimeMediaValue(value)) {
      diagnostics.push(
        diagnostic(
          'draft-invalid-media-reference',
          'error',
          'Draft payload contains a runtime media value.',
          {
            unitId,
            path,
          },
        ),
      );
    }
    return;
  }
  if (!isRecord(value) && !Array.isArray(value)) return;
  const entries = Array.isArray(value) ? value.entries() : Object.entries(value);
  for (const [key, item] of entries) {
    const segment = key.toString();
    const itemPath = [...path, Array.isArray(value) ? Number(key) : segment] as const;
    if (!Array.isArray(value) && isRuntimeFieldName(segment)) {
      diagnostics.push(
        diagnostic(
          'draft-invalid-media-reference',
          'error',
          `Draft payload contains runtime field "${segment}".`,
          {
            unitId,
            path: itemPath,
          },
        ),
      );
    }
    validateNoRuntimeValues(item, itemPath, diagnostics, unitId);
  }
}

function validateSerializableRecord(
  value: unknown,
  path: readonly (string | number)[],
  diagnostics: CanvasCutDraftDiagnostic[],
): void {
  if (value === undefined) return;
  if (!isSerializableValue(value)) {
    diagnostics.push(
      diagnostic('draft-invalid-root', 'error', 'Draft payload contains non-serializable data.', {
        path,
      }),
    );
  }
}

function validateAssetPath(
  assetPath: string,
  options: Pick<ValidateCanvasCutDraftPayloadOptions, 'allowAbsoluteAssetPaths'>,
  diagnostics: CanvasCutDraftDiagnostic[],
  path: readonly (string | number)[],
  unitId: string | undefined,
): void {
  if (isRuntimeMediaValue(assetPath)) {
    diagnostics.push(
      diagnostic(
        'draft-invalid-media-reference',
        'error',
        'Draft assetPath must not be a runtime URI.',
        {
          unitId,
          path: [...path, 'assetPath'],
        },
      ),
    );
    return;
  }
  if (!options.allowAbsoluteAssetPaths && isAbsoluteHostPath(assetPath)) {
    diagnostics.push(
      diagnostic(
        'draft-unmanaged-path',
        'error',
        'Draft assetPath must be project-relative, variable-based, or a ResourceRef.',
        { unitId, path: [...path, 'assetPath'] },
      ),
    );
  }
}

function toDraftRoute(route: CanvasPlaybackRouteCandidate): CanvasCutDraftRoute {
  return {
    id: route.id,
    title: route.title,
    entryUnitId: route.entryUnitId,
    unitIds: route.unitIds,
    sourceKind: route.sourceKind,
    ...(route.sourceNodeId ? { sourceNodeId: route.sourceNodeId } : {}),
    ...(route.totalDurationMs !== undefined ? { totalDurationMs: route.totalDurationMs } : {}),
  };
}

function selectPlaybackRoute(
  routes: readonly CanvasPlaybackRouteCandidate[],
  routeId: string | undefined,
): CanvasPlaybackRouteCandidate | undefined {
  if (routeId) return routes.find((route) => route.id === routeId);
  return routes[0];
}

function fromPlaybackDiagnostics(
  diagnostics: readonly CanvasPlaybackDiagnostic[],
): readonly CanvasCutDraftDiagnostic[] {
  return diagnostics.map((item) =>
    diagnostic(
      item.code === 'playback-missing-route' ? 'draft-missing-route' : 'draft-invalid-route',
      item.severity,
      item.message,
      { nodeId: item.nodeId },
    ),
  );
}

function copySerializableRecord(value: CanvasSerializableRecord): CanvasSerializableRecord {
  const output: Record<string, CanvasSerializableValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (isSerializableValue(item)) output[key] = item;
  }
  return output;
}

function readSerializableArray(
  value: CanvasSerializableValue | undefined,
): readonly CanvasSerializableRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is CanvasSerializableRecord => isRecord(item))
    : [];
}

function readMediaRole(value: unknown): CanvasCutDraftMediaRole {
  return value === 'source' ||
    value === 'reference' ||
    value === 'thumbnail' ||
    value === 'poster' ||
    value === 'proxy' ||
    value === 'generated'
    ? value
    : 'unknown';
}

function isTextCueKind(value: string | undefined): value is StoryboardTextCue['kind'] {
  return value === 'dialogue' || value === 'narration' || value === 'caption' || value === 'ocr';
}

function isVoiceCueKind(value: string | undefined): value is StoryboardVoiceCue['kind'] {
  return value === 'dialogue' || value === 'voiceOver';
}

function normalizeCueText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function isValidNekoExtensionNamespace(value: string): boolean {
  return /^neko\.[a-z][a-z0-9-]*$/.test(value);
}

function isForbiddenExtensionField(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized.includes('timeline') ||
    normalized.includes('track') ||
    normalized.includes('clip') ||
    normalized.includes('effect') ||
    normalized.includes('subtitle') ||
    normalized.includes('audio') ||
    normalized.includes('export') ||
    normalized.includes('approval') ||
    normalized.includes('authorization') ||
    normalized === 'auth' ||
    normalized.endsWith('auth') ||
    normalized.includes('token') ||
    normalized.includes('webview') ||
    normalized.includes('runtime') ||
    normalized.endsWith('path') ||
    normalized.endsWith('uri') ||
    normalized.endsWith('url') ||
    normalized.endsWith('handle') ||
    normalized === 'order' ||
    normalized.endsWith('order') ||
    normalized.includes('ordering')
  );
}

function isRuntimeFieldName(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized.startsWith('runtime') ||
    normalized.includes('webview') ||
    normalized.endsWith('token') ||
    normalized.endsWith('handle') ||
    normalized === 'previewurl' ||
    normalized === 'previewuri'
  );
}

function isRuntimeMediaValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.startsWith('blob:') ||
    normalized.startsWith('data:') ||
    normalized.startsWith('vscode-webview-resource:') ||
    normalized.startsWith('vscode-resource:') ||
    normalized.startsWith('webview:') ||
    normalized.startsWith('vscode://') ||
    normalized.includes('vscode-resource.vscode-cdn.net')
  );
}

function isAbsoluteHostPath(value: string): boolean {
  return value.startsWith('/') || value.startsWith('\\\\') || /^[A-Za-z]:[\\/]/.test(value);
}

function isResourceRef(value: unknown): value is ResourceRef {
  return (
    isRecord(value) &&
    readString(value['id']) !== undefined &&
    readString(value['provider']) !== undefined &&
    readString(value['scope']) !== undefined &&
    readString(value['kind']) !== undefined &&
    isRecord(value['source']) &&
    isRecord(value['fingerprint'])
  );
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function isRecord(
  value: unknown,
): value is CanvasSerializableRecord & Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSerializableValue(value: unknown): value is CanvasSerializableValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return typeof value !== 'number' || Number.isFinite(value);
  }
  if (Array.isArray(value)) return value.every(isSerializableValue);
  if (!isRecord(value)) return false;
  return Object.values(value).every(isSerializableValue);
}

function diagnostic(
  code: CanvasCutDraftDiagnosticCode,
  severity: CanvasCutDraftDiagnosticSeverity,
  message: string,
  details: Omit<CanvasCutDraftDiagnostic, 'code' | 'severity' | 'message'> = {},
): CanvasCutDraftDiagnostic {
  return { code, severity, message, ...details };
}

function dedupeDiagnostics(
  diagnostics: readonly CanvasCutDraftDiagnostic[],
): readonly CanvasCutDraftDiagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((item) => {
    const key = JSON.stringify([
      item.code,
      item.severity,
      item.message,
      item.routeId,
      item.unitId,
      item.nodeId,
      item.path,
    ]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
