import { describe, expect, it } from 'vitest';

import {
  activateDesktopWorkbenchInstance,
  closeDesktopAgentSurface,
  closeDesktopWorkbenchInstance,
  createDesktopWorkbenchInstance,
  createDesktopWorkbenchInstanceFromScene,
  handoffDesktopAgentSurface,
  openOrFocusDesktopWorkbenchInstance,
  parseDesktopWindowWorkbenchCatalog,
  putDesktopAgentSurface,
  replaceDesktopWorkbenchInstance,
  resolveActiveDesktopWorkbenchInstance,
  resolveDesktopWorkbenchInstanceByOwner,
  serializeDesktopWindowWorkbenchCatalog,
} from './desktop-workbench-instance-contract';
import { createDefaultDesktopWorkbenchLayout } from './desktop-workbench-contract';
import { parseDesktopWorkbenchSceneProjection } from './desktop-scene-contract';

describe('Desktop Window Workbench instance catalog', () => {
  it('retains independent Workspace and Assistant instances with exact active identity', () => {
    const workspace = workspaceInstance('workbench:workspace:1', 'workspace:1');
    const assistant = assistantInstance('workbench:assistant:1', 'assistant-space:local-user');

    expect(
      parseDesktopWindowWorkbenchCatalog({
        windowId: 'window:1',
        activeWorkbenchInstanceId: workspace.workbenchInstanceId,
        instances: [assistant, workspace],
      }),
    ).toEqual({
      windowId: 'window:1',
      activeWorkbenchInstanceId: 'workbench:workspace:1',
      instances: [assistant, workspace],
      diagnostics: [],
    });
  });

  it('creates a Workbench catalog entry from an exact Scene without conflating View and Surface identities', () => {
    const source = workspaceInstance('workbench:workspace:1', 'workspace:1');

    const instance = createDesktopWorkbenchInstanceFromScene({
      workbenchInstanceId: 'workbench:workspace:2',
      agentSurfaceId: 'agent-surface:independent',
      layout: source.layout,
      scene: source.scene,
    });

    expect(instance.owner).toEqual({ kind: 'workspace', workspaceId: 'workspace:1' });
    expect(instance.agentSurfaces[0]).toMatchObject({
      agentSurfaceId: 'agent-surface:independent',
      lifecycle: 'hot-retained',
      interaction: { agentViewId: 'agent-view:1' },
    });
  });

  it('keeps multiple Agent Surfaces inside one Workspace instance', () => {
    const instance = workspaceInstance('workbench:workspace:1', 'workspace:1');
    const firstSurface = instance.agentSurfaces[0];
    if (!firstSurface) throw new Error('Workspace fixture requires its first Agent Surface.');
    const secondScope = {
      kind: 'workspace' as const,
      draftId: 'draft:2',
      workspaceId: 'workspace:1',
      workspaceGrantId: 'workspace-grant:1',
      conversationId: 'conversation:2',
    };
    const parsed = createDesktopWorkbenchInstance({
      ...instance,
      scene: {
        ...instance.scene,
        context: { kind: 'agent', agentViewId: 'agent-view:2', scope: secondScope },
        slots: {
          ...instance.scene.slots,
          interaction: {
            kind: 'agent',
            agentViewId: 'agent-view:2',
            phase: 'session',
            scope: secondScope,
          },
        },
      },
      activeAgentSurfaceId: 'agent-surface:2',
      agentSurfaces: [
        firstSurface,
        {
          agentSurfaceId: 'agent-surface:2',
          lifecycle: 'hot-retained',
          interaction: {
            kind: 'agent',
            agentViewId: 'agent-view:2',
            phase: 'session',
            scope: secondScope,
          },
        },
      ],
    });

    expect(parsed.agentSurfaces).toHaveLength(2);
    expect(parsed.activeAgentSurfaceId).toBe('agent-surface:2');
    expect(parsed.layout).toEqual(instance.layout);
  });

  it('switches active Workbench identity without replacing sibling layouts', () => {
    const first = workspaceInstance('workbench:workspace:1', 'workspace:1');
    const second = {
      ...workspaceInstance('workbench:workspace:2', 'workspace:2'),
      layout: {
        ...createDefaultDesktopWorkbenchLayout('window:1'),
        display: { mode: 'main-only' as const, chatPosition: 'right' as const, chatWidth: 412 },
      },
    };
    const catalog = catalogWith(first, second);

    const activated = activateDesktopWorkbenchInstance(catalog, second.workbenchInstanceId);

    expect(activated.activeWorkbenchInstanceId).toBe(second.workbenchInstanceId);
    expect(activated.instances).toEqual([first, second]);
  });

  it('focuses the existing Workspace instead of opening a second instance for its owner', () => {
    const workspace = workspaceInstance('workbench:workspace:1', 'workspace:1');
    const assistant = assistantInstance('workbench:assistant:1', 'assistant-space:local-user');
    const catalog = catalogWith(assistant, workspace);

    const focused = openOrFocusDesktopWorkbenchInstance(catalog, workspace);

    expect(focused.activeWorkbenchInstanceId).toBe(workspace.workbenchInstanceId);
    expect(focused.instances).toEqual([assistant, workspace]);
    expect(() =>
      openOrFocusDesktopWorkbenchInstance(
        catalog,
        workspaceInstance('workbench:workspace:duplicate', 'workspace:1'),
      ),
    ).toThrow("already open as 'workbench:workspace:1'");
  });

  it('adds another conversation to the existing Workspace and preserves its layout', () => {
    const workspace = workspaceInstance('workbench:workspace:1', 'workspace:1');
    const assistant = assistantInstance('workbench:assistant:1', 'assistant-space:local-user');
    const secondScope = {
      kind: 'workspace' as const,
      draftId: 'draft:2',
      workspaceId: 'workspace:1',
      workspaceGrantId: 'workspace-grant:1',
      conversationId: 'conversation:2',
    };
    const secondInteraction = {
      kind: 'agent' as const,
      agentViewId: 'agent-view:2',
      phase: 'session' as const,
      scope: secondScope,
    };
    const updated = putDesktopAgentSurface({
      catalog: catalogWith(assistant, workspace),
      workbenchInstanceId: workspace.workbenchInstanceId,
      surface: {
        agentSurfaceId: 'agent-surface:2',
        lifecycle: 'hot-retained',
        interaction: secondInteraction,
      },
      scene: parseDesktopWorkbenchSceneProjection({
        ...workspace.scene,
        context: { kind: 'agent', agentViewId: secondInteraction.agentViewId, scope: secondScope },
        slots: { ...workspace.scene.slots, interaction: secondInteraction },
      }),
    });
    const updatedWorkspace = updated.instances.find(
      (instance) => instance.workbenchInstanceId === workspace.workbenchInstanceId,
    );

    expect(updated.instances).toHaveLength(2);
    expect(updated.activeWorkbenchInstanceId).toBe(workspace.workbenchInstanceId);
    expect(updatedWorkspace?.layout).toEqual(workspace.layout);
    expect(updatedWorkspace?.activeAgentSurfaceId).toBe('agent-surface:2');
    expect(updatedWorkspace?.agentSurfaces.map((surface) => surface.agentSurfaceId)).toEqual([
      'agent-surface:1',
      'agent-surface:2',
    ]);
  });

  it('keeps draft-to-session Root identity stable and rejects duplicate conversation Surfaces', () => {
    const workspace = workspaceInstance('workbench:workspace:1', 'workspace:1', false);
    const scope = {
      ...workspace.agentSurfaces[0]!.interaction.scope,
      conversationId: 'conversation:1',
    };
    const interaction = {
      ...workspace.agentSurfaces[0]!.interaction,
      phase: 'session' as const,
      scope,
    };
    const catalog = putDesktopAgentSurface({
      catalog: catalogWith(workspace),
      workbenchInstanceId: workspace.workbenchInstanceId,
      surface: { agentSurfaceId: 'agent-surface:1', lifecycle: 'hot-retained', interaction },
      scene: parseDesktopWorkbenchSceneProjection({
        ...workspace.scene,
        context: { kind: 'agent', agentViewId: interaction.agentViewId, scope },
        slots: { ...workspace.scene.slots, interaction },
      }),
    });

    expect(catalog.instances[0]?.agentSurfaces).toEqual([
      { agentSurfaceId: 'agent-surface:1', lifecycle: 'hot-retained', interaction },
    ]);
    expect(() =>
      putDesktopAgentSurface({
        catalog,
        workbenchInstanceId: workspace.workbenchInstanceId,
        surface: {
          agentSurfaceId: 'agent-surface:duplicate',
          lifecycle: 'hot-retained',
          interaction,
        },
        scene: catalog.instances[0]!.scene,
      }),
    ).toThrow("already open as Surface 'agent-surface:1'");
  });

  it('hands an Entry Draft to a new Assistant owner without changing Surface identity', () => {
    const entry = entryDraftInstance('workbench:entry:1', 'draft:entry');
    const targetScope = {
      kind: 'assistant' as const,
      draftId: 'draft:entry',
      assistantSpaceId: 'assistant-space:local-user',
    };
    const targetInteraction = {
      kind: 'agent' as const,
      agentViewId: 'agent-view:entry',
      phase: 'draft' as const,
      scope: targetScope,
    };
    const targetScene = parseDesktopWorkbenchSceneProjection({
      ...entry.scene,
      context: { kind: 'agent', agentViewId: targetInteraction.agentViewId, scope: targetScope },
      slots: { ...entry.scene.slots, interaction: targetInteraction },
    });

    const handedOff = handoffDesktopAgentSurface({
      catalog: catalogWith(entry),
      sourceWorkbenchInstanceId: entry.workbenchInstanceId,
      agentSurfaceId: 'agent-surface:entry',
      targetScene,
    });

    expect(handedOff.instances).toHaveLength(1);
    expect(handedOff.instances[0]).toMatchObject({
      workbenchInstanceId: entry.workbenchInstanceId,
      owner: { kind: 'assistant-space', assistantSpaceId: 'assistant-space:local-user' },
      activeAgentSurfaceId: 'agent-surface:entry',
    });
    expect(handedOff.instances[0]?.agentSurfaces[0]).toEqual({
      agentSurfaceId: 'agent-surface:entry',
      lifecycle: 'hot-retained',
      interaction: targetInteraction,
    });
  });

  it('moves an Entry Draft into an existing Workspace while preserving its layout and siblings', () => {
    const entry = entryDraftInstance('workbench:entry:1', 'draft:entry');
    const workspace = workspaceInstance('workbench:workspace:1', 'workspace:1');
    const targetScope = {
      kind: 'workspace' as const,
      draftId: 'draft:entry',
      workspaceId: 'workspace:1',
      workspaceGrantId: 'workspace-grant:entry',
    };
    const targetInteraction = {
      kind: 'agent' as const,
      agentViewId: 'agent-view:entry',
      phase: 'draft' as const,
      scope: targetScope,
    };
    const targetScene = parseDesktopWorkbenchSceneProjection({
      ...workspace.scene,
      context: { kind: 'agent', agentViewId: targetInteraction.agentViewId, scope: targetScope },
      slots: { ...workspace.scene.slots, interaction: targetInteraction },
    });

    const handedOff = handoffDesktopAgentSurface({
      catalog: catalogWith(entry, workspace),
      sourceWorkbenchInstanceId: entry.workbenchInstanceId,
      agentSurfaceId: 'agent-surface:entry',
      targetScene,
    });
    const target = handedOff.instances[0];

    expect(handedOff.instances).toHaveLength(1);
    expect(handedOff.activeWorkbenchInstanceId).toBe(workspace.workbenchInstanceId);
    expect(target?.workbenchInstanceId).toBe(workspace.workbenchInstanceId);
    expect(target?.layout).toEqual(workspace.layout);
    expect(target?.agentSurfaces.map((surface) => surface.agentSurfaceId)).toEqual([
      'agent-surface:1',
      'agent-surface:entry',
    ]);
  });

  it('closes only the exact Workbench and leaves siblings unchanged', () => {
    const first = workspaceInstance('workbench:workspace:1', 'workspace:1');
    const second = workspaceInstance('workbench:workspace:2', 'workspace:2');
    const assistant = assistantInstance('workbench:assistant:1', 'assistant-space:local-user');
    const catalog = activateDesktopWorkbenchInstance(
      catalogWith(assistant, first, second),
      first.workbenchInstanceId,
    );

    expect(() => closeDesktopWorkbenchInstance(catalog, first.workbenchInstanceId)).toThrow(
      'Next active Desktop Workbench instance identity is required',
    );
    const closed = closeDesktopWorkbenchInstance(
      catalog,
      first.workbenchInstanceId,
      assistant.workbenchInstanceId,
    );

    expect(closed.activeWorkbenchInstanceId).toBe(assistant.workbenchInstanceId);
    expect(closed.instances).toEqual([assistant, second]);
  });

  it('closes only the exact Agent Surface and requires an explicit active replacement', () => {
    const workspace = workspaceInstance('workbench:workspace:1', 'workspace:1');
    const secondScope = {
      kind: 'workspace' as const,
      draftId: 'draft:2',
      workspaceId: 'workspace:1',
      workspaceGrantId: 'workspace-grant:1',
      conversationId: 'conversation:2',
    };
    const secondInteraction = {
      kind: 'agent' as const,
      agentViewId: 'agent-view:2',
      phase: 'session' as const,
      scope: secondScope,
    };
    const opened = putDesktopAgentSurface({
      catalog: catalogWith(workspace),
      workbenchInstanceId: workspace.workbenchInstanceId,
      surface: {
        agentSurfaceId: 'agent-surface:2',
        lifecycle: 'hot-retained',
        interaction: secondInteraction,
      },
      scene: parseDesktopWorkbenchSceneProjection({
        ...workspace.scene,
        context: { kind: 'agent', agentViewId: secondInteraction.agentViewId, scope: secondScope },
        slots: { ...workspace.scene.slots, interaction: secondInteraction },
      }),
    });
    const firstInteraction = workspace.agentSurfaces[0]!.interaction;
    const replacementScene = parseDesktopWorkbenchSceneProjection({
      ...workspace.scene,
      context: {
        kind: 'agent',
        agentViewId: firstInteraction.agentViewId,
        scope: firstInteraction.scope,
      },
      slots: { ...workspace.scene.slots, interaction: firstInteraction },
    });

    expect(() =>
      closeDesktopAgentSurface({
        catalog: opened,
        workbenchInstanceId: workspace.workbenchInstanceId,
        agentSurfaceId: 'agent-surface:2',
      }),
    ).toThrow('Next active Desktop Agent Surface identity is required');

    const closed = closeDesktopAgentSurface({
      catalog: opened,
      workbenchInstanceId: workspace.workbenchInstanceId,
      agentSurfaceId: 'agent-surface:2',
      nextActiveAgentSurfaceId: 'agent-surface:1',
      scene: replacementScene,
    });

    expect(closed.instances[0]?.agentSurfaces).toEqual(workspace.agentSurfaces);
    expect(closed.instances[0]?.activeAgentSurfaceId).toBe('agent-surface:1');
  });

  it('rejects a duplicate Workspace owner without replacing the valid instance', () => {
    const first = workspaceInstance('workbench:workspace:1', 'workspace:1');
    const duplicate = workspaceInstance('workbench:workspace:duplicate', 'workspace:1');

    const parsed = parseDesktopWindowWorkbenchCatalog({
      windowId: 'window:1',
      activeWorkbenchInstanceId: first.workbenchInstanceId,
      instances: [first, duplicate],
    });

    expect(parsed.instances).toEqual([first]);
    expect(parsed.diagnostics).toEqual([
      expect.objectContaining({
        code: 'desktop-workbench-instance-owner-duplicate',
        workbenchInstanceId: duplicate.workbenchInstanceId,
      }),
    ]);
  });

  it('isolates an invalid instance while retaining valid siblings', () => {
    const workspace = workspaceInstance('workbench:workspace:1', 'workspace:1');
    const invalid = {
      ...assistantInstance('workbench:assistant:invalid', 'assistant-space:local-user'),
      scene: { invalid: true },
    };

    const parsed = parseDesktopWindowWorkbenchCatalog({
      windowId: 'window:1',
      activeWorkbenchInstanceId: workspace.workbenchInstanceId,
      instances: [invalid, workspace],
    });

    expect(parsed.instances).toEqual([workspace]);
    expect(parsed.activeWorkbenchInstanceId).toBe(workspace.workbenchInstanceId);
    expect(parsed.diagnostics).toEqual([
      expect.objectContaining({
        code: 'desktop-workbench-instance-invalid',
        workbenchInstanceId: 'workbench:assistant:invalid',
      }),
    ]);
    const activated = activateDesktopWorkbenchInstance(parsed, workspace.workbenchInstanceId);
    expect(serializeDesktopWindowWorkbenchCatalog(activated)).toMatchObject({
      instances: [workspace, invalid],
    });
  });

  it('fails when the requested active instance is not valid', () => {
    const workspace = workspaceInstance('workbench:workspace:1', 'workspace:1');

    expect(() =>
      parseDesktopWindowWorkbenchCatalog({
        windowId: 'window:1',
        activeWorkbenchInstanceId: 'workbench:missing',
        instances: [workspace],
      }),
    ).toThrow("active Workbench instance 'workbench:missing' is unavailable");
  });

  it('resolves and replaces only an exact Workbench instance', () => {
    const first = workspaceInstance('workbench:workspace:1', 'workspace:1');
    const second = workspaceInstance('workbench:workspace:2', 'workspace:2');
    const catalog = catalogWith(first, second);
    const replacement = {
      ...first,
      layout: {
        ...first.layout,
        display: { mode: 'main-only' as const, chatPosition: 'left' as const, chatWidth: 360 },
      },
    };

    const updated = replaceDesktopWorkbenchInstance(catalog, replacement);

    expect(resolveActiveDesktopWorkbenchInstance(updated)).toEqual(replacement);
    expect(
      resolveDesktopWorkbenchInstanceByOwner(updated, {
        kind: 'workspace',
        workspaceId: 'workspace:2',
      }),
    ).toEqual(second);
    expect(updated.instances[1]).toEqual(second);
  });
});

