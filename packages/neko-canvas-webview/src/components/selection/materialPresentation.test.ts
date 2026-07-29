import { describe, expect, it } from 'vitest';
import { createResourceRef, type CanvasNode } from '@neko/shared';
import { resolveCanvasMaterialPresentation } from './materialPresentation';

const generatedResourceRef = createResourceRef({
  id: 'generated-image-1',
  scope: 'project',
  provider: 'generated-output',
  kind: 'generated',
  source: { kind: 'generated-asset', generatedAssetId: 'generated-image-1' },
  locator: { kind: 'generated-asset', assetId: 'generated-image-1' },
  fingerprint: { strategy: 'hash', value: 'sha256:generated-image-1' },
});

describe('resolveCanvasMaterialPresentation', () => {
  it('projects referenced image capabilities without generation context', () => {
    const node = mediaNode('reference', {
      assetPath: 'assets/reference.png',
      mediaType: 'image',
    });

    expect(resolveCanvasMaterialPresentation(node, [node])).toEqual({
      source: 'referenced',
      mediaType: 'image',
      canPreview: true,
      canCopyToMediaLibrary: true,
    });
  });

  it('projects generated media provenance and resolves an existing canonical source target', () => {
    const source = markdownNode('prompt-1');
    const node = mediaNode('generated', {
      assetPath: '',
      mediaType: 'image',
      resourceRef: generatedResourceRef,
      generationContext: {
        prompt: 'Monolithic city at night',
        model: 'image-model-v2',
        sourceNodeId: source.id,
        aspectRatio: '16:9',
      },
    });

    expect(resolveCanvasMaterialPresentation(node, [node, source])).toMatchObject({
      source: 'generated',
      mediaType: 'image',
      generation: {
        prompt: 'Monolithic city at night',
        model: 'image-model-v2',
        targetNodeId: 'prompt-1',
      },
    });
  });

  it('keeps generated audio eligible for the canonical Agent Job workflow', () => {
    const source = markdownNode('prompt-1');
    const node = mediaNode('generated-audio', {
      assetPath: 'neko/generated/audio/shot-1.wav',
      mediaType: 'audio',
      generationContext: {
        prompt: 'Low industrial ambience',
        sourceNodeId: source.id,
        duration: 12,
      },
    });

    expect(resolveCanvasMaterialPresentation(node, [node, source])).toMatchObject({
      source: 'generated',
      mediaType: 'audio',
      generation: {
        prompt: 'Low industrial ambience',
        duration: 12,
      },
    });
    expect(resolveCanvasMaterialPresentation(node, [node, source])?.generation?.targetNodeId).toBe(
      'prompt-1',
    );
  });

  it('identifies legacy generated media without inventing prompt or target data', () => {
    const node = mediaNode('legacy-generated', {
      assetPath: '',
      mediaType: 'image',
      resourceRef: generatedResourceRef,
    });

    expect(resolveCanvasMaterialPresentation(node, [node])).toMatchObject({
      source: 'generated',
      generation: {},
    });
  });

  it('recognizes the durable generated-output directory used by legacy imports', () => {
    const node = mediaNode('legacy-generated-path', {
      assetPath: 'neko/generated/image/task-1.png',
      mediaType: 'image',
    });

    expect(resolveCanvasMaterialPresentation(node, [node])).toMatchObject({
      source: 'generated',
      generation: {},
    });

    const variablePathNode = mediaNode('legacy-generated-variable-path', {
      assetPath: '${WORKSPACE}/neko/generated/video/task-2.mp4',
      mediaType: 'video',
    });
    expect(resolveCanvasMaterialPresentation(variablePathNode, [variablePathNode])).toMatchObject({
      source: 'generated',
      mediaType: 'video',
    });
  });
});

function mediaNode(id: string, data: Record<string, unknown>): CanvasNode {
  return {
    id,
    type: 'media',
    position: { x: 0, y: 0 },
    size: { width: 280, height: 200 },
    zIndex: 1,
    data,
  } as CanvasNode;
}

function markdownNode(id: string): CanvasNode {
  return {
    id,
    type: 'markdown',
    position: { x: 0, y: 0 },
    size: { width: 280, height: 200 },
    zIndex: 1,
    data: { content: '# Prompt' },
  };
}
