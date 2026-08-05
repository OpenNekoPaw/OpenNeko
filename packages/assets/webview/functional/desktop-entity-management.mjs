import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openFixtureWorkspace } from '../../../../scripts/desktop-functional/desktop-operations.mjs';

export const resourceBrowserEntityManagementScenario = Object.freeze({
  id: 'resource-browser-entity-management',
  owner: '@neko/assets-webview',
  async prepare({ fixtureHome }) {
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
  },
  async run({ checkpoint, click, evaluate, prepared, screenshot, type, waitForSelector }) {
    const opened = await openFixtureWorkspace(evaluate);
    await writeCanonicalEntityDocument(prepared.workspacePath, opened.project.workspaceId);
    await waitForSelector('.desktop-scene-workbench--workspace');
    await waitForSelector('.neko-resource-browser__facets [role="tab"]');
    const canonical = JSON.parse(
      await readFile(join(prepared.workspacePath, 'neko', 'entities.json'), 'utf8'),
    );
    if (
      canonical.projectId !== opened.project.workspaceId ||
      'revision' in canonical ||
      'schemaVersion' in canonical ||
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
    const fileContext = await verifyWorkspaceFileContextMenu({
      click,
      evaluate,
      type,
      waitForSelector,
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
    if (mediaRestore.visibleLabels.includes('portrait.png')) {
      throw new Error(
        `Media facet retained a stale child container: ${JSON.stringify(mediaRestore)}`,
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
      'revision' in document ||
      'schemaVersion' in document ||
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

async function verifyWorkspaceFileContextMenu({ click, evaluate, type, waitForSelector }) {
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
  if (
    !rootActions.some((label) => /new folder|新建(?:目录|文件夹)/iu.test(label)) ||
    !rootActions.some((label) => /import files|导入文件/iu.test(label))
  ) {
    throw new Error(`Workspace root context menu is incomplete: ${JSON.stringify(rootActions)}`);
  }
  await click('.neko-resource-browser__context-menu button', 0);
  await waitForSelector('.neko-resource-browser__dialog input');
  await type('.neko-resource-browser__dialog input', 'References');
  await click('.neko-resource-browser__dialog button', 0);
  await waitForResourceItem(evaluate, 'References');

  const directoryActions = await inspectContextMenu(evaluate, 'References', 'keyboard');
  if (
    !directoryActions.some((label) => /import files|导入文件/iu.test(label)) ||
    !directoryActions.some((label) => /trash|废纸篓/iu.test(label))
  ) {
    throw new Error(
      `Workspace directory context menu is incomplete: ${JSON.stringify(directoryActions)}`,
    );
  }
  await evaluate(`(() => {
    window.confirm = () => true;
    const action = [...document.querySelectorAll('.neko-resource-browser__context-menu button')]
      .find((button) => /trash|废纸篓/iu.test(button.textContent ?? ''));
    if (!(action instanceof HTMLButtonElement)) throw new Error('Workspace Trash action is unavailable.');
    action.click();
    return true;
  })()`);
  await waitForCondition(
    evaluate,
    `(() => ![...document.querySelectorAll('.neko-resource-browser__item')]
      .some((item) => item.textContent?.includes('References')))()`,
    'Workspace directory did not move to OS Trash.',
  );
  return { rootActions, directoryActions };
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
      .querySelector('.neko-resource-browser__item-row[data-selected="true"] strong')
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
