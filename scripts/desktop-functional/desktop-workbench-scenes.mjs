import { access, copyFile, mkdir, rename, symlink, writeFile } from 'node:fs/promises';
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
const PROJECT_SIDEBAR_WORKSPACE_ID = '11111111-2222-4333-8444-555555555555';
const PROJECT_SIDEBAR_CONVERSATION_ID = 'conversation:project-sidebar-history';
const PROJECT_SIDEBAR_CLEANUP_WORKSPACE_ID = '66666666-7777-4888-8999-aaaaaaaaaaaa';
const PROJECT_SIDEBAR_CLEANUP_CONVERSATION_ID = 'conversation:project-sidebar-cleanup-history';

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
        join(workspacePath, 'test.png'),
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
      join(workspacePath, 'test.fountain'),
      'INT. TEST ROOM - DAY\n\nA fixture scene validates Agent Fountain context.\n',
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
        'capabilities = ["chat", "vision"]',
        'context_window = 32768',
        'max_output_tokens = 8192',
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
    pressKey,
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

      await resizeWindow(evaluate, 1040, 700);
      const smallAgent = await inspectWorkbench(evaluate, 'agent-only');
      assertSingleWorkbench(smallAgent);
      assertAgentOnly(smallAgent);
      const smallDraftControls = await inspectAgentDraftControls(evaluate);
      assertAgentDraftControls(smallDraftControls);
      if (!smallDraftControls.composer.toolbarFitsSurface) {
        throw new Error('Small-window Entry composer toolbar overflowed its Agent surface.');
      }
      const smallAgentScreenshot = await screenshot('agent-only-small');
      checkpoint('agent-only-small', {
        ...smallAgent,
        draftControls: smallDraftControls,
      });
      await resizeWindow(evaluate, 1440, 960);

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
      const extensionsGrid = await inspectExtensionsManagement(evaluate);
      assertExtensionsCatalogOnly(extensionsGrid, 'grid', 'skills');
      const extensionsGridScreenshot = await screenshot('extension-management-skills-grid-large');
      checkpoint('extension-management-skills-grid-large', extensionsGrid);

      await click('[data-catalog-view-control="list"]');
      await waitForSelector('.agent-extension-management-root[data-catalog-view="list"]');
      const extensionsList = await inspectExtensionsManagement(evaluate);
      assertExtensionsCatalogOnly(extensionsList, 'list', 'skills');
      const extensionsListScreenshot = await screenshot('extension-management-skills-list-large');
      checkpoint('extension-management-skills-list-large', extensionsList);

      await click('[data-extension-catalog-tab="extensions"]');
      await click('.agent-extension-management-root [role="option"]');
      await waitForSelector('[data-workbench-main-panel="extension-detail"]');
      await waitForSelector('[data-automation-endpoint-management="true"]');
      await waitForSelector('[data-automation-permission-management="true"]');
      const extensionsConfiguration = await inspectExtensionsManagement(evaluate);
      assertExtensionsManagement(extensionsConfiguration, 'list', 'extensions');
      const extensionsResize = await exerciseManagementMainSplit(evaluate, drag);
      const extensionsScreenshot = await screenshot('extension-management-configuration-large');
      const extensions = {
        grid: extensionsGrid,
        list: extensionsList,
        configuration: extensionsConfiguration,
        resize: extensionsResize,
      };
      checkpoint('extension-management-configuration-large', extensions);

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
      assertFullBleedWorkbench(settings);
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
      const workspaceMention = await exerciseWorkspaceDraftMention({
        evaluate,
        pressKey,
        screenshot,
        type,
        screenshotLabel: 'workspace-draft-mention-large',
      });
      const workspaceAgentActivation = await inspectActivatedWorkspaceAgent(evaluate);
      const workspaceResourceChrome = await inspectWorkspaceResourceChrome(evaluate);
      const workspaceScreenshot = await screenshot('workspace-large');
      const workspaceComposer = await inspectComposerPresentation(evaluate);
      assertWorkspaceComposer(workspaceComposer, 'workspace');
      if (workspaceComposer.ownerWidth >= 400 || !workspaceComposer.toolbarFitsSurface) {
        throw new Error('Agent composer did not qualify the narrow Workspace dock presentation.');
      }
      const workspaceDockResize = await exerciseWorkspaceDockResize(
        evaluate,
        drag,
        workspaceActivation.workspaceId,
      );
      checkpoint('workspace-large', {
        ...workspace,
        workspaceActivation,
        workspaceAgentActivation,
        workspaceResourceChrome,
        workspaceComposer,
        workspaceDockResize,
        workspaceMentionSelection: workspaceMention.selection,
      });

      const workspacePreview = await openWorkspacePreview(evaluate);
      const workspacePreviewScreenshot = await screenshot('workspace-preview-content-only-large');
      checkpoint('workspace-preview-content-only-large', workspacePreview);

      const displayModes = await exerciseWorkspaceDisplayModes(evaluate, click, screenshot);
      checkpoint('workspace-display-modes', displayModes.states);

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
      const projectCatalog = await inspectWorkbench(evaluate, 'management', 'project-management');
      assertSharedManagementPanel(projectCatalog, 'project-management');
      if (
        projectCatalog.projectDetailInSecondary ||
        projectCatalog.mainPanelIds.includes('project-detail') ||
        projectCatalog.projectRowActionCount !== 2 ||
        !projectCatalog.projectOpenTargetVisible ||
        projectCatalog.projectCatalogViewMode !== 'grid'
      ) {
        throw new Error('Project catalog lost its direct-open grid presentation.');
      }
      const projectCatalogScreenshot = await screenshot('project-management-grid-large');
      checkpoint('project-management-grid-large', projectCatalog);

      await openProjectCatalogItem(evaluate, workspaceActivation.projectId);
      await waitForSelector('.desktop-scene-workbench--workspace');
      const catalogDirectRestore = await inspectExactWorkspace(
        evaluate,
        workspaceActivation.workspaceId,
      );
      checkpoint('project-management-direct-open-exact-restore', catalogDirectRestore);

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
      await waitForSelector(`${ACTIVE_AGENT_SURFACE_SELECTOR} .agent-composer-shell`);
      const reloadedWorkspace = await inspectWorkbench(evaluate, 'workspace', 'workspace');
      assertSingleWorkbench(reloadedWorkspace);
      const reloadRestore = await inspectExactWorkspace(evaluate, workspaceActivation.workspaceId);
      const reloadedWorkspaceAgent = await inspectActivatedWorkspaceAgent(evaluate);
      const reloadAgentFailure = await evaluate(`(() => {
        const activeSurface = document.querySelector('${ACTIVE_AGENT_SURFACE_SELECTOR}');
        return {
          failureVisible: Boolean(activeSurface?.querySelector('.desktop-agent-failure')),
          alerts: [...(activeSurface?.querySelectorAll('[role="alert"]') ?? [])]
            .map((element) => element.textContent?.trim()).filter(Boolean),
          rawGrantErrorVisible:
            activeSurface?.textContent?.includes('DesktopWorkspaceGrantAuthorityError') === true ||
            activeSurface?.textContent?.includes('workspace-grant:') === true,
        };
      })()`);
      if (
        reloadAgentFailure.failureVisible ||
        reloadAgentFailure.alerts.length > 0 ||
        reloadAgentFailure.rawGrantErrorVisible
      ) {
        throw new Error(
          `Workspace Agent failed to restore after application restart: ${JSON.stringify(reloadAgentFailure)}`,
        );
      }
      const reloadedWorkspaceScreenshot = await captureSettledScreenshot(
        screenshot,
        'workspace-agent-reloaded-after-application-restart',
      );
      checkpoint('workspace-reload-restore', {
        ...reloadedWorkspace,
        ...reloadRestore,
        agent: reloadedWorkspaceAgent,
        agentFailure: reloadAgentFailure,
      });

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
      await click(`${ACTIVE_AGENT_SURFACE_SELECTOR} .agent-composer-workspace-button`, 0);
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
          smallAgent,
          assets,
          extensions,
          projects,
          projectCatalog,
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
          smallAgentScreenshot,
          assetsScreenshot,
          assetPreviewScreenshot,
          extensionsGridScreenshot,
          extensionsListScreenshot,
          extensionsScreenshot,
          projectsScreenshot,
          settingsScreenshot,
          projectCatalogScreenshot,
          workspaceScreenshot,
          workspaceMention.screenshot,
          workspacePreviewScreenshot,
          ...displayModes.screenshots,
          smallAssetsScreenshot,
          secondaryWorkspaceScreenshot,
          firstWorkspaceRestoreScreenshot,
          reloadedWorkspaceScreenshot,
          assistantRestoreScreenshot,
        ],
      };
    } finally {
      await providerServer.close();
    }
  },
});

export const desktopAgentEntryWorkspaceSkillScenario = Object.freeze({
  id: 'desktop-agent-entry-workspace-skill',
  owner: '@neko/agent-runtime',
  prepare: desktopWorkbenchScenesScenario.prepare,
  async run({
    checkpoint,
    click,
    evaluate,
    prepared,
    pressKey,
    screenshot,
    type,
    waitForSelector,
  }) {
    const providerServer = await startFunctionalProviderServer(prepared.providerPort, 750);
    try {
      await resizeWindow(evaluate, 1440, 960);
      await waitForSelector(
        `.desktop-scene-workbench--agent-only ${ACTIVE_AGENT_TEXTAREA_SELECTOR}`,
      );
      await assertFixtureWorkspaceCancellation(evaluate);
      const workspaceActivation = await chooseFixtureWorkspace(evaluate);
      await waitForSelector('.desktop-scene-workbench--workspace');

      await clickApplicationNavigation(evaluate, click, 0);
      await waitForSelector(
        `.desktop-scene-workbench--agent-only ${ACTIVE_AGENT_TEXTAREA_SELECTOR}`,
      );
      const entryDraft = await inspectEntryDraft(evaluate, [workspaceActivation.draftId]);
      const entryRoot = await markEntryAgentRoot(evaluate, entryDraft.draftId);
      const entryTriggerControls = await inspectEntryTriggerControls(evaluate);
      checkpoint('agent-entry-typed-trigger-controls', entryTriggerControls);

      const slashMenu = await openEntrySlashMenu({ evaluate, screenshot, type });
      checkpoint('agent-entry-unbound-slash-menu', slashMenu.selection);
      await pressKey('Escape');
      await waitForCondition(
        evaluate,
        `!document.querySelector(
          '${ACTIVE_AGENT_SURFACE_SELECTOR} .agent-composer-command-menu',
        )`,
        'Entry slash menu did not close after Escape.',
      );

      const unboundMention = await inspectUnboundEntryMention({
        evaluate,
        pressKey,
        screenshot,
        type,
      });
      checkpoint('agent-entry-unbound-mention', unboundMention.selection);
      await pressKey('Escape');
      await waitForCondition(
        evaluate,
        `!document.querySelector(
          '${ACTIVE_AGENT_SURFACE_SELECTOR} .agent-composer-mention-menu',
        )`,
        'Unbound Entry mention menu did not close after Escape.',
      );
      const preservedDraftText = 'Keep this Draft text while selecting a Workspace.';
      await replaceActiveAgentComposerText({ evaluate, pressKey, type }, preservedDraftText);

      await click(`${ACTIVE_AGENT_SURFACE_SELECTOR} .agent-composer-workspace-button`, 0);
      await waitForSelector(`${ACTIVE_AGENT_SURFACE_SELECTOR} .agent-composer-workspace-menu`);
      const targetMenu = await inspectEntryWorkspaceTargetMenu(
        evaluate,
        workspaceActivation.projectId,
      );
      const targetMenuScreenshot = await screenshot('agent-entry-workspace-target-menu');
      checkpoint('agent-entry-workspace-target-menu', {
        entryDraft,
        entryRoot,
        workspaceActivation,
        targetMenu,
      });

      await click(
        `${ACTIVE_AGENT_SURFACE_SELECTOR} .agent-composer-workspace-menu [role="menuitem"]`,
        targetMenu.projectMenuIndex,
      );
      await waitForCondition(
        evaluate,
        `(() => [...document.querySelectorAll(
          '${ACTIVE_AGENT_SURFACE_SELECTOR} .agent-composer-workspace-button',
        )].some((button) => button.textContent?.trim() === ${JSON.stringify(targetMenu.projectLabel)}))()`,
        'Entry composer did not retain the selected exact Workspace target.',
      );
      const boundDraft = await inspectBoundEntryDraft(evaluate, {
        draftId: entryDraft.draftId,
        inputValue: preservedDraftText,
        projectLabel: targetMenu.projectLabel,
        workspaceId: workspaceActivation.workspaceId,
      });
      checkpoint('agent-entry-workspace-bound-draft', boundDraft);

      const workspaceMention = await exerciseWorkspaceDraftMention({
        evaluate,
        pressKey,
        referenceLabel: 'test.fountain',
        referenceQuery: 'test',
        expectedReferenceKind: 'file',
        screenshot,
        type,
        screenshotLabel: 'agent-entry-workspace-mention-selected',
      });
      checkpoint('agent-entry-workspace-mention-selected', workspaceMention.selection);

      const skillMenu = await openStoryboardSkillMenu({ evaluate, screenshot, type });
      checkpoint('agent-entry-workspace-skill-menu', skillMenu.selection);
      await click(
        `${ACTIVE_AGENT_SURFACE_SELECTOR} .agent-composer-command-menu [role="menuitem"]`,
        skillMenu.selection.menuIndex,
      );
      const skillArguments = '请根据所选参考创建一份简洁的分镜。';
      await type(ACTIVE_AGENT_TEXTAREA_SELECTOR, skillArguments, 0, { clear: false });
      const submittedInput = `$storyboard ${skillArguments}`;
      const expectedConversationTitle = submittedInput;
      await waitForCondition(
        evaluate,
        `document.querySelector('${ACTIVE_AGENT_TEXTAREA_SELECTOR}')?.value === ${JSON.stringify(submittedInput)}`,
        'Storyboard Skill selection did not preserve typed invocation text and arguments.',
      );
      await waitForCondition(
        evaluate,
        `(() => {
          const send = document.querySelector('${ACTIVE_AGENT_SEND_SELECTOR}');
          return send instanceof HTMLButtonElement && !send.disabled;
        })()`,
        'Workspace-bound Entry Draft did not enable first submit.',
      );
      await click(ACTIVE_AGENT_SEND_SELECTOR);

      let workspaceSession;
      try {
        workspaceSession = await waitForWorkspaceSession(evaluate, {
          workspaceId: workspaceActivation.workspaceId,
          workspaceGrantId: boundDraft.workspaceGrantId,
          submittedInput,
          expectedConversationTitle,
          expectedReferenceLabel: 'test.fountain',
        });
      } catch (error) {
        const failureState = await evaluate(`(async () => {
          const projection = await window.openNekoDesktop.shell.getSnapshot();
          const activeSurface = document.querySelector('${ACTIVE_AGENT_SURFACE_SELECTOR}');
          return {
            scene: projection.window.workbench.scene.context,
            conversations: projection.agentHome.conversations,
            transcript: (activeSurface?.textContent ?? '').slice(0, 2400),
            alerts: [...document.querySelectorAll('[role="alert"]')]
              .map((element) => element.textContent?.trim() ?? '')
              .filter(Boolean),
          };
        })()`);
        throw new Error(
          `${error instanceof Error ? error.message : String(error)} Provider evidence: ${JSON.stringify(providerServer.snapshot())}. Failure state: ${JSON.stringify(failureState)}`,
        );
      }
      const providerEvidence = providerServer.snapshot();
      assertFunctionalProviderEvidence(providerEvidence, 1);
      if (providerEvidence.requests.length !== 1) {
        throw new Error(
          `Workspace $storyboard first submit issued duplicate provider requests: ${JSON.stringify(providerEvidence)}`,
        );
      }
      if (providerEvidence.requests[0]?.nativeImageCount !== 0) {
        throw new Error(
          `Workspace Fountain first submit unexpectedly sent a native image part: ${JSON.stringify(providerEvidence)}`,
        );
      }
      const completedScreenshot = await captureSettledScreenshot(
        screenshot,
        'agent-workspace-skill-session-complete',
      );
      checkpoint('agent-workspace-skill-session-complete', {
        workspaceSession,
        provider: providerEvidence,
      });

      return {
        entryDraft,
        entryRoot,
        entryTriggerControls,
        slashSelection: slashMenu.selection,
        unboundMentionSelection: unboundMention.selection,
        workspaceActivation,
        targetMenu,
        boundDraft,
        mentionSelection: workspaceMention.selection,
        skillSelection: skillMenu.selection,
        workspaceSession,
        provider: providerEvidence,
        screenshots: [
          slashMenu.screenshot,
          unboundMention.screenshot,
          targetMenuScreenshot,
          workspaceMention.screenshot,
          skillMenu.screenshot,
          completedScreenshot,
        ],
      };
    } finally {
      await providerServer.close();
    }
  },
});

