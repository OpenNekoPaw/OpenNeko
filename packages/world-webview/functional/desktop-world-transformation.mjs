import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const APPLICATION_NAVIGATION_BUTTON_SELECTOR =
  '[data-primary-sidebar="application"] .home-primary-navigation .home-nav-button';
const WORLD_ROOT_SELECTOR = '[data-world-foundation="true"]';
const TRANSFORMATION_SELECTOR = '.world-foundation__transformation';
const VISUAL_SETTLE_MILLISECONDS = 800;

export const desktopWorldTransformationScenario = Object.freeze({
  id: 'desktop-world-transformation',
  owner: '@neko/world-webview',
  async prepare({ fixtureHome }) {
    const workspacePath = join(fixtureHome, 'workspace');
    await mkdir(workspacePath, { recursive: true });
    return { workspacePath };
  },
  async run({
    checkpoint,
    click,
    evaluate,
    restartApplication,
    screenshot,
    type,
    waitForDesktopBridge,
    waitForSelector,
  }) {
    await resizeDesktopWindow(evaluate, 1800, 1000);
    await openWorldFoundation(evaluate, click, waitForSelector);

    await type(`${WORLD_ROOT_SELECTOR} .world-foundation__form-grid input`, 'Lantern City');
    await type(
      `${WORLD_ROOT_SELECTOR} .world-foundation__form-grid textarea`,
      'A city whose weather changes the routes available to its residents.',
      0,
    );
    await type(
      `${WORLD_ROOT_SELECTOR} .world-foundation__form-grid textarea`,
      'city.weather = "clear"',
      4,
    );
    await clickButtonByText(evaluate, ['Create project', '创建项目']);
    await waitForCondition(
      evaluate,
      `document.querySelector(${JSON.stringify(`${WORLD_ROOT_SELECTOR} .world-foundation__studio h2`)})?.textContent?.trim() === 'Lantern City'`,
      'World project did not enter the Studio after creation.',
    );

    await selectFirstMatchingOption(
      evaluate,
      `${WORLD_ROOT_SELECTOR} select[aria-label="Review status"], ${WORLD_ROOT_SELECTOR} select[aria-label="审核状态"]`,
      'ready',
    );
    await waitForCondition(
      evaluate,
      `document.querySelector(${JSON.stringify(`${WORLD_ROOT_SELECTOR} .world-foundation__status`)})?.classList.contains('is-ready') === true`,
      'World project did not enter the publishable review state.',
    );
    await setControlledValue(
      evaluate,
      `${WORLD_ROOT_SELECTOR} input[aria-label="Version label"], ${WORLD_ROOT_SELECTOR} input[aria-label="版本名称"]`,
      'Lantern City foundation',
    );
    await clickButtonByText(evaluate, ['Publish version', '发布版本']);
    await waitForCondition(
      evaluate,
      `document.querySelector(${JSON.stringify(`${WORLD_ROOT_SELECTOR} .world-foundation__versions`)})?.textContent?.includes('Lantern City foundation') === true`,
      'Published World version did not become visible.',
    );

    await selectFirstNonEmptyOption(
      evaluate,
      `${WORLD_ROOT_SELECTOR} select[aria-label="World version"], ${WORLD_ROOT_SELECTOR} select[aria-label="世界版本"]`,
    );
    await clickButtonByText(evaluate, ['Start preview', '开始预览']);
    await waitForSelector(`${WORLD_ROOT_SELECTOR} .world-foundation__runtime-meta`);
    await waitForCondition(
      evaluate,
      `document.querySelector(${JSON.stringify(`${WORLD_ROOT_SELECTOR} .world-foundation__fact`)})?.textContent?.includes('city.weather') === true`,
      'Foundation preview did not expose the published initial fact.',
    );

    await setControlledValue(
      evaluate,
      `${WORLD_ROOT_SELECTOR} textarea[aria-label="Transformation intent"], ${WORLD_ROOT_SELECTOR} textarea[aria-label="改造意图"]`,
      'Turn the clear afternoon into rain so the city opens its covered passages.',
    );
    await type(
      `${WORLD_ROOT_SELECTOR} input[aria-label="Fact key"], ${WORLD_ROOT_SELECTOR} input[aria-label="事实键"]`,
      'city.weather',
    );
    await setControlledValue(
      evaluate,
      `${WORLD_ROOT_SELECTOR} input[aria-label="JSON value"], ${WORLD_ROOT_SELECTOR} input[aria-label="JSON 值"]`,
      '"rain"',
    );
    await clickButtonByText(evaluate, ['Prepare candidate', '生成候选']);
    await waitForSelector(TRANSFORMATION_SELECTOR);
    await waitForCondition(
      evaluate,
      `document.querySelector(${JSON.stringify(TRANSFORMATION_SELECTOR)})?.textContent?.match(/Review|待审阅/u) !== null`,
      'World transformation candidate did not enter review.',
    );
    const review = await inspectWorldTransformation(evaluate);
    if (
      review.eventCount !== 0 ||
      review.revision !== 'r0 · t0' ||
      !review.currentFacts.includes('city.weather"clear"') ||
      !review.candidateText.includes('replace') ||
      !review.candidateText.includes('world-action:world.foundation.fact.set') ||
      !review.candidateText.match(/Direct author input|当前作者直接输入/u)
    ) {
      throw new Error(
        `World candidate review mutated state early or omitted required evidence: ${JSON.stringify(review)}`,
      );
    }
    await delay(VISUAL_SETTLE_MILLISECONDS);
    const reviewScreenshot = await screenshot('world-transformation-candidate-review');
    checkpoint('world-transformation-candidate-review', review);

    await click(`${TRANSFORMATION_SELECTOR} > .is-primary`);
    await waitForCondition(
      evaluate,
      `document.querySelector(${JSON.stringify(TRANSFORMATION_SELECTOR)})?.textContent?.match(/Committed|已提交/u) !== null`,
      'World transformation did not report its committed state.',
    );
    await waitForCondition(
      evaluate,
      `(() => {
        const facts = [...document.querySelectorAll(${JSON.stringify(`${WORLD_ROOT_SELECTOR} .world-foundation__fact`)})]
          .map((item) => item.textContent?.replaceAll(/\\s/gu, '') ?? '');
        return facts.some((item) => item.includes('city.weather"rain"'));
      })()`,
      'Committed World transformation did not update the canonical fact projection.',
    );
    const committed = await inspectWorldTransformation(evaluate);
    if (
      committed.eventCount !== 1 ||
      committed.revision !== 'r1 · t1' ||
      !committed.currentFacts.includes('city.weather"rain"') ||
      !committed.candidateText.match(
        /Exact capability resolved and committed through the WorldRuntime event path|精确能力已解析，并通过 WorldRuntime 事件链提交/u,
      )
    ) {
      throw new Error(
        `World transformation did not converge through the canonical runtime path: ${JSON.stringify(committed)}`,
      );
    }
    await delay(VISUAL_SETTLE_MILLISECONDS);
    const committedScreenshot = await screenshot('world-transformation-committed');
    checkpoint('world-transformation-committed', committed);

    await resizeDesktopWindow(evaluate, 960, 640);
    await delay(VISUAL_SETTLE_MILLISECONDS);
    const compact = await inspectWorldLayout(evaluate);
    if (
      compact.viewportWidth > 1000 ||
      compact.workspaceColumns !== 2 ||
      compact.previewColumn !== '2' ||
      compact.horizontalOverflow
    ) {
      throw new Error(`Compact World layout did not reflow safely: ${JSON.stringify(compact)}`);
    }
    const compactScreenshot = await screenshot('world-transformation-compact-layout');
    checkpoint('world-transformation-compact-layout', compact);

    await restartApplication();
    await waitForDesktopBridge(60_000);
    await resizeDesktopWindow(evaluate, 1800, 1000);
    await openWorldFoundation(evaluate, click, waitForSelector);
    await waitForCondition(
      evaluate,
      `(() => {
        const facts = [...document.querySelectorAll(${JSON.stringify(`${WORLD_ROOT_SELECTOR} .world-foundation__fact`)})]
          .map((item) => item.textContent?.replaceAll(/\\s/gu, '') ?? '');
        return facts.some((item) => item.includes('city.weather"rain"'));
      })()`,
      'Committed World transformation did not recover after application restart.',
    );
    const recovered = await inspectWorldTransformation(evaluate);
    if (recovered.eventCount !== 1 || recovered.candidateVisible) {
      throw new Error(
        `World restart mixed durable runtime facts with disposable candidate presentation: ${JSON.stringify(recovered)}`,
      );
    }
    await delay(VISUAL_SETTLE_MILLISECONDS);
    const recoveredScreenshot = await screenshot('world-transformation-recovered');
    checkpoint('world-transformation-recovered', recovered);

    return {
      review,
      committed,
      compact,
      recovered,
      screenshots: [reviewScreenshot, committedScreenshot, compactScreenshot, recoveredScreenshot],
    };
  },
});

