import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const desktopWorkbenchScenesScenario = Object.freeze({
  id: 'desktop-workbench-scenes',
  owner: '@neko/app-desktop',
  async prepare({ fixtureHome, repositoryRoot }) {
    const workspacePath = join(fixtureHome, 'workspace');
    const configRoot = join(fixtureHome, '.neko');
    await Promise.all([
      mkdir(workspacePath, { recursive: true }),
      mkdir(configRoot, { recursive: true }),
    ]);
    await copyFile(
      join(repositoryRoot, 'docs/assets/openneko-desktop.png'),
      join(workspacePath, 'preview.png'),
    );
    await writeFile(
      join(fixtureHome, '.openneko-functional-cancel-workspace-picker-once'),
      'cancel-next-workspace-picker\n',
      'utf8',
    );
    await writeFile(
      join(configRoot, 'config.toml'),
      [
        'default_provider = "functional-ollama"',
        'default_model = "functional-ollama:functional-chat"',
        '',
        '[[providers]]',
        'id = "functional-ollama"',
        'name = "Functional Ollama"',
        'type = "ollama"',
        'base_url = "http://127.0.0.1:1"',
        'enabled = true',
        'connection_kind = "local"',
        'protocol_profile = "ollama"',
        'requires_api_key = false',
        '',
        '[[models]]',
        'id = "functional-chat"',
        'name = "Functional Chat"',
        'provider_id = "functional-ollama"',
        'type = "llm"',
        'capabilities = ["chat"]',
        'enabled = true',
        '',
      ].join('\n'),
      { encoding: 'utf8', mode: 0o600 },
    );
    return { workspacePath };
  },
  async run({
    checkpoint,
    click,
    drag,
    evaluate,
    restartApplication,
    screenshot,
    type,
    waitForDesktopBridge,
    waitForSelector,
  }) {
    await resizeWindow(evaluate, 1440, 960);
    await waitForSelector('.desktop-scene-workbench--agent-only');
    await waitForSelector('.agent-composer-shell');
    const agent = await inspectWorkbench(evaluate, 'agent-only');
    assertSingleWorkbench(agent);
    assertAgentOnly(agent);
    const initialEntryDraft = await inspectEntryDraft(evaluate);
    const draftControls = await inspectAgentDraftControls(evaluate);
    assertAgentDraftControls(draftControls);
    const sidebarLifecycle = await exercisePrimarySidebar(evaluate, click, drag);
    const agentScreenshot = await screenshot('agent-only-large');
    checkpoint('agent-only-large', { ...agent, draftControls, sidebarLifecycle });

    await click('.home-primary-navigation .home-nav-button', 1);
    await waitForSelector('[data-owner-root="asset-management"]');
    const assets = await inspectWorkbench(evaluate, 'management', 'asset-management');
    assertManagementMain(assets, 'asset-management');
    assertSharedManagementPanel(assets, 'asset-management');
    const assetsScreenshot = await screenshot('asset-management-main-large');
    checkpoint('asset-management-main-large', assets);

    await waitForSelector('[data-owner-root="asset-management"][data-catalog-status="ready"]');
    await click('.global-library-browser__commands button');
    await waitForCondition(
      evaluate,
      `(() => [...document.querySelectorAll('.global-library-browser__entry strong')]
        .some((element) => element.textContent?.trim() === 'workspace'))()`,
      'The fixture media library was not added to Asset Management.',
    );
    await activateAssetEntry(evaluate, 'workspace', 'dblclick');
    await waitForCondition(
      evaluate,
      `(() => [...document.querySelectorAll('.global-library-browser__entry strong')]
        .some((element) => element.textContent?.trim() === 'preview.png'))()`,
      'The fixture media file was not listed inside Asset Management.',
    );
    await activateAssetEntry(evaluate, 'preview.png', 'click');
    await waitForCondition(
      evaluate,
      `(() => [...document.querySelectorAll('.global-library-browser__entry[data-selected="true"] strong')]
        .some((element) => element.textContent?.trim() === 'preview.png'))()`,
      'Asset Management did not commit the selected fixture media item.',
    );
    await waitForSelector(
      '.neko-controlled-workbench-main__secondary [data-authorized-preview-session-id]',
    );
    const assetPreview = await inspectWorkbench(evaluate, 'management', 'asset-management');
    assertManagementDetailSplit(assetPreview, 'asset-management', 'asset-preview');
    if (
      !assetPreview.previewInSecondary ||
      assetPreview.previewKind !== 'image' ||
      assetPreview.previewPresentationOwner !== 'preview-webview' ||
      assetPreview.previewRenderableHeight <= 0
    ) {
      throw new Error('Asset Preview was not composed as an image in Secondary Main.');
    }
    const assetPreviewResize = await exerciseManagementMainSplit(evaluate, drag);
    const assetPreviewScreenshot = await screenshot('asset-management-with-preview-large');
    checkpoint('asset-management-with-preview-large', { ...assetPreview, assetPreviewResize });

    await click('.home-primary-navigation .home-nav-button', 2);
    await waitForSelector('.agent-extension-management-root');
    const extensions = await inspectWorkbench(evaluate, 'management', 'extension-management');
    assertManagementMain(extensions, 'extension-management');
    assertSharedManagementPanel(extensions, 'extension-management');
    assertBoundedManagement(extensions, 'extension-management');
    const extensionsScreenshot = await screenshot('extension-management-main-large');
    checkpoint('extension-management-main-large', extensions);

    await click('.home-primary-navigation .home-nav-button', 3);
    await waitForSelector('.project-management-catalog');
    const projects = await inspectWorkbench(evaluate, 'management', 'project-management');
    assertManagementMain(projects, 'project-management');
    assertSharedManagementPanel(projects, 'project-management');
    assertBoundedManagement(projects, 'project-management');
    const projectsScreenshot = await screenshot('project-management-main-large');
    checkpoint('project-management-main-large', projects);

    await click('.home-navigation-footer__actions button:last-child');
    await waitForSelector('[data-settings-surface="main"]');
    const settings = await inspectWorkbench(evaluate, 'management', 'settings');
    assertSingleWorkbench(settings);
    if (!settings.hasLeftDock || !settings.ownerInMain) {
      throw new Error('Settings did not compose navigation plus Main in the unified Workbench.');
    }
    checkpoint('settings-workbench-large', settings);

    await click('.home-primary-navigation .home-nav-button', 0);
    await waitForSelector('.desktop-scene-workbench--agent-only');
    const workspaceCancellation = await assertFixtureWorkspaceCancellation(evaluate);
    checkpoint('workspace-picker-cancellation', workspaceCancellation);
    const workspaceActivation = await chooseFixtureWorkspace(evaluate);
    await waitForSelector('.desktop-scene-workbench--workspace');
    await waitForSelector('[data-dock-owner="resources"]');
    const workspace = await inspectWorkbench(evaluate, 'workspace', 'workspace');
    assertSingleWorkbench(workspace);
    if (!workspace.hasAgentDock || !workspace.hasRightDock || !workspace.hasWorkspaceMain) {
      throw new Error('Workspace did not compose Agent, creative Main and right Resources.');
    }
    const workspaceScreenshot = await screenshot('workspace-large');
    const workspaceComposer = await inspectComposerPresentation(evaluate);
    assertWorkspaceComposer(workspaceComposer, 'workspace');
    if (workspaceComposer.ownerWidth >= 400 || !workspaceComposer.toolbarFitsSurface) {
      throw new Error('Agent composer did not qualify the narrow Workspace dock presentation.');
    }
    checkpoint('workspace-large', { ...workspace, workspaceActivation, workspaceComposer });

    const displayModes = await exerciseWorkspaceDisplayModes(evaluate, click);
    checkpoint('workspace-display-modes', displayModes);

    await waitForNavigationButton(evaluate, 3);
    await click('.home-primary-navigation .home-nav-button', 3);
    await waitForSelector('.project-management-catalog .management-surface-row');
    await click('.project-management-catalog .management-surface-row');
    await waitForSelector('[data-workbench-main-panel="project-detail"]');
    const projectDetail = await inspectWorkbench(evaluate, 'management', 'project-management');
    assertManagementDetailSplit(projectDetail, 'project-management', 'project-detail');
    if (!projectDetail.projectDetailInSecondary) {
      throw new Error('Project Detail was not composed in the shared Secondary Main panel.');
    }
    const projectDetailScreenshot = await screenshot('project-management-with-detail-large');
    checkpoint('project-management-with-detail-large', projectDetail);

    await waitForNavigationButton(evaluate, 1);
    await click('.home-primary-navigation .home-nav-button', 1);
    await waitForSelector('[data-owner-root="asset-management"]');
    await waitForRecentProjectButton(evaluate);
    await click('.primary-recent-project-row .home-project-link');
    await waitForSelector('.desktop-scene-workbench--workspace');
    const recentProjectRestore = await inspectExactWorkspace(
      evaluate,
      workspaceActivation.workspaceId,
    );
    checkpoint('recent-project-exact-restore', recentProjectRestore);

    await restartApplication();
    await waitForDesktopBridge(60_000);
    await waitForSelector('.desktop-scene-workbench--workspace');
    const reloadedWorkspace = await inspectWorkbench(evaluate, 'workspace', 'workspace');
    assertSingleWorkbench(reloadedWorkspace);
    const reloadRestore = await inspectExactWorkspace(evaluate, workspaceActivation.workspaceId);
    checkpoint('workspace-reload-restore', { ...reloadedWorkspace, ...reloadRestore });

    await waitForNavigationButton(evaluate, 1);
    await click('.home-primary-navigation .home-nav-button', 1);
    await waitForSelector('[data-owner-root="asset-management"]');
    await openPersistedFixtureAssetPreview(evaluate);
    await resizeWindow(evaluate, 1040, 700);
    const smallAssets = await inspectWorkbench(evaluate, 'management', 'asset-management');
    assertManagementDetailSplit(smallAssets, 'asset-management', 'asset-preview');
    if (
      !smallAssets.previewInSecondary ||
      smallAssets.previewPresentationOwner !== 'preview-webview' ||
      smallAssets.previewRenderableHeight <= 0
    ) {
      throw new Error('Small-window Asset Preview lost its canonical visible presentation.');
    }
    const smallAssetsScreenshot = await screenshot('asset-management-with-preview-small');
    checkpoint('asset-management-with-preview-small', smallAssets);

    await resizeWindow(evaluate, 1440, 960);
    await click('.home-primary-navigation .home-nav-button', 0);
    await waitForSelector('.desktop-scene-workbench--agent-only .agent-composer-textarea');
    const freshEntryDraft = await inspectEntryDraft(evaluate, [
      initialEntryDraft.draftId,
      workspaceActivation.draftId,
    ]);
    const assistantDraft = await bindAssistantDraft(evaluate);
    checkpoint('fresh-entry-draft-assistant-bind', {
      initialEntryDraft,
      freshEntryDraft,
      assistantDraft,
    });
    await evaluate(`(() => {
      globalThis.__openNekoAgentSessionEvents = [];
      globalThis.__openNekoAgentSessionEventSubscription?.();
      globalThis.__openNekoAgentSessionEventSubscription = window.openNekoDesktop.agent.subscribe(
        (message) => {
          globalThis.__openNekoAgentSessionEvents.push({
            type: message.type,
            ...(message.type === 'tabState'
              ? {
                  revision: message.revision,
                  tabIds: message.tabState?.openTabs?.map((tab) => tab.conversationId) ?? [],
                  activeTabId: message.tabState?.activeTabId,
                }
              : {}),
            ...(message.type === 'activeConversation'
              ? {
                  conversationId: message.conversation?.id,
                  messages: message.conversation?.messages?.map((item) => ({
                    role: item.role,
                    content: item.content,
                  })) ?? [],
                }
              : {}),
            ...(message.type === 'conversationSnapshot'
              ? {
                  conversationId: message.conversation.id,
                  messages: message.conversation.messages.map((item) => ({
                    role: item.role,
                    content: item.content,
                  })),
                }
              : {}),
          });
        },
      );
    })()`);
    await type('.agent-composer-textarea', 'Verify atomic Assistant session activation.');
    await waitForCondition(
      evaluate,
      `(() => {
        const send = document.querySelector('.agent-composer-send');
        return send instanceof HTMLButtonElement && !send.disabled;
      })()`,
      'Assistant draft did not enable its canonical Agent send control.',
    );
    await click('.agent-composer-send');
    const assistantActivation = await waitForAssistantSession(evaluate);
    await click('.home-primary-navigation .home-nav-button', 1);
    await waitForSelector('[data-owner-root="asset-management"]');
    await waitForSelector('.home-conversation-link');
    await click('.home-conversation-link');
    const assistantRestore = await waitForAssistantSession(
      evaluate,
      assistantActivation.conversationId,
    );
    const assistantRestoreScreenshot = await screenshot('assistant-session-exact-restore-large');
    checkpoint('assistant-session-exact-restore-large', {
      activation: assistantActivation,
      restore: assistantRestore,
    });

    return {
      scenes: {
        agent,
        assets,
        extensions,
        projects,
        projectDetail,
        settings,
        workspace,
        smallAssets,
        assistantActivation,
        assistantRestore,
      },
      screenshots: [
        agentScreenshot,
        assetsScreenshot,
        assetPreviewScreenshot,
        extensionsScreenshot,
        projectsScreenshot,
        projectDetailScreenshot,
        workspaceScreenshot,
        smallAssetsScreenshot,
        assistantRestoreScreenshot,
      ],
    };
  },
});

