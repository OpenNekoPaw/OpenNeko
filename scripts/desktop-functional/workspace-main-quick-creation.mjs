import { access, copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { openFixtureWorkspace } from './desktop-operations.mjs';

const MAIN_SLOT = '[data-workbench-slot="main"]';
const SECONDARY_MAIN_SLOT = '[data-workbench-slot="secondaryMain"]';
const MENU = '.workspace-quick-create-popover__menu';
const FORM = '.workspace-quick-create-popover__form';

export const workspaceMainEmptySuggestionsScenario = Object.freeze({
  id: 'workspace-main-empty-suggestions',
  owner: '@neko/app-desktop',
  async prepare({ fixtureHome, repositoryRoot }) {
    const workspacePath = join(fixtureHome, 'workspace');
    await mkdir(workspacePath, { recursive: true });
    await copyFile(
      join(
        repositoryRoot,
        'scripts',
        'agent-eval',
        'shared-fixtures',
        'canvas-authoring-workspace',
        'boards',
        'story.nkc',
      ),
      join(workspacePath, 'Existing Canvas.nkc'),
    );
    return { workspacePath };
  },
  async run({ checkpoint, click, evaluate, screenshot, waitForSelector }) {
    await openFixtureWorkspace(evaluate);
    await waitForSelector('.desktop-scene-workbench--workspace');
    await waitForSelector('[data-workspace-canvas-context="true"] select');
    if (
      await evaluate(
        `document.querySelector('${MAIN_SLOT} .neko-workbench-editor-tab__close') !== null`,
      )
    ) {
      await click(`${MAIN_SLOT} .neko-workbench-editor-tab__close`);
    }

    await waitForSelector(`${MAIN_SLOT} [data-workspace-suggestion="default-canvas"]`);
    await waitForSelector(`${MAIN_SLOT} [data-workspace-suggestion="canvas-document"]`);
    const suggestions = await inspectWorkspaceSuggestions(evaluate);
    if (
      suggestions.workspaceId.length === 0 ||
      JSON.stringify(suggestions.labels) !==
        JSON.stringify(['workspace.nkc', 'Existing Canvas.nkc']) ||
      suggestions.defaultCanvasCount !== 1
    ) {
      throw new Error(
        `Empty Main Canvas suggestions are not Workspace-local: ${JSON.stringify(suggestions)}`,
      );
    }
    const agentCanvasIndex = await inspectAgentCanvasIndex(evaluate);
    if (
      agentCanvasIndex?.selectedId !== 'neko/boards/workspace.nkc' ||
      agentCanvasIndex.selectedLabel !== 'workspace.nkc' ||
      !agentCanvasIndex.options.some((option) => option.label === 'Existing Canvas.nkc')
    ) {
      throw new Error(
        `Agent Canvas context does not share the Workspace index: ${JSON.stringify(agentCanvasIndex)}`,
      );
    }
    checkpoint('workspace-local-empty-main-suggestions', { suggestions, agentCanvasIndex });
    const emptyScreenshot = await screenshot('workspace-main-empty-suggestions');

    await click(`${MAIN_SLOT} [data-workspace-suggestion="default-canvas"]`);
    await waitForSelector(`${MAIN_SLOT} [data-owner-root="canvas"]`);
    await waitForCondition(
      evaluate,
      `Array.from(document.querySelectorAll('${MAIN_SLOT} .neko-workbench-editor-tab__label')).some((label) => label.textContent?.trim() === 'workspace.nkc')`,
      'Default Workspace Canvas suggestion did not open workspace.nkc.',
    );
    const defaultScreenshot = await screenshot('workspace-main-empty-default-opened');

    await click(`${MAIN_SLOT} .neko-workbench-editor-tab__close`);
    await waitForSelector(`${MAIN_SLOT} [data-workspace-suggestion="canvas-document"]`);
    await click(`${MAIN_SLOT} [data-workspace-suggestion="canvas-document"]`);
    await waitForSelector(`${MAIN_SLOT} [data-owner-root="canvas"]`);
    await waitForCondition(
      evaluate,
      `Array.from(document.querySelectorAll('${MAIN_SLOT} .neko-workbench-editor-tab__label')).some((label) => label.textContent?.trim() === 'Existing Canvas.nkc')`,
      'Indexed Workspace Canvas suggestion did not open its exact document.',
    );
    const indexedScreenshot = await screenshot('workspace-main-empty-indexed-opened');
    checkpoint('workspace-local-canvas-suggestions-opened', {
      workspaceId: suggestions.workspaceId,
      opened: ['workspace.nkc', 'Existing Canvas.nkc'],
    });

    return {
      suggestions,
      agentCanvasIndex,
      screenshots: [emptyScreenshot, defaultScreenshot, indexedScreenshot],
    };
  },
});

export const workspaceMainQuickCreationScenario = Object.freeze({
  id: 'workspace-main-quick-creation',
  owner: '@neko/app-desktop',
  async prepare({ fixtureHome }) {
    const workspacePath = join(fixtureHome, 'workspace');
    await mkdir(workspacePath, { recursive: true });
    return { workspacePath };
  },
  async run({
    cdp,
    checkpoint,
    click,
    evaluate,
    prepared,
    pressKey,
    screenshot,
    type,
    waitForDesktopBridge,
    waitForSelector,
  }) {
    await openFixtureWorkspace(evaluate);
    await waitForSelector('.desktop-scene-workbench--workspace');
    const defaultCanvasWasInitiallyOpen = await evaluate(
      `document.querySelector('${MAIN_SLOT} .neko-workbench-editor-tab__close') !== null`,
    );
    if (defaultCanvasWasInitiallyOpen) {
      await click(`${MAIN_SLOT} .neko-workbench-editor-tab__close`);
    }
    await waitForSelector(`${MAIN_SLOT} [data-workspace-quick-create-trigger="empty"]`);
    await waitForSelector('[data-workspace-canvas-context="true"] select');

    const defaultAgentCanvasIndex = await inspectAgentCanvasIndex(evaluate);
    if (
      defaultAgentCanvasIndex?.selectedId !== 'neko/boards/workspace.nkc' ||
      defaultAgentCanvasIndex.selectedLabel !== 'workspace.nkc'
    ) {
      throw new Error(
        `Agent Canvas index did not expose the default Canvas file name: ${JSON.stringify(defaultAgentCanvasIndex)}`,
      );
    }
    checkpoint('agent-default-canvas-file-name', defaultAgentCanvasIndex);
    const defaultCanvasScreenshot = await screenshot('workspace-canvas-default-file-name');

    const emptyState = await inspectQuickCreationState(evaluate, MAIN_SLOT);
    assertQuickCreationState(emptyState, { empty: true });
    const workspaceSuggestions = await inspectWorkspaceSuggestions(evaluate);
    if (
      workspaceSuggestions.workspaceId.length === 0 ||
      workspaceSuggestions.labels[0] !== 'workspace.nkc' ||
      workspaceSuggestions.defaultCanvasCount !== 1
    ) {
      throw new Error(
        `Empty Main did not expose the Workspace-local default Canvas: ${JSON.stringify(workspaceSuggestions)}`,
      );
    }
    const emptyScreenshot = await screenshot('workspace-main-quick-create-empty');
    checkpoint('empty-main-entry', {
      ...emptyState,
      workspaceSuggestions,
      defaultCanvasWasInitiallyOpen,
    });

    await click(`${MAIN_SLOT} [data-workspace-suggestion="default-canvas"]`);
    await waitForSelector(`${MAIN_SLOT} [data-owner-root="canvas"]`);
    await waitForCondition(
      evaluate,
      `Array.from(document.querySelectorAll('${MAIN_SLOT} .neko-workbench-editor-tab__label')).some((label) => label.textContent?.trim() === 'workspace.nkc')`,
      'Workspace Main default Canvas suggestion did not open workspace.nkc.',
    );
    const openedDefaultScreenshot = await screenshot('workspace-main-default-canvas-opened');
    checkpoint('workspace-local-default-canvas-opened', {
      workspaceId: workspaceSuggestions.workspaceId,
      label: 'workspace.nkc',
    });
    await click(`${MAIN_SLOT} .neko-workbench-editor-tab__close`);
    await waitForSelector(`${MAIN_SLOT} [data-workspace-suggestion="default-canvas"]`);

    await openQuickCreate(
      click,
      waitForSelector,
      `${MAIN_SLOT} [data-workspace-quick-create-trigger="empty"]`,
    );
    const catalog = await inspectCatalog(evaluate);
    assertCatalog(catalog);
    const emptyMenuScreenshot = await screenshot('workspace-main-quick-create-empty-menu');
    await pressKey('Escape');

    await createEntry({
      click,
      evaluate,
      type,
      waitForSelector,
      trigger: `${MAIN_SLOT} [data-workspace-quick-create-trigger="empty"]`,
      kind: 'file',
      name: 'quick-notes.md',
    });
    await access(join(prepared.workspacePath, 'quick-notes.md'));

    await createEntry({
      click,
      evaluate,
      type,
      waitForSelector,
      trigger: `${MAIN_SLOT} [data-workspace-quick-create-trigger="empty"]`,
      kind: 'directory',
      name: 'Quick References',
    });
    if (!(await stat(join(prepared.workspacePath, 'Quick References'))).isDirectory()) {
      throw new Error('Main quick creation did not create the requested Folder.');
    }

    await createEntry({
      click,
      evaluate,
      type,
      waitForSelector,
      trigger: `${MAIN_SLOT} [data-workspace-quick-create-trigger="empty"]`,
      kind: 'canvas',
      name: 'Quick Board',
      extension: '.nkc',
    });
    await waitForCondition(
      evaluate,
      `document.querySelector('${MAIN_SLOT} [data-owner-root="canvas"]') !== null`,
      'Canvas created from Main did not open in Main.',
    );
    const canvasDocument = JSON.parse(
      await readFile(join(prepared.workspacePath, 'Quick Board.nkc'), 'utf8'),
    );
    if (canvasDocument.name !== 'Quick Board') {
      throw new Error(
        `Main quick creation wrote invalid Canvas bytes: ${JSON.stringify(canvasDocument)}`,
      );
    }
    await waitForCondition(
      evaluate,
      `Array.from(document.querySelectorAll('[data-workspace-canvas-context="true"] select option')).some((option) => option.textContent?.trim() === 'Quick Board.nkc')`,
      'Agent Canvas index did not refresh after Canvas creation.',
    );
    const agentCanvasIndex = await inspectAgentCanvasIndex(evaluate);
    if (
      agentCanvasIndex?.selectedId !== 'neko/boards/workspace.nkc' ||
      agentCanvasIndex.selectedLabel !== 'workspace.nkc' ||
      !agentCanvasIndex.options.some((option) => option.label === 'Quick Board.nkc')
    ) {
      throw new Error(
        `Agent Canvas index did not preserve the default Canvas while adding the new Canvas: ${JSON.stringify(agentCanvasIndex)}`,
      );
    }
    checkpoint('agent-canvas-index-refreshed', agentCanvasIndex);
    await evaluate(`(() => {
      const select = document.querySelector('[data-workspace-canvas-context="true"] select');
      if (!(select instanceof HTMLSelectElement)) throw new Error('Agent Canvas index is unavailable.');
      select.value = 'Quick Board.nkc';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await waitForCondition(
      evaluate,
      `document.querySelector('[data-workspace-canvas-context="true"] select')?.value === 'Quick Board.nkc'`,
      'Agent Canvas index did not accept the exact Canvas selection.',
    );
    const selectedCanvasScreenshot = await screenshot('workspace-canvas-exact-selected');
    await cdp.send('Page.reload', { ignoreCache: true });
    await waitForDesktopBridge();
    await waitForSelector('.desktop-scene-workbench--workspace');
    await waitForCondition(
      evaluate,
      `document.querySelector('[data-workspace-canvas-context="true"] select')?.value === 'Quick Board.nkc'`,
      'Agent Canvas index reset after the Desktop page root reloaded.',
    );
    const reopenedCanvasIndex = await evaluate(`(() => {
      const select = document.querySelector('[data-workspace-canvas-context="true"] select');
      if (!(select instanceof HTMLSelectElement)) return null;
      return { selectedId: select.value, selectedLabel: select.selectedOptions[0]?.textContent?.trim() ?? '' };
    })()`);
    checkpoint('agent-canvas-selection-restored-after-page-reload', reopenedCanvasIndex);
    const reopenedCanvasScreenshot = await screenshot('workspace-canvas-selection-reopened');
    const populatedState = await inspectQuickCreationState(evaluate, MAIN_SLOT);
    assertQuickCreationState(populatedState, { empty: false });
    const populatedScreenshot = await screenshot('workspace-main-quick-create-populated');
    checkpoint('populated-main-entry', populatedState);

    await openQuickCreate(
      click,
      waitForSelector,
      `${MAIN_SLOT} [data-workspace-quick-create-trigger="tab"]`,
    );
    await click('[data-workspace-quick-create-kind="file"]');
    await waitForSelector(`${FORM} input`);
    await type(`${FORM} input`, 'quick-notes.md');
    await click(`${FORM} button[type="submit"]`);
    await waitForCondition(
      evaluate,
      `document.querySelector('${FORM} [role="alert"]') !== null`,
      'A conflicting Main quick-create request did not remain fail-visible.',
    );
    const conflict = await evaluate(
      `document.querySelector('${FORM} [role="alert"]')?.textContent?.trim() ?? ''`,
    );
    if (!conflict) throw new Error('Main quick-create conflict diagnostic is empty.');
    const conflictScreenshot = await screenshot('workspace-main-quick-create-conflict');
    await pressKey('Escape');
    checkpoint('conflict-fail-visible', { diagnostic: conflict });

    await createEntry({
      click,
      evaluate,
      type,
      waitForSelector,
      trigger: `${MAIN_SLOT} [data-workspace-quick-create-trigger="tab"]`,
      kind: 'cut',
      name: 'Quick Cut',
      extension: '.otio',
    });
    await waitForCondition(
      evaluate,
      `document.querySelector('${MAIN_SLOT} [data-owner-root="cut"]') !== null`,
      'Cut created from Main did not open in Main.',
    );
    const cutDocument = JSON.parse(
      await readFile(join(prepared.workspacePath, 'Quick Cut.otio'), 'utf8'),
    );
    if (cutDocument.OTIO_SCHEMA !== 'Timeline.1') {
      throw new Error(
        `Main quick creation wrote invalid Cut bytes: ${JSON.stringify(cutDocument)}`,
      );
    }

    await addEmptySecondaryMain(evaluate);
    await waitForSelector(`${SECONDARY_MAIN_SLOT} [data-workspace-quick-create-trigger="empty"]`);
    await createEntry({
      click,
      evaluate,
      type,
      waitForSelector,
      trigger: `${SECONDARY_MAIN_SLOT} [data-workspace-quick-create-trigger="empty"]`,
      kind: 'canvas',
      name: 'Secondary Board',
      extension: '.nkc',
    });
    await waitForCondition(
      evaluate,
      `document.querySelector('${SECONDARY_MAIN_SLOT} [data-owner-root="canvas"]') !== null`,
      'Secondary Main quick creation did not open in its originating group.',
    );
    const splitState = await inspectSplitState(evaluate);
    if (splitState.activeGroupId !== 'main:secondary' || !splitState.secondaryHasCanvas) {
      throw new Error(
        `Main quick creation lost its exact split target: ${JSON.stringify(splitState)}`,
      );
    }
    const splitScreenshot = await screenshot('workspace-main-quick-create-secondary');
    checkpoint('exact-secondary-main-target', splitState);

    for (const name of ['Dense One', 'Dense Two', 'Dense Three']) {
      await createEntry({
        click,
        evaluate,
        type,
        waitForSelector,
        trigger: `${SECONDARY_MAIN_SLOT} [data-workspace-quick-create-trigger="tab"]`,
        kind: 'canvas',
        name,
        extension: '.nkc',
      });
    }
    await resizeWindow(evaluate, 960, 640);
    await openQuickCreate(
      click,
      waitForSelector,
      `${SECONDARY_MAIN_SLOT} [data-workspace-quick-create-trigger="tab"]`,
    );
    const narrowState = await inspectCatalog(evaluate);
    assertCatalog(narrowState);
    if (
      narrowState.bounds.left < 0 ||
      narrowState.bounds.top < 0 ||
      narrowState.bounds.right > narrowState.viewport.width ||
      narrowState.bounds.bottom > narrowState.viewport.height
    ) {
      throw new Error(
        `Main quick-create menu overflowed the narrow window: ${JSON.stringify(narrowState)}`,
      );
    }
    const narrowScreenshot = await screenshot('workspace-main-quick-create-dense-narrow');
    await pressKey('Escape');
    checkpoint('dense-tabs-narrow-window', {
      ...narrowState,
      split: await inspectSplitState(evaluate),
    });

    return {
      created: ['quick-notes.md', 'Quick References', 'Quick Board.nkc', 'Quick Cut.otio'],
      canvasName: canvasDocument.name,
      cutSchema: cutDocument.OTIO_SCHEMA,
      catalog,
      conflict,
      splitState,
      narrowState,
      defaultAgentCanvasIndex,
      agentCanvasIndex,
      reopenedCanvasIndex,
      screenshots: [
        defaultCanvasScreenshot,
        emptyScreenshot,
        openedDefaultScreenshot,
        emptyMenuScreenshot,
        selectedCanvasScreenshot,
        reopenedCanvasScreenshot,
        populatedScreenshot,
        conflictScreenshot,
        splitScreenshot,
        narrowScreenshot,
      ],
    };
  },
});

async function createEntry({
  click,
  evaluate,
  extension,
  kind,
  name,
  trigger,
  type,
  waitForSelector,
}) {
  await openQuickCreate(click, waitForSelector, trigger);
  await click(`[data-workspace-quick-create-kind="${kind}"]`);
  await waitForSelector(`${FORM} input`);
  if (extension) {
    const visibleExtension = await evaluate(
      `document.querySelector('${FORM} .workspace-quick-create-popover__name-field > span')?.textContent?.trim() ?? ''`,
    );
    if (visibleExtension !== extension) {
      throw new Error(
        `Main quick-create extension is not fixed: ${JSON.stringify(visibleExtension)}`,
      );
    }
  }
  await type(`${FORM} input`, name);
  await click(`${FORM} button[type="submit"]`);
  await waitForCondition(
    evaluate,
    `document.querySelector('${FORM}') === null || document.querySelector('${FORM} [role="alert"]') !== null`,
    `Main quick creation of '${name}' did not settle.`,
  );
  const diagnostic = await evaluate(
    `document.querySelector('${FORM} [role="alert"]')?.textContent?.trim() ?? ''`,
  );
  if (diagnostic) throw new Error(`Main quick creation of '${name}' failed: ${diagnostic}`);
}

async function openQuickCreate(click, waitForSelector, trigger) {
  await click(trigger);
  await waitForSelector(MENU);
}

async function inspectQuickCreationState(evaluate, slot) {
  return evaluate(`(() => {
    const root = document.querySelector(${JSON.stringify(slot)});
    return {
      empty: root?.querySelector('[data-empty-main="true"]') !== null,
      tabTriggers: root?.querySelectorAll('[data-workspace-quick-create-trigger="tab"]').length ?? 0,
      emptyTriggers: root?.querySelectorAll('[data-workspace-quick-create-trigger="empty"]').length ?? 0,
      tabLabels: [...(root?.querySelectorAll('.neko-workbench-editor-tab__label') ?? [])]
        .map((label) => label.textContent?.trim() ?? ''),
    };
  })()`);
}

async function inspectWorkspaceSuggestions(evaluate) {
  return evaluate(`(() => {
    const root = document.querySelector('${MAIN_SLOT} [data-workspace-suggestions]');
    if (!(root instanceof HTMLElement)) return { workspaceId: '', labels: [], defaultCanvasCount: 0 };
    return {
      workspaceId: root.getAttribute('data-workspace-suggestions') ?? '',
      labels: [...root.querySelectorAll('.workspace-empty-main-suggestions__copy strong')]
        .map((label) => label.textContent?.trim() ?? ''),
      defaultCanvasCount: root.querySelectorAll('[data-workspace-suggestion="default-canvas"]').length,
    };
  })()`);
}

async function inspectAgentCanvasIndex(evaluate) {
  return evaluate(`(() => {
    const select = document.querySelector('[data-workspace-canvas-context="true"] select');
    if (!(select instanceof HTMLSelectElement)) return null;
    return {
      selectedId: select.value,
      selectedLabel: select.selectedOptions[0]?.textContent?.trim() ?? '',
      options: Array.from(select.options).map((option) => ({
        id: option.value,
        label: option.textContent?.trim() ?? '',
      })),
    };
  })()`);
}

function assertQuickCreationState(state, expected) {
  if (
    state.empty !== expected.empty ||
    state.tabTriggers !== 1 ||
    state.emptyTriggers !== (expected.empty ? 1 : 0)
  ) {
    throw new Error(`Workspace Main quick-create placement is invalid: ${JSON.stringify(state)}`);
  }
}

async function inspectCatalog(evaluate) {
  return evaluate(`(() => {
    const menu = document.querySelector('${MENU}');
    if (!(menu instanceof HTMLElement)) throw new Error('Main quick-create menu is unavailable.');
    const bounds = menu.getBoundingClientRect();
    return {
      target: menu.querySelector('.workspace-quick-create-popover__target')?.textContent?.trim() ?? '',
      kinds: [...menu.querySelectorAll('[data-workspace-quick-create-kind]')]
        .map((item) => item.getAttribute('data-workspace-quick-create-kind')),
      bounds: { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom },
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  })()`);
}

function assertCatalog(catalog) {
  if (
    !/workspace root|工作区根目录/iu.test(catalog.target) ||
    JSON.stringify(catalog.kinds) !== JSON.stringify(['canvas', 'cut', 'file', 'directory'])
  ) {
    throw new Error(`Main quick-create catalog is invalid: ${JSON.stringify(catalog)}`);
  }
}

async function addEmptySecondaryMain(evaluate) {
  await evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    const instance = projection.window.workbench;
    const current = instance.layout;
    await window.openNekoDesktop.workbench.update(instance.workbenchInstanceId, {
      ...current,
      main: {
        ...current.main,
        groups: [
          current.main.groups[0],
          { groupId: 'main:secondary', viewIds: [] },
        ],
        split: { axis: 'columns', ratio: 0.5 },
      },
    });
    return true;
  })()`);
}

async function inspectSplitState(evaluate) {
  return evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    return {
      activeGroupId: projection.window.workbench.layout.main.activeGroupId,
      primaryTabs: document.querySelectorAll('${MAIN_SLOT} .neko-workbench-editor-tab').length,
      secondaryTabs: document.querySelectorAll('${SECONDARY_MAIN_SLOT} .neko-workbench-editor-tab').length,
      secondaryHasCanvas: document.querySelector('${SECONDARY_MAIN_SLOT} [data-owner-root="canvas"]') !== null,
    };
  })()`);
}

async function resizeWindow(evaluate, width, height) {
  await evaluate(
    `window.openNekoDesktop.functional.resizeWindow(${String(width)}, ${String(height)})`,
  );
  await waitForCondition(
    evaluate,
    `window.innerWidth <= ${String(width)} && window.innerHeight <= ${String(height)}`,
    `Desktop window did not resize to ${String(width)}x${String(height)}.`,
  );
}

async function waitForCondition(evaluate, expression, message, timeoutMs = 20_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
}
