import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createResourceRef, type CanvasNode } from '@neko/shared';
import { SelectionMaterialGenerationBar } from './SelectionMaterialGenerationBar';

const resourceRef = createResourceRef({
  id: 'generated-image-1',
  scope: 'project',
  provider: 'generated-output',
  kind: 'generated',
  source: { kind: 'generated-asset', generatedAssetId: 'generated-image-1' },
  locator: { kind: 'generated-asset', assetId: 'generated-image-1' },
  fingerprint: { strategy: 'hash', value: 'sha256:generated-image-1' },
});

describe('SelectionMaterialGenerationBar', () => {
  it('shows prompt metadata and quick generation for a generated Shot', () => {
    const node = shotNode('shot-1', {
      generatedAsset: {
        path: 'neko/generated/image/shot-1.png',
        resourceRef,
        prompt: 'Cold industrial corridor',
        model: 'image-model-v2',
        ratio: '16:9',
      },
    });

    const markup = render(node, [node]);

    expect(markup).toContain('data-material-generation-context="true"');
    expect(markup).toContain('data-material-generation-target="shot-1"');
    expect(markup).toContain('Cold industrial corridor');
    expect(markup).toContain('image-model-v2 · 16:9');
    expect(markup).toContain('data-material-generation-action="open-generation-panel"');
  });

  it('shows missing prompt provenance without a failing quick action for legacy media', () => {
    const node = mediaNode('legacy-generated', {
      assetPath: '',
      mediaType: 'image',
      resourceRef,
    });

    const markup = render(node, [node]);

    expect(markup).toContain('data-material-generation-context="true"');
    expect(markup).toContain('No generation prompt was recorded');
    expect(markup).not.toContain('data-material-generation-action');
  });
});

function render(node: CanvasNode, nodes: readonly CanvasNode[]): string {
  return renderToStaticMarkup(
    <SelectionMaterialGenerationBar
      nodes={nodes}
      selectedNodeIds={[node.id]}
      viewport={{ pan: { x: 0, y: 0 }, zoom: 1 }}
      viewportSize={{ width: 800, height: 600 }}
    />,
  );
}

function mediaNode(id: string, data: Record<string, unknown>): CanvasNode {
  return {
    id,
    type: 'media',
    position: { x: 100, y: 100 },
    size: { width: 280, height: 200 },
    zIndex: 1,
    data,
  } as CanvasNode;
}

function shotNode(id: string, data: Record<string, unknown>): CanvasNode {
  return {
    id,
    type: 'shot',
    position: { x: 100, y: 100 },
    size: { width: 280, height: 200 },
    zIndex: 1,
    data,
  } as CanvasNode;
}
