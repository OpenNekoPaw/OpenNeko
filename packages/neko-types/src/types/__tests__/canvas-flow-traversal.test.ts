import { describe, expect, it } from 'vitest';
import type { CanvasConnection, RegisteredCanvasNode } from '../canvas';
import {
  NARRATIVE_NODE_TYPES,
  NARRATIVE_TRAVERSAL_NODE_TYPES,
  traverseNarrativeFlow,
} from '../canvas-flow-traversal';

function node(id: string, type: RegisteredCanvasNode['type']): RegisteredCanvasNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    size: { width: 200, height: 120 },
    zIndex: 0,
    data: {},
  };
}

function edge(id: string, sourceId: string, targetId: string, priority = 0): CanvasConnection {
  return {
    id,
    sourceId,
    targetId,
    sourceEndpoint: { nodeId: sourceId, scope: 'node' },
    targetEndpoint: { nodeId: targetId, scope: 'node' },
    type: 'choice',
    choiceText: id,
    priority,
  };
}

describe('narrative flow traversal', () => {
  it('keeps narrative activation node types separate from traversal types', () => {
    expect(NARRATIVE_NODE_TYPES).toContain('narrative-note');
    expect(NARRATIVE_TRAVERSAL_NODE_TYPES).toEqual([
      'narrative-start',
      'narrative-scene',
      'choice',
      'merge',
      'narrative-ending',
    ]);
    expect(NARRATIVE_TRAVERSAL_NODE_TYPES).not.toContain('narrative-note');
  });

  it('walks narrative nodes and ignores unrelated subsystem nodes', () => {
    const result = traverseNarrativeFlow(
      [
        node('start', 'narrative-scene'),
        node('choice', 'choice'),
        node('end', 'merge'),
        node('state', 'state'),
      ],
      [edge('a', 'start', 'choice'), edge('b', 'choice', 'end'), edge('ignored', 'state', 'end')],
      'start',
    );

    expect(result.successors).toMatchObject({
      start: ['choice'],
      choice: ['end'],
      end: [],
    });
    expect(result.defaultPath).toEqual(['start', 'choice', 'end']);
    expect(result.deadEndNodeIds).toEqual(['end']);
    expect(result.endingNodeIds).toEqual([]);
    expect(result.accidentalDeadEndNodeIds).toEqual(['end']);
    expect(result.choices.choice).toEqual([
      expect.objectContaining({ connectionId: 'b', targetNodeId: 'end' }),
    ]);
  });

  it('prefers narrative-start entry and classifies narrative-ending as expected terminal', () => {
    const result = traverseNarrativeFlow(
      [
        node('fallback', 'narrative-scene'),
        node('start', 'narrative-start'),
        node('scene', 'narrative-scene'),
        node('ending', 'narrative-ending'),
      ],
      [edge('a', 'start', 'scene'), edge('b', 'scene', 'ending')],
      'fallback',
    );

    expect(result.startNodeId).toBe('start');
    expect(result.defaultPath).toEqual(['start', 'scene', 'ending']);
    expect(result.deadEndNodeIds).toEqual(['fallback', 'ending']);
    expect(result.endingNodeIds).toEqual(['ending']);
    expect(result.accidentalDeadEndNodeIds).toEqual(['fallback']);
  });

  it('excludes narrative-note from runtime traversal', () => {
    const result = traverseNarrativeFlow(
      [
        node('start', 'narrative-start'),
        node('note', 'narrative-note'),
        node('scene', 'narrative-scene'),
      ],
      [edge('a', 'start', 'note'), edge('b', 'note', 'scene')],
      'start',
    );

    expect(result.successors).toEqual({
      start: [],
      scene: [],
    });
    expect(result.defaultPath).toEqual(['start']);
    expect(result.deadEndNodeIds).toEqual(['start', 'scene']);
  });

  it('reports cycles in narrative flow', () => {
    const result = traverseNarrativeFlow(
      [node('a', 'choice'), node('b', 'choice')],
      [edge('a-b', 'a', 'b'), edge('b-a', 'b', 'a')],
      'a',
    );

    expect(result.cycles).toEqual([['a', 'b', 'a']]);
  });
});
