import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const PRIMARY_SIDEBAR = '[data-primary-sidebar="application"]';
const PRIMARY_NAVIGATION = `${PRIMARY_SIDEBAR} .home-primary-navigation .home-nav-button`;
const AGENT_SURFACE = '[data-primary-surface="agent"]';

function createCreativeCapabilityVisibilityScenario({ id, expectedVisible }) {
  return Object.freeze({
    id,
    owner: '@neko/app-desktop',
    async prepare({ fixtureHome }) {
      const workspacePath = join(fixtureHome, 'workspace');
      await mkdir(workspacePath, { recursive: true });
      return { workspacePath };
    },
    async run({ checkpoint, click, evaluate, screenshot, waitForDesktopBridge, waitForSelector }) {
      await waitForDesktopBridge(60_000);
      await waitForSelector(PRIMARY_SIDEBAR);
      await waitForSelector(AGENT_SURFACE);

      const state = await evaluate(`(() => ({
        navigationLabels: [...document.querySelectorAll(${JSON.stringify(PRIMARY_NAVIGATION)})]
          .map((element) => element.textContent?.trim()).filter(Boolean),
        recentSections: [...document.querySelectorAll(
          '${PRIMARY_SIDEBAR} [data-navigation-section]'
        )].map((element) => element.getAttribute('data-navigation-section')),
        experimentalGroups: document.querySelectorAll(
          '${PRIMARY_SIDEBAR} [data-navigation-group="experimental"]'
        ).length,
        characterContextActions: document.querySelectorAll(
          '${AGENT_SURFACE} [data-entry-context-action="character"]'
        ).length,
        worldContextActions: document.querySelectorAll(
          '${AGENT_SURFACE} [data-entry-context-action="world"]'
        ).length,
        characterSurfaces: document.querySelectorAll(
          '[data-character-management-catalog="true"], [data-character-authoring-studio="true"]'
        ).length,
        worldSurfaces: document.querySelectorAll(
          '[data-world-management-catalog-root="true"], [data-world-authoring-studio="true"], [data-world-runtime-surface]'
        ).length,
      }))()`);

      const creativeNavigationLabels = state.navigationLabels.filter((label) =>
        ['Characters', 'Worlds', '角色', '世界'].includes(label),
      );
      const creativeRecentSections = state.recentSections.filter((section) =>
        ['characters', 'worlds'].includes(section),
      );
      const navigationOrder = state.navigationLabels.map((label) => {
        if (['Start creating', '开始创作'].includes(label)) return 'start';
        if (['Projects', '项目'].includes(label)) return 'projects';
        if (['Works', '作品'].includes(label)) return 'works';
        if (['Asset Library', '资产库'].includes(label)) return 'assets';
        if (['Extensions', '扩展'].includes(label)) return 'extensions';
        if (['Characters', '角色'].includes(label)) return 'characters';
        if (['Worlds', '世界'].includes(label)) return 'worlds';
        return label;
      });
      const expectedNavigationOrder = [
        'start',
        'projects',
        'works',
        'assets',
        'extensions',
        ...(expectedVisible ? ['characters', 'worlds'] : []),
      ];
      const expectedCount = expectedVisible ? 2 : 0;
      if (
        JSON.stringify(navigationOrder) !== JSON.stringify(expectedNavigationOrder) ||
        JSON.stringify(state.recentSections) !== JSON.stringify(['conversations']) ||
        creativeNavigationLabels.length !== expectedCount ||
        creativeRecentSections.length !== 0 ||
        state.experimentalGroups !== (expectedVisible ? 1 : 0) ||
        state.characterContextActions !== (expectedVisible ? 1 : 0) ||
        state.worldContextActions !== (expectedVisible ? 1 : 0) ||
        state.characterSurfaces !== 0 ||
        state.worldSurfaces !== 0
      ) {
        throw new Error(
          `Creative capability visibility is invalid for '${id}': ${JSON.stringify(state)}`,
        );
      }

      const screenshots = [await screenshot(id)];
      checkpoint(id, state);
      let adjacentNavigation;
      if (!expectedVisible) {
        const adjacentCases = [
          {
            labels: ['Asset Library', '资产库'],
            selector: '[data-owner-root="asset-management"]',
            settledExpression: `(() => {
              const root = document.querySelector('[data-owner-root="asset-management"]');
              const text = root?.textContent ?? '';
              return !text.includes('正在加载') && !text.includes('Loading') &&
                root?.querySelectorAll('.global-library-browser__modes button').length === 2 &&
                root?.querySelectorAll('.global-library-browser__modes button[aria-pressed="true"]').length === 1 &&
                root?.querySelector('.global-library-browser__toolbar .global-library-browser__modes') === null;
            })()`,
            screenshot: 'release-adjacent-asset-management',
          },
          {
            labels: ['Extensions', '扩展'],
            selector: '.agent-extension-management-root',
            screenshot: 'release-adjacent-extension-management',
          },
          {
            labels: ['Projects', '项目'],
            selector: '.project-management-catalog',
            settledExpression: `(() => {
              const root = document.querySelector('.project-management-catalog');
              const cards = [...(root?.querySelectorAll('.project-template-card') ?? [])];
              const identities = cards.map((card) => card.getAttribute('data-project-template-id'));
              return cards.length === 2 &&
                root?.querySelectorAll('.project-template-card__preview').length === 2 &&
                identities.includes('storyboard') && identities.includes('video-plan') &&
                !identities.includes('character-kit') &&
                root?.querySelector('.management-segmented-control, [data-view-mode]') === null;
            })()`,
            screenshot: 'release-adjacent-project-management',
          },
          {
            labels: ['Works', '作品'],
            selector: '[data-creative-management-catalog="works"]',
            settledExpression: `(() => {
              const root = document.querySelector('[data-creative-management-catalog="works"]');
              return root?.querySelector('.creative-library-catalog__empty') !== null &&
                root?.querySelector('.creative-library-catalog__hero h1') !== null &&
                root?.querySelector('#my-works-heading') !== null &&
                root?.querySelector('.management-surface-header') === null &&
                root?.querySelector('.management-segmented-control, [data-view-mode], button, input') === null;
            })()`,
            screenshot: 'release-adjacent-works-management',
          },
          {
            labels: ['Start creating', '开始创作'],
            selector: AGENT_SURFACE,
            screenshot: 'release-adjacent-agent-entry-return',
          },
        ];
        for (const adjacentCase of adjacentCases) {
          await clickNavigationByLabel({
            click,
            evaluate,
            labels: adjacentCase.labels,
          });
          await waitForSelector(adjacentCase.selector);
          if (adjacentCase.settledExpression) {
            await waitForEvaluation(evaluate, adjacentCase.settledExpression);
          }
          screenshots.push(await screenshot(adjacentCase.screenshot));
        }
        adjacentNavigation = await evaluate(`(() => ({
          characterContextActions: document.querySelectorAll(
            '${AGENT_SURFACE} [data-entry-context-action="character"]'
          ).length,
          worldContextActions: document.querySelectorAll(
            '${AGENT_SURFACE} [data-entry-context-action="world"]'
          ).length,
          activeAgentSurfaces: document.querySelectorAll('${AGENT_SURFACE}').length,
          retainedAssetSurfaces: document.querySelectorAll('[data-owner-root="asset-management"]').length,
          retainedExtensionSurfaces: document.querySelectorAll('.agent-extension-management-root').length,
          retainedProjectSurfaces: document.querySelectorAll('.project-management-catalog').length,
        }))()`);
        if (
          adjacentNavigation.characterContextActions !== 0 ||
          adjacentNavigation.worldContextActions !== 0 ||
          adjacentNavigation.activeAgentSurfaces !== 1 ||
          adjacentNavigation.retainedAssetSurfaces !== 0 ||
          adjacentNavigation.retainedExtensionSurfaces !== 0 ||
          adjacentNavigation.retainedProjectSurfaces !== 0
        ) {
          throw new Error(
            `Release adjacent navigation did not return to an isolated Agent Entry: ${JSON.stringify(adjacentNavigation)}`,
          );
        }
        checkpoint('release-adjacent-navigation', adjacentNavigation);
      }
      return {
        expectedVisible,
        state,
        ...(adjacentNavigation === undefined ? {} : { adjacentNavigation }),
        screenshots,
      };
    },
  });
}

export const developmentCreativeCapabilityVisibilityScenario =
  createCreativeCapabilityVisibilityScenario({
    id: 'development-creative-capability-visibility',
    expectedVisible: true,
  });

export const releaseCreativeCapabilityVisibilityScenario =
  createCreativeCapabilityVisibilityScenario({
    id: 'release-creative-capability-visibility',
    expectedVisible: false,
  });

async function clickNavigationByLabel({ click, evaluate, labels }) {
  const index = await evaluate(
    `(() => [...document.querySelectorAll(${JSON.stringify(
      PRIMARY_NAVIGATION,
    )})].findIndex((button) => ${JSON.stringify(labels)}.includes(button.textContent?.trim())))()`,
  );
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`Application navigation '${labels.join(' / ')}' is unavailable.`);
  }
  await click(PRIMARY_NAVIGATION, index);
}

async function waitForEvaluation(evaluate, expression, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Desktop evaluation did not settle before timeout: ${expression}`);
}
