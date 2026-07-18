import { describe, expect, it } from 'vitest';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CanvasNode } from '@neko/shared';
import { renderCanvasNode } from './nodeRendererRegistry';
import { createStoryboardNodeRendererRegistry } from '../../subsystems/storyboard/renderers';
import { createStoryboardNodeTypeDescriptors } from '../../subsystems/storyboard/descriptors';
import { createBuiltInWebviewSubsystemRegistry } from '../../subsystems/webviewSubsystemRegistry';
import { createBuiltInNodeTypeDescriptors } from './nodeTypeDescriptors';
import behaviorRegistration from '../../subsystems/behavior';
import entityRegistration from '../../subsystems/entity';
import memoryRegistration from '../../subsystems/memory';
import { buildCanvasNode } from '../../utils/nodeFactory';

describe('nodeRendererRegistry', () => {
  it('renders core groups without activating the storyboard subsystem', () => {
    const coreRenderers = createBuiltInWebviewSubsystemRegistry({}).getCoreNodeRenderers();
    const storyboardRenderers = createStoryboardNodeRendererRegistry();
    const node: CanvasNode = {
      id: 'workspace-inbox',
      type: 'group',
      position: { x: 40, y: 40 },
      size: { width: 640, height: 360 },
      zIndex: 1,
      preset: 'group.basic',
      container: { policy: 'group', childIds: [], deleteBehavior: 'release-children' },
      data: { label: 'Inbox', color: '#64748b' },
    };

    expect(coreRenderers.group).toBeTypeOf('function');
    expect(storyboardRenderers.group).toBeUndefined();
    const markup = renderToStaticMarkup(
      renderCanvasNode(coreRenderers, {
        node,
        allNodes: [node],
        selectedNodeIds: [],
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
        isSelected: false,
        containerRef: { current: null },
      }),
    );
    expect(markup).toContain('data-spatial-group-frame="true"');
    expect(markup).not.toContain('UNSUPPORTED');
  });

  it('registers storyboard subsystem node renderers', () => {
    const registry = createStoryboardNodeRendererRegistry();

    expect(registry.script).toBeTypeOf('function');
    expect(registry.document).toBeTypeOf('function');
    expect(registry['canvas-embed']).toBeTypeOf('function');
    expect(registry.model).toBeTypeOf('function');
    expect(registry.annotation).toBeUndefined();
    expect(registry.text).toBeUndefined();
    expect(registry.media).toBeUndefined();
    expect(registry.shot).toBeUndefined();
    expect(registry.scene).toBeUndefined();
    expect(registry.gallery).toBeUndefined();
    expect(registry.project).toBeUndefined();
  });

  it('registers storyboard subsystem node descriptors separately from core', () => {
    const descriptors = createStoryboardNodeTypeDescriptors();

    expect(descriptors.shot?.tagLabel).toBe('SHOT');
    expect(isValidElement(descriptors.shot?.icon)).toBe(true);
    expect(descriptors.scene?.defaultSize).toEqual({ width: 640, height: 400 });
    expect(descriptors.annotation).toBeUndefined();
  });

  it('declares foundational and structured presentation without persisting it in Canvas nodes', () => {
    const descriptors = createBuiltInNodeTypeDescriptors();

    expect(descriptors.media?.presentation).toBe('foundational');
    expect(descriptors.document?.presentation).toBe('foundational');
    expect(descriptors.script?.presentation).toBe('foundational');
    expect(descriptors.group?.presentation).toBe('spatial-container');
    expect(descriptors.storyboard?.presentation).toBe('structured');
    expect(descriptors.scene?.presentation).toBe('structured');
    expect(Object.values(descriptors).every((descriptor) => descriptor?.presentation)).toBe(true);

    const node = buildCanvasNode({
      type: 'media',
      position: { x: 0, y: 0 },
      data: { assetPath: 'neko/assets/reference.png', mediaType: 'image' },
      zIndex: 1,
    });
    expect(node).not.toHaveProperty('presentation');
  });

  it('renders an unsupported card for unsupported complete nodes', () => {
    const markup = renderToStaticMarkup(
      renderCanvasNode(
        {},
        {
          node: {
            id: 'future-1',
            type: 'future-node',
            position: { x: 0, y: 0 },
            size: { width: 240, height: 140 },
            zIndex: 1,
            data: { preserved: true },
          } as never,
          allNodes: [],
          selectedNodeIds: [],
          viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
          isSelected: false,
          containerRef: { current: null },
        },
      ),
    );

    expect(markup).toContain('UNSUPPORTED');
    expect(markup).toContain('future-node');
    expect(markup).toContain('preserved');
  });

  it('renders placeholder subsystem nodes through registered lightweight cards', () => {
    const registry = {
      ...behaviorRegistration.nodeRenderers,
      ...entityRegistration.nodeRenderers,
      ...memoryRegistration.nodeRenderers,
    };

    const markup = renderToStaticMarkup(
      renderCanvasNode(registry, {
        node: {
          id: 'state-1',
          type: 'state',
          position: { x: 0, y: 0 },
          size: { width: 220, height: 140 },
          zIndex: 1,
          data: { name: 'Idle', description: 'Wait for player input' },
        },
        allNodes: [],
        selectedNodeIds: [],
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
        isSelected: false,
        containerRef: { current: null },
      }),
    );

    expect(markup).toContain('STATE');
    expect(markup).toContain('Idle');
    expect(markup).toContain('Wait for player input');
    expect(markup).not.toContain('UNSUPPORTED');
  });

  it('registers descriptors for placeholder subsystem node types', () => {
    expect(behaviorRegistration.nodeTypeDescriptors?.state?.labelKey).toBe('node.state');
    expect(entityRegistration.nodeTypeDescriptors?.['representation-slot']?.labelKey).toBe(
      'node.representationSlot',
    );
    expect(memoryRegistration.nodeTypeDescriptors?.fact?.tagLabel).toBe('FACT');
  });

  it('uses localized labels for placeholder nodes with no authored title', () => {
    const node = {
      ...buildCanvasNode({
        type: 'state',
        position: { x: 0, y: 0 },
        data: {},
        zIndex: 1,
      }),
      id: 'state-2',
    };

    const markup = renderToStaticMarkup(
      renderCanvasNode(behaviorRegistration.nodeRenderers ?? {}, {
        node,
        allNodes: [],
        selectedNodeIds: [],
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
        isSelected: false,
        containerRef: { current: null },
      }),
    );

    expect(node.data).not.toHaveProperty('name');
    expect(markup).toContain('State');
    expect(markup).not.toContain('UNSUPPORTED');
  });

  it('renders project nodes through composable content instead of unsupported cards', () => {
    const node = {
      id: 'project-1',
      type: 'project',
      position: { x: 0, y: 0 },
      size: { width: 260, height: 180 },
      zIndex: 1,
      data: {
        projectPath: 'projects/demo.nkv',
        projectTitle: 'Demo',
        projectType: 'nkv',
      },
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      renderCanvasNode(
        {},
        {
          node,
          allNodes: [node],
          selectedNodeIds: [],
          viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
          isSelected: false,
          containerRef: { current: null },
        },
      ),
    );

    expect(markup).toContain('PROJECT');
    expect(markup).toContain('data-content-block-id="project-asset-preview"');
    expect(markup).not.toContain('UNSUPPORTED');
  });
});
