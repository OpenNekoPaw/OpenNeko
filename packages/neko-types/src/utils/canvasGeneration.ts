import type { CanvasNode, ShotCanvasNode } from '../types/canvas';
import {
  isCanvasStoryboardPromptState,
  type CanvasStoryboardPromptBlockKind,
  type CanvasStoryboardPromptState,
} from '../types/canvas-semantic-storyboard';

export interface CanvasGenerationLineage {
  readonly sourceNodeId: string;
  readonly characterIds?: readonly string[];
}

export function extractCanvasNodeGenerationLineage(
  node: CanvasNode,
): CanvasGenerationLineage | undefined {
  switch (node.type) {
    case 'shot': {
      const characterIds = Array.from(
        new Set(
          node.data.characters
            .map((character) => character.characterId)
            .filter((value): value is string => typeof value === 'string' && value.length > 0),
        ),
      );
      return characterIds.length > 0
        ? { sourceNodeId: node.id, characterIds }
        : { sourceNodeId: node.id };
    }
    case 'gallery': {
      const characterId = node.data.characterId;
      return typeof characterId === 'string' && characterId.length > 0
        ? { sourceNodeId: node.id, characterIds: [characterId] }
        : { sourceNodeId: node.id };
    }
    default:
      return { sourceNodeId: node.id };
  }
}

export interface CanvasShotPromptProjection {
  readonly prompt: string;
  readonly source: 'semantic-prompt-document' | 'assembled' | 'legacy-migration-required' | 'empty';
  readonly promptBlockKind?: CanvasStoryboardPromptBlockKind;
  readonly legacyMigrationPrompt?: string;
  readonly shotScale?: string;
  readonly cameraMovement?: string;
  readonly cameraAngle?: string;
}

export interface ProjectCanvasShotPromptOptions {
  readonly preferredBlockKind?: CanvasStoryboardPromptBlockKind;
}

export type CanvasShotPromptProjectableData = Partial<
  Pick<
    ShotCanvasNode['data'],
    | 'generationPrompt'
    | 'storyboardPrompt'
    | 'visualDescription'
    | 'characters'
    | 'characterAction'
    | 'emotion'
    | 'sceneTags'
    | 'visualStyle'
    | 'vfx'
    | 'dialogue'
    | 'soundCue'
    | 'shotScale'
    | 'cameraMovement'
    | 'cameraAngle'
  >
>;

/**
 * Project Shot fields into the creator-facing prompt used by authoring and
 * generation entry points. Semantic storyboard prompt documents are canonical;
 * legacy `generationPrompt` is migration/import input only.
 */
export function projectCanvasShotPrompt(
  node: CanvasNode,
  options: ProjectCanvasShotPromptOptions = {},
): CanvasShotPromptProjection | undefined {
  if (node.type !== 'shot') return undefined;
  return projectShotDataPrompt(node.data, options);
}

export function projectShotDataPrompt(
  data: CanvasShotPromptProjectableData,
  options: ProjectCanvasShotPromptOptions = {},
): CanvasShotPromptProjection {
  const result = buildProjectionResult(data);
  const semanticPrompt = projectSemanticStoryboardPrompt(data.storyboardPrompt, options);
  if (semanticPrompt) {
    return {
      ...result,
      prompt: semanticPrompt.prompt,
      source: 'semantic-prompt-document',
      promptBlockKind: semanticPrompt.blockKind,
    };
  }

  const legacyMigrationPrompt = readTrimmedString(data.generationPrompt);
  const parts: string[] = [];
  const visualDescription = readTrimmedString(data.visualDescription);
  if (visualDescription) parts.push(visualDescription);

  const characterNames = readCharacterNames(data.characters);
  if (characterNames.length > 0) parts.push(`Characters: ${characterNames.join(', ')}`);

  const characterAction = readTrimmedString(data.characterAction);
  if (characterAction) parts.push(`Action: ${characterAction}`);

  const emotions = readStringList(data.emotion);
  if (emotions.length > 0) parts.push(`Emotion: ${emotions.join(', ')}`);

  const sceneTags = readStringList(data.sceneTags);
  if (sceneTags.length > 0) parts.push(`Tags: ${sceneTags.join(', ')}`);

  const visualStyle = readTrimmedString(data.visualStyle);
  if (visualStyle) parts.push(`Style: ${visualStyle}`);

  const vfx = readStringList(data.vfx);
  if (vfx.length > 0) parts.push(`VFX: ${vfx.join(', ')}`);

  const dialogue = readTrimmedString(data.dialogue);
  if (dialogue) parts.push(`Dialogue: "${dialogue}"`);

  const soundCue = readTrimmedString(data.soundCue);
  if (soundCue) parts.push(`Sound: ${soundCue}`);

  return {
    ...result,
    prompt: parts.join('. '),
    source:
      parts.length > 0
        ? 'assembled'
        : legacyMigrationPrompt
          ? 'legacy-migration-required'
          : 'empty',
    ...(legacyMigrationPrompt ? { legacyMigrationPrompt } : {}),
  };
}

function projectSemanticStoryboardPrompt(
  value: unknown,
  options: ProjectCanvasShotPromptOptions,
): { readonly blockKind: CanvasStoryboardPromptBlockKind; readonly prompt: string } | undefined {
  if (!isCanvasStoryboardPromptState(value)) return undefined;
  const promptBlocks = value.promptBlocks;
  if (!promptBlocks) return undefined;

  const preferred = options.preferredBlockKind
    ? readSemanticPromptBlock(value, options.preferredBlockKind)
    : undefined;
  if (preferred) return preferred;

  return (
    readSemanticPromptBlock(value, 'video') ??
    readSemanticPromptBlock(value, 'image') ??
    readSemanticPromptBlock(value, 'voice')
  );
}

function readSemanticPromptBlock(
  state: CanvasStoryboardPromptState,
  blockKind: CanvasStoryboardPromptBlockKind,
): { readonly blockKind: CanvasStoryboardPromptBlockKind; readonly prompt: string } | undefined {
  const document =
    blockKind === 'image'
      ? state.promptBlocks?.imagePromptDocument
      : blockKind === 'video'
        ? state.promptBlocks?.videoPromptDocument
        : state.promptBlocks?.voicePromptDocument;
  const prompt = readTrimmedString(document?.text);
  return prompt ? { blockKind, prompt } : undefined;
}

function buildProjectionResult(
  data: Partial<Pick<ShotCanvasNode['data'], 'shotScale' | 'cameraMovement' | 'cameraAngle'>>,
): Omit<CanvasShotPromptProjection, 'prompt' | 'source'> {
  return {
    shotScale: readTrimmedString(data.shotScale),
    cameraMovement: readTrimmedString(data.cameraMovement),
    cameraAngle: readTrimmedString(data.cameraAngle),
  };
}

function readTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readStringList(values: readonly unknown[] | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => readTrimmedString(value))
    .filter((value): value is string => Boolean(value));
}

function readCharacterNames(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
      return readTrimmedString((value as { readonly characterName?: unknown }).characterName);
    })
    .filter((value): value is string => Boolean(value));
}