export const desktopAgentLinkedMediaMentionScenario = Object.freeze({
  id: 'desktop-agent-linked-media-mention',
  owner: '@neko/agent-runtime',
  async prepare(context) {
    const prepared = await desktopWorkbenchScenesScenario.prepare(context);
    const linkedMediaTarget = join(context.fixtureHome, 'linked-media-reference');
    const linkedMediaDirectory = join(prepared.workspacePath, 'neko', 'assets');
    await Promise.all([
      mkdir(linkedMediaTarget, { recursive: true }),
      mkdir(linkedMediaDirectory, { recursive: true }),
    ]);
    await copyFile(
      join(context.repositoryRoot, 'docs/assets/openneko-desktop.png'),
      join(linkedMediaTarget, 'library-image.png'),
    );
    await symlink(
      linkedMediaTarget,
      join(linkedMediaDirectory, 'Reference'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    return prepared;
  },
  async run({ checkpoint, evaluate, prepared, pressKey, screenshot, type, waitForSelector }) {
    const providerServer = await startFunctionalProviderServer(prepared.providerPort, 750);
    try {
      await resizeWindow(evaluate, 1440, 960);
      await waitForSelector(
        `.desktop-scene-workbench--agent-only ${ACTIVE_AGENT_TEXTAREA_SELECTOR}`,
      );
      const entryDraft = await inspectEntryDraft(evaluate);
      const entryRoot = await markEntryAgentRoot(evaluate, entryDraft.draftId);
      await assertFixtureWorkspaceCancellation(evaluate);
      const workspaceActivation = await chooseFixtureWorkspace(evaluate);
      await waitForSelector('.desktop-scene-workbench--workspace');
      const workspaceAgent = await inspectActivatedWorkspaceAgent(evaluate);

      const mention = await exerciseWorkspaceDraftMention({
        evaluate,
        pressKey,
        referenceLabel: 'library-image.png',
        referenceQuery: 'library-image',
        expectedPortablePath: 'neko/assets/Reference/library-image.png',
        expectedSourceLabels: ['Media', '媒体'],
        forbiddenText: 'linked-media-reference',
        screenshot,
        type,
        screenshotLabel: 'workspace-linked-media-mention-selected',
      });
      checkpoint('workspace-linked-media-mention-selected', {
        entryDraft,
        entryRoot,
        workspaceActivation,
        workspaceAgent,
        mention: mention.selection,
      });

      const submittedInput = '请描述已选择的媒体库图片。';
      await type(ACTIVE_AGENT_TEXTAREA_SELECTOR, submittedInput);
      await waitForCondition(
        evaluate,
        `(() => {
          const send = document.querySelector('${ACTIVE_AGENT_SEND_SELECTOR}');
          return send instanceof HTMLButtonElement && !send.disabled;
        })()`,
        'Workspace linked Media Library reference did not enable first submit.',
      );
      await evaluate(`(() => {
        const activeSurface = document.querySelector('${ACTIVE_AGENT_SURFACE_SELECTOR}');
        const exposed = [
          activeSurface?.textContent ?? '',
          ...[...(activeSurface?.querySelectorAll('[title]') ?? [])]
            .map((element) => element.getAttribute('title') ?? ''),
        ].some((value) => value.includes('linked-media-reference'));
        if (exposed) {
          throw new Error('Workspace mention UI exposed the linked Media Library target path.');
        }
        return true;
      })()`);
      await evaluate(`(() => {
        const send = document.querySelector('${ACTIVE_AGENT_SEND_SELECTOR}');
        if (!(send instanceof HTMLButtonElement)) {
          throw new Error('Workspace linked Media Library send control is unavailable.');
        }
        send.click();
        return true;
      })()`);

      const workspaceSession = await waitForWorkspaceSession(evaluate, {
        workspaceId: workspaceActivation.workspaceId,
        workspaceGrantId: workspaceActivation.workspaceGrantId,
        submittedInput,
        expectedConversationTitle: submittedInput,
        expectedReferenceLabel: 'library-image.png',
      });
      const providerEvidence = providerServer.snapshot();
      assertFunctionalProviderEvidence(providerEvidence, 1);
      if (
        providerEvidence.requests.length !== 1 ||
        providerEvidence.requests[0]?.nativeImageCount !== 1
      ) {
        throw new Error(
          `Linked Media Library first submit did not produce one exact native image request: ${JSON.stringify(providerEvidence)}`,
        );
      }
      const completedScreenshot = await captureSettledScreenshot(
        screenshot,
        'workspace-linked-media-session-complete',
      );
      checkpoint('workspace-linked-media-session-complete', {
        workspaceSession,
        provider: providerEvidence,
      });
      return {
        entryDraft,
        entryRoot,
        workspaceActivation,
        workspaceAgent,
        mentionSelection: mention.selection,
        workspaceSession,
        provider: providerEvidence,
        screenshots: [mention.screenshot, completedScreenshot],
      };
    } finally {
      await providerServer.close();
    }
  },
});

export const desktopAgentWorkspaceRestartScenario = Object.freeze({
  id: 'desktop-agent-workspace-restart',
  owner: '@neko/agent-runtime',
  prepare: desktopWorkbenchScenesScenario.prepare,
  async run({
    checkpoint,
    evaluate,
    restartApplication,
    screenshot,
    waitForDesktopBridge,
    waitForSelector,
  }) {
    await resizeWindow(evaluate, 1200, 800);
    await waitForSelector(`.desktop-scene-workbench--agent-only ${ACTIVE_AGENT_TEXTAREA_SELECTOR}`);
    const cancellation = await assertFixtureWorkspaceCancellation(evaluate);
    const activation = await chooseFixtureWorkspace(evaluate);
    await waitForSelector('.desktop-scene-workbench--workspace');
    await waitForSelector(`${ACTIVE_AGENT_SURFACE_SELECTOR} .agent-composer-shell`);
    const beforeRestart = await inspectActivatedWorkspaceAgent(evaluate);
    const beforeScreenshot = await captureSettledScreenshot(
      screenshot,
      'workspace-agent-before-application-restart',
    );

    await restartApplication();
    await waitForDesktopBridge(60_000);
    await waitForSelector('.desktop-scene-workbench--workspace');
    await waitForSelector(`${ACTIVE_AGENT_SURFACE_SELECTOR} .agent-composer-shell`);
    const exactWorkspace = await inspectExactWorkspace(evaluate, activation.workspaceId);
    const afterRestart = await inspectActivatedWorkspaceAgent(evaluate);
    const composer = await inspectComposerPresentation(evaluate);
    assertWorkspaceComposer(composer, 'workspace');
    if (!composer.toolbarFitsSurface) {
      throw new Error('Restored Workspace Agent composer overflowed its narrow Surface.');
    }
    const failure = await evaluate(`(() => {
      const activeSurface = document.querySelector('${ACTIVE_AGENT_SURFACE_SELECTOR}');
      return {
        failureVisible: Boolean(activeSurface?.querySelector('.desktop-agent-failure')),
        alerts: [...(activeSurface?.querySelectorAll('[role="alert"]') ?? [])]
          .map((element) => element.textContent?.trim()).filter(Boolean),
        rawGrantErrorVisible:
          activeSurface?.textContent?.includes('DesktopWorkspaceGrantAuthorityError') === true ||
          activeSurface?.textContent?.includes('workspace-grant:') === true,
      };
    })()`);
    if (failure.failureVisible || failure.alerts.length > 0 || failure.rawGrantErrorVisible) {
      throw new Error(
        `Workspace Agent failed to restore after application restart: ${JSON.stringify(failure)}`,
      );
    }
    const afterScreenshot = await captureSettledScreenshot(
      screenshot,
      'workspace-agent-after-application-restart',
    );
    const evidence = {
      activation,
      cancellation,
      beforeRestart,
      afterRestart,
      exactWorkspace,
      composer,
      failure,
    };
    checkpoint('workspace-agent-application-restart', evidence);
    return { ...evidence, screenshots: [beforeScreenshot, afterScreenshot] };
  },
});

export const desktopAgentWorkspaceRestartUnavailableScenario = Object.freeze({
  id: 'desktop-agent-workspace-restart-unavailable',
  owner: '@neko/agent-runtime',
  prepare: desktopWorkbenchScenesScenario.prepare,
  async run({
    checkpoint,
    evaluate,
    prepared,
    restartApplication,
    screenshot,
    waitForDesktopBridge,
    waitForSelector,
  }) {
    await resizeWindow(evaluate, 1200, 800);
    await waitForSelector(`.desktop-scene-workbench--agent-only ${ACTIVE_AGENT_TEXTAREA_SELECTOR}`);
    const cancellation = await assertFixtureWorkspaceCancellation(evaluate);
    const activation = await chooseFixtureWorkspace(evaluate);
    await waitForSelector('.desktop-scene-workbench--workspace');
    await waitForSelector(`${ACTIVE_AGENT_SURFACE_SELECTOR} .agent-composer-shell`);
    await inspectActivatedWorkspaceAgent(evaluate);

    const unavailableWorkspacePath = `${prepared.workspacePath}-unavailable`;
    await rename(prepared.workspacePath, unavailableWorkspacePath);
    await restartApplication();
    await waitForDesktopBridge(60_000);
    await waitForSelector('.desktop-scene-workbench--workspace');
    await waitForSelector(`${ACTIVE_AGENT_SURFACE_SELECTOR} .desktop-agent-failure`);
    const failure = await evaluate(`(() => {
      const shell = document.querySelector('[data-neko-controlled-workbench="true"]');
      const activeSurface = document.querySelector('${ACTIVE_AGENT_SURFACE_SELECTOR}');
      const alert = activeSurface?.querySelector('.desktop-agent-failure[role="alert"]');
      const retry = alert?.querySelector('.desktop-agent-failure__retry');
      const text = alert?.textContent?.trim() ?? '';
      return {
        shellVisible: shell instanceof HTMLElement && shell.getBoundingClientRect().width > 0,
        workspaceMainVisible: Boolean(document.querySelector('[data-main-view-id]')),
        resourcesVisible: Boolean(document.querySelector('[data-dock-owner="resources"]')),
        failureVisible: alert instanceof HTMLElement && alert.getBoundingClientRect().width > 0,
        retryVisible: retry instanceof HTMLButtonElement && retry.getBoundingClientRect().width > 0,
        localizedTitle: text.includes('Agent 暂不可用') || text.includes('Agent unavailable'),
        rawGrantErrorVisible:
          text.includes('DesktopWorkspaceGrantAuthorityError') ||
          text.includes('Error invoking remote method') ||
          text.includes('workspace-grant:'),
      };
    })()`);
    if (
      !failure.shellVisible ||
      !failure.workspaceMainVisible ||
      !failure.resourcesVisible ||
      !failure.failureVisible ||
      !failure.retryVisible ||
      !failure.localizedTitle ||
      failure.rawGrantErrorVisible
    ) {
      throw new Error(
        `Workspace Agent restart failure was not contained locally: ${JSON.stringify(failure)}`,
      );
    }
    const failureScreenshot = await captureSettledScreenshot(
      screenshot,
      'workspace-agent-unavailable-after-application-restart',
    );
    const evidence = { activation, cancellation, failure };
    checkpoint('workspace-agent-application-restart-unavailable', evidence);
    return { ...evidence, screenshots: [failureScreenshot] };
  },
});

export const desktopWorkspaceResizeScenario = Object.freeze({
  id: 'desktop-workspace-resize',
  owner: '@neko/app-desktop',
  prepare: desktopWorkbenchScenesScenario.prepare,
  async run({ checkpoint, click, drag, evaluate, pressKey, screenshot, type, waitForSelector }) {
    await resizeWindow(evaluate, 1440, 960);
    await waitForSelector(`.desktop-scene-workbench--agent-only ${ACTIVE_AGENT_TEXTAREA_SELECTOR}`);
    await assertFixtureWorkspaceCancellation(evaluate);
    const workspaceActivation = await chooseFixtureWorkspace(evaluate);
    await waitForSelector('.desktop-scene-workbench--workspace');
    await waitForSelector('[data-dock-owner="resources"]');
    const workspace = await inspectWorkbench(evaluate, 'workspace', 'workspace');
    assertSingleWorkbench(workspace);
    assertWorkspaceTopControls(workspace);
    const workspaceMention = await exerciseWorkspaceDraftMention({
      evaluate,
      pressKey,
      screenshot,
      type,
      screenshotLabel: 'workspace-resize-draft-mention',
    });
    const workspaceDockResize = await exerciseWorkspaceDockResize(
      evaluate,
      drag,
      workspaceActivation.workspaceId,
    );
    const shellChrome = await inspectWorkspaceShellChrome(evaluate);
    assertWorkspaceShellChrome(shellChrome);
    const panelHeaderAlignment = await inspectWorkspacePanelHeaderAlignment(evaluate);
    assertWorkspacePanelHeaderAlignment(panelHeaderAlignment);
    const workspaceScreenshot = await screenshot('workspace-resized-shell-chrome');
    const displayModes = await exerciseWorkspaceDisplayModes(evaluate, click, screenshot);
    const cutTabs = await exerciseCutTabAdd(evaluate, click, pressKey, screenshot);
    const evidence = {
      workspaceActivation,
      workspaceDockResize,
      shellChrome,
      panelHeaderAlignment,
      displayModes: displayModes.states,
      cutTabs: cutTabs.states,
      workspaceMentionSelection: workspaceMention.selection,
    };
    checkpoint('workspace-resized-shell-chrome', evidence);
    return {
      ...evidence,
      screenshots: [
        workspaceMention.screenshot,
        workspaceScreenshot,
        ...displayModes.screenshots,
        ...cutTabs.screenshots,
      ],
    };
  },
});

export const desktopProjectSidebarManagementScenario = Object.freeze({
  id: 'desktop-project-sidebar-management',
  owner: '@neko/app-desktop',
  async prepare(context) {
    const prepared = await desktopWorkbenchScenesScenario.prepare(context);
    await Promise.all([
      mkdir(join(prepared.workspacePath, 'neko'), { recursive: true }),
      mkdir(join(prepared.secondaryWorkspacePath, 'neko'), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(
        join(prepared.workspacePath, 'neko', 'project.json'),
        `${JSON.stringify({ workspaceId: PROJECT_SIDEBAR_WORKSPACE_ID }, null, 2)}\n`,
        'utf8',
      ),
      writeFile(
        join(prepared.secondaryWorkspacePath, 'neko', 'project.json'),
        `${JSON.stringify({ workspaceId: PROJECT_SIDEBAR_CLEANUP_WORKSPACE_ID }, null, 2)}\n`,
        'utf8',
      ),
    ]);
    const sqlite = await import('node:sqlite');
    const database = new sqlite.DatabaseSync(join(context.fixtureHome, '.neko', 'neko.db'));
    try {
      database.exec(`
        CREATE TABLE pi_conversations (
          workspace_id TEXT NOT NULL,
          conversation_id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          active_branch_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      const insertConversation = database.prepare(
        `INSERT INTO pi_conversations (
           workspace_id, conversation_id, title, active_branch_id, created_at, updated_at
         ) VALUES (?, ?, ?, 'branch-main', ?, ?)`,
      );
      insertConversation.run(
        PROJECT_SIDEBAR_WORKSPACE_ID,
        PROJECT_SIDEBAR_CONVERSATION_ID,
        'Project sidebar retained history',
        '2026-08-07T00:00:00.000Z',
        '2026-08-07T00:00:00.000Z',
      );
      insertConversation.run(
        PROJECT_SIDEBAR_CLEANUP_WORKSPACE_ID,
        PROJECT_SIDEBAR_CLEANUP_CONVERSATION_ID,
        'Project sidebar cleanup history',
        '2026-08-07T00:01:00.000Z',
        '2026-08-07T00:01:00.000Z',
      );
    } finally {
      database.close();
    }
    return prepared;
  },
  async run({
    cdp,
    checkpoint,
    click,
    evaluate,
    hover,
    prepared,
    pressKey,
    screenshot,
    waitForSelector,
  }) {
    await resizeWindow(evaluate, 1200, 800);
    await waitForSelector(`.desktop-scene-workbench--agent-only ${ACTIVE_AGENT_TEXTAREA_SELECTOR}`);
    const cancellation = await assertFixtureWorkspaceCancellation(evaluate);
    const retentionActivation = await chooseFixtureWorkspaceWithHistory(
      evaluate,
      PROJECT_SIDEBAR_WORKSPACE_ID,
      PROJECT_SIDEBAR_CONVERSATION_ID,
    );
    const cleanupActivation = await chooseFixtureWorkspaceWithHistory(
      evaluate,
      PROJECT_SIDEBAR_CLEANUP_WORKSPACE_ID,
      PROJECT_SIDEBAR_CLEANUP_CONVERSATION_ID,
    );
    await waitForSelector('.desktop-scene-workbench--workspace');
    await inspectActivatedWorkspaceAgent(evaluate);
    const management = await exerciseProjectConversationGroups({
      cdp,
      click,
      cleanup: {
        ...cleanupActivation,
        conversationId: PROJECT_SIDEBAR_CLEANUP_CONVERSATION_ID,
      },
      evaluate,
      hover,
      pressKey,
      retention: {
        ...retentionActivation,
        conversationId: PROJECT_SIDEBAR_CONVERSATION_ID,
      },
      screenshot,
    });
    await Promise.all([
      access(join(prepared.workspacePath, 'preview.png')),
      access(join(prepared.secondaryWorkspacePath, 'secondary-preview.png')),
    ]);
    const evidence = {
      activations: { cleanup: cleanupActivation, retention: retentionActivation },
      cancellation,
      management,
      projectFilesRetained: true,
    };
    checkpoint('project-sidebar-management', evidence);
    return {
      ...evidence,
      screenshots: management.screenshots,
    };
  },
});

export const desktopConversationNavigationScenario = Object.freeze({
  id: 'desktop-conversation-navigation',
  owner: '@neko/app-desktop',
  prepare: desktopWorkbenchScenesScenario.prepare,
  async run({ checkpoint, click, evaluate, prepared, screenshot, type, waitForSelector }) {
    const providerServer = await startFunctionalProviderServer(prepared.providerPort, 750);
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
      await waitForSelector('.home-conversation-status.is-running');
      const runningStatus = await evaluate(`(() => {
        const status = document.querySelector('.home-conversation-status.is-running');
        const row = status?.closest('.primary-recent-conversation-row');
        const rectangle = status?.getBoundingClientRect();
        return {
          visible: status instanceof HTMLElement && rectangle !== undefined &&
            rectangle.width > 0 && rectangle.height > 0,
          label: status?.getAttribute('aria-label') ?? '',
          inlineText: status?.textContent?.trim() ?? '',
          iconVisible: status?.querySelector('svg') instanceof SVGElement,
          conversationTitle: row?.querySelector('.home-conversation-link')?.textContent?.trim() ?? '',
          active: row?.getAttribute('data-active'),
        };
      })()`);
      if (
        !runningStatus.visible ||
        !['Running', '运行中'].includes(runningStatus.label) ||
        runningStatus.inlineText !== '' ||
        !runningStatus.iconVisible ||
        runningStatus.conversationTitle.length === 0
      ) {
        throw new Error(
          `Conversation running status was not visible in PrimarySidebar: ${JSON.stringify(runningStatus)}`,
        );
      }
      const runningStatusScreenshot = await screenshot('assistant-conversation-running-status');
      checkpoint('assistant-conversation-running-status', runningStatus);
      const initialSession = await waitForAssistantSession(evaluate);
      assertAssistantConversationNavigation(initialSession);
      if (initialSession.conversationCount !== initialDraft.conversationCount + 1) {
        throw new Error('Conversation navigation fixture did not create one initial session.');
      }
      const sessionComposer = await inspectAgentSessionControls(evaluate);
      assertAgentSessionControls(sessionComposer);
      const sessionComposerScreenshot = await screenshot('assistant-session-composer-compact');
      checkpoint('assistant-session-composer-controls', sessionComposer);

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
        runningStatus,
        screenshots: [runningStatusScreenshot, sessionComposerScreenshot, restoredScreenshot],
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

async function exerciseProjectConversationGroups({
  cdp,
  cleanup,
  click,
  evaluate,
  hover,
  pressKey,
  retention,
  screenshot,
}) {
  const retentionGroupSelector = `.primary-conversation-group[data-group-id=${JSON.stringify(
    `project:${retention.projectId}`,
  )}]`;
  const cleanupGroupSelector = `.primary-conversation-group[data-group-id=${JSON.stringify(
    `project:${cleanup.projectId}`,
  )}]`;
  await waitForCondition(
    evaluate,
    `(async () => {
      const projection = await window.openNekoDesktop.shell.getSnapshot();
      const retentionGroup = projection.conversationNavigation.groups.find(
        (candidate) => candidate.kind === 'project' &&
          candidate.projectId === ${JSON.stringify(retention.projectId)},
      );
      const cleanupGroup = projection.conversationNavigation.groups.find(
        (candidate) => candidate.kind === 'project' &&
          candidate.projectId === ${JSON.stringify(cleanup.projectId)},
      );
      const retentionRoot = document.querySelector(${JSON.stringify(retentionGroupSelector)});
      const cleanupRoot = document.querySelector(${JSON.stringify(cleanupGroupSelector)});
      return retentionGroup?.conversations.length === 1 &&
        retentionGroup.conversations[0]?.navigation.conversationId === ${JSON.stringify(retention.conversationId)} &&
        cleanupGroup?.conversations.length === 1 &&
        cleanupGroup.conversations[0]?.navigation.conversationId === ${JSON.stringify(cleanup.conversationId)} &&
        retentionRoot?.querySelectorAll('.primary-recent-conversation-row').length === 1 &&
        cleanupRoot?.querySelectorAll('.primary-recent-conversation-row').length === 1;
    })()`,
    'Persisted Project conversations did not render in their exact sidebar groups.',
  );
  const initial = await evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    const groupProjection = projection.conversationNavigation.groups.find(
      (candidate) => candidate.kind === 'project' &&
        candidate.projectId === ${JSON.stringify(retention.projectId)},
    );
    const group = document.querySelector(${JSON.stringify(retentionGroupSelector)});
    const header = group?.querySelector('.primary-conversation-group__header');
    const collapse = header?.querySelector('.primary-conversation-group__collapse');
    const open = header?.querySelector('.primary-conversation-group__project-link');
    const count = header?.querySelector('.primary-conversation-group__count');
    const actions = header?.querySelector(':scope > .primary-navigation-row-actions');
    const create = actions?.querySelector('button:nth-child(1)');
    const cleanupButton = actions?.querySelector('button:nth-child(2)');
    const removalButton = actions?.querySelector('button:nth-child(3)');
    const conversationActions = group?.querySelector(
      '.primary-recent-conversation-row > .primary-navigation-row-actions',
    );
    const projectIdentityIcon = header?.querySelector(
      '.primary-conversation-group__identity-icon.is-project',
    );
    const conversationIdentityIcon = group?.querySelector(
      '.primary-recent-conversation-row .primary-conversation-group__identity-icon.is-conversation',
    );
    const conversationStatus = group?.querySelector(
      '.primary-recent-conversation-row > .primary-navigation-state .primary-navigation-unavailable',
    );
    const actionsRect = actions?.getBoundingClientRect();
    const headerRect = header?.getBoundingClientRect();
    return {
      conversationId: groupProjection?.conversations[0]?.navigation.conversationId,
      conversationCount: groupProjection?.conversations.length ?? -1,
      visibleRows: group?.querySelectorAll('.primary-recent-conversation-row').length ?? -1,
      collapseEnabled: collapse instanceof HTMLButtonElement && !collapse.disabled,
      openEnabled: open instanceof HTMLButtonElement && !open.disabled,
      createEnabled: create instanceof HTMLButtonElement && !create.disabled,
      cleanupEnabled: cleanupButton instanceof HTMLButtonElement && !cleanupButton.disabled,
      removalEnabled: removalButton instanceof HTMLButtonElement && !removalButton.disabled,
      projectActionCount: actions?.querySelectorAll('button').length ?? -1,
      conversationActionCount: conversationActions?.querySelectorAll('button').length ?? -1,
      projectActionsHidden: actions instanceof HTMLElement && getComputedStyle(actions).opacity === '0',
      conversationActionsHidden:
        conversationActions instanceof HTMLElement && getComputedStyle(conversationActions).opacity === '0',
      projectIdentityIcon:
        projectIdentityIcon instanceof SVGElement &&
        projectIdentityIcon.getAttribute('width') === '15' &&
        projectIdentityIcon.getAttribute('height') === '15',
      conversationIdentityIcon:
        conversationIdentityIcon instanceof SVGElement &&
        conversationIdentityIcon.getAttribute('width') === '13' &&
        conversationIdentityIcon.getAttribute('height') === '13',
      conversationUnavailableTrailing: conversationStatus instanceof HTMLElement,
      countText: count?.textContent?.trim() ?? '',
      actionLayerWithinRow:
        actionsRect !== undefined &&
        headerRect !== undefined &&
        actionsRect.left >= headerRect.left &&
        actionsRect.right <= headerRect.right,
    };
  })()`);
  if (
    typeof initial.conversationId !== 'string' ||
    initial.conversationCount !== 1 ||
    initial.visibleRows !== 1 ||
    !initial.collapseEnabled ||
    !initial.openEnabled ||
    !initial.createEnabled ||
    !initial.cleanupEnabled ||
    !initial.removalEnabled ||
    initial.projectActionCount !== 3 ||
    initial.conversationActionCount !== 1 ||
    !initial.projectActionsHidden ||
    !initial.conversationActionsHidden ||
    !initial.projectIdentityIcon ||
    !initial.conversationIdentityIcon ||
    !initial.conversationUnavailableTrailing ||
    initial.countText !== '1' ||
    !initial.actionLayerWithinRow
  ) {
    throw new Error(`Project sidebar controls are incorrect: ${JSON.stringify(initial)}`);
  }

  await hover(`${retentionGroupSelector} .primary-conversation-group__project-link`);
  await waitForCondition(
    evaluate,
    `getComputedStyle(document.querySelector(${JSON.stringify(
      `${retentionGroupSelector} .primary-conversation-group__header > .primary-navigation-row-actions`,
    )})).opacity === '1'`,
    'Project row actions did not appear on hover.',
  );
  const projectHoverActions = await inspectSidebarRowActions(
    evaluate,
    `${retentionGroupSelector} .primary-conversation-group__header`,
  );
  if (
    projectHoverActions.visibleActionCount !== 3 ||
    projectHoverActions.countOpacity !== '0' ||
    !projectHoverActions.contentClearOfActions ||
    !projectHoverActions.withinRow
  ) {
    throw new Error(`Project hover actions are incorrect: ${JSON.stringify(projectHoverActions)}`);
  }
  const projectHoverScreenshot = await captureSettledScreenshot(
    screenshot,
    'project-sidebar-project-actions-hover',
  );

  const retentionConversationSelector = `${retentionGroupSelector} .primary-recent-conversation-row`;
  await hover(`${retentionConversationSelector} .home-conversation-link`);
  await waitForCondition(
    evaluate,
    `getComputedStyle(document.querySelector(${JSON.stringify(
      `${retentionConversationSelector} > .primary-navigation-row-actions`,
    )})).opacity === '1'`,
    'Conversation row actions did not appear on hover.',
  );
  const conversationHoverActions = await inspectSidebarRowActions(
    evaluate,
    retentionConversationSelector,
  );
  if (
    conversationHoverActions.visibleActionCount !== 1 ||
    conversationHoverActions.statusOpacity !== '0' ||
    !conversationHoverActions.withinRow
  ) {
    throw new Error(
      `Conversation hover actions are incorrect: ${JSON.stringify(conversationHoverActions)}`,
    );
  }
  const conversationHoverScreenshot = await captureSettledScreenshot(
    screenshot,
    'project-sidebar-conversation-actions-hover',
  );

  await evaluate(`(() => {
    const link = document.querySelector(${JSON.stringify(
      `${retentionGroupSelector} .primary-conversation-group__project-link`,
    )});
    if (!(link instanceof HTMLButtonElement)) {
      throw new Error('Project link is unavailable for keyboard action validation.');
    }
    link.focus();
  })()`);
  await pressKey('Tab');
  await waitForCondition(
    evaluate,
    `getComputedStyle(document.querySelector(${JSON.stringify(
      `${retentionGroupSelector} .primary-conversation-group__header > .primary-navigation-row-actions`,
    )})).opacity === '1'`,
    'Project row actions did not appear for keyboard focus.',
  );
  const keyboardActions = await inspectSidebarRowActions(
    evaluate,
    `${retentionGroupSelector} .primary-conversation-group__header`,
  );
  if (
    keyboardActions.visibleActionCount !== 3 ||
    !keyboardActions.withinRow ||
    keyboardActions.focusedAction.length === 0
  ) {
    throw new Error(`Project keyboard actions are incorrect: ${JSON.stringify(keyboardActions)}`);
  }

  const projectContextMenu = await openSidebarContextMenu({
    cdp,
    evaluate,
    selector: `${retentionGroupSelector} .primary-conversation-group__header`,
  });
  assertProjectContextMenu(projectContextMenu);
  const projectContextMenuScreenshot = await captureSettledScreenshot(
    screenshot,
    'project-sidebar-project-context-menu',
  );
  await evaluate(`(() => {
    const item = [...document.querySelectorAll('[role="menuitem"]')].find((candidate) =>
      /Project portability|项目可移植性/u.test(candidate.textContent ?? ''),
    );
    if (!(item instanceof HTMLElement)) {
      throw new Error('Project portability context command is unavailable.');
    }
    item.click();
    return true;
  })()`);
  await waitForCondition(
    evaluate,
    `(() => {
      const panel = document.querySelector('.project-portability-panel');
      return panel instanceof HTMLElement &&
        panel.dataset.projectPortabilityState !== 'loading';
    })()`,
    'Project portability dialog did not resolve its readiness state.',
  );
  const portabilityDialog = await evaluate(`(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const panel = dialog?.querySelector('.project-portability-panel');
    const projectName = document.querySelector(${JSON.stringify(
      `${retentionGroupSelector} .primary-conversation-group__project-link`,
    )})?.textContent?.trim() ?? '';
    const footerActions = document.querySelectorAll(
      '.home-navigation-footer__actions button',
    );
    const rectangle = dialog?.getBoundingClientRect();
    return {
      dialogVisible: dialog instanceof HTMLElement,
      footerActionCount: footerActions.length,
      projectNameVisible: projectName.length > 0 && (dialog?.textContent?.includes(projectName) ?? false),
      state: panel?.getAttribute('data-project-portability-state') ?? '',
      withinViewport:
        rectangle !== undefined && rectangle.left >= 0 && rectangle.top >= 0 &&
        rectangle.right <= window.innerWidth && rectangle.bottom <= window.innerHeight,
    };
  })()`);
  if (
    !portabilityDialog.dialogVisible ||
    portabilityDialog.footerActionCount !== 1 ||
    !portabilityDialog.projectNameVisible ||
    portabilityDialog.state.length === 0 ||
    !portabilityDialog.withinViewport
  ) {
    throw new Error(
      `Project portability dialog presentation is incomplete: ${JSON.stringify(portabilityDialog)}`,
    );
  }
  const portabilityDialogScreenshot = await captureSettledScreenshot(
    screenshot,
    'project-portability-dialog',
  );
  await click('[role="dialog"] button[aria-label]');
  await waitForCondition(
    evaluate,
    `document.querySelector('[role="dialog"]') === null`,
    'Project portability dialog did not close through its visible close command.',
  );

  const conversationContextMenu = await openSidebarContextMenu({
    cdp,
    evaluate,
    selector: `${retentionGroupSelector} .primary-recent-conversation-row`,
  });
  assertConversationContextMenu(conversationContextMenu);
  const conversationContextMenuScreenshot = await captureSettledScreenshot(
    screenshot,
    'project-sidebar-conversation-context-menu',
  );
  await pressKey('Escape');
  await waitForCondition(
    evaluate,
    `document.querySelector('[role="menu"]') === null`,
    'Conversation context menu did not close with Escape.',
  );

  await click(`${retentionGroupSelector} .primary-conversation-group__collapse`);
  await waitForCondition(
    evaluate,
    `(() => {
      const group = document.querySelector(${JSON.stringify(retentionGroupSelector)});
      const toggle = group?.querySelector('.primary-conversation-group__collapse');
      return toggle?.getAttribute('aria-expanded') === 'false' &&
        group?.querySelectorAll('.primary-recent-conversation-row').length === 0;
    })()`,
    'Project conversation group did not collapse.',
  );
  await click(`${retentionGroupSelector} .primary-conversation-group__collapse`);
  await waitForCondition(
    evaluate,
    `(() => {
      const group = document.querySelector(${JSON.stringify(retentionGroupSelector)});
      const toggle = group?.querySelector('.primary-conversation-group__collapse');
      return toggle?.getAttribute('aria-expanded') === 'true' &&
        group?.querySelectorAll('.primary-recent-conversation-row').length === 1;
    })()`,
    'Project conversation group did not expand.',
  );
  const desktopScreenshot = await captureSettledScreenshot(
    screenshot,
    'project-sidebar-groups-expanded-desktop',
  );

  await resizeWindow(evaluate, 960, 640);
  const compactLayout = await evaluate(`(() => {
    const groups = [
      document.querySelector(${JSON.stringify(retentionGroupSelector)}),
      document.querySelector(${JSON.stringify(cleanupGroupSelector)}),
    ];
    return groups.map((group) => {
      const header = group?.querySelector('.primary-conversation-group__header');
      const buttons = [...(header?.querySelectorAll('button') ?? [])];
      const headerRect = header?.getBoundingClientRect();
      return {
        buttonCount: buttons.length,
        identityIconCount: group?.querySelectorAll(
          '.primary-conversation-group__identity-icon',
        ).length ?? 0,
        fits:
          headerRect !== undefined &&
          buttons.every((button) => {
            const rectangle = button.getBoundingClientRect();
            return rectangle.left >= headerRect.left && rectangle.right <= headerRect.right;
          }),
      };
    });
  })()`);
  if (
    compactLayout.length !== 2 ||
    compactLayout.some(
      (group) => group.buttonCount !== 5 || group.identityIconCount !== 2 || !group.fits,
    )
  ) {
    throw new Error(`Compact Project sidebar controls overflow: ${JSON.stringify(compactLayout)}`);
  }
  const compactScreenshot = await captureSettledScreenshot(
    screenshot,
    'project-sidebar-groups-expanded-compact',
  );
  await click('.home-navigation-footer__actions button:last-child');
  await waitForCondition(
    evaluate,
    `document.querySelector('[data-settings-surface="main"]') instanceof HTMLElement`,
    'Desktop Settings did not open for sidebar theme validation.',
  );
  await evaluate(`(() => {
    const appearance = document.querySelectorAll(
      '.desktop-settings__navigation .home-nav-button',
    )[1];
    if (!(appearance instanceof HTMLButtonElement)) {
      throw new Error('Desktop Appearance settings are unavailable.');
    }
    appearance.click();
    return true;
  })()`);
  await waitForCondition(
    evaluate,
    `document.querySelector('[data-settings-surface="main"] select') instanceof HTMLSelectElement`,
    'Desktop Theme setting did not render.',
  );
  await selectDesktopTheme(evaluate, 'dark');
  const darkTheme = await evaluate(`(() => {
    const group = document.querySelector(${JSON.stringify(retentionGroupSelector)});
    const projectIcon = group?.querySelector(
      '.primary-conversation-group__identity-icon.is-project',
    );
    const conversationIcon = group?.querySelector(
      '.primary-conversation-group__identity-icon.is-conversation',
    );
    return {
      theme: document.documentElement.dataset.nekoTheme,
      projectIconColor:
        projectIcon instanceof SVGElement ? getComputedStyle(projectIcon).color : '',
      conversationIconColor:
        conversationIcon instanceof SVGElement ? getComputedStyle(conversationIcon).color : '',
    };
  })()`);
  if (
    darkTheme.theme !== 'dark' ||
    darkTheme.projectIconColor.length === 0 ||
    darkTheme.conversationIconColor.length === 0
  ) {
    throw new Error(`Dark sidebar icon presentation is incomplete: ${JSON.stringify(darkTheme)}`);
  }
  const darkCompactScreenshot = await captureSettledScreenshot(
    screenshot,
    'project-sidebar-groups-expanded-compact-dark',
  );
  await selectDesktopTheme(evaluate, 'light');
  await resizeWindow(evaluate, 1200, 800);

  await click(`${retentionGroupSelector} .primary-conversation-group__project-link`);
  await waitForProjectDraft(evaluate, retention.projectId, retention.workspaceId, 'Project open');
  await click(`${retentionGroupSelector} .primary-navigation-row-actions button:first-child`);
  await waitForProjectDraft(
    evaluate,
    retention.projectId,
    retention.workspaceId,
    'New conversation',
  );
  await waitForCondition(
    evaluate,
    `(() => {
      const removal = document.querySelector(${JSON.stringify(
        `${retentionGroupSelector} .primary-navigation-row-actions button:last-child`,
      )});
      return removal instanceof HTMLButtonElement && !removal.disabled;
    })()`,
    'Project sidebar removal control did not become interactive after draft transition.',
  );

  const removalCancellation = await evaluate(`(async () => {
    globalThis.confirm = () => false;
    const group = document.querySelector(${JSON.stringify(retentionGroupSelector)});
    const removal = group?.querySelector(
      '.primary-navigation-row-actions button:last-child',
    );
    if (!(removal instanceof HTMLButtonElement) || removal.disabled) {
      throw new Error('Project sidebar removal control is unavailable.');
    }
    removal.click();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    return {
      projectPresent: projection.catalog.projects.some(
        (project) => project.projectId === ${JSON.stringify(retention.projectId)},
      ),
      conversationPresent: projection.agentHome.conversations.some(
        (conversation) =>
          conversation.navigation.conversationId === ${JSON.stringify(retention.conversationId)},
      ),
    };
  })()`);
  if (!removalCancellation.projectPresent || !removalCancellation.conversationPresent) {
    throw new Error('Cancelled Project removal changed Project or conversation state.');
  }

  await evaluate(`(() => {
    globalThis.confirm = () => true;
    const removal = document.querySelector(${JSON.stringify(
      `${retentionGroupSelector} .primary-navigation-row-actions button:last-child`,
    )});
    if (!(removal instanceof HTMLButtonElement) || removal.disabled) {
      throw new Error('Project sidebar removal control is unavailable.');
    }
    removal.click();
    return true;
  })()`);
  await waitForCondition(
    evaluate,
    `(async () => {
      const projection = await window.openNekoDesktop.shell.getSnapshot();
      return !projection.catalog.projects.some(
        (project) => project.projectId === ${JSON.stringify(retention.projectId)},
      ) && projection.agentHome.conversations.some(
        (conversation) =>
          conversation.navigation.conversationId === ${JSON.stringify(retention.conversationId)},
      ) && !projection.conversationNavigation.groups.some(
        (group) => group.kind === 'project' && group.projectId === ${JSON.stringify(retention.projectId)},
      ) && projection.conversationNavigation.groups.some(
        (group) => group.kind === 'workspace' &&
          group.workspaceId === ${JSON.stringify(retention.workspaceId)} &&
          group.conversations.some(
            (conversation) =>
              conversation.navigation.conversationId === ${JSON.stringify(retention.conversationId)},
          ),
      ) && document.querySelector(${JSON.stringify(retentionGroupSelector)}) === null;
    })()`,
    'Project removal did not retain its conversation under an unavailable Workspace group.',
  );
  const removed = await evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    const unavailableGroup = projection.conversationNavigation.groups.find(
      (group) => group.kind === 'workspace' &&
        group.workspaceId === ${JSON.stringify(retention.workspaceId)},
    );
    return {
      projectPresent: projection.catalog.projects.some(
        (project) => project.projectId === ${JSON.stringify(retention.projectId)},
      ),
      conversationPresent: projection.agentHome.conversations.some(
        (conversation) =>
          conversation.navigation.conversationId === ${JSON.stringify(retention.conversationId)},
      ),
      projectGroupPresent:
        document.querySelector(${JSON.stringify(retentionGroupSelector)}) !== null,
      unavailableMessage: unavailableGroup?.message ?? '',
    };
  })()`);
  const unavailableWorkspaceGroupSelector = `.primary-conversation-group[data-group-id=${JSON.stringify(
    `workspace:${retention.workspaceId}`,
  )}]`;
  const unavailableWorkspaceHeaderSelector = `${unavailableWorkspaceGroupSelector} .primary-conversation-group__standalone-heading`;
  await hover(`${unavailableWorkspaceHeaderSelector} .primary-conversation-group__label`);
  await waitForCondition(
    evaluate,
    `(() => {
      const header = document.querySelector(${JSON.stringify(unavailableWorkspaceHeaderSelector)});
      const actions = header?.querySelector(':scope > .primary-navigation-row-actions');
      return actions instanceof HTMLElement && getComputedStyle(actions).opacity === '1';
    })()`,
    'Unavailable Workspace group cleanup did not appear on hover.',
  );
  const unavailableWorkspaceAction = await evaluate(`(() => {
    const header = document.querySelector(${JSON.stringify(unavailableWorkspaceHeaderSelector)});
    const actions = header?.querySelector(':scope > .primary-navigation-row-actions');
    const status = header?.querySelector(':scope > .primary-navigation-state');
    const button = actions?.querySelector('button');
    const headerRect = header?.getBoundingClientRect();
    const actionsRect = actions?.getBoundingClientRect();
    return {
      actionCount: actions?.querySelectorAll('button').length ?? 0,
      actionLabel: button?.getAttribute('aria-label') ?? '',
      statusOpacity: status instanceof HTMLElement ? getComputedStyle(status).opacity : '',
      withinRow:
        headerRect !== undefined && actionsRect !== undefined &&
        actionsRect.left >= headerRect.left && actionsRect.right <= headerRect.right,
    };
  })()`);
  if (
    unavailableWorkspaceAction.actionCount !== 1 ||
    !/Delete unavailable Workspace conversations|删除不可用工作区的会话/u.test(
      unavailableWorkspaceAction.actionLabel,
    ) ||
    unavailableWorkspaceAction.statusOpacity !== '0' ||
    !unavailableWorkspaceAction.withinRow
  ) {
    throw new Error(
      `Unavailable Workspace group action is incorrect: ${JSON.stringify(unavailableWorkspaceAction)}`,
    );
  }
  const unavailableWorkspaceActionScreenshot = await screenshot(
    'project-sidebar-unavailable-workspace-action-hover',
  );
  const unavailableWorkspaceContextMenu = await openSidebarContextMenu({
    cdp,
    evaluate,
    selector: unavailableWorkspaceHeaderSelector,
  });
  assertWorkspaceContextMenu(unavailableWorkspaceContextMenu);
  const unavailableWorkspaceContextMenuScreenshot = await captureSettledScreenshot(
    screenshot,
    'project-sidebar-unavailable-workspace-context-menu',
  );
  await pressKey('Escape');
  await hover('.home-sidebar-heading');
  await waitForCondition(
    evaluate,
    `(() => {
      const header = document.querySelector(${JSON.stringify(unavailableWorkspaceHeaderSelector)});
      const actions = header?.querySelector(':scope > .primary-navigation-row-actions');
      const status = header?.querySelector(':scope > .primary-navigation-state');
      return actions instanceof HTMLElement && status instanceof HTMLElement &&
        getComputedStyle(actions).opacity === '0' && getComputedStyle(status).opacity === '1';
    })()`,
    'Unavailable Workspace status did not return after its action closed.',
  );
  const unavailableScreenshot = await captureSettledScreenshot(
    screenshot,
    'project-sidebar-removed-workspace-unavailable',
  );

  const cleanupCancellation = await evaluate(`(async () => {
    globalThis.confirm = () => false;
    const cleanupButton = document.querySelector(${JSON.stringify(
      `${cleanupGroupSelector} .primary-navigation-row-actions button:nth-child(2)`,
    )});
    if (!(cleanupButton instanceof HTMLButtonElement) || cleanupButton.disabled) {
      throw new Error('Project conversation cleanup control is unavailable.');
    }
    cleanupButton.click();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    return {
      projectPresent: projection.catalog.projects.some(
        (project) => project.projectId === ${JSON.stringify(cleanup.projectId)},
      ),
      conversationPresent: projection.agentHome.conversations.some(
        (conversation) =>
          conversation.navigation.conversationId === ${JSON.stringify(cleanup.conversationId)},
      ),
    };
  })()`);
  if (!cleanupCancellation.projectPresent || !cleanupCancellation.conversationPresent) {
    throw new Error('Cancelled Project conversation cleanup changed durable state.');
  }

  await evaluate(`(() => {
    globalThis.confirm = () => true;
    const cleanupButton = document.querySelector(${JSON.stringify(
      `${cleanupGroupSelector} .primary-navigation-row-actions button:nth-child(2)`,
    )});
    if (!(cleanupButton instanceof HTMLButtonElement) || cleanupButton.disabled) {
      throw new Error('Project conversation cleanup control is unavailable.');
    }
    cleanupButton.click();
    return true;
  })()`);
  await waitForCondition(
    evaluate,
    `(async () => {
      const projection = await window.openNekoDesktop.shell.getSnapshot();
      return projection.catalog.projects.some(
        (project) => project.projectId === ${JSON.stringify(cleanup.projectId)},
      ) && !projection.agentHome.conversations.some(
        (conversation) =>
          conversation.navigation.conversationId === ${JSON.stringify(cleanup.conversationId)},
      ) && !projection.conversationNavigation.groups.some(
        (group) => group.kind === 'project' && group.projectId === ${JSON.stringify(cleanup.projectId)},
      ) && document.querySelector(${JSON.stringify(cleanupGroupSelector)}) === null;
    })()`,
    'Project conversation cleanup did not preserve the Project while removing exact history.',
  );
  const cleaned = await evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    return {
      projectPresent: projection.catalog.projects.some(
        (project) => project.projectId === ${JSON.stringify(cleanup.projectId)},
      ),
      conversationPresent: projection.agentHome.conversations.some(
        (conversation) =>
          conversation.navigation.conversationId === ${JSON.stringify(cleanup.conversationId)},
      ),
      projectGroupPresent:
        document.querySelector(${JSON.stringify(cleanupGroupSelector)}) !== null,
    };
  })()`);
  await clickApplicationNavigation(evaluate, click, 3);
  await waitForCondition(
    evaluate,
    `(() => {
      const root = document.querySelector('.project-management-catalog');
      const rows = [...(root?.querySelectorAll('.management-surface-row') ?? [])];
      const retainedProject = rows.find((row) =>
        row.getAttribute('data-project-id') === ${JSON.stringify(cleanup.projectId)},
      ) ?? rows[0];
      const actions = retainedProject?.querySelectorAll(
        '.management-surface-row-actions button',
      );
      const cleanupButton = actions?.[0];
      const removalButton = actions?.[1];
      return rows.length === 1 &&
        cleanupButton instanceof HTMLButtonElement && cleanupButton.disabled &&
        removalButton instanceof HTMLButtonElement && !removalButton.disabled;
    })()`,
    'Project catalog did not retain the cleaned Project with cleanup disabled.',
  );
  const cleanedScreenshot = await captureSettledScreenshot(
    screenshot,
    'project-catalog-conversations-cleaned-project-retained',
  );
  return {
    cleaned,
    cleanupCancellation,
    compactLayout,
    conversationHoverActions,
    darkTheme,
    initial,
    keyboardActions,
    projectHoverActions,
    projectContextMenu,
    portabilityDialog,
    conversationContextMenu,
    unavailableWorkspaceAction,
    unavailableWorkspaceContextMenu,
    removalCancellation,
    removed,
    screenshots: [
      desktopScreenshot,
      projectHoverScreenshot,
      conversationHoverScreenshot,
      projectContextMenuScreenshot,
      portabilityDialogScreenshot,
      conversationContextMenuScreenshot,
      compactScreenshot,
      darkCompactScreenshot,
      unavailableWorkspaceActionScreenshot,
      unavailableWorkspaceContextMenuScreenshot,
      unavailableScreenshot,
      cleanedScreenshot,
    ],
  };
}

async function inspectSidebarRowActions(evaluate, rowSelector) {
  return evaluate(`(() => {
    const row = document.querySelector(${JSON.stringify(rowSelector)});
    const actions = row?.querySelector(':scope > .primary-navigation-row-actions');
    const status = row?.querySelector(':scope > .primary-navigation-state');
    const count = row?.querySelector(':scope > .primary-conversation-group__count');
    const content = row?.querySelector(':scope > .primary-conversation-group__project-link');
    const rowRect = row?.getBoundingClientRect();
    const actionsRect = actions?.getBoundingClientRect();
    const contentRect = content?.getBoundingClientRect();
    return {
      visibleActionCount: actions instanceof HTMLElement && getComputedStyle(actions).opacity === '1'
        ? actions.querySelectorAll('button').length
        : 0,
      focusedAction:
        document.activeElement instanceof HTMLButtonElement && actions?.contains(document.activeElement)
          ? document.activeElement.getAttribute('aria-label') ?? ''
          : '',
      statusOpacity: status instanceof HTMLElement ? getComputedStyle(status).opacity : '',
      countOpacity: count instanceof HTMLElement ? getComputedStyle(count).opacity : '',
      contentClearOfActions:
        contentRect !== undefined && actionsRect !== undefined &&
        contentRect.right <= actionsRect.left,
      withinRow:
        rowRect !== undefined && actionsRect !== undefined &&
        actionsRect.left >= rowRect.left && actionsRect.right <= rowRect.right,
    };
  })()`);
}

async function openSidebarContextMenu({ cdp, evaluate, selector }) {
  const point = await evaluate(`(() => {
    const trigger = document.querySelector(${JSON.stringify(selector)});
    if (!(trigger instanceof HTMLElement)) {
      throw new Error('Desktop sidebar context-menu trigger is unavailable.');
    }
    const rectangle = trigger.getBoundingClientRect();
    return { x: rectangle.left + rectangle.width / 2, y: rectangle.top + rectangle.height / 2 };
  })()`);
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: point.x,
    y: point.y,
    button: 'right',
    buttons: 2,
    clickCount: 1,
  });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: point.x,
    y: point.y,
    button: 'right',
    buttons: 0,
    clickCount: 1,
  });
  await waitForCondition(
    evaluate,
    `document.querySelector('[role="menu"]') instanceof HTMLElement`,
    'Desktop sidebar context menu did not open from a right click.',
  );
  return evaluate(`(() => {
    const menu = document.querySelector('[role="menu"]');
    if (!(menu instanceof HTMLElement)) return null;
    const rectangle = menu.getBoundingClientRect();
    const items = [...menu.querySelectorAll('[role="menuitem"]')].map((item) => ({
      text: item.textContent?.trim() ?? '',
      disabled: item.hasAttribute('data-disabled'),
      danger: item.classList.contains('danger'),
    }));
    return {
      items,
      separatorCount: menu.querySelectorAll('.neko-menu-sep').length,
      background: getComputedStyle(menu).backgroundColor,
      withinViewport:
        rectangle.left >= 0 && rectangle.top >= 0 &&
        rectangle.right <= window.innerWidth && rectangle.bottom <= window.innerHeight,
    };
  })()`);
}

