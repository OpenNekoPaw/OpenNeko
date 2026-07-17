import type { NekoCanvasAPI, NekoStoryScriptIndex } from '../types/extension-api';
import type {
  ApplyCanvasStoryboardOptions,
  CanvasStoryboardPayload,
  CanvasStoryboardScenePlan,
  CanvasStoryboardShotPlan,
  CanonicalCanvasStoryboardProjectionResult,
  CreateStoryboardPayloadOptions,
  CreatedCanvasStoryboard,
  StoryScenePlan,
  StoryShotPlan,
} from '../types/storyboard-planner';
import {
  validateCanonicalStoryboardTable,
  type StoryboardMediaRef,
  type StoryboardTable,
} from '../types/storyboard-table';
import type { ShotCharacter } from '../types/canvas';
import type {
  CanvasCompositeConnectionSpec,
  CanvasCreateConnectionRequest,
} from '../types/canvas-agent-operations';
import {
  CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
  CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
  migrateLegacyCanvasStoryboardShot,
  type CanvasStoryboardPromptState,
} from '../types/canvas-semantic-storyboard';

const DEFAULT_START_X = 100;
const DEFAULT_START_Y = 100;
const SCENE_WIDTH = 900;
const SCENE_GAP = 80;
const SHOT_WIDTH = 200;
const SHOT_GAP = 20;
const DEFAULT_SHOT_DURATION = 3;
const STORYBOARD_SEQUENCE_CONNECTION_LABEL = 'next';

export function createStoryboardPayload(
  scriptIndex: NekoStoryScriptIndex,
  options: CreateStoryboardPayloadOptions = {},
): CanvasStoryboardPayload {
  const mode = options.mode ?? 'mechanical';
  const maxScenes = Math.min(
    options.scenesLimit ?? scriptIndex.scenes.length,
    scriptIndex.scenes.length,
  );
  const scenePlans = new Map((options.scenePlans ?? []).map((plan) => [plan.sceneId, plan]));
  let nextShotNumber = 1;

  const scenes: CanvasStoryboardScenePlan[] = scriptIndex.scenes
    .slice(0, maxScenes)
    .map((scene, index) => {
      const scenePlan = scenePlans.get(scene.sceneId);
      const shotPlans =
        mode === 'semantic'
          ? buildSemanticShotPlans(scene, scenePlan, nextShotNumber, options.characterBindings)
          : buildMechanicalShotPlans(scene, scenePlan, nextShotNumber, options.characterBindings);
      nextShotNumber += shotPlans.length;

      return {
        sceneId: scene.sceneId,
        sceneTitle: scenePlan?.sceneTitle ?? scene.sceneTitle,
        sceneNumber: parseSceneNumber(scene.sceneNumber, index + 1),
        location: scene.location || undefined,
        timeOfDay: scene.timeOfDay,
        shotPlans,
      };
    });

  return {
    mode,
    sourceScriptUri: scriptIndex.uri,
    creativeScope: createStoryboardPayloadScope(scriptIndex.uri, scenes),
    scenes,
  };
}

function createStoryboardPayloadScope(
  sourceScriptUri: string,
  scenes: readonly CanvasStoryboardScenePlan[],
): CanvasStoryboardPayload['creativeScope'] {
  if (scenes.length === 1) {
    const scene = scenes[0];
    return scene
      ? {
          kind: 'scene',
          workId: scene.sceneId,
          title: scene.sceneTitle,
          sceneIds: [scene.sceneId],
          shotIds: scene.shotPlans.map(
            (shot) => shot.shotId ?? `${scene.sceneId}-shot-${shot.shotNumber}`,
          ),
          sourceStoryboardRef: sourceScriptUri,
        }
      : undefined;
  }
  if (scenes.length > 1) {
    return {
      kind: 'sequence',
      workId: sourceScriptUri,
      title: 'Storyboard Sequence',
      sceneIds: scenes.map((scene) => scene.sceneId),
      shotIds: scenes.flatMap((scene) =>
        scene.shotPlans.map((shot) => shot.shotId ?? `${scene.sceneId}-shot-${shot.shotNumber}`),
      ),
      sourceStoryboardRef: sourceScriptUri,
    };
  }
  return undefined;
}

