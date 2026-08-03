import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export const desktopWorkbenchScenesScenario = Object.freeze({
  id: 'desktop-workbench-scenes',
  owner: '@neko/app-desktop',
  async prepare({ fixtureHome, repositoryRoot }) {
    const workspacePath = join(fixtureHome, 'workspace');
    await mkdir(workspacePath, { recursive: true });
    await copyFile(
      join(repositoryRoot, 'docs/assets/openneko-desktop.png'),
      join(workspacePath, 'preview.png'),
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
    waitForDesktopBridge,
    waitForSelector,
  }) {
    await resizeWindow(evaluate, 1440, 960);
    await waitForSelector('.desktop-scene-workbench--agent-only');
    await waitForSelector('.agent-composer-shell');
    const agent = await inspectWorkbench(evaluate, 'agent-only');
    assertSingleWorkbench(agent);
    assertAgentOnly(agent);
    const draftControls = await inspectAgentDraftControls(evaluate);
    assertAgentDraftControls(draftControls);
    const sidebarLifecycle = await exercisePrimarySidebar(evaluate, click, drag);
    const agentScreenshot = await screenshot('agent-only-large');
    checkpoint('agent-only-large', { ...agent, draftControls, sidebarLifecycle });

    await click('.home-primary-navigation .home-nav-button', 1);
    await waitForSelector('[data-owner-root="asset-management"]');
    const assets = await inspectWorkbench(evaluate, 'management', 'asset-management');
    assertManagementMain(assets, 'asset-management');
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
    await waitForSelector(
      '.neko-controlled-workbench-main__secondary [data-authorized-preview-session-id]',
    );
    const assetPreview = await inspectWorkbench(evaluate, 'management', 'asset-management');
    assertManagementMain(assetPreview, 'asset-management');
    if (!assetPreview.previewInSecondary || assetPreview.previewKind !== 'image') {
      throw new Error('Asset Preview was not composed as an image in Secondary Main.');
    }
    const assetPreviewScreenshot = await screenshot('asset-management-with-preview-large');
    checkpoint('asset-management-with-preview-large', assetPreview);

    await click('.home-primary-navigation .home-nav-button', 2);
    await waitForSelector('.agent-extension-management-root');
    const extensions = await inspectWorkbench(evaluate, 'management', 'extension-management');
    assertManagementMain(extensions, 'extension-management');
    const extensionsScreenshot = await screenshot('extension-management-main-large');
    checkpoint('extension-management-main-large', extensions);

    await click('.home-primary-navigation .home-nav-button', 3);
    await waitForSelector('.project-management-catalog');
    const projects = await inspectWorkbench(evaluate, 'management', 'project-management');
    assertManagementMain(projects, 'project-management');
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
    await resizeWindow(evaluate, 920, 720);
    const smallAssets = await inspectWorkbench(evaluate, 'management', 'asset-management');
    assertManagementMain(smallAssets, 'asset-management');
    if (smallAssets.mainWidth < 420) {
      throw new Error('Asset Management Main became narrower than the Workbench minimum.');
    }
    const smallAssetsScreenshot = await screenshot('asset-management-main-small');
    checkpoint('asset-management-main-small', smallAssets);

    return {
      scenes: { agent, assets, extensions, projects, settings, workspace, smallAssets },
      screenshots: [
        agentScreenshot,
        assetsScreenshot,
        assetPreviewScreenshot,
        extensionsScreenshot,
        workspaceScreenshot,
        smallAssetsScreenshot,
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
      conversationCount: committed.agentHome.conversations.length,
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

async function exercisePrimarySidebar(evaluate, click, drag) {
  const initial = await evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    return projection.window.applicationSidebar;
  })()`);
  await click('.home-brand-title');
  await waitForCondition(
    evaluate,
    `document.querySelector('[data-primary-sidebar="application"]')?.classList.contains('home-navigation--compact') === true`,
    'PrimarySidebar did not enter its compact presentation.',
  );
  await click('.home-brand-title');
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
  return { initial, committed };
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
    const owner = shell?.closest('[data-dock-owner="agent"], [data-primary-surface="agent"]');
    if (!(shell instanceof HTMLElement) || !(toolbar instanceof HTMLElement) ||
        !(workspace instanceof HTMLElement) || !(owner instanceof HTMLElement)) {
      throw new Error('Agent composer presentation is incomplete.');
    }
    const shellRect = shell.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();
    const ownerRect = owner.getBoundingClientRect();
    const style = getComputedStyle(shell);
    return {
      workspaceLabel: workspace.textContent?.trim() ?? '',
      hasShadow: style.boxShadow !== 'none',
      shellWidth: shellRect.width,
      ownerWidth: ownerRect.width,
      fitsSurface: shellRect.left >= ownerRect.left && shellRect.right <= ownerRect.right,
      toolbarFitsSurface:
        toolbar.scrollWidth <= toolbar.clientWidth && toolbarRect.right <= shellRect.right,
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
    entry.dispatchEvent(new MouseEvent(${JSON.stringify(eventName)}, { bubbles: true, button: 0 }));
    return true;
  })()`);
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
    detail.branchMetadataCount !== 0 ||
    (scope === 'assistant' && !detail.workspaceLabel.includes('选择工作目录')) ||
    (scope === 'workspace' && detail.workspaceLabel !== 'workspace')
  ) {
    throw new Error(
      `Agent ${scope} composer did not preserve its compact Workspace presentation: ${JSON.stringify(detail)}`,
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
