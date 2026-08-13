import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const NAVIGATION_SELECTOR =
  '[data-primary-sidebar="application"] .home-primary-navigation .home-nav-button';
const MAIN_SLOT = '[data-workbench-slot="main"]';
const SECONDARY_MAIN_SLOT = '[data-workbench-slot="secondaryMain"]';

export const domainManagementWorkbenchScenario = Object.freeze({
  id: 'domain-management-workbench',
  owner: '@neko/app-desktop',
  async prepare({ fixtureHome }) {
    const workspacePath = join(fixtureHome, 'workspace');
    await mkdir(workspacePath, { recursive: true });
    return { workspacePath };
  },
  async run({
    checkpoint,
    click,
    evaluate,
    screenshot,
    type,
    waitForDesktopBridge,
    waitForSelector,
  }) {
    await waitForDesktopBridge();
    await resizeWindow(evaluate, 1440, 960);

    await clickNavigation(evaluate, click, 'All projects', '所有项目');
    await waitForSelector(`${MAIN_SLOT} .project-management-catalog`);
    await assertNoManagementModeSwitch(evaluate, 'Project');
    const projectScreenshot = await screenshot('project-management-direct');
    checkpoint('project-management-direct', await inspectManagement(evaluate));

    await clickNavigation(evaluate, click, 'Characters', '角色');
    await waitForSelector(`${MAIN_SLOT} [data-character-management-catalog="true"]`);
    await assertNoManagementModeSwitch(evaluate, 'Character');
    const characterScreenshot = await screenshot('character-management-direct');
    checkpoint('character-management-direct', await inspectManagement(evaluate));

    const quickGeneration = await inspectCharacterQuickGeneration(evaluate);
    checkpoint('character-quick-generation-entry', quickGeneration);
    await click(`${MAIN_SLOT} .character-management__creation-menu > summary`);
    await click(`${MAIN_SLOT} .character-management__creation-menu > div button`, 0);
    await waitForSelector(
      '[data-primary-surface="agent"] .agent-entry-authoring-creation #agent-entry-authoring-name',
    );
    const quickCreateWide = await inspectCharacterQuickCreate(evaluate);
    const quickCreateScreenshot = await screenshot('character-quick-create-destination');
    checkpoint('character-quick-create-destination', quickCreateWide);
    await resizeWindow(evaluate, 760, 640);
    const quickCreateNarrow = await inspectCharacterQuickCreate(evaluate);
    const quickCreateNarrowScreenshot = await screenshot(
      'character-quick-create-destination-narrow',
    );
    checkpoint('character-quick-create-destination-narrow', quickCreateNarrow);
    await click('[data-primary-surface="agent"] .agent-entry-authoring-creation-header button');
    await waitForSelector('[data-primary-surface="agent"] .agent-composer-textarea');
    const cancelled = await inspectCharacterQuickCreateCancellation(evaluate);
    checkpoint('character-quick-create-cancelled', cancelled);
    await resizeWindow(evaluate, 1440, 960);

    await clickNavigation(evaluate, click, 'Worlds', '世界');

    await waitForSelector(`${MAIN_SLOT} [data-world-management-catalog="true"]`);
    await assertNoManagementModeSwitch(evaluate, 'World');
    await assertSidebarSections(evaluate);
    const worldEmptyScreenshot = await screenshot('world-management-empty');
    checkpoint('world-management-empty', await inspectManagement(evaluate));

    await click(`${MAIN_SLOT} .world-management__create`);
    await waitForSelector(`${SECONDARY_MAIN_SLOT} [data-world-management-detail="true"]`);
    await assertWorldSplit(evaluate);
    await click(`${MAIN_SLOT} .world-management__view-switcher button`, 1);
    await assertCatalogView(evaluate, 'grid');
    const worldCreateScreenshot = await screenshot('world-management-create-grid');
    checkpoint('world-management-create-grid', await inspectManagement(evaluate));

    await type(`${SECONDARY_MAIN_SLOT} .world-foundation__form-grid input`, 'Archive City', 0);
    await type(
      `${SECONDARY_MAIN_SLOT} .world-foundation__form-grid textarea`,
      'A city built around a sealed archive.',
      0,
    );
    await click(`${SECONDARY_MAIN_SLOT} .world-foundation__actions button`, 0);
    await waitForSelector(`${MAIN_SLOT} .world-management__catalog-item`);
    await waitForSelector(`${SECONDARY_MAIN_SLOT} .world-management__preview-region`);
    await assertCreatedWorld(evaluate);
    const worldDetailScreenshot = await screenshot('world-management-detail');
    checkpoint('world-management-detail', await inspectManagement(evaluate));

    await resizeWindow(evaluate, 1040, 700);
    await assertWorldSplit(evaluate);
    const worldNarrowScreenshot = await screenshot('world-management-detail-narrow');
    checkpoint('world-management-detail-narrow', await inspectManagement(evaluate));

    await clickNavigation(evaluate, click, 'Characters', '角色');
    await waitForSelector(`${MAIN_SLOT} [data-character-management-catalog="true"]`);
    const unmounted = await evaluate(`(() => ({
      worldCatalogs: document.querySelectorAll('[data-world-management-catalog="true"]').length,
      worldDetails: document.querySelectorAll('[data-world-management-detail="true"]').length,
      characterCatalogs: document.querySelectorAll('[data-character-management-catalog="true"]').length,
    }))()`);
    if (
      unmounted.worldCatalogs !== 0 ||
      unmounted.worldDetails !== 0 ||
      unmounted.characterCatalogs !== 1
    ) {
      throw new Error(
        `World management Roots were retained after navigation: ${JSON.stringify(unmounted)}`,
      );
    }
    checkpoint('world-management-unmounted', unmounted);

    return {
      screenshots: [
        projectScreenshot,
        characterScreenshot,
        quickCreateScreenshot,
        quickCreateNarrowScreenshot,
        worldEmptyScreenshot,
        worldCreateScreenshot,
        worldDetailScreenshot,
        worldNarrowScreenshot,
      ],
    };
  },
});

