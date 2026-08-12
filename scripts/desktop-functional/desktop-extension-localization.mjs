import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const EXTENSIONS_NAVIGATION =
  '[data-primary-sidebar="application"] .home-nav-button[aria-label="Extensions"], ' +
  '[data-primary-sidebar="application"] .home-nav-button[aria-label="扩展"]';
const SETTINGS_BUTTON = '.home-navigation-footer__actions button:last-child';
const SETTINGS_NAVIGATION = '.desktop-settings__navigation .home-nav-button';
const EXTENSION_ROOT = '.agent-extension-management-root';
const EXTENSION_OPTION = `${EXTENSION_ROOT} .agent-extension-catalog-row .management-surface-row__select`;
const SEARCH_INPUT = `${EXTENSION_ROOT} .management-search-field input`;

const ENGLISH_DESCRIPTION = 'Browser observation for approved domains';
const CHINESE_DESCRIPTION = '在已授权域名中提供经过审核的浏览器观察能力';

export const desktopExtensionLocalizationScenario = Object.freeze({
  id: 'desktop-extension-localization',
  owner: '@neko/agent-webview',
  async prepare({ fixtureHome }) {
    const workspacePath = join(fixtureHome, 'workspace');
    await Promise.all([
      mkdir(workspacePath, { recursive: true }),
      mkdir(join(fixtureHome, '.neko'), { recursive: true }),
    ]);
    return { workspacePath };
  },
  async run({ checkpoint, click, evaluate, screenshot, type, waitForSelector }) {
    await waitForSelector('[data-neko-controlled-workbench="true"]');
    const initialLocale = await evaluate('document.documentElement.dataset.nekoLocale');
    const initialViewport = await evaluate(
      '({ width: window.innerWidth, height: window.innerHeight })',
    );

    await openAppearanceSettings({ click, waitForSelector });
    await selectDesktopLocale(evaluate, 'en');
    await click(EXTENSIONS_NAVIGATION);
    await waitForSelector(EXTENSION_ROOT);
    const english = await inspectIntroduction({
      click,
      evaluate,
      expected: ENGLISH_DESCRIPTION,
      query: 'approved domains',
      type,
      waitForSelector,
    });
    checkpoint('extension-introduction-en', english);
    const browserControls = await inspectAutomationControls({
      evaluate,
      expectedSourceId: 'browser-use.observe.local',
      expectPermissions: false,
      waitForSelector,
    });
    checkpoint('browser-local-runtime-controls', browserControls);
    const englishScreenshot = await screenshot('extension-introduction-en');
    await scrollAutomationControlsIntoView(evaluate);
    const browserControlsScreenshot = await screenshot('browser-local-runtime-controls');

    const computerControls = await inspectComputerControls({ evaluate, waitForSelector });
    checkpoint('computer-local-runtime-controls', computerControls);
    await scrollAutomationControlsIntoView(evaluate);
    const computerScreenshot = await screenshot('computer-local-runtime-controls');

    await openAppearanceSettings({ click, waitForSelector });
    await selectDesktopLocale(evaluate, 'zh-cn');
    await click(EXTENSIONS_NAVIGATION);
    await waitForSelector(EXTENSION_ROOT);
    await evaluate('window.resizeTo(1000, 700)');
    await waitForCondition(
      evaluate,
      'window.innerWidth === 1000 && window.innerHeight === 700',
      'Desktop did not enter the compact localization viewport.',
    );
    const chinese = await inspectIntroduction({
      click,
      evaluate,
      expected: CHINESE_DESCRIPTION,
      query: '已授权域名',
      type,
      waitForSelector,
    });
    checkpoint('extension-introduction-zh-cn', chinese);
    const chineseScreenshot = await screenshot('extension-introduction-zh-cn');

    await evaluate(
      `window.resizeTo(${String(initialViewport.width)}, ${String(initialViewport.height)})`,
    );
    await waitForCondition(
      evaluate,
      `window.innerWidth === ${String(initialViewport.width)} && window.innerHeight === ${String(initialViewport.height)}`,
      'Desktop did not restore its initial localization viewport.',
    );
    await openAppearanceSettings({ click, waitForSelector });
    await selectDesktopLocale(evaluate, initialLocale);

    return {
      initialLocale,
      initialViewport,
      english,
      chinese,
      browserControls,
      computerControls,
      screenshots: [
        englishScreenshot,
        browserControlsScreenshot,
        computerScreenshot,
        chineseScreenshot,
      ],
    };
  },
  assertObservation(_observation, evidence) {
    assertIntroduction(evidence.english, 'en', ENGLISH_DESCRIPTION);
    assertIntroduction(evidence.chinese, 'zh-cn', CHINESE_DESCRIPTION);
    assertAutomationControls(evidence.browserControls, 'browser-use.observe.local', false);
    assertAutomationControls(evidence.computerControls, 'computer-use.observe.local', true);
  },
});

