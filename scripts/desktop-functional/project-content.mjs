import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { openFixtureWorkspace } from './desktop-operations.mjs';

const WORKSPACE_ID = '3b06f513-24a5-4cb1-906c-722005582277';
const CHARACTER_PROJECT_ID = 'character-rin';
const WORLD_PROJECT_ID = 'world-cinder-sea';

export const projectContentScenario = Object.freeze({
  id: 'project-content',
  owner: '@neko/project-webview',
  async prepare({ fixtureHome }) {
    const workspacePath = join(fixtureHome, 'workspace');
    await seedWorkspace(workspacePath);
    await seedGlobalCatalogs(fixtureHome);
    return { workspacePath };
  },
  async run({ checkpoint, click, evaluate, screenshot, type, waitForSelector }) {
    await resizeWindow(evaluate, 1440, 900);
    await openFixtureWorkspace(evaluate);
    await waitForSelector('[data-project-browser-view="resources"]');
    await waitForSelector('.neko-resource-browser__sources');
    const resources = await inspectResources(evaluate);
    checkpoint('project-browser-resources', resources);

    await click('.project-resource-dock__views button', 1);
    await waitForSelector('.project-workspace-root__catalog');
    await waitForSelector('.project-workspace-root__card');
    const wide = await inspectCreativeCatalog(evaluate, { minimumCards: 7 });
    if (!wide.cards.some((card) => card.label === 'world-invalid' && card.diagnostic)) {
      throw new Error(
        `Project creative invalid record is not fail-visible: ${JSON.stringify(wide)}`,
      );
    }
    checkpoint('project-creative-catalog-wide', wide);
    const wideScreenshot = await screenshot('project-creative-catalog-wide');

    await type('.project-workspace-root__search input', 'Archive');
    const searched = await inspectCreativeCatalog(evaluate, { exactCards: 1 });
    if (searched.cards[0]?.label !== 'Archive City') {
      throw new Error(
        `Project creative search returned the wrong card: ${JSON.stringify(searched)}`,
      );
    }
    checkpoint('project-creative-catalog-searched', searched);
    const searchedScreenshot = await screenshot('project-creative-catalog-searched');

    await click('.project-workspace-root__details-toolbar button');
    await waitForSelector('.project-workspace-root__card-details');
    const details = await inspectDetails(evaluate);
    checkpoint('project-creative-catalog-details', details);
    const detailsScreenshot = await screenshot('project-creative-catalog-details');
    await click('.project-workspace-root__details-toolbar button');

    await type('.project-workspace-root__search input', 'No matching creative record');
    const noResults = await inspectCreativeCatalog(evaluate, { exactCards: 0 });
    const emptyStateVisible = await evaluate(
      `document.querySelector('[data-neko-empty-state="fill"]') instanceof HTMLElement`,
    );
    if (!emptyStateVisible) {
      throw new Error('Project creative no-results state is unavailable.');
    }
    checkpoint('project-creative-catalog-no-results', noResults);
    const noResultsScreenshot = await screenshot('project-creative-catalog-no-results');

    await type('.project-workspace-root__search input', '');
    const entityFilterIndex = await evaluate(`(() => [...document.querySelectorAll(
      '.project-workspace-root__kind-filters button'
    )].findIndex((button) => ['Entity', '实体'].includes(button.textContent?.trim() ?? '')))()`);
    if (!Number.isInteger(entityFilterIndex) || entityFilterIndex < 0) {
      throw new Error('Project creative Entity filter is unavailable.');
    }
    await click('.project-workspace-root__kind-filters button', entityFilterIndex);
    const filtered = await inspectCreativeCatalog(evaluate, { exactCards: 1 });
    if (filtered.cards[0]?.kind !== 'entity') {
      throw new Error(
        `Project creative type filter returned the wrong card: ${JSON.stringify(filtered)}`,
      );
    }
    checkpoint('project-creative-catalog-filtered', filtered);

    await click('.project-workspace-root__kind-filters button', 0);
    await click('.project-workspace-root__add-reference');
    await waitForSelector('.project-workspace-root__add-panel');
    const addPanel = await inspectAddPanel(evaluate);
    checkpoint('project-creative-global-reference-panel', addPanel);
    const addPanelScreenshot = await screenshot('project-creative-global-reference-panel');

    await resizeWindow(evaluate, 960, 640);
    const narrow = await inspectCreativeCatalog(evaluate, { minimumCards: 7 });
    checkpoint('project-creative-catalog-narrow', narrow);
    const narrowScreenshot = await screenshot('project-creative-catalog-narrow');

    await click('.project-resource-dock__views button', 0);
    await waitForSelector('.neko-resource-browser__sources');
    const returned = await evaluate(`(() => ({
      projectWorkspaceRoots: document.querySelectorAll('.project-workspace-root').length,
      resourceRoots: document.querySelectorAll('.neko-resource-browser').length,
      selectedView: document.querySelector('[data-project-browser-view]')?.getAttribute('data-project-browser-view'),
    }))()`);
    if (
      returned.projectWorkspaceRoots !== 0 ||
      returned.resourceRoots !== 1 ||
      returned.selectedView !== 'resources'
    ) {
      throw new Error(`Project Browser did not return to Resources: ${JSON.stringify(returned)}`);
    }
    checkpoint('project-browser-returned-resources', returned);

    const navigationIndex = await evaluate(`(() => [...document.querySelectorAll(
      '[data-primary-sidebar="application"] .home-primary-navigation .home-nav-button'
    )].findIndex((button) => ['Projects', '项目'].includes(button.textContent?.trim() ?? '')))()`);
    if (!Number.isInteger(navigationIndex) || navigationIndex < 0) {
      throw new Error('Project management navigation is unavailable.');
    }
    await click(
      '[data-primary-sidebar="application"] .home-primary-navigation .home-nav-button',
      navigationIndex,
    );
    await waitForSelector('[data-project-catalog-root]');
    const unmounted = await evaluate(`(() => ({
      projectWorkspaceRoots: document.querySelectorAll('.project-workspace-root').length,
      projectBrowserRoots: document.querySelectorAll('[data-project-browser-view]').length,
      projectCatalogRoots: document.querySelectorAll('[data-project-catalog-root]').length,
    }))()`);
    if (
      unmounted.projectWorkspaceRoots !== 0 ||
      unmounted.projectBrowserRoots !== 0 ||
      unmounted.projectCatalogRoots !== 1
    ) {
      throw new Error(
        `Project creative catalog Root was retained after navigation: ${JSON.stringify(unmounted)}`,
      );
    }
    checkpoint('project-creative-catalog-unmounted', unmounted);

    return {
      resources,
      wide,
      searched,
      details,
      noResults,
      filtered,
      addPanel,
      narrow,
      returned,
      unmounted,
      screenshots: [
        wideScreenshot,
        searchedScreenshot,
        detailsScreenshot,
        noResultsScreenshot,
        addPanelScreenshot,
        narrowScreenshot,
      ],
    };
  },
});

