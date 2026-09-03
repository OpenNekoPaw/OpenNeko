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
    pressKey,
    restartApplication,
    screenshot,
    scroll,
    type,
    waitForDesktopBridge,
    waitForSelector,
  }) {
    await waitForDesktopBridge();
    await resizeWindow(evaluate, 1440, 960);

    await clickNavigation(evaluate, click, 'Projects', '项目');
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
    await click(`${MAIN_SLOT} [data-character-template="character-kit"]`);
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

    await waitForSelector(`${MAIN_SLOT} [data-world-management-catalog-root="true"]`);
    await assertNoManagementModeSwitch(evaluate, 'World');
    await assertSidebarSections(evaluate);
    const worldEmptyScreenshot = await screenshot('world-management-empty');
    checkpoint('world-management-empty', await inspectManagement(evaluate));

    await click(`${MAIN_SLOT} .world-management__header-actions .is-primary`);
    await waitForSelector(`${SECONDARY_MAIN_SLOT} [data-world-authoring-studio="true"]`);
    await assertWorldAuthoringSplit(evaluate);
    const worldAuthoringScreenshot = await screenshot('world-authoring-primary-empty');
    checkpoint('world-authoring-primary-empty', await inspectWorldAuthoring(evaluate));

    await type(
      `${SECONDARY_MAIN_SLOT} .world-authoring__form-grid textarea`,
      'A city built around a sealed archive.',
      0,
    );
    await type(
      `${SECONDARY_MAIN_SLOT} .world-authoring__form-grid textarea`,
      'Archive | A sealed archive beneath the city.',
      1,
    );
    await click(`${SECONDARY_MAIN_SLOT} .world-authoring__actions button`, 0);
    await waitForCondition(
      evaluate,
      `document.querySelector('${SECONDARY_MAIN_SLOT} .world-authoring__actions button')?.disabled === false`,
    );
    await click(`${SECONDARY_MAIN_SLOT} .world-authoring__actions select`);
    await pressKey('ArrowDown');
    await pressKey('Enter');
    await waitForCondition(
      evaluate,
      `document.querySelector('${SECONDARY_MAIN_SLOT} .world-authoring__actions select')?.value === 'ready'`,
    );
    await click(`${SECONDARY_MAIN_SLOT} .world-authoring__actions button`, 1);
    await waitForCondition(
      evaluate,
      `document.querySelector('${SECONDARY_MAIN_SLOT} .world-authoring__versions')?.textContent?.includes('First publication') === true`,
    );
    const worldPublishedScreenshot = await screenshot('world-authoring-published');
    checkpoint('world-authoring-published', await inspectWorldAuthoring(evaluate));

    await clickNavigation(evaluate, click, 'Worlds', '世界');
    await waitForSelector(`${MAIN_SLOT} [data-world-management-world-card="true"]`);
    await click(`${MAIN_SLOT} [data-world-management-world-card="true"]`);
    await waitForSelector(`${SECONDARY_MAIN_SLOT} [data-world-management-detail-scroll="true"]`);
    await assertWorldSplit(evaluate);
    await assertWorldDetail(evaluate);
    const worldDetailScreenshot = await screenshot('world-management-detail');
    checkpoint('world-management-detail', await inspectWorldDetail(evaluate));

    await click(`${SECONDARY_MAIN_SLOT} .world-management__primary-actions button`, 1);
    await waitForSelector('[role="dialog"] .world-management__portable-preview');
    const worldExportScreenshot = await screenshot('world-export-scope-preview');
    checkpoint('world-export-scope-preview', await inspectWorldExportPreview(evaluate));
    await click('[role="dialog"] .world-management__portable-preview footer button', 0);

    await resizeWindow(evaluate, 1040, 700);
    await assertWorldSplit(evaluate);
    await scroll(`${SECONDARY_MAIN_SLOT} [data-world-management-detail-scroll="true"]`, 0, {
      deltaY: 900,
    });
    await waitForCondition(
      evaluate,
      `(() => { const root = document.querySelector('${SECONDARY_MAIN_SLOT} [data-world-management-detail-scroll="true"]'); return root instanceof HTMLElement && root.scrollTop > 0; })()`,
    );
    const worldNarrowScreenshot = await screenshot('world-management-detail-narrow');
    checkpoint('world-management-detail-narrow', await inspectWorldDetail(evaluate));

    await click(`${SECONDARY_MAIN_SLOT} .world-management__version-list button`);
    await waitForSelector('[data-world-runtime-surface="main"]');
    await assertWorldRuntime(evaluate);
    const worldRuntimeScreenshot = await screenshot('world-runtime-workbench');
    checkpoint('world-runtime-workbench', await inspectWorldRuntime(evaluate));

    await restartApplication();
    await waitForSelector('[data-world-runtime-surface="main"]');
    await assertWorldRuntime(evaluate);
    const worldRuntimeReloadScreenshot = await screenshot('world-runtime-reloaded');
    checkpoint('world-runtime-reloaded', await inspectWorldRuntime(evaluate));

    await clickNavigation(evaluate, click, 'Characters', '角色');
    await waitForSelector(`${MAIN_SLOT} [data-character-management-catalog="true"]`);
    const unmounted = await evaluate(`(() => ({
      worldCatalogs: document.querySelectorAll('[data-world-management-catalog-root="true"]').length,
      worldDetails: document.querySelectorAll('[data-world-management-detail-root="true"]').length,
      worldRuntimeSurfaces: document.querySelectorAll('[data-world-runtime-surface]').length,
      worldAuthoringStudios: document.querySelectorAll('[data-world-authoring-studio="true"]').length,
      characterCatalogs: document.querySelectorAll('[data-character-management-catalog="true"]').length,
    }))()`);
    if (
      unmounted.worldCatalogs !== 0 ||
      unmounted.worldDetails !== 0 ||
      unmounted.worldRuntimeSurfaces !== 0 ||
      unmounted.worldAuthoringStudios !== 0 ||
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
        worldAuthoringScreenshot,
        worldPublishedScreenshot,
        worldDetailScreenshot,
        worldExportScreenshot,
        worldNarrowScreenshot,
        worldRuntimeScreenshot,
        worldRuntimeReloadScreenshot,
      ],
    };
  },
});

