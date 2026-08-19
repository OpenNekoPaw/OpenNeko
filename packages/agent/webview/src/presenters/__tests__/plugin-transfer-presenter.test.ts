import { describe, expect, it } from 'vitest';
import {
  projectCanvasContentTransferTarget,
  projectPluginTransferMenu,
} from '../plugin-transfer-presenter';

describe('plugin transfer presenter', () => {
  it('projects plugin transfer menu targets by media type and availability', () => {
    expect(
      projectPluginTransferMenu({
        mediaType: 'image',
        plugins: { canvas: true, cut: false },
      }),
    ).toEqual({
      showMenu: true,
      targets: [
        {
          id: 'canvas',
          label: 'Canvas',
          accepts: ['image'],
          requiresPlugin: 'canvas',
        },
        {
          id: 'explorer',
          label: 'Explorer',
          accepts: ['image', 'video', 'audio', 'model'],
          requiresPlugin: null,
        },
      ],
    });

    expect(
      projectPluginTransferMenu({
        mediaType: 'video',
        plugins: { canvas: true, cut: true },
      }).targets.map((target) => target.id),
    ).toEqual(['explorer']);

    expect(
      projectPluginTransferMenu({
        mediaType: 'audio',
        plugins: {},
      }),
    ).toEqual({
      showMenu: true,
      targets: [
        {
          id: 'explorer',
          label: 'Explorer',
          accepts: ['image', 'video', 'audio', 'model'],
          requiresPlugin: null,
        },
      ],
    });

    expect(
      projectPluginTransferMenu({
        mediaType: 'model',
        plugins: {},
      }).targets.map((target) => target.id),
    ).toEqual(['explorer']);
  });

  it('hides structured Cut storyboard transfer until the OTIO target is registered', () => {
    expect(
      projectPluginTransferMenu({
        mediaType: 'image',
        plugins: { canvas: true, cut: true },
        structuredKind: 'cutStoryboard',
      }).targets.map((target) => target.id),
    ).toEqual([]);
  });

  it('projects Canvas content transfer targets from selected node context', () => {
    expect(
      projectCanvasContentTransferTarget({
        ambientNodes: [{ nodeId: 'markdown-1', type: 'markdown', summary: 'Brief' }],
      }),
    ).toEqual({ plugin: 'canvas', nodeId: 'markdown-1', mode: 'append' });

    expect(
      projectCanvasContentTransferTarget({
        ambientNodes: [{ nodeId: 'group-1', type: 'group', summary: 'Act one' }],
      }),
    ).toEqual({ plugin: 'canvas', containerId: 'group-1', mode: 'create-child' });

    expect(
      projectCanvasContentTransferTarget({
        contextChips: [
          {
            type: 'canvas-node',
            id: 'group-2',
            label: 'Group',
            summary: 'References',
            data: { type: 'group' },
          },
        ],
      }),
    ).toEqual({ plugin: 'canvas', containerId: 'group-2', mode: 'create-child' });

    expect(
      projectCanvasContentTransferTarget({
        ambientNodes: [
          { nodeId: 'markdown-1', type: 'markdown', summary: 'Brief' },
          { nodeId: 'media-1', type: 'media', summary: 'Image' },
        ],
      }),
    ).toEqual({ plugin: 'canvas', mode: 'insert' });
  });
});
