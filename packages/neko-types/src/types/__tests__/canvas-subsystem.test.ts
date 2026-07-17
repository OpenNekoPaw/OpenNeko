import { describe, expect, it } from 'vitest';
import type { CanvasData, RegisteredCanvasNode } from '../canvas';
import {
  applyCanvasSubsystemMetadataDefaults,
  BUILT_IN_CANVAS_SUBSYSTEM_MANIFESTS,
  createBuiltInCanvasSubsystemManifestRegistry,
  getCanvasActiveSubsystems,
  summarizeCanvasSubsystems,
} from '../canvas-subsystem';

function createRegisteredNode(type: RegisteredCanvasNode['type']): RegisteredCanvasNode {
  return {
    id: `${type}-1`,
    type,
    position: { x: 0, y: 0 },
    size: { width: 200, height: 120 },
    zIndex: 1,
    data: {},
  };
}

function createCanvas(nodes: CanvasData['nodes']): CanvasData {
  return {
    version: '2.1',
    name: 'Subsystem Fixture',
    nodes,
    connections: [],
  };
}

describe('canvas subsystem contracts', () => {
  it('declares serializable built-in subsystem manifests', () => {
    const manifestsJson = JSON.stringify(BUILT_IN_CANVAS_SUBSYSTEM_MANIFESTS);

    expect(JSON.parse(manifestsJson)).toHaveLength(5);
    expect(createBuiltInCanvasSubsystemManifestRegistry().get('narrative')).toMatchObject({
      id: 'narrative',
      triggerNodeTypes: [
        'narrative-start',
        'choice',
        'merge',
        'narrative-scene',
        'narrative-note',
        'narrative-ending',
      ],
      metadata: {
        key: 'narrative',
        defaultValue: { variables: [], genre: 'illustrated-text' },
      },
    });
    expect(
      createBuiltInCanvasSubsystemManifestRegistry().get('storyboard')?.triggerNodeTypes,
    ).toContain('table');
  });

  it('summarizes active subsystems from actual node types', () => {
    const canvas = createCanvas([
      createRegisteredNode('choice'),
      createRegisteredNode('state'),
      createRegisteredNode('choice'),
    ]);

    expect(getCanvasActiveSubsystems(canvas)).toEqual(['narrative', 'behavior']);
    expect(summarizeCanvasSubsystems(canvas)).toEqual({
      activeSubsystems: ['narrative', 'behavior'],
      nodeTypeSummary: {
        choice: 2,
        state: 1,
      },
    });
  });

  it('applies metadata defaults only for active subsystems and preserves existing data', () => {
    const canvas = createCanvas([createRegisteredNode('choice'), createRegisteredNode('memory')]);
    const withDefaults = applyCanvasSubsystemMetadataDefaults(canvas);

    expect(withDefaults).not.toBe(canvas);
    expect(withDefaults.narrative).toEqual({ variables: [], genre: 'illustrated-text' });
    expect(withDefaults.memoryGraph).toEqual({});
    expect(withDefaults.behavior).toBeUndefined();

    const withExisting = applyCanvasSubsystemMetadataDefaults({
      ...canvas,
      narrative: {
        entryNodeId: 'existing-entry',
        variables: [{ id: 'var-1', name: 'score', value: 3 }],
      },
    });

    expect(withExisting.narrative).toEqual({
      entryNodeId: 'existing-entry',
      variables: [{ id: 'var-1', name: 'score', value: 3 }],
    });
  });
});