async function inspectCharacterQuickGeneration(evaluate) {
  const state = await evaluate(`(() => ({
    creationMenus: document.querySelectorAll(
      '${MAIN_SLOT} .character-management__creation-menu > summary'
    ).length,
    separateQuickButtons: [...document.querySelectorAll(
      '${MAIN_SLOT} .character-management__header-actions > button'
    )].filter((button) => ['Quick generate', '快速生成'].includes(button.textContent?.trim() ?? '')).length,
    agentComposers: document.querySelectorAll('[data-primary-surface="agent"] .agent-composer-textarea').length,
    characterCatalogs: document.querySelectorAll('${MAIN_SLOT} [data-character-management-catalog="true"]').length,
  }))()`);
  if (
    state.creationMenus !== 1 ||
    state.separateQuickButtons !== 0 ||
    state.agentComposers !== 0 ||
    state.characterCatalogs !== 1
  ) {
    throw new Error(`Character quick generation entry is invalid: ${JSON.stringify(state)}`);
  }
  return state;
}

async function inspectCharacterQuickCreate(evaluate) {
  const state = await evaluate(`(() => {
    const composer = document.querySelector('[data-primary-surface="agent"] .agent-composer-textarea');
    const selector = document.querySelector('[data-primary-surface="agent"] .agent-entry-authoring-creation');
    const rect = selector?.getBoundingClientRect();
    return {
      composerValue: composer?.value,
      authoringSelected: document.querySelector(
        '[data-primary-surface="agent"] [data-segmented-value="authoring"]'
      )?.getAttribute('aria-selected'),
      characterDestinations: selector?.querySelectorAll('.agent-entry-resource-card').length ?? 0,
      draftNameInputs: selector?.querySelectorAll('#agent-entry-authoring-name').length ?? 0,
      cancelButtons: [...(selector?.querySelectorAll('button') ?? [])].filter(
        (button) => ['Cancel', '取消'].includes(button.textContent?.trim() ?? '')
      ).length,
      visibleWidth: rect?.width ?? 0,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  })()`);
  if (
    state.composerValue !== '$character-creator ' ||
    state.authoringSelected !== 'true' ||
    state.characterDestinations < 1 ||
    state.draftNameInputs !== 1 ||
    state.cancelButtons !== 1 ||
    state.visibleWidth <= 0 ||
    state.overflow
  ) {
    throw new Error(`Character quick-create destination is invalid: ${JSON.stringify(state)}`);
  }
  return state;
}

async function inspectCharacterQuickCreateCancellation(evaluate) {
  const state = await evaluate(`(() => ({
    assistantSelected: document.querySelector(
      '[data-primary-surface="agent"] [data-segmented-value="assistant"]'
    )?.getAttribute('aria-selected'),
    creationSelectors: document.querySelectorAll(
      '[data-primary-surface="agent"] .agent-entry-authoring-creation'
    ).length,
    draftNameInputs: document.querySelectorAll(
      '[data-primary-surface="agent"] #agent-entry-authoring-name'
    ).length,
  }))()`);
  if (
    state.assistantSelected !== 'true' ||
    state.creationSelectors !== 0 ||
    state.draftNameInputs !== 0
  ) {
    throw new Error(`Character quick-create cancellation is invalid: ${JSON.stringify(state)}`);
  }
  return state;
}

