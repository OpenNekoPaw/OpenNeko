import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const NAVIGATION_SELECTOR =
  '[data-primary-sidebar="application"] .home-primary-navigation .home-nav-button';
const ROOT = '.desktop-extension-management-composition';

export const extensionManagementLifecycleScenario = Object.freeze({
  id: 'extension-management-lifecycle',
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
    screenshot,
    waitForDesktopBridge,
    waitForSelector,
  }) {
    await waitForDesktopBridge(60_000);
    await clickNavigation(evaluate, click, 'Extensions', '扩展');
    await waitForSelector(ROOT);
    await waitForEvaluation(
      evaluate,
      `document.querySelector('${ROOT} [data-extension-add-action="skills"]')?.disabled === false`,
      60_000,
    );

    const skills = await inspect(evaluate, 'skills');
    checkpoint('extension-management-skills', skills);
    const skillScreenshot = await screenshot('extension-management-skills');

    await click(`${ROOT} [data-capability-integration-tab="mcp"]`);
    await waitForSelector(`${ROOT} [data-extension-add-action="mcp"]`);
    const mcp = await inspect(evaluate, 'mcp');
    checkpoint('extension-management-mcp', mcp);
    await click(`${ROOT} [data-extension-add-action="mcp"]`);
    await waitForSelector('.extension-mcp-add-form');
    const mcpDialog = await evaluate(`(() => ({
      forms: document.querySelectorAll('.extension-mcp-add-form').length,
      inputs: document.querySelectorAll('.extension-mcp-add-form input').length,
      transports: document.querySelectorAll('.extension-mcp-add-form select').length,
    }))()`);
    if (mcpDialog.forms !== 1 || mcpDialog.inputs < 2 || mcpDialog.transports !== 1) {
      throw new Error(`MCP add dialog is invalid: ${JSON.stringify(mcpDialog)}`);
    }
    checkpoint('extension-management-mcp-add-dialog', mcpDialog);
    const mcpScreenshot = await screenshot('extension-management-mcp-add-dialog');
    await pressKey('Escape');

    await click(`${ROOT} [data-capability-integration-tab="professional-applications"]`);
    await waitForSelector(`${ROOT} [data-professional-application-action="add"]`);
    const professional = await inspect(evaluate, 'professional-applications');
    assertAlignedCardMetrics(skills.cardLayout, professional.cardLayout);
    checkpoint('extension-management-professional-applications', professional);
    await click(`${ROOT} [data-professional-application-action="add"]`);
    await waitForSelector('.professional-application-add-list');
    const professionalDialog = await evaluate(`(() => ({
      lists: document.querySelectorAll('.professional-application-add-list').length,
      choices: document.querySelectorAll('.professional-application-add-list button').length,
    }))()`);
    if (professionalDialog.lists !== 1 || professionalDialog.choices < 1) {
      throw new Error(
        `Professional application add dialog is invalid: ${JSON.stringify(professionalDialog)}`,
      );
    }
    checkpoint('extension-management-professional-application-add-dialog', professionalDialog);
    const professionalScreenshot = await screenshot(
      'extension-management-professional-application-add-dialog',
    );
    await pressKey('Escape');

    return {
      screenshots: [skillScreenshot, mcpScreenshot, professionalScreenshot],
    };
  },
});

