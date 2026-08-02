import { describe, expect, it } from 'vitest';
import type { GenerationModelConfig } from '@neko/generation';
import type { CanvasNode } from '@neko/canvas-domain';
import {
  CanvasAmbientContextRuntime,
  projectCanvasAssetChangeSummary,
  projectCanvasChangeSummary,
  readCanvasNodeAssetKind,
  readCanvasNodeAssetUri,
  summarizeCanvasNode,
} from '../turn/canvas-ambient-context-runtime';

describe('canvas ambient context runtime', () => {
  it('summarizes canonical nodes and caps ambient selection count', () => {
    const runtime = new CanvasAmbientContextRuntime({ maxAmbientNodes: 1 });
    const summaries = runtime.setCanvasSelection([
      makeNode('markdown-1', 'markdown', {
        title: 'Detective brief',
        content: 'A detective under neon rain',
      }),
      makeNode('markdown-2', 'markdown', { content: 'second node' }),
    ]);

    expect(summaries).toEqual([
      expect.objectContaining({
        nodeId: 'markdown-1',
        type: 'markdown',
        summary: 'Detective brief',
        bounds: { x: 10, y: 20, width: 320, height: 180 },
      }),
    ]);
  });

  it('summarizes every canonical node type', () => {
    expect(
      summarizeCanvasNode(
        makeNode('markdown-1', 'markdown', { title: 'Outline', content: '# Outline' }),
      ).summary,
    ).toBe('Outline');
    expect(
      summarizeCanvasNode(
        makeNode(
          'group-1',
          'group',
          { label: 'Act one' },
          {
            container: {
              policy: 'group',
              childIds: ['markdown-1', 'media-1'],
              childPlacements: {},
            },
          },
        ),
      ).summary,
    ).toBe('Act one (2)');
    expect(
      summarizeCanvasNode(
        makeNode('job-1', 'job', {
          jobId: 'job-1',
          revision: 1,
          title: 'Generate trailer',
          objective: 'Create a short trailer',
          status: 'running',
          inputRefs: [],
          outputRefs: [],
        }),
      ).summary,
    ).toBe('Generate trailer [running] Create a short trailer');
    expect(
      summarizeCanvasNode(makeNode('file-1', 'file', { path: 'notes/script.txt', title: 'Script' }))
        .summary,
    ).toBe('Script');
    expect(
      summarizeCanvasNode(
        makeNode('canvas-1', 'canvas-embed', {
          canvasPath: 'boards/act-two.nkc',
          canvasTitle: 'Act two',
        }),
      ).summary,
    ).toBe('Act two');
    expect(
      summarizeCanvasNode(makeNode('markdown-2', 'markdown', { content: 'remember this' })).summary,
    ).toBe('remember this');
    expect(
      summarizeCanvasNode(
        makeNode('media-1', 'media', { mediaType: 'video', assetPath: '/a/b.mp4' }),
      ).summary,
    ).toBe('video: b.mp4');
  });

  it('detects asset uri and kind only from media nodes', () => {
    const media = makeNode('media-1', 'media', { mediaType: 'audio', assetPath: '/tmp/a.wav' });
    const markdown = makeNode('markdown-1', 'markdown', { content: 'No implicit asset' });

    expect(readCanvasNodeAssetUri(media)).toBe('/tmp/a.wav');
    expect(readCanvasNodeAssetKind(media)).toBe('audio');
    expect(readCanvasNodeAssetUri(markdown)).toBeUndefined();
    expect(readCanvasNodeAssetKind(markdown)).toBeUndefined();
  });

  it('prefers a creator-facing media title over the source filename', () => {
    expect(
      summarizeCanvasNode(
        makeNode('media-1', 'media', {
          title: 'Opening theme',
          mediaType: 'audio',
          assetPath: '/a/theme.wav',
        }),
      ).summary,
    ).toBe('Opening theme');
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

    runtime.setCanvasSelection([makeNode('a', 'markdown', { content: 'A' })], 'conv-a');
    runtime.setCanvasSelection([makeNode('b', 'markdown', { content: 'B' })], 'conv-b');
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

function makeNode(
  id: string,
  type: CanvasNode['type'],
  data: Record<string, unknown>,
  overrides: Pick<Partial<CanvasNode>, 'container'> = {},
): CanvasNode {
  return {
    id,
    type,
    data,
    position: { x: 10, y: 20 },
    size: { width: 320, height: 180 },
    zIndex: 0,
    ...overrides,
  } as CanvasNode;
}
