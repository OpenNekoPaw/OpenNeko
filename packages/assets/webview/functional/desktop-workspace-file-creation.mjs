import { access, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openFixtureWorkspace } from '../../../../scripts/desktop-functional/desktop-operations.mjs';

export const workspaceFileCreationScenario = Object.freeze({
  id: 'workspace-file-creation',
  owner: '@neko/assets-webview',
  prepare: prepareResourceBrowserFixture,
  async run({ click, evaluate, prepared, pressKey, screenshot, type, waitForSelector }) {
    await openFixtureWorkspace(evaluate);
    await waitForSelector('.desktop-scene-workbench--workspace');
    await waitForSelector('.neko-resource-browser__sources [role="tab"]');
    await click('.neko-resource-browser__sources [role="tab"]', 0);
    await waitForResourceBrowserIdle(evaluate);
    await waitForResourceItem(evaluate, 'notes.txt');
    return verifyWorkspaceFileCreation({
      click,
      evaluate,
      pressKey,
      screenshot,
      type,
      waitForSelector,
      workspacePath: prepared.workspacePath,
    });
  },
});

export const workspaceRetiredStorageIsolationScenario = Object.freeze({
  id: 'workspace-retired-storage-isolation',
  owner: '@neko/assets-webview',
  prepare: prepareResourceBrowserFixture,
  async run({ click, evaluate, screenshot, waitForSelector }) {
    await openFixtureWorkspace(evaluate);
    await waitForSelector('.desktop-scene-workbench--workspace');
    await waitForSelector('.neko-resource-browser__sources [role="tab"]');
    await click('.neko-resource-browser__sources [role="tab"]', 0);
    await waitForResourceBrowserIdle(evaluate);
    await waitForResourceItem(evaluate, 'notes.txt');
    await clickDirectoryDisclosure(evaluate, 'neko');
    await waitForResourceItem(evaluate, 'project.json');
    const retiredStorageIsolation = await evaluate(`(() => ({
      unavailable: document.querySelector('.neko-resource-browser-status.is-error')?.textContent?.trim() ?? '',
      visibleLabels: [...document.querySelectorAll('.neko-resource-browser__item strong')]
        .map((item) => item.textContent?.trim() ?? '').filter(Boolean),
    }))()`);
    if (
      retiredStorageIsolation.unavailable ||
      retiredStorageIsolation.visibleLabels.includes('assets') ||
      !retiredStorageIsolation.visibleLabels.includes('project.json')
    ) {
      throw new Error(
        `Retired project storage was not isolated beside canonical facts: ${JSON.stringify(retiredStorageIsolation)}`,
      );
    }
    const retiredStorageScreenshot = await screenshot('workspace-retired-storage-isolated');
    return {
      retiredStorageIsolation,
      screenshots: [retiredStorageScreenshot],
    };
  },
});

async function prepareResourceBrowserFixture({ fixtureHome }) {
  const workspacePath = join(fixtureHome, 'workspace');
  await mkdir(workspacePath, { recursive: true });
  await mkdir(join(workspacePath, 'neko', 'assets', 'Retired'), { recursive: true });
  await Promise.all([
    writeFile(join(workspacePath, 'notes.txt'), 'Local workspace file.\n', 'utf8'),
    writeFile(join(workspacePath, 'episode.fountain'), 'MIO\nHello.\n', 'utf8'),
    writeFile(
      join(workspacePath, 'neko', 'assets', 'Retired', 'legacy.txt'),
      'Preserved retired linked-media bytes.\n',
      'utf8',
    ),
  ]);
  return { workspacePath };
}

