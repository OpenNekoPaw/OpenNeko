import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const AGENT_SURFACE = '[data-primary-surface="agent"]';
const PROJECT_TRIGGER = `${AGENT_SURFACE} .agent-composer-project-trigger`;
const PROJECT_MENU = `${AGENT_SURFACE} .agent-composer-project-menu`;
const APPLICATION_NAVIGATION =
  '[data-primary-sidebar="application"] .home-primary-navigation .home-nav-button';
const SETTLE_MILLISECONDS = 750;

export const desktopAgentEntryComposerScenario = Object.freeze({
  id: 'desktop-agent-entry-composer',
  owner: '@neko/app-desktop',
  async prepare({ fixtureHome }) {
    const workspacePath = join(fixtureHome, 'workspace');
    const configRoot = join(fixtureHome, '.neko');
    await Promise.all([
      mkdir(workspacePath, { recursive: true }),
      mkdir(configRoot, { recursive: true }),
    ]);
    await writeFile(
      join(fixtureHome, '.openneko-functional-workspace-queue.json'),
      `${JSON.stringify(['workspace'])}\n`,
      'utf8',
    );
    await writeFile(
      join(configRoot, 'config.toml'),
      [
        '[[providers]]',
        'id = "functional-entry"',
        'name = "Functional Entry"',
        'type = "ollama"',
        'api_url = "http://127.0.0.1:9/api"',
        'enabled = true',
        'connection_kind = "local"',
        'protocol_profile = "ollama"',
        'requires_api_key = false',
        '',
        '[[models]]',
        'id = "functional-chat"',
        'name = "Functional Chat"',
        'provider_id = "functional-entry"',
        'type = "llm"',
        'capabilities = ["chat"]',
        'context_window = 32768',
        'max_output_tokens = 4096',
        'enabled = true',
        '',
        '[default_models.llm]',
        'provider_id = "functional-entry"',
        'model_id = "functional-chat"',
        '',
      ].join('\n'),
      { encoding: 'utf8', mode: 0o600 },
    );
    return { workspacePath };
  },
  async run({ checkpoint, click, evaluate, pressKey, screenshot, waitForSelector }) {
    await resizeWindow(evaluate, 1440, 960);
    await waitForSelector('.desktop-scene-workbench--agent-only');
    await waitForSelector(`${AGENT_SURFACE} .agent-composer-shell`);
    await waitForSelector(`${AGENT_SURFACE} .agent-model-config-trigger`);

    const initial = await inspectEntry(evaluate);
    assertLargeEntry(initial);
    const initialScreenshot = await captureSettledScreenshot(
      screenshot,
      'agent-entry-centered-large-light',
    );
    checkpoint('agent-entry-centered-large-light', initial);

    await click(`${AGENT_SURFACE} .agent-model-config-trigger`);
    await waitForSelector(`${AGENT_SURFACE} [role="dialog"]`);
    const modelDialog = await inspectModelDialog(evaluate);
    if (
      !modelDialog.visible ||
      !modelDialog.withinViewport ||
      modelDialog.hasAlternativeCategories
    ) {
      throw new Error(
        `Agent entry model configuration is not Agent-only: ${JSON.stringify(modelDialog)}`,
      );
    }
    const modelScreenshot = await captureSettledScreenshot(
      screenshot,
      'agent-entry-model-config-large-light',
    );
    checkpoint('agent-entry-model-config-large-light', modelDialog);
    await click(`${AGENT_SURFACE} .agent-model-config-trigger`);
    await waitForCondition(
      evaluate,
      `!document.querySelector('${AGENT_SURFACE} [role="dialog"]')`,
      'Agent entry model dialog did not close.',
    );

    await click(PROJECT_TRIGGER);
    await waitForSelector(PROJECT_MENU);
    const emptyProjectMenu = await inspectProjectMenu(evaluate);
    assertProjectMenu(emptyProjectMenu, 0);
    const emptyMenuScreenshot = await captureSettledScreenshot(
      screenshot,
      'agent-entry-project-menu-system-large-light',
    );
    await pressKey('Tab');
    const keyboardFocus = await evaluate(`(() => ({
      insideMenu: Boolean(document.activeElement?.closest('.agent-composer-project-menu')),
      text: document.activeElement?.textContent?.trim() ?? '',
    }))()`);
    if (!keyboardFocus.insideMenu) {
      throw new Error(
        `Project menu keyboard focus escaped the menu: ${JSON.stringify(keyboardFocus)}`,
      );
    }
    checkpoint('agent-entry-project-menu-system-large-light', {
      ...emptyProjectMenu,
      keyboardFocus,
    });

    await click(`${PROJECT_MENU} .agent-composer-project-directory button`);
    await waitForSelector('.desktop-scene-workbench--workspace');
    const systemSelection = await inspectActiveProject(evaluate);
    checkpoint('agent-entry-system-directory-selected', systemSelection);

    await click(APPLICATION_NAVIGATION, 0);
    await waitForSelector('.desktop-scene-workbench--agent-only');
    await waitForSelector(PROJECT_TRIGGER);
    await click(PROJECT_TRIGGER);
    await waitForSelector(`${PROJECT_MENU} .agent-composer-project-list button`);
    const registeredProjectMenu = await inspectProjectMenu(evaluate);
    assertProjectMenu(registeredProjectMenu, 1);
    const registeredMenuScreenshot = await captureSettledScreenshot(
      screenshot,
      'agent-entry-project-menu-registered-large-light',
    );
    checkpoint('agent-entry-project-menu-registered-large-light', registeredProjectMenu);

    await click(`${PROJECT_MENU} .agent-composer-project-list button`);
    await waitForSelector('.desktop-scene-workbench--workspace');
    const registeredSelection = await inspectActiveProject(evaluate);
    if (registeredSelection.projectId !== systemSelection.projectId) {
      throw new Error('Registered Project selection did not open the exact added Project.');
    }
    checkpoint('agent-entry-registered-project-selected', registeredSelection);

    await click(APPLICATION_NAVIGATION, 0);
    await waitForSelector('.desktop-scene-workbench--agent-only');
    await resizeWindow(evaluate, 960, 640);
    const compact = await inspectEntry(evaluate);
    assertCompactEntry(compact);
    await click(PROJECT_TRIGGER);
    await waitForSelector(PROJECT_MENU);
    const compactMenu = await inspectProjectMenu(evaluate);
    assertProjectMenu(compactMenu, 1);
    const compactScreenshot = await captureSettledScreenshot(
      screenshot,
      'agent-entry-project-menu-compact-light',
    );
    checkpoint('agent-entry-project-menu-compact-light', { ...compact, menu: compactMenu });
    await click(PROJECT_TRIGGER);

    await resizeWindow(evaluate, 1200, 800);
    await click('.home-navigation-footer__actions button:last-child');
    await waitForSelector('[data-settings-surface="main"]');
    await click('.desktop-settings__navigation .home-nav-button', 1);
    await waitForCondition(
      evaluate,
      `(() => [...document.querySelectorAll('[data-settings-surface="main"] select')]
        .some((select) => [...select.options].some((option) => option.value === 'dark')))()`,
      'Desktop Theme setting did not render.',
    );
    await selectTheme(evaluate, 'dark');
    await resizeWindow(evaluate, 960, 640);
    await click(APPLICATION_NAVIGATION, 0);
    await waitForSelector('.desktop-scene-workbench--agent-only');
    await waitForSelector(PROJECT_TRIGGER);
    await click(PROJECT_TRIGGER);
    await waitForSelector(PROJECT_MENU);
    const dark = await inspectEntry(evaluate);
    const darkMenu = await inspectProjectMenu(evaluate);
    assertCompactEntry(dark);
    assertProjectMenu(darkMenu, 1);
    const darkScreenshot = await captureSettledScreenshot(
      screenshot,
      'agent-entry-project-menu-compact-dark',
    );
    checkpoint('agent-entry-project-menu-compact-dark', { ...dark, menu: darkMenu });

    return {
      initial,
      modelDialog,
      emptyProjectMenu,
      keyboardFocus,
      systemSelection,
      registeredProjectMenu,
      registeredSelection,
      compact,
      compactMenu,
      dark,
      darkMenu,
      screenshots: [
        initialScreenshot,
        modelScreenshot,
        emptyMenuScreenshot,
        registeredMenuScreenshot,
        compactScreenshot,
        darkScreenshot,
      ],
    };
  },
});

