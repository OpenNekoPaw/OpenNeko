import { describe, expect, it } from 'vitest';
import type {
  CanvasNode,
  GroupCanvasNode,
  SceneGroupCanvasNode,
  ShotCanvasNode,
} from '@neko/shared';
import { projectCanvasNodeRenderPlan } from './canvasOrganization';

describe('projectCanvasNodeRenderPlan', () => {
  it('renders expanded manual Group descendants and hides managed container descendants', () => {
    const nodes = [
      group('group-1'),
      media('group-child', 'group-1'),
      scene('scene-1'),
      shot('scene-child', 'scene-1'),
    ];

    const plan = projectCanvasNodeRenderPlan(nodes);

    expect(plan.nodes.map((node) => node.id)).toEqual(['group-1', 'scene-1', 'group-child']);
    expect(plan.hiddenNodeIds).toEqual(new Set(['scene-child']));
    expect(plan.expandedSpatialContainerIds).toEqual(new Set(['group-1']));
  });

  it('supports nested manual Groups and hides exact descendants when collapsed', () => {
    const expanded = [
      group('outer'),
      { ...group('inner'), parentId: 'outer' },
      media('child', 'inner'),
    ];
    expect(projectCanvasNodeRenderPlan(expanded).nodes.map((node) => node.id)).toEqual([
      'outer',
      'inner',
      'child',
    ]);

    const collapsed = [
      { ...group('outer'), container: { policy: 'group', childIds: [], collapsed: true } },
      { ...group('inner'), parentId: 'outer' },
      media('child', 'inner'),
    ];
    const collapsedPlan = projectCanvasNodeRenderPlan(collapsed);
    expect(collapsedPlan.nodes.map((node) => node.id)).toEqual(['outer']);
    expect(collapsedPlan.expandedSpatialContainerIds).toEqual(new Set());
  });

  it('fails visibly for cycles instead of silently dropping nodes', () => {
    expect(() =>
      projectCanvasNodeRenderPlan([
        { ...group('a'), parentId: 'b' },
        { ...group('b'), parentId: 'a' },
      ]),
    ).toThrow(/container cycle/);
  });
});

function group(id: string): GroupCanvasNode {
  return {
    id,
    type: 'group',
    position: { x: 0, y: 0 },
    size: { width: 400, height: 300 },
    zIndex: 1,
    container: { policy: 'group', childIds: [] },
    data: { label: id },
  };
}

function media(id: string, parentId: string): CanvasNode {
  return {
    id,
    type: 'media',
    parentId,
    position: { x: 20, y: 60 },
    size: { width: 200, height: 120 },
    zIndex: 2,
    data: { assetPath: 'neko/assets/files/image/test.png', mediaType: 'image' },
  };
}

function scene(id: string): SceneGroupCanvasNode {
  return {
    id,
    type: 'scene',
    position: { x: 500, y: 0 },
    size: { width: 400, height: 300 },
    zIndex: 1,
    container: { policy: 'scene', childIds: [] },
    data: { sceneId: id, sceneTitle: id, sceneNumber: 1 },
  };
}

function shot(id: string, parentId: string): ShotCanvasNode {
  return {
    id,
    type: 'shot',
    parentId,
    position: { x: 520, y: 60 },
    size: { width: 200, height: 120 },
    zIndex: 2,
    data: {
      shotNumber: 1,
      duration: 3,
      visualDescription: id,
      characters: [],
      shotScale: 'MS',
      characterAction: '',
      emotion: [],
      sceneTags: [],
      generationStatus: 'idle',
      generationHistory: [],
    },
  };
}
