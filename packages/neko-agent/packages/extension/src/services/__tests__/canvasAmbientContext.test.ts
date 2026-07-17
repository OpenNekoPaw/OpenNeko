import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasNode } from '@neko/shared';

vi.mock('vscode', () => {
  class EventEmitter<T> {
    private readonly listeners: Array<(event: T) => void> = [];

    readonly event = (listener: (event: T) => void) => {
      this.listeners.push(listener);
      return { dispose: () => undefined };
    };

    fire(event: T): void {
      for (const listener of this.listeners) listener(event);
    }
  }

  return { EventEmitter };
});

import {
  clearCanvasSelection,
  drainPendingCanvasChanges,
  getActiveCanvasAmbientScope,
  getCanvasSelection,
  getPendingCanvasChanges,
  onDidChangeCanvasSelection,
  recordCanvasChange,
  setActiveCanvasAmbientScope,
  setCanvasSelection,
} from '../canvasAmbientContext';

describe('canvasAmbientContext bridge', () => {
  beforeEach(() => {
    setActiveCanvasAmbientScope('test-default');
    clearCanvasSelection('conv-a');
    clearCanvasSelection('conv-b');
    drainPendingCanvasChanges('conv-a');
    drainPendingCanvasChanges('conv-b');
  });

  it('routes selection updates to the active conversation scope', () => {
    const events: unknown[] = [];
    const disposable = onDidChangeCanvasSelection((nodes) => events.push(nodes));

    setActiveCanvasAmbientScope('conv-a');
    setCanvasSelection([makeNode('node-a', 'annotation', { content: 'A' })]);

    setActiveCanvasAmbientScope('conv-b');
    setCanvasSelection([makeNode('node-b', 'annotation', { content: 'B' })]);

    expect(getActiveCanvasAmbientScope()).toBe('conv-b');
    expect(getCanvasSelection('conv-a')[0]?.nodeId).toBe('node-a');
    expect(getCanvasSelection('conv-b')[0]?.nodeId).toBe('node-b');
    expect(events).toHaveLength(2);

    disposable.dispose();
  });

  it('keeps pending changes isolated by scope', () => {
    setActiveCanvasAmbientScope('conv-a');
    recordCanvasChange({ domain: 'canvas', changeType: 'add', id: 'a', timestamp: 1 });

    setActiveCanvasAmbientScope('conv-b');
    recordCanvasChange({ domain: 'assets', changeType: 'delete', id: 'b', timestamp: 2 });

    expect(getPendingCanvasChanges('conv-a')).toEqual([
      { domain: 'canvas', changeType: 'add', id: 'a', timestamp: 1 },
    ]);
    expect(getPendingCanvasChanges('conv-b')).toEqual([
      { domain: 'assets', changeType: 'delete', id: 'b', timestamp: 2 },
    ]);
  });
});

function makeNode(id: string, type: CanvasNode['type'], data: Record<string, unknown>): CanvasNode {
  return {
    id,
    type,
    data,
    position: { x: 0, y: 0 },
    size: { width: 100, height: 100 },
    zIndex: 0,
  } as CanvasNode;
}
