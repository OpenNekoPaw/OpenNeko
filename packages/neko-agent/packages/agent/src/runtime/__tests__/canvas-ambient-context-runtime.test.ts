import { describe, expect, it } from 'vitest';
import type { CanvasNode, GenerationModelConfig } from '@neko/shared';
import {
  CanvasAmbientContextRuntime,
  projectCanvasAssetChangeSummary,
  projectCanvasChangeSummary,
  readCanvasNodeAssetKind,
  readCanvasNodeAssetUri,
  summarizeCanvasNode,
} from '../turn/canvas-ambient-context-runtime';

describe('canvas ambient context runtime', () => {
  it('summarizes selected shot nodes and caps ambient selection count', () => {
    const runtime = new CanvasAmbientContextRuntime({ maxAmbientNodes: 1 });
    const summaries = runtime.setCanvasSelection([
      makeNode('shot-1', 'shot', {
        shotNumber: 3,
        shotScale: 'CU',
        visualDescription: 'A detective under neon rain',
        generatedAsset: { path: '/tmp/shot.png' },
      }),
      makeNode('shot-2', 'annotation', { content: 'second node' }),
    ]);

    expect(summaries).toEqual([
      expect.objectContaining({
        nodeId: 'shot-1',
        type: 'shot',
        summary: '#3 CU - A detective under neon rain',
        assetUri: '/tmp/shot.png',
        assetKind: 'image',
        bounds: { x: 10, y: 20, width: 320, height: 180 },
      }),
    ]);
  });

  it('summarizes gallery, scene, annotation and media nodes', () => {
    expect(
      summarizeCanvasNode(makeNode('gallery-1', 'gallery', { characterName: 'Mika', preset: '3v' }))
        .summary,
    ).toBe('Gallery: Mika (3v)');
    expect(summarizeCanvasNode(makeNode('scene-1', 'scene', { sceneNumber: 2 })).summary).toBe(
      'Scene 2: Scene',
    );
    expect(
      summarizeCanvasNode(makeNode('note-1', 'annotation', { content: 'remember this' })).summary,
    ).toBe('Note: remember this');
    expect(
      summarizeCanvasNode(
        makeNode('media-1', 'media', { mediaType: 'video', assetPath: '/a/b.mp4' }),
      ).summary,
    ).toBe('video: b.mp4');
  });

  it('detects asset uri and kind from media and generated shot nodes', () => {
    const media = makeNode('media-1', 'media', { mediaType: 'audio', assetPath: '/tmp/a.wav' });
    const shot = makeNode('shot-1', 'shot', { generatedImage: 'data:image/png;base64,abc' });

    expect(readCanvasNodeAssetUri(media)).toBe('/tmp/a.wav');
    expect(readCanvasNodeAssetKind(media)).toBe('audio');
    expect(readCanvasNodeAssetUri(shot)).toBe('data:image/png;base64,abc');
    expect(readCanvasNodeAssetKind(shot)).toBe('image');
  });

  it('keeps pending canvas changes in a scoped ring buffer', () => {
    const runtime = new CanvasAmbientContextRuntime({ maxPendingChanges: 2 });

    runtime.recordCanvasChange({ domain: 'canvas', changeType: 'add', id: 'a', timestamp: 1 });
    runtime.recordCanvasChange({ domain: 'canvas', changeType: 'update', id: 'b', timestamp: 2 });
    runtime.recordCanvasChange({ domain: 'assets', changeType: 'delete', id: 'c', timestamp: 3 });

    expect(runtime.getPendingCanvasChanges()).toEqual([
      { domain: 'canvas', changeType: 'update', id: 'b', timestamp: 2 },
      { domain: 'assets', changeType: 'delete', id: 'c', timestamp: 3 },
    ]);
    expect(runtime.drainPendingCanvasChanges()).toHaveLength(2);
    expect(runtime.getPendingCanvasChanges()).toEqual([]);
  });

  it('isolates selection, generation config and changes by scope', () => {
    const runtime = new CanvasAmbientContextRuntime();
    const config = {
      image: { providerId: 'fal', modelId: 'flux' },
    } as unknown as GenerationModelConfig;

    runtime.setCanvasSelection([makeNode('a', 'annotation', { content: 'A' })], 'conv-a');
    runtime.setCanvasSelection([makeNode('b', 'annotation', { content: 'B' })], 'conv-b');
    runtime.setActiveGenerationConfig(config, 'conv-a');
    runtime.recordCanvasChange(
      { domain: 'canvas', changeType: 'add', id: 'node-a', timestamp: 1 },
      'conv-a',
    );

    expect(runtime.getCanvasSelection('conv-a')[0]?.nodeId).toBe('a');
    expect(runtime.getCanvasSelection('conv-b')[0]?.nodeId).toBe('b');
    expect(runtime.getActiveGenerationConfig('conv-a')).toBe(config);
    expect(runtime.getActiveGenerationConfig('conv-b')).toBeUndefined();
    expect(runtime.getPendingCanvasChanges('conv-a')).toHaveLength(1);
    expect(runtime.getPendingCanvasChanges('conv-b')).toEqual([]);
  });

  it('projects canvas extension asset and canvas events to ambient change summaries', () => {
    expect(projectCanvasAssetChangeSummary({ type: 'update', assetId: 'asset-1' }, 10)).toEqual({
      domain: 'assets',
      changeType: 'update',
      id: 'asset-1',
      timestamp: 10,
    });
    expect(projectCanvasChangeSummary({ type: 'delete', shapeId: 'shape-1' }, 11)).toEqual({
      domain: 'canvas',
      changeType: 'delete',
      id: 'shape-1',
      timestamp: 11,
    });
    expect(projectCanvasChangeSummary({ type: 'move', nodeId: 'node-1' }, 12)).toBeNull();
  });
});

function makeNode(id: string, type: CanvasNode['type'], data: Record<string, unknown>): CanvasNode {
  return {
    id,
    type,
    data,
    position: { x: 10, y: 20 },
    size: { width: 320, height: 180 },
    zIndex: 0,
  } as CanvasNode;
}
