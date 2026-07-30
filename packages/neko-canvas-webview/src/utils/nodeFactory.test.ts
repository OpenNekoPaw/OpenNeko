import { describe, expect, it } from 'vitest';
import type { CanonicalCanvasNodeType } from '@neko/shared';
import { buildCanvasNode } from './nodeFactory';

describe('buildCanvasNode', () => {
  it('creates the six canonical node types from valid canonical data', () => {
    const markdown = createNode('markdown', { content: '# Draft' });
    const media = createNode('media', { assetPath: 'media/hero.png', mediaType: 'image' });
    const group = createNode('group', { label: 'Chapter' });
    const job = createNode('job', {
      jobRef: { kind: 'generation', jobId: 'job-owned-1' },
      revision: 4,
      title: 'Generate key art',
      status: 'running',
    });
    const file = createNode('file', { path: 'docs/script.fountain' });
    const subcanvas = createNode('canvas-embed', {
      canvasPath: 'boards/chapter.nkc',
      canvasTitle: 'Chapter',
    });

    expect(markdown).toMatchObject({
      type: 'markdown',
      data: { content: '# Draft' },
    });
    expect(media).toMatchObject({
      type: 'media',
      data: { assetPath: 'media/hero.png', mediaType: 'image' },
    });
    expect(group).toMatchObject({
      type: 'group',
      container: {
        policy: 'group',
        childIds: [],
        layout: { mode: 'manual' },
        deleteBehavior: 'release-children',
      },
    });
    expect(job).toMatchObject({
      type: 'job',
      data: {
        jobRef: { kind: 'generation', jobId: 'job-owned-1' },
        revision: 4,
        title: 'Generate key art',
        status: 'running',
        inputRefs: [],
        outputRefs: [],
      },
    });
    expect(file).toMatchObject({
      type: 'file',
      data: { path: 'docs/script.fountain', title: 'script.fountain' },
    });
    expect(subcanvas).toMatchObject({
      type: 'canvas-embed',
      data: { canvasPath: 'boards/chapter.nkc', canvasTitle: 'Chapter' },
    });
  });

  it('normalizes canonical node inputs without retaining unknown fields', () => {
    const node = createNode('media', {
      assetPath: 'media/voice.wav',
      mediaType: 'audio',
      duration: Number.POSITIVE_INFINITY,
      legacyPrompt: 'must not survive',
    });

    expect(node.size.height).toBe(120);
    expect(node.data).not.toHaveProperty('legacyPrompt');
    expect((node.data as Record<string, unknown>).duration).toBeUndefined();
  });

  it('rejects legacy node types at the authoring boundary', () => {
    expect(() => createNode('shot' as CanonicalCanvasNodeType, {})).toThrow(
      'Unsupported Canvas node type "shot"',
    );
  });

  it('rejects unowned Job projections and source-backed nodes without sources', () => {
    expect(() => createNode('job', {})).toThrow('Canvas jobRef must contain');
    expect(() =>
      createNode('job', {
        jobRef: { kind: 'generation', jobId: 'job-owned-1' },
        revision: -1,
        title: 'Generate key art',
        status: 'running',
      }),
    ).toThrow('Canvas Job revision must be a non-negative integer');
    expect(() => createNode('media', { mediaType: 'image' })).toThrow(
      'Canvas Media creation requires a durable source',
    );
    expect(() => createNode('file', {})).toThrow('Canvas File creation requires a durable source');
    expect(() => createNode('canvas-embed', {})).toThrow(
      'Canvas canvasPath must be a non-empty string',
    );
  });
});

function createNode(type: CanonicalCanvasNodeType, data: Record<string, unknown>) {
  return buildCanvasNode({
    type,
    data,
    position: { x: 10, y: 20 },
    zIndex: 3,
  });
}
