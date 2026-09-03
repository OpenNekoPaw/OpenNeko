import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const NAVIGATION_SELECTOR =
  '[data-primary-sidebar="application"] .home-primary-navigation .home-nav-button';
const MAIN_SLOT = '[data-workbench-slot="main"]';
const AGENT_SURFACE = '[data-primary-surface="agent"]';

export const characterCreationEntryScenario = Object.freeze({
  id: 'character-creation-entry',
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
    await clickNavigation(evaluate, click, 'Characters', '角色');
    await waitForSelector(`${MAIN_SLOT} [data-character-management-catalog="true"]`);

    const catalogState = await inspectCatalog(evaluate);
    checkpoint('character-catalog-actions', catalogState);
    const catalogScreenshot = await screenshot('character-catalog-actions');

    await click(`${MAIN_SLOT} [data-character-management-action="create"]`);
    await waitForSelector(`${AGENT_SURFACE} #agent-entry-authoring-name`);
    const blankState = await inspectCreationEntry(evaluate);
    if (blankState.composerValue !== '') {
      throw new Error(`Blank Character creation injected a prompt: ${JSON.stringify(blankState)}`);
    }
    checkpoint('blank-character-entry', blankState);
    const blankScreenshot = await screenshot('blank-character-entry');
    await click(`${AGENT_SURFACE} .agent-entry-authoring-creation-header button`);

    await clickNavigation(evaluate, click, 'Characters', '角色');
    await waitForSelector(`${MAIN_SLOT} [data-character-template="character-kit"]`);
    await click(`${MAIN_SLOT} [data-character-template="character-kit"]`);
    await waitForSelector(`${AGENT_SURFACE} #agent-entry-authoring-name`);
    const kitState = await inspectCreationEntry(evaluate);
    if (kitState.composerValue !== '$character-creator ') {
      throw new Error(
        `Character Kit did not inject its Skill gesture: ${JSON.stringify(kitState)}`,
      );
    }

    await type(`${AGENT_SURFACE} #agent-entry-authoring-name`, 'Neko');
    await click(`${AGENT_SURFACE} .agent-entry-authoring-creation .agent-entry-resource-card`, 0);
    await waitForSelector(
      `${AGENT_SURFACE} .agent-entry-binding-item[data-entry-binding-kind="character-project"]`,
    );
    const boundState = await inspectBoundCharacter(evaluate);
    checkpoint('character-kit-project-bound', boundState);
    const boundScreenshot = await screenshot('character-kit-project-bound');

    return { screenshots: [catalogScreenshot, blankScreenshot, boundScreenshot] };
  },
});

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

async function inspectCatalog(evaluate) {
  const state = await evaluate(`(() => ({
    catalogs: document.querySelectorAll('${MAIN_SLOT} [data-character-management-catalog="true"]').length,
    createActions: document.querySelectorAll('${MAIN_SLOT} [data-character-management-action="create"]').length,
    characterKits: document.querySelectorAll('${MAIN_SLOT} [data-character-template="character-kit"]').length,
  }))()`);
  if (state.catalogs !== 1 || state.createActions !== 1 || state.characterKits !== 1) {
    throw new Error(`Character catalog creation actions are invalid: ${JSON.stringify(state)}`);
  }
  return state;
}

async function inspectCreationEntry(evaluate) {
  const state = await evaluate(`(() => ({
    composerValue: document.querySelector('${AGENT_SURFACE} .agent-composer-textarea')?.value,
    authoringSelected: document.querySelector(
      '${AGENT_SURFACE} [data-segmented-value="authoring"]'
    )?.getAttribute('aria-selected'),
    nameInputs: document.querySelectorAll('${AGENT_SURFACE} #agent-entry-authoring-name').length,
    destinations: document.querySelectorAll(
      '${AGENT_SURFACE} .agent-entry-authoring-creation .agent-entry-resource-card'
    ).length,
  }))()`);
  if (state.authoringSelected !== 'true' || state.nameInputs !== 1 || state.destinations < 1) {
    throw new Error(`Character creation entry is invalid: ${JSON.stringify(state)}`);
  }
  return state;
}

async function inspectBoundCharacter(evaluate) {
  const state = await evaluate(`(() => {
    const binding = document.querySelector(
      '${AGENT_SURFACE} .agent-entry-binding-item[data-entry-binding-kind="character-project"]'
    );
    return {
      bindings: binding ? 1 : 0,
      label: binding?.getAttribute('title'),
      creationForms: document.querySelectorAll(
        '${AGENT_SURFACE} .agent-entry-authoring-creation'
      ).length,
    };
  })()`);
  if (state.bindings !== 1 || !state.label?.includes('Neko') || state.creationForms !== 0) {
    throw new Error(`Project-local Character binding is invalid: ${JSON.stringify(state)}`);
  }
  return state;
}
