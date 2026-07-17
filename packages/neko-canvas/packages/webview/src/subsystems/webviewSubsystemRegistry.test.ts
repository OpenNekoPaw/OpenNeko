import { describe, expect, it, vi } from 'vitest';
import type { CanvasData } from '@neko/shared';
import { createBuiltInWebviewSubsystemRegistry } from './webviewSubsystemRegistry';
import type { WebviewSubsystemRegistration } from './types';

function createCanvas(nodeTypes: string[]): Pick<CanvasData, 'nodes'> {
  return {
    nodes: nodeTypes.map((type, index) => ({
      id: `${type}-${index}`,
      type,
      position: { x: index * 20, y: 0 },
      size: { width: 200, height: 120 },
      zIndex: index,
      data: {},
    })) as CanvasData['nodes'],
  };
}

function createRegistration(id: WebviewSubsystemRegistration['manifest']['id']) {
  return {
    manifest: {
      id,
      label: id,
      triggerNodeTypes: [],
    },
  } satisfies WebviewSubsystemRegistration;
}

describe('webviewSubsystemRegistry', () => {
  it('loads subsystem registrations only for active node types', async () => {
    const storyboardLoader = vi.fn(async () => createRegistration('storyboard'));
    const narrativeLoader = vi.fn(async () => createRegistration('narrative'));
    const behaviorLoader = vi.fn(async () => createRegistration('behavior'));
    const registry = createBuiltInWebviewSubsystemRegistry({
      storyboard: storyboardLoader,
      narrative: narrativeLoader,
      behavior: behaviorLoader,
    });

    const registrations = await registry.loadForCanvas(createCanvas(['choice', 'state']));

    expect(registrations.map((registration) => registration.manifest.id)).toEqual([
      'narrative',
      'behavior',
    ]);
    expect(storyboardLoader).not.toHaveBeenCalled();
    expect(narrativeLoader).toHaveBeenCalledTimes(1);
    expect(behaviorLoader).toHaveBeenCalledTimes(1);
  });

  it('caches loaded registrations', async () => {
    const narrativeLoader = vi.fn(async () => createRegistration('narrative'));
    const registry = createBuiltInWebviewSubsystemRegistry({
      narrative: narrativeLoader,
    });

    await registry.load('narrative');
    await registry.load('narrative');

    expect(narrativeLoader).toHaveBeenCalledTimes(1);
  });

  it('returns no active registrations after the last trigger node is removed', async () => {
    const narrativeLoader = vi.fn(async () => createRegistration('narrative'));
    const registry = createBuiltInWebviewSubsystemRegistry({
      narrative: narrativeLoader,
    });

    await expect(registry.loadForCanvas(createCanvas(['choice']))).resolves.toHaveLength(1);
    await expect(registry.loadForCanvas(createCanvas(['text']))).resolves.toEqual([]);

    expect(registry.getActiveSubsystems(createCanvas(['text']))).toEqual([]);
    expect(narrativeLoader).toHaveBeenCalledTimes(1);
  });

  it('loads subsystem registration when the node library group is requested explicitly', async () => {
    const behaviorLoader = vi.fn(async () => createRegistration('behavior'));
    const registry = createBuiltInWebviewSubsystemRegistry({
      behavior: behaviorLoader,
    });

    await expect(registry.load('behavior')).resolves.toMatchObject({
      manifest: { id: 'behavior' },
    });
    expect(behaviorLoader).toHaveBeenCalledTimes(1);
  });

  it('summarizes node types and resolves subsystem ownership', () => {
    const registry = createBuiltInWebviewSubsystemRegistry({});

    expect(registry.getNodeTypeSummary(createCanvas(['choice', 'choice', 'memory']))).toEqual({
      choice: 2,
      memory: 1,
    });
    expect(registry.getSubsystemForNodeType('choice')?.id).toBe('narrative');
    expect(registry.getSubsystemForNodeType('memory')?.id).toBe('memory');
    expect(registry.getCoreNodeTypeDescriptors().annotation?.tagLabel).toBe('NOTE');
    expect(registry.getCoreNodeTypeDescriptors().shot).toBeUndefined();
  });
});
