import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { resolveVisibleAgentProviderAuthorization } from './desktop-agent-provider-ui.mjs';
import { openFixtureWorkspace, replaceWorkbench } from './desktop-operations.mjs';

const MARKER_A = 'OPENNEKO_WORKBENCH_A_20260806';
const MARKER_B = 'OPENNEKO_WORKBENCH_B_20260806';
const ACTIVE_AGENT = '.desktop-agent-surface-deck__item[data-active="true"]';

export const desktopWorkbenchRetentionProviderUiScenario = Object.freeze({
  id: 'desktop-workbench-retention-provider-ui',
  owner: '@neko/app-desktop',
  async prepare({ fixtureHome }) {
    const authorization = resolveVisibleAgentProviderAuthorization();
    const workspacePath = join(fixtureHome, 'workspace-a');
    const secondWorkspacePath = join(fixtureHome, 'workspace-b');
    const configRoot = join(fixtureHome, '.neko');
    await Promise.all([
      mkdir(join(workspacePath, 'boards'), { recursive: true }),
      mkdir(join(secondWorkspacePath, 'boards'), { recursive: true }),
      mkdir(configRoot, { recursive: true }),
    ]);
    await Promise.all([
      copyFile(authorization.configurationFile, join(configRoot, 'config.toml')),
      writeFile(
        join(workspacePath, 'boards', 'retained.nkc'),
        `${JSON.stringify(canvasDocument('Workspace A', 'node-a'), null, 2)}\n`,
        'utf8',
      ),
      writeFile(
        join(secondWorkspacePath, 'boards', 'retained.nkc'),
        `${JSON.stringify(canvasDocument('Workspace B', 'node-b'), null, 2)}\n`,
        'utf8',
      ),
      writeFile(
        join(fixtureHome, '.openneko-functional-workspace-queue.json'),
        `${JSON.stringify(['workspace-b'])}\n`,
        'utf8',
      ),
    ]);
    return {
      workspacePath,
      secondWorkspacePath,
      providerId: authorization.providerId,
      modelId: authorization.modelId,
    };
  },
  async run({
    cdp,
    checkpoint,
    click,
    evaluate,
    prepared,
    restartApplication,
    screenshot,
    type,
    waitForDesktopBridge,
    waitForSelector,
  }) {
    await waitForSelector('.desktop-scene-workbench--agent-only .agent-composer-textarea');
    const first = await openFixtureWorkspace(evaluate);
    await installCanvas(evaluate, 'canvas:functional:workspace-a');
    await waitForSelector(
      '[data-owner-view-id="canvas:functional:workspace-a"] [data-node-id="node-a"]',
    );
    await click('[data-owner-view-id="canvas:functional:workspace-a"] [data-node-id="node-a"]');
    await waitForSelector(
      '[data-owner-view-id="canvas:functional:workspace-a"] [data-canvas-node-child-instance][data-active="true"]',
    );
    await rememberCanvasRoot(evaluate, 'canvas:functional:workspace-a');
    await sendWorkspacePrompt(type, click, MARKER_A);
    const background = await waitForRunningConversation(evaluate, first.project.workspaceId);
    if (!background.resourceBrowserVisible) {
      throw new Error('Workspace Resource Browser was not available during Agent execution.');
    }
    checkpoint('workspace-a-background-agent-running', background);

    await click('.home-primary-navigation .home-nav-button', 1);
    await waitForSelector('[data-owner-root="asset-management"]');
    const suspendedA = await inspectRetainedCanvas(
      evaluate,
      'canvas:functional:workspace-a',
      'node-a',
    );
    if (
      suspendedA.mountCount !== 1 ||
      suspendedA.active ||
      suspendedA.lifecycle !== 'suspended' ||
      !suspendedA.sameRoot ||
      suspendedA.inspectorRetained
    ) {
      throw new Error(
        `Workspace A did not suspend its retained Canvas instance: ${JSON.stringify(suspendedA)}`,
      );
    }
    checkpoint('workspace-a-canvas-suspended', suspendedA);
    checkpoint('background-management-page-visible', await inspectCatalog(evaluate));

    const second = await openQueuedWorkspace(evaluate);
    await installCanvas(evaluate, 'canvas:functional:workspace-b');
    await waitForSelector(
      '[data-owner-view-id="canvas:functional:workspace-b"] [data-node-id="node-b"]',
    );
    await click('[data-owner-view-id="canvas:functional:workspace-b"] [data-node-id="node-b"]');
    await waitForSelector(
      '[data-owner-view-id="canvas:functional:workspace-b"] [data-canvas-node-child-instance][data-active="true"]',
    );
    await sendWorkspacePrompt(type, click, MARKER_B);
    checkpoint('workspace-b-agent-submitted', await inspectCatalog(evaluate));

    const responseA = await waitForWorkspaceConversationMarker(
      evaluate,
      first.project.workspaceId,
      MARKER_A,
      120_000,
    );
    const responseB = await waitForWorkspaceConversationMarker(
      evaluate,
      second.workspaceId,
      MARKER_B,
      120_000,
    );
    const twoConversations = await inspectCatalog(evaluate);
    if (twoConversations.workspaceCount !== 2 || twoConversations.conversationCount !== 2) {
      throw new Error(
        `Two-Workspace Agent catalog is incomplete: ${JSON.stringify(twoConversations)}`,
      );
    }
    checkpoint('background-agents-completed', { ...twoConversations, responseA, responseB });

    await activateProject(evaluate, first.project.projectId);
    await waitForSelector('[data-owner-view-id="canvas:functional:workspace-a"]');
    const resumedA = await inspectRetainedCanvas(
      evaluate,
      'canvas:functional:workspace-a',
      'node-a',
    );
    if (
      !resumedA.active ||
      !resumedA.inspectorRetained ||
      resumedA.lifecycle !== 'active' ||
      !resumedA.sameRoot ||
      resumedA.mountCount !== 1
    ) {
      throw new Error(
        `Workspace A did not resume its retained Canvas tree: ${JSON.stringify(resumedA)}`,
      );
    }
    checkpoint('workspace-a-suspend-resume', resumedA);

    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    await activateProject(evaluate, second.projectId);
    await waitForSelector('[data-owner-view-id="canvas:functional:workspace-b"]');
    await activateProject(evaluate, first.project.projectId);
    const offlineRestore = await inspectCatalog(evaluate);
    if (offlineRestore.workspaceCount !== 2 || offlineRestore.conversationCount !== 2) {
      throw new Error('Offline switching dropped a Workspace or Conversation projection.');
    }
    checkpoint('offline-local-restore', offlineRestore);
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });

    await restartApplication();
    await waitForDesktopBridge(60_000);
    await waitForSelector('[data-neko-controlled-workbench="true"]');
    const restoredResponseA = await waitForWorkspaceConversationMarker(
      evaluate,
      first.project.workspaceId,
      MARKER_A,
      30_000,
    );
    const restoredResponseB = await waitForWorkspaceConversationMarker(
      evaluate,
      second.workspaceId,
      MARKER_B,
      30_000,
    );
    const restored = await inspectCatalog(evaluate);
    if (restored.workspaceCount !== 2 || restored.conversationCount !== 2) {
      throw new Error(
        `Restart did not restore the complete instance catalog: ${JSON.stringify(restored)}`,
      );
    }
    const screenshotArtifact = await screenshot('two-workspace-agent-canvas-restored');
    checkpoint('application-restart-restoration', {
      ...restored,
      responseA: restoredResponseA,
      responseB: restoredResponseB,
    });
    return {
      authorization: {
        providerId: prepared.providerId,
        modelId: prepared.modelId,
        source: '~/.neko/config.toml',
      },
      background,
      offlineRestore,
      restored,
      screenshot: screenshotArtifact,
    };
  },
});