async function openAppearanceSettings({ click, waitForSelector }) {
  await click(SETTINGS_BUTTON);
  await waitForSelector('[data-settings-surface="main"]');
  await click(SETTINGS_NAVIGATION, 1);
  await waitForSelector(
    '[data-settings-surface="main"] .desktop-settings__card .desktop-settings__row:nth-child(2) select',
  );
}

async function inspectComputerControls({ evaluate, waitForSelector }) {
  await replaceSearch(evaluate, 'Computer Use');
  await waitForCondition(
    evaluate,
    `document.querySelectorAll(${JSON.stringify(EXTENSION_OPTION)}).length === 1 &&
      document.querySelector(${JSON.stringify(`${EXTENSION_OPTION} strong`)})?.textContent === 'Computer Use'`,
    'Computer Use search did not resolve one extension.',
  );
  await evaluate(`(() => {
    const option = document.querySelector(${JSON.stringify(EXTENSION_OPTION)});
    if (!(option instanceof HTMLButtonElement)) throw new Error('Computer Use option is unavailable.');
    option.click();
  })()`);
  await waitForSelector('[data-workbench-main-panel="extension-detail"]');
  await waitForCondition(
    evaluate,
    `document.querySelectorAll('.automation-local-runtime-management').length === 1 &&
      document.querySelector('.automation-local-runtime-row strong')?.textContent === 'Cua Driver' &&
      document.querySelectorAll('.automation-permission-management').length === 1`,
    'Computer Use automation controls did not finish updating.',
  );
  return readAutomationControls(evaluate);
}

async function replaceSearch(evaluate, value) {
  await evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(SEARCH_INPUT)});
    if (!(input instanceof HTMLInputElement)) throw new Error('Extension search is unavailable.');
    const previous = input.value;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!setter) throw new Error('Extension search setter is unavailable.');
    setter.call(input, ${JSON.stringify(value)});
    input._valueTracker?.setValue(previous);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
}

async function inspectAutomationControls({
  evaluate,
  expectedSourceId,
  expectPermissions,
  waitForSelector,
}) {
  await waitForSelector('.automation-local-runtime-management [data-local-runtime-state]');
  const result = await readAutomationControls(evaluate);
  assertAutomationControls(result, expectedSourceId, expectPermissions);
  return result;
}

async function readAutomationControls(evaluate) {
  return evaluate(`(() => ({
    localRuntimeCount: document.querySelectorAll('.automation-local-runtime-management').length,
    sourceNames: Array.from(document.querySelectorAll('.automation-local-runtime-row strong')).map(
      (item) => item.textContent ?? '',
    ),
    sourceCommands: Array.from(document.querySelectorAll('.automation-local-runtime-row code')).map(
      (item) => item.textContent ?? '',
    ),
    permissionCount: document.querySelectorAll('.automation-permission-management').length,
  }))()`);
}

async function scrollAutomationControlsIntoView(evaluate) {
  await evaluate(`(() => {
    const surface = document.querySelector('.desktop-extension-configuration-composition');
    if (!(surface instanceof HTMLElement)) throw new Error('Extension detail scroll surface is unavailable.');
    surface.scrollTo({ top: surface.scrollHeight, behavior: 'instant' });
  })()`);
  await waitForCondition(
    evaluate,
    `document.querySelector('.desktop-extension-configuration-composition')?.scrollTop > 0`,
    'Extension automation controls did not scroll into view.',
  );
}

