import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const NAVIGATION_SELECTOR =
  '[data-primary-sidebar="application"] .home-primary-navigation .home-nav-button';
const MAIN_SLOT = '[data-workbench-slot="main"]';
const AGENT_SURFACE = '[data-primary-surface="agent"]';

export const projectWorldCreationEntryScenario = Object.freeze({
  id: 'project-world-creation-entry',
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

    await clickNavigation(evaluate, click, 'Projects', '项目');
    await waitForSelector(`${MAIN_SLOT} [data-project-template-id="storyboard"]`);
    await click(`${MAIN_SLOT} [data-project-template-id="storyboard"]`);
    const projectState = await inspectUnavailableProjectTemplates(evaluate);
    checkpoint('project-templates-unavailable', projectState);
    const projectScreenshot = await screenshot('project-templates-unavailable');

    await clickNavigation(evaluate, click, 'Worlds', '世界');
    await waitForSelector(`${MAIN_SLOT} [data-world-management-action="create"]`);
    await click(`${MAIN_SLOT} [data-world-management-action="create"]`);
    await waitForSelector(`${AGENT_SURFACE} #agent-entry-authoring-name`);
    const blankWorldState = await inspectWorldCreation(evaluate, '');
    checkpoint('blank-world-entry', blankWorldState);
    await click(`${AGENT_SURFACE} .agent-entry-authoring-creation-header button`);

    await clickNavigation(evaluate, click, 'Worlds', '世界');
    await waitForSelector(`${MAIN_SLOT} [data-world-template="world-bible"]`);
    await click(`${MAIN_SLOT} [data-world-template="world-bible"]`);
    await waitForSelector(`${AGENT_SURFACE} #agent-entry-authoring-name`);
    const worldBibleState = await inspectWorldCreation(evaluate, '$world-creator ');
    checkpoint('world-bible-entry', worldBibleState);
    const worldEntryScreenshot = await screenshot('world-bible-entry');

    await type(`${AGENT_SURFACE} #agent-entry-authoring-name`, 'Neko World');
    await click(`${AGENT_SURFACE} .agent-entry-authoring-creation .agent-entry-resource-card`, 0);
    await waitForSelector(
      `${AGENT_SURFACE} .agent-entry-binding-item[data-entry-binding-kind="world-project"]`,
    );
    const boundWorldState = await inspectBoundWorld(evaluate);
    checkpoint('world-project-bound', boundWorldState);
    const worldBoundScreenshot = await screenshot('world-project-bound');

    return { screenshots: [projectScreenshot, worldEntryScreenshot, worldBoundScreenshot] };
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

async function inspectUnavailableProjectTemplates(evaluate) {
  const state = await evaluate(`(() => {
    const templates = [...document.querySelectorAll(
      '${MAIN_SLOT} .project-template-card[data-availability="unavailable"]'
    )];
    return {
      templates: templates.length,
      disabledTemplates: templates.filter((template) => template.disabled).length,
      unavailableLabels: templates.filter((template) =>
        ['Coming soon', '即将推出'].includes(
          template.querySelector('.project-template-card__action')?.textContent?.trim()
        )
      ).length,
      agentSurfaces: document.querySelectorAll('${AGENT_SURFACE}').length,
    };
  })()`);
  if (
    state.templates !== 2 ||
    state.disabledTemplates !== 2 ||
    state.unavailableLabels !== 2 ||
    state.agentSurfaces !== 0
  ) {
    throw new Error(`Project template availability is invalid: ${JSON.stringify(state)}`);
  }
  return state;
}

async function inspectWorldCreation(evaluate, expectedComposerValue) {
  const state = await evaluate(`(() => ({
    composerValue: document.querySelector('${AGENT_SURFACE} .agent-composer-textarea')?.value,
    nameLabel: document.querySelector(
      '${AGENT_SURFACE} label[for="agent-entry-authoring-name"]'
    )?.textContent?.trim(),
    destinations: document.querySelectorAll(
      '${AGENT_SURFACE} .agent-entry-authoring-creation .agent-entry-resource-card'
    ).length,
  }))()`);
  if (
    state.composerValue !== expectedComposerValue ||
    !['World name', '世界名称'].includes(state.nameLabel) ||
    state.destinations < 1
  ) {
    throw new Error(`World creation handoff is invalid: ${JSON.stringify(state)}`);
  }
  return state;
}

async function inspectBoundWorld(evaluate) {
  const state = await evaluate(`(() => {
    const binding = document.querySelector(
      '${AGENT_SURFACE} .agent-entry-binding-item[data-entry-binding-kind="world-project"]'
    );
    return {
      bindings: binding ? 1 : 0,
      label: binding?.getAttribute('title'),
      creationForms: document.querySelectorAll(
        '${AGENT_SURFACE} .agent-entry-authoring-creation'
      ).length,
    };
  })()`);
  if (state.bindings !== 1 || !state.label?.includes('Neko World') || state.creationForms !== 0) {
    throw new Error(`Project-local World binding is invalid: ${JSON.stringify(state)}`);
  }
  return state;
}
