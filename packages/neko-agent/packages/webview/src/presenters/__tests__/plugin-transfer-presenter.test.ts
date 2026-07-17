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
        plugins: { canvas: true, cut: false, sketch: true },
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
          id: 'sketch',
          label: 'Sketch',
          accepts: ['image'],
          requiresPlugin: 'sketch',
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
    ).toEqual(['cut', 'explorer']);

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
        plugins: { model: true },
      }).targets.map((target) => target.id),
    ).toEqual(['model', 'explorer']);
  });

  it('limits structured cut storyboard payloads to the timeline target', () => {
    expect(
      projectPluginTransferMenu({
        mediaType: 'image',
        plugins: { canvas: true, cut: true },
        structuredKind: 'cutStoryboard',
      }).targets.map((target) => target.id),
    ).toEqual(['cut']);
  });

  it('projects Canvas content transfer targets from selected node context', () => {
    expect(
      projectCanvasContentTransferTarget({
        ambientNodes: [{ nodeId: 'shot-1', type: 'shot', summary: 'Shot 1' }],
      }),
    ).toEqual({ plugin: 'canvas', nodeId: 'shot-1', mode: 'append' });

    expect(
      projectCanvasContentTransferTarget({
        ambientNodes: [{ nodeId: 'scene-1', type: 'scene', summary: 'Scene 1' }],
      }),
    ).toEqual({ plugin: 'canvas', containerId: 'scene-1', mode: 'create-child' });

    expect(
      projectCanvasContentTransferTarget({
        contextChips: [
          {
            type: 'canvas-node',
            id: 'gallery-1',
            label: 'Gallery',
            summary: 'Gallery',
            data: { type: 'gallery' },
          },
        ],
      }),
    ).toEqual({ plugin: 'canvas', containerId: 'gallery-1', mode: 'create-child' });

    expect(
      projectCanvasContentTransferTarget({
        ambientNodes: [
          { nodeId: 'shot-1', type: 'shot', summary: 'Shot 1' },
          { nodeId: 'shot-2', type: 'shot', summary: 'Shot 2' },
        ],
      }),
    ).toEqual({ plugin: 'canvas', mode: 'insert' });
  });
});