function workspaceInstance(workbenchInstanceId: string, workspaceId: string, session = true) {
  const sceneId = `scene:${workbenchInstanceId}`;
  const agentViewId = 'agent-view:1';
  const scope = {
    kind: 'workspace' as const,
    draftId: 'draft:1',
    workspaceId,
    workspaceGrantId: 'workspace-grant:1',
    ...(session ? { conversationId: 'conversation:1' } : {}),
  };
  return createDesktopWorkbenchInstance({
    workbenchInstanceId,
    windowId: 'window:1',
    owner: { kind: 'workspace', workspaceId },
    layout: createDefaultDesktopWorkbenchLayout('window:1'),
    scene: parseDesktopWorkbenchSceneProjection({
      sceneId,
      windowId: 'window:1',
      context: { kind: 'agent', agentViewId, scope },
      slots: {
        interaction: { kind: 'agent', agentViewId, phase: session ? 'session' : 'draft', scope },
        status: { kind: 'scene-status', sceneId },
      },
    }),
    activeAgentSurfaceId: 'agent-surface:1',
    agentSurfaces: [
      {
        agentSurfaceId: 'agent-surface:1',
        lifecycle: 'hot-retained',
        interaction: { kind: 'agent', agentViewId, phase: session ? 'session' : 'draft', scope },
      },
    ],
  });
}