function assertProjectContextMenu(menu) {
  const texts = menu?.items.map((item) => item.text) ?? [];
  const has = (...labels) => labels.some((label) => texts.some((text) => text.includes(label)));
  if (
    menu?.items.length !== 6 ||
    menu.separatorCount !== 1 ||
    !menu.withinViewport ||
    menu.background === 'rgba(0, 0, 0, 0)' ||
    !has('Open project', '打开项目') ||
    !has('New conversation', '新建会话') ||
    !has('Project management', '项目管理') ||
    !has('Project portability', '项目可移植性') ||
    !has('Delete Workspace conversations', '删除') ||
    !has('Remove', '移除') ||
    menu.items.filter((item) => item.danger).length !== 2
  ) {
    throw new Error(`Project context menu is incomplete: ${JSON.stringify(menu)}`);
  }
}

function assertConversationContextMenu(menu) {
  const texts = menu?.items.map((item) => item.text) ?? [];
  const has = (...labels) => labels.some((label) => texts.some((text) => text.includes(label)));
  if (
    menu?.items.length !== 2 ||
    menu.separatorCount !== 1 ||
    !menu.withinViewport ||
    menu.background === 'rgba(0, 0, 0, 0)' ||
    !has('Open conversation', '打开会话') ||
    !has('Delete conversation', '删除会话') ||
    menu.items.filter((item) => item.danger).length !== 1
  ) {
    throw new Error(`Conversation context menu is incomplete: ${JSON.stringify(menu)}`);
  }
}