async function verifyWorkspaceFileCreation({
  click,
  evaluate,
  pressKey,
  screenshot,
  type,
  waitForSelector,
  workspacePath,
  includeCut = true,
}) {
  await evaluate(`(() => {
    const surface = document.querySelector('.neko-resource-browser__items');
    if (!(surface instanceof HTMLElement)) throw new Error('Resource Browser content surface is unavailable.');
    const bounds = surface.getBoundingClientRect();
    surface.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      clientX: bounds.left + 32,
      clientY: bounds.top + 32,
    }));
    return true;
  })()`);
  await waitForSelector('.neko-resource-browser__context-menu');
  const rootActions = await readContextMenuActions(evaluate);
  assertCreationActions(rootActions, 'Workspace root context menu');
  assertAbsentManagementActions(rootActions, 'Workspace root context menu');
  const rootMenuScreenshot = await screenshot('workspace-root-create-menu');
  await pressKey('Escape');

  const toolbar = await openCreateMenu(click, evaluate);
  assertCreationActions(toolbar.actions, 'Files toolbar create menu');
  assertAbsentManagementActions(toolbar.actions, 'Files toolbar create menu');
  if (!/workspace|工作区/iu.test(toolbar.target)) {
    throw new Error(`Files toolbar did not expose its root target: ${JSON.stringify(toolbar)}`);
  }
  const toolbarScreenshot = await screenshot('workspace-files-create-menu');
  await click('.neko-resource-browser__library-menu-content button', 0);
  await typeAndCommit(type, evaluate, pressKey, 'root-notes.txt');
  await waitForCreatedItem(evaluate, 'root-notes.txt');
  if ((await readFile(join(workspacePath, 'root-notes.txt'))).byteLength !== 0) {
    throw new Error('New File did not publish a zero-byte ordinary file.');
  }

  await openCreateMenu(click, evaluate);
  await click('.neko-resource-browser__library-menu-content button', 1);
  await typeAndCommit(type, evaluate, pressKey, 'References');
  await waitForCreatedItem(evaluate, 'References');
  if (!(await stat(join(workspacePath, 'References'))).isDirectory()) {
    throw new Error('New Folder did not publish an empty directory.');
  }

  await clickResourceItem(click, evaluate, 'References');
  const directoryToolbar = await openCreateMenu(click, evaluate);
  if (!directoryToolbar.target.includes('References')) {
    throw new Error(
      `Files toolbar did not expose its selected directory target: ${JSON.stringify(directoryToolbar)}`,
    );
  }
  await click('.neko-resource-browser__library-menu-content button', 2);
  await assertFixedCreateExtension(evaluate, '.nkc');
  const canvasSuffixScreenshot = await screenshot('workspace-canvas-name-suffix');
  await typeAndCommit(type, evaluate, pressKey, 'Board');
  await waitForCreativeDocumentOpen(evaluate, 'canvas', 'Board.nkc');
  const canvasDocument = JSON.parse(
    await readFile(join(workspacePath, 'References', 'Board.nkc'), 'utf8'),
  );
  if (
    canvasDocument.name !== 'Board' ||
    canvasDocument.nodes?.length !== 0 ||
    canvasDocument.connections?.length !== 0
  ) {
    throw new Error(`New Canvas bytes are invalid: ${JSON.stringify(canvasDocument)}`);
  }
  await ensureDirectoryChildVisible(evaluate, 'References', 'Board.nkc');
  await clickResourceItem(click, evaluate, 'References');

  let cutDocument;
  if (includeCut) {
    const cutToolbar = await openCreateMenu(click, evaluate);
    if (!cutToolbar.target.includes('References')) {
      throw new Error(
        `Files toolbar did not preserve the selected directory target: ${JSON.stringify(cutToolbar)}`,
      );
    }
    await click('.neko-resource-browser__library-menu-content button', 3);
    await assertFixedCreateExtension(evaluate, '.otio');
    await typeAndCommit(type, evaluate, pressKey, 'Rough Cut');
    await waitForCreativeDocumentOpen(evaluate, 'cut', 'Rough Cut.otio');
    await waitForCondition(
      evaluate,
      `document.querySelector('[data-workbench-slot="main"] .cut-basic-editor') !== null &&
        document.querySelector('[data-workbench-slot="main"] .cut-basic-timeline') !== null`,
      'New Cut owner did not finish loading its editor and Timeline.',
    );
    cutDocument = JSON.parse(
      await readFile(join(workspacePath, 'References', 'Rough Cut.otio'), 'utf8'),
    );
    if (cutDocument.OTIO_SCHEMA !== 'Timeline.1') {
      throw new Error(`New Cut bytes are invalid: ${JSON.stringify(cutDocument)}`);
    }
    await ensureDirectoryChildVisible(evaluate, 'References', 'Rough Cut.otio');
    await clickDirectoryDisclosure(evaluate, 'References');
    await waitForCondition(
      evaluate,
      `(() => ![...document.querySelectorAll('.neko-resource-browser__item')]
        .some((item) => item.querySelector('strong')?.textContent?.trim() === 'Rough Cut.otio'))()`,
      'Directory disclosure did not collapse its children on a single click.',
    );
    await clickDirectoryDisclosure(evaluate, 'References');
    await waitForResourceItem(evaluate, 'Rough Cut.otio');
  }

  await clickResourceItem(click, evaluate, 'References');
  await pressKey('F10', ['Shift']);
  await waitForSelector('.neko-resource-browser__context-menu');
  const directoryActions = await readContextMenuActions(evaluate);
  assertCreationActions(directoryActions, 'Workspace directory context menu');
  assertAbsentManagementActions(directoryActions, 'Workspace directory context menu');
  if (!directoryActions.some((label) => /trash|废纸篓/iu.test(label))) {
    throw new Error(
      `Workspace directory context menu lost Trash: ${JSON.stringify(directoryActions)}`,
    );
  }
  const directoryMenuScreenshot = await screenshot('workspace-directory-create-menu');
  await click('.neko-resource-browser__context-menu button', 0);
  await typeAndCommit(type, evaluate, pressKey, 'context.txt');
  await waitForCreatedItem(evaluate, 'context.txt');
  await access(join(workspacePath, 'References', 'context.txt'));

  await clickResourceItem(click, evaluate, 'context.txt');
  await pressKey('F10', ['Shift']);
  await waitForSelector('.neko-resource-browser__context-menu');
  const fileActions = await readContextMenuActions(evaluate);
  if (fileActions.some((label) => /^new|^新建/iu.test(label))) {
    throw new Error(`Workspace file exposed creation actions: ${JSON.stringify(fileActions)}`);
  }
  assertAbsentManagementActions(fileActions, 'Workspace file context menu');
  await pressKey('Escape');
  const focusedLabel = await evaluate(
    `document.activeElement?.querySelector('strong')?.textContent?.trim() ?? ''`,
  );
  if (focusedLabel !== 'context.txt') {
    throw new Error(`Workspace file context focus was not restored: ${focusedLabel}`);
  }

  await openCreateMenu(click, evaluate);
  await click('.neko-resource-browser__library-menu-content button', 1);
  await type('.neko-resource-browser__create-entry input', 'Cancelled');
  await settleControlledInput(evaluate, 'Cancelled');
  await pressKey('Escape');
  const cancelState = await evaluate(`({
    editorPresent: document.querySelector('.neko-resource-browser__create-entry') !== null,
    cancelledVisible: [...document.querySelectorAll('.neko-resource-browser__item')]
      .some((item) => item.textContent?.includes('Cancelled')),
  })`);
  if (cancelState.editorPresent || cancelState.cancelledVisible) {
    throw new Error(`Inline create Escape did not cancel cleanly: ${JSON.stringify(cancelState)}`);
  }

  const externalPath = join(workspacePath, 'external-added.txt');
  await writeFile(externalPath, 'External workspace file.\n', 'utf8');
  await waitForResourceItem(evaluate, 'external-added.txt');
  await rm(externalPath);
  await waitForCondition(
    evaluate,
    `(() => ![...document.querySelectorAll('.neko-resource-browser__item')]
      .some((item) => item.textContent?.includes('external-added.txt')))()`,
    'External file removal did not reconcile automatically.',
  );

  const visibleControls = await evaluate(`(() => ({
    buttonLabels: [...document.querySelectorAll('.neko-resource-browser button')]
      .map((button) => button.getAttribute('aria-label')?.trim() ?? '').filter(Boolean),
    selected: document.querySelector('.neko-resource-browser__item-row[data-selected="true"] strong')
      ?.textContent?.trim(),
  }))()`);
  if (visibleControls.buttonLabels.some((label) => /^(?:refresh|刷新)$/iu.test(label))) {
    throw new Error(`Files exposed a normal Refresh control: ${JSON.stringify(visibleControls)}`);
  }
  if (includeCut) {
    await clickResourceItem(click, evaluate, 'Rough Cut.otio');
    await waitForCreativeDocumentOpen(evaluate, 'cut', 'Rough Cut.otio');
    await waitForCondition(
      evaluate,
      `document.querySelector('[data-workbench-slot="main"] .cut-basic-editor') !== null &&
        document.querySelector('[data-workbench-slot="main"] .cut-basic-timeline') !== null`,
      'Final Cut evidence did not settle.',
    );
  }
  const finalScreenshot = await screenshot('workspace-files-created');

  await resizeWindow(evaluate, 1440, 900);
  const narrowToolbar = await openCreateMenu(click, evaluate);
  const narrowLayout = await evaluate(`(() => {
    const menu = document.querySelector('.neko-resource-browser__library-menu-content');
    if (!(menu instanceof HTMLElement)) throw new Error('Narrow Files create menu is unavailable.');
    const bounds = menu.getBoundingClientRect();
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      bounds: { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom },
      overflowingLabels: [...menu.querySelectorAll('button span')]
        .filter((label) => label.scrollWidth > label.clientWidth)
        .map((label) => label.textContent?.trim() ?? ''),
    };
  })()`);
  if (
    narrowLayout.bounds.left < 0 ||
    narrowLayout.bounds.top < 0 ||
    narrowLayout.bounds.right > narrowLayout.viewport.width ||
    narrowLayout.bounds.bottom > narrowLayout.viewport.height ||
    narrowLayout.overflowingLabels.length > 0
  ) {
    throw new Error(`Narrow Files create menu does not fit: ${JSON.stringify(narrowLayout)}`);
  }
  const narrowScreenshot = await screenshot('workspace-files-create-menu-narrow');
  await pressKey('Escape');
  return {
    rootActions,
    toolbar,
    directoryActions,
    fileActions,
    canvasDocumentName: canvasDocument.name,
    ...(cutDocument ? { cutSchema: cutDocument.OTIO_SCHEMA } : {}),
    fixedCreativeDocumentExtensions: cutDocument ? ['.nkc', '.otio'] : ['.nkc'],
    directoryDisclosure: cutDocument ? 'single-click-collapse-expand' : 'not-exercised',
    externalObservation: 'add-remove-reconciled',
    narrowToolbar,
    narrowLayout,
    screenshots: [
      rootMenuScreenshot,
      toolbarScreenshot,
      canvasSuffixScreenshot,
      directoryMenuScreenshot,
      finalScreenshot,
      narrowScreenshot,
    ],
  };
}

