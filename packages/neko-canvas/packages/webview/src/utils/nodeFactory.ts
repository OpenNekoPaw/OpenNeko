import type {
  CanvasNodeType,
  CanvasSerializableRecord,
  CanvasSerializableValue,
  CanvasStoryboardPromptState,
  BatchExecutionPlan,
  ComicAnimationDiagnostic,
  GalleryPreset,
  GeneratedImage,
  GeneratedImageVersion,
  GeneratedVideo,
  PortDefinition,
  RegisteredCanvasNode,
  RegisteredCanvasNodeType,
  ScriptScene,
  ShotCharacter,
  ShotCharacterCandidate,
  ShotImagePrepPlan,
  StoryboardMediaRef,
  StoryboardTextCue,
  StoryboardVoiceCue,
  TableColumnDef,
  VisualOccurrence,
} from '@neko/shared';
import {
  GALLERY_PRESET_CONFIGS,
  REGISTERED_CANVAS_NODE_TYPES,
  getBuiltInCanvasNodePresetMetadata,
  getDefaultCanvasNodePresetName,
  isDocumentArchiveResourceRef,
  isCanvasStoryboardPromptState,
  isResourceRef,
  parseDocumentResourceStatus,
} from '@neko/shared';
import {
  applyCanvasNodePreset,
  createBuiltInCanvasNodePresetRegistry,
  getCanvasNodePreset,
} from './canvasPresetRegistry';
import type { CanvasNodeDraft } from './canvasPresetRegistry';
import { createBuiltInNodeTypeDescriptors } from '../components/nodes/nodeTypeDescriptors';

const NODE_PRESETS = createBuiltInCanvasNodePresetRegistry();

interface BuildCanvasNodeOptions {
  type: CanvasNodeType;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  zIndex: number;
  preset?: string;
}

type NodeDefaultSize = { width: number; height: number };

export const NODE_DEFAULT_SIZES: Partial<Record<CanvasNodeType, NodeDefaultSize>> =
  Object.fromEntries(
    Object.entries(createBuiltInNodeTypeDescriptors()).map(([type, descriptor]) => [
      type,
      descriptor.defaultSize,
    ]),
  ) as Partial<Record<CanvasNodeType, NodeDefaultSize>>;

const DEFAULT_EMPTY_HISTORY: GeneratedImageVersion[] = [];
const DEFAULT_EMPTY_CHARACTERS: ShotCharacter[] = [];
const DEFAULT_EMPTY_TEXT_CUES: StoryboardTextCue[] = [];
const DEFAULT_EMPTY_VOICE_CUES: StoryboardVoiceCue[] = [];
const DEFAULT_EMPTY_MEDIA_REFS: StoryboardMediaRef[] = [];
const DEFAULT_EMPTY_VISUAL_OCCURRENCES: VisualOccurrence[] = [];
const DEFAULT_EMPTY_CHARACTER_CANDIDATES: ShotCharacterCandidate[] = [];
const DEFAULT_EMPTY_COMIC_DIAGNOSTICS: ComicAnimationDiagnostic[] = [];
const DEFAULT_EMPTY_SCENES: ScriptScene[] = [];
const DEFAULT_EMPTY_PORTS: PortDefinition[] = [];
const REGISTERED_NODE_DEFAULT_DATA: Partial<
  Record<RegisteredCanvasNodeType, CanvasSerializableRecord>
> = {
  'narrative-start': { label: 'Start', description: '' },
  choice: { choices: [] },
  merge: {},
  'narrative-scene': { summary: '' },
  'narrative-note': { content: '' },
  'narrative-ending': { endingType: 'normal', endingLabel: 'Ending', statisticsSummary: true },
  state: {},
  trigger: { event: '' },
  action: {},
  condition: { expression: '' },
  composite: {},
  entity: { entityType: 'character' },
  'representation-slot': { required: false },
  occurrence: {},
  'generated-asset': { assetId: '' },
  memory: { content: '' },
  conversation: {},
  fact: { statement: '' },
};

const REGISTERED_NODE_TYPES = new Set<string>(REGISTERED_CANVAS_NODE_TYPES);

function asString(value: unknown, defaultValue = ''): string {
  return typeof value === 'string' ? value : defaultValue;
}

