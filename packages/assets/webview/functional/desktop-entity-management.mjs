import { access, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openFixtureWorkspace } from '../../../../scripts/desktop-functional/desktop-operations.mjs';

export const workspaceFileCreationScenario = Object.freeze({
  id: 'workspace-file-creation',
  owner: '@neko/assets-webview',
  prepare: prepareResourceBrowserFixture,
  async run({ click, evaluate, prepared, pressKey, screenshot, type, waitForSelector }) {
    await openFixtureWorkspace(evaluate);
    await waitForSelector('.desktop-scene-workbench--workspace');
    await waitForSelector('.neko-resource-browser__facets [role="tab"]');
    await click('.neko-resource-browser__facets [role="tab"]', 0);
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

export const resourceBrowserEntityManagementScenario = Object.freeze({
  id: 'resource-browser-entity-management',
  owner: '@neko/assets-webview',
  prepare: prepareResourceBrowserFixture,
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
    const opened = await openFixtureWorkspace(evaluate);
    await writeCanonicalEntityDocument(prepared.workspacePath, opened.project.workspaceId);
    await waitForSelector('.desktop-scene-workbench--workspace');
    await waitForSelector('.neko-resource-browser__facets [role="tab"]');
    const canonical = JSON.parse(
      await readFile(join(prepared.workspacePath, 'neko', 'entities.json'), 'utf8'),
    );
    if (
      canonical.projectId !== opened.project.workspaceId ||
      Object.keys(canonical).some((field) => !['projectId', 'entities'].includes(field)) ||
      canonical.entities?.length !== 1 ||
      canonical.entities[0]?.names?.canonical !== 'Rin'
    ) {
      throw new Error(`Workspace Entity facts are not canonical: ${JSON.stringify(canonical)}`);
    }
    const resourcePresentation = await inspectResourcePresentation(evaluate);
    if (resourcePresentation.viewMode !== 'list') {
      throw new Error(
        `Resource Browser did not default to list mode: ${JSON.stringify(resourcePresentation)}`,
      );
    }

    await click('.neko-resource-browser__facets [role="tab"]', 0);
    await waitForResourceBrowserIdle(evaluate);
    await waitForResourceItem(evaluate, 'notes.txt');
    const fileContext = await verifyWorkspaceFileCreation({
      click,
      evaluate,
      pressKey,
      screenshot,
      type,
      waitForSelector,
      workspacePath: prepared.workspacePath,
    });

    await click('.neko-resource-browser__facets [role="tab"]', 1);
    await waitForResourceBrowserIdle(evaluate);
    await waitForResourceItem(evaluate, 'Assets');
    await click('.neko-resource-browser__view-modes button', 1);
    await activateResourceItem(evaluate, 'Assets', true);
    await waitForResourceItem(evaluate, 'portrait.png');
    const mediaContext = await inspectContextMenu(evaluate, 'portrait.png', 'pointer');
    if (mediaContext.some((label) => /trash|废纸篓/iu.test(label))) {
      throw new Error(`Media content exposed generic deletion: ${JSON.stringify(mediaContext)}`);
    }
    await evaluate(
      `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`,
    );
    await click('.neko-resource-browser__facets [role="tab"]', 0);
    await waitForResourceBrowserIdle(evaluate);
    await waitForResourceItem(evaluate, 'notes.txt');
    await click('.neko-resource-browser__facets [role="tab"]', 1);
    await waitForResourceBrowserIdle(evaluate);
    await waitForResourceItem(evaluate, 'Assets');
    const mediaRestore = await inspectResourcePresentation(evaluate);
    if (!mediaRestore.visibleLabels.includes('portrait.png')) {
      throw new Error(
        `Media facet did not restore its loaded child container: ${JSON.stringify(mediaRestore)}`,
      );
    }

    await click('.neko-resource-browser__facets [role="tab"]', 3);
    await waitForResourceBrowserIdle(evaluate);
    await waitForEntityItem(evaluate, 'MIO');
    await waitForEntityItem(evaluate, 'Rin');
    const entityContext = await inspectContextMenu(evaluate, 'Rin', 'pointer', false);
    if (entityContext.some((label) => /trash|废纸篓/iu.test(label))) {
      throw new Error(`Entity exposed generic deletion: ${JSON.stringify(entityContext)}`);
    }
    await evaluate(
      `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`,
    );
    await activateEntityItem(evaluate, 'MIO');
    await waitForActiveEntityDetail(evaluate, 'MIO');
    const candidate = await inspectEntity(evaluate);
    if (!candidate.statusText || candidate.bindingCount !== 0 || candidate.actionCount !== 1) {
      throw new Error(`Entity candidate Inspector is invalid: ${JSON.stringify(candidate)}`);
    }
    const candidateScreenshot = await screenshot('entity-candidate-inspector');
    checkpoint('entity-candidate-inspector', candidate);

    await click(`${ACTIVE_ENTITY_DETAIL_SELECTOR} .neko-entity-inspector__actions > button`);
    await waitForCondition(
      evaluate,
      `document.querySelector(${JSON.stringify(`${ACTIVE_ENTITY_DETAIL_SELECTOR} .neko-entity-inspector`)}) === null`,
      'Confirmed candidate did not invalidate its candidate selection.',
    );
    await waitForCondition(
      evaluate,
      `(() => [...document.querySelectorAll('.neko-resource-browser__item')]
        .some((item) => item.textContent?.includes('MIO')))()`,
      'Confirmed Entity did not return to the Resource Browser.',
    );
    await activateEntityItem(evaluate, 'MIO');
    await waitForActiveEntityDetail(evaluate, 'MIO');
    await waitForSelector(`${ACTIVE_ENTITY_DETAIL_SELECTOR} .neko-entity-inspector__input-action`);
    const confirmed = await inspectEntity(evaluate);
    if (
      !/confirmed|已确认|确认/iu.test(confirmed.statusText) ||
      confirmed.blockerCount < 2 ||
      confirmed.actionText.some((label) => /publish|发布|diff|差异|update|更新/iu.test(label))
    ) {
      throw new Error(`Entity owner capability gating is invalid: ${JSON.stringify(confirmed)}`);
    }
    checkpoint('entity-confirmed-reference-blockers', confirmed);

    await type(
      `${ACTIVE_ENTITY_DETAIL_SELECTOR} .neko-entity-inspector__input-action input`,
      'characters/missing.png',
      1,
    );
    await click(`${ACTIVE_ENTITY_DETAIL_SELECTOR} .neko-entity-inspector__input-action button`, 1);
    await waitForSelector(
      `${ACTIVE_ENTITY_DETAIL_SELECTOR} .neko-entity-inspector [data-attention="true"]`,
    );
    const attention = await inspectEntity(evaluate);
    if (attention.bindingCount !== 1 || attention.attentionCount !== 1) {
      throw new Error(`Entity binding attention was not projected: ${JSON.stringify(attention)}`);
    }
    const attentionScreenshot = await screenshot('entity-binding-needs-attention');
    checkpoint('entity-binding-needs-attention', attention);

    const document = JSON.parse(
      await readFile(join(prepared.workspacePath, 'neko', 'entities.json'), 'utf8'),
    );
    const entity = document.entities?.find((candidate) => candidate.names?.canonical === 'MIO');
    if (
      document.projectId !== opened.project.workspaceId ||
      Object.keys(document).some((field) => !['projectId', 'entities'].includes(field)) ||
      document.entities?.length !== 2 ||
      entity?.names?.canonical !== 'MIO' ||
      entity?.representations?.[0]?.target?.path !== 'characters/missing.png'
    ) {
      throw new Error(
        `Entity UI operations did not commit the expected canonical document: ${JSON.stringify(document)}`,
      );
    }
    return {
      candidate,
      confirmed,
      attention,
      canonicalEntityCount: document.entities.length,
      fileContext,
      mediaContext,
      mediaRestore,
      resourcePresentation,
      screenshots: [candidateScreenshot, attentionScreenshot],
    };
  },
});

async function prepareResourceBrowserFixture({ fixtureHome }) {
  const workspacePath = join(fixtureHome, 'workspace');
  const libraryPath = join(fixtureHome, 'media-library-assets');
  await Promise.all([
    mkdir(join(workspacePath, 'neko', 'assets'), { recursive: true }),
    mkdir(libraryPath, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(workspacePath, 'notes.txt'), 'Local workspace file.\n', 'utf8'),
    writeFile(join(workspacePath, 'episode.fountain'), 'MIO\nHello.\n', 'utf8'),
    writeFile(join(libraryPath, 'portrait.png'), ONE_PIXEL_PNG),
  ]);
  await symlink(libraryPath, join(workspacePath, 'neko', 'assets', 'Assets'), 'dir');
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
  const cutDocument = JSON.parse(
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
  await clickResourceItem(click, evaluate, 'Rough Cut.otio');
  await waitForCreativeDocumentOpen(evaluate, 'cut', 'Rough Cut.otio');
  await waitForCondition(
    evaluate,
    `document.querySelector('[data-workbench-slot="main"] .cut-basic-editor') !== null &&
      document.querySelector('[data-workbench-slot="main"] .cut-basic-timeline') !== null`,
    'Final Cut evidence did not settle.',
  );
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
    cutSchema: cutDocument.OTIO_SCHEMA,
    fixedCreativeDocumentExtensions: ['.nkc', '.otio'],
    directoryDisclosure: 'single-click-collapse-expand',
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
    await activateResourceItem(evaluate, directoryLabel, true);
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

async function inspectContextMenu(evaluate, label, input, requireMenu = true) {
  await evaluate(`(() => {
    const item = [...document.querySelectorAll('.neko-resource-browser__item')]
      .find((candidate) => candidate.textContent?.includes(${JSON.stringify(label)}));
    if (!(item instanceof HTMLButtonElement)) throw new Error('Resource item is unavailable.');
    if (${JSON.stringify(input)} === 'keyboard') {
      item.focus();
      item.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'F10', shiftKey: true }));
    } else {
      item.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 40 }));
    }
    return true;
  })()`);
  if (requireMenu) {
    await waitForCondition(
      evaluate,
      `document.querySelector('.neko-resource-browser__context-menu') !== null`,
      `Context menu did not open for '${label}'.`,
    );
  } else {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return readContextMenuActions(evaluate);
}

async function readContextMenuActions(evaluate) {
  return evaluate(`(() => [...document.querySelectorAll('.neko-resource-browser__context-menu button')]
    .map((button) => button.textContent?.trim() ?? '')
    .filter(Boolean))()`);
}

async function inspectResourcePresentation(evaluate) {
  return evaluate(`(() => {
    const items = document.querySelector('.neko-resource-browser__items');
    if (!(items instanceof HTMLElement)) throw new Error('Resource Browser items are unavailable.');
    return {
      viewMode: items.dataset.viewMode,
      visibleLabels: [...items.querySelectorAll('.neko-resource-browser__item strong')]
        .map((label) => label.textContent?.trim() ?? '')
        .filter(Boolean),
    };
  })()`);
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
      const tabs = [...document.querySelectorAll('.neko-resource-browser__facets [role="tab"]')];
      return tabs.length === 4 && tabs.every((tab) => !(tab instanceof HTMLButtonElement) || !tab.disabled);
    })()`,
    'Resource Browser did not finish its facet transition.',
  );
}

async function activateResourceItem(evaluate, label, doubleClick = false) {
  await evaluate(`(() => {
    const item = [...document.querySelectorAll('.neko-resource-browser__item')]
      .find((candidate) => candidate.textContent?.includes(${JSON.stringify(label)}));
    if (!(item instanceof HTMLButtonElement)) throw new Error('Resource item is unavailable.');
    item.dispatchEvent(new MouseEvent(${JSON.stringify(doubleClick ? 'dblclick' : 'click')}, {
      bubbles: true,
      detail: ${doubleClick ? 2 : 1},
    }));
    return true;
  })()`);
}

async function waitForEntityItem(evaluate, label) {
  await waitForCondition(
    evaluate,
    `(() => [...document.querySelectorAll('.neko-resource-browser__item')]
      .some((item) => item.textContent?.includes(${JSON.stringify(label)})))()`,
    `Resource Browser did not project Entity '${label}'.`,
  );
}

async function activateEntityItem(evaluate, label) {
  await evaluate(`(() => {
    const item = [...document.querySelectorAll('.neko-resource-browser__item')]
      .find((candidate) => candidate.textContent?.includes(${JSON.stringify(label)}));
    if (!(item instanceof HTMLButtonElement)) throw new Error('Entity item is unavailable.');
    item.click();
    return true;
  })()`);
}

async function waitForActiveEntityDetail(evaluate, label) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    const presentation = await inspectEntityDetailPresentation(evaluate);
    if (presentation.selected === label && presentation.active === label) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const presentation = await inspectEntityDetailPresentation(evaluate);
  throw new Error(
    `Resource Browser did not activate Entity detail '${label}': ${JSON.stringify(presentation)}`,
  );
}

async function inspectEntityDetailPresentation(evaluate) {
  return evaluate(`(() => ({
    selected: document
      .querySelector('[data-resource-facet-instance]:not([hidden]) .neko-resource-browser__item-row[data-selected="true"] strong')
      ?.textContent?.trim(),
    active: document
      .querySelector(${JSON.stringify(`${ACTIVE_ENTITY_DETAIL_SELECTOR} .neko-entity-inspector header strong`)})
      ?.textContent?.trim(),
    details: [...document.querySelectorAll('[data-resource-detail-instance]')].map((detail) => ({
      id: detail.getAttribute('data-resource-detail-instance'),
      active: detail.getAttribute('data-active'),
      hidden: detail.hasAttribute('hidden'),
      label: detail.querySelector('.neko-entity-inspector header strong')?.textContent?.trim(),
    })),
  }))()`);
}

async function inspectEntity(evaluate) {
  return evaluate(`(() => {
    const inspector = document.querySelector(${JSON.stringify(`${ACTIVE_ENTITY_DETAIL_SELECTOR} .neko-entity-inspector`)});
    if (!(inspector instanceof HTMLElement)) throw new Error('Entity Inspector is unavailable.');
    const actions = [...inspector.querySelectorAll('.neko-entity-inspector__actions button')]
      .map((button) => button.textContent?.trim() ?? '')
      .filter(Boolean);
    return {
      statusText: inspector.querySelector('header span')?.textContent?.trim() ?? '',
      blockerCount: inspector.querySelectorAll('.neko-entity-inspector__blockers p').length,
      bindingCount: inspector.querySelectorAll('section li[data-attention]').length,
      attentionCount: inspector.querySelectorAll('[data-attention="true"]').length,
      actionCount: actions.length,
      actionText: actions,
    };
  })()`);
}

const ACTIVE_ENTITY_DETAIL_SELECTOR = '[data-resource-detail-instance][data-active="true"]';

async function waitForCondition(evaluate, expression, message, timeoutMs = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
}

async function writeJson(target, value) {
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeCanonicalEntityDocument(workspacePath, projectId) {
  const timestamp = '2026-08-01T00:00:00.000Z';
  await writeJson(join(workspacePath, 'neko', 'entities.json'), {
    projectId,
    entities: [
      {
        entityId: 'character-rin',
        kind: 'character',
        names: { canonical: 'Rin', aliases: ['Lin'] },
        facts: {},
        representations: [],
        lifecycle: { state: 'active' },
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  });
}

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
