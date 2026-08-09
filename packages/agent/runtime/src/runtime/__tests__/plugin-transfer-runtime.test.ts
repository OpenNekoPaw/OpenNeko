import { describe, expect, it } from 'vitest';
import {
  expandRuntimePluginTransferInputs,
  buildRuntimePluginsAvailableMessage,
  createRuntimePluginSlashCommandRegistry,
} from '../plugin-transfer-runtime';

describe('plugin transfer runtime', () => {
  it('passes through non-batch transfer inputs without planning domain commands', () => {
    const input = {
      target: 'canvas',
      assetPath: '/tmp/image.png',
      mediaType: 'image',
    };

    expect(expandRuntimePluginTransferInputs(input)).toEqual([input]);
  });

  it('expands asset batch transfers into single-asset inputs', () => {
    expect(
      expandRuntimePluginTransferInputs({
        target: 'cut',
        payload: {
          kind: 'assetBatch',
          assets: [
            { path: '/tmp/a.png', mediaType: 'image' },
            { path: '/tmp/b.wav', mediaType: 'audio' },
          ],
        },
      }),
    ).toEqual([
      {
        target: 'cut',
        payload: { kind: 'singleAsset', asset: { path: '/tmp/a.png', mediaType: 'image' } },
      },
      {
        target: 'cut',
        payload: { kind: 'singleAsset', asset: { path: '/tmp/b.wav', mediaType: 'audio' } },
      },
    ]);
  });

  it('expands asset batches while carrying batch target defaults without overriding asset targets', () => {
    expect(
      expandRuntimePluginTransferInputs({
        target: 'canvas',
        payload: {
          kind: 'assetBatch',
          target: { containerId: 'scene-1', mode: 'create-child' },
          provenance: { source: 'agent', messageId: 'msg-1' },
          assets: [
            { path: '/tmp/a.png', mediaType: 'image' },
            {
              path: '/tmp/b.png',
              mediaType: 'image',
              target: { nodeId: 'media-2', mode: 'replace' },
            },
          ],
        },
      }),
    ).toEqual([
      {
        target: 'canvas',
        payload: {
          kind: 'singleAsset',
          asset: {
            path: '/tmp/a.png',
            mediaType: 'image',
          },
          target: { containerId: 'scene-1', mode: 'create-child' },
          provenance: { source: 'agent', messageId: 'msg-1' },
        },
      },
      {
        target: 'canvas',
        payload: {
          kind: 'singleAsset',
          asset: {
            path: '/tmp/b.png',
            mediaType: 'image',
            target: { nodeId: 'media-2', mode: 'replace' },
          },
          provenance: { source: 'agent', messageId: 'msg-1' },
        },
      },
    ]);
  });

  it('aggregates plugin slash commands in stable plugin order', () => {
    const registry = createRuntimePluginSlashCommandRegistry();

    registry.register('neko.z', [
      { id: 'export', name: '/export', description: 'Export storyboard' },
    ]);
    registry.register('neko.a', [
      { id: 'batch', name: '/batch', description: 'Batch generate', icon: 'image' },
    ]);

    expect(registry.getAll()).toEqual([
      {
        id: 'batch',
        name: '/batch',
        description: 'Batch generate',
        icon: 'image',
        pluginId: 'neko.a',
      },
      {
        id: 'export',
        name: '/export',
        description: 'Export storyboard',
        pluginId: 'neko.z',
      },
    ]);
  });

  it('replaces and unregisters plugin slash commands by plugin', () => {
    const registry = createRuntimePluginSlashCommandRegistry();

    registry.register('neko.canvas', [
      { id: 'batch', name: '/batch', description: 'Batch generate' },
    ]);
    registry.register('neko.canvas', [
      { id: 'export', name: '/export', description: 'Export storyboard' },
    ]);

    expect(registry.getAll()).toEqual([
      {
        id: 'export',
        name: '/export',
        description: 'Export storyboard',
        pluginId: 'neko.canvas',
      },
    ]);
    expect(registry.unregister('neko.canvas')).toBe(true);
    expect(registry.unregister('neko.canvas')).toBe(false);
    expect(registry.getAll()).toEqual([]);
  });

  it('projects installed neko plugins to a webview message', () => {
    expect(
      buildRuntimePluginsAvailableMessage({
        hasPlugin: (pluginId) => pluginId === 'neko.canvas',
      }),
    ).toEqual({
      type: 'pluginsAvailable',
      plugins: {
        canvas: true,
        cut: false,
      },
    });
  });
});
