import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';

const ACTIVE_AGENT_SURFACE_SELECTOR = '[data-primary-surface="agent"]';
const ACTIVE_AGENT_TEXTAREA_SELECTOR = `${ACTIVE_AGENT_SURFACE_SELECTOR} .agent-composer-textarea`;
const ACTIVE_AGENT_SEND_SELECTOR = `${ACTIVE_AGENT_SURFACE_SELECTOR} .agent-composer-send`;
const ACTIVE_WORKBENCH_MAIN_TARGET_SELECTOR = '[data-workbench-slot="main"]';
const ACTIVE_WORKBENCH_SECONDARY_MAIN_TARGET_SELECTOR = '[data-workbench-slot="secondaryMain"]';
const APPLICATION_NAVIGATION_BUTTON_SELECTOR =
  '[data-primary-sidebar="application"] .home-primary-navigation .home-nav-button';
const VISUAL_SETTLE_MILLISECONDS = 1_000;

export const desktopWorkbenchScenesScenario = Object.freeze({
  id: 'desktop-workbench-scenes',
  owner: '@neko/app-desktop',
  async prepare({ fixtureHome, repositoryRoot }) {
    const providerPort = await reserveFunctionalProviderPort();
    const workspacePath = join(fixtureHome, 'workspace');
    const secondaryWorkspacePath = join(fixtureHome, 'workspace-b');
    const configRoot = join(fixtureHome, '.neko');
    const assetRoot = join(configRoot, 'assets');
    await Promise.all([
      mkdir(workspacePath, { recursive: true }),
      mkdir(secondaryWorkspacePath, { recursive: true }),
      mkdir(configRoot, { recursive: true }),
      mkdir(assetRoot, { recursive: true }),
    ]);
    await Promise.all([
      copyFile(
        join(repositoryRoot, 'docs/assets/openneko-desktop.png'),
        join(workspacePath, 'preview.png'),
      ),
      copyFile(
        join(repositoryRoot, 'docs/assets/openneko-desktop.png'),
        join(secondaryWorkspacePath, 'secondary-preview.png'),
      ),
    ]);
    await copyFile(
      join(repositoryRoot, 'docs/assets/openneko-desktop.png'),
      join(assetRoot, 'workspace-lighting.png'),
    );
    await writeFile(
      join(workspacePath, 'agent-reference.txt'),
      'Functional Assistant reference.\n',
      'utf8',
    );
    await writeFile(
      join(secondaryWorkspacePath, 'workspace-b-marker.txt'),
      'Secondary functional Workspace.\n',
      'utf8',
    );
    await writeFile(
      join(fixtureHome, '.openneko-functional-workspace-queue.json'),
      `${JSON.stringify(['workspace', 'workspace-b'])}\n`,
      'utf8',
    );
    await writeFile(
      join(fixtureHome, '.openneko-functional-cancel-workspace-picker-once'),
      'cancel-next-workspace-picker\n',
      'utf8',
    );
    await writeFile(
      join(configRoot, 'config.toml'),
      [
        '[[providers]]',
        'id = "functional-ollama"',
        'name = "Functional Ollama"',
        'type = "ollama"',
        `api_url = "http://127.0.0.1:${String(providerPort)}/api"`,
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
        'context_window = 32768',
        'max_output_tokens = 4096',
        'enabled = true',
        '',
        '[default_models.llm]',
        'provider_id = "functional-ollama"',
        'model_id = "functional-chat"',
        '',
      ].join('\n'),
      { encoding: 'utf8', mode: 0o600 },
    );
    return { workspacePath, secondaryWorkspacePath, providerPort };
  },
  async run({
    checkpoint,
    click,
    drag,
    evaluate,
    measureRendererResources,
    restartApplication,
    screenshot,
    type,
    prepared,
    waitForDesktopBridge,
    waitForSelector,
  }) {
    const providerServer = await startFunctionalProviderServer(prepared.providerPort, 750);
    try {
      await resizeWindow(evaluate, 1440, 960);
      await waitForSelector('.desktop-scene-workbench--agent-only');
      await waitForSelector(`${ACTIVE_AGENT_SURFACE_SELECTOR} .agent-composer-shell`);
      const projectionProbe = await beginShellProjectionProbe(evaluate);
      const agent = await inspectWorkbench(evaluate, 'agent-only');
      assertSingleWorkbench(agent);
      assertAgentOnly(agent);
      const initialEntryDraft = await inspectEntryDraft(evaluate);
      const draftControls = await inspectAgentDraftControls(evaluate);
      assertAgentDraftControls(draftControls);
      const { screenshots: sidebarScreenshots, ...sidebarLifecycle } = await exercisePrimarySidebar(
        evaluate,
        click,
        drag,
        screenshot,
      );
      const agentScreenshot = await screenshot('agent-only-large');
      const initialRendererResources = await inspectRendererResidency(
        evaluate,
        measureRendererResources,
      );
      checkpoint('agent-only-large', {
        ...agent,
        draftControls,
        sidebarLifecycle,
        projectionProbe,
        rendererResources: initialRendererResources,
      });

      const assetsProjectionStart = await readShellProjectionProbe(evaluate);
      await clickApplicationNavigation(evaluate, click, 1);
      await waitForSelector('[data-owner-root="asset-management"]');
      await waitForSelector('[data-owner-root="asset-management"][data-catalog-status="ready"]');
      const assetsProjection = await assertSingleShellProjection(
        evaluate,
        assetsProjectionStart,
        'Assets navigation',
      );
      const assets = await inspectWorkbench(evaluate, 'management', 'asset-management');
      assertManagementMain(assets, 'asset-management');
      assertSharedManagementPanel(assets, 'asset-management');
      const assetsScreenshot = await captureSettledScreenshot(
        screenshot,
        'asset-management-main-large',
      );
      checkpoint('asset-management-main-large', { ...assets, projection: assetsProjection });

      await selectGlobalLibraryCatalog(evaluate, /^(Media Library|媒体库)$/u);
      await waitForCondition(
        evaluate,
        `document.querySelector('${ACTIVE_WORKBENCH_MAIN_TARGET_SELECTOR} [data-owner-root="asset-management"]')?.getAttribute('data-catalog-status') === 'ready'`,
        'Media Library catalog did not become ready.',
      );
      await click(
        `${ACTIVE_WORKBENCH_MAIN_TARGET_SELECTOR} .global-library-browser__commands button`,
      );
      await waitForCondition(
        evaluate,
        `(() => [...document.querySelectorAll('${ACTIVE_WORKBENCH_MAIN_TARGET_SELECTOR} .global-library-browser__entry strong')]
        .some((element) => element.textContent?.trim() === 'workspace'))()`,
        'The fixture media library was not added to Asset Management.',
      );
      await activateAssetEntry(evaluate, 'workspace', 'dblclick');
      await waitForCondition(
        evaluate,
        `(() => [...document.querySelectorAll('${ACTIVE_WORKBENCH_MAIN_TARGET_SELECTOR} .global-library-browser__entry strong')]
        .some((element) => element.textContent?.trim() === 'preview.png'))()`,
        'The fixture media file was not listed inside Asset Management.',
      );
      await activateAssetEntry(evaluate, 'preview.png', 'click');
      await waitForCondition(
        evaluate,
        `(() => [...document.querySelectorAll('${ACTIVE_WORKBENCH_MAIN_TARGET_SELECTOR} .global-library-browser__entry[data-selected="true"] strong')]
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
      if (assetPreview.previewDescriptorHeaderVisible) {
        throw new Error('Asset Preview rendered a duplicate descriptor header.');
      }
      if (
        assetPreview.primaryMainBackground !== assetPreview.secondaryMainBackground ||
        assetPreview.previewBackground !== 'rgba(0, 0, 0, 0)'
      ) {
        throw new Error('Asset Preview did not inherit the management shell theme.');
      }
      const assetPreviewResize = await exerciseManagementMainSplit(evaluate, drag);
      const assetPreviewScreenshot = await screenshot('asset-management-with-preview-large');
      checkpoint('asset-management-with-preview-large', { ...assetPreview, assetPreviewResize });

      await clickApplicationNavigation(evaluate, click, 2);
      await waitForSelector('.agent-extension-management-root');
      const extensions = await inspectWorkbench(evaluate, 'management', 'extension-management');
      assertManagementMain(extensions, 'extension-management');
      assertSharedManagementPanel(extensions, 'extension-management');
      assertBoundedManagement(extensions, 'extension-management');
      const extensionsScreenshot = await screenshot('extension-management-main-large');
      checkpoint('extension-management-main-large', extensions);

      await clickApplicationNavigation(evaluate, click, 3);
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
      const settingsScreenshot = await captureSettledScreenshot(
        screenshot,
        'settings-workbench-large',
      );
      checkpoint('settings-workbench-large', settings);

      await clickApplicationNavigation(evaluate, click, 0);
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
      assertWorkspaceTopControls(workspace);
      const workspaceAgentActivation = await inspectActivatedWorkspaceAgent(evaluate);
      const workspaceResourceChrome = await inspectWorkspaceResourceChrome(evaluate);
      const workspaceScreenshot = await screenshot('workspace-large');
      const workspaceComposer = await inspectComposerPresentation(evaluate);
      assertWorkspaceComposer(workspaceComposer, 'workspace');
      if (workspaceComposer.ownerWidth >= 400 || !workspaceComposer.toolbarFitsSurface) {
        throw new Error('Agent composer did not qualify the narrow Workspace dock presentation.');
      }
      checkpoint('workspace-large', {
        ...workspace,
        workspaceActivation,
        workspaceAgentActivation,
        workspaceResourceChrome,
        workspaceComposer,
      });

      const workspacePreview = await openWorkspacePreview(evaluate);
      const workspacePreviewScreenshot = await screenshot('workspace-preview-content-only-large');
      checkpoint('workspace-preview-content-only-large', workspacePreview);

      const displayModes = await exerciseWorkspaceDisplayModes(evaluate, click);
      checkpoint('workspace-display-modes', displayModes);

      const firstWorkspaceResourcesBeforeSwitch = await inspectRendererResidency(
        evaluate,
        measureRendererResources,
      );
      await clickApplicationNavigation(evaluate, click, 0);
      await waitForSelector('.desktop-scene-workbench--agent-only');
      const secondaryWorkspaceActivation = await chooseFixtureWorkspace(evaluate);
      if (
        secondaryWorkspaceActivation.workspaceId === workspaceActivation.workspaceId ||
        secondaryWorkspaceActivation.projectId === workspaceActivation.projectId
      ) {
        throw new Error('The second Workspace reused the first Workspace identity.');
      }
      await waitForSelector('.desktop-scene-workbench--workspace');
      const secondaryWorkspace = await inspectWorkbench(evaluate, 'workspace', 'workspace');
      assertSingleWorkbench(secondaryWorkspace);
      const secondaryWorkspaceExact = await inspectExactWorkspace(
        evaluate,
        secondaryWorkspaceActivation.workspaceId,
      );
      const secondaryWorkspaceAgent = await inspectActivatedWorkspaceAgent(evaluate);
      const secondaryWorkspaceScreenshot = await screenshot('workspace-secondary-large');
      checkpoint('workspace-secondary-large', {
        ...secondaryWorkspace,
        activation: secondaryWorkspaceActivation,
        exact: secondaryWorkspaceExact,
        agent: secondaryWorkspaceAgent,
      });

      const firstWorkspaceReopenStartedAt = Date.now();
      await openProjectWorkspace(evaluate, workspaceActivation.projectId);
      await waitForSelector('.desktop-scene-workbench--workspace');
      const firstWorkspaceReopenLatencyMs = Date.now() - firstWorkspaceReopenStartedAt;
      const firstWorkspaceExactRestore = await inspectExactWorkspace(
        evaluate,
        workspaceActivation.workspaceId,
      );
      const firstWorkspacePreviewRestore = await inspectRestoredWorkspacePreview(
        evaluate,
        workspacePreview.viewId,
      );
      const firstWorkspaceResourcesAfterSwitch = await inspectRendererResidency(
        evaluate,
        measureRendererResources,
      );
      const firstWorkspaceRestoreScreenshot = await screenshot(
        'workspace-first-restored-after-secondary',
      );
      checkpoint('two-workspace-exact-restore', {
        first: workspaceActivation,
        second: secondaryWorkspaceActivation,
        restored: firstWorkspaceExactRestore,
        preview: firstWorkspacePreviewRestore,
        reopenLatencyMs: firstWorkspaceReopenLatencyMs,
        resources: {
          beforeSwitch: firstWorkspaceResourcesBeforeSwitch,
          afterSwitch: firstWorkspaceResourcesAfterSwitch,
        },
      });

      await waitForNavigationButton(evaluate, 3);
      await clickApplicationNavigation(evaluate, click, 3);
      await waitForSelector(
        `${ACTIVE_WORKBENCH_MAIN_TARGET_SELECTOR} .project-management-catalog .management-surface-row`,
      );
      await click(
        `${ACTIVE_WORKBENCH_MAIN_TARGET_SELECTOR} .project-management-catalog .management-surface-row__select`,
      );
      await waitForSelector(
        `${ACTIVE_WORKBENCH_MAIN_TARGET_SELECTOR} .project-management-catalog .management-surface-row[data-selected="true"]`,
      );
      const projectSelection = await inspectWorkbench(evaluate, 'management', 'project-management');
      assertSharedManagementPanel(projectSelection, 'project-management');
      if (
        projectSelection.projectDetailInSecondary ||
        projectSelection.mainPanelIds.includes('project-detail') ||
        !projectSelection.projectOpenActionVisible
      ) {
        throw new Error('Project selection reserved a sparse Detail shell or lost explicit open.');
      }
      const projectSelectionScreenshot = await screenshot('project-management-selected-large');
      checkpoint('project-management-selected-large', projectSelection);

      await waitForNavigationButton(evaluate, 1);
      await clickApplicationNavigation(evaluate, click, 1);
      await waitForSelector('[data-owner-root="asset-management"]');
      await openProjectWorkspace(evaluate, workspaceActivation.projectId);
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
      await clickApplicationNavigation(evaluate, click, 1);
      await waitForSelector('[data-owner-root="asset-management"]');
      const retainedMediaLibrary = await openPersistedFixtureAssetPreview(evaluate);
      checkpoint('asset-management-media-library-restart-restore', retainedMediaLibrary);
      await resizeWindow(evaluate, 1040, 700);
      const smallAssets = await inspectWorkbench(evaluate, 'management', 'asset-management');
      assertResponsiveManagementDetailSplit(smallAssets, 'asset-management', 'asset-preview');
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
      await clickApplicationNavigation(evaluate, click, 0);
      await waitForSelector(
        `.desktop-scene-workbench--agent-only ${ACTIVE_AGENT_TEXTAREA_SELECTOR}`,
      );
      const freshEntryDraft = await inspectEntryDraft(evaluate, [
        initialEntryDraft.draftId,
        workspaceActivation.draftId,
      ]);
      checkpoint('fresh-entry-draft-ready', {
        initialEntryDraft,
        freshEntryDraft,
      });
      await click(`${ACTIVE_AGENT_SURFACE_SELECTOR} .agent-composer-tool-button`, 0);
      await waitForCondition(
        evaluate,
        `(() => {
        const reference = document.querySelector(
          '${ACTIVE_AGENT_SURFACE_SELECTOR} [data-agent-context-type="file"]',
        );
        return reference?.textContent?.includes('agent-reference.txt') === true;
      })()`,
        'Entry Draft did not retain the explicitly authorized Assistant file reference.',
      );
      const authorizedAssistantReference = await evaluate(`(() => {
      const reference = document.querySelector(
        '${ACTIVE_AGENT_SURFACE_SELECTOR} [data-agent-context-type="file"]',
      );
      return {
        type: reference?.getAttribute('data-agent-context-type'),
        label: reference?.textContent?.trim(),
      };
    })()`);
      checkpoint('entry-draft-assistant-reference-ready', authorizedAssistantReference);
      await type(ACTIVE_AGENT_TEXTAREA_SELECTOR, 'Verify atomic Assistant session activation.');
      await waitForCondition(
        evaluate,
        `(() => {
        const send = document.querySelector('${ACTIVE_AGENT_SEND_SELECTOR}');
        return send instanceof HTMLButtonElement && !send.disabled;
      })()`,
        'Assistant draft did not enable its canonical Agent send control.',
      );
      await click(ACTIVE_AGENT_SEND_SELECTOR);
      const assistantActivation = await waitForAssistantSession(evaluate);
      assertAssistantConversationNavigation(assistantActivation);
      if (assistantActivation.conversationCount !== freshEntryDraft.conversationCount + 1) {
        throw new Error('Direct Entry Draft submit did not create exactly one Assistant session.');
      }
      await type(ACTIVE_AGENT_TEXTAREA_SELECTOR, 'Continue in the activated Assistant session.');
      await click(ACTIVE_AGENT_SEND_SELECTOR);
      await waitForCondition(
        evaluate,
        `document.querySelector('${ACTIVE_AGENT_SURFACE_SELECTOR} [data-owner-root="agent"]')?.textContent
        ?.includes('Continue in the activated Assistant session.') === true`,
        'Activated Assistant session did not accept a second message.',
      );
      const projectionEndpointErrors = await evaluate(`(() =>
      [...document.querySelectorAll('[role="alert"]')]
        .map((element) => element.textContent?.trim() ?? '')
        .filter((message) =>
          message.includes('attachment-identity-mismatch') ||
          message.includes('attachment endpoint mismatch'),
        )
    )()`);
      if (projectionEndpointErrors.length > 0) {
        throw new Error(
          `Assistant endpoint replacement emitted identity errors: ${JSON.stringify(projectionEndpointErrors)}`,
        );
      }
      await clickApplicationNavigation(evaluate, click, 1);
      await waitForSelector('[data-owner-root="asset-management"]');
      await waitForSelector('.home-conversation-link');
      await openAssistantConversation(evaluate, assistantActivation.conversationId);
      const assistantRestore = await waitForAssistantSession(
        evaluate,
        assistantActivation.conversationId,
      );
      await waitForCondition(
        evaluate,
        `(() => {
        const text = document.querySelector(
          '${ACTIVE_AGENT_SURFACE_SELECTOR} [data-owner-root="agent"]',
        )?.textContent ?? '';
        return text.includes('OPENNEKO_FUNCTIONAL_RESPONSE_1') &&
          text.includes('OPENNEKO_FUNCTIONAL_RESPONSE_2') &&
          !document.querySelector('${ACTIVE_AGENT_SURFACE_SELECTOR} .agent-run-status') &&
          !document.querySelector('${ACTIVE_AGENT_SURFACE_SELECTOR} .agent-composer-stop');
      })()`,
        'Assistant background turns did not complete under the exact restored conversation.',
      );
      assertAssistantConversationNavigation(assistantRestore);
      const assistantRestoreScreenshot = await captureSettledScreenshot(
        screenshot,
        'assistant-session-exact-restore-large',
      );
      const providerEvidence = providerServer.snapshot();
      assertFunctionalProviderEvidence(providerEvidence, 2);
      checkpoint('assistant-session-exact-restore-large', {
        activation: assistantActivation,
        restore: assistantRestore,
        provider: providerEvidence,
      });

      return {
        scenes: {
          agent,
          assets,
          extensions,
          projects,
          projectSelection,
          settings,
          workspace,
          workspacePreview,
          smallAssets,
          assistantActivation,
          assistantRestore,
        },
        provider: providerEvidence,
        screenshots: [
          ...sidebarScreenshots,
          agentScreenshot,
          assetsScreenshot,
          assetPreviewScreenshot,
          extensionsScreenshot,
          projectsScreenshot,
          settingsScreenshot,
          projectSelectionScreenshot,
          workspaceScreenshot,
          workspacePreviewScreenshot,
          smallAssetsScreenshot,
          secondaryWorkspaceScreenshot,
          firstWorkspaceRestoreScreenshot,
          assistantRestoreScreenshot,
        ],
      };
    } finally {
      await providerServer.close();
    }
  },
});

export const desktopConversationNavigationScenario = Object.freeze({
  id: 'desktop-conversation-navigation',
  owner: '@neko/app-desktop',
  prepare: desktopWorkbenchScenesScenario.prepare,
  async run({ checkpoint, click, evaluate, prepared, screenshot, type, waitForSelector }) {
    const providerServer = await startFunctionalProviderServer(prepared.providerPort, 25);
    try {
      await resizeWindow(evaluate, 1440, 960);
      await waitForSelector(
        `.desktop-scene-workbench--agent-only ${ACTIVE_AGENT_TEXTAREA_SELECTOR}`,
      );
      const initialDraft = await inspectEntryDraft(evaluate);
      await type(ACTIVE_AGENT_TEXTAREA_SELECTOR, 'Verify atomic Assistant session activation.');
      await waitForCondition(
        evaluate,
        `(() => {
        const send = document.querySelector('${ACTIVE_AGENT_SEND_SELECTOR}');
        return send instanceof HTMLButtonElement && !send.disabled;
      })()`,
        'Conversation navigation fixture did not enable its initial send control.',
      );
      await click(ACTIVE_AGENT_SEND_SELECTOR);
      const initialSession = await waitForAssistantSession(evaluate);
      assertAssistantConversationNavigation(initialSession);
      if (initialSession.conversationCount !== initialDraft.conversationCount + 1) {
        throw new Error('Conversation navigation fixture did not create one initial session.');
      }

      const groupLifecycle = await exerciseAssistantConversationGroup(
        evaluate,
        click,
        type,
        initialSession.conversationId,
      );
      checkpoint('assistant-conversation-group-lifecycle', groupLifecycle);

      await clickApplicationNavigation(evaluate, click, 1);
      await waitForSelector('[data-owner-root="asset-management"]');
      await waitForSelector('.home-conversation-link');
      await openAssistantConversation(evaluate, initialSession.conversationId);
      const restoredSession = await waitForAssistantSession(
        evaluate,
        initialSession.conversationId,
      );
      assertAssistantConversationNavigation(restoredSession);
      const restoredScreenshot = await screenshot('assistant-group-exact-restore');
      checkpoint('assistant-group-exact-restore', restoredSession);

      return {
        initialDraft,
        initialSession,
        groupLifecycle,
        restoredSession,
        provider: providerServer.snapshot(),
        screenshots: [restoredScreenshot],
      };
    } finally {
      await providerServer.close();
    }
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
      const button = document.querySelectorAll(
        '${APPLICATION_NAVIGATION_BUTTON_SELECTOR}',
      )[${String(index)}];
      return button instanceof HTMLButtonElement && !button.disabled;
    })()`,
    'PrimarySidebar navigation did not become interactive after reload.',
  );
}

async function clickApplicationNavigation(evaluate, click, index) {
  await waitForNavigationButton(evaluate, index);
  await click(APPLICATION_NAVIGATION_BUTTON_SELECTOR, index);
}

async function beginShellProjectionProbe(evaluate) {
  return evaluate(`(() => {
    const key = '__openNekoDesktopFunctionalProjectionProbe';
    if (globalThis[key] !== undefined) {
      throw new Error('Desktop Shell projection probe is already active.');
    }
    const events = [];
    const dispose = window.openNekoDesktop.shell.subscribe((event) => {
      events.push({
        sequence: event.sequence,
        sceneId: event.projection.window.workbench.scene.sceneId,
      });
    });
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: { events, dispose },
    });
    return { activeProbeSubscriptions: 1, eventCount: 0 };
  })()`);
}

async function readShellProjectionProbe(evaluate) {
  return evaluate(`(() => {
    const probe = globalThis.__openNekoDesktopFunctionalProjectionProbe;
    if (!probe || !Array.isArray(probe.events) || typeof probe.dispose !== 'function') {
      throw new Error('Desktop Shell projection probe is unavailable.');
    }
    return {
      activeProbeSubscriptions: 1,
      eventCount: probe.events.length,
      lastEvent: probe.events.at(-1),
    };
  })()`);
}

async function assertSingleShellProjection(evaluate, before, label) {
  const after = await readShellProjectionProbe(evaluate);
  if (
    before.activeProbeSubscriptions !== 1 ||
    after.activeProbeSubscriptions !== 1 ||
    after.eventCount !== before.eventCount + 1
  ) {
    throw new Error(
      `${label} did not publish exactly one canonical Shell projection: ${JSON.stringify({ before, after })}`,
    );
  }
  return { before, after, delta: 1 };
}

async function inspectRendererResidency(evaluate, measureRendererResources) {
  const [presentation, renderer] = await Promise.all([
    evaluate(`(() => {
      const ownerRoots = [...document.querySelectorAll('[data-owner-root]')].map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          owner: element.getAttribute('data-owner-root'),
          visible:
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden',
        };
      });
      const countsByOwner = Object.fromEntries(
        [...new Set(ownerRoots.map((root) => root.owner))].map((owner) => [
          owner,
          ownerRoots.filter((root) => root.owner === owner).length,
        ]),
      );
      const detail = {
        controlledWorkbenchCount: document.querySelectorAll(
          '[data-neko-controlled-workbench="true"]',
        ).length,
        primarySidebarCount: document.querySelectorAll(
          '[data-primary-sidebar="application"]',
        ).length,
        primaryAgentSurfaceCount: document.querySelectorAll(
          '[data-primary-surface="agent"]',
        ).length,
        mainViewRootCount: document.querySelectorAll('.project-main-view-stack__item').length,
        ownerRootCount: ownerRoots.length,
        hiddenOwnerRootCount: ownerRoots.filter((root) => !root.visible).length,
        countsByOwner,
      };
      if (
        detail.controlledWorkbenchCount !== 1 ||
        detail.primarySidebarCount !== 1 ||
        detail.primaryAgentSurfaceCount > 1 ||
        detail.mainViewRootCount > 1 ||
        detail.hiddenOwnerRootCount !== 0
      ) {
        throw new Error('Desktop Renderer residency bounds failed: ' + JSON.stringify(detail));
      }
      return detail;
    })()`),
    measureRendererResources(),
  ]);
  return { presentation, renderer };
}

async function openProjectWorkspace(evaluate, projectId) {
  await waitForCondition(
    evaluate,
    `(async () => {
      const projection = await window.openNekoDesktop.shell.getSnapshot();
      const groups = projection.conversationNavigation.groups.filter(
        (candidate) => candidate.kind === 'project',
      );
      const index = groups.findIndex((group) => group.projectId === ${JSON.stringify(projectId)});
      const buttons = document.querySelectorAll(
        '.primary-conversation-group[data-group-kind="project"] > ' +
          '.primary-conversation-group__header .home-project-link',
      );
      const button = index >= 0 ? buttons[index] : undefined;
      return button instanceof HTMLButtonElement && !button.disabled;
    })()`,
    'Exact Project Workspace navigation did not become interactive.',
  );
  await evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    const groups = projection.conversationNavigation.groups.filter(
      (candidate) => candidate.kind === 'project',
    );
    const index = groups.findIndex((group) => group.projectId === ${JSON.stringify(projectId)});
    const buttons = document.querySelectorAll(
      '.primary-conversation-group[data-group-kind="project"] > ' +
        '.primary-conversation-group__header .home-project-link',
    );
    const button = index >= 0 ? buttons[index] : undefined;
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      throw new Error('Exact Project Workspace navigation control is unavailable.');
    }
    button.click();
    return true;
  })()`);
  await waitForCondition(
    evaluate,
    `(async () => {
      const projection = await window.openNekoDesktop.shell.getSnapshot();
      const context = projection.window.workbench.scene.context;
      if (context.kind !== 'agent' || context.scope.kind !== 'workspace') return false;
      const project = projection.catalog.projects.find(
        (candidate) => candidate.workspaceId === context.scope.workspaceId,
      );
      return project?.projectId === ${JSON.stringify(projectId)};
    })()`,
    'Exact Project Workspace did not become the current Scene.',
  );
}

async function inspectRestoredWorkspacePreview(evaluate, expectedViewId) {
  await waitForCondition(
    evaluate,
    `(() => {
      const view = document.querySelector('.project-main-view-stack__item');
      return view?.getAttribute('data-main-view-id') === ${JSON.stringify(expectedViewId)} &&
        view.querySelector('.desktop-preview-surface .neko-preview-root') instanceof HTMLElement;
    })()`,
    'Workspace Preview presentation did not restore after exact Workspace switching.',
  );
  return evaluate(`(() => ({
    viewId: document.querySelector('.project-main-view-stack__item')?.getAttribute(
      'data-main-view-id',
    ),
    mountedViewCount: document.querySelectorAll('.project-main-view-stack__item').length,
    previewRootCount: document.querySelectorAll(
      '.project-main-view-stack__item .desktop-preview-surface .neko-preview-root',
    ).length,
  }))()`);
}

async function chooseFixtureWorkspace(evaluate) {
  return evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    ${requireActiveWorkbenchProjection('projection')}
    const result = await window.openNekoDesktop.workspaceGrants.choose(
      projection.window.windowId,
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
      activeWorkbench.scene.sceneId,
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
    ${requireActiveWorkbenchProjection('projection')}
    const context = activeWorkbench.scene.context;
    if (context.kind !== 'agent' || context.scope.kind !== 'unbound') {
      throw new Error('Agent-only entry inspection requires an unbound Entry Draft.');
    }
    if (${JSON.stringify(forbiddenDraftIds)}.includes(context.scope.draftId)) {
      throw new Error('Start Creating reused a prior Agent draft identity.');
    }
    const activeSurface = document.querySelector('${ACTIVE_AGENT_SURFACE_SELECTOR}');
    if (!(activeSurface instanceof HTMLElement)) {
      throw new Error('Entry Draft has no exact active Agent surface.');
    }
    if (activeSurface.querySelector('[data-testid="conversation-tabs"]')) {
      throw new Error('Entry Draft retained session-only conversation Tabs.');
    }
    if (activeSurface.querySelectorAll('[data-testid="message-item"]').length > 0) {
      throw new Error('Entry Draft retained a prior conversation transcript.');
    }
    const textarea = activeSurface.querySelector('.agent-composer-textarea');
    if (!(textarea instanceof HTMLTextAreaElement) || textarea.value !== '') {
      throw new Error('Entry Draft did not reset its composer input.');
    }
    return {
      draftId: context.scope.draftId,
      conversationCount: projection.agentHome.conversations.length,
    };
  })()`);
}