function entryDraftInstance(workbenchInstanceId: string, draftId: string) {
  const sceneId = `scene:${workbenchInstanceId}`;
  const agentViewId = 'agent-view:entry';
  const scope = { kind: 'unbound' as const, draftId };
  const interaction = { kind: 'agent' as const, agentViewId, phase: 'draft' as const, scope };
  return createDesktopWorkbenchInstance({
    workbenchInstanceId,
    windowId: 'window:1',
    owner: { kind: 'entry-draft', draftId },
    layout: createDefaultDesktopWorkbenchLayout('window:1'),
    scene: parseDesktopWorkbenchSceneProjection({
      sceneId,
      windowId: 'window:1',
      context: { kind: 'agent', agentViewId, scope },
      slots: {
        interaction,
        status: { kind: 'scene-status', sceneId },
      },
    }),
    activeAgentSurfaceId: 'agent-surface:entry',
    agentSurfaces: [
      { agentSurfaceId: 'agent-surface:entry', lifecycle: 'hot-retained', interaction },
    ],
  });
}

function assistantInstance(workbenchInstanceId: string, assistantSpaceId: string) {
  const sceneId = `scene:${workbenchInstanceId}`;
  const agentViewId = 'agent-view:assistant';
  const scope = {
    kind: 'assistant' as const,
    draftId: 'draft:assistant',
    assistantSpaceId,
    conversationId: 'conversation:assistant',
  };
  return createDesktopWorkbenchInstance({
    workbenchInstanceId,
    windowId: 'window:1',
    owner: { kind: 'assistant-space', assistantSpaceId },
    layout: createDefaultDesktopWorkbenchLayout('window:1'),
    scene: parseDesktopWorkbenchSceneProjection({
      sceneId,
      windowId: 'window:1',
      context: { kind: 'agent', agentViewId, scope },
      slots: {
        interaction: { kind: 'agent', agentViewId, phase: 'session', scope },
        status: { kind: 'scene-status', sceneId },
      },
    }),
    activeAgentSurfaceId: 'agent-surface:assistant',
    agentSurfaces: [
      {
        agentSurfaceId: 'agent-surface:assistant',
        lifecycle: 'hot-retained',
        interaction: { kind: 'agent', agentViewId, phase: 'session', scope },
      },
    ],
  });
}

function catalogWith(...instances: readonly ReturnType<typeof workspaceInstance>[]) {
  const active = instances[0];
  if (!active) throw new Error('Catalog fixture requires an active Workbench.');
  return parseDesktopWindowWorkbenchCatalog({
    windowId: 'window:1',
    activeWorkbenchInstanceId: active.workbenchInstanceId,
    instances,
  });
}
