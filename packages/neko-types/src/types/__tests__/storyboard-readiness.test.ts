import { describe, expect, it } from 'vitest';
import type {
  AgentContextPayload,
  CanvasStoryboardExecutionSummary,
  StoryCharacterAgentContextData,
  StorySceneAgentContextData,
  StorySceneVideoReadiness,
} from '../index';

describe('storyboard readiness contracts', () => {
  it('allows an empty Canvas execution summary for unavailable downstream state', () => {
    const summary: CanvasStoryboardExecutionSummary = {
      sourceScriptUri: 'file:///project/demo.fountain',
      status: 'not-available',
      scenes: [],
    };

    expect(summary.scenes).toEqual([]);
    expect(summary.status).toBe('not-available');
  });

  it('covers optional Story readiness fields without requiring Canvas state', () => {
    const readiness: StorySceneVideoReadiness = {
      sceneId: 'scene_1',
      sourceScriptUri: 'file:///project/demo.fountain',
      sceneTitle: 'INT. OFFICE - DAY',
      estimatedDuration: 18,
      characters: [
        {
          name: 'ALICE',
          characterId: 'char-alice',
          matchSource: 'dialogue-character',
          status: 'bound',
          thumbnailUri: 'vscode-webview://thumb/alice.png',
          assetEntityIds: ['asset-alice'],
        },
        {
          name: 'BOB',
          matchSource: 'registry-mention',
          status: 'missing',
          missingReason: 'No usable character visual is available',
          missingReasonKey: 'table.character.missingReason.missingVisual',
        },
      ],
      missingInputs: [
        {
          kind: 'character-visual',
          label: 'BOB is missing a character visual',
          labelKey: 'table.missingInput.characterVisual',
          labelParams: { name: 'BOB' },
          severity: 'blocking',
          characterName: 'BOB',
        },
      ],
      readinessStatus: 'needs-input',
      creatorStatus: 'attention',
      allowedActions: ['analyze', 'sendToCanvas'],
    };

    expect(readiness.characters[0]?.assetEntityIds).toEqual(['asset-alice']);
    expect(readiness.canvasSummary).toBeUndefined();
  });

  it('keeps enriched Agent data backward-compatible with story-selection payloads', () => {
    const sceneData: StorySceneAgentContextData = {
      scriptPath: '/project/demo.fountain',
      sourceScriptUri: 'file:///project/demo.fountain',
      sceneId: 'scene_1',
      selectedText: 'INT. OFFICE - DAY',
      readinessStatus: 'ready',
      missingInputs: [],
    };

    const payload: AgentContextPayload = {
      type: 'story-selection',
      id: 'story:/project/demo.fountain:scene_1',
      label: 'INT. OFFICE - DAY',
      summary: 'Scene: INT. OFFICE - DAY',
      data: sceneData,
    };

    expect(payload.type).toBe('story-selection');
    expect((payload.data as StorySceneAgentContextData).readinessStatus).toBe('ready');
  });

  it('supports character context visual references as optional additions', () => {
    const data: StoryCharacterAgentContextData = {
      characterName: 'ALICE',
      sourceScriptUri: 'file:///project/demo.fountain',
      characterId: 'char-alice',
      assetEntityIds: ['asset-alice'],
      thumbnailRef: 'vscode-webview://thumb/alice.png',
      readinessStatus: 'bound',
    };

    expect(data.assetEntityIds).toEqual(['asset-alice']);
    expect(data.generatedAssetIds).toBeUndefined();
  });
});
