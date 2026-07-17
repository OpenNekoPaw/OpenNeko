import { describe, expect, it, vi } from 'vitest';
import type { ProjectionAdapter } from '../canvas-projection';
import {
  createProjectionAdapterKey,
  createProjectionAdapterRegistry,
  isProjectedCanvasSource,
} from '../canvas-projection';

function createAdapter(sourceUri: string): ProjectionAdapter {
  return {
    kind: 'entity',
    sourceUri,
    project: vi.fn(async () => ({
      version: '2.1',
      name: 'Projected',
      projected: true,
      projectionSource: { kind: 'entity', uri: sourceUri },
      nodes: [],
      connections: [],
    })),
    writeBack: vi.fn(async () => ({ ok: true })),
    onSourceChanged: vi.fn(() => ({ dispose: vi.fn() })),
  };
}

describe('canvas projection contracts', () => {
  it('registers, resolves, lists, and disposes projection adapters by kind/source', () => {
    const registry = createProjectionAdapterRegistry();
    const adapter = createAdapter('file:///entity.json');
    const disposable = registry.register(adapter);

    expect(registry.get('entity', 'file:///entity.json')).toBe(adapter);
    expect(registry.list('entity')).toEqual([adapter]);
    expect(createProjectionAdapterKey('entity', 'file:///entity.json')).toBe(
      'entity:file:///entity.json',
    );

    disposable.dispose();

    expect(registry.get('entity', 'file:///entity.json')).toBeUndefined();
  });

  it('validates projected canvas source DTOs without VSCode API types', () => {
    expect(isProjectedCanvasSource({ kind: 'entity', uri: 'file:///entity.json' })).toBe(true);
    expect(isProjectedCanvasSource({ kind: 'memory', uri: 'memory://session', version: '1' })).toBe(
      true,
    );
    expect(isProjectedCanvasSource({ kind: 'storyboard', uri: 'file:///story.json' })).toBe(false);
    expect(isProjectedCanvasSource({ kind: 'entity', uri: 3 })).toBe(false);
  });
});