function assertAutomationControls(result, expectedSourceId, expectPermissions) {
  const expectedName =
    expectedSourceId === 'browser-use.observe.local' ? 'Browser Use' : 'Cua Driver';
  const expectedCommand =
    expectedSourceId === 'browser-use.observe.local'
      ? "uv tool install 'browser-use[cli]'"
      : '/bin/bash -c "$(curl -fsSL https://cua.ai/driver/install.sh)"';
  if (
    result.localRuntimeCount !== 1 ||
    result.sourceNames.length !== 1 ||
    result.sourceNames[0] !== expectedName ||
    result.sourceCommands.length !== 1 ||
    result.sourceCommands[0] !== expectedCommand ||
    result.permissionCount !== (expectPermissions ? 1 : 0)
  ) {
    throw new Error(
      `Extension automation controls are not scoped to ${expectedSourceId}: ${JSON.stringify(result)}`,
    );
  }
}

async function selectDesktopLocale(evaluate, locale) {
  await evaluate(`(() => {
    const select = document.querySelectorAll('[data-settings-surface="main"] select')[1];
    if (!(select instanceof HTMLSelectElement)) {
      throw new Error('Desktop locale setting is unavailable.');
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    if (!setter) throw new Error('Desktop locale select setter is unavailable.');
    setter.call(select, ${JSON.stringify(locale)});
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await waitForCondition(
    evaluate,
    `document.documentElement.dataset.nekoLocale === ${JSON.stringify(locale)}`,
    `Desktop locale did not switch to ${locale}.`,
  );
}

async function inspectIntroduction({ click, evaluate, expected, query, type, waitForSelector }) {
  await click('[data-extension-catalog-tab="extensions"]');
  await waitForSelector(EXTENSION_OPTION);
  await type(SEARCH_INPUT, query);
  await waitForCondition(
    evaluate,
    `document.querySelectorAll(${JSON.stringify(EXTENSION_OPTION)}).length === 1`,
    `Extension search did not resolve ${query}.`,
  );
  const catalog = await evaluate(`(() => {
    const option = document.querySelector(${JSON.stringify(EXTENSION_OPTION)});
    const card = option?.closest('.agent-extension-catalog-row');
    return {
      name: option?.querySelector('strong')?.textContent ?? '',
      description: option?.querySelector('.management-surface-copy small')?.textContent ?? '',
      enablementCount: card?.querySelectorAll('[role="switch"]').length ?? 0,
    };
  })()`);
  await click(EXTENSION_OPTION);
  await waitForSelector('[data-workbench-main-panel="extension-detail"]');
  const detailDescription = await evaluate(`(() =>
    document.querySelector('.extension-configuration-header > div > p:last-child')?.textContent ?? ''
  )()`);
  const detailEnablementCount = await evaluate(
    `document.querySelectorAll('.agent-extension-configuration-root [role="switch"]').length`,
  );
  const locale = await evaluate('document.documentElement.dataset.nekoLocale');
  const result = {
    locale,
    name: catalog.name,
    catalogDescription: catalog.description,
    catalogEnablementCount: catalog.enablementCount,
    detailDescription,
    detailEnablementCount,
    query,
  };
  assertIntroduction(result, locale, expected);
  return result;
}

function assertIntroduction(result, locale, expected) {
  if (
    result.locale !== locale ||
    result.name !== 'Browser Use' ||
    result.catalogDescription !== expected ||
    result.catalogEnablementCount !== 1 ||
    result.detailDescription !== expected ||
    result.detailEnablementCount !== 0
  ) {
    throw new Error(
      `Extension introduction localization is inconsistent: ${JSON.stringify({
        locale,
        expected,
        result,
      })}`,
    );
  }
}

async function waitForCondition(evaluate, expression, message, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
}
