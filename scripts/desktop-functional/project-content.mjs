import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openFixtureWorkspace } from './desktop-operations.mjs';

const WORKSPACE_ID = '3b06f513-24a5-4cb1-906c-722005582277';

export const projectContentScenario = Object.freeze({
  id: 'project-content',
  owner: '@neko/project-webview',
  async prepare({ fixtureHome }) {
    const workspacePath = join(fixtureHome, 'workspace');
    await mkdir(join(workspacePath, 'neko'), { recursive: true });
    await writeFile(
      join(workspacePath, 'neko', 'project.json'),
      `${JSON.stringify({ workspaceId: WORKSPACE_ID }, null, 2)}\n`,
      'utf8',
    );
    return { workspacePath };
  },
  async run({ checkpoint, click, evaluate, screenshot, waitForSelector }) {
    await resizeWindow(evaluate, 1440, 900);
    await openFixtureWorkspace(evaluate);
    await waitForSelector('[data-project-browser-view="resources"]');
    await waitForSelector('.neko-resource-browser__sources');
    const resources = await inspectResources(evaluate);
    checkpoint('project-browser-resources', resources);

    await click('.project-resource-dock__views button', 1);
    await waitForSelector('.project-content-root');
    await waitForSelector('.project-content-group');
    const wide = await inspectProjectContent(evaluate);
    checkpoint('project-content-wide', wide);
    const wideScreenshot = await screenshot('project-content-wide');

    await resizeWindow(evaluate, 960, 640);
    const narrow = await inspectProjectContent(evaluate);
    checkpoint('project-content-narrow', narrow);
    const narrowScreenshot = await screenshot('project-content-narrow');

    await click('.project-resource-dock__views button', 0);
    await waitForSelector('.neko-resource-browser__sources');
    const returned = await evaluate(`(() => ({
      projectContentRoots: document.querySelectorAll('.project-content-root').length,
      resourceRoots: document.querySelectorAll('.neko-resource-browser').length,
      selectedView: document.querySelector('[data-project-browser-view]')?.getAttribute('data-project-browser-view'),
    }))()`);
    if (
      returned.projectContentRoots !== 0 ||
      returned.resourceRoots !== 1 ||
      returned.selectedView !== 'resources'
    ) {
      throw new Error(`Project Browser did not return to Resources: ${JSON.stringify(returned)}`);
    }
    checkpoint('project-browser-returned-resources', returned);

    const navigationIndex = await evaluate(`(() => [...document.querySelectorAll(
      '[data-primary-sidebar="application"] .home-primary-navigation .home-nav-button'
    )].findIndex((button) => ['All projects', '所有项目'].includes(button.textContent?.trim() ?? '')))()`);
    if (!Number.isInteger(navigationIndex) || navigationIndex < 0) {
      throw new Error('Project management navigation is unavailable.');
    }
    await click(
      '[data-primary-sidebar="application"] .home-primary-navigation .home-nav-button',
      navigationIndex,
    );
    await waitForSelector('[data-project-catalog-root]');
    const unmounted = await evaluate(`(() => ({
      projectContentRoots: document.querySelectorAll('.project-content-root').length,
      projectBrowserRoots: document.querySelectorAll('[data-project-browser-view]').length,
      projectCatalogRoots: document.querySelectorAll('[data-project-catalog-root]').length,
    }))()`);
    if (
      unmounted.projectContentRoots !== 0 ||
      unmounted.projectBrowserRoots !== 0 ||
      unmounted.projectCatalogRoots !== 1
    ) {
      throw new Error(
        `Project Content Root was retained after navigation: ${JSON.stringify(unmounted)}`,
      );
    }
    checkpoint('project-content-unmounted', unmounted);

    return {
      resources,
      wide,
      narrow,
      returned,
      unmounted,
      screenshots: [wideScreenshot, narrowScreenshot],
    };
  },
});