async function assertFixedCreateExtension(evaluate, expectedExtension) {
  const state = await evaluate(`(() => {
    const input = document.querySelector('.neko-resource-browser__create-entry input');
    const extension = document.querySelector('.neko-resource-browser__create-entry-name > span');
    return {
      inputValue: input instanceof HTMLInputElement ? input.value : undefined,
      describedBy: input?.getAttribute('aria-describedby'),
      extensionId: extension?.id,
      extensionText: extension?.textContent?.trim(),
      extensionEditable: extension?.getAttribute('contenteditable') === 'true',
    };
  })()`);
  if (
    state.inputValue !== '' ||
    state.extensionText !== expectedExtension ||
    state.extensionEditable ||
    !state.extensionId ||
    state.describedBy !== state.extensionId
  ) {
    throw new Error(
      `Creative document extension is not fixed and accessible: ${JSON.stringify(state)}`,
    );
  }
}

async function clickDirectoryDisclosure(evaluate, label) {
  await evaluate(`(() => {
    const item = [...document.querySelectorAll('.neko-resource-browser__item')]
      .find((candidate) => candidate.querySelector('strong')?.textContent?.trim() === ${JSON.stringify(label)});
    const disclosure = item?.querySelector('.neko-resource-browser__disclosure');
    if (!(disclosure instanceof HTMLElement)) {
      throw new Error(${JSON.stringify(`Directory disclosure for '${label}' is unavailable.`)});
    }
    disclosure.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    return true;
  })()`);
}