async function resizeWindow(evaluate, width, height) {
  await evaluate(`(() => {
    window.resizeTo(${String(width)}, ${String(height)});
    return { width: window.innerWidth, height: window.innerHeight };
  })()`);
  await delay(250);
}

async function waitForNavigationButton(evaluate, index) {
  await waitForCondition(
    evaluate,
    `(() => {
      const button = document.querySelectorAll('.home-primary-navigation .home-nav-button')[${String(index)}];
      return button instanceof HTMLButtonElement && !button.disabled;
    })()`,
    'PrimarySidebar navigation did not become interactive after reload.',
  );
}

async function waitForRecentProjectButton(evaluate) {
  await waitForCondition(
    evaluate,
    `(() => {
      const button = document.querySelector('.primary-recent-project-row .home-project-link');
      return button instanceof HTMLButtonElement && !button.disabled;
    })()`,
    'Recent Project navigation did not become interactive.',
  );
}

async function chooseFixtureWorkspace(evaluate) {
  return evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    const result = await window.openNekoDesktop.workspaceGrants.choose(
      projection.window.windowId,
      projection.window.revision,
    );
    if (result.status !== 'authorized') {
      throw new Error('The isolated fixture Workspace grant was cancelled.');
    }
    if ('path' in result.grant || 'hostResource' in result.grant) {
      throw new Error('Workspace grant exposed a raw host path to the Renderer.');
    }
    const transition = await window.openNekoDesktop.scenes.transition(
      projection.window.windowId,
      { kind: 'open-workspace', workspaceGrantId: result.grant.workspaceGrantId },
      projection.window.revision,
      projection.window.scene.revision,
    );
    if (transition.status !== 'transitioned') {
      throw new Error('Workspace grant did not activate an exact Workspace Scene.');
    }
    if (transition.scene.context.kind !== 'agent' || transition.scene.context.scope.kind !== 'workspace') {
      throw new Error('Workspace grant activated an incompatible Scene scope.');
    }
    const committed = await window.openNekoDesktop.shell.getSnapshot();
    const project = committed.catalog.projects.find(
      (candidate) => candidate.workspaceId === transition.scene.context.scope.workspaceId,
    );
    if (!project) throw new Error('Workspace grant did not create an exact Project catalog projection.');
    if (committed.agentHome.conversations.length !== 0) {
      throw new Error('Workspace activation created an Agent Conversation before first submit.');
    }
    return {
      workspaceGrantId: result.grant.workspaceGrantId,
      workspaceId: transition.scene.context.scope.workspaceId,
      projectId: project.projectId,
      draftId: transition.scene.context.scope.draftId,
      conversationCount: committed.agentHome.conversations.length,
    };
  })()`);
}

async function inspectEntryDraft(evaluate, forbiddenDraftIds = []) {
  return evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    const context = projection.window.scene.context;
    if (context.kind !== 'agent' || context.scope.kind !== 'unbound') {
      throw new Error('Agent-only entry inspection requires an unbound Entry Draft.');
    }
    if (${JSON.stringify(forbiddenDraftIds)}.includes(context.scope.draftId)) {
      throw new Error('Start Creating reused a prior Agent draft identity.');
    }
    if (document.querySelector('[data-testid="conversation-tabs"]')) {
      throw new Error('Entry Draft retained session-only conversation Tabs.');
    }
    if (document.querySelectorAll('[data-testid="message-item"]').length > 0) {
      throw new Error('Entry Draft retained a prior conversation transcript.');
    }
    const textarea = document.querySelector('.agent-composer-textarea');
    if (!(textarea instanceof HTMLTextAreaElement) || textarea.value !== '') {
      throw new Error('Entry Draft did not reset its composer input.');
    }
    return {
      draftId: context.scope.draftId,
      conversationCount: projection.agentHome.conversations.length,
    };
  })()`);
}