async function installCanvas(evaluate, viewId) {
  await replaceWorkbench(
    evaluate,
    `(projection, current, tab, project) => ({
      ...current,
      revision: current.revision + 1,
      display: { ...current.display, mode: 'chat-main' },
      main: {
        views: [{
          viewId: ${JSON.stringify(viewId)},
          viewEpoch: tab.viewEpoch,
          projectId: project.projectId,
          workspaceId: project.workspaceId,
          kind: 'canvas',
          ownerId: ${JSON.stringify(`${viewId}:session`)},
          displayLabel: 'retained.nkc',
          documentId: 'boards/retained.nkc',
        }],
        groups: [{
          groupId: 'main:primary',
          viewIds: [${JSON.stringify(viewId)}],
          activeViewId: ${JSON.stringify(viewId)},
        }],
        activeGroupId: 'main:primary',
      },
      timeline: { presentation: 'hidden', height: current.timeline.height },
    })`,
  );
}

async function sendWorkspacePrompt(type, click, marker) {
  const prompt = `Reply with exactly ${marker} and no other text. Do not call tools.`;
  await type(`${ACTIVE_AGENT} .agent-composer-textarea`, prompt);
  await click(`${ACTIVE_AGENT} .agent-composer-send`);
}

async function openQueuedWorkspace(evaluate) {
  return evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    const active = projection.window.workbenches.instances.find((candidate) =>
      candidate.workbenchInstanceId === projection.window.workbenches.activeWorkbenchInstanceId,
    );
    if (!active) throw new Error('Active Workbench is unavailable.');
    const grant = await window.openNekoDesktop.workspaceGrants.choose(
      projection.window.windowId,
      projection.window.revision,
    );
    if (grant.status !== 'authorized') throw new Error('Second fixture Workspace was not authorized.');
    const transition = await window.openNekoDesktop.scenes.transition(
      projection.window.windowId,
      { kind: 'open-workspace', workspaceGrantId: grant.grant.workspaceGrantId },
      projection.window.revision,
      active.scene.revision,
    );
    if (transition.status !== 'transitioned' || transition.scene.context.kind !== 'agent' ||
        transition.scene.context.scope.kind !== 'workspace') {
      throw new Error('Second fixture Workspace did not activate.');
    }
    const committed = await window.openNekoDesktop.shell.getSnapshot();
    const project = committed.catalog.projects.find((candidate) =>
      candidate.workspaceId === transition.scene.context.scope.workspaceId,
    );
    if (!project) throw new Error('Second fixture Project is unavailable.');
    return { projectId: project.projectId, workspaceId: project.workspaceId };
  })()`);
}

async function activateProject(evaluate, projectId) {
  await evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    const active = projection.window.workbenches.instances.find((candidate) =>
      candidate.workbenchInstanceId === projection.window.workbenches.activeWorkbenchInstanceId,
    );
    if (!active) throw new Error('Active Workbench is unavailable.');
    const result = await window.openNekoDesktop.scenes.transition(
      projection.window.windowId,
      { kind: 'open-project-workspace', projectId: ${JSON.stringify(projectId)} },
      projection.window.revision,
      active.scene.revision,
    );
    if (result.status !== 'transitioned') throw new Error(result.diagnostic.message);
  })()`);
}

