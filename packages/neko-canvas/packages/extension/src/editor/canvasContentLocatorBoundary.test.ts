import { describe, expect, it, vi } from 'vitest';
import {
  projectCanvasContentLocatorRuntimeState,
  stripCanvasContentLocatorRuntimeState,
} from './canvasContentLocatorBoundary';

const generatedLocator = {
  kind: 'generated-output' as const,
  outputId: 'station-concept',
  revision: 'rev-station-concept',
  digest: 'sha256:station-concept',
  path: 'neko/generated/image/station-concept.png',
};

describe('Canvas content locator persistence boundary', () => {
  it('projects a Board node for one Webview and strips runtime state before save', async () => {
    const node = {
      id: 'board-image',
      type: 'media',
      data: {
        assetPath: '',
        mediaType: 'image',
        contentLocator: generatedLocator,
      },
    };
    const project = vi.fn(async () => 'vscode-webview://panel-a/station-concept.png');

    await expect(projectCanvasContentLocatorRuntimeState(node, project)).resolves.toEqual([]);
    expect(node.data.runtimeAssetPath).toBe('vscode-webview://panel-a/station-concept.png');

    stripCanvasContentLocatorRuntimeState(node);

    expect(node.data).toEqual({
      assetPath: '',
      mediaType: 'image',
      contentLocator: generatedLocator,
    });
    expect(JSON.stringify(node)).not.toContain('vscode-webview://');
  });

  it('reopens Shot generated content with a fresh panel projection', async () => {
    const saved = {
      id: 'shot-1',
      type: 'shot',
      data: {
        generatedAsset: {
          type: 'generated-image',
          id: 'station-concept',
          contentLocator: generatedLocator,
        },
      },
    };
    const firstRuntime = structuredClone(saved);
    await projectCanvasContentLocatorRuntimeState(
      firstRuntime,
      async () => 'vscode-webview://panel-a/station-concept.png',
    );
    stripCanvasContentLocatorRuntimeState(firstRuntime);

    const reopened = structuredClone(firstRuntime);
    await projectCanvasContentLocatorRuntimeState(
      reopened,
      async () => 'vscode-webview://panel-b/station-concept.png',
    );

    expect(reopened.data.generatedAsset).toEqual(
      expect.objectContaining({
        contentLocator: generatedLocator,
        path: 'vscode-webview://panel-b/station-concept.png',
      }),
    );
    expect(JSON.stringify(firstRuntime)).not.toContain('panel-a');
  });

  it('fails visibly instead of combining locator and legacy identity', async () => {
    const node = {
      id: 'legacy-image',
      type: 'media',
      data: {
        contentLocator: generatedLocator,
        resourceRef: { id: 'legacy-resource' },
      },
    };

    await expect(
      projectCanvasContentLocatorRuntimeState(node, async () => 'vscode-webview://panel/image.png'),
    ).rejects.toThrow(/canvas-content-locator-migration-required/u);
    expect(() => stripCanvasContentLocatorRuntimeState(node)).toThrow(
      /canvas-content-locator-migration-required/u,
    );
  });
});
