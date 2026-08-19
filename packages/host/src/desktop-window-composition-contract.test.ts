import { describe, expect, it } from 'vitest';

import { createDefaultDesktopAgentScene } from './desktop-scene-contract';
import { createDefaultDesktopWorkbenchLayout } from './desktop-workbench-contract';
import {
  createDesktopWindowComposition,
  parseDesktopWindowComposition,
} from './desktop-window-composition-contract';

describe('Desktop Window composition contract', () => {
  it('contains one current layout and Scene with no parallel instance collection', () => {
    const scene = createDefaultDesktopAgentScene('window:1', 'draft:1');
    const composition = createDesktopWindowComposition({
      workbenchInstanceId: 'workbench:1',
      layout: createDefaultDesktopWorkbenchLayout('window:1'),
      scene,
    });

    expect(Object.keys(composition).sort()).toEqual([
      'layout',
      'scene',
      'windowId',
      'workbenchInstanceId',
    ]);
    expect(composition.scene.slots.interaction?.agentSurfaceId).toBe(
      'agent-surface:window:1:draft:1',
    );
  });

  it('rejects an invalid current record without interpreting additional fields', () => {
    const scene = createDefaultDesktopAgentScene('window:1', 'draft:1');
    expect(() =>
      parseDesktopWindowComposition({
        workbenchInstanceId: 'workbench:1',
        windowId: 'window:1',
        layout: createDefaultDesktopWorkbenchLayout('window:1'),
        scene,
        unexpected: true,
      }),
    ).toThrow('Desktop Window composition has unexpected fields');
  });

  it('accepts at most the one secondary Surface encoded by the current Scene', () => {
    const scene = createDefaultDesktopAgentScene('window:1', 'draft:1');
    expect(() =>
      parseDesktopWindowComposition({
        workbenchInstanceId: 'workbench:1',
        windowId: 'window:1',
        layout: createDefaultDesktopWorkbenchLayout('window:1'),
        scene: {
          ...scene,
          slots: { ...scene.slots, anotherSecondaryMain: { kind: 'settings-main' } },
        },
      }),
    ).toThrow("Desktop Scene slots contains unknown field 'anotherSecondaryMain'");
  });
});
