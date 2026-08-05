import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ASSET_LABEL = 'record-only-removal.png';

export const assetLibraryRecordRemovalScenario = Object.freeze({
  id: 'asset-library-record-removal',
  owner: '@neko/assets-webview',
  async prepare({ fixtureHome }) {
    const workspacePath = join(fixtureHome, 'workspace');
    const assetPath = join(fixtureHome, '.neko', 'assets', ASSET_LABEL);
    await Promise.all([
      mkdir(workspacePath, { recursive: true }),
      mkdir(join(fixtureHome, '.neko', 'assets'), { recursive: true }),
    ]);
    await writeFile(assetPath, 'record-only-source-bytes', 'utf8');
    return {
      workspacePath,
      assetPath,
      sourceDigest: digest(await readFile(assetPath)),
    };
  },
  async run({ checkpoint, evaluate, prepared, restartApplication, screenshot, waitForSelector }) {
    await openAssetLibrary(evaluate, waitForSelector);
    await waitForAssetPresence(evaluate, true);
    await evaluate(`(() => {
      window.__openNekoRecordRemovalConfirmation = undefined;
      window.confirm = (message) => {
        window.__openNekoRecordRemovalConfirmation = String(message);
        return true;
      };
      const entry = [...document.querySelectorAll('.global-library-browser__entry')]
        .find((candidate) => candidate.querySelector('strong')?.textContent?.trim() === ${JSON.stringify(ASSET_LABEL)});
      if (!(entry instanceof HTMLElement)) throw new Error('Fixture Asset entry is unavailable.');
      const remove = [...entry.querySelectorAll('button')].find((button) =>
        /Remove Asset Library record|移除素材记录/u.test(button.getAttribute('aria-label') ?? ''),
      );
      if (!(remove instanceof HTMLButtonElement)) {
        throw new Error('Record-only Asset removal action is unavailable.');
      }
      remove.click();
      return true;
    })()`);
    await waitForAssetPresence(evaluate, false);
    const confirmation = await evaluate(`window.__openNekoRecordRemovalConfirmation ?? ''`);
    if (!/source file will be preserved|源文件会保留/iu.test(confirmation)) {
      throw new Error(
        `Asset removal confirmation did not preserve source semantics: ${confirmation}`,
      );
    }
    const sourceDigestAfterRemoval = digest(await readFile(prepared.assetPath));
    if (sourceDigestAfterRemoval !== prepared.sourceDigest) {
      throw new Error('Asset record removal changed the source file bytes.');
    }
    const removedScreenshot = await screenshot('asset-record-removed-source-preserved');
    checkpoint('asset-record-removed-source-preserved', { confirmation, sourceDigestAfterRemoval });

    await restartApplication();
    await openAssetLibrary(evaluate, waitForSelector);
    await waitForAssetPresence(evaluate, false);
    const sourceDigestAfterRestart = digest(await readFile(prepared.assetPath));
    if (sourceDigestAfterRestart !== prepared.sourceDigest) {
      throw new Error('Asset source bytes changed after application restart.');
    }
    const restartScreenshot = await screenshot('asset-record-absent-after-restart');
    checkpoint('asset-record-absent-after-restart', { sourceDigestAfterRestart });
    return {
      confirmation,
      sourceDigestBefore: prepared.sourceDigest,
      sourceDigestAfterRemoval,
      sourceDigestAfterRestart,
      screenshots: [removedScreenshot, restartScreenshot],
    };
  },
});

async function openAssetLibrary(evaluate, waitForSelector) {
  await waitForSelector(
    '[data-owner-root="asset-management"], .home-primary-navigation .home-nav-button',
  );
  const visibleAfterStartup = await evaluate(
    `Boolean(document.querySelector('[data-owner-root="asset-management"]'))`,
  );
  if (!visibleAfterStartup) {
    await evaluate(`(() => {
      const button = document.querySelectorAll('.home-primary-navigation .home-nav-button')[1];
      if (!(button instanceof HTMLButtonElement)) throw new Error('Asset Center navigation is unavailable.');
      button.click();
      return true;
    })()`);
  }
  await waitForSelector('[data-owner-root="asset-management"]');
  await evaluate(`(() => {
    const button = [...document.querySelectorAll('.global-library-browser__facets button')]
      .find((candidate) => /^(Asset Library|资产库)$/u.test(candidate.textContent?.trim() ?? ''));
    if (!(button instanceof HTMLButtonElement)) throw new Error('Asset Library facet is unavailable.');
    if (button.getAttribute('aria-pressed') !== 'true') button.click();
    return true;
  })()`);
  await waitForCondition(
    evaluate,
    `document.querySelector('[data-owner-root="asset-management"]')?.getAttribute('data-catalog-status') === 'ready'`,
    'Asset Library catalog did not become ready.',
  );
}

async function waitForAssetPresence(evaluate, expected) {
  await waitForCondition(
    evaluate,
    `(() => [...document.querySelectorAll('.global-library-browser__entry strong')]
      .some((element) => element.textContent?.trim() === ${JSON.stringify(ASSET_LABEL)}))() === ${JSON.stringify(expected)}`,
    expected
      ? 'Fixture Asset did not enter the Asset Library membership projection.'
      : 'Removed Asset membership remained visible.',
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

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