async function inspect(evaluate, selectedTab) {
  const state = await evaluate(`(() => ({
    roots: document.querySelectorAll('${ROOT}').length,
    tabs: document.querySelectorAll('${ROOT} [data-capability-integration-tab]').length,
    selected: document.querySelector('${ROOT} [data-capability-integration-tab][aria-selected="true"]')
      ?.getAttribute('data-capability-integration-tab') ?? '',
    skillAdd: document.querySelectorAll('${ROOT} [data-extension-add-action="skills"]').length,
    mcpAdd: document.querySelectorAll('${ROOT} [data-extension-add-action="mcp"]').length,
    professionalAdd: document.querySelectorAll(
      '${ROOT} [data-professional-application-action="add"]'
    ).length,
    toolbarLayout: (() => {
      const toolbar = document.querySelector('${ROOT} .management-surface-toolbar');
      const search = toolbar?.querySelector('.management-search-field');
      if (!(toolbar instanceof HTMLElement) || !(search instanceof HTMLElement)) return null;
      const searchRect = search.getBoundingClientRect();
      return {
        overflow: toolbar.scrollWidth > toolbar.clientWidth + 1,
        searchWidth: Math.round(searchRect.width),
        actions: [...toolbar.children]
          .filter((element) => element !== search && element instanceof HTMLElement)
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              label: element.textContent?.trim() ?? '',
              nowrap: getComputedStyle(element).whiteSpace === 'nowrap',
              sameRow:
                Math.abs(rect.top + rect.height / 2 - (searchRect.top + searchRect.height / 2)) <= 2,
            };
          }),
      };
    })(),
    cardLayout: (() => {
      const card = document.querySelector(
        '${ROOT} .agent-extension-catalog-row, ${ROOT} .professional-application-row'
      );
      const status = card?.querySelector(
        '.agent-extension-catalog-row__status, .professional-application-row__readiness'
      );
      if (!(card instanceof HTMLElement) || !(status instanceof HTMLElement)) return null;
      const rect = card.getBoundingClientRect();
      const heading = card.querySelector(
        '.agent-extension-catalog-row__heading, .professional-application-row__heading'
      );
      if (!(heading instanceof HTMLElement)) return null;
      const headingRect = heading.getBoundingClientRect();
      const statusRect = status.getBoundingClientRect();
      const horizontalStartInset = Math.round(headingRect.left - rect.left);
      const horizontalEndInset = Math.round(rect.right - headingRect.right);
      const verticalStartInset = Math.round(headingRect.top - rect.top);
      const verticalEndInset = Math.round(rect.bottom - statusRect.bottom);
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        horizontalStartInset,
        horizontalEndInset,
        horizontalInsetDelta: Math.abs(horizontalStartInset - horizontalEndInset),
        verticalStartInset,
        verticalEndInset,
        verticalInsetDelta: Math.abs(verticalStartInset - verticalEndInset),
        statusHeight: Math.round(statusRect.height),
        state: card.getAttribute('data-lifecycle-state') ?? '',
        statusPill: getComputedStyle(status).borderRadius === '999px',
      };
    })(),
  }))()`);
  const expectedAdd = {
    skills: [1, 0, 0],
    mcp: [0, 1, 0],
    'professional-applications': [0, 0, 1],
  }[selectedTab];
  if (
    state.roots !== 1 ||
    state.tabs !== 3 ||
    state.selected !== selectedTab ||
    JSON.stringify([state.skillAdd, state.mcpAdd, state.professionalAdd]) !==
      JSON.stringify(expectedAdd) ||
    state.toolbarLayout === null ||
    state.toolbarLayout.overflow ||
    state.toolbarLayout.searchWidth < 192 ||
    state.toolbarLayout.actions.length < 1 ||
    state.toolbarLayout.actions.some((action) => !action.nowrap || !action.sameRow) ||
    (selectedTab !== 'mcp' &&
      (state.cardLayout === null ||
        state.cardLayout.width !== 214 ||
        state.cardLayout.height !== 120 ||
        state.cardLayout.horizontalStartInset < 12 ||
        state.cardLayout.horizontalEndInset < 12 ||
        state.cardLayout.horizontalInsetDelta > 1 ||
        state.cardLayout.verticalStartInset < 12 ||
        state.cardLayout.verticalEndInset < 12 ||
        state.cardLayout.verticalInsetDelta > 1 ||
        state.cardLayout.statusHeight !== 20 ||
        !state.cardLayout.statusPill))
  ) {
    throw new Error(`Extension management state is invalid: ${JSON.stringify(state)}`);
  }
  return state;
}

function assertAlignedCardMetrics(skills, professionalApplications) {
  if (
    skills === null ||
    professionalApplications === null ||
    skills.width !== professionalApplications.width ||
    skills.height !== professionalApplications.height ||
    skills.horizontalStartInset !== professionalApplications.horizontalStartInset ||
    skills.horizontalEndInset !== professionalApplications.horizontalEndInset ||
    skills.verticalStartInset !== professionalApplications.verticalStartInset ||
    skills.verticalEndInset !== professionalApplications.verticalEndInset ||
    skills.statusHeight !== professionalApplications.statusHeight
  ) {
    throw new Error(
      `Extension card metrics are not aligned: ${JSON.stringify({
        skills,
        professionalApplications,
      })}`,
    );
  }
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

async function waitForEvaluation(evaluate, expression, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Desktop evaluation did not settle before timeout: ${expression}`);
}
