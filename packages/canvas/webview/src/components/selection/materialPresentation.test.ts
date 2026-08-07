import { describe, expect, it } from 'vitest';
import type {
  CanvasGenerationEvidence,
  FileCanvasNode,
  MediaCanvasNode,
} from '@neko/canvas-domain';
import { resolveCanvasMaterialPresentation } from './materialPresentation';

const generatedLocator = {
  kind: 'generated-output',
  outputId: 'generated-image-1',
  digest: 'sha256:generated-image-1',
  path: 'neko/generated/image/generated-image-1.png',
} as const;

describe('resolveCanvasMaterialPresentation', () => {
  it('projects referenced image capabilities without generation context', () => {
    const node = mediaNode('reference', {
      assetPath: 'assets/reference.png',
      mediaType: 'image',
      contentLocator: {
        kind: 'workspace-file',
        path: 'assets/reference.png',
      },
    });

    expect(resolveCanvasMaterialPresentation(node)).toEqual({
      source: 'referenced',
      mediaType: 'image',
      canPreview: true,
      canCopyToMediaLibrary: true,
    });
  });

  it('projects generated media provenance without deriving execution authority from lineage', () => {
    const node = mediaNode('generated', {
      assetPath: generatedLocator.path,
      mediaType: 'image',
      contentLocator: generatedLocator,
      generation: generationEvidence({
        prompt: 'Monolithic city at night',
        model: 'image-model-current',
        sourceNodeId: 'prompt-1',
        aspectRatio: '16:9',
      }),
    });

    expect(resolveCanvasMaterialPresentation(node)).toEqual({
      source: 'generated',
      mediaType: 'image',
      canPreview: true,
      canCopyToMediaLibrary: true,
      generation: {
        prompt: 'Monolithic city at night',
        model: 'image-model-current',
        sourceNodeId: 'prompt-1',
        aspectRatio: '16:9',
      },
    });
  });

  it('projects generated audio historical evidence without adding an action target', () => {
    const node = mediaNode('generated-audio', {
      assetPath: 'neko/generated/audio/shot-1.wav',
      mediaType: 'audio',
      contentLocator: {
        ...generatedLocator,
        outputId: 'generated-audio-1',
        digest: 'sha256:generated-audio-1',
        path: 'neko/generated/audio/shot-1.wav',
      },
      generation: generationEvidence({
        prompt: 'Low industrial ambience',
        sourceNodeId: 'prompt-1',
        duration: 12,
      }),
    });

    expect(resolveCanvasMaterialPresentation(node)).toMatchObject({
      source: 'generated',
      mediaType: 'audio',
      generation: {
        prompt: 'Low industrial ambience',
        duration: 12,
      },
    });
    expect(resolveCanvasMaterialPresentation(node)?.generation).not.toHaveProperty('targetNodeId');
  });

  it('projects generated document evidence for canonical File nodes', () => {
    const node: FileCanvasNode = {
      id: 'generated-document',
      type: 'file',
      position: { x: 0, y: 0 },
      size: { width: 360, height: 480 },
      zIndex: 1,
      data: {
        path: 'neko/generated/document/storyboard.md',
        title: 'storyboard.md',
        mediaKind: 'document',
        contentLocator: {
          ...generatedLocator,
          outputId: 'generated-document-1',
          digest: 'sha256:generated-document-1',
          path: 'neko/generated/document/storyboard.md',
        },
        generation: generationEvidence({
          prompt: 'Create a six-shot storyboard',
          model: 'document-model-current',
        }),
      },
    };

    expect(resolveCanvasMaterialPresentation(node)).toEqual({
      source: 'generated',
      canPreview: true,
      canCopyToMediaLibrary: true,
      generation: {
        prompt: 'Create a six-shot storyboard',
        model: 'document-model-current',
      },
    });
  });

  it('does not classify paths or generic provenance as generated material', () => {
    const data: MediaCanvasNode['data'] = {
      assetPath: 'neko/generated/image/task-1.png',
      mediaType: 'image',
      provenance: { projectionId: 'generated-output:unsupported' },
    };
    const node = mediaNode('unsupported-generated-path', data);

    expect(resolveCanvasMaterialPresentation(node)).toBeUndefined();
  });

  it('fails closed when a generated locator lacks canonical Generation evidence', () => {
    const node = mediaNode('generated-without-job', {
      assetPath: generatedLocator.path,
      contentLocator: generatedLocator,
      mediaType: 'image',
    });

    expect(resolveCanvasMaterialPresentation(node)).toBeUndefined();
  });
});

function mediaNode(id: string, data: MediaCanvasNode['data']): MediaCanvasNode {
  return {
    id,
    type: 'media',
    position: { x: 0, y: 0 },
    size: { width: 280, height: 200 },
    zIndex: 1,
    data,
  };
}

function generationEvidence(
  summary: CanvasGenerationEvidence['summary'],
): CanvasGenerationEvidence {
  return {
    jobRef: { kind: 'generation', jobId: 'generation-job-1' },
    summary,
  };
}