async function inspectActivatedWorkspaceAgent(evaluate) {
  const startedAt = Date.now();
  try {
    await waitForCondition(
      evaluate,
      `(() => {
        const activeSurfaces = document.querySelectorAll(
          '[data-agent-scope="workspace"][data-primary-surface="agent"]',
        );
        const activeSurface = activeSurfaces[0];
        const title = activeSurface?.querySelector('.agent-empty-title')?.textContent?.trim() ?? '';
        const ownerActions = activeSurface?.querySelectorAll('.agent-empty-action').length ?? 0;
        return activeSurface instanceof HTMLElement &&
          activeSurfaces.length === 1 &&
          ownerActions === 0 &&
          (title === '工作区已就绪' || title === 'Workspace is ready');
      })()`,
      'Workspace-bound Agent did not finish attaching its activated draft state.',
    );
  } catch (error) {
    const diagnostic = await evaluate(`(() => {
      const activeSurfaces = document.querySelectorAll(
        '[data-agent-scope="workspace"][data-primary-surface="agent"]',
      );
      const activeSurface = activeSurfaces[0];
      return {
        scopePresent: activeSurface instanceof HTMLElement,
        activeSurfaceCount: activeSurfaces.length,
        title: activeSurface?.querySelector('.agent-empty-title')?.textContent?.trim() ?? '',
        ownerActions: activeSurface?.querySelectorAll('.agent-empty-action').length ?? 0,
        activeSurfaceId: activeSurface?.dataset.agentSurfaceId,
        alerts: [...document.querySelectorAll('[role="alert"]')]
          .map((element) => element.textContent?.trim()).filter(Boolean),
        agentText: activeSurface?.textContent?.trim().slice(0, 1200),
      };
    })()`);
    throw new Error(
      `${error instanceof Error ? error.message : String(error)} Diagnostic: ${JSON.stringify(diagnostic)}`,
    );
  }
  const ready = await evaluate(`(() => {
    const activeSurface = document.querySelector(
      '[data-agent-scope="workspace"][data-primary-surface="agent"]',
    );
    return {
      title: activeSurface?.querySelector('.agent-empty-title')?.textContent?.trim() ?? '',
      ownerActions: activeSurface?.querySelectorAll('.agent-empty-action').length ?? 0,
      activeSurfaceId: activeSurface?.dataset.agentSurfaceId,
    };
  })()`);
  return { ...ready, readyLatencyMs: Date.now() - startedAt };
}