function asNumber(value: unknown, defaultValue: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : defaultValue;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function asObjectArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function isGeneratedImage(value: unknown): value is GeneratedImage {
  return isRecord(value) && value.type === 'generated-image';
}

function isGeneratedVideo(value: unknown): value is GeneratedVideo {
  return isRecord(value) && value.type === 'generated-video';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function inferDocumentType(value: unknown): 'pdf' | 'docx' | 'epub' | 'cbz' | 'file' {
  if (
    value === 'pdf' ||
    value === 'docx' ||
    value === 'epub' ||
    value === 'cbz' ||
    value === 'file'
  ) {
    return value;
  }
  return 'file';
}

function inferMediaType(value: unknown): 'image' | 'video' | 'audio' {
  return value === 'video' || value === 'audio' ? value : 'image';
}

function inferModelType(value: unknown): 'lora' | 'checkpoint' | 'controlnet' | 'vae' {
  if (value === 'lora' || value === 'checkpoint' || value === 'controlnet' || value === 'vae') {
    return value;
  }
  return 'lora';
}

function inferModelRole(value: unknown): 'reference' | 'workflow' {
  return value === 'workflow' ? 'workflow' : 'reference';
}

function inferProjectType(value: unknown): 'nkv' | 'nka' | 'nkm' | 'nkp' {
  if (value === 'nkv' || value === 'nka' || value === 'nkm' || value === 'nkp') {
    return value;
  }
  return 'nkv';
}

function inferGalleryPreset(value: unknown): GalleryPreset {
  if (
    value === 'character-3view' ||
    value === 'character-4view' ||
    value === 'expression-9' ||
    value === 'turnaround-8' ||
    value === 'scene-views' ||
    value === 'custom'
  ) {
    return value;
  }
  return 'character-3view';
}

function getNodeDefaultSize(type: CanvasNodeType): NodeDefaultSize {
  return NODE_DEFAULT_SIZES[type] ?? { width: 200, height: 100 };
}

export function buildCanvasNode(options: BuildCanvasNodeOptions): CanvasNodeDraft {
  const { type, position, data, zIndex } = options;
  if (options.preset && !getBuiltInCanvasNodePresetMetadata(options.preset)) {
    throw new Error(`Unsupported preset "${options.preset}"`);
  }
  const presetName =
    options.preset ??
    (type === 'project' || type === 'group' ? getDefaultCanvasNodePresetName(type) : undefined);
  const preset = getCanvasNodePreset(NODE_PRESETS, presetName);

  switch (type) {
    case 'annotation':
      return applyCanvasNodePreset(
        {
          type,
          position,
          size: getNodeDefaultSize(type),
          zIndex,
          data: {
            content: asString(data.content, ''),
            style: typeof data.style === 'object' && data.style ? data.style : undefined,
          },
        },
        preset,
      );
    case 'media':
      return applyCanvasNodePreset(
        {
          type,
          position,
          size: { width: 280, height: inferMediaType(data.mediaType) === 'audio' ? 80 : 200 },
          zIndex,
          data: {
            assetPath: asString(data.assetPath, ''),
            documentResourceRef: isDocumentArchiveResourceRef(data.documentResourceRef)
              ? data.documentResourceRef
              : undefined,
            resourceRef: isResourceRef(data.resourceRef) ? data.resourceRef : undefined,
            documentResourceStatus: parseDocumentResourceStatus(data.documentResourceStatus),
            runtimeAssetPath: asString(data.runtimeAssetPath) || undefined,
            thumbnailPath: asString(data.thumbnailPath) || undefined,
            runtimeThumbnailPath: asString(data.runtimeThumbnailPath) || undefined,
            mediaType: inferMediaType(data.mediaType),
            duration: typeof data.duration === 'number' ? data.duration : undefined,
          },
        },
        preset,
      );
    case 'storyboard':
      return {
        type,
        position,
        size: getNodeDefaultSize(type),
        zIndex,
        data: {
          title: asString(data.title, ''),
          description: asString(data.description) || undefined,
          duration: typeof data.duration === 'number' ? data.duration : undefined,
          color: asString(data.color) || undefined,
        },
      };
    case 'text':
      return applyCanvasNodePreset(
        {
          type,
          position,
          size: getNodeDefaultSize(type),
          zIndex,
          data: {
            content: asString(data.content, ''),
            format: data.format === 'markdown' ? 'markdown' : 'plain',
            style: typeof data.style === 'object' && data.style ? data.style : undefined,
            title: asString(data.title) || undefined,
            provenance: isRecord(data.provenance)
              ? toCanvasSerializableRecord(data.provenance)
              : undefined,
          },
        },
        preset,
      );
    case 'artboard':
      return {
        type,
        position,
        size: getNodeDefaultSize(type),
        zIndex,
        data: {
          name: asString(data.name, 'Artboard'),
          description: asString(data.description) || undefined,
          backgroundColor: asString(data.backgroundColor) || undefined,
          showBorder: typeof data.showBorder === 'boolean' ? data.showBorder : true,
          preset:
            data.preset === '1080p' ||
            data.preset === '4k' ||
            data.preset === 'instagram' ||
            data.preset === 'story' ||
            data.preset === 'youtube'
              ? data.preset
              : 'custom',
        },
      };
    case 'table': {
      const columnCount = asNumber(data.columnCount, 3);
      const defaultColumns: TableColumnDef[] = Array.from({ length: columnCount }, (_, i) => ({
        id: `col-${Date.now()}-${i}`,
        label: `Column ${i + 1}`,
        width: 200,
      }));
      return applyCanvasNodePreset(
        {
          type,
          position,
          size: getNodeDefaultSize(type),
          zIndex,
          data: {
            label: asString(data.label) || undefined,
            columns: Array.isArray(data.columns)
              ? (data.columns as TableColumnDef[])
              : defaultColumns,
            rowCount: asNumber(data.rowCount, 3),
            columnCount,
            showHeader: typeof data.showHeader === 'boolean' ? data.showHeader : true,
            markdown: isRecord(data.markdown)
              ? toCanvasSerializableRecord(data.markdown)
              : undefined,
          },
        },
        preset,
      );
    }
    case 'shot':
      return applyCanvasNodePreset(
        {
          type,
          position,
          size: getNodeDefaultSize(type),
          zIndex,
          data: {
            shotNumber: asNumber(data.shotNumber, zIndex + 1),
            duration: asNumber(data.duration, 3),
            visualDescription: asString(data.visualDescription, ''),
            characters: asObjectArray<ShotCharacter>(data.characters) ?? DEFAULT_EMPTY_CHARACTERS,
            shotScale:
              data.shotScale === 'ECU' ||
              data.shotScale === 'CU' ||
              data.shotScale === 'MCU' ||
              data.shotScale === 'MS' ||
              data.shotScale === 'MLS' ||
              data.shotScale === 'LS' ||
              data.shotScale === 'VLS' ||
              data.shotScale === 'ELS'
                ? data.shotScale
                : 'MS',
            cameraMovement:
              data.cameraMovement === 'static' ||
              data.cameraMovement === 'pan' ||
              data.cameraMovement === 'tilt' ||
              data.cameraMovement === 'zoom-in' ||
              data.cameraMovement === 'zoom-out' ||
              data.cameraMovement === 'dolly' ||
              data.cameraMovement === 'dolly-in' ||
              data.cameraMovement === 'dolly-out' ||
              data.cameraMovement === 'handheld' ||
              data.cameraMovement === 'crane'
                ? data.cameraMovement
                : undefined,
            cameraAngle:
              data.cameraAngle === 'eye-level' ||
              data.cameraAngle === 'high-angle' ||
              data.cameraAngle === 'low-angle' ||
              data.cameraAngle === 'bird-eye' ||
              data.cameraAngle === 'dutch'
                ? data.cameraAngle
                : undefined,
            characterAction: asString(data.characterAction, ''),
            emotion: asStringArray(data.emotion),
            sceneTags: asStringArray(data.sceneTags),
            referenceNodeId: asString(data.referenceNodeId) || undefined,
            referenceRefs: asStringArray(data.referenceRefs),
            referenceImagePath: asString(data.referenceImagePath) || undefined,
            referenceImageResourceRef: isDocumentArchiveResourceRef(data.referenceImageResourceRef)
              ? data.referenceImageResourceRef
              : undefined,
            referenceResourceRef: isResourceRef(data.referenceResourceRef)
              ? data.referenceResourceRef
              : undefined,
            runtimeReferenceImagePath: asString(data.runtimeReferenceImagePath) || undefined,
            generatedImage: asString(data.generatedImage) || undefined,
            generatedVideo: asString(data.generatedVideo) || undefined,
            generatedAsset: isGeneratedImage(data.generatedAsset) ? data.generatedAsset : undefined,
            generatedVideoAsset: isGeneratedVideo(data.generatedVideoAsset)
              ? data.generatedVideoAsset
              : undefined,
            generationStatus:
              data.generationStatus === 'pending' ||
              data.generationStatus === 'generating' ||
              data.generationStatus === 'done' ||
              data.generationStatus === 'error'
                ? data.generationStatus
                : 'idle',
            generationHistory:
              asObjectArray<GeneratedImageVersion>(data.generationHistory) ?? DEFAULT_EMPTY_HISTORY,
            dialogue: asString(data.dialogue) || undefined,
            voiceOver: asString(data.voiceOver) || undefined,
            soundCue: asString(data.soundCue) || undefined,
            textCues: asObjectArray<StoryboardTextCue>(data.textCues) ?? DEFAULT_EMPTY_TEXT_CUES,
            voiceCues:
              asObjectArray<StoryboardVoiceCue>(data.voiceCues) ?? DEFAULT_EMPTY_VOICE_CUES,
            storyboardPrompt: isCanvasStoryboardPromptState(data.storyboardPrompt)
              ? (data.storyboardPrompt as CanvasStoryboardPromptState)
              : undefined,
            generationPrompt: asString(data.generationPrompt) || undefined,
            visualStyle: asString(data.visualStyle) || undefined,
            vfx: asStringArray(data.vfx),
            sourceMediaRefs:
              asObjectArray<StoryboardMediaRef>(data.sourceMediaRefs) ?? DEFAULT_EMPTY_MEDIA_REFS,
            generatedMediaRefs:
              asObjectArray<StoryboardMediaRef>(data.generatedMediaRefs) ??
              DEFAULT_EMPTY_MEDIA_REFS,
            mediaRefs:
              asObjectArray<StoryboardMediaRef>(data.mediaRefs) ?? DEFAULT_EMPTY_MEDIA_REFS,
            shotImagePrepPlan: isShotImagePrepPlanLike(data.shotImagePrepPlan)
              ? data.shotImagePrepPlan
              : undefined,
            visualOccurrences:
              asObjectArray<VisualOccurrence>(data.visualOccurrences) ??
              DEFAULT_EMPTY_VISUAL_OCCURRENCES,
            characterCandidates:
              asObjectArray<ShotCharacterCandidate>(data.characterCandidates) ??
              DEFAULT_EMPTY_CHARACTER_CANDIDATES,
            continuityDiagnostics:
              asObjectArray<ComicAnimationDiagnostic>(data.continuityDiagnostics) ??
              DEFAULT_EMPTY_COMIC_DIAGNOSTICS,
            batchExecutionPlan: isBatchExecutionPlanLike(data.batchExecutionPlan)
              ? data.batchExecutionPlan
              : undefined,
            lastImportedToTimelineAt:
              typeof data.lastImportedToTimelineAt === 'number'
                ? data.lastImportedToTimelineAt
                : undefined,
            lastImportedToTimelineProject:
              asString(data.lastImportedToTimelineProject) || undefined,
          },
        },
        preset,
      );
    case 'scene':
      return applyCanvasNodePreset(
        {
          type,
          position,
          size: getNodeDefaultSize(type),
          zIndex,
          data: {
            sceneTitle: asString(data.sceneTitle, 'Scene'),
            sceneNumber: asNumber(data.sceneNumber, zIndex + 1),
            location: asString(data.location) || undefined,
            timeOfDay: asString(data.timeOfDay) || undefined,
            storyboardPrompt: isCanvasStoryboardPromptState(data.storyboardPrompt)
              ? data.storyboardPrompt
              : undefined,
          },
        },
        preset,
      );
    case 'gallery': {
      const galleryPreset = inferGalleryPreset(data.preset);
      const presetConfig = GALLERY_PRESET_CONFIGS[galleryPreset];
      return applyCanvasNodePreset(
        {
          type,
          position,
          size: {
            width: Math.max(240, presetConfig.cols * 90 + 20),
            height: presetConfig.rows * 100 + 60,
          },
          zIndex,
          data: {
            preset: galleryPreset,
            rows: asNumber(data.rows, presetConfig.rows),
            cols: asNumber(data.cols, presetConfig.cols),
            globalPromptPrefix: asString(data.globalPromptPrefix) || undefined,
            characterId: asString(data.characterId) || undefined,
            characterName: asString(data.characterName) || undefined,
            characterProfile:
              typeof data.characterProfile === 'object' && data.characterProfile
                ? data.characterProfile
                : undefined,
          },
        },
        preset,
      );
    }
    case 'script':
      return {
        type,
        position,
        size: getNodeDefaultSize(type),
        zIndex,
        data: {
          scriptPath: asString(data.scriptPath, ''),
          scriptTitle: asString(data.scriptTitle, ''),
          scenes: asObjectArray<ScriptScene>(data.scenes) ?? DEFAULT_EMPTY_SCENES,
          linkedSceneGroupId: asString(data.linkedSceneGroupId) || undefined,
        },
      };
    case 'document':
      return {
        type,
        position,
        size: getNodeDefaultSize(type),
        zIndex,
        data: {
          docPath: asString(data.docPath, ''),
          docType: inferDocumentType(data.docType),
          title: asString(data.title, ''),
          mimeType: asString(data.mimeType) || undefined,
          documentResourceRef: isDocumentArchiveResourceRef(data.documentResourceRef)
            ? data.documentResourceRef
            : undefined,
          resourceRef: isResourceRef(data.resourceRef) ? data.resourceRef : undefined,
          thumbnailData: asString(data.thumbnailData) || undefined,
          provenance: isRecord(data.provenance)
            ? toCanvasSerializableRecord(data.provenance)
            : undefined,
        },
      };
    case 'model':
      return {
        type,
        position,
        size: getNodeDefaultSize(type),
        zIndex,
        ports:
          inferModelRole(data.role) === 'workflow'
            ? [
                {
                  id: 'output',
                  type: 'output',
                  position: 'right',
                  dataType: 'any',
                  label: 'Model',
                },
              ]
            : DEFAULT_EMPTY_PORTS,
        data: {
          modelPath: asString(data.modelPath, ''),
          modelName: asString(data.modelName, ''),
          modelType: inferModelType(data.modelType),
          role: inferModelRole(data.role),
          installedVersion: asString(data.installedVersion) || undefined,
        },
      };
    case 'canvas-embed':
      return {
        type,
        position,
        size: getNodeDefaultSize(type),
        zIndex,
        data: {
          canvasPath: asString(data.canvasPath, ''),
          canvasTitle: asString(data.canvasTitle, ''),
          thumbnailData: asString(data.thumbnailData) || undefined,
        },
      };
    case 'project':
      return applyCanvasNodePreset(
        {
          type,
          position,
          size: getNodeDefaultSize(type),
          zIndex,
          data: {
            projectPath: asString(data.projectPath, ''),
            projectTitle: asString(data.projectTitle, ''),
            projectType: inferProjectType(data.projectType),
            thumbnailData: asString(data.thumbnailData) || undefined,
          },
        },
        preset,
      );
    case 'group':
      const groupNode = applyCanvasNodePreset(
        {
          type,
          position,
          size: getNodeDefaultSize(type),
          zIndex,
          data: {
            label: asString(data.label) || undefined,
            color: asString(data.color) || undefined,
          },
        },
        preset,
      );
      if (groupNode.type !== 'group') {
        throw new Error('Group preset produced a non-group node');
      }
      return {
        ...groupNode,
        container: {
          ...groupNode.container,
          policy: 'group',
          childIds: [],
          deleteBehavior: 'release-children',
        },
      };
    default:
      if (isRegisteredCanvasNodeType(type)) {
        return buildRegisteredCanvasNode({ type, position, data, zIndex });
      }
      throw new Error(`Unsupported Canvas node type "${type}"`);
  }
}

function isShotImagePrepPlanLike(value: unknown): value is ShotImagePrepPlan {
  return (
    isRecord(value) && value.kind === 'shot-image-prep-plan' && typeof value.planId === 'string'
  );
}

function isBatchExecutionPlanLike(value: unknown): value is BatchExecutionPlan {
  return (
    isRecord(value) && value.kind === 'batch-execution-plan' && typeof value.planId === 'string'
  );
}

function buildRegisteredCanvasNode(options: {
  type: RegisteredCanvasNodeType;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  zIndex: number;
}): Omit<RegisteredCanvasNode, 'id'> {
  return {
    type: options.type,
    position: options.position,
    size: getNodeDefaultSize(options.type),
    zIndex: options.zIndex,
    data: {
      ...(REGISTERED_NODE_DEFAULT_DATA[options.type] ?? {}),
      ...toCanvasSerializableRecord(options.data),
    },
  };
}

function isRegisteredCanvasNodeType(type: CanvasNodeType): type is RegisteredCanvasNodeType {
  return REGISTERED_NODE_TYPES.has(type);
}

function toCanvasSerializableRecord(data: Record<string, unknown>): CanvasSerializableRecord {
  const record: CanvasSerializableRecord = {};

  for (const [key, value] of Object.entries(data)) {
    const serializable = toCanvasSerializableValue(value);
    if (serializable !== undefined) {
      record[key] = serializable;
    }
  }

  return record;
}

function toCanvasSerializableValue(value: unknown): CanvasSerializableValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (Array.isArray(value)) {
    return value.map((item) => toCanvasSerializableValue(item) ?? null);
  }
  if (typeof value === 'object' && value !== null) {
    return toCanvasSerializableRecord(value as Record<string, unknown>);
  }
  return undefined;
}