function assertWorkspaceContextMenu(menu) {
  const item = menu?.items[0];
  if (
    menu?.items.length !== 1 ||
    menu.separatorCount !== 0 ||
    !menu.withinViewport ||
    menu.background === 'rgba(0, 0, 0, 0)' ||
    item?.disabled ||
    !item?.danger ||
    !/Delete unavailable Workspace conversations|删除不可用工作区的会话/u.test(item?.text ?? '')
  ) {
    throw new Error(`Unavailable Workspace context menu is incomplete: ${JSON.stringify(menu)}`);
  }
}

async function selectDesktopTheme(evaluate, theme) {
  await evaluate(`(() => {
    const select = document.querySelector('[data-settings-surface="main"] select');
    if (!(select instanceof HTMLSelectElement)) {
      throw new Error('Desktop Theme setting is unavailable.');
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    if (!setter) throw new Error('Desktop Theme select setter is unavailable.');
    setter.call(select, ${JSON.stringify(theme)});
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await waitForCondition(
    evaluate,
    `document.documentElement.dataset.nekoTheme === ${JSON.stringify(theme)}`,
    `Desktop Theme did not switch to ${theme} through Settings.`,
  );
}

async function waitForProjectDraft(evaluate, projectId, workspaceId, action) {
  await waitForCondition(
    evaluate,
    `(async () => {
      const projection = await window.openNekoDesktop.shell.getSnapshot();
      const context = projection.window.workbench.scene.context;
      const project = projection.catalog.projects.find(
        (candidate) => candidate.projectId === ${JSON.stringify(projectId)},
      );
      return project?.workspaceId === ${JSON.stringify(workspaceId)} &&
        context.kind === 'agent' && context.scope.kind === 'workspace' &&
        context.scope.workspaceId === ${JSON.stringify(workspaceId)} &&
        context.scope.conversationId === undefined;
    })()`,
    `${action} did not activate the exact Project draft.`,
  );
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

async function openProjectCatalogItem(evaluate, projectId) {
  await evaluate(`(() => {
    const row = [...document.querySelectorAll('.project-management-catalog .management-surface-row')]
      .find((candidate) => candidate instanceof HTMLElement &&
        candidate.dataset.projectId === ${JSON.stringify(projectId)});
    const target = row?.querySelector('.management-surface-row__open');
    if (!(target instanceof HTMLButtonElement) || target.disabled) {
      throw new Error('Exact Project catalog item is unavailable for direct open.');
    }
    target.click();
    return true;
  })()`);
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

async function exerciseWorkspaceDraftMention({
  evaluate,
  pressKey,
  referenceLabel = 'agent-reference.txt',
  referenceQuery = 'agent-reference',
  expectedPortablePath,
  expectedReferenceKind,
  expectedSourceLabels = [],
  forbiddenText,
  screenshot,
  type,
  screenshotLabel,
}) {
  await replaceActiveAgentComposerText({ evaluate, pressKey, type }, `@${referenceQuery}`);
  await waitForCondition(
    evaluate,
    `(() => [...document.querySelectorAll(
      '${ACTIVE_AGENT_SURFACE_SELECTOR} .agent-composer-mention-menu [role="menuitem"]',
    )].some((item) => item.textContent?.includes(${JSON.stringify(referenceLabel)})))()`,
    'Workspace Draft @ search did not return its exact authorized Workspace file.',
  );
  const selection = await evaluate(`(() => {
    const menu = document.querySelector(
      '${ACTIVE_AGENT_SURFACE_SELECTOR} .agent-composer-mention-menu',
    );
    const item = [...document.querySelectorAll(
      '${ACTIVE_AGENT_SURFACE_SELECTOR} .agent-composer-mention-menu [role="menuitem"]',
    )].find((candidate) => candidate.textContent?.includes(${JSON.stringify(referenceLabel)}));
    if (!(menu instanceof HTMLElement) || !(item instanceof HTMLButtonElement)) {
      throw new Error('Workspace Draft mention result is not interactive.');
    }
    const rowTitle = item.getAttribute('title') ?? '';
    const badgeLabels = [...item.querySelectorAll('.agent-composer-popover-badge')]
      .map((badge) => badge.textContent?.trim() ?? '')
      .filter(Boolean);
    const expectedSourceLabels = ${JSON.stringify(expectedSourceLabels)};
    if (
      expectedSourceLabels.length > 0 &&
      !badgeLabels.some((label) => expectedSourceLabels.includes(label))
    ) {
      throw new Error(
        'Workspace Draft mention did not expose the expected source provenance: ' +
          JSON.stringify({ badgeLabels }),
      );
    }
    const expectedPortablePath = ${JSON.stringify(expectedPortablePath)};
    if (expectedPortablePath && rowTitle !== expectedPortablePath) {
      throw new Error(
        'Workspace Draft mention did not retain its portable locator: ' +
          JSON.stringify({ rowTitle }),
      );
    }
    const forbiddenText = ${JSON.stringify(forbiddenText)};
    if (
      forbiddenText &&
      [menu.textContent ?? '', rowTitle].some((value) => value.includes(forbiddenText))
    ) {
      throw new Error('Workspace Draft mention exposed forbidden Host path text.');
    }
    item.click();
    return { label: item.textContent?.trim() ?? '', rowTitle, badgeLabels };
  })()`);
  await waitForCondition(
    evaluate,
    `(() => [...document.querySelectorAll(
      '${ACTIVE_AGENT_SURFACE_SELECTOR} [data-agent-reference-token="true"]',
    )].some((token) => token.textContent?.includes(${JSON.stringify(referenceLabel)})))()`,
    'Workspace Draft mention selection did not create an exact context reference.',
  );
  const referenceProjection = await evaluate(`(() => {
    const activeSurface = document.querySelector('${ACTIVE_AGENT_SURFACE_SELECTOR}');
    const tokens = [...(activeSurface?.querySelectorAll('[data-agent-reference-token="true"]') ?? [])];
    const matchingTokens = tokens.filter(
      (token) => token.textContent?.includes(${JSON.stringify(referenceLabel)}),
    );
    if (tokens.length !== 1 || matchingTokens.length !== 1) {
      throw new Error(
        'Workspace Draft mention selection did not retain one canonical reference token: ' +
          JSON.stringify({
            tokenCount: tokens.length,
            matchingTokenCount: matchingTokens.length,
            labels: tokens.map((token) => token.textContent?.trim() ?? ''),
          }),
      );
    }
    const tokenKind = matchingTokens[0]?.getAttribute('data-reference-kind') ?? '';
    const expectedReferenceKind = ${JSON.stringify(expectedReferenceKind)};
    if (expectedReferenceKind && tokenKind !== expectedReferenceKind) {
      throw new Error(
        'Workspace Draft mention token has the wrong reference kind: ' +
          JSON.stringify({ tokenKind }),
      );
    }
    const tokenTitle = matchingTokens[0]?.getAttribute('title') ?? '';
    const expectedPortablePath = ${JSON.stringify(expectedPortablePath)};
    if (expectedPortablePath && tokenTitle !== expectedPortablePath) {
      throw new Error(
        'Workspace Draft mention token lost its portable locator: ' +
          JSON.stringify({ tokenTitle }),
      );
    }
    return {
      tokenCount: tokens.length,
      matchingTokenCount: matchingTokens.length,
      label: matchingTokens[0]?.textContent?.trim() ?? '',
      tokenKind,
      tokenTitle,
    };
  })()`);
  return {
    selection: { ...selection, referenceProjection },
    screenshot: await screenshot(screenshotLabel),
  };
}

async function inspectEntryTriggerControls(evaluate) {
  return evaluate(`(() => {
    const activeSurface = document.querySelector('${ACTIVE_AGENT_SURFACE_SELECTOR}');
    if (!(activeSurface instanceof HTMLElement)) {
      throw new Error('Entry Agent surface is unavailable for typed-trigger inspection.');
    }
    const buttonLabels = [...activeSurface.querySelectorAll('button')].map(
      (button) => button.textContent?.trim() ?? '',
    );
    const duplicateLabels = buttonLabels.filter(
      (label) =>
        label === '/' ||
        label === '$' ||
        label === '\u5f00\u59cb\u5bf9\u8bdd' ||
        label === 'Start Chat' ||
        label === 'Start Conversation',
    );
    const result = {
      duplicateLabels,
      typedTriggerButtonCount: activeSurface.querySelectorAll(
        '.agent-composer-tool-button-text',
      ).length,
      hasWorkspaceChoice: Boolean(activeSurface.querySelector('.agent-composer-workspace-button')),
      hasModelConfiguration: Boolean(activeSurface.querySelector('.agent-model-config-trigger')),
      globalAlertCount: document.querySelectorAll('.shell-diagnostic[role="alert"]').length,
    };
    if (
      result.duplicateLabels.length > 0 ||
      result.typedTriggerButtonCount !== 0 ||
      !result.hasWorkspaceChoice ||
      !result.hasModelConfiguration ||
      result.globalAlertCount !== 0
    ) {
      throw new Error('Entry composer typed-trigger controls are invalid: ' + JSON.stringify(result));
    }
    return result;
  })()`);
}

async function openEntrySlashMenu({ evaluate, screenshot, type }) {
  await type(ACTIVE_AGENT_TEXTAREA_SELECTOR, '/');
  await waitForCondition(
    evaluate,
    `(() => [...document.querySelectorAll(
      '${ACTIVE_AGENT_SURFACE_SELECTOR} .agent-composer-command-menu [role="menuitem"]',
    )].some((item) => item.querySelector('.agent-composer-popover-primary')
      ?.textContent?.trim() === '/new'))()`,
    'Unbound Entry slash menu did not expose the Draft-safe /new command.',
  );
  const selection = await evaluate(`(() => {
    const activeSurface = document.querySelector('${ACTIVE_AGENT_SURFACE_SELECTOR}');
    const menu = activeSurface?.querySelector('.agent-composer-command-menu');
    const items = [...(menu?.querySelectorAll('[role="menuitem"]') ?? [])];
    const bounds = menu?.getBoundingClientRect();
    const result = {
      itemLabels: items.map((item) =>
        item.querySelector('.agent-composer-popover-primary')?.textContent?.trim() ?? '',
      ),
      typedTriggerButtonCount:
        activeSurface?.querySelectorAll('.agent-composer-tool-button-text').length ?? -1,
      globalAlertCount: document.querySelectorAll('.shell-diagnostic[role="alert"]').length,
      withinViewport:
        bounds !== undefined &&
        bounds.width > 0 &&
        bounds.height > 0 &&
        bounds.left >= 0 &&
        bounds.top >= 0 &&
        bounds.right <= window.innerWidth &&
        bounds.bottom <= window.innerHeight,
    };
    if (
      !(menu instanceof HTMLElement) ||
      !result.itemLabels.includes('/new') ||
      result.typedTriggerButtonCount !== 0 ||
      result.globalAlertCount !== 0 ||
      !result.withinViewport
    ) {
      throw new Error('Entry slash discovery is invalid: ' + JSON.stringify(result));
    }
    return result;
  })()`);
  return {
    selection,
    screenshot: await screenshot('agent-entry-unbound-slash-menu'),
  };
}

async function inspectUnboundEntryMention({ evaluate, pressKey, screenshot, type }) {
  await replaceActiveAgentComposerText({ evaluate, pressKey, type }, '@unbound-scope');
  await waitForCondition(
    evaluate,
    `Boolean(document.querySelector(
      '${ACTIVE_AGENT_SURFACE_SELECTOR} .agent-composer-mention-menu .agent-composer-popover-empty',
    ))`,
    'Unbound Entry mention discovery did not remain locally empty.',
  );
  const screenshotPath = await screenshot('agent-entry-unbound-mention-local-empty');
  const selection = await evaluate(`(() => {
    const activeSurface = document.querySelector('${ACTIVE_AGENT_SURFACE_SELECTOR}');
    const menu = activeSurface?.querySelector('.agent-composer-mention-menu');
    const result = {
      inputValue: activeSurface?.querySelector('.agent-composer-textarea')?.value ?? '',
      menuItemCount: menu?.querySelectorAll('[role="menuitem"]').length ?? -1,
      hasLocalEmptyState: Boolean(menu?.querySelector('.agent-composer-popover-empty')),
      globalAlertCount: document.querySelectorAll('.shell-diagnostic[role="alert"]').length,
    };
    if (
      !(menu instanceof HTMLElement) ||
      result.inputValue !== '@unbound-scope' ||
      result.menuItemCount !== 0 ||
      !result.hasLocalEmptyState ||
      result.globalAlertCount !== 0
    ) {
      throw new Error('Unbound Entry mention discovery escaped its local scope: ' + JSON.stringify(result));
    }
    return result;
  })()`);
  return { selection, screenshot: screenshotPath };
}

async function replaceActiveAgentComposerText({ evaluate, pressKey, type }, nextValue) {
  const currentValue = await evaluate(
    `document.querySelector('${ACTIVE_AGENT_TEXTAREA_SELECTOR}')?.value ?? ''`,
  );
  await type(ACTIVE_AGENT_TEXTAREA_SELECTOR, '', 0, { clear: false });
  await pressKey('End');
  for (let index = 0; index < currentValue.length; index += 1) {
    await pressKey('Backspace');
  }
  await type(ACTIVE_AGENT_TEXTAREA_SELECTOR, nextValue, 0, { clear: false });
  await waitForCondition(
    evaluate,
    `document.querySelector('${ACTIVE_AGENT_TEXTAREA_SELECTOR}')?.value === ${JSON.stringify(nextValue)}`,
    `Entry composer did not replace its text with ${JSON.stringify(nextValue)}.`,
  );
}

async function markEntryAgentRoot(evaluate, expectedDraftId) {
  return evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    ${requireActiveWorkbenchProjection('projection')}
    const context = activeWorkbench.scene.context;
    const activeSurface = document.querySelector('${ACTIVE_AGENT_SURFACE_SELECTOR}');
    const root = activeSurface?.querySelector('.desktop-agent-root[data-owner-root="agent"]');
    if (
      context.kind !== 'agent' ||
      context.scope.kind !== 'unbound' ||
      context.scope.draftId !== ${JSON.stringify(expectedDraftId)} ||
      !(root instanceof HTMLElement) ||
      root.hidden
    ) {
      throw new Error('Entry Agent Root identity could not be captured for Draft verification.');
    }
    window.__openNekoFunctionalEntryAgentRoot = root;
    return {
      draftId: context.scope.draftId,
      rootCount: activeSurface.querySelectorAll(
        '.desktop-agent-root[data-owner-root="agent"]',
      ).length,
      viewId: root.dataset.viewId,
    };
  })()`);
}