async function inspectWorkspaceResourceChrome(evaluate) {
  await waitForCondition(
    evaluate,
    `Boolean(document.querySelector(
      '.desktop-resource-browser-root .neko-resource-browser__toolbar',
    ))`,
    'Workspace Resource Browser toolbar did not become ready.',
  );
  const initial = await evaluate(`(() => {
    const browser = document.querySelector('.desktop-resource-browser-root');
    if (!(browser instanceof HTMLElement)) {
      throw new Error('Workspace Resource Browser is unavailable.');
    }
    const refreshCount = browser.querySelectorAll(
      'button[aria-label="Refresh"], button[aria-label="刷新"]',
    ).length;
    const initialLibraryControlCount = browser.querySelectorAll(
      '.neko-resource-browser__library-menu button',
    ).length;
    const facets = [...browser.querySelectorAll('.neko-resource-browser__facets [role="tab"]')];
    const facetLabels = facets.map((item) => item.textContent?.trim() ?? '');
    if (refreshCount !== 0 || initialLibraryControlCount !== 0 || facets.length !== 4) {
      throw new Error(
        'Workspace Resource Browser chrome does not match its embedded contract: ' +
          JSON.stringify({ refreshCount, initialLibraryControlCount, facetLabels }),
      );
    }
    const mediaFacet = facets.find((item) =>
      ['媒体库', 'Media library'].includes(item.textContent?.trim() ?? ''),
    );
    if (!(mediaFacet instanceof HTMLButtonElement)) {
      throw new Error('Workspace Resource Browser Media facet is unavailable.');
    }
    mediaFacet.click();
    return { refreshCount, initialLibraryControlCount, facetLabels };
  })()`);
  await waitForCondition(
    evaluate,
    `(() => {
      const browser = document.querySelector('.desktop-resource-browser-root');
      const selected = browser?.querySelector('.neko-resource-browser__facets [aria-selected="true"]');
      return ['媒体库', 'Media library'].includes(selected?.textContent?.trim() ?? '') &&
        browser?.querySelectorAll('.neko-resource-browser__library-menu button').length === 1;
    })()`,
    'Workspace Resource Browser did not activate the Media facet and its management action.',
  );
  const switched = await evaluate(`(() => {
    const browser = document.querySelector('.desktop-resource-browser-root');
    if (!(browser instanceof HTMLElement)) {
      throw new Error('Workspace Resource Browser is unavailable after Media activation.');
    }
    const facets = [...browser.querySelectorAll('.neko-resource-browser__facets [role="tab"]')];
    const assetFacet = facets.find((item) =>
      ['素材库', 'Asset library'].includes(item.textContent?.trim() ?? ''),
    );
    if (!(assetFacet instanceof HTMLButtonElement)) {
      throw new Error('Workspace Resource Browser Asset facet is unavailable.');
    }
    assetFacet.click();
    return true;
  })()`);
  if (!switched) throw new Error('Workspace Resource Browser Asset facet click failed.');
  await waitForCondition(
    evaluate,
    `(() => {
      const browser = document.querySelector('.desktop-resource-browser-root');
      const selected = browser?.querySelector('.neko-resource-browser__facets [aria-selected="true"]');
      const hasAsset = [...(browser?.querySelectorAll('.neko-resource-browser__item strong') ?? [])]
        .some((item) => item.textContent?.trim() === 'workspace-lighting.png');
      return ['素材库', 'Asset library'].includes(selected?.textContent?.trim() ?? '') &&
        browser?.querySelectorAll('.neko-resource-browser__library-menu button').length === 0 &&
        hasAsset;
    })()`,
    'Workspace Resource Browser did not project the fixture through the Asset owner.',
  );
  const switchedBack = await evaluate(`(() => {
    const browser = document.querySelector('.desktop-resource-browser-root');
    const facets = [...(browser?.querySelectorAll('.neko-resource-browser__facets [role="tab"]') ?? [])];
    const filesFacet = facets.find((item) =>
      ['目录', 'Files'].includes(item.textContent?.trim() ?? ''),
    );
    if (!(filesFacet instanceof HTMLButtonElement)) {
      throw new Error('Workspace Resource Browser Files facet is unavailable.');
    }
    filesFacet.click();
    return {
      assetLabel: 'workspace-lighting.png',
      facetLabels: facets.map((item) => item.textContent?.trim() ?? ''),
      libraryControlCountInMedia: 1,
    };
  })()`);
  return { ...initial, ...switchedBack };
}