async function bindAssistantDraft(evaluate) {
  return evaluate(`(async () => {
    const before = await window.openNekoDesktop.shell.getSnapshot();
    const beforeContext = before.window.scene.context;
    if (beforeContext.kind !== 'agent' || beforeContext.scope.kind !== 'unbound') {
      throw new Error('Assistant binding requires an unbound Entry Draft.');
    }
    const root = document.querySelector('.desktop-agent-root');
    const action = document.querySelector('[data-agent-scope="unbound"] .agent-empty-action');
    if (!(action instanceof HTMLButtonElement) || action.disabled) {
      throw new Error('Entry Draft Assistant action is unavailable.');
    }
    action.click();
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const projection = await window.openNekoDesktop.shell.getSnapshot();
      const context = projection.window.scene.context;
      if (context.kind === 'agent' && context.scope.kind === 'assistant') {
        if (context.scope.draftId !== beforeContext.scope.draftId) {
          throw new Error('Assistant binding replaced the exact Entry Draft identity.');
        }
        if (projection.agentHome.conversations.length !== before.agentHome.conversations.length) {
          throw new Error('Assistant binding created a conversation before first submit.');
        }
        while (Date.now() < deadline) {
          if (document.querySelector('[data-agent-scope="assistant"] .agent-composer-textarea')) {
            if (document.querySelector('.desktop-agent-root') !== root) {
              throw new Error('Assistant binding remounted the package-owned Agent Root.');
            }
            return {
              draftId: context.scope.draftId,
              assistantSpaceId: context.scope.assistantSpaceId,
              conversationCount: projection.agentHome.conversations.length,
            };
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Entry Draft did not bind to Assistant before timeout.');
  })()`);
}