async function inspectEntryWorkspaceTargetMenu(evaluate, expectedProjectId) {
  return evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    const project = projection.catalog.projects.find(
      (candidate) => candidate.projectId === ${JSON.stringify(expectedProjectId)},
    );
    if (!project) throw new Error('Entry Workspace menu has no exact fixture Project.');
    const menu = document.querySelector(
      '${ACTIVE_AGENT_SURFACE_SELECTOR} .agent-composer-workspace-menu',
    );
    const items = [...(menu?.querySelectorAll('[role="menuitem"]') ?? [])];
    const projectMenuIndex = items.findIndex(
      (item) => item.textContent?.trim() === project.displayName,
    );
    if (!(menu instanceof HTMLElement) || projectMenuIndex < 0) {
      throw new Error('Entry Workspace menu did not expose the exact Project target.');
    }
    const bounds = menu.getBoundingClientRect();
    if (
      bounds.width <= 0 ||
      bounds.height <= 0 ||
      bounds.left < 0 ||
      bounds.top < 0 ||
      bounds.right > window.innerWidth ||
      bounds.bottom > window.innerHeight
    ) {
      throw new Error('Entry Workspace target menu is clipped outside the visible viewport.');
    }
    return {
      projectId: project.projectId,
      projectLabel: project.displayName,
      projectMenuIndex,
      itemLabels: items.map((item) => item.textContent?.trim() ?? ''),
      withinViewport: true,
    };
  })()`);
}

async function inspectBoundEntryDraft(evaluate, expected) {
  return evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    ${requireActiveWorkbenchProjection('projection')}
    const context = activeWorkbench.scene.context;
    const activeSurface = document.querySelector('${ACTIVE_AGENT_SURFACE_SELECTOR}');
    const root = activeSurface?.querySelector('.desktop-agent-root[data-owner-root="agent"]');
    const inputValue = activeSurface?.querySelector('.agent-composer-textarea')?.value ?? '';
    const workspaceLabels = [...(activeSurface?.querySelectorAll(
      '.agent-composer-workspace-button',
    ) ?? [])].map((button) => button.textContent?.trim() ?? '');
    const presentationStates = Object.keys(sessionStorage).flatMap((key) => {
      if (!key.startsWith('openneko:agent:presentation:')) return [];
      try {
        return [JSON.parse(sessionStorage.getItem(key) ?? 'null')];
      } catch {
        return [];
      }
    });
    const draftSnapshot = presentationStates.find(
      (state) => state?.entryDraft?.draftId === ${JSON.stringify(expected.draftId)},
    )?.entryDraft;
    const workspaceTarget = draftSnapshot?.workspaceTarget;
    const rootRetained = root === window.__openNekoFunctionalEntryAgentRoot;
    const result = {
      sceneKind: context.kind,
      sceneScope: context.scope.kind,
      draftId: context.scope.kind === 'unbound' ? context.scope.draftId : undefined,
      conversationCount: projection.agentHome.conversations.length,
      inputValue,
      workspaceLabels,
      workspaceTarget,
      rootPresent: root instanceof HTMLElement && !root.hidden,
      agentRootCount:
        activeSurface?.querySelectorAll('.desktop-agent-root[data-owner-root="agent"]').length ?? 0,
      agentRootRetained: rootRetained,
    };
    if (
      context.kind !== 'agent' ||
      context.scope.kind !== 'unbound' ||
      context.scope.draftId !== ${JSON.stringify(expected.draftId)} ||
      projection.agentHome.conversations.length !== 0 ||
      inputValue !== ${JSON.stringify(expected.inputValue)} ||
      !workspaceLabels.includes(${JSON.stringify(expected.projectLabel)}) ||
      workspaceTarget?.context?.kind !== 'workspace' ||
      workspaceTarget.context.workspaceId !== ${JSON.stringify(expected.workspaceId)} ||
      typeof workspaceTarget.context.workspaceGrantId !== 'string' ||
      workspaceTarget.context.workspaceGrantId.length === 0 ||
      !(root instanceof HTMLElement) ||
      root.hidden ||
      !rootRetained
    ) {
      throw new Error(
        'Workspace target selection replaced or materialized the Entry Draft: ' +
          JSON.stringify(result),
      );
    }
    return {
      ...result,
      selectedWorkspaceLabel: ${JSON.stringify(expected.projectLabel)},
      workspaceId: workspaceTarget.context.workspaceId,
      workspaceGrantId: workspaceTarget.context.workspaceGrantId,
    };
  })()`);
}