async function openWorkspacePreview(evaluate) {
  await waitForCondition(
    evaluate,
    `(() => [...document.querySelectorAll('.neko-resource-browser__item')].some(
      (item) => item.textContent?.includes('preview.png'),
    ))()`,
    'Workspace Resource Browser did not list the Preview fixture.',
  );
  await evaluate(`(() => {
    const item = [...document.querySelectorAll('.neko-resource-browser__item')].find(
      (candidate) => candidate.textContent?.includes('preview.png'),
    );
    if (!(item instanceof HTMLButtonElement)) {
      throw new Error('Workspace Preview fixture item is unavailable.');
    }
    item.click();
    return true;
  })()`);
  await waitForCondition(
    evaluate,
    `Boolean(document.querySelector(
      '.project-main-view-stack__item .desktop-preview-surface .neko-preview-root',
    ))`,
    'Workspace Preview did not become the active Workbench View.',
  );
  return evaluate(`(() => {
    const activeView = document.querySelector(
      '.project-main-view-stack__item',
    );
    const preview = activeView?.querySelector('.desktop-preview-surface .neko-preview-root');
    const group = activeView?.closest('[data-workbench-main-panel]');
    const tabHeaderCount = group?.querySelectorAll(':scope > .project-main-group__tabs').length ?? 0;
    const internalHeaderCount = preview?.querySelectorAll(':scope > header').length ?? 0;
    const chrome = preview?.getAttribute('data-preview-chrome');
    const mountedViewCount = document.querySelectorAll('.project-main-view-stack__item').length;
    if (!(preview instanceof HTMLElement) || chrome !== 'content-only') {
      throw new Error('Workspace Preview did not reuse the canonical content-only presentation.');
    }
    if (tabHeaderCount !== 1 || internalHeaderCount !== 0) {
      throw new Error('Workspace Preview rendered duplicate tab or descriptor chrome.');
    }
    if (mountedViewCount !== 1) {
      throw new Error('Workspace retained inactive Main View Roots.');
    }
    return {
      chrome,
      tabHeaderCount,
      internalHeaderCount,
      viewId: activeView.getAttribute('data-main-view-id'),
      mountedViewCount,
    };
  })()`);
}

async function assertFixtureWorkspaceCancellation(evaluate) {
  return evaluate(`(async () => {
    const before = await window.openNekoDesktop.shell.getSnapshot();
    ${requireActiveWorkbenchProjection('before', 'beforeWorkbench')}
    const result = await window.openNekoDesktop.workspaceGrants.choose(
      before.window.windowId,
    );
    if (result.status !== 'cancelled') {
      throw new Error('The isolated native Workspace picker did not report cancellation.');
    }
    const after = await window.openNekoDesktop.shell.getSnapshot();
    ${requireActiveWorkbenchProjection('after', 'afterWorkbench')}
    if (
      JSON.stringify(after.window) !== JSON.stringify(before.window) ||
      JSON.stringify(afterWorkbench.scene) !== JSON.stringify(beforeWorkbench.scene) ||
      JSON.stringify(after.catalog.projects) !== JSON.stringify(before.catalog.projects)
    ) {
      throw new Error('Workspace picker cancellation mutated the active Scene or Project catalog.');
    }
    return {
      status: result.status,
      windowId: after.window.windowId,
      activeWorkbenchInstanceId: afterWorkbench.workbenchInstanceId,
      sceneId: afterWorkbench.scene.sceneId,
      sceneKind: afterWorkbench.scene.context.kind,
      projectCount: after.catalog.projects.length,
    };
  })()`);
}

