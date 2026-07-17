import { describe, expect, it } from 'vitest';
import type { CanvasData, SceneGroupCanvasNode, ShotCanvasNode } from '../../types';
import { createCanvasStoryboardExecutionSummary } from '../storyboardExecutionSummary';

describe('createCanvasStoryboardExecutionSummary', () => {
  it('projects scene correlation, shot counts, generated counts, thumbnails, and timeline metadata', () => {
    const nodes: CanvasData['nodes'] = [
      createSceneNode(),
      createShotNode('shot-1', {
        generationStatus: 'done',
        generatedVideo: 'http://localhost:3010/video.mp4?engineToken=secret',
        generationHistory: [
          {
            id: 'candidate-1',
            dataUrl: 'blob:runtime',
            prompt: 'runtime only',
            timestamp: 1,
            selected: true,
            assetId: 'asset-image-1',
          },
        ],
        lastImportedToTimelineAt: 1234,
        lastImportedToTimelineProject: 'Demo Cut',
      }),
      createShotNode('shot-2', {
        generationStatus: 'error',
        generatedImage: 'data:image/png;base64,abc',
        generatedVideo: 'https://assets.example/video.mp4?access_token=secret',
      }),
    ];

    const summary = createCanvasStoryboardExecutionSummary({
      nodes,
      canvasFileUri: 'file:///project/storyboard.nkc',
      creativeScope: {
        kind: 'sequence',
        workId: 'seq-1',
        title: 'Sequence 1',
        sceneIds: ['scene_1'],
      },
      relatedBoards: [
        {
          role: 'scene',
          ref: { kind: 'workspace-path', path: 'boards/scene-1.nkc' },
          label: 'Scene 1 Board',
        },
      ],
      boardSummary: {
        name: 'Sequence Board',
        scope: {
          kind: 'sequence',
          workId: 'seq-1',
          title: 'Sequence 1',
          sceneIds: ['scene_1'],
        },
      },
      request: {
        sourceScriptUri: 'file:///project/demo.fountain',
        sceneId: 'scene_1',
      },
    });

    expect(summary.status).toBe('partial');
    expect(summary.scenes).toHaveLength(1);
    expect(summary.scenes[0]).toMatchObject({
      sourceScriptUri: 'file:///project/demo.fountain',
      sceneId: 'scene_1',
      sceneNodeId: 'scene-node-1',
      shotCount: 2,
      generatedShotCount: 1,
      failedShotCount: 1,
      selectedThumbnailRef: 'asset-image-1',
      status: 'partial',
    });
    expect(summary.scenes[0]?.shots[0]).toMatchObject({
      shotId: 'shot-1',
      selectedAssetRef: 'asset-image-1',
      thumbnailRef: 'asset-image-1',
      lastImportedToTimelineAt: 1234,
      lastImportedToTimelineProject: 'Demo Cut',
    });
    expect(summary.creativeScope).toMatchObject({ kind: 'sequence', workId: 'seq-1' });
    expect(summary.relatedBoards?.[0]).toMatchObject({ role: 'scene', label: 'Scene 1 Board' });
    expect(summary.boardSummary).toMatchObject({ name: 'Sequence Board' });
    expect(JSON.stringify(summary)).not.toContain('blob:runtime');
    expect(JSON.stringify(summary)).not.toContain('data:image');
    expect(JSON.stringify(summary)).not.toContain('engineToken=');
    expect(JSON.stringify(summary)).not.toContain('access_token=');
    expect(JSON.stringify(summary)).not.toContain('localhost');
  });

  it('returns not-found without creating nodes when scene binding is absent', () => {
    const summary = createCanvasStoryboardExecutionSummary({
      nodes: [createSceneNode()],
      request: {
        sourceScriptUri: 'file:///project/demo.fountain',
        sceneId: 'missing-scene',
      },
    });

    expect(summary.status).toBe('not-found');
    expect(summary.scenes).toEqual([]);
  });

  it('filters scenes by source script URI and returns empty scene summaries as not-started', () => {
    const otherScene: SceneGroupCanvasNode = {
      ...createSceneNode(),
      id: 'scene-node-other',
      container: { policy: 'scene', childIds: [] },
      data: {
        ...createSceneNode().data,
        sourceScriptUri: 'file:///project/other.fountain',
        sceneId: 'scene_other',
      },
    };

    const summary = createCanvasStoryboardExecutionSummary({
      nodes: [createSceneNode(), otherScene],
      request: {
        sourceScriptUri: 'file:///project/demo.fountain',
      },
    });

    expect(summary.status).toBe('not-started');
    expect(summary.scenes).toHaveLength(1);
    expect(summary.scenes[0]).toMatchObject({
      sourceScriptUri: 'file:///project/demo.fountain',
      sceneId: 'scene_1',
      shotCount: 0,
      status: 'not-started',
    });
  });
});

function createSceneNode(): SceneGroupCanvasNode {
  return {
    id: 'scene-node-1',
    type: 'scene',
    position: { x: 0, y: 0 },
    size: { width: 720, height: 420 },
    zIndex: 0,
    container: { policy: 'scene', childIds: ['shot-1', 'shot-2'] },
    data: {
      sourceScriptUri: 'file:///project/demo.fountain',
      sceneId: 'scene_1',
      sceneTitle: 'INT. OFFICE - DAY',
      sceneNumber: 1,
    },
  };
}

function createShotNode(id: string, data: Partial<ShotCanvasNode['data']> = {}): ShotCanvasNode {
  return {
    id,
    type: 'shot',
    position: { x: id === 'shot-1' ? 0 : 240, y: 200 },
    size: { width: 220, height: 200 },
    zIndex: 1,
    parentId: 'scene-node-1',
    data: {
      shotNumber: id === 'shot-1' ? 1 : 2,
      duration: 3,
      visualDescription: '',
      characters: [],
      shotScale: 'MS',
      characterAction: '',
      emotion: [],
      sceneTags: [],
      generationStatus: 'idle',
      generationHistory: [],
      ...data,
    },
  };
}
