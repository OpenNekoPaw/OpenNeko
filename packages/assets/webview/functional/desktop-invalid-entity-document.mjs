import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openFixtureWorkspace } from '../../../../scripts/desktop-functional/desktop-operations.mjs';

export const resourceBrowserInvalidEntityDocumentScenario = Object.freeze({
  id: 'resource-browser-invalid-entity-document',
  owner: '@neko/assets-webview',
  async prepare({ fixtureHome }) {
    const workspacePath = join(fixtureHome, 'workspace');
    await mkdir(join(workspacePath, 'neko'), { recursive: true });
    await writeFile(join(workspacePath, 'notes.txt'), 'Local workspace file.\n', 'utf8');
    return { workspacePath };
  },
  async run({ checkpoint, click, evaluate, prepared, screenshot, waitForSelector }) {
    await openFixtureWorkspace(evaluate);
    await writeInvalidEntityDocument(prepared.workspacePath);
    await waitForSelector('.desktop-scene-workbench--workspace');
    await waitForSelector('.neko-resource-browser__sources [role="tab"]');

    await click('.neko-resource-browser__sources [role="tab"]', 3);
    await waitForResourceBrowserIdle(evaluate);
    await waitForCondition(
      evaluate,
      `(() => {
        const diagnostic = document.querySelector('.neko-resource-browser__diagnostics');
        return diagnostic?.textContent?.includes('unsupported fields: unsupportedField') === true &&
          diagnostic.textContent.includes('workspace-foreign') &&
          document.querySelector('.neko-resource-browser-status.is-error') === null;
      })()`,
      'Invalid Project Entity document did not remain inside the Entity source.',
    );
    const entityState = await inspectState(evaluate);
    const entityScreenshot = await screenshot('entity-document-local-diagnostic');
    checkpoint('entity-document-local-diagnostic', entityState);

    await click('.neko-resource-browser__sources [role="tab"]', 0);
    await waitForResourceBrowserIdle(evaluate);
    await waitForCondition(
      evaluate,
      `(() => [...document.querySelectorAll('.neko-resource-browser__item')]
        .some((item) => item.textContent?.includes('notes.txt')))()`,
      'Files source was unavailable beside the invalid Entity document.',
    );
    const filesState = await inspectState(evaluate);
    const filesScreenshot = await screenshot('files-beside-invalid-entity-document');
    checkpoint('files-beside-invalid-entity-document', filesState);

    return {
      entityState,
      filesState,
      screenshots: [entityScreenshot, filesScreenshot],
    };
  },
});

async function inspectState(evaluate) {
  return evaluate(`(() => ({
    activeSource: document.querySelector('.neko-resource-browser__sources [aria-selected="true"]')
      ?.textContent?.trim(),
    diagnostics: [...document.querySelectorAll('.neko-resource-browser__diagnostics span')]
      .map((item) => item.textContent?.trim() ?? '')
      .filter(Boolean),
    visibleItems: [...document.querySelectorAll('.neko-resource-browser__item strong')]
      .map((item) => item.textContent?.trim() ?? '')
      .filter(Boolean),
    resourceBrowserUnavailable: document.querySelector('.neko-resource-browser-status.is-error') !== null,
  }))()`);
}

async function waitForResourceBrowserIdle(evaluate) {
  await waitForCondition(
    evaluate,
    `(() => {
      const tabs = [...document.querySelectorAll('.neko-resource-browser__sources [role="tab"]')];
      return tabs.length === 4 && tabs.every((tab) => !(tab instanceof HTMLButtonElement) || !tab.disabled);
    })()`,
    'Resource Browser did not finish its source transition.',
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

async function writeInvalidEntityDocument(workspacePath) {
  const timestamp = '2026-08-01T00:00:00.000Z';
  await writeFile(
    join(workspacePath, 'neko', 'entities.json'),
    `${JSON.stringify(
      {
        projectId: 'workspace-foreign',
        unsupportedField: 'preserved',
        entities: [
          {
            entityId: 'character-foreign',
            kind: 'character',
            names: { canonical: 'Foreign', aliases: [] },
            facts: {},
            representations: [],
            lifecycle: { state: 'active' },
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}