async function openWorldFoundation(evaluate, click, waitForSelector) {
  await waitForSelector(
    `${WORLD_ROOT_SELECTOR}, ${APPLICATION_NAVIGATION_BUTTON_SELECTOR}`,
    60_000,
  );
  const visible = await evaluate(
    `Boolean(document.querySelector(${JSON.stringify(WORLD_ROOT_SELECTOR)}))`,
  );
  if (!visible) {
    await click(APPLICATION_NAVIGATION_BUTTON_SELECTOR, 2);
  }
  await waitForSelector(WORLD_ROOT_SELECTOR);
  await waitForCondition(
    evaluate,
    `document.querySelector(${JSON.stringify(WORLD_ROOT_SELECTOR)})?.textContent?.match(/World library|世界资料库/u) !== null`,
    'World Foundation did not finish loading.',
  );
}

async function clickButtonByText(evaluate, labels) {
  await evaluate(`(() => {
    const labels = ${JSON.stringify(labels)};
    const button = [...document.querySelectorAll(${JSON.stringify(`${WORLD_ROOT_SELECTOR} button`)})]
      .find((candidate) => labels.includes(candidate.textContent?.trim() ?? ''));
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error('World action is unavailable: ' + labels.join(' / '));
    }
    if (button.disabled) throw new Error('World action is disabled: ' + labels.join(' / '));
    button.click();
    return true;
  })()`);
}