export function projectCanonicalStoryboardToCanvasPayload(
  table: StoryboardTable,
): CanonicalCanvasStoryboardProjectionResult {
  const validation = validateCanonicalStoryboardTable(table);
  if (!validation.ok || !table.revision) {
    return { diagnostics: validation.diagnostics };
  }

  const storyboardRevision = table.revision;
  const scenes: CanvasStoryboardScenePlan[] = table.scenes.map((scene, sceneIndex) => {
    const sceneStoryboardPrompt = createCanonicalSceneVideoPromptState(
      scene,
      storyboardRevision.revisionId,
    );
    return {
      sceneId: scene.sceneId,
      sceneTitle: scene.sceneTitle,
      sceneNumber: scene.sceneNumber ?? sceneIndex + 1,
      ...(scene.location ? { location: scene.location } : {}),
      ...(scene.timeOfDay ? { timeOfDay: scene.timeOfDay } : {}),
      ...(sceneStoryboardPrompt ? { storyboardPrompt: sceneStoryboardPrompt } : {}),
      shotPlans: scene.shots.map((shot): CanvasStoryboardShotPlan => {
        const previewMediaRef = selectStoryboardShotPreviewMediaRef(shot);
        const shotStoryboardPrompt = createCanonicalShotImagePromptState(
          shot,
          storyboardRevision.revisionId,
        );
        return {
          ...(shot.shotId ? { shotId: shot.shotId } : {}),
          shotNumber: shot.shotNumber,
          duration: shot.duration,
          visualDescription: shot.visualDescription,
          characters: (shot.characters ?? []).map((character) => ({
            ...(character.characterId ? { characterId: character.characterId } : {}),
            ...(character.entityRef ? { entityRef: character.entityRef } : {}),
            ...(character.candidateId ? { candidateId: character.candidateId } : {}),
            characterName: character.name,
            ...(character.action ? { action: character.action } : {}),
            ...(character.emotion ? { emotion: character.emotion } : {}),
            ...(character.continuityNotes ? { continuityNotes: character.continuityNotes } : {}),
            ...(character.appearanceNotes ? { appearanceNotes: character.appearanceNotes } : {}),
          })),
          shotScale: shot.shotScale ?? 'MS',
          ...(shot.cameraMovement ? { cameraMovement: shot.cameraMovement } : {}),
          ...(shot.cameraAngle ? { cameraAngle: shot.cameraAngle } : {}),
          characterAction: shot.characterAction,
          emotion: shot.emotion ?? [],
          sceneTags: shot.sceneTags ?? [],
          ...(shot.dialogue ? { dialogue: shot.dialogue } : {}),
          ...(shot.voiceOver ? { voiceOver: shot.voiceOver } : {}),
          ...(shot.soundCue ? { soundCue: shot.soundCue } : {}),
          ...(shot.textCues ? { textCues: shot.textCues } : {}),
          ...(shot.voiceCues ? { voiceCues: shot.voiceCues } : {}),
          ...(shot.imagePrompt ? { imagePrompt: shot.imagePrompt } : {}),
          ...(shotStoryboardPrompt ? { storyboardPrompt: shotStoryboardPrompt } : {}),
          ...(shot.visualStyle ? { visualStyle: shot.visualStyle } : {}),
          ...(shot.vfx ? { vfx: shot.vfx } : {}),
          ...(shot.sourceMediaRefs ? { sourceMediaRefs: shot.sourceMediaRefs } : {}),
          ...(shot.generatedMediaRefs ? { generatedMediaRefs: shot.generatedMediaRefs } : {}),
          ...(shot.mediaRefs ? { mediaRefs: shot.mediaRefs } : {}),
          ...(previewMediaRef?.resourceRef
            ? { referenceResourceRef: previewMediaRef.resourceRef }
            : {}),
          ...(previewMediaRef?.documentResourceRef
            ? { referenceImageResourceRef: previewMediaRef.documentResourceRef }
            : {}),
        };
      }),
    };
  });
  const sourceStoryboardRef = `storyboard:${storyboardRevision.revisionId}`;
  return {
    payload: {
      mode: 'semantic',
      sourceScriptUri: table.source?.sourceUri ?? sourceStoryboardRef,
      sourceStoryboardRevisionId: storyboardRevision.revisionId,
      projectionMode: 'read-only-projection',
      creativeScope: createStoryboardPayloadScope(sourceStoryboardRef, scenes),
      scenes,
      diagnostics: validation.diagnostics,
    },
    diagnostics: validation.diagnostics,
  };
}

