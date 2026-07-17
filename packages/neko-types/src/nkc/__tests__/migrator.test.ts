import { describe, expect, it } from 'vitest';
import { CURRENT_NKC_VERSION, detectNkcVersion, migrateNkc, migrateNkcV2ToV2_1 } from '../index';
import type { CanvasData, RegisteredCanvasNode } from '../../types/canvas';

const registeredNode: RegisteredCanvasNode = {
  id: 'choice-1',
  type: 'choice',
  position: { x: 100, y: 200 },
  size: { width: 220, height: 120 },
  zIndex: 1,
  data: {
    title: 'Decision',
  },
};

function createCanvas(version: string): CanvasData {
  return {
    version,
    name: 'Migrator Fixture',
    projected: true,
    viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
    nodes: [registeredNode],
    connections: [
      {
        id: 'connection-1',
        sourceId: 'choice-1',
        targetId: 'choice-1',
        sourceEndpoint: { nodeId: 'choice-1', scope: 'node' },
        targetEndpoint: { nodeId: 'choice-1', scope: 'node' },
        type: 'choice',
        choiceText: 'Loop',
        priority: 0,
      },
    ],
    narrative: {
      entryNodeId: 'choice-1',
      variables: [{ id: 'var-1', name: 'trust', value: 1 }],
    },
    behavior: {
      blackboard: [{ id: 'bb-1', name: 'mood', value: 'calm' }],
    },
    entityGraph: {
      entityScope: ['character'],
      bindingSource: 'entities.json',
    },
    memoryGraph: {
      queryContext: 'session',
      timeRange: { start: '2026-01-01T00:00:00Z', end: '2026-01-02T00:00:00Z' },
    },
  };
}

describe('NKC migrator v2.1', () => {
  it('detects the current NKC version', () => {
    expect(CURRENT_NKC_VERSION).toBe('2.1');
    expect(detectNkcVersion({ version: '2.1' })).toBe('2.1');
  });

  it('normalizes v2.0 to v2.1 without dropping optional subsystem fields', () => {
    const canvas = createCanvas('2.0');
    const migrated = migrateNkcV2ToV2_1(canvas);

    expect(migrated.version).toBe('2.1');
    expect(migrated.projected).toBe(true);
    expect(migrated.narrative).toEqual(canvas.narrative);
    expect(migrated.behavior).toEqual(canvas.behavior);
    expect(migrated.entityGraph).toEqual(canvas.entityGraph);
    expect(migrated.memoryGraph).toEqual(canvas.memoryGraph);
    expect(migrated.nodes).toEqual(canvas.nodes);
    expect(migrated.connections).toEqual(canvas.connections);
    expect(migrated.nodes).not.toBe(canvas.nodes);
    expect(migrated.connections).not.toBe(canvas.connections);
  });

  it('migrates v2.0 through the public migrator with a single v2.1 step', () => {
    const result = migrateNkc(createCanvas('2.0'));

    expect(result.migrated).toBe(true);
    expect(result.fromVersion).toBe('2.0');
    expect(result.toVersion).toBe('2.1');
    expect(result.data.version).toBe('2.1');
    expect(result.steps).toEqual([expect.objectContaining({ from: '2.0', to: '2.1' })]);
    expect(result.warnings).toEqual([]);
  });

  it('migrates v1.0 through v2.0 and then v2.1', () => {
    const result = migrateNkc(createCanvas('1.0'));

    expect(result.migrated).toBe(true);
    expect(result.fromVersion).toBe('1.0');
    expect(result.toVersion).toBe('2.1');
    expect(result.data.version).toBe('2.1');
    expect(result.steps.map((step) => `${step.from}->${step.to}`)).toEqual([
      '1.0->2.0',
      '2.0->2.1',
    ]);
  });

  it('keeps current v2.1 data untouched', () => {
    const canvas = createCanvas('2.1');
    const result = migrateNkc(canvas);

    expect(result.migrated).toBe(false);
    expect(result.data).toBe(canvas);
    expect(result.steps).toEqual([]);
  });

  it('uses the compatibility path for unknown versions and reports a warning', () => {
    const result = migrateNkc(createCanvas('9.9'));

    expect(result.migrated).toBe(true);
    expect(result.data.version).toBe('2.1');
    expect(result.warnings).toEqual([
      'Unknown NKC version "9.9" migrated through the canonical version normalizer.',
    ]);
  });
});
