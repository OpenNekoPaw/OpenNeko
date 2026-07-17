import { describe, expect, it, vi } from 'vitest';
import type { CanvasNode } from '@neko/shared';
import { createNodeLibraryGroups } from '../components/panels/NodeLibraryPanel';
import { mediaCardPolicy } from '../components/content/node-card';
import { cullNodes } from '../utils/viewportCulling';
import { createCoreNodeTypeDescriptors } from './core/descriptors';
import { createStoryboardNodeTypeDescriptors } from './storyboard/descriptors';
import {
  BASIC_CANVAS_NODE_TYPES,
  createBasicNodeLibraryDescriptors,
} from './basicNodeLibraryCatalog';

describe('Basic Canvas node library catalog', () => {
  it('projects only foundational entries from their owning descriptors', () => {
    const coreDescriptors = createCoreNodeTypeDescriptors();
    const storyboardDescriptors = createStoryboardNodeTypeDescriptors();
    const basicDescriptors = createBasicNodeLibraryDescriptors(
      coreDescriptors,
      storyboardDescriptors,
    );

    expect(Object.keys(basicDescriptors)).toEqual(BASIC_CANVAS_NODE_TYPES);
    for (const nodeType of BASIC_CANVAS_NODE_TYPES) {
      expect(basicDescriptors[nodeType]).toBe(
        coreDescriptors[nodeType] ?? storyboardDescriptors[nodeType],
      );
    }
  });

  it('excludes specialized Storyboard, production, and professional entries', () => {
    const basicDescriptors = createBasicNodeLibraryDescriptors(
      createCoreNodeTypeDescriptors(),
      createStoryboardNodeTypeDescriptors(),
    );

    expect(basicDescriptors).not.toHaveProperty('storyboard');
    expect(basicDescriptors).not.toHaveProperty('table');
    expect(basicDescriptors).not.toHaveProperty('scene');
    expect(basicDescriptors).not.toHaveProperty('shot');
    expect(basicDescriptors).not.toHaveProperty('gallery');
    expect(basicDescriptors).not.toHaveProperty('model');
    expect(basicDescriptors).not.toHaveProperty('canvas-embed');
    expect(basicDescriptors).not.toHaveProperty('project');
  });

  it('keeps foundational creation and file/reference groups without subsystem entries', () => {
    const groups = createNodeLibraryGroups(
      createBasicNodeLibraryDescriptors(
        createCoreNodeTypeDescriptors(),
        createStoryboardNodeTypeDescriptors(),
      ),
      [],
    );

    expect(groups.map((group) => group.id)).toEqual(['core', 'file-references']);
    expect(groups[0]?.nodeTypes).toEqual(['annotation', 'group', 'text', 'artboard']);
    expect(groups[1]?.nodeTypes).toEqual(['media', 'script', 'document']);
    expect(groups.every((group) => group.subsystemId === undefined)).toBe(true);
  });

  it('does not narrow the owning Professional descriptor registry', () => {
    const professionalDescriptors = createStoryboardNodeTypeDescriptors();

    expect(Object.keys(professionalDescriptors)).toEqual([
      'storyboard',
      'artboard',
      'table',
      'shot',
      'scene',
      'gallery',
      'script',
      'document',
      'model',
      'canvas-embed',
      'project',
    ]);
  });

  it('fails visibly if an owning foundational descriptor disappears', () => {
    expect(() => createBasicNodeLibraryDescriptors({}, {})).toThrow(
      'Missing owning Canvas descriptor for Basic node type "media".',
    );
  });

  it('keeps large off-screen media lazy and missing visible sources fail-safe', () => {
    const basicDescriptors = createBasicNodeLibraryDescriptors(
      createCoreNodeTypeDescriptors(),
      createStoryboardNodeTypeDescriptors(),
    );
    const offscreenMedia = Array.from({ length: 2_000 }, (_, index): CanvasNode => ({
      id: `offscreen-media-${index}`,
      type: 'media',
      position: { x: 5_000 + index * 320, y: 5_000 },
      size: basicDescriptors.media!.defaultSize,
      zIndex: index,
      data: { assetPath: `neko/generated/image/${index}.png`, mediaType: 'image' },
    }));
    const missingVisibleMedia: CanvasNode = {
      id: 'visible-missing-media',
      type: 'media',
      position: { x: 40, y: 40 },
      size: basicDescriptors.media!.defaultSize,
      zIndex: 2_001,
      data: {
        assetPath: '',
        mediaType: 'image',
        documentResourceStatus: {
          state: 'unavailable',
          reason: 'cache-missing',
          message: 'Source is unavailable.',
        },
      },
    };
    const preview = vi.spyOn(mediaCardPolicy, 'resolvePreviewSource');

    const result = cullNodes(
      [missingVisibleMedia, ...offscreenMedia],
      { pan: { x: 0, y: 0 }, zoom: 1 },
      1_024,
      768,
    );
    const resolved = result.visibleNodes
      .filter((node) => node.type === 'media')
      .map((node) => mediaCardPolicy.resolvePreviewSource(node));

    expect(result).toMatchObject({ totalCount: 2_001, culledCount: 2_000 });
    expect(preview).toHaveBeenCalledTimes(1);
    expect(resolved[0]).toMatchObject({
      renderForm: 'asset-thumbnail',
      source: { asset: undefined, variants: undefined },
    });
    expect(JSON.stringify(resolved)).not.toMatch(/runtimeUrl|renderUri|\.neko\/\.cache/);
  });
});