async function resizeWindow(evaluate, width, height) {
  await evaluate(`window.resizeTo(${String(width)}, ${String(height)})`);
  await waitForCondition(
    evaluate,
    `window.innerWidth <= ${String(width)} && window.innerHeight <= ${String(height)}`,
    `Desktop window did not resize to ${String(width)}x${String(height)}.`,
  );
  await new Promise((resolve) => setTimeout(resolve, 250));
}

async function typeAndCommit(type, evaluate, pressKey, value) {
  await type('.neko-resource-browser__create-entry input', value);
  await settleControlledInput(evaluate, value);
  await pressKey('Enter');
}

async function waitForCreativeDocumentOpen(evaluate, owner, label) {
  await waitForCondition(
    evaluate,
    `(() =>
      document.querySelector('.neko-resource-browser__create-entry') === null &&
      document.querySelector('[data-workbench-slot="main"] [data-owner-root="${owner}"]') !== null &&
      document.querySelector('.neko-workbench-editor-tab[data-active="true"] .neko-workbench-editor-tab__label')
        ?.textContent?.trim() === ${JSON.stringify(label)}
    )()`,
    `Creative document '${label}' did not open in the ${owner} owner.`,
  );
}

async function ensureDirectoryChildVisible(evaluate, directoryLabel, childLabel) {
  const visible =
    await evaluate(`(() => [...document.querySelectorAll('.neko-resource-browser__item')]
    .some((item) => item.querySelector('strong')?.textContent?.trim() === ${JSON.stringify(childLabel)}))()`);
  if (!visible) {
    await clickDirectoryDisclosure(evaluate, directoryLabel);
    await waitForResourceItem(evaluate, childLabel);
  }
}