async function seedWorkspace(workspacePath) {
  const character = characterProject();
  const world = worldProject();
  const targets = [
    { kind: 'content-document', documentId: 'notes/story.md' },
    { kind: 'character-project', characterProjectId: CHARACTER_PROJECT_ID },
    { kind: 'world-project', worldProjectId: WORLD_PROJECT_ID },
    { kind: 'world-project', worldProjectId: 'world-invalid' },
  ];
  const globalReferences = [
    {
      kind: 'character-version',
      globalCharacterId: 'global-character-aster',
      characterVersionId: 'character-version-aster-first',
    },
    {
      kind: 'world-version',
      globalWorldId: 'global-world-archive',
      worldVersionId: 'world-version-archive-second',
    },
  ];
  const entityAssociation = {
    projectId: WORKSPACE_ID,
    entityId: 'entity-rin',
    characterProjectId: CHARACTER_PROJECT_ID,
  };
  await Promise.all([
    writeJson(join(workspacePath, 'neko', 'project.json'), { workspaceId: WORKSPACE_ID }),
    writeText(
      join(workspacePath, 'notes', 'story.md'),
      '# Harbor investigation\n\nRin follows the lantern trail into Cinder Sea.\n',
    ),
    writeJson(
      join(workspacePath, 'neko', 'characters', CHARACTER_PROJECT_ID, 'project.json'),
      character,
    ),
    writeJson(join(workspacePath, 'neko', 'worlds', WORLD_PROJECT_ID, 'project.json'), world),
    writeJson(join(workspacePath, 'neko', 'worlds', 'world-invalid', 'project.json'), {
      worldProjectId: 'world-invalid',
      title: '',
    }),
    writeJson(join(workspacePath, 'neko', 'entities.json'), entityDocument()),
    writeJson(
      join(
        workspacePath,
        'neko',
        'project-bindings',
        'entity-character',
        `${encodedRecordName(entityAssociation.entityId)}.json`,
      ),
      entityAssociation,
    ),
    ...targets.map((target) =>
      writeJson(
        join(
          workspacePath,
          'neko',
          'project-membership',
          'targets',
          `${encodedRecordName(targetKey(target))}.json`,
        ),
        { projectId: WORKSPACE_ID, target },
      ),
    ),
    ...globalReferences.map((reference) =>
      writeJson(
        join(
          workspacePath,
          'neko',
          'project-membership',
          'global-references',
          `${encodedRecordName(globalObjectKey(reference))}.json`,
        ),
        { projectId: WORKSPACE_ID, reference },
      ),
    ),
  ]);
}