async function inspectExactWorkspace(evaluate, expectedWorkspaceId) {
  return evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    ${requireActiveWorkbenchProjection('projection')}
    const context = activeWorkbench.scene.context;
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
        ${requireActiveWorkbenchProjection('projection')}
        const context = activeWorkbench.scene.context;
        const interaction = activeWorkbench.scene.slots.interaction;
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
      ${requireActiveWorkbenchProjection('projection')}
      const activeSurface = document.querySelector('${ACTIVE_AGENT_SURFACE_SELECTOR}');
      const textarea = activeSurface?.querySelector('.agent-composer-textarea');
      const send = activeSurface?.querySelector('.agent-composer-action-button');
      return {
        context: activeWorkbench.scene.context,
        interaction: activeWorkbench.scene.slots.interaction,
        conversations: projection.agentHome.conversations,
        alerts: [...document.querySelectorAll('[role="alert"]')]
          .map((element) => element.textContent?.trim()).filter(Boolean),
        model: document.querySelector('.agent-model-config-trigger')?.textContent?.trim(),
        textareaValue: textarea instanceof HTMLTextAreaElement ? textarea.value : undefined,
        sendClass: send?.getAttribute('class'),
        sendDisabled: send instanceof HTMLButtonElement ? send.disabled : undefined,
        agentText: activeSurface?.querySelector('[data-owner-root="agent"]')
          ?.textContent?.trim().slice(0, 800),
      };
    })()`);
    throw new Error(
      `${error instanceof Error ? error.message : String(error)} Diagnostic: ${JSON.stringify(diagnostic)}`,
    );
  }
  try {
    await waitForCondition(
      evaluate,
      `document.querySelector('${ACTIVE_AGENT_SURFACE_SELECTOR} [data-owner-root="agent"]')?.textContent
        ?.includes('Verify atomic Assistant session activation.') === true`,
      'Assistant Agent did not render the locally committed initial message.',
    );
  } catch (error) {
    const diagnostic = await evaluate(`(async () => {
      const projection = await window.openNekoDesktop.shell.getSnapshot();
      ${requireActiveWorkbenchProjection('projection')}
      const activeSurface = document.querySelector('${ACTIVE_AGENT_SURFACE_SELECTOR}');
      return {
        context: activeWorkbench.scene.context,
        interaction: activeWorkbench.scene.slots.interaction,
        conversations: projection.agentHome.conversations,
        agentText: activeSurface?.querySelector('[data-owner-root="agent"]')
          ?.textContent?.trim().slice(0, 1200),
        alerts: [...document.querySelectorAll('[role="alert"]')]
          .map((element) => element.textContent?.trim()).filter(Boolean),
        tabs: [...document.querySelectorAll('[data-testid="conversation-tabs"] button')]
          .map((element) => element.textContent?.trim()).filter(Boolean),
      };
    })()`);
    throw new Error(
      `${error instanceof Error ? error.message : String(error)} Diagnostic: ${JSON.stringify(diagnostic)}`,
    );
  }
  return evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    ${requireActiveWorkbenchProjection('projection')}
    const context = activeWorkbench.scene.context;
    if (context.kind !== 'agent' || context.scope.kind !== 'assistant' ||
        typeof context.scope.conversationId !== 'string') {
      throw new Error('Assistant session inspection requires an exact conversation context.');
    }
    const activeMainTarget = document.querySelector('${ACTIVE_WORKBENCH_MAIN_TARGET_SELECTOR}');
    const previousManagementVisible = Boolean(
      activeMainTarget?.querySelector(
        '[data-owner-root="asset-management"], .agent-extension-management-root, .project-management-catalog',
      ),
    );
    const agent = document.querySelector(
      '${ACTIVE_AGENT_SURFACE_SELECTOR} [data-owner-root="agent"]',
    );
    if (!(agent instanceof HTMLElement) || previousManagementVisible) {
      throw new Error('Assistant session restored through the previous management layout.');
    }
    return {
      conversationId: context.scope.conversationId,
      phase: activeWorkbench.scene.slots.interaction?.kind === 'agent'
        ? activeWorkbench.scene.slots.interaction.phase
        : undefined,
      conversationCount: projection.agentHome.conversations.length,
      hasAgent: true,
      previousManagementVisible,
      standaloneAssistantGroupCount: document.querySelectorAll(
        '.primary-conversation-group[data-group-kind="assistant"]',
      ).length,
      visibleConversationChildCount: document.querySelectorAll(
        '.primary-conversation-group[data-group-kind="assistant"] .home-conversation-link',
      ).length,
      packageConversationTabsVisible: Boolean(document.querySelector('.agent-tab-list')),
      packageHistoryVisible: Boolean(document.querySelector('.agent-header-action-history')),
      transcriptContainsSubmittedMessage:
        document.body.textContent?.includes('Verify atomic Assistant session activation.') ?? false,
    };
  })()`);
}

async function exerciseAssistantConversationGroup(evaluate, click, type, originalConversationId) {
  for (let conversationNumber = 2; conversationNumber <= 6; conversationNumber += 1) {
    await clickApplicationNavigation(evaluate, click, 0);
    await waitForCondition(
      evaluate,
      `(async () => {
        const projection = await window.openNekoDesktop.shell.getSnapshot();
        ${requireActiveWorkbenchProjection('projection')}
        const context = activeWorkbench.scene.context;
        const root = document.querySelector(
          '${ACTIVE_AGENT_SURFACE_SELECTOR} .desktop-agent-root',
        );
        const textarea = root?.querySelector('.agent-composer-textarea');
        return context.kind === 'agent' &&
          context.scope.kind === 'unbound' &&
          root?.querySelector('.agent-empty-state') instanceof HTMLElement &&
          textarea instanceof HTMLTextAreaElement &&
          textarea.value === '';
      })()`,
      'Start Creating did not provide a fresh Entry Draft for grouped navigation.',
    );
    const message = `Grouped Assistant conversation ${String(conversationNumber)}.`;
    await type(ACTIVE_AGENT_TEXTAREA_SELECTOR, message);
    await waitForCondition(
      evaluate,
      `(() => {
        const send = document.querySelector('${ACTIVE_AGENT_SEND_SELECTOR}');
        return send instanceof HTMLButtonElement && !send.disabled;
      })()`,
      `Assistant draft ${String(conversationNumber)} did not enable its send control.`,
    );
    await click(ACTIVE_AGENT_SEND_SELECTOR);
    await waitForCondition(
      evaluate,
      `(async () => {
        const projection = await window.openNekoDesktop.shell.getSnapshot();
        ${requireActiveWorkbenchProjection('projection')}
        const context = activeWorkbench.scene.context;
        return projection.agentHome.conversations.length === ${String(conversationNumber)} &&
          context.kind === 'agent' &&
          context.scope.kind === 'assistant' &&
          typeof context.scope.conversationId === 'string' &&
          document.querySelector(
            '${ACTIVE_AGENT_SURFACE_SELECTOR} [data-owner-root="agent"]',
          )?.textContent
            ?.includes(${JSON.stringify(message)}) === true;
      })()`,
      `Assistant conversation ${String(conversationNumber)} did not activate exactly.`,
    );
  }

  const collapsed = await inspectAssistantConversationGroup(evaluate);
  if (
    collapsed.totalConversationCount !== 6 ||
    collapsed.visibleConversationCount !== 5 ||
    !collapsed.expandControlVisible
  ) {
    throw new Error(
      `Assistant group did not preserve its bounded collapsed state: ${JSON.stringify(collapsed)}`,
    );
  }
  await click(
    '.primary-conversation-group[data-group-kind="assistant"] .primary-conversation-group__expand',
  );
  await waitForCondition(
    evaluate,
    `document.querySelectorAll(
      '.primary-conversation-group[data-group-kind="assistant"] .home-conversation-link',
    ).length === 6`,
    'Assistant group did not expand all conversation children.',
  );
  const expanded = await inspectAssistantConversationGroup(evaluate);
  await click(
    '.primary-conversation-group[data-group-kind="assistant"] .primary-conversation-group__expand',
  );
  await waitForCondition(
    evaluate,
    `document.querySelectorAll(
      '.primary-conversation-group[data-group-kind="assistant"] .home-conversation-link',
    ).length === 5`,
    'Assistant group did not return to its bounded collapsed state.',
  );

  const deletion = await evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    ${requireActiveWorkbenchProjection('projection')}
    const context = activeWorkbench.scene.context;
    const group = projection.conversationNavigation.groups.find(
      (candidate) => candidate.kind === 'assistant',
    );
    if (context.kind !== 'agent' || context.scope.kind !== 'assistant' || !group) {
      throw new Error('Assistant deletion requires the exact active group and Scene.');
    }
    const deletedConversationId = group.conversations[1]?.navigation.conversationId;
    if (!deletedConversationId || deletedConversationId === context.scope.conversationId) {
      throw new Error('Assistant deletion fixture did not select a non-active conversation.');
    }
    globalThis.confirm = () => true;
    const deleteButtons = document.querySelectorAll(
      '.primary-conversation-group[data-group-kind="assistant"] ' +
        '.primary-recent-conversation-row > button:last-child',
    );
    const deleteButton = deleteButtons[1];
    if (!(deleteButton instanceof HTMLButtonElement) || deleteButton.disabled) {
      throw new Error('Assistant conversation delete control is unavailable.');
    }
    deleteButton.click();
    return {
      activeConversationId: context.scope.conversationId,
      deletedConversationId,
    };
  })()`);
  await waitForCondition(
    evaluate,
    `(async () => {
      const projection = await window.openNekoDesktop.shell.getSnapshot();
      ${requireActiveWorkbenchProjection('projection')}
      const context = activeWorkbench.scene.context;
      return projection.agentHome.conversations.length === 5 &&
        !projection.agentHome.conversations.some(
          (conversation) => conversation.navigation.conversationId === ${JSON.stringify(
            deletion.deletedConversationId,
          )},
        ) &&
        context.kind === 'agent' &&
        context.scope.kind === 'assistant' &&
        context.scope.conversationId === ${JSON.stringify(deletion.activeConversationId)} &&
        !document.querySelector(
          '.primary-conversation-group[data-group-kind="assistant"] ' +
            '.primary-conversation-group__expand',
        );
    })()`,
    'Assistant conversation deletion did not preserve the exact active session.',
  );
  const afterDelete = await inspectAssistantConversationGroup(evaluate);
  if (
    afterDelete.totalConversationCount !== 5 ||
    afterDelete.visibleConversationCount !== 5 ||
    afterDelete.expandControlVisible ||
    !afterDelete.conversationIds.includes(originalConversationId)
  ) {
    throw new Error(
      `Assistant group did not update after exact deletion: ${JSON.stringify(afterDelete)}`,
    );
  }
  return { collapsed, expanded, deletion, afterDelete };
}

async function inspectAssistantConversationGroup(evaluate) {
  return evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    const group = projection.conversationNavigation.groups.find(
      (candidate) => candidate.kind === 'assistant',
    );
    if (!group) throw new Error('Assistant conversation group is unavailable.');
    return {
      totalConversationCount: group.conversations.length,
      visibleConversationCount: document.querySelectorAll(
        '.primary-conversation-group[data-group-kind="assistant"] .home-conversation-link',
      ).length,
      expandControlVisible: Boolean(document.querySelector(
        '.primary-conversation-group[data-group-kind="assistant"] ' +
          '.primary-conversation-group__expand',
      )),
      conversationIds: group.conversations.map(
        (conversation) => conversation.navigation.conversationId,
      ),
    };
  })()`);
}