async function assertFixtureWorkspaceCancellation(evaluate) {
  return evaluate(`(async () => {
    const before = await window.openNekoDesktop.shell.getSnapshot();
    const result = await window.openNekoDesktop.workspaceGrants.choose(
      before.window.windowId,
      before.window.revision,
    );
    if (result.status !== 'cancelled') {
      throw new Error('The isolated native Workspace picker did not report cancellation.');
    }
    const after = await window.openNekoDesktop.shell.getSnapshot();
    if (
      after.window.revision !== before.window.revision ||
      after.window.scene.revision !== before.window.scene.revision ||
      JSON.stringify(after.window.scene) !== JSON.stringify(before.window.scene) ||
      JSON.stringify(after.catalog.projects) !== JSON.stringify(before.catalog.projects)
    ) {
      throw new Error('Workspace picker cancellation mutated the active Scene or Project catalog.');
    }
    return {
      status: result.status,
      windowRevision: after.window.revision,
      sceneRevision: after.window.scene.revision,
      sceneKind: after.window.scene.context.kind,
      projectCount: after.catalog.projects.length,
    };
  })()`);
}

async function inspectExactWorkspace(evaluate, expectedWorkspaceId) {
  return evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    const context = projection.window.scene.context;
    if (context.kind !== 'agent' || context.scope.kind !== 'workspace') {
      throw new Error('Exact Workspace inspection requires a Workspace Agent Scene.');
    }
    if (context.scope.workspaceId !== ${JSON.stringify(expectedWorkspaceId)}) {
      throw new Error('Recent Project or reload restored a different Workspace identity.');
    }
    return {
      workspaceId: context.scope.workspaceId,
      workspaceGrantId: context.scope.workspaceGrantId,
      projectIds: projection.catalog.projects.map((project) => project.projectId),
      recentSectionCount: document.querySelectorAll('.home-sidebar-heading').length,
    };
  })()`);
}

async function waitForAssistantSession(evaluate, expectedConversationId) {
  try {
    await waitForCondition(
      evaluate,
      `(async () => {
        const projection = await window.openNekoDesktop.shell.getSnapshot();
        const context = projection.window.scene.context;
        const interaction = projection.window.scene.slots.interaction;
        return context.kind === 'agent' &&
          context.scope.kind === 'assistant' &&
          typeof context.scope.conversationId === 'string' &&
          interaction?.kind === 'agent' &&
          interaction.phase === 'session' &&
          interaction.scope.kind === 'assistant' &&
          interaction.scope.conversationId === context.scope.conversationId &&
          ${
            expectedConversationId === undefined
              ? 'projection.agentHome.conversations.length === 1'
              : `context.scope.conversationId === ${JSON.stringify(expectedConversationId)}`
          };
      })()`,
      'Assistant conversation did not atomically activate its Agent session Scene.',
    );
  } catch (error) {
    const diagnostic = await evaluate(`(async () => {
      const projection = await window.openNekoDesktop.shell.getSnapshot();
      const textarea = document.querySelector('.agent-composer-textarea');
      const send = document.querySelector('.agent-composer-action-button');
      return {
        context: projection.window.scene.context,
        interaction: projection.window.scene.slots.interaction,
        conversations: projection.agentHome.conversations,
        alerts: [...document.querySelectorAll('[role="alert"]')]
          .map((element) => element.textContent?.trim()).filter(Boolean),
        model: document.querySelector('.agent-model-config-trigger')?.textContent?.trim(),
        textareaValue: textarea instanceof HTMLTextAreaElement ? textarea.value : undefined,
        sendClass: send?.getAttribute('class'),
        sendDisabled: send instanceof HTMLButtonElement ? send.disabled : undefined,
        agentText: document.querySelector('[data-owner-root="agent"]')?.textContent?.trim().slice(0, 800),
      };
    })()`);
    throw new Error(
      `${error instanceof Error ? error.message : String(error)} Diagnostic: ${JSON.stringify(diagnostic)}`,
    );
  }
  try {
    await waitForCondition(
      evaluate,
      `document.querySelector('[data-owner-root="agent"]')?.textContent
        ?.includes('Verify atomic Assistant session activation.') === true`,
      'Assistant Agent did not render the locally committed initial message.',
    );
  } catch (error) {
    const diagnostic = await evaluate(`(async () => {
      const projection = await window.openNekoDesktop.shell.getSnapshot();
      return {
        context: projection.window.scene.context,
        interaction: projection.window.scene.slots.interaction,
        conversations: projection.agentHome.conversations,
        agentText: document.querySelector('[data-owner-root="agent"]')?.textContent?.trim().slice(0, 1200),
        alerts: [...document.querySelectorAll('[role="alert"]')]
          .map((element) => element.textContent?.trim()).filter(Boolean),
        tabs: [...document.querySelectorAll('[data-testid="conversation-tabs"] button')]
          .map((element) => element.textContent?.trim()).filter(Boolean),
        sessionEvents: globalThis.__openNekoAgentSessionEvents ?? [],
      };
    })()`);
    throw new Error(
      `${error instanceof Error ? error.message : String(error)} Diagnostic: ${JSON.stringify(diagnostic)}`,
    );
  }
  return evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    const context = projection.window.scene.context;
    if (context.kind !== 'agent' || context.scope.kind !== 'assistant' ||
        typeof context.scope.conversationId !== 'string') {
      throw new Error('Assistant session inspection requires an exact conversation context.');
    }
    const previousManagementVisible = Boolean(
      document.querySelector(
        '[data-owner-root="asset-management"], .agent-extension-management-root, .project-management-catalog',
      ),
    );
    const agent = document.querySelector('[data-owner-root="agent"]');
    if (!(agent instanceof HTMLElement) || previousManagementVisible) {
      throw new Error('Assistant session restored through the previous management layout.');
    }
    return {
      conversationId: context.scope.conversationId,
      phase: projection.window.scene.slots.interaction?.kind === 'agent'
        ? projection.window.scene.slots.interaction.phase
        : undefined,
      conversationCount: projection.agentHome.conversations.length,
      hasAgent: true,
      previousManagementVisible,
      transcriptContainsSubmittedMessage:
        document.body.textContent?.includes('Verify atomic Assistant session activation.') ?? false,
    };
  })()`);
}