async function seedGlobalCatalogs(fixtureHome) {
  const root = join(fixtureHome, '.neko', 'neko');
  const characterDefinition = characterProject().draft;
  const worldDefinition = worldProject().draft;
  await Promise.all([
    writeJson(
      join(
        root,
        'global-characters',
        `${Buffer.from('global-character-aster').toString('base64url')}.json`,
      ),
      {
        character: {
          globalCharacterId: 'global-character-aster',
          displayName: 'Aster Vale',
          currentCharacterVersionId: 'character-version-aster-first',
          characterVersionIds: ['character-version-aster-first'],
          createdAt: '2026-08-17T00:00:00.000Z',
          updatedAt: '2026-08-19T00:00:00.000Z',
        },
        versions: [
          {
            characterVersionId: 'character-version-aster-first',
            globalCharacterId: 'global-character-aster',
            label: 'First edition',
            definition: characterDefinition,
            acceptedEvidenceIds: [],
            publishedAt: '2026-08-19T00:00:00.000Z',
          },
        ],
        links: [],
      },
    ),
    writeJson(
      join(
        root,
        'global-characters',
        `${Buffer.from('global-character-mio').toString('base64url')}.json`,
      ),
      {
        character: {
          globalCharacterId: 'global-character-mio',
          displayName: 'Mio Chen',
          currentCharacterVersionId: 'character-version-mio-third',
          characterVersionIds: ['character-version-mio-third'],
          createdAt: '2026-08-18T00:00:00.000Z',
          updatedAt: '2026-08-22T00:00:00.000Z',
        },
        versions: [
          {
            characterVersionId: 'character-version-mio-third',
            globalCharacterId: 'global-character-mio',
            label: 'Third edition',
            definition: characterDefinition,
            acceptedEvidenceIds: [],
            publishedAt: '2026-08-22T00:00:00.000Z',
          },
        ],
        links: [],
      },
    ),
    writeJson(
      join(
        root,
        'global-worlds',
        `${Buffer.from('global-world-archive').toString('base64url')}.json`,
      ),
      {
        world: {
          globalWorldId: 'global-world-archive',
          title: 'Archive City',
          currentWorldVersionId: 'world-version-archive-second',
          worldVersionIds: ['world-version-archive-second'],
          createdAt: '2026-08-16T00:00:00.000Z',
          updatedAt: '2026-08-20T00:00:00.000Z',
        },
        versions: [
          {
            worldVersionId: 'world-version-archive-second',
            globalWorldId: 'global-world-archive',
            label: 'Second edition',
            definition: worldDefinition,
            acceptedSourceRefIds: [],
            publishedAt: '2026-08-20T00:00:00.000Z',
          },
        ],
        links: [],
      },
    ),
  ]);
}

