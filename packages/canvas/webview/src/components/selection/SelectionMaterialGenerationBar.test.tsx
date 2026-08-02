// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  CanvasGenerationEvidence,
  CanvasNode,
  FileCanvasNode,
  MediaCanvasNode,
} from '@neko/canvas-domain';
import { setLocale } from '../../i18n';
import { SelectionMaterialGenerationBar } from './SelectionMaterialGenerationBar';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const generation: CanvasGenerationEvidence = {
  jobRef: { kind: 'generation', jobId: 'generation-job-1' },
  summary: {
    prompt: 'Cold industrial corridor',
    model: 'image-model-v2',
    aspectRatio: '16:9',
  },
};

describe('SelectionMaterialGenerationBar', () => {
  beforeEach(() => {
    setLocale('en');
  });

  it('shows immutable prompt metadata for generated canonical media', () => {
    const node = mediaNode('generated-media', {
      assetPath: 'neko/generated/generation-job-1/result.png',
      contentLocator: {
        kind: 'generated-output',
        outputId: 'output-1',
        revision: '1',
        digest: 'sha256:generated-output-1',
        path: 'neko/generated/generation-job-1/result.png',
      },
      mediaType: 'image',
      generation,
    });

    const markup = render(node);

    expect(markup).toContain('data-material-generation-context="true"');
    expect(markup).toContain('Cold industrial corridor');
    expect(markup).toContain('image-model-v2 · 16:9');
    expect(markup).not.toContain('data-material-generation-action');
  });

  it('omits legacy heuristic-only generation context', () => {
    const node = mediaNode('legacy-generated', {
      assetPath: 'legacy/generated.png',
      mediaType: 'image',
      generationContext: { prompt: 'Legacy prompt' },
    });

    const markup = render(node);

    expect(markup).toBe('');
  });

  it('does not infer regenerate authority from a source node reference', () => {
    const node = mediaNode('generated-media', {
      assetPath: 'neko/generated/generation-job-1/result.png',
      contentLocator: {
        kind: 'generated-output',
        outputId: 'output-1',
        revision: '1',
        digest: 'sha256:generated-output-1',
        path: 'neko/generated/generation-job-1/result.png',
      },
      mediaType: 'image',
      generation: {
        ...generation,
        summary: { ...generation.summary, sourceNodeId: 'source-node' },
      },
    });

    const markup = render(node);
    expect(markup).toContain('data-material-generation-context="true"');
    expect(markup).not.toContain('generate-again');
  });

  it('shows the same immutable summary for generated document File nodes', () => {
    const node: FileCanvasNode = {
      id: 'generated-document',
      type: 'file',
      position: { x: 100, y: 100 },
      size: { width: 360, height: 480 },
      zIndex: 1,
      data: {
        path: 'neko/generated/document/storyboard.md',
        title: 'storyboard.md',
        mediaKind: 'document',
        contentLocator: {
          kind: 'generated-output',
          outputId: 'generated-document-1',
          revision: '1',
          digest: 'sha256:generated-document-1',
          path: 'neko/generated/document/storyboard.md',
        },
        generation: {
          ...generation,
          summary: {
            prompt: 'Create a six-shot storyboard',
            model: 'document-model-v1',
          },
        },
      },
    };

    const markup = render(node);

    expect(markup).toContain('data-material-generation-context="true"');
    expect(markup).toContain('Create a six-shot storyboard');
    expect(markup).toContain('document-model-v1');
  });
});

function render(node: CanvasNode): string {
  return renderToStaticMarkup(
    <SelectionMaterialGenerationBar
      nodes={[node]}
      selectedNodeIds={[node.id]}
      viewport={{ pan: { x: 0, y: 0 }, zoom: 1 }}
      viewportSize={{ width: 800, height: 600 }}
    />,
  );
}

function mediaNode(id: string, data: MediaCanvasNode['data']): MediaCanvasNode {
  return {
    id,
    type: 'media',
    position: { x: 100, y: 100 },
    size: { width: 280, height: 200 },
    zIndex: 1,
    data,
  };
}