async function exercisePrimarySidebar(evaluate, click, drag) {
  const initial = await evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    return projection.window.applicationSidebar;
  })()`);
  await click('.primary-sidebar-toggle');
  await waitForCondition(
    evaluate,
    `document.querySelector('[data-primary-sidebar="application"]')?.classList.contains('home-navigation--compact') === true`,
    'PrimarySidebar did not enter its compact presentation.',
  );
  const compactToggle = await evaluate(`(() => {
    const toggle = document.querySelector('.primary-sidebar-toggle');
    const brand = document.querySelector('.home-brand');
    return {
      exists: toggle instanceof HTMLButtonElement,
      outsideBrand: toggle instanceof HTMLElement && brand instanceof HTMLElement && !brand.contains(toggle),
      label: toggle?.getAttribute('aria-label'),
    };
  })()`);
  if (
    !compactToggle.exists ||
    !compactToggle.outsideBrand ||
    compactToggle.label !== '展开侧边栏'
  ) {
    throw new Error('Compact PrimarySidebar lost its dedicated expand control.');
  }
  await click('.primary-sidebar-toggle');
  await waitForCondition(
    evaluate,
    `document.querySelector('[data-primary-sidebar="application"]')?.classList.contains('home-navigation--compact') === false`,
    'PrimarySidebar did not restore its expanded presentation.',
  );
  await drag(
    '.neko-controlled-workbench-primary > .neko-controlled-workbench-resize-handle',
    '.neko-controlled-workbench-dock--left',
    { targetPosition: { xRatio: 0.12, yRatio: 0.5 } },
  );
  await waitForCondition(
    evaluate,
    `(async () => (await window.openNekoDesktop.shell.getSnapshot()).window.applicationSidebar.width !== ${String(initial.width)})()`,
    'PrimarySidebar resize did not commit a new width.',
  );
  const committed = await evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    return projection.window.applicationSidebar;
  })()`);
  if (!committed.visible || committed.width <= initial.width) {
    throw new Error(
      'PrimarySidebar toggle/resize did not preserve an expanded resized projection.',
    );
  }
  return { initial, compactToggle, committed };
}

async function exerciseManagementMainSplit(evaluate, drag) {
  const initial = await inspectMainSplit(evaluate);
  await drag(
    '.neko-controlled-workbench-main-split-handle--columns',
    '.neko-controlled-workbench-main',
    { targetPosition: { xRatio: 0.46, yRatio: 0.5 } },
  );
  await waitForCondition(
    evaluate,
    `(() => {
      const shell = document.querySelector('[data-neko-controlled-workbench="true"]');
      return shell instanceof HTMLElement &&
        parseFloat(shell.style.getPropertyValue('--neko-controlled-main-split-ratio')) > 40;
    })()`,
    'Management Main split resize did not update the shared Workbench ratio.',
  );
  const resized = await inspectMainSplit(evaluate);
  await drag(
    '.neko-controlled-workbench-main-split-handle--columns',
    '.neko-controlled-workbench-main',
    { targetPosition: { xRatio: 0.34, yRatio: 0.5 } },
  );
  await waitForCondition(
    evaluate,
    `(() => {
      const shell = document.querySelector('[data-neko-controlled-workbench="true"]');
      if (!(shell instanceof HTMLElement)) return false;
      const ratio = parseFloat(shell.style.getPropertyValue('--neko-controlled-main-split-ratio'));
      return ratio >= 32 && ratio <= 36;
    })()`,
    'Management Main split resize did not restore the compact catalog ratio.',
  );
  const restored = await inspectMainSplit(evaluate);
  return { initial, resized, restored };
}

async function inspectMainSplit(evaluate) {
  return evaluate(`(() => {
    const shell = document.querySelector('[data-neko-controlled-workbench="true"]');
    const primary = document.querySelector('.neko-controlled-workbench-main__primary');
    const secondary = document.querySelector('.neko-controlled-workbench-main__secondary');
    if (!(shell instanceof HTMLElement) || !(primary instanceof HTMLElement) ||
        !(secondary instanceof HTMLElement)) {
      throw new Error('Management split inspection requires both shared Main panels.');
    }
    return {
      ratio: parseFloat(shell.style.getPropertyValue('--neko-controlled-main-split-ratio')),
      primaryWidth: primary.getBoundingClientRect().width,
      secondaryWidth: secondary.getBoundingClientRect().width,
    };
  })()`);
}