async function openAssistantConversation(evaluate, conversationId) {
  await waitForCondition(
    evaluate,
    `(async () => {
      const projection = await window.openNekoDesktop.shell.getSnapshot();
      const group = projection.conversationNavigation.groups.find(
        (candidate) => candidate.kind === 'assistant',
      );
      const index = group?.conversations.findIndex(
        (conversation) => conversation.navigation.conversationId === ${JSON.stringify(conversationId)},
      );
      const buttons = document.querySelectorAll(
        '.primary-conversation-group[data-group-kind="assistant"] .home-conversation-link',
      );
      const button = typeof index === 'number' && index >= 0 ? buttons[index] : undefined;
      return button instanceof HTMLButtonElement && !button.disabled;
    })()`,
    'Exact Assistant conversation control did not become interactive.',
  );
  await evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    const group = projection.conversationNavigation.groups.find(
      (candidate) => candidate.kind === 'assistant',
    );
    const index = group?.conversations.findIndex(
      (conversation) => conversation.navigation.conversationId === ${JSON.stringify(conversationId)},
    );
    const buttons = document.querySelectorAll(
      '.primary-conversation-group[data-group-kind="assistant"] .home-conversation-link',
    );
    const button = typeof index === 'number' && index >= 0 ? buttons[index] : undefined;
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      throw new Error(
        'Exact Assistant conversation control is unavailable: ' +
          JSON.stringify({ index, buttonCount: buttons.length, disabled: button?.disabled }),
      );
    }
    button.click();
    return true;
  })()`);
}

async function exercisePrimarySidebar(evaluate, click, drag, screenshot) {
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
  const compactScreenshot = await captureSettledScreenshot(
    screenshot,
    'primary-sidebar-compact-large',
  );
  await click('.primary-sidebar-toggle');
  await waitForCondition(
    evaluate,
    `document.querySelector('[data-primary-sidebar="application"]')?.classList.contains('home-navigation--compact') === false`,
    'PrimarySidebar did not restore its expanded presentation.',
  );
  await drag(
    '.neko-controlled-workbench-primary > .neko-controlled-workbench-resize-handle',
    '.neko-controlled-workbench-interaction[data-presentation="main"]',
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
  const restoredScreenshot = await captureSettledScreenshot(
    screenshot,
    'primary-sidebar-restored-large',
  );
  return {
    initial,
    compactToggle,
    committed,
    screenshots: [compactScreenshot, restoredScreenshot],
  };
}

async function exerciseManagementMainSplit(evaluate, drag) {
  const initial = await inspectMainSplit(evaluate);
  assertManagementMainNotNarrower(initial, 'initial');
  await drag(
    '.neko-controlled-workbench-main-split-handle--columns',
    '.neko-controlled-workbench-main',
    { targetPosition: { xRatio: 0.68, yRatio: 0.5 } },
  );
  await waitForCondition(
    evaluate,
    `(() => {
      const shell = document.querySelector('[data-neko-controlled-workbench="true"]');
      return shell instanceof HTMLElement &&
        parseFloat(shell.style.getPropertyValue('--neko-controlled-main-split-ratio')) > 60;
    })()`,
    'Management Main split resize did not enlarge the management panel.',
  );
  const resized = await inspectMainSplit(evaluate);
  assertManagementMainNotNarrower(resized, 'resized');
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
      return ratio >= 49.5 && ratio <= 50.5;
    })()`,
    'Management Main split resize did not enforce the 50% management minimum.',
  );
  const restored = await inspectMainSplit(evaluate);
  assertManagementMainNotNarrower(restored, 'minimum');
  return { initial, resized, restored };
}

function assertManagementMainNotNarrower(detail, phase) {
  if (
    (Math.abs(detail.ratio - 50) > 0.5 && phase !== 'resized') ||
    detail.primaryWidth < detail.secondaryWidth
  ) {
    throw new Error(
      `Management Main became narrower than Detail during ${phase}: ${JSON.stringify(detail)}`,
    );
  }
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
  const cases = [
    { region: 'agent', mode: 'main-only' },
    { region: 'agent', mode: 'chat-main' },
    { region: 'main', mode: 'chat-only' },
    { region: 'main', mode: 'chat-main' },
    { region: 'management', resources: 'hidden' },
    { region: 'management', resources: 'docked' },
  ];
  const observed = [];
  for (const expected of cases) {
    const selector = `[data-workbench-region-control="${expected.region}"]`;
    await waitForWorkspaceRegionControl(evaluate, expected.region);
    await click(selector);
    await waitForCondition(
      evaluate,
      `(async () => {
        const projection = await window.openNekoDesktop.shell.getSnapshot();
        ${requireActiveWorkbenchProjection('projection')}
        const workbench = activeWorkbench.layout;
        return ${expected.mode ? `workbench.display.mode === ${JSON.stringify(expected.mode)}` : 'true'} &&
          ${expected.resources ? `workbench.resourceDock.presentation === ${JSON.stringify(expected.resources)}` : 'true'};
      })()`,
      `Workspace region '${expected.region}' did not commit its presentation.`,
    );
    observed.push(
      await evaluate(`(async () => {
        const projection = await window.openNekoDesktop.shell.getSnapshot();
        ${requireActiveWorkbenchProjection('projection')}
        const workbench = activeWorkbench.layout;
        return {
          mode: workbench.display.mode,
          chatPosition: workbench.display.chatPosition,
          resources: workbench.resourceDock.presentation,
          hasAgent: Boolean(document.querySelector('[data-dock-owner="agent"], [data-primary-surface="agent"]')),
          hasMain: Boolean(document.querySelector('[data-main-view-id]')),
        };
      })()`),
    );
  }
  return observed;
}

