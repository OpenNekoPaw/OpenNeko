import { describe, expect, it } from 'vitest';
import { loadNkc, migrateNkc, validateNkcLayered } from '../index';
import { getContainerChildIds, getNodeParentId } from '../../utils/canvasLayered';
import type { CanvasData, SceneGroupCanvasNode, ShotCanvasNode } from '../../types/canvas';

const sceneNode: SceneGroupCanvasNode = {
  id: 'scene-1',
  type: 'scene',
  position: { x: 0, y: 0 },
  size: { width: 640, height: 360 },
  zIndex: 1,
  container: { policy: 'scene', childIds: ['shot-1', 'shot-2'] },
  data: {
    sceneTitle: 'Opening',
    sceneNumber: 1,
  },
};

const shotOne: ShotCanvasNode = {
  id: 'shot-1',
  type: 'shot',
  position: { x: 40, y: 80 },
  size: { width: 240, height: 160 },
  zIndex: 2,
  parentId: 'scene-1',
  data: {
    shotNumber: 1,
    duration: 3,
    visualDescription: 'Wide establishing frame',
    characters: [],
    shotScale: 'LS',
    characterAction: '',
    emotion: [],
    sceneTags: [],
    generationStatus: 'idle',
    generationHistory: [],
  },
};

const shotTwo: ShotCanvasNode = {
  ...shotOne,
  id: 'shot-2',
  position: { x: 320, y: 80 },
  data: {
    ...shotOne.data,
    shotNumber: 2,
    visualDescription: 'Cut to reaction',
  },
};

const validV1Canvas: CanvasData = {
  version: '1.0',
  name: 'Layered Canvas',
  viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
  nodes: [sceneNode, shotOne, shotTwo],
  connections: [
    {
      id: 'conn-1',
      sourceId: 'shot-1',
      targetId: 'shot-2',
      sourceEndpoint: { nodeId: 'shot-1', scope: 'node' },
      targetEndpoint: { nodeId: 'shot-2', scope: 'node' },
    },
  ],
};

describe('NKC layered migration', () => {
  it('keeps Scene/Shot organization in layered fields', () => {
    const migration = migrateNkc(validV1Canvas);

    expect(migration.migrated).toBe(true);
    expect(migration.data.version).toBe('2.1');

    const migratedScene = migration.data.nodes.find((node) => node.id === 'scene-1');
    const migratedShot = migration.data.nodes.find((node) => node.id === 'shot-1');

    expect(migratedScene?.container).toEqual(
      expect.objectContaining({
        policy: 'scene',
        childIds: ['shot-1', 'shot-2'],
      }),
    );
    expect(migratedShot?.parentId).toBe('scene-1');

    if (!migratedScene || !migratedShot) {
      throw new Error('expected migrated nodes to exist');
    }

    expect(getContainerChildIds(migratedScene)).toEqual(['shot-1', 'shot-2']);
    expect(getNodeParentId(migratedShot)).toBe('scene-1');
    expect(validateNkcLayered(migration.data).valid).toBe(true);
  });

  it('loads v1 canvases through the migration pipeline', () => {
    const result = loadNkc(JSON.stringify(validV1Canvas));

    expect(result.validation.valid).toBe(true);
    expect(result.migration?.migrated).toBe(true);
    expect(result.data.version).toBe('2.1');
  });

  it('keeps canonical group containment while migrating the document version', () => {
    const group: CanvasData['nodes'][number] = {
      id: 'group-1',
      type: 'group',
      position: { x: 0, y: 0 },
      size: { width: 400, height: 300 },
      zIndex: 1,
      container: { policy: 'group', childIds: ['shot-1'] },
      data: {
        label: 'References',
      },
    };
    const canvas: CanvasData = {
      ...validV1Canvas,
      nodes: [group, { ...shotOne, parentId: 'group-1' }],
    };

    const migration = migrateNkc(canvas);
    const migratedGroup = migration.data.nodes.find((node) => node.id === 'group-1');
    const migratedChild = migration.data.nodes.find((node) => node.id === 'shot-1');

    expect(migratedGroup?.container?.childIds).toEqual(['shot-1']);
    expect(migratedChild?.parentId).toBe('group-1');
  });
});

describe('NKC layered validator', () => {
  it('accepts a valid migrated canvas', () => {
    const migration = migrateNkc(validV1Canvas);
    const result = validateNkcLayered(migration.data);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('reports dangling container child IDs', () => {
    const migration = migrateNkc(validV1Canvas);
    const scene = migration.data.nodes.find((node) => node.id === 'scene-1');
    if (scene?.container) {
      scene.container.childIds = [...scene.container.childIds, 'missing-shot'];
    }

    const result = validateNkcLayered(migration.data);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('missing child "missing-shot"'),
      }),
    );
  });

  it('reports inconsistent bidirectional membership', () => {
    const migration = migrateNkc(validV1Canvas);
    const shot = migration.data.nodes.find((node) => node.id === 'shot-1');
    if (shot) {
      shot.parentId = 'missing-scene';
    }

    const result = validateNkcLayered(migration.data);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('references missing parent "missing-scene"'),
      }),
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('child "shot-1" does not reference this parent'),
      }),
    );
  });

  it('reports container cycles', () => {
    const migration = migrateNkc(validV1Canvas);
    const shot = migration.data.nodes.find((node) => node.id === 'shot-1');
    if (shot) {
      shot.container = { policy: 'group', childIds: ['scene-1'] };
    }

    const result = validateNkcLayered(migration.data);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('container cycle detected'),
      }),
    );
  });

  it('reports required field bindings that cannot resolve into node.data', () => {
    const migration = migrateNkc(validV1Canvas);
    const shot = migration.data.nodes.find((node) => node.id === 'shot-1');
    if (shot) {
      shot.content = {
        id: 'root',
        blocks: [
          {
            id: 'missing-field',
            kind: 'text',
            binding: { path: '/missingField', required: true },
          },
        ],
      };
    }

    const result = validateNkcLayered(migration.data);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('required binding path "/missingField"'),
      }),
    );
  });

  it('reports dangling connection endpoints', () => {
    const migration = migrateNkc(validV1Canvas);
    migration.data.connections.push({
      id: 'conn-missing',
      sourceId: 'shot-1',
      targetId: 'missing-node',
      sourceEndpoint: { nodeId: 'shot-1', scope: 'node' },
      targetEndpoint: { nodeId: 'missing-node', scope: 'node' },
    });

    const result = validateNkcLayered(migration.data);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'connections[1].targetId',
        message: expect.stringContaining('missing node "missing-node"'),
      }),
    );
  });
});