async function selectFirstMatchingOption(evaluate, selector, value) {
  await evaluate(`(() => {
    const select = document.querySelector(${JSON.stringify(selector)});
    if (!(select instanceof HTMLSelectElement)) throw new Error('World select is unavailable.');
    if (![...select.options].some((option) => option.value === ${JSON.stringify(value)})) {
      throw new Error('World select option is unavailable: ' + ${JSON.stringify(value)});
    }
    select.value = ${JSON.stringify(value)};
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
}

async function selectFirstNonEmptyOption(evaluate, selector) {
  await evaluate(`(() => {
    const select = document.querySelector(${JSON.stringify(selector)});
    if (!(select instanceof HTMLSelectElement)) throw new Error('World version select is unavailable.');
    const option = [...select.options].find((candidate) => candidate.value.length > 0);
    if (!option) throw new Error('Published World version option is unavailable.');
    select.value = option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return option.value;
  })()`);
}

async function setControlledValue(evaluate, selector, value) {
  await evaluate(`(() => {
    const control = document.querySelector(${JSON.stringify(selector)});
    if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) {
      throw new Error('World text control is unavailable.');
    }
    const prototype = control instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : HTMLTextAreaElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (!setter) throw new Error('World text control value setter is unavailable.');
    setter.call(control, ${JSON.stringify(value)});
    control.dispatchEvent(new Event('input', { bubbles: true }));
    return control.value;
  })()`);
}

async function inspectWorldTransformation(evaluate) {
  return evaluate(`(() => {
    const root = document.querySelector(${JSON.stringify(WORLD_ROOT_SELECTOR)});
    const candidate = root?.querySelector(${JSON.stringify(TRANSFORMATION_SELECTOR)});
    return {
      candidateVisible: candidate instanceof HTMLElement,
      candidateText: candidate?.textContent?.replaceAll(/\\s+/gu, ' ').trim() ?? '',
      currentFacts: [...(root?.querySelectorAll('.world-foundation__fact') ?? [])]
        .map((item) => item.textContent?.replaceAll(/\\s/gu, '') ?? '')
        .join('|'),
      eventCount: root?.querySelectorAll('.world-foundation__event').length ?? 0,
      revision: root?.querySelector('.world-foundation__runtime-meta strong')?.textContent?.trim() ?? '',
    };
  })()`);
}

async function inspectWorldLayout(evaluate) {
  return evaluate(`(() => {
    const workspace = document.querySelector(${JSON.stringify(`${WORLD_ROOT_SELECTOR} .world-foundation__workspace`)});
    const preview = document.querySelector(${JSON.stringify(`${WORLD_ROOT_SELECTOR} .world-foundation__preview`)});
    const style = workspace ? getComputedStyle(workspace) : undefined;
    const previewStyle = preview ? getComputedStyle(preview) : undefined;
    return {
      viewportWidth: document.documentElement.clientWidth,
      workspaceColumns: style?.gridTemplateColumns.split(' ').filter(Boolean).length ?? 0,
      previewColumn: previewStyle?.gridColumnStart ?? '',
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  })()`);
}

async function resizeDesktopWindow(evaluate, width, height) {
  let actualSize = await readDesktopViewport(evaluate);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (hasReachedDesktopWidth(actualSize.width, width)) return;
    await evaluate(`window.resizeTo(${String(width)}, ${String(height)})`);
    await delay(250);
    actualSize = await readDesktopViewport(evaluate);
  }
  throw new Error(
    `Desktop window did not enter the requested ${String(width)}x${String(height)} validation size: ${JSON.stringify(actualSize)}`,
  );
}

async function readDesktopViewport(evaluate) {
  return evaluate(`(() => ({
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  }))()`);
}

function hasReachedDesktopWidth(actualWidth, requestedWidth) {
  return requestedWidth <= 1000
    ? actualWidth <= requestedWidth
    : actualWidth >= requestedWidth - 100;
}

async function waitForCondition(evaluate, expression, message, timeoutMs = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await evaluate(expression)) return;
    await delay(100);
  }
  throw new Error(message);
}

function delay(milliseconds) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}
