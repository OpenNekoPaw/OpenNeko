import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openFixtureWorkspace } from '../../../../scripts/desktop-functional/desktop-operations.mjs';

export const resourceBrowserEntityManagementScenario = Object.freeze({
  id: 'resource-browser-entity-management',
  owner: '@neko/assets-webview',
  async prepare({ fixtureHome }) {
    const workspacePath = join(fixtureHome, 'workspace');
    await mkdir(workspacePath, { recursive: true });
    await writeFile(join(workspacePath, 'episode.fountain'), 'MIO\nHello.\n', 'utf8');
    return { workspacePath };
  },
  async run({ checkpoint, click, evaluate, prepared, screenshot, type, waitForSelector }) {
    await openFixtureWorkspace(evaluate);
    await waitForSelector('.desktop-scene-workbench--workspace');
    await waitForSelector('.neko-resource-browser__facets [role="tab"]');
    await click('.neko-resource-browser__facets [role="tab"]', 3);
    await waitForEntityItem(evaluate, 'MIO');
    await activateEntityItem(evaluate, 'MIO');
    await waitForSelector('.neko-entity-inspector');
    const candidate = await inspectEntity(evaluate);
    if (!candidate.statusText || candidate.bindingCount !== 0 || candidate.actionCount !== 1) {
      throw new Error(`Entity candidate Inspector is invalid: ${JSON.stringify(candidate)}`);
    }
    const candidateScreenshot = await screenshot('entity-candidate-inspector');
    checkpoint('entity-candidate-inspector', candidate);

    await click('.neko-entity-inspector__actions > button');
    await waitForCondition(
      evaluate,
      `document.querySelector('.neko-entity-inspector') === null`,
      'Confirmed candidate did not invalidate its candidate selection.',
    );
    await waitForCondition(
      evaluate,
      `(() => [...document.querySelectorAll('.neko-resource-browser__item')]
        .some((item) => item.textContent?.includes('MIO')))()`,
      'Confirmed Entity did not return to the Resource Browser.',
    );
    await activateEntityItem(evaluate, 'MIO');
    await waitForSelector('.neko-entity-inspector__input-action');
    const confirmed = await inspectEntity(evaluate);
    if (
      !/confirmed|已确认|确认/iu.test(confirmed.statusText) ||
      confirmed.blockerCount < 2 ||
      confirmed.actionText.some((label) => /publish|发布|diff|差异|update|更新/iu.test(label))
    ) {
      throw new Error(`Entity owner capability gating is invalid: ${JSON.stringify(confirmed)}`);
    }
    checkpoint('entity-confirmed-reference-blockers', confirmed);

    await type('.neko-entity-inspector__input-action input', 'characters/missing.png', 1);
    await click('.neko-entity-inspector__input-action button', 1);
    await waitForSelector('.neko-entity-inspector [data-attention="true"]');
    const attention = await inspectEntity(evaluate);
    if (attention.bindingCount !== 1 || attention.attentionCount !== 1) {
      throw new Error(`Entity binding attention was not projected: ${JSON.stringify(attention)}`);
    }
    const attentionScreenshot = await screenshot('entity-binding-needs-attention');
    checkpoint('entity-binding-needs-attention', attention);

    const document = JSON.parse(
      await readFile(join(prepared.workspacePath, 'neko', 'entities.json'), 'utf8'),
    );
    const entity = document.entities?.[0];
    if (
      document.revision !== 2 ||
      document.entities?.length !== 1 ||
      entity?.names?.canonical !== 'MIO' ||
      entity?.representations?.[0]?.target?.path !== 'characters/missing.png'
    ) {
      throw new Error('Entity UI operations did not commit the expected canonical document.');
    }
    return {
      candidate,
      confirmed,
      attention,
      canonicalRevision: document.revision,
      screenshots: [candidateScreenshot, attentionScreenshot],
    };
  },
});

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

async function inspectEntity(evaluate) {
  return evaluate(`(() => {
    const inspector = document.querySelector('.neko-entity-inspector');
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

async function waitForCondition(evaluate, expression, message, timeoutMs = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
}