function createCanonicalSceneVideoPromptState(
  scene: StoryboardTable['scenes'][number],
  storyboardRevisionId: string,
): CanvasStoryboardPromptState | undefined {
  const videoPrompt = scene.shots[0]?.videoPrompt?.trim();
  if (!videoPrompt) return undefined;
  return {
    version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
    promptBlocks: {
      videoPromptDocument: {
        version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
        documentId: `storyboard-scene:${scene.sceneId}:video`,
        blockKind: 'video',
        text: videoPrompt,
        baseRevision: storyboardRevisionId,
      },
    },
  };
}

function createCanonicalShotImagePromptState(
  shot: StoryboardTable['scenes'][number]['shots'][number],
  storyboardRevisionId: string,
): CanvasStoryboardPromptState | undefined {
  const imagePrompt = shot.imagePrompt?.trim();
  if (!imagePrompt) return undefined;
  const shotId = shot.shotId ?? `shot-${shot.shotNumber}`;
  return {
    version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
    promptBlocks: {
      imagePromptDocument: {
        version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
        documentId: `storyboard-shot:${shotId}:image`,
        blockKind: 'image',
        text: imagePrompt,
        baseRevision: storyboardRevisionId,
      },
    },
  };
}

function selectStoryboardShotPreviewMediaRef(
  shot: StoryboardTable['scenes'][number]['shots'][number],
): StoryboardMediaRef | undefined {
  const candidates = [
    ...(shot.generatedMediaRefs ?? []),
    ...(shot.sourceMediaRefs ?? []),
    ...(shot.mediaRefs ?? []),
  ];
  return (
    candidates.find((mediaRef) => mediaRef.mimeType?.startsWith('image/')) ??
    candidates.find((mediaRef) => mediaRef.documentResourceRef !== undefined) ??
    candidates.find((mediaRef) => mediaRef.resourceRef !== undefined)
  );
}

export async function applyStoryboardPayloadToCanvas(
  api: Pick<NekoCanvasAPI, 'nodes'>,
  payload: CanvasStoryboardPayload,
  options: ApplyCanvasStoryboardOptions = {},
): Promise<CreatedCanvasStoryboard> {
  const startX = options.startX ?? DEFAULT_START_X;
  const startY = options.startY ?? DEFAULT_START_Y;
  const createdScenes: Array<{ sourceSceneId: string; sceneNodeId: string; shotIds: string[] }> =
    [];
  let previousSceneNodeId: string | undefined;
  let nextSceneConnectionPriority = 0;

  for (let sceneIndex = 0; sceneIndex < payload.scenes.length; sceneIndex++) {
    const scene = payload.scenes[sceneIndex];
    if (!scene) continue;

    const sceneX = startX + sceneIndex * (SCENE_WIDTH + SCENE_GAP);
    const composite = await api.nodes.createComposite({
      containerType: 'scene',
      position: { x: sceneX, y: startY },
      data: {
        sceneId: scene.sceneId,
        sourceScriptUri: payload.sourceScriptUri,
        sourceStoryboardRevisionId: payload.sourceStoryboardRevisionId,
        storyboardProjectionMode: payload.projectionMode,
        sceneTitle: scene.sceneTitle,
        sceneNumber: scene.sceneNumber,
        location: scene.location,
        timeOfDay: scene.timeOfDay ?? undefined,
      },
      children: scene.shotPlans.flatMap((shot, shotIndex) => {
        if (!shot) return [];

        const shotX = sceneX + shotIndex * (SHOT_WIDTH + SHOT_GAP);
        const shotY = startY + 240;
        return [
          {
            type: 'shot',
            position: { x: shotX, y: shotY },
            data: {
              ...createCanvasStoryboardShotNodeData(shot, options),
              sourceStoryboardRevisionId: payload.sourceStoryboardRevisionId,
              storyboardProjectionMode: payload.projectionMode,
            },
          },
        ];
      }),
      connections: createStoryboardSequenceConnections(scene.shotPlans.length),
      autoLayout: false,
    });

    createdScenes.push({
      sourceSceneId: scene.sceneId,
      sceneNodeId: composite.containerId,
      shotIds: composite.childIds,
    });

    if (previousSceneNodeId) {
      await api.nodes.createConnection(
        createStoryboardSceneSequenceConnection(
          previousSceneNodeId,
          composite.containerId,
          nextSceneConnectionPriority,
        ),
      );
      nextSceneConnectionPriority += 1;
    }
    previousSceneNodeId = composite.containerId;
  }

  return {
    mode: payload.mode,
    scenesCreated: createdScenes.length,
    totalShots: createdScenes.reduce((total, scene) => total + scene.shotIds.length, 0),
    scenes: createdScenes,
  };
}

