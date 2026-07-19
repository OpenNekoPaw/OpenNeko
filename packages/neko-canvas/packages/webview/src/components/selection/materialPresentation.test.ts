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
      canPromoteToAssetLibrary: true,
    });
  });

  it('projects generated media provenance and resolves an existing Shot target', () => {
    const shot = shotNode('shot-1');
    const node = mediaNode('generated', {
      assetPath: '',
      mediaType: 'image',
      resourceRef: generatedResourceRef,
      generationContext: {
        prompt: 'Monolithic city at night',
        model: 'image-model-v2',
        sourceNodeId: shot.id,
        aspectRatio: '16:9',
      },
    });

    expect(resolveCanvasMaterialPresentation(node, [node, shot])).toMatchObject({
      source: 'generated',
      mediaType: 'image',
      generation: {
        prompt: 'Monolithic city at night',
        model: 'image-model-v2',
        targetNodeId: 'shot-1',
      },
    });
  });

  it('does not route generated audio into the image and video generation panel', () => {
    const shot = shotNode('shot-1');
    const node = mediaNode('generated-audio', {
      assetPath: 'neko/generated/audio/shot-1.wav',
      mediaType: 'audio',
      generationContext: {
        prompt: 'Low industrial ambience',
        sourceNodeId: shot.id,
        duration: 12,
      },
    });

    expect(resolveCanvasMaterialPresentation(node, [node, shot])).toMatchObject({
      source: 'generated',
      mediaType: 'audio',
      generation: {
        prompt: 'Low industrial ambience',
        duration: 12,
      },
    });
    expect(resolveCanvasMaterialPresentation(node, [node, shot])?.generation?.targetNodeId).toBe(
      undefined,
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

  it('uses Shot semantic prompt authority when historical asset prompt is absent', () => {
    const node = shotNode('shot-1', {
      generatedAsset: {
        path: 'neko/generated/image/shot-1.png',
        resourceRef: generatedResourceRef,
      },
      storyboardPrompt: {
        version: 1,
        promptBlocks: {
          imagePromptDocument: {
            version: 1,
            documentId: 'shot-1:image:prompt',
            blockKind: 'image',
            text: 'A lone traveler beneath megastructures',
          },
        },
        generationParams: { aspectRatio: '9:16', modelId: 'image-model-v2' },
      },
    });

    expect(resolveCanvasMaterialPresentation(node, [node])).toMatchObject({
      source: 'generated',
      generation: {
        prompt: 'A lone traveler beneath megastructures',
        model: 'image-model-v2',
        aspectRatio: '9:16',
        targetNodeId: 'shot-1',
      },
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

function shotNode(id: string, data: Record<string, unknown> = {}): CanvasNode {
  return {
    id,
    type: 'shot',
    position: { x: 0, y: 0 },
    size: { width: 280, height: 200 },
    zIndex: 1,
    data,
  } as CanvasNode;
}
