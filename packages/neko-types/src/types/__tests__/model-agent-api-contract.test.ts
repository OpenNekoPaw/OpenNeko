import { describe, expect, it } from 'vitest';
import {
  NEKO_EXTENSION_IDS,
  TOOL_NAMES,
  TOOL_NAMES_MODEL,
  type ModelSceneGraphSnapshot,
  type NekoModelAPI,
} from '../index';

describe('model agent API contract', () => {
  it('exports model extension id and tool names through shared entry points', () => {
    expect(NEKO_EXTENSION_IDS.NEKO_MODEL).toBe('neko.neko-model');
    expect(TOOL_NAMES_MODEL.MODEL_SCENE_QUERY).toBe('model_scene_query');
    expect(Object.values(TOOL_NAMES)).toContain(TOOL_NAMES_MODEL.MODEL_NODE_MANIPULATE);
  });

  it('represents scene query results with optional bounds', () => {
    const snapshot: ModelSceneGraphSnapshot = {
      sceneId: 'scene-main',
      activeModelPath: './character.glb',
      nodes: [
        {
          id: 'node_0',
          name: 'Body',
          parentId: null,
          visible: true,
          kind: 'mesh',
          worldBounds: {
            min: { x: -1, y: 0, z: -1 },
            max: { x: 1, y: 2, z: 1 },
          },
        },
      ],
      materials: [],
      animations: [],
    };

    expect(snapshot.nodes[0]?.worldBounds?.max?.y).toBe(2);
  });

  it('allows extension implementations to satisfy NekoModelAPI', async () => {
    const api: NekoModelAPI = {
      getSceneGraph: async () => ({
        nodes: [],
        materials: [],
        animations: [],
      }),
      getNodeProperties: async () => undefined,
      setNodeTransform: async () => ({ ok: true }),
      setNodeVisible: async () => ({ ok: true }),
      updateMaterial: async () => ({ ok: true }),
      listAnimations: async () => [],
      playAnimation: async () => ({ ok: true }),
      stopAnimation: async () => ({ ok: true }),
      seekAnimation: async () => ({ ok: true }),
      getActiveModelPath: () => undefined,
    };

    await expect(api.setNodeVisible('node_0', true)).resolves.toEqual({ ok: true });
  });
});