async function settleControlledInput(evaluate, value) {
  const settled = await evaluate(`new Promise((resolve) => requestAnimationFrame(() =>
    requestAnimationFrame(() => resolve(
      document.querySelector('.neko-resource-browser__create-entry input')?.value ?? ''
    ))
  ))`);
  if (settled !== value) {
    throw new Error(`Inline creation input did not settle: ${JSON.stringify(settled)}.`);
  }
}

async function waitForCreatedItem(evaluate, label) {
  await waitForCondition(
    evaluate,
    `(() => {
      const itemVisible = [...document.querySelectorAll('.neko-resource-browser__item')]
        .some((item) => item.textContent?.includes(${JSON.stringify(label)}));
      const error = document.querySelector('.neko-resource-browser__create-entry [role="alert"]')
        ?.textContent?.trim();
      const editorPresent = document.querySelector('.neko-resource-browser__create-entry') !== null;
      return itemVisible || Boolean(error) || !editorPresent;
    })()`,
    `Resource Browser creation of '${label}' did not settle.`,
  );
  const outcome = await evaluate(`(() => ({
    itemVisible: [...document.querySelectorAll('.neko-resource-browser__item')]
      .some((item) => item.textContent?.includes(${JSON.stringify(label)})),
    error: document.querySelector('.neko-resource-browser__create-entry [role="alert"]')
      ?.textContent?.trim() ?? '',
    editorPresent: document.querySelector('.neko-resource-browser__create-entry') !== null,
    mainOwner: document.querySelector('[data-workbench-slot="main"] [data-owner-root]')
      ?.getAttribute('data-owner-root') ?? '',
    visibleLabels: [...document.querySelectorAll('.neko-resource-browser__item strong')]
      .map((item) => item.textContent?.trim() ?? '').filter(Boolean),
    selectedLabel: document.querySelector('.neko-resource-browser__item-row[data-selected="true"] strong')
      ?.textContent?.trim() ?? '',
  }))()`);
  if (!outcome.itemVisible) {
    throw new Error(`Resource Browser creation of '${label}' failed: ${JSON.stringify(outcome)}`);
  }
}