function createCanvasStoryboardShotNodeData(
  shot: CanvasStoryboardShotPlan,
  options: ApplyCanvasStoryboardOptions,
): Record<string, unknown> {
  const migrationInput = {
    shotId: shot.shotId,
    shotNumber: shot.shotNumber,
    duration: shot.duration,
    visualDescription: shot.visualDescription,
    shotScale: shot.shotScale,
    characters: [...shot.characters],
    cameraMovement: shot.cameraMovement,
    cameraAngle: shot.cameraAngle,
    characterAction: shot.characterAction,
    emotion: [...shot.emotion],
    sceneTags: [...shot.sceneTags],
    dialogue: shot.dialogue,
    voiceOver: shot.voiceOver,
    soundCue: shot.soundCue,
    textCues: shot.textCues ? [...shot.textCues] : undefined,
    voiceCues: shot.voiceCues ? [...shot.voiceCues] : undefined,
    imagePrompt: shot.imagePrompt,
    videoPrompt: shot.videoPrompt,
    visualStyle: shot.visualStyle,
    referenceImagePath: shot.referenceImagePath,
    referenceResourceRef: shot.referenceResourceRef,
    referenceImageResourceRef: shot.referenceImageResourceRef,
    vfx: shot.vfx ? [...shot.vfx] : undefined,
    sourceMediaRefs: shot.sourceMediaRefs ? [...shot.sourceMediaRefs] : undefined,
    generatedMediaRefs: shot.generatedMediaRefs ? [...shot.generatedMediaRefs] : undefined,
    mediaRefs: shot.mediaRefs ? [...shot.mediaRefs] : undefined,
    shotImagePrepPlan: shot.shotImagePrepPlan,
  };
  const migration = migrateLegacyCanvasStoryboardShot({
    shotData: migrationInput,
    shotId: shot.shotId,
  });

  return {
    shotId: shot.shotId,
    shotNumber: shot.shotNumber,
    duration: shot.duration,
    visualDescription: shot.visualDescription,
    shotScale: shot.shotScale,
    characters: [...shot.characters],
    cameraMovement: shot.cameraMovement,
    cameraAngle: shot.cameraAngle,
    characterAction: shot.characterAction,
    emotion: [...shot.emotion],
    sceneTags: [...shot.sceneTags],
    generationStatus: 'idle' as const,
    generationHistory: [] as unknown[],
    dialogue: shot.dialogue,
    voiceOver: shot.voiceOver,
    soundCue: shot.soundCue,
    textCues: shot.textCues ? [...shot.textCues] : undefined,
    voiceCues: shot.voiceCues ? [...shot.voiceCues] : undefined,
    storyboardPrompt: migration.promptState,
    visualStyle: shot.visualStyle,
    referenceImagePath: shot.referenceImagePath,
    referenceResourceRef: shot.referenceResourceRef,
    referenceImageResourceRef: shot.referenceImageResourceRef,
    vfx: shot.vfx ? [...shot.vfx] : undefined,
    sourceMediaRefs: shot.sourceMediaRefs ? [...shot.sourceMediaRefs] : undefined,
    generatedMediaRefs: shot.generatedMediaRefs ? [...shot.generatedMediaRefs] : undefined,
    mediaRefs: shot.mediaRefs ? [...shot.mediaRefs] : undefined,
    shotImagePrepPlan: shot.shotImagePrepPlan,
    // Phase 6.3 — stamp plan provenance when orchestrated.
    ...(options.workflowPlanId !== undefined && {
      workflowPlanId: options.workflowPlanId,
    }),
  };
}