function characterProject() {
  return {
    characterProjectId: CHARACTER_PROJECT_ID,
    displayName: 'Rin Kisaragi',
    draft: {
      summary: 'A harbor investigator who notices the details everyone else misses.',
      backgroundStory: {
        overview: '',
        origins: [],
        personalHistory: [],
        formativeEvents: [],
        establishedRelationships: [],
      },
      originSetting: {
        overview: '',
        eras: [],
        cultures: [],
        socialEnvironment: [],
        importantPlaces: [],
        organizations: [],
        believedRules: [],
      },
      canon: [],
      knowledgeBoundary: [],
      behaviorPolicy: [],
      expressionPolicy: [],
      representationRefs: [],
    },
    evidence: [],
    candidates: [],
    reviewStatus: 'draft',
    createdAt: '2026-08-18T00:00:00.000Z',
    updatedAt: '2026-08-22T09:00:00.000Z',
  };
}

function worldProject() {
  return {
    worldProjectId: WORLD_PROJECT_ID,
    title: 'Cinder Sea',
    draft: {
      background: 'An archipelago where memory is traded as light inside glass lanterns.',
      worldBook: [],
      locations: [],
      organizations: [],
      rules: [],
      initialFacts: [],
    },
    sourceRefs: [],
    reviewStatus: 'draft',
    createdAt: '2026-08-17T00:00:00.000Z',
    updatedAt: '2026-08-21T08:00:00.000Z',
  };
}