async function openCreateMenu(click, evaluate) {
  await waitForCondition(
    evaluate,
    `(() => {
      const button = document.querySelector('.neko-resource-browser__library-menu > button');
      return button instanceof HTMLButtonElement && !button.disabled;
    })()`,
    'Files create menu button did not become enabled.',
  );
  await click('.neko-resource-browser__library-menu > button');
  try {
    await waitForCondition(
      evaluate,
      `document.querySelector('.neko-resource-browser__library-menu-content') !== null`,
      'Files create menu did not open.',
    );
  } catch (error) {
    const state = await evaluate(`(() => {
      const button = document.querySelector('.neko-resource-browser__library-menu > button');
      return {
        buttonCount: document.querySelectorAll('.neko-resource-browser__library-menu > button').length,
        disabled: button instanceof HTMLButtonElement ? button.disabled : undefined,
        expanded: button?.getAttribute('aria-expanded'),
        createEntry: document.querySelector('.neko-resource-browser__create-entry') !== null,
        contextMenu: document.querySelector('.neko-resource-browser__context-menu') !== null,
        activeOwner: document.querySelector('[data-workbench-slot="main"] [data-owner-root]')
          ?.getAttribute('data-owner-root'),
      };
    })()`);
    throw new Error(
      `${error instanceof Error ? error.message : String(error)} ${JSON.stringify(state)}`,
    );
  }
  return evaluate(`(() => ({
    target: document.querySelector('.neko-resource-browser__create-target')?.textContent?.trim() ?? '',
    actions: [...document.querySelectorAll('.neko-resource-browser__library-menu-content button')]
      .map((button) => button.textContent?.trim() ?? '').filter(Boolean),
  }))()`);
}

async function clickResourceItem(click, evaluate, label) {
  const index = await evaluate(`(() => {
    const items = [...document.querySelectorAll('.neko-resource-browser__item')];
    return items.findIndex((item) => item.querySelector('strong')?.textContent?.trim() === ${JSON.stringify(label)});
  })()`);
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`Resource item '${label}' is unavailable.`);
  }
  await click('.neko-resource-browser__item', index);
}

function assertCreationActions(actions, surface) {
  for (const pattern of [
    /new file|新建文件/iu,
    /new folder|新建(?:目录|文件夹)/iu,
    /new canvas|新建画布/iu,
    /new cut|新建剪辑/iu,
  ]) {
    if (!actions.some((label) => pattern.test(label))) {
      throw new Error(`${surface} is incomplete: ${JSON.stringify(actions)}`);
    }
  }
}

function assertAbsentManagementActions(actions, surface) {
  if (actions.some((label) => /import|导入|rename|重命名|refresh|刷新/iu.test(label))) {
    throw new Error(`${surface} exposed a deferred action: ${JSON.stringify(actions)}`);
  }
}

async function readContextMenuActions(evaluate) {
  return evaluate(`(() => [...document.querySelectorAll('.neko-resource-browser__context-menu button')]
    .map((button) => button.textContent?.trim() ?? '')
    .filter(Boolean))()`);
}

async function waitForResourceItem(evaluate, label) {
  await waitForCondition(
    evaluate,
    `(() => [...document.querySelectorAll('.neko-resource-browser__item')]
      .some((item) => item.textContent?.includes(${JSON.stringify(label)})))()`,
    `Resource Browser did not project '${label}'.`,
  );
}

async function waitForResourceBrowserIdle(evaluate) {
  await waitForCondition(
    evaluate,
    `(() => {
      const tabs = [...document.querySelectorAll('.neko-resource-browser__sources [role="tab"]')];
      return tabs.length === 3 && tabs.every((tab) => !(tab instanceof HTMLButtonElement) || !tab.disabled);
    })()`,
    'Resource Browser did not finish its facet transition.',
  );
}

async function waitForCondition(evaluate, expression, message, timeoutMs = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
}
