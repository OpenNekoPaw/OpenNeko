import { describe, expect, it } from 'vitest';
import type { CanvasConnection, CanvasData, RegisteredCanvasNode } from '../canvas';
import { validateCanvasNarrativeGraph } from '../canvas-narrative-validation';

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

function edge(id: string, sourceId: string, targetId: string): CanvasConnection {
  return {
    id,
    sourceId,
    targetId,
    sourceEndpoint: { nodeId: sourceId, scope: 'node' },
    targetEndpoint: { nodeId: targetId, scope: 'node' },
    type: 'choice',
  };
}

function canvas(nodes: CanvasData['nodes'], connections: CanvasConnection[] = []): CanvasData {
  return {
    version: '2.1',
    name: 'Narrative Validation Fixture',
    nodes,
    connections,
  };
}

describe('canvas narrative validation', () => {
  it('accepts one start node, ending terminals, durable refs, and fountain scene refs', () => {
    expect(
      validateCanvasNarrativeGraph(
        canvas(
          [
            node('start', 'narrative-start'),
            node('scene', 'narrative-scene', {
              sceneRef: 'scenes/cafe.fountain',
              backgroundRef: { kind: 'relative-path', path: 'assets/cafe.png' },
            }),
            node('ending', 'narrative-ending'),
          ],
          [edge('a', 'start', 'scene'), edge('b', 'scene', 'ending')],
        ),
      ),
    ).toEqual([]);
  });

  it('reports duplicate starts and invalid start or ending edges', () => {
    expect(
      validateCanvasNarrativeGraph(
        canvas(
          [
            node('start-a', 'narrative-start'),
            node('start-b', 'narrative-start'),
            node('scene', 'narrative-scene', { sceneRef: 'scenes/cafe.fountain' }),
            node('ending', 'narrative-ending'),
          ],
          [edge('incoming-start', 'scene', 'start-a'), edge('outgoing-ending', 'ending', 'scene')],
        ),
      ).map((diagnostic) => diagnostic.code),
    ).toEqual([
      'multiple-narrative-start',
      'narrative-start-incoming-edge',
      'narrative-ending-outgoing-edge',
    ]);
  });

  it('rejects non-Fountain scene refs without old-format branches', () => {
    const diagnostics = validateCanvasNarrativeGraph(
      canvas([
        node('scene-a', 'narrative-scene', { sceneRef: 'story/main.fountain' }),
        node('scene-b', 'narrative-scene', { sceneRef: 'story/main.story' }),
        node('scene-c', 'narrative-scene', { sceneRef: 'story/alternate.fountain' }),
      ]),
    );

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'invalid-narrative-scene-ref',
    ]);
  });

  it('rejects runtime asset handles in narrative scene metadata', () => {
    const diagnostics = validateCanvasNarrativeGraph(
      canvas([
        node('scene', 'narrative-scene', {
          sceneRef: 'scenes/cafe.fountain',
          backgroundRef: { kind: 'relative-path', path: 'blob:vscode/hero.png' },
        }),
      ]),
    );

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'invalid-narrative-asset-ref',
        assetDiagnostics: [expect.objectContaining({ code: 'narrative-asset-runtime-ref' })],
      }),
    ]);
  });
});