async function exerciseWorkspaceDisplayModes(evaluate, click) {
  await waitForWorkspaceResourceControl(evaluate);
  await click('.project-main-group__actions .project-layout-icon-button');
  await waitForCondition(
    evaluate,
    `(async () => (await window.openNekoDesktop.shell.getSnapshot()).window.workbench.resourceDock.presentation === 'hidden')()`,
    'Workspace Resources did not hide before right-side Agent mode validation.',
  );
  const cases = [
    { button: 2, mode: 'chat-main', chatPosition: 'right' },
    { button: 3, mode: 'chat-only', chatPosition: 'right' },
    { button: 4, mode: 'main-only', chatPosition: 'right' },
    { button: 1, mode: 'chat-main', chatPosition: 'left' },
  ];
  const observed = [];
  for (const expected of cases) {
    await waitForCondition(
      evaluate,
      `(() => {
        const trigger = document.querySelector('[data-workbench-display-control="primary-sidebar"]');
        return trigger instanceof HTMLButtonElement && !trigger.disabled;
      })()`,
      'Workspace display control did not become interactive after the previous mutation.',
    );
    await click('[data-workbench-display-control="primary-sidebar"]');
    await waitForCondition(
      evaluate,
      `Boolean(document.querySelector('.project-display-menu'))`,
      'Workspace display menu did not open.',
    );
    await activateDisplayMode(evaluate, expected.button);
    await waitForCondition(
      evaluate,
      `(async () => {
        const display = (await window.openNekoDesktop.shell.getSnapshot()).window.workbench.display;
        return display.mode === ${JSON.stringify(expected.mode)} &&
          display.chatPosition === ${JSON.stringify(expected.chatPosition)};
      })()`,
      `Workspace display mode '${expected.mode}:${expected.chatPosition}' was not committed.`,
    );
    observed.push(
      await evaluate(`(async () => {
        const projection = await window.openNekoDesktop.shell.getSnapshot();
        return {
          mode: projection.window.workbench.display.mode,
          chatPosition: projection.window.workbench.display.chatPosition,
          hasAgent: Boolean(document.querySelector('[data-dock-owner="agent"], [data-primary-surface="agent"]')),
          hasMain: Boolean(document.querySelector('[data-main-view-id]')),
        };
      })()`),
    );
  }
  await waitForWorkspaceResourceControl(evaluate);
  await click('.project-main-group__actions .project-layout-icon-button');
  await waitForCondition(
    evaluate,
    `(async () => {
      const workbench = (await window.openNekoDesktop.shell.getSnapshot()).window.workbench;
      return workbench.resourceDock.presentation === 'docked' &&
        workbench.display.mode === 'chat-main' &&
        workbench.display.chatPosition === 'left';
    })()`,
    'Workspace Resources did not restore the standard left-Agent/right-Resources composition.',
  );
  observed.push({
    mode: 'chat-main',
    chatPosition: 'left',
    resources: 'docked',
  });
  return observed;
}

async function waitForWorkspaceResourceControl(evaluate) {
  await waitForCondition(
    evaluate,
    `(() => {
      const control = document.querySelector('.project-main-group__actions .project-layout-icon-button');
      return control instanceof HTMLButtonElement && !control.disabled;
    })()`,
    'Workspace Resources control did not become interactive.',
  );
}

async function activateDisplayMode(evaluate, index) {
  await evaluate(`(() => {
    const button = document.querySelectorAll('.project-display-menu__item')[${String(index)}];
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      throw new Error('Workspace display mode button is unavailable.');
    }
    button.click();
    return true;
  })()`);
}

async function inspectAgentDraftControls(evaluate) {
  const controls = await evaluate(`(() => ({
    composerCount: document.querySelectorAll('.agent-composer-shell').length,
    textareaCount: document.querySelectorAll('.agent-composer-textarea').length,
    toolButtonCount: document.querySelectorAll('.agent-composer-tool-button').length,
    hasWorkspaceChoice: Boolean(document.querySelector('.agent-composer-workspace-button')),
    hasLegacyWorkspaceToolbar: Boolean(document.querySelector('.desktop-assistant-agent__toolbar')),
    hasMode: Boolean(document.querySelector('.agent-control-chip-mode')),
    hasModel: Boolean(document.querySelector('.agent-model-config-trigger')),
    hasApproval: Boolean(document.querySelector('.agent-execution-mode-trigger')),
    sessionTabsVisible: Boolean(document.querySelector('[data-testid="conversation-tabs"]')),
  }))()`);
  return { ...controls, composer: await inspectComposerPresentation(evaluate) };
}

async function inspectComposerPresentation(evaluate) {
  return evaluate(`(() => {
    const shell = document.querySelector('.agent-composer-shell');
    const toolbar = document.querySelector('.agent-composer-toolbar');
    const workspace = document.querySelector('.agent-composer-workspace');
    const emptyPanel = document.querySelector('.agent-empty-state--desktop-dock .agent-empty-panel');
    const owner = shell?.closest('[data-dock-owner="agent"], [data-primary-surface="agent"]');
    if (!(shell instanceof HTMLElement) || !(toolbar instanceof HTMLElement) ||
        !(workspace instanceof HTMLElement) || !(owner instanceof HTMLElement)) {
      throw new Error('Agent composer presentation is incomplete.');
    }
    const shellRect = shell.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();
    const ownerRect = owner.getBoundingClientRect();
    const emptyPanelRect = emptyPanel instanceof HTMLElement ? emptyPanel.getBoundingClientRect() : undefined;
    const style = getComputedStyle(shell);
    return {
      workspaceLabel: workspace.textContent?.trim() ?? '',
      hasShadow: style.boxShadow !== 'none',
      shellWidth: shellRect.width,
      ownerWidth: ownerRect.width,
      fitsSurface: shellRect.left >= ownerRect.left && shellRect.right <= ownerRect.right,
      toolbarFitsSurface:
        toolbar.scrollWidth <= toolbar.clientWidth && toolbarRect.right <= shellRect.right,
      emptyPanelWidth: emptyPanelRect?.width ?? 0,
      emptyPanelAligned:
        emptyPanelRect !== undefined &&
        Math.abs(emptyPanelRect.left - shellRect.left) <= 1 &&
        Math.abs(emptyPanelRect.right - shellRect.right) <= 1,
      branchMetadataCount: document.querySelectorAll(
        '[data-composer-branch], [data-composer-runtime-location]',
      ).length,
    };
  })()`);
}