async function waitForRunningConversation(evaluate, workspaceId) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const detail = await inspectCatalog(evaluate);
    const running = detail.conversations.find(
      (conversation) =>
        conversation.ownerKind === 'workspace' &&
        conversation.ownerId === workspaceId &&
        conversation.activity === 'turn-running',
    );
    if (running) return { ...detail, runningConversationId: running.conversationId };
    await delay(100);
  }
  throw new Error('Workspace Agent did not enter background execution.');
}

async function waitForWorkspaceConversationMarker(evaluate, workspaceId, marker, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await inspectWorkspaceConversationMarker(evaluate, workspaceId, marker);
    if (result.markerVisible) return result;
    await delay(200);
  }
  throw new Error(
    `Workspace '${workspaceId}' Agent response '${marker}' was not projected before timeout.`,
  );
}

async function inspectWorkspaceConversationMarker(evaluate, workspaceId, marker) {
  return evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    const instance = projection.window.workbenches.instances.find((candidate) =>
      candidate.owner.kind === 'workspace' &&
      candidate.owner.workspaceId === ${JSON.stringify(workspaceId)},
    );
    if (!instance) return { markerVisible: false, reason: 'workspace-unavailable' };
    const surface = instance.agentSurfaces.find((candidate) =>
      candidate.interaction.scope.kind === 'workspace' &&
      candidate.interaction.scope.workspaceId === ${JSON.stringify(workspaceId)} &&
      typeof candidate.interaction.scope.conversationId === 'string',
    );
    if (!surface) return { markerVisible: false, reason: 'conversation-surface-unavailable' };
    const root = document.querySelector(
      '[data-agent-surface-id="' + CSS.escape(surface.agentSurfaceId) + '"]',
    );
    return {
      markerVisible: root?.textContent?.includes(${JSON.stringify(marker)}) === true,
      workbenchInstanceId: instance.workbenchInstanceId,
      agentSurfaceId: surface.agentSurfaceId,
      conversationId: surface.interaction.scope.conversationId,
      active: root?.getAttribute('data-active') === 'true',
    };
  })()`);
}

async function inspectCatalog(evaluate) {
  return evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    return {
      workspaceCount: projection.window.workbenches.instances.filter((instance) =>
        instance.owner.kind === 'workspace',
      ).length,
      conversationCount: projection.agentHome.conversations.filter((conversation) =>
        conversation.navigation.owner.kind === 'workspace',
      ).length,
      activeWorkbenchInstanceId: projection.window.workbenches.activeWorkbenchInstanceId,
      resourceBrowserVisible: Boolean(document.querySelector(
        '.desktop-workbench-slot-deck__item[data-active="true"] .desktop-resource-browser-root',
      )),
      assetManagementVisible: Boolean(document.querySelector('[data-owner-root="asset-management"]')),
      conversations: projection.agentHome.conversations.map((conversation) => ({
        conversationId: conversation.navigation.conversationId,
        ownerKind: conversation.navigation.owner.kind,
        ownerId: conversation.navigation.owner.kind === 'workspace'
          ? conversation.navigation.owner.workspaceId
          : undefined,
        activity: conversation.lastActivity.kind,
      })),
    };
  })()`);
}