async function openStoryboardSkillMenu({ evaluate, screenshot, type }) {
  await type(ACTIVE_AGENT_TEXTAREA_SELECTOR, '$storyboard');
  await waitForCondition(
    evaluate,
    `(() => [...document.querySelectorAll(
      '${ACTIVE_AGENT_SURFACE_SELECTOR} .agent-composer-command-menu [role="menuitem"]',
    )].some((item) => item.querySelector('.agent-composer-popover-primary')
      ?.textContent?.trim() === '$storyboard'))()`,
    'Entry Workspace Draft Skill menu did not expose $storyboard.',
  );
  const selection = await evaluate(`(() => {
    const menu = document.querySelector(
      '${ACTIVE_AGENT_SURFACE_SELECTOR} .agent-composer-command-menu',
    );
    const items = [...(menu?.querySelectorAll('[role="menuitem"]') ?? [])];
    const menuIndex = items.findIndex((item) => item.querySelector(
      '.agent-composer-popover-primary',
    )?.textContent?.trim() === '$storyboard');
    if (!(menu instanceof HTMLElement) || menuIndex < 0) {
      throw new Error('The exact $storyboard Skill menu item is unavailable.');
    }
    const bounds = menu.getBoundingClientRect();
    if (
      bounds.width <= 0 ||
      bounds.height <= 0 ||
      bounds.left < 0 ||
      bounds.top < 0 ||
      bounds.right > window.innerWidth ||
      bounds.bottom > window.innerHeight
    ) {
      throw new Error('Entry Skill menu is clipped outside the visible viewport.');
    }
    return {
      menuIndex,
      skillName: '$storyboard',
      itemLabels: items.map((item) => item.textContent?.trim() ?? ''),
      withinViewport: true,
    };
  })()`);
  return {
    selection,
    screenshot: await screenshot('agent-entry-workspace-skill-menu'),
  };
}

async function waitForWorkspaceSession(evaluate, expected) {
  await waitForCondition(
    evaluate,
    `(async () => {
      const projection = await window.openNekoDesktop.shell.getSnapshot();
      const activeWorkbench = projection.window.workbench;
      const context = activeWorkbench.scene.context;
      const interaction = activeWorkbench.scene.slots.interaction;
      const conversation = projection.agentHome.conversations[0];
      if (conversation?.lastActivity.kind === 'turn-failed') {
        throw new Error(
          'Workspace initial Turn failed: ' + JSON.stringify(conversation.lastActivity),
        );
      }
      return context.kind === 'agent' &&
        context.scope.kind === 'workspace' &&
        context.scope.workspaceId === ${JSON.stringify(expected.workspaceId)} &&
        context.scope.workspaceGrantId === ${JSON.stringify(expected.workspaceGrantId)} &&
        typeof context.scope.conversationId === 'string' &&
        interaction?.kind === 'agent' &&
        interaction.phase === 'session' &&
        interaction.scope.kind === 'workspace' &&
        interaction.scope.conversationId === context.scope.conversationId &&
        projection.agentHome.conversations.length === 1 &&
        conversation?.navigation.owner.kind === 'workspace' &&
        conversation.navigation.owner.workspaceId === ${JSON.stringify(expected.workspaceId)};
    })()`,
    'Workspace first submit did not materialize its exact Agent Session.',
  );
  await waitForCondition(
    evaluate,
    `(async () => {
      const projection = await window.openNekoDesktop.shell.getSnapshot();
      const activeWorkbench = projection.window.workbench;
      const context = activeWorkbench.scene.context;
      const interaction = activeWorkbench.scene.slots.interaction;
      const conversation = projection.agentHome.conversations[0];
      const transcript = document.querySelector('${ACTIVE_AGENT_SURFACE_SELECTOR}')?.textContent ?? '';
      const referenceTokens = [...document.querySelectorAll(
        '${ACTIVE_AGENT_SURFACE_SELECTOR} .agent-user-prompt [data-agent-reference-token="true"]',
      )];
      const alerts = [...document.querySelectorAll('[role="alert"]')]
        .map((element) => element.textContent?.trim() ?? '')
        .filter(Boolean);
      if (conversation?.lastActivity.kind === 'turn-failed' || alerts.length > 0) {
        throw new Error(
          'Workspace execution failed: ' + JSON.stringify({
            lastActivity: conversation?.lastActivity,
            alerts,
            transcript: transcript.slice(0, 1200),
          }),
        );
      }
      return transcript.includes(${JSON.stringify(expected.submittedInput)}) &&
        transcript.includes('OPENNEKO_FUNCTIONAL_RESPONSE_1') &&
        referenceTokens.length === 1 &&
        referenceTokens[0]?.textContent?.includes(${JSON.stringify(expected.expectedReferenceLabel)}) &&
        !transcript.includes('Attached Context') &&
        !transcript.includes('ContentLocator') &&
        conversation?.title === ${JSON.stringify(expected.expectedConversationTitle)} &&
        !document.querySelector('${ACTIVE_AGENT_SURFACE_SELECTOR} .agent-run-status') &&
        !document.querySelector('${ACTIVE_AGENT_SURFACE_SELECTOR} .agent-execution-activity') &&
        !document.querySelector('${ACTIVE_AGENT_SURFACE_SELECTOR} .agent-composer-stop');
    })()`,
    'Workspace first submit did not complete through its exact Agent Session.',
  );
  return evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    const activeWorkbench = projection.window.workbench;
    const context = activeWorkbench.scene.context;
    const interaction = activeWorkbench.scene.slots.interaction;
    const activeSurface = document.querySelector('${ACTIVE_AGENT_SURFACE_SELECTOR}');
    const conversation = projection.agentHome.conversations[0];
    const conversationLink = [...document.querySelectorAll('.home-conversation-link')]
      .find((candidate) => candidate.textContent?.trim() === ${JSON.stringify(expected.expectedConversationTitle)});
    const projectLink = document.querySelector(
      '.primary-conversation-group[data-group-kind="project"] .primary-conversation-group__project-link',
    );
    const root = activeSurface?.querySelector('.desktop-agent-root[data-owner-root="agent"]');
    const visibleRoots = [...document.querySelectorAll(
      '.desktop-agent-root[data-owner-root="agent"]',
    )].filter((candidate) => candidate instanceof HTMLElement && !candidate.hidden);
    const referenceTokens = [...(activeSurface?.querySelectorAll(
      '.agent-user-prompt [data-agent-reference-token="true"]',
    ) ?? [])];
    const alerts = [...document.querySelectorAll('[role="alert"]')]
      .map((element) => element.textContent?.trim() ?? '')
      .filter(Boolean);
    const rootRetained = root === window.__openNekoFunctionalEntryAgentRoot;
    if (
      context.kind !== 'agent' ||
      context.scope.kind !== 'workspace' ||
      typeof context.scope.conversationId !== 'string' ||
      interaction?.kind !== 'agent' ||
      interaction.phase !== 'session' ||
      projection.agentHome.conversations.length !== 1 ||
      conversation?.title !== ${JSON.stringify(expected.expectedConversationTitle)} ||
      !(conversationLink instanceof HTMLElement) ||
      !(projectLink instanceof HTMLElement) ||
      getComputedStyle(conversationLink).fontSize !== '11px' ||
      getComputedStyle(projectLink).fontSize !== '11px' ||
      referenceTokens.length !== 1 ||
      !referenceTokens[0]?.textContent?.includes(${JSON.stringify(expected.expectedReferenceLabel)}) ||
      (activeSurface?.textContent ?? '').includes('Attached Context') ||
      (activeSurface?.textContent ?? '').includes('ContentLocator') ||
      visibleRoots.length !== 1 ||
      !rootRetained ||
      Boolean(activeSurface?.querySelector('.agent-execution-activity')) ||
      alerts.length > 0
    ) {
      throw new Error('Completed Workspace Session lost exact Scene or Agent Root identity.');
    }
    return {
      conversationId: context.scope.conversationId,
      conversationCount: projection.agentHome.conversations.length,
      conversationTitle: conversation.title,
      conversationTitleVisible: conversationLink.textContent?.trim() === conversation.title,
      navigationFontSizes: {
        conversation: getComputedStyle(conversationLink).fontSize,
        project: getComputedStyle(projectLink).fontSize,
      },
      workspaceId: context.scope.workspaceId,
      workspaceGrantId: context.scope.workspaceGrantId,
      phase: interaction.phase,
      sceneScope: context.scope.kind,
      agentRootCount: visibleRoots.length,
      agentRootRetained: rootRetained,
      transcriptContainsSkill: activeSurface?.textContent?.includes(
        ${JSON.stringify(expected.submittedInput)},
      ) === true,
      providerResponseVisible: activeSurface?.textContent?.includes(
        'OPENNEKO_FUNCTIONAL_RESPONSE_1',
      ) === true,
      referenceToken: {
        count: referenceTokens.length,
        label: referenceTokens[0]?.textContent?.trim() ?? '',
        variant: referenceTokens[0]?.getAttribute('data-reference-variant') ?? '',
      },
      internalLocatorPromptVisible:
        (activeSurface?.textContent ?? '').includes('Attached Context') ||
        (activeSurface?.textContent ?? '').includes('ContentLocator'),
      runStatusVisible: Boolean(activeSurface?.querySelector('.agent-run-status')),
      executionActivityVisible: Boolean(
        activeSurface?.querySelector('.agent-execution-activity'),
      ),
      stopControlVisible: Boolean(activeSurface?.querySelector('.agent-composer-stop')),
      alerts,
    };
  })()`);
}

async function chooseFixtureWorkspace(evaluate) {
  return evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    ${requireActiveWorkbenchProjection('projection')}
    const result = await window.openNekoDesktop.workspaceGrants.chooseDirectory(
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

async function chooseFixtureWorkspaceWithHistory(evaluate, expectedWorkspaceId, conversationId) {
  return evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    ${requireActiveWorkbenchProjection('projection')}
    const result = await window.openNekoDesktop.workspaceGrants.chooseDirectory(
      projection.window.windowId,
    );
    if (result.status !== 'authorized') {
      throw new Error('The isolated fixture Workspace grant was cancelled.');
    }
    const transition = await window.openNekoDesktop.scenes.transition(
      projection.window.windowId,
      { kind: 'open-workspace', workspaceGrantId: result.grant.workspaceGrantId },
      activeWorkbench.scene.sceneId,
    );
    if (
      transition.status !== 'transitioned' ||
      transition.scene.context.kind !== 'agent' ||
      transition.scene.context.scope.kind !== 'workspace'
    ) {
      throw new Error('Workspace history fixture did not activate a Workspace Scene.');
    }
    const committed = await window.openNekoDesktop.shell.getSnapshot();
    const project = committed.catalog.projects.find(
      (candidate) => candidate.workspaceId === transition.scene.context.scope.workspaceId,
    );
    const group = committed.conversationNavigation.groups.find(
      (candidate) => candidate.kind === 'project' && candidate.projectId === project?.projectId,
    );
    if (
      transition.scene.context.scope.workspaceId !== ${JSON.stringify(expectedWorkspaceId)} ||
      !project ||
      group?.conversations[0]?.navigation.conversationId !== ${JSON.stringify(conversationId)}
    ) {
      throw new Error('Workspace history did not attach to the exact Project group.');
    }
    return {
      workspaceGrantId: result.grant.workspaceGrantId,
      workspaceId: transition.scene.context.scope.workspaceId,
      projectId: project.projectId,
      draftId: transition.scene.context.scope.draftId,
      conversationCount: group.conversations.length,
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
    const panelCloseCount = document.querySelectorAll(
      '.project-resource-dock__header button[aria-label="Close resource management"], ' +
      '.project-resource-dock__header button[aria-label="关闭资源管理"]',
    ).length;
    const facets = [...browser.querySelectorAll('.neko-resource-browser__facets [role="tab"]')];
    const facetLabels = facets.map((item) => item.textContent?.trim() ?? '');
    if (
      refreshCount !== 0 ||
      initialLibraryControlCount !== 0 ||
      panelCloseCount !== 0 ||
      facets.length !== 4
    ) {
      throw new Error(
        'Workspace Resource Browser chrome does not match its embedded contract: ' +
          JSON.stringify({ refreshCount, initialLibraryControlCount, panelCloseCount, facetLabels }),
      );
    }
    const mediaFacet = facets.find((item) =>
      ['媒体库', 'Media library'].includes(item.textContent?.trim() ?? ''),
    );
    if (!(mediaFacet instanceof HTMLButtonElement)) {
      throw new Error('Workspace Resource Browser Media facet is unavailable.');
    }
    mediaFacet.click();
    return { refreshCount, initialLibraryControlCount, panelCloseCount, facetLabels };
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
    const result = await window.openNekoDesktop.workspaceGrants.chooseDirectory(
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
        '.primary-recent-conversation-row > .primary-navigation-row-actions button:last-child',
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

async function exerciseWorkspaceDockResize(evaluate, drag, expectedWorkspaceId) {
  const inspect = () =>
    evaluate(`(async () => {
      const projection = await window.openNekoDesktop.shell.getSnapshot();
      const activeWorkbench = projection.window.workbench;
      const context = activeWorkbench.scene.context;
      const shell = document.querySelector('[data-neko-controlled-workbench="true"]');
      const primary = document.querySelector('.neko-controlled-workbench-primary');
      const interaction = document.querySelector(
        '.neko-controlled-workbench-interaction[data-presentation="docked"]',
      );
      const main = document.querySelector('.neko-controlled-workbench-main');
      const resources = document.querySelector(
        '.neko-controlled-workbench-dock--right[data-presentation="docked"]',
      );
      const bounds = Object.fromEntries(
        Object.entries({ shell, primary, interaction, main, resources }).map(([name, element]) => {
          if (!(element instanceof HTMLElement)) {
            throw new Error('Workspace resize inspection requires the ' + name + ' region.');
          }
          const rect = element.getBoundingClientRect();
          return [name, { left: rect.left, right: rect.right, width: rect.width }];
        }),
      );
      return {
        workbenchInstanceId: activeWorkbench.workbenchInstanceId,
        workspaceId:
          context.kind === 'agent' && context.scope.kind === 'workspace'
            ? context.scope.workspaceId
            : null,
        chatWidth: activeWorkbench.layout.display.chatWidth,
        resourceWidth: activeWorkbench.layout.resourceDock.width,
        viewportWidth: window.innerWidth,
        bounds,
        alerts: [...document.querySelectorAll('[role="alert"]')]
          .map((element) => element.textContent?.trim() ?? '')
          .filter(Boolean),
      };
    })()`);
  const initial = await inspect();
  await drag(
    '.neko-controlled-workbench-interaction[data-presentation="docked"] > ' +
      '.neko-controlled-workbench-resize-handle',
    '.neko-controlled-workbench-main',
    { targetPosition: { xRatio: 0.25, yRatio: 0.5 } },
  );
  await waitForCondition(
    evaluate,
    `(async () => {
      const projection = await window.openNekoDesktop.shell.getSnapshot();
      return projection.window.workbench.layout.display.chatWidth !== ${String(initial.chatWidth)};
    })()`,
    'Workspace Agent/Main resize did not commit a new width.',
  );
  const afterAgentResize = await inspect();
  await drag(
    '.neko-controlled-workbench-dock--right[data-presentation="docked"] > ' +
      '.neko-controlled-workbench-resize-handle',
    '.neko-controlled-workbench-main',
    { targetPosition: { xRatio: 0.75, yRatio: 0.5 } },
  );
  await waitForCondition(
    evaluate,
    `(async () => {
      const projection = await window.openNekoDesktop.shell.getSnapshot();
      return projection.window.workbench.layout.resourceDock.width !== ${String(initial.resourceWidth)};
    })()`,
    'Workspace Main/Resources resize did not commit a new width.',
  );
  const afterResourceResize = await inspect();
  for (const [phase, detail] of [
    ['initial', initial],
    ['agent', afterAgentResize],
    ['resources', afterResourceResize],
  ]) {
    if (
      detail.workbenchInstanceId !== initial.workbenchInstanceId ||
      detail.workspaceId !== expectedWorkspaceId ||
      Object.values(detail.bounds).some(
        (bounds) => bounds.left < -0.5 || bounds.right > detail.viewportWidth + 0.5,
      ) ||
      detail.alerts.length > 0
    ) {
      throw new Error(
        `Workspace resize changed identity or emitted an error during ${phase}: ${JSON.stringify(detail)}`,
      );
    }
  }
  return { initial, afterAgentResize, afterResourceResize };
}

async function inspectWorkspaceShellChrome(evaluate) {
  return evaluate(`(() => {
    const agentPanel = document.querySelector('[data-dock-owner="agent"]');
    const resourcePanel = document.querySelector('[data-dock-owner="resources"]');
    if (!(agentPanel instanceof HTMLElement) || !(resourcePanel instanceof HTMLElement)) {
      throw new Error('Workspace Shell chrome inspection requires Agent and Resources panels.');
    }
    return [agentPanel, resourcePanel].map((panel) => {
      const style = getComputedStyle(panel);
      return {
        owner: panel.getAttribute('data-dock-owner'),
        borderWidths: [
          style.borderTopWidth,
          style.borderRightWidth,
          style.borderBottomWidth,
          style.borderLeftWidth,
        ],
        borderRadius: style.borderRadius,
        overflow: style.overflow,
      };
    });
  })()`);
}

function assertWorkspaceShellChrome(detail) {
  if (
    detail.length !== 2 ||
    detail.some(
      (panel) =>
        panel.borderWidths.some((width) => width !== '1px') ||
        panel.borderRadius !== '0px' ||
        panel.overflow !== 'hidden',
    )
  ) {
    throw new Error(`Workspace resize changed Shell chrome: ${JSON.stringify(detail)}`);
  }
}

async function inspectWorkspacePanelHeaderAlignment(evaluate) {
  return evaluate(`(() => {
    const mainHeader = document.querySelector('.project-main-group__tabs');
    const mainTabs = mainHeader?.querySelector('.neko-workbench-editor-tabs');
    const resourceHeader = document.querySelector('.project-resource-dock__header');
    if (!(mainHeader instanceof HTMLElement) || !(mainTabs instanceof HTMLElement) ||
        !(resourceHeader instanceof HTMLElement)) {
      throw new Error('Workspace panel header alignment requires Main tabs and Resources header.');
    }
    const mainHeaderRect = mainHeader.getBoundingClientRect();
    const mainTabsRect = mainTabs.getBoundingClientRect();
    const resourceHeaderRect = resourceHeader.getBoundingClientRect();
    return {
      mainHeaderHeight: mainHeaderRect.height,
      mainTabsHeight: mainTabsRect.height,
      resourceHeaderHeight: resourceHeaderRect.height,
      topDelta: Math.abs(mainHeaderRect.top - resourceHeaderRect.top),
      bottomDelta: Math.abs(mainHeaderRect.bottom - resourceHeaderRect.bottom),
    };
  })()`);
}

function assertWorkspacePanelHeaderAlignment(detail) {
  if (
    Math.abs(detail.mainHeaderHeight - 38) > 0.5 ||
    Math.abs(detail.mainTabsHeight - 38) > 0.5 ||
    Math.abs(detail.resourceHeaderHeight - 38) > 0.5 ||
    detail.topDelta > 0.5 ||
    detail.bottomDelta > 0.5
  ) {
    throw new Error(`Workspace panel headers are not aligned: ${JSON.stringify(detail)}`);
  }
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

async function exerciseWorkspaceDisplayModes(evaluate, click, screenshot) {
  const cases = [
    {
      label: 'agent-hidden',
      region: 'agent',
      mode: 'main-only',
      pressed: false,
      selectedRegions: ['creative-panels', 'management'],
    },
    {
      label: 'agent-restored',
      region: 'agent',
      mode: 'chat-main',
      pressed: true,
      selectedRegions: ['agent', 'creative-panels', 'management'],
    },
    {
      label: 'main-hidden',
      region: 'main',
      option: 'main',
      mode: 'chat-only',
      pressed: false,
      selectedRegions: ['agent', 'management'],
    },
    {
      label: 'main-restored',
      region: 'main',
      option: 'main',
      mode: 'chat-main',
      pressed: true,
      selectedRegions: ['agent', 'creative-panels', 'management'],
    },
    {
      label: 'management-hidden',
      region: 'management',
      resources: 'hidden',
      pressed: false,
      selectedRegions: ['agent', 'creative-panels'],
    },
    {
      label: 'management-restored',
      region: 'management',
      resources: 'docked',
      pressed: true,
      selectedRegions: ['agent', 'creative-panels', 'management'],
    },
  ];
  const states = [];
  const screenshots = [];
  for (const expected of cases) {
    const selector = expected.option
      ? `[data-workbench-region-option="${expected.option}"]`
      : `[data-workbench-region-control="${expected.region}"]`;
    if (expected.option) {
      await openWorkspaceCreativePanels(evaluate, click);
    } else {
      await waitForWorkspaceRegionControl(evaluate, expected.region);
    }
    await click(selector);
    await waitForCondition(
      evaluate,
      `(async () => {
        const projection = await window.openNekoDesktop.shell.getSnapshot();
        ${requireActiveWorkbenchProjection('projection')}
        const workbench = activeWorkbench.layout;
        const control = document.querySelector(${JSON.stringify(selector)});
        return ${expected.mode ? `workbench.display.mode === ${JSON.stringify(expected.mode)}` : 'true'} &&
          ${expected.resources ? `workbench.resourceDock.presentation === ${JSON.stringify(expected.resources)}` : 'true'} &&
          control?.getAttribute(${JSON.stringify(expected.option ? 'aria-checked' : 'aria-pressed')}) === ${JSON.stringify(String(expected.pressed))};
      })()`,
      `Workspace region '${expected.region}' did not commit its presentation.`,
    );
    const state = await evaluate(`(async () => {
        const projection = await window.openNekoDesktop.shell.getSnapshot();
        ${requireActiveWorkbenchProjection('projection')}
        const workbench = activeWorkbench.layout;
        const control = document.querySelector(${JSON.stringify(selector)});
        const titleBar = document.querySelector('.neko-controlled-workbench-title');
        const controls = document.querySelector('.workspace-region-controls');
        const tabs = [...document.querySelectorAll('.neko-workbench-editor-tab')];
        const titleRect = titleBar?.getBoundingClientRect();
        const controlsRect = controls?.getBoundingClientRect();
        const tabRects = tabs.map((tab) => tab.getBoundingClientRect());
        return {
          mode: workbench.display.mode,
          chatPosition: workbench.display.chatPosition,
          resources: workbench.resourceDock.presentation,
          hasAgent: Boolean(document.querySelector('[data-dock-owner="agent"], [data-primary-surface="agent"]')),
          hasMain: Boolean(document.querySelector('[data-main-view-id]')),
          pressed: control?.getAttribute(${JSON.stringify(expected.option ? 'aria-checked' : 'aria-pressed')}) === 'true',
          selectedRegions: [...document.querySelectorAll(
            '.workspace-region-controls [data-workbench-region-control][aria-pressed="true"]',
          )].map((element) => element.getAttribute('data-workbench-region-control')),
          controlsFitTitleBar: Boolean(
            titleRect && controlsRect && controlsRect.top >= titleRect.top &&
            controlsRect.right <= titleRect.right && controlsRect.bottom <= titleRect.bottom
          ),
          controlsOverlapTabs: Boolean(
            controlsRect && tabRects.some((tabRect) =>
              controlsRect.left < tabRect.right && controlsRect.right > tabRect.left &&
              controlsRect.top < tabRect.bottom && controlsRect.bottom > tabRect.top
            )
          ),
        };
      })()`);
    if (
      state.pressed !== expected.pressed ||
      JSON.stringify(state.selectedRegions) !== JSON.stringify(expected.selectedRegions) ||
      !state.controlsFitTitleBar ||
      state.controlsOverlapTabs
    ) {
      throw new Error(
        `Workspace region '${expected.region}' lost its visible title control state: ${JSON.stringify(state)}`,
      );
    }
    states.push(state);
    screenshots.push(await screenshot(`workspace-layout-${expected.label}`));
  }
  await openWorkspaceCreativePanels(evaluate, click);
  const cutPanel = await evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    ${requireActiveWorkbenchProjection('projection')}
    const control = document.querySelector('[data-workbench-region-option="cut-panel"]');
    const workbench = activeWorkbench.layout;
    return {
      hasCutPanel: Boolean(workbench.cutPanel),
      disabled: control instanceof HTMLButtonElement && control.disabled,
      pressed: control?.getAttribute('aria-checked') === 'true',
    };
  })()`);
  if (cutPanel.hasCutPanel || cutPanel.disabled || cutPanel.pressed) {
    throw new Error(
      `Workspace without a Cut View did not expose a creatable, unselected Cut Panel control: ${JSON.stringify(cutPanel)}`,
    );
  }
  states.push({ cutPanel });
  screenshots.push(await screenshot('workspace-layout-cut-panel-creatable'));
  return { states, screenshots };
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

