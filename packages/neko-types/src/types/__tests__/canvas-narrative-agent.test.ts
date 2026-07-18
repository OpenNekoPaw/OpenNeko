import { describe, expect, it } from 'vitest';
import type { CanvasConnection, RegisteredCanvasNode } from '../canvas';
import { analyzeCanvasNarrativeForAgent } from '../canvas-narrative-agent';

function node(
  id: string,
  type: RegisteredCanvasNode['type'],
  data: RegisteredCanvasNode['data'] = {},
): RegisteredCanvasNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    size: { width: 200, height: 120 },
    zIndex: 0,
    data,
  };
}

function edge(
  id: string,
  sourceId: string,
  targetId: string,
  condition?: string,
): CanvasConnection {
  return {
    id,
    sourceId,
    targetId,
    sourceEndpoint: { nodeId: sourceId, scope: 'node' },
    targetEndpoint: { nodeId: targetId, scope: 'node' },
    type: 'choice',
    choiceText: id,
    priority: 0,
    ...(condition ? { condition } : {}),
  };
}

describe('canvas narrative agent analysis', () => {
  it('reports graph diagnostics without old-format scene-ref branches', () => {
    const analysis = analyzeCanvasNarrativeForAgent({
      variableNames: ['closeness'],
      nodes: [
        node('start', 'narrative-start'),
        node('scene-a', 'narrative-scene', {
          sceneRef: 'story/main.fountain',
        }),
        node('scene-b', 'narrative-scene', {
          sceneRef: 'scenes/branch.fountain',
        }),
        node('orphan', 'narrative-scene', {
          sceneRef: 'scenes/orphan.fountain',
        }),
      ],
      connections: [
        edge('start-a', 'start', 'scene-a'),
        edge('unsupported', 'scene-a', 'scene-b', 'closeness + 1 > 3'),
        edge('missing-var', 'scene-b', 'scene-a', 'missingFlag'),
      ],
    });

    expect(analysis.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        'narrative-missing-ending',
        'narrative-unreachable-node',
        'narrative-accidental-dead-end',
        'narrative-unsupported-condition',
        'narrative-unresolved-variable',
      ]),
    );
    expect(analysis.nodeSummaries['scene-a']).toMatchObject({
      role: 'scene',
      sceneRef: 'story/main.fountain',
      choiceLabels: ['unsupported'],
      conditions: ['closeness + 1 > 3'],
    });
  });
});
