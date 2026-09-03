import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const NAVIGATION_SELECTOR =
  '[data-primary-sidebar="application"] .home-primary-navigation .home-nav-button';
const MAIN_SLOT = '[data-workbench-slot="main"]';

export const characterWorldManagementHierarchyScenario = Object.freeze({
  id: 'character-world-management-hierarchy',
  owner: '@neko/app-desktop',
  async prepare({ fixtureHome }) {
    const workspacePath = join(fixtureHome, 'workspace');
    await mkdir(workspacePath, { recursive: true });
    return { workspacePath };
  },
  async run({ checkpoint, click, evaluate, screenshot, waitForDesktopBridge, waitForSelector }) {
    await waitForDesktopBridge();
    await resizeWindow(evaluate, 1440, 960);

    await clickNavigation(evaluate, click, 'Characters', '角色');
    await waitForSelector(`${MAIN_SLOT} [data-character-management-catalog="true"]`);
    const characterWide = await inspectCatalog(evaluate, 'character', false);
    checkpoint('character-management-hierarchy-wide', characterWide);
    const characterWideScreenshot = await screenshot('character-management-hierarchy-wide');

    await click(`${MAIN_SLOT} [data-character-management-action="create"]`);
    await waitForSelector('[data-primary-surface="agent"]');
    const createDestination = await inspectStartCreatingDestination(evaluate, 'character');
    checkpoint('character-create-start-creating', createDestination);

    await clickNavigation(evaluate, click, 'Worlds', '世界');
    await waitForSelector(`${MAIN_SLOT} [data-world-management-catalog-root="true"]`);
    const worldWide = await inspectCatalog(evaluate, 'world', false);
    checkpoint('world-management-hierarchy-wide', worldWide);
    const worldWideScreenshot = await screenshot('world-management-hierarchy-wide');

    await resizeWindow(evaluate, 720, 640);
    await clickNavigation(evaluate, click, 'Characters', '角色');
    await waitForSelector(`${MAIN_SLOT} [data-character-management-catalog="true"]`);
    const characterNarrow = await inspectCatalog(evaluate, 'character', true);
    checkpoint('character-management-hierarchy-narrow', characterNarrow);
    const characterNarrowScreenshot = await screenshot('character-management-hierarchy-narrow');

    await clickNavigation(evaluate, click, 'Worlds', '世界');
    await waitForSelector(`${MAIN_SLOT} [data-world-management-catalog-root="true"]`);
    const worldNarrow = await inspectCatalog(evaluate, 'world', true);
    checkpoint('world-management-hierarchy-narrow', worldNarrow);
    const worldNarrowScreenshot = await screenshot('world-management-hierarchy-narrow');

    await click(`${MAIN_SLOT} [data-world-template="world-bible"]`);
    await waitForSelector('[data-primary-surface="agent"] #agent-entry-authoring-name');
    const templateDestination = await inspectStartCreatingDestination(evaluate, 'world');
    if (
      templateDestination.agentSurfaces !== 1 ||
      templateDestination.managementRoots !== 0 ||
      templateDestination.composerValue !== '$world-creator '
    ) {
      throw new Error(
        `World template did not enter canonical Start Creating: ${JSON.stringify(templateDestination)}`,
      );
    }
    checkpoint('world-template-start-creating', templateDestination);

    return {
      screenshots: [
        characterWideScreenshot,
        worldWideScreenshot,
        characterNarrowScreenshot,
        worldNarrowScreenshot,
      ],
    };
  },
});