async function activateAssetEntry(evaluate, label, eventName) {
  await evaluate(`(() => {
    const entry = [...document.querySelectorAll('.global-library-browser__entry')].find(
      (candidate) => candidate.querySelector('strong')?.textContent?.trim() === ${JSON.stringify(label)},
    );
    if (!(entry instanceof HTMLElement)) {
      throw new Error('Asset Management entry is unavailable: ' + ${JSON.stringify(label)});
    }
    if (${JSON.stringify(eventName)} === 'click') {
      entry.click();
    } else {
      entry.dispatchEvent(new MouseEvent(${JSON.stringify(eventName)}, {
        bubbles: true,
        button: 0,
        view: window,
      }));
    }
    return true;
  })()`);
}

async function openPersistedFixtureAssetPreview(evaluate) {
  await waitForCondition(
    evaluate,
    `document.querySelector('[data-owner-root="asset-management"]')?.getAttribute('data-catalog-status') === 'ready'`,
    'Asset Management did not restore its catalog after application restart.',
  );
  const previewEntryVisible = await evaluate(`(() =>
    [...document.querySelectorAll('.global-library-browser__entry strong')]
      .some((element) => element.textContent?.trim() === 'preview.png'))()`);
  if (!previewEntryVisible) {
    await waitForCondition(
      evaluate,
      `(() => [...document.querySelectorAll('.global-library-browser__entry strong')]
        .some((element) => element.textContent?.trim() === 'workspace'))()`,
      'Asset Management did not retain the fixture media library after restart.',
    );
    await activateAssetEntry(evaluate, 'workspace', 'dblclick');
    await waitForCondition(
      evaluate,
      `(() => [...document.querySelectorAll('.global-library-browser__entry strong')]
        .some((element) => element.textContent?.trim() === 'preview.png'))()`,
      'Asset Management could not reopen the retained fixture media library.',
    );
  }
  await activateAssetEntry(evaluate, 'preview.png', 'click');
  await waitForCondition(
    evaluate,
    `(() => [...document.querySelectorAll('.global-library-browser__entry[data-selected="true"] strong')]
      .some((element) => element.textContent?.trim() === 'preview.png'))()`,
    'Asset Management did not restore the fixture selection after restart.',
  );
  await waitForCondition(
    evaluate,
    `Boolean(document.querySelector(
      '.neko-controlled-workbench-main__secondary [data-authorized-preview-session-id]',
    ))`,
    'Asset Management did not create a fresh Preview handle after restart.',
  );
}

async function waitForCondition(evaluate, expression, message, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await delay(100);
  }
  throw new Error(message);
}

async function inspectWorkbench(evaluate, expectedShape, expectedOwner) {
  return evaluate(`(() => {
    const shell = document.querySelector('.desktop-scene-workbench--${expectedShape}');
    if (!(shell instanceof HTMLElement)) {
      throw new Error('Expected Desktop Workbench shape is missing.');
    }
    const primary = shell.querySelector('[data-primary-sidebar="application"]');
    const main = shell.querySelector('.neko-controlled-workbench-main');
    const mainPrimary = shell.querySelector('.neko-controlled-workbench-main__primary');
    const leftDock = shell.querySelector('.neko-controlled-workbench-dock--left');
    const rightDock = shell.querySelector('.neko-controlled-workbench-dock--right');
    const ownerSelectors = {
      'asset-management': '[data-owner-root="asset-management"]',
      'extension-management': '.agent-extension-management-root',
      'project-management': '.project-management-catalog',
      settings: '[data-settings-surface="main"]',
      workspace: '[data-main-view-id]',
    };
    const ownerSelector = ownerSelectors[${JSON.stringify(expectedOwner)}];
    const owner = ownerSelector ? shell.querySelector(ownerSelector) : undefined;
    const mainRect = main instanceof HTMLElement ? main.getBoundingClientRect() : undefined;
    const ownerRect = owner instanceof HTMLElement ? owner.getBoundingClientRect() : undefined;
    const mainPrimaryRect = mainPrimary instanceof HTMLElement
      ? mainPrimary.getBoundingClientRect()
      : undefined;
    const mainSecondary = shell.querySelector('.neko-controlled-workbench-main__secondary');
    const mainSecondaryRect = mainSecondary instanceof HTMLElement
      ? mainSecondary.getBoundingClientRect()
      : undefined;
    const controlledShell = shell.closest('[data-neko-controlled-workbench="true"]');
    const previewPresentation = shell.querySelector(
      '.neko-controlled-workbench-main__secondary [data-preview-presentation-owner="preview-webview"]',
    );
    return {
      shellCount: document.querySelectorAll('[data-neko-controlled-workbench="true"]').length,
      primaryCount: document.querySelectorAll('[data-primary-sidebar="application"]').length,
      recentNavigationVisible: Boolean(primary?.querySelector('.home-recent-navigation')),
      recentSectionCount: primary?.querySelectorAll('.home-sidebar-heading').length ?? 0,
      hasAgentDock: Boolean(shell.querySelector('[data-dock-owner="agent"]')),
      hasLeftDock: leftDock instanceof HTMLElement,
      hasRightDock: rightDock instanceof HTMLElement,
      hasWorkspaceMain: Boolean(shell.querySelector('[data-main-view-id]')),
      previewInSecondary: Boolean(
        shell.querySelector('.neko-controlled-workbench-main__secondary [data-authorized-preview-session-id]'),
      ),
      previewKind: shell
        .querySelector('.neko-controlled-workbench-main__secondary [data-preview-kind]')
        ?.getAttribute('data-preview-kind'),
      previewPresentationOwner: shell
        .querySelector('.neko-controlled-workbench-main__secondary [data-preview-presentation-owner]')
        ?.getAttribute('data-preview-presentation-owner'),
      previewRenderableHeight:
        previewPresentation instanceof HTMLElement
          ? previewPresentation.getBoundingClientRect().height
          : 0,
      projectDetailInSecondary: Boolean(
        shell.querySelector(
          '.neko-controlled-workbench-main__secondary .project-management-detail',
        ),
      ),
      mainPanelIds: [...shell.querySelectorAll('[data-workbench-main-panel]')].map(
        (element) => element.getAttribute('data-workbench-main-panel'),
      ),
      compactPanelIds: [
        ...shell.querySelectorAll('[data-workbench-main-panel][data-panel-size="compact"]'),
      ].map((element) => element.getAttribute('data-workbench-main-panel')),
      mainSplit: controlledShell?.getAttribute('data-main-split'),
      mainSplitRatio:
        controlledShell instanceof HTMLElement
          ? parseFloat(
              controlledShell.style.getPropertyValue('--neko-controlled-main-split-ratio'),
            ) / 100
          : 0,
      hasMainSplitResize: Boolean(
        shell.querySelector('.neko-controlled-workbench-main-split-handle--columns'),
      ),
      mainPanelsOverlap:
        mainPrimaryRect !== undefined && mainSecondaryRect !== undefined
          ? mainPrimaryRect.right > mainSecondaryRect.left + 1
          : false,
      primaryMainWidth: mainPrimaryRect?.width ?? 0,
      secondaryMainWidth: mainSecondaryRect?.width ?? 0,
      mainDisplay: main instanceof HTMLElement ? getComputedStyle(main).display : undefined,
      mainWidth: mainRect?.width ?? 0,
      ownerWidth: ownerRect?.width ?? 0,
      ownerInMain: owner instanceof HTMLElement && mainPrimary instanceof HTMLElement
        ? mainPrimary.contains(owner)
        : false,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  })()`);
}