async function inspectEntry(evaluate) {
  return evaluate(`(() => {
    const surface = document.querySelector('${AGENT_SURFACE}');
    const entry = surface?.querySelector('.agent-entry-surface');
    const panel = surface?.querySelector('.agent-empty-state--desktop-dock .agent-empty-panel');
    const composer = surface?.querySelector('.agent-composer-shell');
    const toolbar = surface?.querySelector('.agent-composer-toolbar');
    const textarea = surface?.querySelector('.agent-composer-textarea');
    if (!(surface instanceof HTMLElement) || !(entry instanceof HTMLElement) ||
        !(panel instanceof HTMLElement) || !(composer instanceof HTMLElement) ||
        !(toolbar instanceof HTMLElement) || !(textarea instanceof HTMLTextAreaElement)) {
      throw new Error('Agent entry presentation is incomplete.');
    }
    const entryRect = entry.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const composerRect = composer.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();
    const panelStyle = getComputedStyle(panel);
    const contentTop = Math.min(panelRect.top, composerRect.top);
    const contentBottom = Math.max(panelRect.bottom, composerRect.bottom);
    const contentCenter = (contentTop + contentBottom) / 2;
    const entryCenter = (entryRect.top + entryRect.bottom) / 2;
    const toolButtonTexts = [...toolbar.querySelectorAll('.agent-composer-tool-button')]
      .map((button) => button.textContent?.trim() ?? '');
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      theme: document.documentElement.dataset.nekoTheme,
      centerOffset: Math.abs(contentCenter - entryCenter),
      contentTop,
      contentBottom,
      entryTop: entryRect.top,
      entryBottom: entryRect.bottom,
      entryScrollHeight: entry.scrollHeight,
      entryClientHeight: entry.clientHeight,
      panelBorderWidth: panelStyle.borderTopWidth,
      panelBackground: panelStyle.backgroundColor,
      panelShadow: panelStyle.boxShadow,
      composerWidth: composerRect.width,
      composerWithinViewport: composerRect.left >= 0 && composerRect.right <= window.innerWidth,
      toolbarFits: toolbar.scrollWidth <= toolbar.clientWidth && toolbarRect.right <= composerRect.right,
      presentation: surface.querySelector('.agent-composer-rail')?.getAttribute('data-composer-presentation'),
      placeholder: textarea.placeholder,
      toolButtonTexts,
      hasProject: Boolean(surface.querySelector('.agent-composer-project-trigger')),
      hasModel: Boolean(surface.querySelector('.agent-model-config-trigger')),
      hasMode: Boolean(surface.querySelector('.agent-control-chip-mode')),
      hasApproval: Boolean(surface.querySelector('.agent-execution-mode-trigger')),
      hasUsage: toolButtonTexts.length > 1,
      hasSend: Boolean(surface.querySelector('.agent-composer-action-button')),
    };
  })()`);
}

