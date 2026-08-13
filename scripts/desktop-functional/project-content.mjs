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
    await waitForSelector('.project-content-root');
    await waitForSelector('.project-content-group');
    const wide = await inspectProjectContent(evaluate);
    checkpoint('project-content-wide', wide);
    const wideScreenshot = await screenshot('project-content-wide');

    await resizeWindow(evaluate, 960, 640);
    const narrow = await inspectProjectContent(evaluate);
    checkpoint('project-content-narrow', narrow);
    const narrowScreenshot = await screenshot('project-content-narrow');

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
      projectCatalogRoots: document.querySelectorAll('[data-project-catalog-root]').length,
    }))()`);
    if (unmounted.projectContentRoots !== 0 || unmounted.projectCatalogRoots !== 1) {
      throw new Error(
        `Project Content Root was retained after navigation: ${JSON.stringify(unmounted)}`,
      );
    }
    checkpoint('project-content-unmounted', unmounted);

    return { wide, narrow, unmounted, screenshots: [wideScreenshot, narrowScreenshot] };
  },
});

async function inspectProjectContent(evaluate) {
  const state = await evaluate(`(() => {
    const root = document.querySelector('.project-content-root');
    const groups = [...document.querySelectorAll('[data-project-content-group]')];
    const sourceTabs = [...document.querySelectorAll('.neko-resource-browser__sources [role="tab"]')];
    const rect = root?.getBoundingClientRect();
    return {
      title: root?.querySelector('h2')?.textContent?.trim() ?? '',
      groups: groups.map((group) => ({
        id: group.getAttribute('data-project-content-group'),
        title: group.querySelector('h3')?.textContent?.trim() ?? '',
        empty: group.querySelector('.project-content-empty')?.textContent?.trim() ?? '',
      })),
      resourceSources: sourceTabs.map((tab) => tab.textContent?.trim() ?? ''),
      visibleWidth: rect?.width ?? 0,
      documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      rootOverflow: root instanceof HTMLElement && root.scrollWidth > root.clientWidth,
    };
  })()`);
  const groupIds = state.groups.map((group) => group.id);
  if (
    !['Project content', '项目内容'].includes(state.title) ||
    JSON.stringify(groupIds) !==
      JSON.stringify(['characters', 'worlds', 'elements', 'candidates']) ||
    state.groups.some((group) => group.empty.length === 0) ||
    state.resourceSources.length !== 3 ||
    state.visibleWidth <= 0 ||
    state.documentOverflow ||
    state.rootOverflow
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