async function clickNavigation(evaluate, click, english, chinese) {
  const index = await evaluate(`(() => [...document.querySelectorAll(${JSON.stringify(
    NAVIGATION_SELECTOR,
  )})].findIndex((button) => {
    const label = button.textContent?.trim();
    return label === ${JSON.stringify(english)} || label === ${JSON.stringify(chinese)};
  }))()`);
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`Application navigation '${english}' is unavailable.`);
  }
  await click(NAVIGATION_SELECTOR, index);
}

async function assertNoManagementModeSwitch(evaluate, owner) {
  const switchCount = await evaluate(`document.querySelectorAll(
    '${MAIN_SLOT} [data-creative-management], ${MAIN_SLOT} .creative-management__catalog-switcher'
  ).length`);
  if (switchCount !== 0) {
    throw new Error(`${owner} management rendered a cross-domain mode switch.`);
  }
}

async function assertSidebarSections(evaluate) {
  const sections = await evaluate(`(() => [...document.querySelectorAll(
    '[data-primary-sidebar="application"] [data-navigation-section]'
  )].map((section) => ({
    id: section.getAttribute('data-navigation-section'),
    heading: section.querySelector('.home-sidebar-heading')?.textContent?.trim(),
  })))()`);
  const ids = sections.map((section) => section.id);
  if (
    JSON.stringify(ids) !== JSON.stringify(['projects', 'conversations', 'characters', 'worlds'])
  ) {
    throw new Error(`Application sidebar sections are incorrect: ${JSON.stringify(sections)}`);
  }
  if (!sections.find((section) => section.id === 'worlds')?.heading?.endsWith('0')) {
    throw new Error(`Worlds sidebar section is not visibly empty: ${JSON.stringify(sections)}`);
  }
}

async function assertWorldSplit(evaluate) {
  const split = await evaluate(`(() => {
    const shell = document.querySelector('[data-neko-controlled-workbench="true"]');
    const primary = shell?.querySelector('.neko-controlled-workbench-main__primary');
    const secondary = shell?.querySelector('.neko-controlled-workbench-main__secondary');
    const primaryRect = primary?.getBoundingClientRect();
    const secondaryRect = secondary?.getBoundingClientRect();
    return {
      axis: shell?.getAttribute('data-main-split'),
      mainPanel: Boolean(primary?.querySelector('[data-world-management-catalog="true"]')),
      detailPanel: Boolean(secondary?.querySelector('[data-world-management-detail="true"]')),
      primaryWidth: primaryRect?.width ?? 0,
      secondaryWidth: secondaryRect?.width ?? 0,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  }))()`);
  if (
    split.axis !== 'columns' ||
    !split.mainPanel ||
    !split.detailPanel ||
    split.primaryWidth <= 0 ||
    split.secondaryWidth <= 0 ||
    split.overflow
  ) {
    throw new Error(`World management Workbench split is invalid: ${JSON.stringify(split)}`);
  }
}

async function assertCatalogView(evaluate, view) {
  const className = await evaluate(
    `document.querySelector('${MAIN_SLOT} .world-management__catalog')?.className ?? ''`,
  );
  if (!className.includes(`is-${view}`)) {
    throw new Error(`World catalog did not switch to ${view}: ${String(className)}`);
  }
}

async function assertCreatedWorld(evaluate) {
  const detail = await evaluate(`(() => ({
    catalogTitle: document.querySelector('${MAIN_SLOT} .world-management__catalog-item strong')?.textContent?.trim(),
    detailTitle: document.querySelector('${SECONDARY_MAIN_SLOT} .world-foundation__pane-heading h2')?.textContent?.trim(),
    selected: document.querySelector('${MAIN_SLOT} .world-management__catalog-item')?.getAttribute('aria-pressed'),
  }))()`);
  if (
    detail.catalogTitle !== 'Archive City' ||
    detail.detailTitle !== 'Archive City' ||
    detail.selected !== 'true'
  ) {
    throw new Error(`Created World selection is inconsistent: ${JSON.stringify(detail)}`);
  }
}

async function inspectManagement(evaluate) {
  return evaluate(`(() => ({
    scene: document.querySelector('[data-neko-controlled-workbench="true"]')?.className,
    split: document.querySelector('[data-neko-controlled-workbench="true"]')?.getAttribute('data-main-split'),
    sidebarSections: document.querySelectorAll('[data-navigation-section]').length,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    verticalOverflow: document.documentElement.scrollHeight > document.documentElement.clientHeight,
  }))()`);
}

async function resizeWindow(evaluate, width, height) {
  await evaluate(
    `window.openNekoDesktop.functional.resizeWindow(${String(width)}, ${String(height)})`,
  );
  await new Promise((resolve) => setTimeout(resolve, 350));
}