async function inspectCatalog(evaluate, domain, narrow) {
  const classPrefix = `${domain}-management`;
  const rootSelector =
    domain === 'character'
      ? `${MAIN_SLOT} [data-character-management-catalog="true"]`
      : `${MAIN_SLOT} [data-world-management-catalog-root="true"]`;
  const expectedTitle = domain === 'character' ? ['Characters', '角色'] : ['Worlds', '世界'];
  const expectedCollection =
    domain === 'character' ? ['My Characters', '我的角色'] : ['My Worlds', '我的世界'];
  const state = await evaluate(`(() => {
    const root = document.querySelector(${JSON.stringify(rootSelector)});
    const content = root?.querySelector('.${classPrefix}__content');
    const hero = root?.querySelector('.${classPrefix}__hero');
    const collection = root?.querySelector('.${classPrefix}__collection');
    const controls = root?.querySelector('.${classPrefix}__controls');
    const search = root?.querySelector('.${classPrefix}__search');
    const contentRect = content?.getBoundingClientRect();
    const controlsRect = controls?.getBoundingClientRect();
    const searchRect = search?.getBoundingClientRect();
    return {
      roots: document.querySelectorAll(${JSON.stringify(rootSelector)}).length,
      title: hero?.querySelector('h1')?.textContent?.trim() ?? '',
      collectionTitle: collection?.querySelector('h2')?.textContent?.trim() ?? '',
      heroActions: hero?.querySelectorAll('button').length ?? 0,
      createActions: hero?.querySelectorAll('[data-${domain}-management-action="create"]').length ?? 0,
      importActions: hero?.querySelectorAll('[data-${domain}-management-action="import"]').length ?? 0,
      heroVisuals: hero?.querySelectorAll('.${classPrefix}__hero-visual').length ?? 0,
      templateEntries: root?.querySelectorAll('[data-character-template], [data-world-template]').length ?? 0,
      templateIdentity: root?.querySelector('[data-character-template], [data-world-template]')?.getAttribute('data-character-template') ?? root?.querySelector('[data-world-template]')?.getAttribute('data-world-template') ?? '',
      templateHeading: root?.querySelector('.${classPrefix}__templates h2')?.textContent?.trim() ?? '',
      searchFields: search?.querySelectorAll('input').length ?? 0,
      sortControls: controls?.querySelectorAll('select').length ?? 0,
      refreshControls: controls?.querySelectorAll('button').length ?? 0,
      contentWidth: contentRect?.width ?? 0,
      controlsWidth: controlsRect?.width ?? 0,
      searchWidth: searchRect?.width ?? 0,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  })()`);
  const validTitle = expectedTitle.includes(state.title);
  const validCollection = expectedCollection.includes(state.collectionTitle);
  const validWideSearch = narrow || (state.searchWidth >= 220 && state.searchWidth <= 289);
  const validNarrowSearch = !narrow || state.searchWidth <= state.controlsWidth;
  const validTemplateIdentity =
    state.templateIdentity === (domain === 'character' ? 'character-kit' : 'world-bible');
  if (
    state.roots !== 1 ||
    !validTitle ||
    !validCollection ||
    state.heroActions !== 2 ||
    state.createActions !== 1 ||
    state.importActions !== 1 ||
    state.heroVisuals !== 1 ||
    state.templateEntries !== 1 ||
    !validTemplateIdentity ||
    state.templateHeading.length === 0 ||
    state.searchFields !== 1 ||
    state.sortControls !== 1 ||
    state.refreshControls !== 0 ||
    state.contentWidth <= 0 ||
    state.contentWidth > 1118 ||
    !validWideSearch ||
    !validNarrowSearch ||
    state.horizontalOverflow
  ) {
    throw new Error(
      `${domain} management hierarchy is invalid: ${JSON.stringify({ narrow, ...state })}`,
    );
  }
  return state;
}

async function inspectStartCreatingDestination(evaluate, domain) {
  const managementSelector =
    domain === 'character'
      ? `${MAIN_SLOT} [data-character-management-catalog="true"]`
      : `${MAIN_SLOT} [data-world-management-catalog-root="true"]`;
  const state = await evaluate(`(() => ({
    agentSurfaces: document.querySelectorAll('[data-primary-surface="agent"]').length,
    managementRoots: document.querySelectorAll(${JSON.stringify(managementSelector)}).length,
    composerValue: document.querySelector(
      '[data-primary-surface="agent"] .agent-composer-textarea'
    )?.value,
  }))()`);
  if (state.agentSurfaces !== 1 || state.managementRoots !== 0) {
    throw new Error(
      `${domain} action did not enter canonical Start Creating: ${JSON.stringify(state)}`,
    );
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

async function resizeWindow(evaluate, width, height) {
  await evaluate(
    `window.openNekoDesktop.functional.resizeWindow(${String(width)}, ${String(height)})`,
  );
  await new Promise((resolve) => setTimeout(resolve, 350));
}