function entityDocument() {
  return {
    projectId: WORKSPACE_ID,
    entities: [
      {
        entityId: 'entity-rin',
        kind: 'character',
        names: { canonical: 'Rin Kisaragi', display: 'Rin Kisaragi', aliases: ['Rin'] },
        representations: [],
        lifecycle: { state: 'active' },
        createdAt: '2026-08-18T00:00:00.000Z',
        updatedAt: '2026-08-22T09:00:00.000Z',
      },
      {
        entityId: 'entity-rain-market',
        kind: 'location',
        names: { canonical: 'Rain Market', display: 'Rain Market', aliases: [] },
        representations: [],
        lifecycle: { state: 'active' },
        createdAt: '2026-08-19T00:00:00.000Z',
        updatedAt: '2026-08-23T00:00:00.000Z',
      },
    ],
  };
}

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
      projectWorkspaceRoots: document.querySelectorAll('.project-workspace-root').length,
      canvasRoots: document.querySelectorAll('[data-canvas-webview-root="true"]').length,
    };
  })()`);
  const expectedProjectViews = [
    ['Resources', 'Creation'],
    ['资源', '创作'],
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
    state.projectWorkspaceRoots !== 0 ||
    state.canvasRoots !== 1
  ) {
    throw new Error(`Resources presentation is invalid: ${JSON.stringify(state)}`);
  }
  return state;
}

async function inspectCreativeCatalog(evaluate, expectation) {
  const state = await evaluate(`(() => {
    const root = document.querySelector('.project-workspace-root');
    const cards = [...document.querySelectorAll('.project-workspace-root__card')];
    const rect = root?.getBoundingClientRect();
    return {
      selectedProjectView: document.querySelector(
        '.project-resource-dock__views [role="tab"][aria-selected="true"]'
      )?.textContent?.trim() ?? '',
      cards: cards.map((card) => ({
        label: card.querySelector('.project-workspace-root__card-title strong')?.textContent?.trim() ?? '',
        kind: card.getAttribute('data-creative-kind'),
        scope: card.getAttribute('data-creative-scope'),
        badges: [...card.querySelectorAll('.project-workspace-root__badge')].map((badge) => badge.textContent?.trim() ?? ''),
        diagnostic: card.querySelector('.project-workspace-root__card-diagnostic')?.textContent?.trim() ?? '',
      })),
      searchVisible: document.querySelector('.project-workspace-root__search input') instanceof HTMLInputElement,
      typeFilterCount: document.querySelectorAll('.project-workspace-root__kind-filters button').length,
      scopeFilterVisible: document.querySelector('[aria-label="Scope filter"], [aria-label="范围筛选"]') instanceof HTMLSelectElement,
      sortVisible: document.querySelector('[aria-label="Sort order"], [aria-label="排序方式"]') instanceof HTMLSelectElement,
      visibleWidth: rect?.width ?? 0,
      documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      rootOverflow: root instanceof HTMLElement && root.scrollWidth > root.clientWidth,
      canvasRoots: document.querySelectorAll('[data-canvas-webview-root="true"]').length,
    };
  })()`);
  const cardCountValid =
    expectation.exactCards === undefined
      ? state.cards.length >= expectation.minimumCards
      : state.cards.length === expectation.exactCards;
  if (
    !['Creation', '创作'].includes(state.selectedProjectView) ||
    !cardCountValid ||
    state.cards.some(
      (card) => !card.label || !card.kind || !card.scope || card.badges.length < 2,
    ) ||
    !state.searchVisible ||
    state.typeFilterCount !== 5 ||
    !state.scopeFilterVisible ||
    !state.sortVisible ||
    state.visibleWidth <= 0 ||
    state.documentOverflow ||
    state.rootOverflow ||
    state.canvasRoots !== 1
  ) {
    throw new Error(`Project creative catalog presentation is invalid: ${JSON.stringify(state)}`);
  }
  return state;
}

async function inspectAddPanel(evaluate) {
  const state = await evaluate(`(() => {
    const panel = document.querySelector('.project-workspace-root__add-panel');
    return {
      visible: panel instanceof HTMLElement && panel.getBoundingClientRect().height > 0,
      selectors: [...(panel?.querySelectorAll('select') ?? [])].map((select) => ({
        label: select.getAttribute('aria-label'),
        options: [...select.options].map((option) => option.textContent?.trim() ?? ''),
      })),
      addButtons: panel?.querySelectorAll('button').length ?? 0,
    };
  })()`);
  if (!state.visible || state.selectors.length !== 1 || state.addButtons !== 1) {
    throw new Error(`Project creative global reference panel is invalid: ${JSON.stringify(state)}`);
  }
  return state;
}

async function inspectDetails(evaluate) {
  const state = await evaluate(`(() => {
    const details = document.querySelector('.project-workspace-root__card-details');
    return {
      visible: details instanceof HTMLElement && details.getBoundingClientRect().height > 0,
      label: details?.getAttribute('aria-label') ?? '',
      rows: [...(details?.querySelectorAll('dl > div') ?? [])].map((row) => ({
        label: row.querySelector('dt')?.textContent?.trim() ?? '',
        value: row.querySelector('dd')?.textContent?.trim() ?? '',
      })),
      note: details?.querySelector('.project-workspace-root__card-details-note')?.textContent?.trim() ?? '',
    };
  })()`);
  if (
    !state.visible ||
    !state.label ||
    state.rows.length < 5 ||
    !state.rows.some((row) => ['Exact version', '精确版本'].includes(row.label)) ||
    !state.note
  ) {
    throw new Error(`Project creative card details are invalid: ${JSON.stringify(state)}`);
  }
  return state;
}

function targetKey(target) {
  if (target.kind === 'content-document') return `content-document:${target.documentId}`;
  if (target.kind === 'character-project') return `character-project:${target.characterProjectId}`;
  return `world-project:${target.worldProjectId}`;
}

function globalObjectKey(reference) {
  return reference.kind === 'character-version'
    ? `character:${reference.globalCharacterId}`
    : `world:${reference.globalWorldId}`;
}

function encodedRecordName(identity) {
  return `u${[...identity].map((character) => character.codePointAt(0).toString(16)).join('-')}`;
}

async function writeJson(file, value) {
  await writeText(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(file, value) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, value, 'utf8');
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
