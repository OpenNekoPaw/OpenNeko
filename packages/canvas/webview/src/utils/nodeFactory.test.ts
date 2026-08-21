import { describe, expect, it } from 'vitest';
import { createCanvasGenerationNodeData, type CanonicalCanvasNodeType } from '@neko/canvas-domain';
import { buildCanvasNode } from './nodeFactory';

describe('buildCanvasNode', () => {
  it('creates the six canonical node types from valid canonical data', () => {
    const markdown = createNode('markdown', { content: '# Draft' });
    const media = createNode('media', {
      assetPath: 'media/hero.png',
      contentLocator: { file: { authority: 'workspace', path: 'media/hero.png' } },
      mediaType: 'image',
    });
    const group = createNode('group', { label: 'Chapter' });
    const job = createNode('job', {
      jobRef: { kind: 'generation', jobId: 'job-owned-1' },
      title: 'Generate key art',
      status: 'running',
    });
    const file = createNode('file', {
      path: 'docs/script.fountain',
      contentLocator: { file: { authority: 'workspace', path: 'docs/script.fountain' } },
    });
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
      size: { width: 120, height: 90 },
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
      contentLocator: { file: { authority: 'workspace', path: 'media/voice.wav' } },
      mediaType: 'audio',
      duration: Number.POSITIVE_INFINITY,
      unsupportedPrompt: 'must not survive',
    });

    expect(node.size.height).toBe(60);
    expect(node.data).not.toHaveProperty('unsupportedPrompt');
    expect((node.data as Record<string, unknown>).duration).toBeUndefined();
  });

  it('uses the compact content-specific Generation size', () => {
    const prompt = createNode('generation', { ...createCanvasGenerationNodeData('prompt') });
    const image = createNode('generation', { ...createCanvasGenerationNodeData('image') });
    const audio = createNode('generation', { ...createCanvasGenerationNodeData('audio') });

    expect(prompt.size).toEqual({ width: 120, height: 80 });
    expect(image.size).toEqual({ width: 120, height: 90 });
    expect(audio.size).toEqual({ width: 120, height: 60 });
  });

  it('rejects unsupported node types at the authoring boundary', () => {
    expect(() => createNode('shot' as CanonicalCanvasNodeType, {})).toThrow(
      'Unsupported Canvas node type "shot"',
    );
  });

  it('rejects unowned Job projections and source-backed nodes without sources', () => {
    expect(() => createNode('job', {})).toThrow('Canvas jobRef must contain');
    expect(() =>
      createNode('media', { assetPath: 'media/path-only.png', mediaType: 'image' }),
    ).toThrow('Canvas Media creation requires a canonical ContentLocator');
    expect(() => createNode('file', { path: 'docs/path-only.md' })).toThrow(
      'Canvas File creation requires a canonical ContentLocator',
    );
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