function assertAgentDraftControls(detail) {
  if (
    detail.composerCount !== 1 ||
    detail.textareaCount !== 1 ||
    detail.toolButtonCount < 1 ||
    !detail.hasWorkspaceChoice ||
    detail.hasLegacyWorkspaceToolbar ||
    !detail.hasMode ||
    !detail.hasModel ||
    !detail.hasApproval ||
    detail.sessionTabsVisible
  ) {
    throw new Error(
      'Agent draft did not retain the complete launch-safe Workspace Agent controls.',
    );
  }
  assertWorkspaceComposer(detail.composer, 'assistant');
}

function assertWorkspaceComposer(detail, scope) {
  if (
    !detail.hasShadow ||
    detail.shellWidth > 820 ||
    !detail.fitsSurface ||
    !detail.emptyPanelAligned ||
    detail.emptyPanelWidth > 820 ||
    detail.branchMetadataCount !== 0 ||
    (scope === 'assistant' && !detail.workspaceLabel.includes('选择工作目录')) ||
    (scope === 'workspace' && detail.workspaceLabel !== 'workspace')
  ) {
    throw new Error(
      `Agent ${scope} composer did not preserve its compact Workspace presentation: ${JSON.stringify(detail)}`,
    );
  }
}

function assertBoundedManagement(detail, owner) {
  if (detail.ownerWidth > 1020 || detail.ownerWidth >= detail.mainWidth) {
    throw new Error(`${owner} did not retain its bounded management page geometry.`);
  }
}

function assertSharedManagementPanel(detail, managementPanelId) {
  if (
    !detail.mainPanelIds.includes(managementPanelId) ||
    detail.compactPanelIds.includes(managementPanelId) ||
    detail.mainSplit !== 'none' ||
    detail.hasMainSplitResize
  ) {
    throw new Error(
      `${managementPanelId} did not use the full shared Workspace panel frame without an empty detail split.`,
    );
  }
}

function assertManagementDetailSplit(detail, managementPanelId, detailPanelId) {
  assertSingleWorkbench(detail);
  if (
    !detail.ownerInMain ||
    !detail.mainPanelIds.includes(managementPanelId) ||
    !detail.mainPanelIds.includes(detailPanelId) ||
    !detail.compactPanelIds.includes(managementPanelId) ||
    detail.mainSplit !== 'columns' ||
    Math.abs(detail.mainSplitRatio - 0.34) > 0.025 ||
    !detail.hasMainSplitResize ||
    detail.mainPanelsOverlap ||
    detail.primaryMainWidth <= 0 ||
    detail.secondaryMainWidth <= detail.primaryMainWidth
  ) {
    throw new Error(
      `Management + Detail did not preserve the shared compact Workbench composition: ${JSON.stringify(detail)}`,
    );
  }
}

function assertSingleWorkbench(detail) {
  if (detail.shellCount !== 1 || detail.primaryCount !== 1) {
    throw new Error('Desktop scene did not preserve exactly one Workbench and PrimarySidebar.');
  }
  if (!detail.recentNavigationVisible || detail.recentSectionCount !== 2) {
    throw new Error('PrimarySidebar did not preserve recent Project and conversation sections.');
  }
}

function assertAgentOnly(detail) {
  assertSingleWorkbench(detail);
  if (!detail.hasAgentDock || detail.hasLeftDock !== true || detail.mainDisplay !== 'none') {
    throw new Error('Agent-only did not expand the Agent dock and remove the empty Main column.');
  }
}

function assertManagementMain(detail, owner) {
  assertSingleWorkbench(detail);
  if (detail.hasLeftDock || !detail.ownerInMain || detail.ownerWidth < 420) {
    throw new Error(`${owner} was not mounted as the full Workbench Main surface.`);
  }
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