async function inspectRetainedCanvas(evaluate, viewId, nodeId) {
  return evaluate(`(() => {
    const roots = [...document.querySelectorAll('[data-owner-view-id=${JSON.stringify(viewId)}]')];
    const active = roots.find((root) => !root.closest('[hidden]'));
    const root = active ?? roots[0];
    return {
      mountCount: roots.length,
      active: Boolean(active),
      sameRoot: root === globalThis.__openNekoFunctionalRetainedCanvasRoot,
      lifecycle: root?.querySelector('[data-lifecycle-presentation]')
        ?.getAttribute('data-lifecycle-presentation'),
      inspectorRetained: Boolean(root?.querySelector(
        '[data-canvas-node-child-instance][data-active="true"][data-canvas-node-child-instance*=${JSON.stringify(nodeId)}]',
      )),
    };
  })()`);
}

async function rememberCanvasRoot(evaluate, viewId) {
  await evaluate(`(() => {
    const root = document.querySelector('[data-owner-view-id=${JSON.stringify(viewId)}]');
    if (!root) throw new Error('Canvas root is unavailable for retention identity capture.');
    globalThis.__openNekoFunctionalRetainedCanvasRoot = root;
  })()`);
}

function canvasDocument(name, nodeId) {
  return {
    name,
    viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
    nodes: [
      {
        id: nodeId,
        type: 'markdown',
        position: { x: 80, y: 80 },
        size: { width: 320, height: 220 },
        zIndex: 1,
        data: { title: `${name} retained node`, content: name },
      },
    ],
    connections: [],
  };
}