async function inspectProjectMenu(evaluate) {
  return evaluate(`(() => {
    const menu = document.querySelector('${PROJECT_MENU}');
    if (!(menu instanceof HTMLElement)) throw new Error('Project menu is unavailable.');
    const rectangle = menu.getBoundingClientRect();
    const registered = [...menu.querySelectorAll('.agent-composer-project-list button')];
    const directory = menu.querySelector('.agent-composer-project-directory button');
    return {
      registeredCount: registered.length,
      registeredLabels: registered.map((button) => button.textContent?.trim() ?? ''),
      disabledCount: registered.filter((button) => button instanceof HTMLButtonElement && button.disabled).length,
      hasDirectory: directory instanceof HTMLButtonElement && !directory.disabled,
      withinViewport: rectangle.left >= 0 && rectangle.top >= 0 &&
        rectangle.right <= window.innerWidth && rectangle.bottom <= window.innerHeight,
      triggerExpanded: document.querySelector('${PROJECT_TRIGGER}')?.getAttribute('aria-expanded'),
    };
  })()`);
}

async function inspectModelDialog(evaluate) {
  return evaluate(`(() => {
    const dialog = document.querySelector('${AGENT_SURFACE} [role="dialog"]');
    const rectangle = dialog?.getBoundingClientRect();
    return {
      visible: dialog instanceof HTMLElement && rectangle !== undefined && rectangle.width > 0,
      text: dialog?.textContent?.trim() ?? '',
      hasAlternativeCategories: Boolean(dialog?.querySelector('.agent-model-config-tabs')),
      withinViewport: rectangle !== undefined && rectangle.left >= 0 && rectangle.top >= 0 &&
        rectangle.right <= window.innerWidth && rectangle.bottom <= window.innerHeight,
    };
  })()`);
}

