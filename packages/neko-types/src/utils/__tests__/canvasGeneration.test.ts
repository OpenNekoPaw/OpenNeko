import { describe, expect, it } from 'vitest';
import { extractCanvasNodeGenerationLineage, projectCanvasShotPrompt } from '../canvasGeneration';
import {
  CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
  CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
} from '../../types/canvas-semantic-storyboard';
import type { GalleryCanvasNode, ShotCanvasNode, TextCanvasNode } from '../../types/canvas';

describe('extractCanvasNodeGenerationLineage', () => {
  it('extracts unique character ids from shot nodes', () => {
    const node: ShotCanvasNode = {
      id: 'shot-1',
      type: 'shot',
      position: { x: 0, y: 0 },
      size: { width: 100, height: 100 },
      zIndex: 1,
      data: {
        shotNumber: 1,
        duration: 3,
        visualDescription: 'Alice enters the room',
        characters: [
          { characterId: 'char_alice', characterName: 'ALICE' },
          { characterId: 'char_alice', characterName: 'Alice' },
          { characterId: 'char_bob', characterName: 'BOB' },
        ],
        shotScale: 'MS',
        characterAction: 'Walks in',
        emotion: [],
        sceneTags: [],
        generationStatus: 'idle',
        generationHistory: [],
      },
    };

    expect(extractCanvasNodeGenerationLineage(node)).toEqual({
      sourceNodeId: 'shot-1',
      characterIds: ['char_alice', 'char_bob'],
    });
  });

  it('extracts gallery character ids', () => {
    const node: GalleryCanvasNode = {
      id: 'gallery-1',
      type: 'gallery',
      position: { x: 0, y: 0 },
      size: { width: 100, height: 100 },
      zIndex: 1,
      data: {
        preset: 'character-3view',
        rows: 1,
        cols: 1,
        cells: [],
        characterId: 'char_alice',
        characterName: 'Alice',
      },
    };

    expect(extractCanvasNodeGenerationLineage(node)).toEqual({
      sourceNodeId: 'gallery-1',
      characterIds: ['char_alice'],
    });
  });

  it('still preserves source node id for non-character nodes', () => {
    const node: TextCanvasNode = {
      id: 'text-1',
      type: 'text',
      position: { x: 0, y: 0 },
      size: { width: 100, height: 100 },
      zIndex: 1,
      data: {
        content: 'note',
      },
    };

    expect(extractCanvasNodeGenerationLineage(node)).toEqual({
      sourceNodeId: 'text-1',
    });
  });
});

describe('projectCanvasShotPrompt', () => {
  it('assembles a creator-facing prompt from durable shot fields', () => {
    const node: ShotCanvasNode = {
      id: 'shot-assembled',
      type: 'shot',
      position: { x: 0, y: 0 },
      size: { width: 100, height: 100 },
      zIndex: 1,
      data: {
        shotNumber: 1,
        duration: 3,
        visualDescription: 'A quiet hallway',
        characters: [{ characterName: 'Alice' }],
        shotScale: 'MS',
        cameraMovement: 'dolly-in',
        cameraAngle: 'low-angle',
        characterAction: 'opens a glowing door',
        emotion: ['uncertain'],
        sceneTags: ['night'],
        visualStyle: 'ink wash',
        vfx: ['soft mist'],
        dialogue: 'Is anyone there?',
        soundCue: 'distant hum',
        generationStatus: 'idle',
        generationHistory: [],
      },
    };

    expect(projectCanvasShotPrompt(node)).toEqual({
      prompt:
        'A quiet hallway. Characters: Alice. Action: opens a glowing door. Emotion: uncertain. Tags: night. Style: ink wash. VFX: soft mist. Dialogue: "Is anyone there?". Sound: distant hum',
      source: 'assembled',
      shotScale: 'MS',
      cameraMovement: 'dolly-in',
      cameraAngle: 'low-angle',
    });
  });

  it('projects semantic prompt documents before legacy generationPrompt input', () => {
    const node: ShotCanvasNode = {
      id: 'shot-semantic',
      type: 'shot',
      position: { x: 0, y: 0 },
      size: { width: 100, height: 100 },
      zIndex: 1,
      data: {
        shotNumber: 1,
        duration: 3,
        visualDescription: 'Field description',
        generationPrompt: 'legacy prompt must not win',
        storyboardPrompt: {
          version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
          promptBlocks: {
            videoPromptDocument: {
              version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
              documentId: 'shot-semantic:video:prompt',
              blockKind: 'video',
              text: 'semantic video prompt wins',
            },
          },
        },
        characters: [],
        shotScale: 'CU',
        characterAction: '',
        emotion: [],
        sceneTags: [],
        generationStatus: 'idle',
        generationHistory: [],
      },
    };

    expect(projectCanvasShotPrompt(node)).toEqual({
      prompt: 'semantic video prompt wins',
      source: 'semantic-prompt-document',
      promptBlockKind: 'video',
      shotScale: 'CU',
      cameraMovement: undefined,
      cameraAngle: undefined,
    });

    expect(projectCanvasShotPrompt(node, { preferredBlockKind: 'image' })).toEqual({
      prompt: 'semantic video prompt wins',
      source: 'semantic-prompt-document',
      promptBlockKind: 'video',
      shotScale: 'CU',
      cameraMovement: undefined,
      cameraAngle: undefined,
    });
  });

  it('treats generationPrompt as migration input instead of a prompt override', () => {
    const node: ShotCanvasNode = {
      id: 'shot-custom',
      type: 'shot',
      position: { x: 0, y: 0 },
      size: { width: 100, height: 100 },
      zIndex: 1,
      data: {
        shotNumber: 1,
        duration: 3,
        visualDescription: 'Field description',
        generationPrompt: 'Custom prompt wins',
        characters: [],
        shotScale: 'CU',
        characterAction: '',
        emotion: [],
        sceneTags: [],
        generationStatus: 'idle',
        generationHistory: [],
      },
    };

    expect(projectCanvasShotPrompt(node)).toEqual({
      prompt: 'Field description',
      source: 'assembled',
      legacyMigrationPrompt: 'Custom prompt wins',
      shotScale: 'CU',
      cameraMovement: undefined,
      cameraAngle: undefined,
    });
  });

  it('poisons legacy-only generationPrompt acceptance for canonical prompt projection', () => {
    const node: ShotCanvasNode = {
      id: 'shot-legacy-only',
      type: 'shot',
      position: { x: 0, y: 0 },
      size: { width: 100, height: 100 },
      zIndex: 1,
      data: {
        shotNumber: 1,
        duration: 3,
        visualDescription: '',
        generationPrompt: 'legacy-only prompt',
        characters: [],
        shotScale: 'CU',
        characterAction: '',
        emotion: [],
        sceneTags: [],
        generationStatus: 'idle',
        generationHistory: [],
      },
    };

    expect(projectCanvasShotPrompt(node)).toEqual({
      prompt: '',
      source: 'legacy-migration-required',
      legacyMigrationPrompt: 'legacy-only prompt',
      shotScale: 'CU',
      cameraMovement: undefined,
      cameraAngle: undefined,
    });
  });
});