async function openWorkspaceCreativePanels(evaluate, click) {
  await waitForWorkspaceRegionControl(evaluate, 'creative-panels');
  const alreadyOpen = await evaluate(
    `document.querySelector('[data-workbench-region-option="main"]') instanceof HTMLButtonElement`,
  );
  if (!alreadyOpen) {
    await click('[data-workbench-region-control="creative-panels"]');
  }
  await waitForCondition(
    evaluate,
    `(() => {
      const main = document.querySelector('[data-workbench-region-option="main"]');
      const cut = document.querySelector('[data-workbench-region-option="cut-panel"]');
      return main instanceof HTMLButtonElement && cut instanceof HTMLButtonElement;
    })()`,
    'Combined Main and Cut choices did not become interactive.',
  );
}

async function exerciseCutTabAdd(evaluate, click, pressKey, screenshot) {
  await openWorkspaceCreativePanels(evaluate, click);
  await click('[data-workbench-region-option="cut-panel"]');
  await waitForCondition(
    evaluate,
    `document.querySelectorAll('.project-cut-panel__tabs .neko-workbench-editor-tab').length === 1 &&
      document.querySelector('[data-cut-tab-add="true"]') instanceof HTMLButtonElement`,
    'Cut Panel did not create its first exact draft tab.',
  );
  const inspect = () =>
    evaluate(`(() => {
      const header = document.querySelector('.project-cut-panel__tabs');
      const tabList = header?.querySelector('.neko-workbench-editor-tabs');
      const tabs = [...(header?.querySelectorAll('.neko-workbench-editor-tab') ?? [])];
      const add = header?.querySelector('[data-cut-tab-add="true"]');
      if (!(header instanceof HTMLElement) || !(tabList instanceof HTMLElement) ||
          !(add instanceof HTMLButtonElement) || tabs.length === 0) {
        throw new Error('Cut tab geometry requires a header, tab list, tabs and add control.');
      }
      const headerRect = header.getBoundingClientRect();
      const tabListRect = tabList.getBoundingClientRect();
      const addRect = add.getBoundingClientRect();
      const finalTabRect = tabs.at(-1).getBoundingClientRect();
      return {
        tabCount: tabs.length,
        selectedIndex: tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true'),
        tabToAddGap: addRect.left - finalTabRect.right,
        listToAddGap: addRect.left - tabListRect.right,
        addWidth: addRect.width,
        fitsHeader: addRect.right <= headerRect.right + 0.5,
        remainingRightSpace: headerRect.right - addRect.right,
      };
  })()`);
  const initial = await inspect();
  const initialScreenshot = await screenshot('workspace-cut-tab-add-adjacent');
  const layoutScreenshots = await exerciseCutOnlyLayout(evaluate, click, pressKey, screenshot);
  assertCutTabAddGeometry(initial, 'initial');
  await click('[data-cut-tab-add="true"]');
  await waitForCondition(
    evaluate,
    `document.querySelectorAll('.project-cut-panel__tabs .neko-workbench-editor-tab').length === 2 &&
      document.querySelector('.project-cut-panel__tabs .neko-workbench-editor-tab:last-child')
        ?.getAttribute('aria-selected') === 'true'`,
    'Cut Panel did not append and select the second exact draft tab.',
  );
  const added = await inspect();
  assertCutTabAddGeometry(added, 'added');
  const addedScreenshot = await screenshot('workspace-cut-tab-add-second-draft');
  return {
    states: { initial, added },
    screenshots: [initialScreenshot, ...layoutScreenshots, addedScreenshot],
  };
}

async function exerciseCutOnlyLayout(evaluate, click, pressKey, screenshot) {
  await evaluate(`(() => {
    const cutRoot = document.querySelector('[data-owner-root="cut"]');
    if (!(cutRoot instanceof HTMLElement)) {
      throw new Error('Cut layout lifecycle probe requires the exact Cut Root.');
    }
    window.__openNekoCutLayoutProbe = cutRoot;
  })()`);
  await openWorkspaceCreativePanels(evaluate, click);
  await click('[data-workbench-region-option="main"]');
  await waitForCondition(
    evaluate,
    `(async () => {
      const projection = await window.openNekoDesktop.shell.getSnapshot();
      ${requireActiveWorkbenchProjection('projection')}
      const shell = document.querySelector('[data-neko-controlled-workbench="true"]');
      return activeWorkbench.layout.display.mode === 'chat-only' &&
        activeWorkbench.layout.cutPanel?.presentation === 'docked' &&
        shell?.getAttribute('data-interaction-presentation') === 'docked' &&
        shell?.getAttribute('data-bottom-panel-presentation') === 'expanded' &&
        !document.querySelector('[data-main-view-id]') &&
        document.querySelector('[data-owner-root="cut"]') === window.__openNekoCutLayoutProbe;
    })()`,
    'Main did not hide while retaining a docked Agent and expanding the same Cut Root.',
  );
  const agentCutScreenshot = await screenshot('workspace-layout-agent-cut-expanded');
  await click('[data-workbench-region-control="agent"]');
  await waitForCondition(
    evaluate,
    `(async () => {
      const projection = await window.openNekoDesktop.shell.getSnapshot();
      ${requireActiveWorkbenchProjection('projection')}
      const shell = document.querySelector('[data-neko-controlled-workbench="true"]');
      return activeWorkbench.layout.display.mode === 'empty-main' &&
        activeWorkbench.layout.main.views.length > 0 &&
        activeWorkbench.layout.cutPanel?.presentation === 'docked' &&
        shell?.getAttribute('data-interaction-presentation') === 'hidden' &&
        shell?.getAttribute('data-bottom-panel-presentation') === 'expanded' &&
        !document.querySelector('[data-main-view-id]') &&
        Boolean(document.querySelector('[data-workbench-cut-panel="true"]')) &&
        document.querySelector('[data-owner-root="cut"]') === window.__openNekoCutLayoutProbe;
    })()`,
    'Cut-only did not project hidden Agent, retained Main refs and the same expanded Cut Root.',
  );
  const cutOnlyScreenshot = await screenshot('workspace-layout-cut-only-expanded');

  await evaluate(`(() => {
    const control = document.querySelector('[data-workbench-region-control="creative-panels"]');
    if (!(control instanceof HTMLButtonElement)) {
      throw new Error('Combined Main and Cut control is unavailable for keyboard validation.');
    }
    control.focus();
  })()`);
  await pressKey('Enter');
  await waitForCondition(
    evaluate,
    `(() => {
      const trigger = document.querySelector('[data-workbench-region-control="creative-panels"]');
      const menu = document.querySelector('.workspace-creative-panels-popover__menu');
      return trigger?.getAttribute('aria-expanded') === 'true' &&
        menu?.getAttribute('role') === 'menu' &&
        document.querySelectorAll('[data-workbench-region-option]').length === 2;
    })()`,
    'Combined Main and Cut Popover did not open from the keyboard.',
  );
  const keyboardScreenshot = await screenshot('workspace-layout-keyboard-popover');
  await pressKey('Escape');
  await waitForCondition(
    evaluate,
    `document.querySelector('[data-workbench-region-option]') === null`,
    'Combined Main and Cut Popover did not close with Escape.',
  );

  await openWorkspaceCreativePanels(evaluate, click);
  await click('[data-workbench-region-option="main"]');
  await waitForCondition(
    evaluate,
    `(async () => {
      const projection = await window.openNekoDesktop.shell.getSnapshot();
      ${requireActiveWorkbenchProjection('projection')}
      const shell = document.querySelector('[data-neko-controlled-workbench="true"]');
      return activeWorkbench.layout.display.mode === 'main-only' &&
        Boolean(document.querySelector('[data-main-view-id]')) &&
        activeWorkbench.layout.cutPanel?.presentation === 'docked' &&
        shell?.getAttribute('data-bottom-panel-presentation') === 'docked' &&
        document.querySelector('[data-owner-root="cut"]') === window.__openNekoCutLayoutProbe;
    })()`,
    'Main did not restore above the retained Cut Root.',
  );
  const restoredMainScreenshot = await screenshot('workspace-layout-main-restored-with-cut');
  await click('[data-workbench-region-control="agent"]');
  await waitForCondition(
    evaluate,
    `(async () => {
      const projection = await window.openNekoDesktop.shell.getSnapshot();
      ${requireActiveWorkbenchProjection('projection')}
      return activeWorkbench.layout.display.mode === 'chat-main';
    })()`,
    'Agent did not restore alongside Main and Cut.',
  );

  await openWorkspaceCreativePanels(evaluate, click);
  await click('[data-workbench-region-option="cut-panel"]');
  await waitForCondition(
    evaluate,
    `(async () => {
      const projection = await window.openNekoDesktop.shell.getSnapshot();
      ${requireActiveWorkbenchProjection('projection')}
      return activeWorkbench.layout.cutPanel?.presentation === 'hidden' &&
        !document.querySelector('[data-workbench-cut-panel="true"]');
    })()`,
    'Cut did not hide while preserving Agent and Main.',
  );
  const hiddenCutScreenshot = await screenshot('workspace-layout-cut-hidden');
  await openWorkspaceCreativePanels(evaluate, click);
  await click('[data-workbench-region-option="cut-panel"]');
  await waitForCondition(
    evaluate,
    `(async () => {
      const projection = await window.openNekoDesktop.shell.getSnapshot();
      ${requireActiveWorkbenchProjection('projection')}
      return activeWorkbench.layout.cutPanel?.presentation === 'docked' &&
        Boolean(document.querySelector('[data-workbench-cut-panel="true"]'));
    })()`,
    'Cut did not restore through the combined control.',
  );
  return [
    agentCutScreenshot,
    cutOnlyScreenshot,
    keyboardScreenshot,
    restoredMainScreenshot,
    hiddenCutScreenshot,
  ];
}