async function inspectResources(evaluate) {
  const state = await evaluate(`(() => {
    const projectViews = [...document.querySelectorAll('.project-resource-dock__views [role="tab"]')];
    const sourceTabs = [...document.querySelectorAll('.neko-resource-browser__sources [role="tab"]')];
    return {
      projectViews: projectViews.map((tab) => tab.textContent?.trim() ?? ''),
      selectedProjectView: projectViews.find((tab) => tab.getAttribute('aria-selected') === 'true')?.textContent?.trim() ?? '',
      resourceSources: sourceTabs.map((tab) => tab.textContent?.trim() ?? ''),
      selectedResourceSource: sourceTabs.find((tab) => tab.getAttribute('aria-selected') === 'true')?.textContent?.trim() ?? '',
      searchPlaceholder: document.querySelector('.neko-resource-browser__search input')?.getAttribute('placeholder') ?? '',
      projectContentRoots: document.querySelectorAll('.project-content-root').length,
      canvasRoots: document.querySelectorAll('[data-canvas-webview-root="true"]').length,
    };
  })()`);
  const expectedProjectViews = [
    ['Resources', 'Project content'],
    ['资源', '项目内容'],
  ];
  const expectedResourceSources = [
    ['Project files', 'External media', 'Assets'],
    ['项目文件', '外部媒体', '素材'],
  ];
  if (
    !expectedProjectViews.some(
      (labels) => JSON.stringify(labels) === JSON.stringify(state.projectViews),
    ) ||
    !['Resources', '资源'].includes(state.selectedProjectView) ||
    !expectedResourceSources.some(
      (labels) => JSON.stringify(labels) === JSON.stringify(state.resourceSources),
    ) ||
    !['Project files', '项目文件'].includes(state.selectedResourceSource) ||
    !state.searchPlaceholder ||
    state.projectContentRoots !== 0 ||
    state.canvasRoots !== 1
  ) {
    throw new Error(`Resources presentation is invalid: ${JSON.stringify(state)}`);
  }
  return state;
}

async function inspectProjectContent(evaluate) {
  const state = await evaluate(`(() => {
    const root = document.querySelector('.project-content-root');
    const groups = [...document.querySelectorAll('[data-project-content-group]')];
    const sourceTabs = [...document.querySelectorAll('.neko-resource-browser__sources [role="tab"]')];
    const rect = root?.getBoundingClientRect();
    return {
      selectedProjectView: document.querySelector(
        '.project-resource-dock__views [role="tab"][aria-selected="true"]'
      )?.textContent?.trim() ?? '',
      groups: groups.map((group) => ({
        id: group.getAttribute('data-project-content-group'),
        title: group.querySelector('h3')?.textContent?.trim() ?? '',
        empty: group.querySelector('.project-content-empty')?.textContent?.trim() ?? '',
      })),
      resourceSources: sourceTabs.map((tab) => tab.textContent?.trim() ?? ''),
      visibleWidth: rect?.width ?? 0,
      documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      rootOverflow: root instanceof HTMLElement && root.scrollWidth > root.clientWidth,
      canvasRoots: document.querySelectorAll('[data-canvas-webview-root="true"]').length,
    };
  })()`);
  const groupIds = state.groups.map((group) => group.id);
  if (
    !['Project content', '项目内容'].includes(state.selectedProjectView) ||
    JSON.stringify(groupIds) !==
      JSON.stringify(['characters', 'worlds', 'elements', 'candidates']) ||
    state.groups.some((group) => group.empty.length === 0) ||
    state.resourceSources.length !== 3 ||
    state.visibleWidth <= 0 ||
    state.documentOverflow ||
    state.rootOverflow ||
    state.canvasRoots !== 1
  ) {
    throw new Error(`Project Content presentation is invalid: ${JSON.stringify(state)}`);
  }
  return state;
}

async function resizeWindow(evaluate, width, height) {
  await evaluate(`new Promise((resolve, reject) => {
    window.resizeTo(${String(width)}, ${String(height)});
    const started = Date.now();
    const poll = () => {
      if (Math.abs(window.outerWidth - ${String(width)}) <= 4 && Math.abs(window.outerHeight - ${String(height)}) <= 4) {
        resolve(true);
        return;
      }
      if (Date.now() - started > 5000) {
        reject(new Error('Desktop window did not reach the requested size.'));
        return;
      }
      setTimeout(poll, 50);
    };
    poll();
  })`);
}