function createStoryboardSceneSequenceConnection(
  sourceSceneNodeId: string,
  targetSceneNodeId: string,
  priority: number,
): CanvasCreateConnectionRequest {
  return {
    sourceId: sourceSceneNodeId,
    targetId: targetSceneNodeId,
    sourceEndpoint: { nodeId: sourceSceneNodeId, scope: 'port', portId: 'out' },
    targetEndpoint: { nodeId: targetSceneNodeId, scope: 'port', portId: 'in' },
    type: 'sequence',
    label: STORYBOARD_SEQUENCE_CONNECTION_LABEL,
    priority,
  };
}

function createStoryboardSequenceConnections(shotCount: number): CanvasCompositeConnectionSpec[] {
  const connections: CanvasCompositeConnectionSpec[] = [];
  for (let index = 0; index < shotCount - 1; index++) {
    connections.push({
      sourceChildIndex: index,
      targetChildIndex: index + 1,
      sourceEndpoint: { scope: 'port', portId: 'img-out' },
      targetEndpoint: { scope: 'node' },
      type: 'sequence',
      label: STORYBOARD_SEQUENCE_CONNECTION_LABEL,
      priority: index,
    });
  }
  return connections;
}

function buildMechanicalShotPlans(
  scene: NekoStoryScriptIndex['scenes'][number],
  scenePlan: StoryScenePlan | undefined,
  firstShotNumber: number,
  characterBindings: Readonly<Record<string, string>> | undefined,
): CanvasStoryboardShotPlan[] {
  const lineSpan = scene.line_end - scene.line_start;
  const shotCount = clampShotCount(scenePlan?.recommendedShotCount ?? Math.round(lineSpan / 10));
  const sceneTags = compactTags([scene.location, scene.timeOfDay ?? undefined]);
  const baseDescription = scene.actionSummary || scene.sceneTitle;

  return Array.from({ length: shotCount }, (_, index) => ({
    shotNumber: firstShotNumber + index,
    duration: DEFAULT_SHOT_DURATION,
    visualDescription: baseDescription,
    characters: createShotCharacters(scene.sceneCharacters, characterBindings),
    shotScale: 'MS',
    characterAction: scene.actionSummary || '',
    emotion: [],
    sceneTags,
  }));
}

function buildSemanticShotPlans(
  scene: NekoStoryScriptIndex['scenes'][number],
  scenePlan: StoryScenePlan | undefined,
  firstShotNumber: number,
  characterBindings: Readonly<Record<string, string>> | undefined,
): CanvasStoryboardShotPlan[] {
  const semanticPlans = scenePlan?.shotPlans ?? [];
  if (semanticPlans.length === 0) {
    return buildMechanicalShotPlans(scene, scenePlan, firstShotNumber, characterBindings);
  }

  return semanticPlans.map((shotPlan, index) =>
    normalizeShotPlan(scene, shotPlan, firstShotNumber + index, characterBindings),
  );
}