async function waitForWorkspaceRegionControl(evaluate, region) {
  await waitForCondition(
    evaluate,
    `(() => {
      const control = document.querySelector('[data-workbench-region-control="${region}"]');
      return control instanceof HTMLButtonElement && !control.disabled;
    })()`,
    `Workspace ${region} control did not become interactive.`,
  );
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
    modelLabel: document.querySelector('.agent-model-config-trigger')?.textContent?.trim() ?? '',
    hasApproval: Boolean(document.querySelector('.agent-execution-mode-trigger')),
    sessionTabsVisible: Boolean(document.querySelector('[data-testid="conversation-tabs"]')),
  }))()`);
  return { ...controls, composer: await inspectComposerPresentation(evaluate) };
}

async function inspectComposerPresentation(evaluate) {
  return evaluate(`(() => {
    const activeSurfaces = document.querySelectorAll(
      '[data-primary-surface="agent"]',
    );
    const activeSurface = activeSurfaces[0];
    const shell = activeSurface?.querySelector('.agent-composer-shell');
    const toolbar = activeSurface?.querySelector('.agent-composer-toolbar');
    const workspace = activeSurface?.querySelector('.agent-composer-workspace');
    const emptyPanel = activeSurface?.querySelector(
      '.agent-empty-state--desktop-dock .agent-empty-panel',
    );
    const owner = shell?.closest('[data-dock-owner="agent"], [data-primary-surface="agent"]');
    if (activeSurfaces.length !== 1 || !(shell instanceof HTMLElement) ||
        !(toolbar instanceof HTMLElement) ||
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
      branchMetadataCount: activeSurface.querySelectorAll(
        '[data-composer-branch], [data-composer-runtime-location]',
      ).length,
    };
  })()`);
}

async function activateAssetEntry(evaluate, label, eventName) {
  await evaluate(`(() => {
    const target = document.querySelector('${ACTIVE_WORKBENCH_MAIN_TARGET_SELECTOR}');
    const entry = [...(target?.querySelectorAll('.global-library-browser__entry') ?? [])].find(
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

async function selectGlobalLibraryCatalog(evaluate, labelPattern) {
  const selectedExpression = `(() => {
    const target = document.querySelector('${ACTIVE_WORKBENCH_MAIN_TARGET_SELECTOR}');
    return [...(target?.querySelectorAll('.global-library-browser__facets button') ?? [])]
      .some((candidate) =>
        ${String(labelPattern)}.test(candidate.textContent?.trim() ?? '') &&
        candidate.getAttribute('aria-pressed') === 'true'
      );
  })()`;
  await evaluate(`(() => {
    const target = document.querySelector('${ACTIVE_WORKBENCH_MAIN_TARGET_SELECTOR}');
    const button = [...(target?.querySelectorAll('.global-library-browser__facets button') ?? [])]
      .find((candidate) => ${String(labelPattern)}.test(candidate.textContent?.trim() ?? ''));
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error('Requested Global Library catalog is unavailable.');
    }
    if (button.getAttribute('aria-pressed') !== 'true') button.click();
    return true;
  })()`);
  await waitForCondition(
    evaluate,
    selectedExpression,
    'Requested Global Library catalog did not become active.',
  );
}

async function openPersistedFixtureAssetPreview(evaluate) {
  await waitForCondition(
    evaluate,
    `document.querySelector('${ACTIVE_WORKBENCH_MAIN_TARGET_SELECTOR} [data-owner-root="asset-management"]')?.getAttribute('data-catalog-status') === 'ready'`,
    'Asset Management did not restore its catalog after application restart.',
  );
  await selectGlobalLibraryCatalog(evaluate, /^(Media Library|媒体库)$/u);
  await waitForCondition(
    evaluate,
    `document.querySelector('${ACTIVE_WORKBENCH_MAIN_TARGET_SELECTOR} [data-owner-root="asset-management"]')?.getAttribute('data-catalog-status') === 'ready'`,
    'Media Library catalog did not become ready after application restart.',
  );
  const previewEntryVisible = await evaluate(`(() =>
    [...document.querySelectorAll('${ACTIVE_WORKBENCH_MAIN_TARGET_SELECTOR} .global-library-browser__entry strong')]
      .some((element) => element.textContent?.trim() === 'preview.png'))()`);
  if (!previewEntryVisible) {
    await waitForCondition(
      evaluate,
      `(() => [...document.querySelectorAll('${ACTIVE_WORKBENCH_MAIN_TARGET_SELECTOR} .global-library-browser__entry strong')]
        .some((element) => element.textContent?.trim() === 'workspace'))()`,
      'Asset Management did not retain the fixture media library after restart.',
    );
    await activateAssetEntry(evaluate, 'workspace', 'dblclick');
    await waitForCondition(
      evaluate,
      `(() => [...document.querySelectorAll('${ACTIVE_WORKBENCH_MAIN_TARGET_SELECTOR} .global-library-browser__entry strong')]
        .some((element) => element.textContent?.trim() === 'preview.png'))()`,
      'Asset Management could not reopen the retained fixture media library.',
    );
  }
  await activateAssetEntry(evaluate, 'preview.png', 'click');
  await waitForCondition(
    evaluate,
    `(() => [...document.querySelectorAll('${ACTIVE_WORKBENCH_MAIN_TARGET_SELECTOR} .global-library-browser__entry[data-selected="true"] strong')]
      .some((element) => element.textContent?.trim() === 'preview.png'))()`,
    'Asset Management did not restore the fixture selection after restart.',
  );
  await waitForCondition(
    evaluate,
    `Boolean(document.querySelector(
      '${ACTIVE_WORKBENCH_SECONDARY_MAIN_TARGET_SELECTOR} [data-authorized-preview-session-id]',
    ))`,
    'Asset Management did not create a fresh Preview handle after restart.',
  );
  const evidence = await evaluate(`(() => {
    const target = document.querySelector('${ACTIVE_WORKBENCH_MAIN_TARGET_SELECTOR}');
    const catalog = [...(target?.querySelectorAll('.global-library-browser__facets button') ?? [])]
      .find((button) => button.getAttribute('aria-pressed') === 'true');
    const collection = target?.querySelector('.global-library-browser__collection');
    return {
      catalog: catalog?.textContent?.trim() ?? '',
      viewMode: collection?.getAttribute('data-view-mode') ?? '',
      contentVisible: [...(target?.querySelectorAll('.global-library-browser__entry strong') ?? [])]
        .some((element) => element.textContent?.trim() === 'preview.png'),
      previewReady: Boolean(document.querySelector(
        '${ACTIVE_WORKBENCH_SECONDARY_MAIN_TARGET_SELECTOR} [data-authorized-preview-session-id]',
      )),
    };
  })()`);
  if (evidence.viewMode !== 'list' || !evidence.contentVisible || !evidence.previewReady) {
    throw new Error(`Retained Media Library evidence is incomplete: ${JSON.stringify(evidence)}`);
  }
  return { ...evidence, connectionRetained: true };
}

async function waitForCondition(evaluate, expression, message, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let collectedPromiseCount = 0;
  while (Date.now() < deadline) {
    try {
      if (await evaluate(expression)) return;
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.message !== 'Desktop CDP Runtime.evaluate failed: Promise was collected'
      ) {
        throw error;
      }
      collectedPromiseCount += 1;
    }
    await delay(100);
  }
  throw new Error(
    collectedPromiseCount === 0
      ? message
      : `${message} CDP collected ${String(collectedPromiseCount)} read-only condition promises.`,
  );
}

function requireActiveWorkbenchProjection(projectionName, bindingName = 'activeWorkbench') {
  return `const ${bindingName} = ${projectionName}.window.workbench;`;
}

async function inspectWorkbench(evaluate, expectedShape, expectedOwner) {
  return evaluate(`(() => {
    const shell = document.querySelector('.desktop-scene-workbench--${expectedShape}');
    if (!(shell instanceof HTMLElement)) {
      throw new Error('Expected Desktop Workbench shape is missing.');
    }
    const primary = shell.querySelector('[data-primary-sidebar="application"]');
    const main = shell.querySelector(':scope > .neko-controlled-workbench-main');
    const mainPrimary = main?.querySelector(':scope > .neko-controlled-workbench-main__primary');
    const leftDock = shell.querySelector(':scope > .neko-controlled-workbench-dock--left');
    const rightDock = shell.querySelector(':scope > .neko-controlled-workbench-dock--right');
    const interaction = shell.querySelector(':scope > .neko-controlled-workbench-interaction');
    const ownerSelectors = {
      'asset-management': '[data-owner-root="asset-management"]',
      'extension-management': '.agent-extension-management-root',
      'project-management': '.project-management-catalog',
      settings: '[data-settings-surface="main"]',
      workspace: '[data-main-view-id]',
    };
    const ownerSelector = ownerSelectors[${JSON.stringify(expectedOwner)}];
    const activeMainTarget = shell.querySelector('${ACTIVE_WORKBENCH_MAIN_TARGET_SELECTOR}');
    const activeSecondaryMainTarget = shell.querySelector(
      '${ACTIVE_WORKBENCH_SECONDARY_MAIN_TARGET_SELECTOR}',
    );
    const owner = ownerSelector ? activeMainTarget?.querySelector(ownerSelector) : undefined;
    const mainRect = main instanceof HTMLElement ? main.getBoundingClientRect() : undefined;
    const ownerRect = owner instanceof HTMLElement ? owner.getBoundingClientRect() : undefined;
    const mainPrimaryRect = mainPrimary instanceof HTMLElement
      ? mainPrimary.getBoundingClientRect()
      : undefined;
    const mainSecondary = main?.querySelector(':scope > .neko-controlled-workbench-main__secondary');
    const mainSecondaryRect = mainSecondary instanceof HTMLElement
      ? mainSecondary.getBoundingClientRect()
      : undefined;
    const mainGutter = shell.querySelector('[data-workbench-main-gutter="true"]');
    const mainGutterRect = mainGutter instanceof HTMLElement
      ? mainGutter.getBoundingClientRect()
      : undefined;
    const mainStyle = main instanceof HTMLElement ? getComputedStyle(main) : undefined;
    const interactionRect = interaction instanceof HTMLElement
      ? interaction.getBoundingClientRect()
      : undefined;
    const primaryMainStyle = mainPrimary instanceof HTMLElement
      ? getComputedStyle(mainPrimary)
      : undefined;
    const secondaryMainStyle = mainSecondary instanceof HTMLElement
      ? getComputedStyle(mainSecondary)
      : undefined;
    const controlledShell = shell;
    const previewPresentation = activeSecondaryMainTarget?.querySelector(
      '[data-preview-presentation-owner="preview-webview"]',
    );
    const previewStyle = previewPresentation instanceof HTMLElement
      ? getComputedStyle(previewPresentation)
      : undefined;
    return {
      shellCount: document.querySelectorAll('[data-neko-controlled-workbench="true"]').length,
      primaryCount: document.querySelectorAll('[data-primary-sidebar="application"]').length,
      recentNavigationVisible: Boolean(primary?.querySelector('.home-recent-navigation')),
      recentSectionCount: primary?.querySelectorAll('.home-sidebar-heading').length ?? 0,
      conversationGroupCount: primary?.querySelectorAll('.primary-conversation-group').length ?? 0,
      projectConversationGroupCount:
        primary?.querySelectorAll('.primary-conversation-group[data-group-kind="project"]').length ?? 0,
      standaloneConversationGroupCount:
        primary?.querySelectorAll(
          '.primary-conversation-group[data-group-kind="assistant"], ' +
          '.primary-conversation-group[data-group-kind="character"], ' +
          '.primary-conversation-group[data-group-kind="room"]',
        ).length ?? 0,
      hasAgentDock: Boolean(shell.querySelector('[data-dock-owner="agent"]')),
      hasLeftDock: leftDock instanceof HTMLElement,
      hasRightDock: rightDock instanceof HTMLElement,
      interactionPresentation: interaction?.getAttribute('data-presentation'),
      interactionWidth: interactionRect?.width ?? 0,
      leftDockPresentation: leftDock?.getAttribute('data-presentation'),
      rightDockPresentation: rightDock?.getAttribute('data-presentation'),
      hasWorkspaceMain: Boolean(shell.querySelector('[data-main-view-id]')),
      previewInSecondary: Boolean(
        activeSecondaryMainTarget?.querySelector('[data-authorized-preview-session-id]'),
      ),
      previewKind: activeSecondaryMainTarget
        ?.querySelector('[data-preview-kind]')
        ?.getAttribute('data-preview-kind'),
      previewPresentationOwner: activeSecondaryMainTarget
        ?.querySelector('[data-preview-presentation-owner]')
        ?.getAttribute('data-preview-presentation-owner'),
      previewRenderableHeight:
        previewPresentation instanceof HTMLElement
          ? previewPresentation.getBoundingClientRect().height
          : 0,
      previewBackground: previewStyle?.backgroundColor,
      previewDescriptorHeaderVisible: Boolean(
        activeSecondaryMainTarget?.querySelector('.neko-preview-root > header'),
      ),
      projectDetailInSecondary: Boolean(
        activeSecondaryMainTarget?.querySelector('.project-management-detail'),
      ),
      projectOpenActionVisible: Boolean(
        activeMainTarget?.querySelector(
          '.project-management-catalog .management-surface-row-actions button',
        ),
      ),
      mainPanelIds: [
        ...(activeMainTarget?.querySelectorAll('[data-workbench-main-panel]') ?? []),
        ...(activeSecondaryMainTarget?.querySelectorAll('[data-workbench-main-panel]') ?? []),
      ].map(
        (element) => element.getAttribute('data-workbench-main-panel'),
      ),
      compactPanelIds: [
        ...(activeMainTarget?.querySelectorAll(
          '[data-workbench-main-panel][data-panel-size="compact"]',
        ) ?? []),
        ...(activeSecondaryMainTarget?.querySelectorAll(
          '[data-workbench-main-panel][data-panel-size="compact"]',
        ) ?? []),
      ].map((element) => element.getAttribute('data-workbench-main-panel')),
      panelTabHeaderIds: [
        ...(activeMainTarget?.querySelectorAll('.project-main-group__tabs') ?? []),
        ...(activeSecondaryMainTarget?.querySelectorAll('.project-main-group__tabs') ?? []),
      ]
        .map((element) => element.closest('[data-workbench-main-panel]')?.getAttribute(
          'data-workbench-main-panel',
        ))
        .filter(Boolean),
      layoutControlInTopBrand: Boolean(
        primary?.querySelector(
          '.primary-sidebar-brand__controls [data-workbench-region-control="primary-sidebar"]',
        ),
      ),
      layoutControlKinds: [
        ...primary?.querySelectorAll(
          '.primary-sidebar-brand__controls [data-workbench-region-control]',
        ) ?? [],
      ].map((element) => element.getAttribute('data-workbench-region-control')),
      layoutControlInFooter: Boolean(
        primary?.querySelector(
          '.home-navigation-footer [data-workbench-region-control]',
        ),
      ),
      mainSplit: controlledShell?.getAttribute('data-main-split'),
      mainComposition: main?.getAttribute('data-main-composition'),
      mainSplitRatio:
        controlledShell instanceof HTMLElement
          ? parseFloat(
              controlledShell.style.getPropertyValue('--neko-controlled-main-split-ratio'),
            ) / 100
          : 0,
      hasMainSplitResize: Boolean(
        shell.querySelector('.neko-controlled-workbench-main-split-handle--columns'),
      ),
      primaryMainShell: mainPrimary?.getAttribute('data-workbench-main-shell'),
      secondaryMainShell: mainSecondary?.getAttribute('data-workbench-main-shell'),
      hasMainGutter: mainGutter instanceof HTMLElement,
      mainGutterWidth: mainGutterRect?.width ?? 0,
      mainShellGap:
        mainPrimaryRect !== undefined && mainSecondaryRect !== undefined
          ? mainSecondaryRect.left - mainPrimaryRect.right
          : 0,
      enclosingMainBorderWidth: mainStyle ? parseFloat(mainStyle.borderTopWidth) : 0,
      enclosingMainBorderRadius: mainStyle?.borderRadius,
      enclosingMainOverflow: mainStyle?.overflow,
      enclosingMainShadow: mainStyle?.boxShadow,
      primaryMainBorderWidth: primaryMainStyle
        ? parseFloat(primaryMainStyle.borderTopWidth)
        : 0,
      primaryMainBorderRadius: primaryMainStyle?.borderRadius,
      primaryMainOverflow: primaryMainStyle?.overflow,
      primaryMainShadow: primaryMainStyle?.boxShadow,
      primaryMainBackground: primaryMainStyle?.backgroundColor,
      secondaryMainBorderWidth: secondaryMainStyle
        ? parseFloat(secondaryMainStyle.borderTopWidth)
        : 0,
      secondaryMainBorderRadius: secondaryMainStyle?.borderRadius,
      secondaryMainOverflow: secondaryMainStyle?.overflow,
      secondaryMainShadow: secondaryMainStyle?.boxShadow,
      secondaryMainBackground: secondaryMainStyle?.backgroundColor,
      mainPanelsOverlap:
        mainPrimaryRect !== undefined && mainSecondaryRect !== undefined
          ? mainPrimaryRect.right > mainSecondaryRect.left + 1
          : false,
      primaryMainWidth: mainPrimaryRect?.width ?? 0,
      secondaryMainWidth: mainSecondaryRect?.width ?? 0,
      mainDisplay: main instanceof HTMLElement ? getComputedStyle(main).display : undefined,
      mainVisibility: mainStyle?.visibility,
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
    !detail.modelLabel.includes('Functional Chat') ||
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
    detail.panelTabHeaderIds.includes(managementPanelId) ||
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
    detail.panelTabHeaderIds.includes(managementPanelId) ||
    detail.panelTabHeaderIds.includes(detailPanelId) ||
    !detail.compactPanelIds.includes(managementPanelId) ||
    detail.mainSplit !== 'columns' ||
    detail.mainComposition !== 'independent-shells' ||
    Math.abs(detail.mainSplitRatio - 0.5) > 0.025 ||
    !detail.hasMainSplitResize ||
    detail.primaryMainShell !== 'primary' ||
    detail.secondaryMainShell !== 'secondary' ||
    !detail.hasMainGutter ||
    Math.abs(detail.mainGutterWidth - 10) > 1 ||
    Math.abs(detail.mainShellGap - 10) > 1 ||
    detail.enclosingMainBorderWidth !== 0 ||
    detail.enclosingMainBorderRadius !== '0px' ||
    detail.enclosingMainOverflow !== 'visible' ||
    detail.enclosingMainShadow !== 'none' ||
    detail.primaryMainBorderWidth <= 0 ||
    detail.secondaryMainBorderWidth <= 0 ||
    detail.primaryMainBorderRadius === '0px' ||
    detail.secondaryMainBorderRadius === '0px' ||
    detail.primaryMainOverflow !== 'hidden' ||
    detail.secondaryMainOverflow !== 'hidden' ||
    detail.primaryMainShadow === 'none' ||
    detail.secondaryMainShadow === 'none' ||
    detail.mainPanelsOverlap ||
    detail.primaryMainWidth <= 0 ||
    detail.primaryMainWidth < detail.secondaryMainWidth
  ) {
    throw new Error(
      `Management + Detail did not preserve the shared compact Workbench composition: ${JSON.stringify(detail)}`,
    );
  }
}

function assertResponsiveManagementDetailSplit(detail, managementPanelId, detailPanelId) {
  assertSingleWorkbench(detail);
  if (
    !detail.ownerInMain ||
    !detail.mainPanelIds.includes(managementPanelId) ||
    !detail.mainPanelIds.includes(detailPanelId) ||
    !detail.compactPanelIds.includes(managementPanelId) ||
    detail.mainSplit !== 'columns' ||
    detail.mainComposition !== 'independent-shells' ||
    !detail.hasMainSplitResize ||
    detail.primaryMainShell !== 'primary' ||
    detail.secondaryMainShell !== 'secondary' ||
    !detail.hasMainGutter ||
    Math.abs(detail.mainGutterWidth - 10) > 1 ||
    Math.abs(detail.mainShellGap - 10) > 1 ||
    detail.mainPanelsOverlap ||
    detail.primaryMainWidth <= 0 ||
    detail.secondaryMainWidth <= 0
  ) {
    throw new Error(
      `Responsive Management + Detail lost its canonical Workbench composition: ${JSON.stringify(detail)}`,
    );
  }
}

function assertWorkspaceTopControls(detail) {
  if (
    !detail.layoutControlInTopBrand ||
    detail.layoutControlInFooter ||
    JSON.stringify(detail.layoutControlKinds) !==
      JSON.stringify(['primary-sidebar', 'agent', 'main', 'management'])
  ) {
    throw new Error(
      'Workspace layout control is not beside the PrimarySidebar visibility control.',
    );
  }
}

function assertSingleWorkbench(detail) {
  if (detail.shellCount !== 1 || detail.primaryCount !== 1) {
    throw new Error('Desktop scene did not preserve exactly one Workbench and PrimarySidebar.');
  }
  if (!detail.recentNavigationVisible || detail.recentSectionCount !== 1) {
    throw new Error(
      'PrimarySidebar did not preserve one authoritative grouped navigation surface.',
    );
  }
}

function assertAgentOnly(detail) {
  assertSingleWorkbench(detail);
  if (
    !detail.hasAgentDock ||
    detail.interactionPresentation !== 'main' ||
    detail.leftDockPresentation !== 'hidden' ||
    detail.rightDockPresentation !== 'hidden' ||
    detail.mainVisibility !== 'hidden' ||
    detail.interactionWidth < detail.mainWidth
  ) {
    throw new Error(
      `Agent-only did not occupy the canonical Main area with retained docks hidden: ${JSON.stringify(detail)}`,
    );
  }
}

function assertAssistantConversationNavigation(detail) {
  if (
    detail.standaloneAssistantGroupCount !== 1 ||
    detail.conversationCount < 1 ||
    detail.visibleConversationChildCount !== Math.min(detail.conversationCount, 5) ||
    detail.packageConversationTabsVisible ||
    detail.packageHistoryVisible
  ) {
    throw new Error(
      `Assistant session did not use PrimarySidebar as its only conversation switcher: ${JSON.stringify(detail)}`,
    );
  }
}

function assertManagementMain(detail, owner) {
  assertSingleWorkbench(detail);
  if (detail.leftDockPresentation !== 'hidden' || !detail.ownerInMain || detail.ownerWidth < 420) {
    throw new Error(
      `${owner} was not mounted as the full Workbench Main surface: ${JSON.stringify(detail)}`,
    );
  }
}

async function reserveFunctionalProviderPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    await closeServer(server);
    throw new Error('Functional provider did not reserve a TCP port.');
  }
  const port = address.port;
  await closeServer(server);
  return port;
}

async function startFunctionalProviderServer(port, responseDelayMs) {
  const requests = [];
  const server = createServer((request, response) => {
    const requestIndex = requests.length + 1;
    requests.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
      apiKey: request.headers['x-api-key'],
    });
    request.resume();
    request.once('end', () => {
      setTimeout(() => {
        response.writeHead(200, {
          'content-type': 'text/event-stream',
          connection: 'close',
        });
        response.end(
          `data: {"id":"functional-${String(requestIndex)}","object":"chat.completion.chunk","created":1,"model":"functional-chat","choices":[{"index":0,"delta":{"role":"assistant","content":"OPENNEKO_FUNCTIONAL_RESPONSE_${String(requestIndex)}"},"finish_reason":null}]}\n\n` +
            `data: {"id":"functional-${String(requestIndex)}","object":"chat.completion.chunk","created":1,"model":"functional-chat","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\n` +
            'data: [DONE]\n\n',
        );
      }, responseDelayMs);
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return {
    snapshot: () => ({ requests: requests.map((request) => ({ ...request })) }),
    close: () => closeServer(server),
  };
}

function assertFunctionalProviderEvidence(evidence, minimumRequestCount) {
  if (
    evidence.requests.length < minimumRequestCount ||
    evidence.requests.some(
      (request) =>
        request.method !== 'POST' ||
        request.url !== '/api/chat/completions' ||
        request.authorization !== undefined ||
        request.apiKey !== undefined,
    )
  ) {
    throw new Error(
      `Functional keyless provider request contract failed: ${JSON.stringify(evidence)}`,
    );
  }
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function captureSettledScreenshot(screenshot, label) {
  await delay(VISUAL_SETTLE_MILLISECONDS);
  return screenshot(label);
}