async function inspectActiveProject(evaluate) {
  return evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    const context = projection.window.workbench.scene.context;
    if (context.kind !== 'agent' || context.scope.kind !== 'workspace') {
      throw new Error('Project selection did not activate a Workspace Agent Scene.');
    }
    const project = projection.catalog.projects.find(
      (candidate) => candidate.workspaceId === context.scope.workspaceId,
    );
    if (!project) throw new Error('Active Workspace Project is absent from the catalog.');
    return {
      projectId: project.projectId,
      workspaceId: project.workspaceId,
      displayName: project.displayName,
      projectCount: projection.catalog.projects.length,
    };
  })()`);
}

function assertLargeEntry(detail) {
  assertCommonEntry(detail);
  if (detail.centerOffset > 48 || detail.viewport.width < 1200 || detail.viewport.height < 800) {
    throw new Error(`Large Agent entry is not centered: ${JSON.stringify(detail)}`);
  }
}

function assertCompactEntry(detail) {
  assertCommonEntry(detail);
  if (
    detail.contentTop < detail.entryTop ||
    detail.contentBottom >
      detail.entryBottom + Math.max(0, detail.entryScrollHeight - detail.entryClientHeight)
  ) {
    throw new Error(`Compact Agent entry is clipped: ${JSON.stringify(detail)}`);
  }
}

function assertCommonEntry(detail) {
  if (
    detail.presentation !== 'desktop-entry' ||
    detail.panelBorderWidth !== '0px' ||
    detail.panelBackground !== 'rgba(0, 0, 0, 0)' ||
    detail.panelShadow !== 'none' ||
    detail.composerWidth > 820 ||
    !detail.composerWithinViewport ||
    !detail.toolbarFits ||
    detail.placeholder.includes('/') ||
    detail.placeholder.includes('$') ||
    detail.toolButtonTexts.length !== 1 ||
    detail.toolButtonTexts.some((text) => text === '/' || text === '$') ||
    !detail.hasProject ||
    !detail.hasModel ||
    detail.hasMode ||
    detail.hasApproval ||
    detail.hasUsage ||
    !detail.hasSend
  ) {
    throw new Error(`Agent entry controls are incomplete: ${JSON.stringify(detail)}`);
  }
}

function assertProjectMenu(detail, registeredCount) {
  if (
    detail.registeredCount !== registeredCount ||
    !detail.hasDirectory ||
    !detail.withinViewport ||
    detail.triggerExpanded !== 'true'
  ) {
    throw new Error(`Agent entry Project menu is incomplete: ${JSON.stringify(detail)}`);
  }
}

async function selectTheme(evaluate, theme) {
  await evaluate(`(() => {
    const select = [...document.querySelectorAll('[data-settings-surface="main"] select')]
      .find((candidate) => [...candidate.options].some((option) => option.value === ${JSON.stringify(theme)}));
    if (!(select instanceof HTMLSelectElement)) throw new Error('Theme selector is unavailable.');
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    if (!setter) throw new Error('Theme select setter is unavailable.');
    setter.call(select, ${JSON.stringify(theme)});
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await waitForCondition(
    evaluate,
    `document.documentElement.dataset.nekoTheme === ${JSON.stringify(theme)}`,
    `Desktop theme did not switch to ${theme}.`,
  );
}

async function resizeWindow(evaluate, width, height) {
  await evaluate(`(() => {
    window.resizeTo(${String(width)}, ${String(height)});
    return { width: window.innerWidth, height: window.innerHeight };
  })()`);
  await delay(250);
}

async function captureSettledScreenshot(screenshot, label) {
  await delay(SETTLE_MILLISECONDS);
  return screenshot(label);
}

async function waitForCondition(evaluate, expression, message, timeoutMs = 10_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await evaluate(expression)) return;
    await delay(100);
  }
  throw new Error(message);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