function normalizeShotPlan(
  scene: NekoStoryScriptIndex['scenes'][number],
  shotPlan: StoryShotPlan,
  shotNumber: number,
  characterBindings: Readonly<Record<string, string>> | undefined,
): CanvasStoryboardShotPlan {
  return {
    ...(shotPlan.shotId ? { shotId: shotPlan.shotId } : {}),
    shotNumber: shotPlan.shotNumber ?? shotNumber,
    duration: shotPlan.duration ?? DEFAULT_SHOT_DURATION,
    visualDescription: shotPlan.visualDescription ?? (scene.actionSummary || scene.sceneTitle),
    characters: shotPlan.characters
      ? attachCharacterBindings(shotPlan.characters, characterBindings)
      : createShotCharacters(scene.sceneCharacters, characterBindings),
    shotScale: shotPlan.shotScale ?? 'MS',
    cameraMovement: shotPlan.cameraMovement,
    cameraAngle: shotPlan.cameraAngle,
    characterAction: shotPlan.characterAction ?? scene.actionSummary ?? '',
    emotion: [...(shotPlan.emotion ?? [])],
    sceneTags: [
      ...(shotPlan.sceneTags ?? compactTags([scene.location, scene.timeOfDay ?? undefined])),
    ],
    dialogue: shotPlan.dialogue,
    voiceOver: shotPlan.voiceOver,
    soundCue: shotPlan.soundCue,
    textCues: shotPlan.textCues ? [...shotPlan.textCues] : undefined,
    voiceCues: shotPlan.voiceCues ? [...shotPlan.voiceCues] : undefined,
    imagePrompt: shotPlan.imagePrompt ?? shotPlan.generationPrompt,
    videoPrompt: shotPlan.videoPrompt,
    visualStyle: shotPlan.visualStyle,
    referenceImagePath: shotPlan.referenceImagePath,
    referenceResourceRef: shotPlan.referenceResourceRef,
    referenceImageResourceRef: shotPlan.referenceImageResourceRef,
    vfx: shotPlan.vfx ? [...shotPlan.vfx] : undefined,
    sourceMediaRefs: shotPlan.sourceMediaRefs ? [...shotPlan.sourceMediaRefs] : undefined,
    generatedMediaRefs: shotPlan.generatedMediaRefs ? [...shotPlan.generatedMediaRefs] : undefined,
    mediaRefs: shotPlan.mediaRefs ? [...shotPlan.mediaRefs] : undefined,
    shotImagePrepPlan: shotPlan.shotImagePrepPlan,
  };
}

function createShotCharacters(
  sceneCharacters: readonly string[],
  characterBindings: Readonly<Record<string, string>> | undefined,
): ShotCharacter[] {
  return sceneCharacters.map((characterName) => {
    const characterId = resolveCharacterBinding(characterBindings, characterName);
    return characterId ? { characterId, characterName } : { characterName };
  });
}

function attachCharacterBindings(
  characters: readonly ShotCharacter[],
  characterBindings: Readonly<Record<string, string>> | undefined,
): ShotCharacter[] {
  return characters.map((character) => {
    if (character.characterId) {
      return { ...character };
    }

    const characterId = resolveCharacterBinding(characterBindings, character.characterName);
    return characterId ? { ...character, characterId } : { ...character };
  });
}

function resolveCharacterBinding(
  characterBindings: Readonly<Record<string, string>> | undefined,
  characterName: string,
): string | undefined {
  if (!characterBindings) {
    return undefined;
  }

  const directMatch = characterBindings[characterName];
  if (directMatch) {
    return directMatch;
  }

  const target = normalizeLookupKey(characterName);
  if (!target) {
    return undefined;
  }

  for (const [candidate, characterId] of Object.entries(characterBindings)) {
    if (normalizeLookupKey(candidate) === target) {
      return characterId;
    }
  }

  return undefined;
}

function normalizeLookupKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function compactTags(values: Array<string | undefined>): string[] {
  return values
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => value.trim());
}

function clampShotCount(rawCount: number): number {
  return Math.max(1, Math.min(rawCount || 1, 8));
}

function parseSceneNumber(sceneNumber: string | null, fallback: number): number {
  if (!sceneNumber) return fallback;
  const parsed = Number.parseInt(sceneNumber, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