async function inspectCharacterQuickGeneration(evaluate) {
  const state = await evaluate(`(() => ({
    createActions: document.querySelectorAll(
      '${MAIN_SLOT} [data-character-management-action="create"]'
    ).length,
    characterKitTemplates: document.querySelectorAll(
      '${MAIN_SLOT} [data-character-template="character-kit"]'
    ).length,
    agentComposers: document.querySelectorAll('[data-primary-surface="agent"] .agent-composer-textarea').length,
    characterCatalogs: document.querySelectorAll('${MAIN_SLOT} [data-character-management-catalog="true"]').length,
  }))()`);
  if (
    state.createActions !== 1 ||
    state.characterKitTemplates !== 1 ||
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
      mainPanel: Boolean(primary?.querySelector('[data-world-management-catalog-root="true"]')),
      detailPanel: Boolean(secondary?.querySelector('[data-world-management-detail-root="true"]')),
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

async function assertWorldAuthoringSplit(evaluate) {
  const split = await inspectWorldAuthoring(evaluate);
  if (
    split.axis !== 'columns' ||
    split.emptyPrimaryMains !== 1 ||
    split.authoringStudios !== 1 ||
    split.primaryWidth <= 0 ||
    split.secondaryWidth <= 0 ||
    split.horizontalOverflow
  ) {
    throw new Error(`World authoring split is invalid: ${JSON.stringify(split)}`);
  }
}

async function inspectWorldAuthoring(evaluate) {
  return evaluate(`(() => {
    const shell = document.querySelector('[data-neko-controlled-workbench="true"]');
    const primary = shell?.querySelector('.neko-controlled-workbench-main__primary');
    const secondary = shell?.querySelector('.neko-controlled-workbench-main__secondary');
    return {
      axis: shell?.getAttribute('data-main-split'),
      emptyPrimaryMains: primary?.querySelectorAll('[data-empty-main="true"]').length ?? 0,
      authoringStudios: secondary?.querySelectorAll('[data-world-authoring-studio="true"]').length ?? 0,
      primaryWidth: primary?.getBoundingClientRect().width ?? 0,
      secondaryWidth: secondary?.getBoundingClientRect().width ?? 0,
      publishedVersions: secondary?.querySelectorAll('.world-authoring__versions > span').length ?? 0,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  })()`);
}

async function assertWorldDetail(evaluate) {
  const detail = await inspectWorldDetail(evaluate);
  if (
    detail.sections !== 4 ||
    detail.scrollOwners !== 1 ||
    detail.selected !== 'true' ||
    detail.listModeControls !== 0 ||
    detail.horizontalOverflow
  ) {
    throw new Error(`World detail surface is invalid: ${JSON.stringify(detail)}`);
  }
}

async function inspectWorldDetail(evaluate) {
  return evaluate(`(() => ({
    cards: document.querySelectorAll('${MAIN_SLOT} [data-world-management-world-card="true"]').length,
    selected: document.querySelector('${MAIN_SLOT} [data-world-management-world-card="true"]')?.getAttribute('aria-pressed'),
    sections: document.querySelectorAll('${SECONDARY_MAIN_SLOT} .world-management__detail-section').length,
    scrollOwners: document.querySelectorAll('${SECONDARY_MAIN_SLOT} [data-world-management-detail-scroll="true"]').length,
    scrollTop: document.querySelector('${SECONDARY_MAIN_SLOT} [data-world-management-detail-scroll="true"]')?.scrollTop ?? 0,
    listModeControls: document.querySelectorAll('${MAIN_SLOT} .world-management__view-switcher').length,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }))()`);
}

async function inspectWorldExportPreview(evaluate) {
  const state = await evaluate(`(() => ({
    dialogs: document.querySelectorAll('[role="dialog"] .world-management__portable-preview').length,
    selectedVersions: document.querySelectorAll('[role="dialog"] .world-management__portable-version-selection input:checked').length,
    runtimeTerms: document.querySelector('[role="dialog"] .world-management__portable-preview')?.textContent?.includes('Runs') || document.querySelector('[role="dialog"] .world-management__portable-preview')?.textContent?.includes('运行'),
  }))()`);
  if (state.dialogs !== 1 || state.selectedVersions !== 1 || !state.runtimeTerms) {
    throw new Error(`World export preview is invalid: ${JSON.stringify(state)}`);
  }
  return state;
}

async function assertWorldRuntime(evaluate) {
  const runtime = await inspectWorldRuntime(evaluate);
  if (
    runtime.main !== 1 ||
    runtime.interaction !== 1 ||
    runtime.manager !== 1 ||
    runtime.timeline !== 1 ||
    runtime.status !== 1 ||
    !runtime.capabilityBoundary ||
    runtime.horizontalOverflow
  ) {
    throw new Error(`World Runtime Workbench is invalid: ${JSON.stringify(runtime)}`);
  }
}

async function inspectWorldRuntime(evaluate) {
  return evaluate(`(() => ({
    main: document.querySelectorAll('[data-world-runtime-surface="main"]').length,
    interaction: document.querySelectorAll('[data-world-runtime-surface="interaction"]').length,
    manager: document.querySelectorAll('[data-world-runtime-surface="right-manager"]').length,
    timeline: document.querySelectorAll('[data-world-runtime-surface="bottom-timeline"]').length,
    status: document.querySelectorAll('[data-world-runtime-surface="status"]').length,
    capabilityBoundary: document.querySelector('[data-world-runtime-surface="main"] .world-runtime__capability-boundary')?.textContent?.includes('Gameplay') ?? false,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }))()`);
}

async function waitForCondition(evaluate, expression, timeoutMs = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`Desktop condition timed out: ${expression}`);
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