function assertCutTabAddGeometry(detail, phase) {
  if (
    detail.selectedIndex !== detail.tabCount - 1 ||
    detail.tabToAddGap < -0.5 ||
    detail.tabToAddGap > 8 ||
    Math.abs(detail.listToAddGap) > 0.5 ||
    Math.abs(detail.addWidth - 24) > 0.5 ||
    !detail.fitsHeader ||
    detail.remainingRightSpace <= 32
  ) {
    throw new Error(
      `Cut tab add control is not adjacent during ${phase}: ${JSON.stringify(detail)}`,
    );
  }
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
    hasCommandShortcut: Boolean(document.querySelector('.agent-composer-tool-button-text')),
    sessionTabsVisible: Boolean(document.querySelector('[data-testid="conversation-tabs"]')),
  }))()`);
  return { ...controls, composer: await inspectComposerPresentation(evaluate) };
}

async function inspectAgentSessionControls(evaluate) {
  return evaluate(`(() => {
    const activeSurface = document.querySelector('[data-primary-surface="agent"]');
    const shell = activeSurface?.querySelector('.agent-composer-shell');
    const toolbar = activeSurface?.querySelector('.agent-composer-toolbar');
    const owner = shell?.closest('[data-dock-owner="agent"], [data-primary-surface="agent"]');
    const dockPanel = activeSurface.closest('[data-dock-owner="agent"]');
    if (!(activeSurface instanceof HTMLElement) || !(shell instanceof HTMLElement) ||
        !(toolbar instanceof HTMLElement) || !(owner instanceof HTMLElement) ||
        !(dockPanel instanceof HTMLElement)) {
      throw new Error('Assistant session composer presentation is incomplete.');
    }
    const shellRect = shell.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();
    const ownerRect = owner.getBoundingClientRect();
    const dockPanelStyle = getComputedStyle(dockPanel);
    return {
      composerCount: activeSurface.querySelectorAll('.agent-composer-shell').length,
      textareaCount: activeSurface.querySelectorAll('.agent-composer-textarea').length,
      hasMode: Boolean(activeSurface.querySelector('.agent-control-chip-mode')),
      hasModel: Boolean(activeSurface.querySelector('.agent-model-config-trigger')),
      hasApproval: Boolean(activeSurface.querySelector('.agent-execution-mode-trigger')),
      commandShortcutCount:
        activeSurface.querySelectorAll('.agent-composer-tool-button-text').length,
      hasUsageIndicator: [...activeSurface.querySelectorAll('.agent-composer-tool-button')].some(
        (button) => /compress|\u538b\u7f29/iu.test(button.getAttribute('title') ?? ''),
      ),
      workspaceControlCount: activeSurface.querySelectorAll('.agent-composer-workspace').length,
      hasInnerHeader: Boolean(activeSurface.querySelector('.agent-header')),
      shellBorderWidths: [
        dockPanelStyle.borderTopWidth,
        dockPanelStyle.borderRightWidth,
        dockPanelStyle.borderBottomWidth,
        dockPanelStyle.borderLeftWidth,
      ],
      shellBorderRadius: dockPanelStyle.borderRadius,
      shellOverflow: dockPanelStyle.overflow,
      hasShadow: getComputedStyle(shell).boxShadow !== 'none',
      shellWidth: shellRect.width,
      fitsSurface: shellRect.left >= ownerRect.left && shellRect.right <= ownerRect.right,
      toolbarFitsSurface:
        toolbar.scrollWidth <= toolbar.clientWidth && toolbarRect.right <= shellRect.right,
    };
  })()`);
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
      workspaceInToolbar: toolbar.contains(workspace),
      workspaceBorderBottomWidth: getComputedStyle(workspace).borderBottomWidth,
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
    const leftDockStyle = leftDock instanceof HTMLElement ? getComputedStyle(leftDock) : undefined;
    const rightDockStyle = rightDock instanceof HTMLElement ? getComputedStyle(rightDock) : undefined;
    const interactionStyle = interaction instanceof HTMLElement
      ? getComputedStyle(interaction)
      : undefined;
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
    const shellRect = controlledShell.getBoundingClientRect();
    const titleBar = shell.querySelector(':scope > .neko-controlled-workbench-title');
    const titleBarRect = titleBar instanceof HTMLElement ? titleBar.getBoundingClientRect() : undefined;
    const previewPresentation = activeSecondaryMainTarget?.querySelector(
      '[data-preview-presentation-owner="preview-webview"]',
    );
    const previewStyle = previewPresentation instanceof HTMLElement
      ? getComputedStyle(previewPresentation)
      : undefined;
    return {
      shellCount: document.querySelectorAll('[data-neko-controlled-workbench="true"]').length,
      primaryCount: document.querySelectorAll('[data-primary-sidebar="application"]').length,
      hasWorkbenchTitleBar: titleBar instanceof HTMLElement,
      workbenchTitleBarHeight: titleBarRect?.height ?? 0,
      workbenchTitleBarTopInset: titleBarRect ? titleBarRect.top - shellRect.top : 0,
      workbenchTitleBarRightInset: titleBarRect ? shellRect.right - titleBarRect.right : 0,
      recentNavigationVisible: Boolean(primary?.querySelector('.home-recent-navigation')),
      recentSectionCount: primary?.querySelectorAll('.home-sidebar-heading').length ?? 0,
      navigationSectionIds: [
        ...(primary?.querySelectorAll('[data-navigation-section]') ?? []),
      ].map((section) => section.getAttribute('data-navigation-section')),
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
      projectRowActionCount:
        activeMainTarget?.querySelector(
          '.project-management-catalog .management-surface-row-actions',
        )?.querySelectorAll('button').length ?? -1,
      projectOpenTargetVisible: Boolean(
        activeMainTarget?.querySelector(
          '.project-management-catalog .management-surface-row__open',
        ),
      ),
      projectCatalogViewMode:
        activeMainTarget
          ?.querySelector('.project-management-catalog .management-surface-list')
          ?.getAttribute('data-view-mode') ?? null,
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
      sidebarControlInBrand: Boolean(
        primary?.querySelector(
          '.primary-sidebar-brand__controls [data-workbench-region-control="primary-sidebar"]',
        ),
      ),
      sidebarControlKinds: [
        ...primary?.querySelectorAll(
          '.primary-sidebar-brand__controls [data-workbench-region-control]',
        ) ?? [],
      ].map((element) => element.getAttribute('data-workbench-region-control')),
      workspaceControlsInTitleBar: Boolean(
        controlledShell?.querySelector(
          '.neko-controlled-workbench-title .workspace-region-controls',
        ),
      ),
      workspaceLayoutControlKinds: [
        ...controlledShell?.querySelectorAll(
          '.neko-controlled-workbench-title .workspace-region-controls [data-workbench-region-control]',
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
      secondaryMainSeparatorWidth: secondaryMainStyle
        ? parseFloat(secondaryMainStyle.borderLeftWidth)
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
      topLevelInsets: {
        mainMargin: mainStyle
          ? [
              mainStyle.marginTop,
              mainStyle.marginRight,
              mainStyle.marginBottom,
              mainStyle.marginLeft,
            ]
          : [],
        interactionMargin: interactionStyle
          ? [
              interactionStyle.marginTop,
              interactionStyle.marginRight,
              interactionStyle.marginBottom,
              interactionStyle.marginLeft,
            ]
          : [],
        leftDockPadding: leftDockStyle
          ? [
              leftDockStyle.paddingTop,
              leftDockStyle.paddingRight,
              leftDockStyle.paddingBottom,
              leftDockStyle.paddingLeft,
            ]
          : [],
        rightDockPadding: rightDockStyle
          ? [
              rightDockStyle.paddingTop,
              rightDockStyle.paddingRight,
              rightDockStyle.paddingBottom,
              rightDockStyle.paddingLeft,
            ]
          : [],
      },
      ownerInMain: owner instanceof HTMLElement && mainPrimary instanceof HTMLElement
        ? mainPrimary.contains(owner)
        : false,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  })()`);
}

async function inspectExtensionsManagement(evaluate) {
  const workbench = await inspectWorkbench(evaluate, 'management', 'extension-management');
  const catalog = await evaluate(`(() => {
    const root = document.querySelector('.agent-extension-management-root');
    const secondary = document.querySelector('${ACTIVE_WORKBENCH_SECONDARY_MAIN_TARGET_SELECTOR}');
    return {
      view: root?.getAttribute('data-catalog-view'),
      activeTab: root
        ?.querySelector('[data-extension-catalog-tab][aria-pressed="true"]')
        ?.getAttribute('data-extension-catalog-tab'),
      selectedCount: root?.querySelectorAll('[role="option"][aria-selected="true"]').length ?? 0,
      configurationKind: secondary
        ?.querySelector('[data-extension-configuration-kind]')
        ?.getAttribute('data-extension-configuration-kind'),
      endpointConfigurationVisible: Boolean(
        secondary?.querySelector('[data-automation-endpoint-management="true"]'),
      ),
      permissionConfigurationVisible: Boolean(
        secondary?.querySelector('[data-automation-permission-management="true"]'),
      ),
    };
  })()`);
  return { ...workbench, ...catalog };
}

function assertAgentDraftControls(detail) {
  if (
    detail.composerCount !== 1 ||
    detail.textareaCount !== 1 ||
    detail.toolButtonCount < 1 ||
    !detail.hasWorkspaceChoice ||
    detail.hasLegacyWorkspaceToolbar ||
    detail.hasMode ||
    !detail.hasModel ||
    !detail.modelLabel.includes('Functional Chat') ||
    detail.hasApproval ||
    detail.hasCommandShortcut ||
    detail.sessionTabsVisible
  ) {
    throw new Error(
      `Agent draft did not retain the complete launch-safe Workspace Agent controls: ${JSON.stringify(detail)}`,
    );
  }
  assertWorkspaceComposer(detail.composer, 'assistant');
}

function assertAgentSessionControls(detail) {
  if (
    detail.composerCount !== 1 ||
    detail.textareaCount !== 1 ||
    detail.hasMode ||
    !detail.hasModel ||
    !detail.hasApproval ||
    detail.commandShortcutCount !== 0 ||
    !detail.hasUsageIndicator ||
    detail.workspaceControlCount !== 0 ||
    detail.hasInnerHeader ||
    detail.shellBorderWidths.some((width) => width !== '1px') ||
    detail.shellBorderRadius === '0px' ||
    detail.shellOverflow !== 'hidden' ||
    !detail.hasShadow ||
    detail.shellWidth > 820 ||
    !detail.fitsSurface ||
    !detail.toolbarFitsSurface
  ) {
    throw new Error(
      `Assistant session did not restore its conversation-only controls: ${JSON.stringify(detail)}`,
    );
  }
}

function assertWorkspaceComposer(detail, scope) {
  if (
    !detail.hasShadow ||
    detail.shellWidth > 820 ||
    !detail.fitsSurface ||
    !detail.emptyPanelAligned ||
    detail.emptyPanelWidth > 820 ||
    detail.branchMetadataCount !== 0 ||
    !detail.workspaceInToolbar ||
    detail.workspaceBorderBottomWidth !== '0px' ||
    (scope === 'assistant' && !detail.workspaceLabel.includes('打开项目')) ||
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
    detail.mainComposition !== 'continuous' ||
    Math.abs(detail.mainSplitRatio - 0.5) > 0.025 ||
    !detail.hasMainSplitResize ||
    detail.primaryMainShell !== 'primary' ||
    detail.secondaryMainShell !== 'secondary' ||
    detail.hasMainGutter ||
    detail.mainGutterWidth !== 0 ||
    Math.abs(detail.mainShellGap) > 1 ||
    detail.enclosingMainBorderWidth <= 0 ||
    detail.enclosingMainBorderRadius !== '0px' ||
    detail.enclosingMainOverflow !== 'hidden' ||
    detail.enclosingMainShadow !== 'none' ||
    detail.primaryMainBorderWidth !== 0 ||
    detail.secondaryMainBorderWidth !== 0 ||
    detail.secondaryMainSeparatorWidth <= 0 ||
    detail.primaryMainBorderRadius !== '0px' ||
    detail.secondaryMainBorderRadius !== '0px' ||
    detail.primaryMainOverflow !== 'hidden' ||
    detail.secondaryMainOverflow !== 'hidden' ||
    detail.primaryMainShadow !== 'none' ||
    detail.secondaryMainShadow !== 'none' ||
    detail.mainPanelsOverlap ||
    detail.primaryMainWidth <= 0 ||
    detail.primaryMainWidth < detail.secondaryMainWidth
  ) {
    throw new Error(
      `Management + Detail did not preserve the edge-to-edge Workbench composition: ${JSON.stringify(detail)}`,
    );
  }
}

function assertExtensionsManagement(detail, view, tab) {
  assertManagementDetailSplit(detail, 'extension-management', 'extension-detail');
  if (
    !detail.compactPanelIds.includes('extension-detail') ||
    detail.view !== view ||
    detail.activeTab !== tab ||
    detail.configurationKind !== tab ||
    detail.selectedCount !== 1 ||
    (tab === 'skills' &&
      (detail.endpointConfigurationVisible || detail.permissionConfigurationVisible)) ||
    (tab === 'extensions' &&
      (!detail.endpointConfigurationVisible || !detail.permissionConfigurationVisible))
  ) {
    throw new Error(
      `Extensions management did not preserve its catalog/configuration contract: ${JSON.stringify(detail)}`,
    );
  }
}

function assertExtensionsCatalogOnly(detail, view, tab) {
  assertSingleWorkbench(detail);
  assertManagementMain(detail, 'extension-management');
  assertSharedManagementPanel(detail, 'extension-management');
  if (
    detail.view !== view ||
    detail.activeTab !== tab ||
    detail.selectedCount !== 0 ||
    detail.configurationKind !== undefined ||
    detail.endpointConfigurationVisible ||
    detail.permissionConfigurationVisible
  ) {
    throw new Error(
      `Extensions management reserved configuration without a selection: ${JSON.stringify(detail)}`,
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
    detail.mainComposition !== 'continuous' ||
    !detail.hasMainSplitResize ||
    detail.primaryMainShell !== 'primary' ||
    detail.secondaryMainShell !== 'secondary' ||
    detail.hasMainGutter ||
    detail.mainGutterWidth !== 0 ||
    Math.abs(detail.mainShellGap) > 1 ||
    detail.enclosingMainBorderWidth <= 0 ||
    detail.secondaryMainSeparatorWidth <= 0 ||
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
  assertFullBleedWorkbench(detail);
  if (
    !detail.hasWorkbenchTitleBar ||
    Math.abs(detail.workbenchTitleBarHeight - 28) > 1 ||
    Math.abs(detail.workbenchTitleBarTopInset - 4) > 1 ||
    Math.abs(detail.workbenchTitleBarRightInset - 8) > 1 ||
    !detail.sidebarControlInBrand ||
    !detail.workspaceControlsInTitleBar ||
    detail.layoutControlInFooter ||
    JSON.stringify(detail.sidebarControlKinds) !== JSON.stringify(['primary-sidebar']) ||
    JSON.stringify(detail.workspaceLayoutControlKinds) !==
      JSON.stringify(['agent', 'creative-panels', 'management'])
  ) {
    throw new Error('Workspace layout controls are not in the shared Workbench title chrome.');
  }
}

function assertSingleWorkbench(detail) {
  if (detail.shellCount !== 1 || detail.primaryCount !== 1) {
    throw new Error('Desktop scene did not preserve exactly one Workbench and PrimarySidebar.');
  }
  if (
    !detail.recentNavigationVisible ||
    detail.recentSectionCount !== 2 ||
    JSON.stringify(detail.navigationSectionIds) !== JSON.stringify(['projects', 'conversations'])
  ) {
    throw new Error(
      'PrimarySidebar did not preserve one authoritative grouped navigation surface.',
    );
  }
}

function assertAgentOnly(detail) {
  assertSingleWorkbench(detail);
  assertFullBleedWorkbench(detail);
  if (
    detail.workspaceControlsInTitleBar ||
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
  assertFullBleedWorkbench(detail);
  if (
    detail.workspaceControlsInTitleBar ||
    detail.leftDockPresentation !== 'hidden' ||
    !detail.ownerInMain ||
    detail.ownerWidth < 420
  ) {
    throw new Error(
      `${owner} was not mounted as the full Workbench Main surface: ${JSON.stringify(detail)}`,
    );
  }
}

function assertFullBleedWorkbench(detail) {
  const insetGroups = Object.entries(detail.topLevelInsets ?? {});
  if (
    insetGroups.length !== 4 ||
    insetGroups.some(([, values]) => values.some((value) => value !== '0px'))
  ) {
    throw new Error(
      `Desktop Workbench panels did not preserve full-bleed computed geometry: ${JSON.stringify(detail.topLevelInsets)}`,
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
    const evidence = {
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
      apiKey: request.headers['x-api-key'],
      bodyBytes: 0,
      nativeImageCount: 0,
    };
    requests.push(evidence);
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.once('end', () => {
      const body = Buffer.concat(chunks);
      evidence.bodyBytes = body.byteLength;
      evidence.nativeImageCount = countNativeImageParts(body);
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

function countNativeImageParts(body) {
  let payload;
  try {
    payload = JSON.parse(body.toString('utf8'));
  } catch {
    return 0;
  }
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  return messages.reduce((count, message) => {
    const content = Array.isArray(message?.content) ? message.content : [];
    return (
      count +
      content.filter(
        (part) =>
          part?.type === 'image_url' &&
          typeof part.image_url?.url === 'string' &&
          part.image_url.url.startsWith('data:image/'),
      ).length
    );
  }, 0);
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
