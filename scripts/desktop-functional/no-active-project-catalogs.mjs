import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const CONVERSATION_TITLE = 'Retained historical conversation';
const ASSISTANT_CONVERSATION_COUNT = 6;
const ASSISTANT_CONVERSATION_TITLE = 'Retained assistant conversation';
const ASSET_LABEL = 'missing-retained-asset.png';
const ACTIVE_WORKBENCH = '.desktop-scene-workbench';
const SCROLL_PROJECT_COUNT = 28;
const EMPTY_WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';

export const noActiveProjectCatalogsScenario = Object.freeze({
  id: 'no-active-project-catalogs',
  owner: '@neko/app-desktop',
  async prepare({ fixtureHome }) {
    const workspacePath = join(fixtureHome, 'workspace');
    const missingProjectPath = join(fixtureHome, 'missing-project');
    const nekoRoot = join(fixtureHome, '.neko');
    await Promise.all([
      mkdir(workspacePath, { recursive: true }),
      mkdir(missingProjectPath, { recursive: true }),
      mkdir(join(nekoRoot, 'assets'), { recursive: true }),
    ]);
    await mkdir(join(workspacePath, 'neko'), { recursive: true });
    await writeFile(
      join(workspacePath, 'neko', 'project.json'),
      `${JSON.stringify({ workspaceId: EMPTY_WORKSPACE_ID })}\n`,
      'utf8',
    );
    const sqlite = await import('node:sqlite');
    const database = new sqlite.DatabaseSync(join(nekoRoot, 'neko.db'));
    try {
      database.exec(`
        CREATE TABLE workspaces (
          workspace_id TEXT PRIMARY KEY NOT NULL,
          current_locator_kind TEXT NOT NULL CHECK (current_locator_kind IN ('relative', 'variable')),
          current_locator_value TEXT NOT NULL,
          locator_history_json TEXT NOT NULL,
          last_seen_at TEXT NOT NULL,
          orphaned_at TEXT
        ) STRICT;
        CREATE TABLE pi_conversations (
          workspace_id TEXT NOT NULL,
          conversation_id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          active_branch_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE asset_library_memberships (
          membership_id TEXT PRIMARY KEY NOT NULL,
          source_relative_path TEXT NOT NULL UNIQUE,
          label TEXT NOT NULL,
          media_type TEXT,
          byte_length INTEGER CHECK (byte_length IS NULL OR byte_length >= 0),
          modified_at TEXT,
          membership_state TEXT NOT NULL CHECK (membership_state IN ('active', 'removed')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;
        CREATE TABLE desktop_application_state (
          authority_key TEXT PRIMARY KEY,
          document_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;
      `);
      const timestamp = '2026-08-06T00:00:00.000Z';
      database
        .prepare(
          `INSERT INTO workspaces (
             workspace_id, current_locator_kind, current_locator_value,
             locator_history_json, last_seen_at, orphaned_at
           ) VALUES (?, 'relative', ?, ?, ?, ?)`,
        )
        .run(
          'workspace-retained',
          'missing-project',
          JSON.stringify([{ kind: 'relative', value: 'missing-project' }]),
          timestamp,
          timestamp,
        );
      const insertWorkspace = database.prepare(
        `INSERT INTO workspaces (
           workspace_id, current_locator_kind, current_locator_value,
           locator_history_json, last_seen_at, orphaned_at
         ) VALUES (?, 'relative', ?, ?, ?, ?)`,
      );
      insertWorkspace.run(
        EMPTY_WORKSPACE_ID,
        'workspace',
        JSON.stringify([{ kind: 'relative', value: 'workspace' }]),
        '2026-08-07T00:00:00.000Z',
        null,
      );
      for (let index = 1; index <= SCROLL_PROJECT_COUNT; index += 1) {
        const suffix = String(index).padStart(2, '0');
        const locator = `missing-scroll-project-${suffix}`;
        insertWorkspace.run(
          `workspace-scroll-${suffix}`,
          locator,
          JSON.stringify([{ kind: 'relative', value: locator }]),
          timestamp,
          timestamp,
        );
      }
      const insertConversation = database.prepare(
        `INSERT INTO pi_conversations (
           workspace_id, conversation_id, title, active_branch_id, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      );
      insertConversation.run(
        'workspace-without-project',
        'conversation-retained',
        CONVERSATION_TITLE,
        'branch-main',
        timestamp,
        timestamp,
      );
      for (let index = 1; index <= ASSISTANT_CONVERSATION_COUNT; index += 1) {
        const assistantTimestamp = `2026-08-06T00:0${String(index)}:00.000Z`;
        insertConversation.run(
          'assistant-space:local-user',
          `assistant-conversation-${String(index)}`,
          `${ASSISTANT_CONVERSATION_TITLE} ${String(index)}`,
          `assistant-branch-${String(index)}`,
          assistantTimestamp,
          assistantTimestamp,
        );
      }
      database
        .prepare(
          `INSERT INTO asset_library_memberships (
             membership_id, source_relative_path, label, media_type, byte_length, modified_at,
             membership_state, created_at, updated_at
           ) VALUES (?, ?, ?, 'image', 42, ?, 'active', ?, ?)`,
        )
        .run('membership-retained', ASSET_LABEL, ASSET_LABEL, timestamp, timestamp, timestamp);
      database
        .prepare(
          `INSERT INTO desktop_application_state(authority_key, document_json, updated_at)
           VALUES ('desktop.application-settings', ?, ?)`,
        )
        .run(
          JSON.stringify({
            unrecognizedSettingForNotice: true,
            preferences: {
              theme: 'light',
              locale: 'en',
              resourceBrowserView: 'list',
            },
          }),
          timestamp,
        );
      database
        .prepare(
          `INSERT INTO desktop_application_state(authority_key, document_json, updated_at)
           VALUES ('desktop.shell', ?, ?)`,
        )
        .run(
          JSON.stringify({
            primaryWindowId: null,
            projects: [
              {
                projectId: `content:${EMPTY_WORKSPACE_ID}`,
                workspaceId: EMPTY_WORKSPACE_ID,
                profile: 'content',
                displayName: 'workspace',
                workspacePath,
                workspaceLocator: { kind: 'relative', value: 'workspace' },
                createdAt: timestamp,
                updatedAt: '2026-08-07T00:00:00.000Z',
              },
            ],
            windows: [],
          }),
          timestamp,
        );
    } finally {
      database.close();
    }
    return { workspacePath };
  },
  async run({ checkpoint, click, evaluate, hover, pressKey, screenshot, scroll, waitForSelector }) {
    await waitForSelector('.shell-diagnostic');
    const startupNotice = await evaluate(`(() => {
      const notice = document.querySelector('.shell-diagnostic');
      const workbench = document.querySelector('[data-neko-controlled-workbench="true"]');
      if (!(notice instanceof HTMLElement) || !(workbench instanceof HTMLElement)) return null;
      const noticeStyle = getComputedStyle(notice);
      const workbenchRect = workbench.getBoundingClientRect();
      return {
        text: notice.textContent?.trim() ?? '',
        position: noticeStyle.position,
        dismissEnabled:
          notice.querySelector('button[aria-label]') instanceof HTMLButtonElement &&
          !notice.querySelector('button[aria-label]').disabled,
        workbenchTop: workbenchRect.top,
        workbenchHeight: workbenchRect.height,
        viewportHeight: window.innerHeight,
      };
    })()`);
    if (
      !startupNotice ||
      !startupNotice.text.includes('unrecognizedSettingForNotice') ||
      startupNotice.position !== 'fixed' ||
      !startupNotice.dismissEnabled ||
      startupNotice.workbenchTop !== 0 ||
      startupNotice.workbenchHeight !== startupNotice.viewportHeight
    ) {
      throw new Error('Retained metadata startup notice is not a non-blocking overlay.');
    }
    checkpoint('retained-metadata-startup-notice-visible', startupNotice);
    const startupNoticeScreenshot = await screenshot('retained-metadata-startup-notice-visible');
    await waitForCondition(
      evaluate,
      `(() => document.querySelector('.shell-diagnostic') === null)()`,
      'Retained metadata startup notice did not automatically disappear.',
      12_000,
    );
    await evaluate(`(() => {
      window.resizeTo(1200, 800);
      return { width: window.innerWidth, height: window.innerHeight };
    })()`);
    await waitForSelector('.desktop-scene-workbench--agent-only');
    await waitForSelector('.primary-conversation-group[data-group-kind="workspace"]');
    await waitForSelector('.primary-conversation-group[data-group-kind="assistant"]');
    const navigationSections = await evaluate(`(() => {
      const navigation = document.querySelector('.home-recent-navigation');
      const sections = [...(navigation?.querySelectorAll('.primary-navigation-section') ?? [])]
        .map((section) => ({
          id: section.getAttribute('data-navigation-section') ?? '',
          label: section.querySelector('.home-sidebar-heading > span:first-child')?.textContent?.trim() ?? '',
          count: section.querySelector('.home-sidebar-heading > span:last-child')?.textContent?.trim() ?? '',
          groupKinds: [...section.querySelectorAll(':scope > .primary-conversation-group')]
            .map((group) => group.getAttribute('data-group-kind') ?? '')
            .sort(),
        }));
      const assistant = navigation?.querySelector(
        '[data-navigation-section="conversations"] [data-group-kind="assistant"]',
      );
      return {
        sections,
        assistantCount:
          assistant?.querySelector('.primary-conversation-group__count')?.textContent?.trim() ?? '',
        assistantVisibleRows:
          assistant?.querySelectorAll('.primary-recent-conversation-row').length ?? -1,
        assistantTitleVisible:
          assistant?.textContent?.includes(${JSON.stringify(`${ASSISTANT_CONVERSATION_TITLE} 6`)}) === true,
        futureSectionCount: navigation?.querySelectorAll(
          '[data-navigation-section="character"], [data-navigation-section="room"], [data-navigation-section="world"]',
        ).length ?? -1,
      };
    })()`);
    if (
      JSON.stringify(navigationSections.sections) !==
        JSON.stringify([
          { id: 'projects', label: 'Projects', count: '2', groupKinds: ['project', 'workspace'] },
          { id: 'conversations', label: 'Conversations', count: '6', groupKinds: ['assistant'] },
        ]) ||
      navigationSections.assistantCount !== '6' ||
      navigationSections.assistantVisibleRows !== 5 ||
      !navigationSections.assistantTitleVisible ||
      navigationSections.futureSectionCount !== 0
    ) {
      throw new Error(
        `PrimarySidebar section classification is incorrect: ${JSON.stringify(navigationSections)}`,
      );
    }
    checkpoint('primary-navigation-sections-visible', navigationSections);
    const conversation = await evaluate(`(async () => {
      const group = document.querySelector('.primary-conversation-group[data-group-kind="workspace"]');
      const row = group?.querySelector('.primary-recent-conversation-row');
      const open = row?.querySelector('.home-conversation-link');
      const cleanup = row?.querySelector('button[aria-label*="${CONVERSATION_TITLE}"]');
      const before = await window.openNekoDesktop.shell.getSnapshot();
      if (open instanceof HTMLButtonElement) open.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
      const after = await window.openNekoDesktop.shell.getSnapshot();
      const heading = group?.querySelector('.primary-conversation-group__standalone-heading');
      const groupCleanup = heading?.querySelector(
        ':scope > .primary-navigation-row-actions button',
      );
      return {
        noActiveProject: document.querySelector('.desktop-scene-workbench--workspace') === null,
        titleVisible: [...(group?.querySelectorAll('.home-conversation-link span') ?? [])]
          .some((element) => element.textContent?.trim() === ${JSON.stringify(CONVERSATION_TITLE)}),
        groupDiagnostic:
          heading?.querySelector(':scope > .primary-navigation-state .primary-navigation-unavailable')
            ?.getAttribute('aria-label') ?? '',
        itemDiagnostic:
          row?.querySelector(':scope > .primary-navigation-state .primary-navigation-unavailable')
            ?.getAttribute('aria-label') ?? '',
        rawWorkspaceFieldVisible: group?.textContent?.includes('workspaceId') === true,
        separateDiagnosticVisible:
          group?.querySelector('.primary-conversation-group__diagnostic') !== null,
        openDisabled: open instanceof HTMLButtonElement && open.disabled,
        cleanupEnabled: cleanup instanceof HTMLButtonElement && !cleanup.disabled,
        groupCleanupEnabled:
          groupCleanup instanceof HTMLButtonElement && !groupCleanup.disabled,
        sceneUnchanged:
          JSON.stringify(before.window.workbench) === JSON.stringify(after.window.workbench),
      };
    })()`);
    if (
      !conversation.noActiveProject ||
      !conversation.titleVisible ||
      !conversation.openDisabled ||
      !conversation.cleanupEnabled ||
      !conversation.groupCleanupEnabled ||
      !conversation.sceneUnchanged ||
      !conversation.groupDiagnostic ||
      conversation.rawWorkspaceFieldVisible ||
      conversation.separateDiagnosticVisible ||
      !conversation.itemDiagnostic
    ) {
      throw new Error('Historical Conversation visibility or inert navigation is incorrect.');
    }
    checkpoint('historical-conversation-visible', conversation);
    const unavailableNavigationScreenshot = await screenshot('unavailable-navigation-visible');

    const unavailableGroupHeading =
      '.primary-conversation-group[data-group-kind="workspace"] ' +
      '.primary-conversation-group__standalone-heading';
    await hover(`${unavailableGroupHeading} .primary-conversation-group__label`);
    await waitForCondition(
      evaluate,
      `(() => {
        const heading = document.querySelector(${JSON.stringify(unavailableGroupHeading)});
        const actions = heading?.querySelector(':scope > .primary-navigation-row-actions');
        return actions instanceof HTMLElement && getComputedStyle(actions).opacity === '1';
      })()`,
      'Unavailable Workspace group cleanup did not appear on hover.',
    );
    const unavailableGroupAction = await evaluate(`(() => {
      const heading = document.querySelector(${JSON.stringify(unavailableGroupHeading)});
      const actions = heading?.querySelector(':scope > .primary-navigation-row-actions');
      const status = heading?.querySelector(':scope > .primary-navigation-state');
      const button = actions?.querySelector('button');
      const headingRect = heading?.getBoundingClientRect();
      const actionsRect = actions?.getBoundingClientRect();
      return {
        actionCount: actions?.querySelectorAll('button').length ?? 0,
        actionLabel: button?.getAttribute('aria-label') ?? '',
        statusOpacity: status instanceof HTMLElement ? getComputedStyle(status).opacity : '',
        withinRow:
          headingRect !== undefined && actionsRect !== undefined &&
          actionsRect.left >= headingRect.left && actionsRect.right <= headingRect.right,
      };
    })()`);
    if (
      unavailableGroupAction.actionCount !== 1 ||
      !/Delete unavailable Workspace conversations|删除不可用工作区的会话/u.test(
        unavailableGroupAction.actionLabel,
      ) ||
      unavailableGroupAction.statusOpacity !== '0' ||
      !unavailableGroupAction.withinRow
    ) {
      throw new Error(
        `Unavailable Workspace group action is incorrect: ${JSON.stringify(unavailableGroupAction)}`,
      );
    }
    checkpoint('unavailable-workspace-group-action-visible', unavailableGroupAction);
    const unavailableGroupActionScreenshot = await screenshot(
      'unavailable-workspace-group-action-visible',
    );

    const workspaceGroupCollapse = await evaluate(`(async () => {
      const group = document.querySelector('.primary-conversation-group[data-group-kind="workspace"]');
      const toggle = group?.querySelector('.primary-conversation-group__collapse');
      if (!(group instanceof HTMLElement) || !(toggle instanceof HTMLButtonElement)) {
        throw new Error('Unavailable Workspace group collapse control is unavailable.');
      }
      toggle.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
      const collapsed = {
        expanded: toggle.getAttribute('aria-expanded'),
        visibleRows: group.querySelectorAll('.primary-recent-conversation-row').length,
      };
      toggle.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
      return {
        collapsed,
        restoredExpanded: toggle.getAttribute('aria-expanded'),
        restoredRows: group.querySelectorAll('.primary-recent-conversation-row').length,
      };
    })()`);
    if (
      workspaceGroupCollapse.collapsed.expanded !== 'false' ||
      workspaceGroupCollapse.collapsed.visibleRows !== 0 ||
      workspaceGroupCollapse.restoredExpanded !== 'true' ||
      workspaceGroupCollapse.restoredRows !== 1
    ) {
      throw new Error(
        `Unavailable Workspace group collapse is incorrect: ${JSON.stringify(workspaceGroupCollapse)}`,
      );
    }
    checkpoint('unavailable-workspace-group-collapse', workspaceGroupCollapse);

    await evaluate(`(() => {
      window.confirm = () => true;
      const group = document.querySelector('.primary-conversation-group[data-group-kind="workspace"]');
      const cleanup = group?.querySelector(
        '.primary-conversation-group__standalone-heading > .primary-navigation-row-actions button',
      );
      if (!(cleanup instanceof HTMLButtonElement) || cleanup.disabled) {
        throw new Error('Unavailable Workspace group cleanup is unavailable.');
      }
      cleanup.click();
      return true;
    })()`);
    await waitForCondition(
      evaluate,
      `(() => ![...document.querySelectorAll('.home-conversation-link span')]
        .some((element) => element.textContent?.trim() === ${JSON.stringify(CONVERSATION_TITLE)}))()`,
      'Unavailable Conversation cleanup did not remove the persisted entry.',
    );
    checkpoint('unavailable-conversation-cleanup-complete', { removed: true });
    await scroll('.home-recent-navigation', 0, { deltaY: -2_000 });
    await waitForCondition(
      evaluate,
      `document.querySelector('.home-recent-navigation')?.scrollTop === 0`,
      'PrimarySidebar did not return to the recent empty Project.',
    );

    const primaryProjects = await evaluate(`(async () => {
      const projection = await window.openNekoDesktop.shell.getSnapshot();
      const groups = [...document.querySelectorAll(
        '.primary-conversation-group[data-group-kind="project"]',
      )];
      const findProjectGroup = (displayName) => groups.find(
        (group) => group.querySelector('.primary-conversation-group__project-link span')
          ?.textContent?.trim() === displayName,
      );
      const inspectProjectGroup = (displayName) => {
        const group = findProjectGroup(displayName);
        const header = group?.querySelector('.primary-conversation-group__header');
        const projectLink = header?.querySelector('.primary-conversation-group__project-link');
        const actions = [...(header?.querySelectorAll(
          ':scope > .primary-navigation-row-actions button',
        ) ?? [])];
        return {
          present: group instanceof HTMLElement,
          count: group?.querySelector('.primary-conversation-group__count')?.textContent?.trim() ?? '',
          conversationRows: group?.querySelectorAll('.primary-recent-conversation-row').length ?? -1,
          projectOpenDisabled: projectLink instanceof HTMLButtonElement && projectLink.disabled,
          actionDisabled: actions.map((action) => action.disabled),
          hasDisclosure: group?.querySelector('.primary-conversation-group__collapse') !== null,
          hasDisclosureSpacer:
            group?.querySelector('.primary-conversation-group__collapse-spacer') !== null,
          unavailable:
            group?.querySelector('.primary-navigation-state .primary-navigation-unavailable') !== null,
        };
      };
      const navigation = document.querySelector('.home-recent-navigation');
      const navigationStyle = navigation instanceof HTMLElement ? getComputedStyle(navigation) : null;
      return {
        catalogProjectPresent: projection.catalog.projects.some(
          (project) => project.displayName === 'missing-project',
        ),
        catalogProjectCount: projection.catalog.projects.length,
        conversationGroupCount: document.querySelectorAll('.primary-conversation-group').length,
        projectGroupCount: groups.length,
        projectSectionCount:
          document.querySelector('[data-navigation-section="projects"] .home-sidebar-heading > span:last-child')
            ?.textContent?.trim() ?? '',
        conversationSectionCount:
          document.querySelector('[data-navigation-section="conversations"] .home-sidebar-heading > span:last-child')
            ?.textContent?.trim() ?? '',
        assistantGroupCount:
          document.querySelectorAll(
            '[data-navigation-section="conversations"] [data-group-kind="assistant"]',
          ).length,
        everyProjectEmpty: groups.every(
          (group) => group.querySelectorAll('.primary-recent-conversation-row').length === 0,
        ),
        availableProject: inspectProjectGroup('workspace'),
        unavailableProject: inspectProjectGroup('missing-project'),
        navigationScrollable:
          navigation instanceof HTMLElement && navigationStyle?.overflowY === 'auto',
      };
    })()`);
    const expectedProjectCount = SCROLL_PROJECT_COUNT + 2;
    if (
      !primaryProjects.catalogProjectPresent ||
      primaryProjects.catalogProjectCount !== expectedProjectCount ||
      primaryProjects.conversationGroupCount !== 2 ||
      primaryProjects.projectGroupCount !== 1 ||
      primaryProjects.projectSectionCount !== '1' ||
      primaryProjects.conversationSectionCount !== '6' ||
      primaryProjects.assistantGroupCount !== 1 ||
      !primaryProjects.everyProjectEmpty ||
      !primaryProjects.navigationScrollable ||
      !primaryProjects.availableProject.present ||
      primaryProjects.availableProject.count !== '0' ||
      primaryProjects.availableProject.projectOpenDisabled ||
      JSON.stringify(primaryProjects.availableProject.actionDisabled) !==
        JSON.stringify([false, true, false]) ||
      primaryProjects.availableProject.hasDisclosure ||
      !primaryProjects.availableProject.hasDisclosureSpacer ||
      primaryProjects.availableProject.unavailable ||
      primaryProjects.unavailableProject.present
    ) {
      throw new Error(
        `PrimarySidebar empty Project navigation is incorrect: ${JSON.stringify(primaryProjects)}`,
      );
    }
    checkpoint('recent-empty-project-primary-navigation-visible', primaryProjects);
    const emptyProjectNavigationScreenshot = await screenshot(
      'recent-empty-project-primary-navigation-visible',
    );

    const emptyProjectHeader =
      '.primary-conversation-group[data-group-id="project:content:' +
      `${EMPTY_WORKSPACE_ID}"] .primary-conversation-group__header`;
    await hover(`${emptyProjectHeader} .primary-conversation-group__project-link`);
    await waitForCondition(
      evaluate,
      `(() => {
        const actions = document.querySelector(${JSON.stringify(
          `${emptyProjectHeader} > .primary-navigation-row-actions`,
        )});
        return actions instanceof HTMLElement && getComputedStyle(actions).opacity === '1';
      })()`,
      'Empty Project actions did not appear on hover.',
    );
    const emptyProjectHover = await evaluate(`(() => {
      const header = document.querySelector(${JSON.stringify(emptyProjectHeader)});
      const actions = header?.querySelector(':scope > .primary-navigation-row-actions');
      const count = header?.querySelector(':scope > .primary-conversation-group__count');
      return {
        actionCount: actions?.querySelectorAll('button').length ?? 0,
        actionOpacity: actions instanceof HTMLElement ? getComputedStyle(actions).opacity : '',
        countOpacity: count instanceof HTMLElement ? getComputedStyle(count).opacity : '',
      };
    })()`);
    if (
      emptyProjectHover.actionCount !== 3 ||
      emptyProjectHover.actionOpacity !== '1' ||
      emptyProjectHover.countOpacity !== '0'
    ) {
      throw new Error(
        `Empty Project hover actions are incorrect: ${JSON.stringify(emptyProjectHover)}`,
      );
    }
    checkpoint('empty-project-hover-actions-visible', emptyProjectHover);
    const emptyProjectHoverScreenshot = await screenshot('empty-project-hover-actions-visible');

    await evaluate(`(() => {
      const link = document.querySelector(${JSON.stringify(
        `${emptyProjectHeader} .primary-conversation-group__project-link`,
      )});
      if (!(link instanceof HTMLButtonElement)) {
        throw new Error('Empty Project link is unavailable for keyboard validation.');
      }
      link.focus();
    })()`);
    await pressKey('Tab');
    const emptyProjectKeyboard = await evaluate(`(() => {
      const header = document.querySelector(${JSON.stringify(emptyProjectHeader)});
      const actions = header?.querySelector(':scope > .primary-navigation-row-actions');
      return {
        actionOpacity: actions instanceof HTMLElement ? getComputedStyle(actions).opacity : '',
        focusedAction:
          document.activeElement instanceof HTMLButtonElement && actions?.contains(document.activeElement),
      };
    })()`);
    if (emptyProjectKeyboard.actionOpacity !== '1' || !emptyProjectKeyboard.focusedAction) {
      throw new Error(
        `Empty Project keyboard actions are incorrect: ${JSON.stringify(emptyProjectKeyboard)}`,
      );
    }
    checkpoint('empty-project-keyboard-actions-visible', emptyProjectKeyboard);
    const emptyProjectKeyboardScreenshot = await screenshot(
      'empty-project-keyboard-actions-visible',
    );

    await clickNavigation(evaluate, 3);
    await waitForSelector(`${ACTIVE_WORKBENCH} .project-management-catalog`);
    await waitForCondition(
      evaluate,
      `(() => {
        const row = [...document.querySelectorAll(${JSON.stringify(`${ACTIVE_WORKBENCH} .project-management-catalog .management-surface-row`)})]
          .find((candidate) => candidate.querySelector('strong')?.textContent?.trim() === 'missing-project');
        const diagnostic = row?.querySelector('.management-surface-row__diagnostic')?.textContent ?? '';
        return diagnostic.includes('identity') && diagnostic.includes('orphanedAt');
      })()`,
      'Retained Workspace did not expose identity and orphanedAt.',
    );
    const project = await evaluate(`(() => {
      const row = [...document.querySelectorAll(${JSON.stringify(`${ACTIVE_WORKBENCH} .project-management-catalog .management-surface-row`)})]
        .find((candidate) => candidate.querySelector('strong')?.textContent?.trim() === 'missing-project');
      return {
        diagnostic: row?.querySelector('.management-surface-row__diagnostic')?.textContent?.trim() ?? '',
        openDisabled: row?.getAttribute('data-workspace-open-disabled') === 'true',
        listMode: document.querySelector(${JSON.stringify(`${ACTIVE_WORKBENCH} .project-management-catalog .management-surface-list.is-list`)}) !== null,
      };
    })()`);
    if (!project.openDisabled || !project.listMode) {
      throw new Error('Unavailable Workspace actions or default list mode are incorrect.');
    }
    if (await evaluate(`(() => document.querySelector('.shell-diagnostic') !== null)()`)) {
      throw new Error('Startup notice reappeared after Project navigation.');
    }
    checkpoint('retained-workspace-visible', project);
    const scrollSelector = `${ACTIVE_WORKBENCH} .project-management-catalog .management-surface-list`;
    const scrollBefore = await evaluate(`(() => {
      const root = document.querySelector(${JSON.stringify(`${ACTIVE_WORKBENCH} .project-management-catalog`)});
      const header = root?.querySelector('.management-surface-header');
      const toolbar = root?.querySelector('.management-surface-toolbar');
      const list = root?.querySelector('.management-surface-list');
      const finalRow = [...(list?.querySelectorAll('.management-surface-row') ?? [])].at(-1);
      if (!(root instanceof HTMLElement) || !(header instanceof HTMLElement) ||
          !(toolbar instanceof HTMLElement) || !(list instanceof HTMLElement) ||
          !(finalRow instanceof HTMLElement)) return null;
      const rootStyle = getComputedStyle(root);
      const listStyle = getComputedStyle(list);
      return {
        rootOverflow: rootStyle.overflow,
        rootClientHeight: root.clientHeight,
        rootScrollHeight: root.scrollHeight,
        listOverflowY: listStyle.overflowY,
        headerTop: header.getBoundingClientRect().top,
        toolbarTop: toolbar.getBoundingClientRect().top,
        listClientHeight: list.clientHeight,
        listScrollHeight: list.scrollHeight,
        finalRowTop: finalRow.getBoundingClientRect().top,
        listBottom: list.getBoundingClientRect().bottom,
      };
    })()`);
    if (
      !scrollBefore ||
      scrollBefore.rootOverflow !== 'hidden' ||
      scrollBefore.listOverflowY !== 'auto' ||
      scrollBefore.listScrollHeight <= scrollBefore.listClientHeight ||
      scrollBefore.finalRowTop <= scrollBefore.listBottom
    ) {
      throw new Error(
        `Project catalog did not establish a bounded collection scroll owner: ${JSON.stringify(scrollBefore)}`,
      );
    }
    checkpoint('project-catalog-scroll-owner-ready', scrollBefore);
    const projectScrollStartScreenshot = await screenshot('project-catalog-scroll-start');
    checkpoint('project-catalog-scroll-start-captured', projectScrollStartScreenshot);
    await click(scrollSelector);
    await pressKey('End');
    const scrollProgress = await evaluate(`(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const list = document.querySelector(${JSON.stringify(scrollSelector)});
      return list instanceof HTMLElement
        ? { scrollTop: list.scrollTop, maxScrollTop: list.scrollHeight - list.clientHeight }
        : null;
    })()`);
    if (!scrollProgress || scrollProgress.scrollTop < scrollProgress.maxScrollTop - 1) {
      throw new Error(
        `Project catalog keyboard input did not reach the final row: ${JSON.stringify(scrollProgress)}`,
      );
    }
    await waitForCondition(
      evaluate,
      `(() => {
        const list = document.querySelector(${JSON.stringify(scrollSelector)});
        const finalRow = [...(list?.querySelectorAll('.management-surface-row') ?? [])].at(-1);
        if (!(list instanceof HTMLElement) || !(finalRow instanceof HTMLElement)) return false;
        const listRect = list.getBoundingClientRect();
        const rowRect = finalRow.getBoundingClientRect();
        return list.scrollTop > 0 && rowRect.top >= listRect.top && rowRect.bottom <= listRect.bottom;
      })()`,
      'Project catalog scroll did not reveal the final retained Workspace.',
      5_000,
    );
    const scrollAfter = await evaluate(`(() => {
      const root = document.querySelector(${JSON.stringify(`${ACTIVE_WORKBENCH} .project-management-catalog`)});
      const header = root?.querySelector('.management-surface-header');
      const toolbar = root?.querySelector('.management-surface-toolbar');
      const list = root?.querySelector('.management-surface-list');
      const finalRow = [...(list?.querySelectorAll('.management-surface-row') ?? [])].at(-1);
      const removal = finalRow?.querySelector(
        '.management-surface-row-actions button:last-child',
      );
      return {
        scrollTop: list instanceof HTMLElement ? list.scrollTop : 0,
        finalProject: finalRow?.querySelector('strong')?.textContent?.trim() ?? '',
        headerTop: header instanceof HTMLElement ? header.getBoundingClientRect().top : -1,
        toolbarTop: toolbar instanceof HTMLElement ? toolbar.getBoundingClientRect().top : -1,
        diagnostic: finalRow?.querySelector('.management-surface-row__diagnostic')?.textContent?.trim() ?? '',
        openDisabled: finalRow?.getAttribute('data-workspace-open-disabled') === 'true',
        removalEnabled: removal instanceof HTMLButtonElement && !removal.disabled,
      };
    })()`);
    if (
      scrollAfter.scrollTop <= 0 ||
      Math.abs(scrollAfter.headerTop - scrollBefore.headerTop) > 1 ||
      Math.abs(scrollAfter.toolbarTop - scrollBefore.toolbarTop) > 1 ||
      !scrollAfter.diagnostic ||
      !scrollAfter.openDisabled ||
      !scrollAfter.removalEnabled
    ) {
      throw new Error('Project catalog scrolling moved controls or hid unavailable-item actions.');
    }
    checkpoint('project-catalog-final-row-reachable', { scrollBefore, scrollAfter });
    const projectScrollEndScreenshot = await screenshot('project-catalog-scroll-end');

    const wideBatchSelection = await evaluate(`(async () => {
      const root = document.querySelector(${JSON.stringify(`${ACTIVE_WORKBENCH} .project-management-catalog`)});
      const buttons = root?.querySelectorAll('.management-surface-row__select');
      const first = buttons?.[buttons.length - 2];
      const second = buttons?.[buttons.length - 1];
      if (!(root instanceof HTMLElement) || !(first instanceof HTMLButtonElement) ||
          !(second instanceof HTMLButtonElement)) {
        throw new Error('Wide Project batch fixture requires two rows.');
      }
      first.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
      second.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
      await new Promise((resolve) => setTimeout(resolve, 50));
      second.scrollIntoView({ block: 'end' });
      const toolbar = root.querySelector('.project-management-batch-toolbar');
      const toolbarRect = toolbar?.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      return {
        viewportWidth: window.innerWidth,
        selectedCount: root.querySelectorAll('.management-surface-row[data-selected="true"]').length,
        toolbarText: toolbar?.textContent?.trim() ?? '',
        toolbarFits:
          toolbarRect !== undefined && toolbarRect.left >= rootRect.left && toolbarRect.right <= rootRect.right,
      };
    })()`);
    if (
      wideBatchSelection.viewportWidth < 1200 ||
      wideBatchSelection.selectedCount !== 2 ||
      !wideBatchSelection.toolbarText ||
      !wideBatchSelection.toolbarFits
    ) {
      throw new Error(
        `Wide Project batch selection is incorrect: ${JSON.stringify(wideBatchSelection)}`,
      );
    }
    checkpoint('project-catalog-batch-selected-wide', wideBatchSelection);
    const wideBatchSelectionScreenshot = await screenshot('project-catalog-batch-selected-wide');
    const gridBatchSelection = await evaluate(`(async () => {
      const root = document.querySelector(${JSON.stringify(`${ACTIVE_WORKBENCH} .project-management-catalog`)});
      const viewButtons = root?.querySelectorAll('.management-surface-toolbar > button');
      const grid = viewButtons?.[0];
      if (!(root instanceof HTMLElement) || !(grid instanceof HTMLButtonElement)) {
        throw new Error('Project grid view control is unavailable.');
      }
      grid.click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const list = root.querySelector('.management-surface-list');
      const listRect = list?.getBoundingClientRect();
      const rows = [...(list?.querySelectorAll('.management-surface-row') ?? [])];
      return {
        gridMode: list?.classList.contains('is-grid') === true,
        selectedCount: root.querySelectorAll('.management-surface-row[data-selected="true"]').length,
        rowsFit:
          listRect !== undefined &&
          rows.every((row) => {
            const rectangle = row.getBoundingClientRect();
            return rectangle.left >= listRect.left && rectangle.right <= listRect.right;
          }),
      };
    })()`);
    if (
      !gridBatchSelection.gridMode ||
      gridBatchSelection.selectedCount !== 2 ||
      !gridBatchSelection.rowsFit
    ) {
      throw new Error(
        `Project grid batch selection is incorrect: ${JSON.stringify(gridBatchSelection)}`,
      );
    }
    checkpoint('project-catalog-batch-selected-grid-wide', gridBatchSelection);
    const gridBatchSelectionScreenshot = await screenshot(
      'project-catalog-batch-selected-grid-wide',
    );
    await evaluate(`(() => {
      const root = document.querySelector(${JSON.stringify(`${ACTIVE_WORKBENCH} .project-management-catalog`)});
      const list = root?.querySelectorAll('.management-surface-toolbar > button')[1];
      const clear = root?.querySelector('.project-management-batch-toolbar button:last-child');
      if (!(list instanceof HTMLButtonElement) || !(clear instanceof HTMLButtonElement)) {
        throw new Error('Project list or batch clear control is unavailable.');
      }
      list.click();
      clear.click();
      return true;
    })()`);
    await waitForCondition(
      evaluate,
      `document.querySelector(${JSON.stringify(`${ACTIVE_WORKBENCH} .project-management-batch-toolbar`)}) === null`,
      'Project batch clear did not restore the unselected catalog.',
    );

    await evaluate(`(() => {
      window.resizeTo(960, 640);
      return { width: window.innerWidth, height: window.innerHeight };
    })()`);
    await waitForCondition(
      evaluate,
      `(() => window.innerWidth <= 960 && window.innerHeight <= 640)()`,
      'Desktop window did not reach the minimum supported validation size.',
    );
    const compactProject = await evaluate(`(() => {
      const root = document.querySelector(${JSON.stringify(`${ACTIVE_WORKBENCH} .project-management-catalog`)});
      const list = root?.querySelector('.management-surface-list');
      if (!(root instanceof HTMLElement) || !(list instanceof HTMLElement)) return null;
      return {
        rootHeight: root.clientHeight,
        listClientHeight: list.clientHeight,
        listScrollHeight: list.scrollHeight,
        viewportHeight: window.innerHeight,
      };
    })()`);
    if (
      !compactProject ||
      compactProject.rootHeight > compactProject.viewportHeight ||
      compactProject.listScrollHeight <= compactProject.listClientHeight
    ) {
      throw new Error('Project catalog is not bounded at the minimum supported window size.');
    }
    checkpoint('project-catalog-minimum-window-bounded', compactProject);
    const compactProjectScreenshot = await screenshot('project-catalog-minimum-window');

    const batchSelection = await evaluate(`(async () => {
      const root = document.querySelector(${JSON.stringify(`${ACTIVE_WORKBENCH} .project-management-catalog`)});
      const buttons = root?.querySelectorAll('.management-surface-row__select');
      const first = buttons?.[buttons.length - 2];
      const second = buttons?.[buttons.length - 1];
      if (!(root instanceof HTMLElement) || !(first instanceof HTMLButtonElement) ||
          !(second instanceof HTMLButtonElement)) {
        throw new Error('Unavailable Project batch fixture requires two rows.');
      }
      first.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
      second.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
      await new Promise((resolve) => setTimeout(resolve, 50));
      second.scrollIntoView({ block: 'end' });
      await new Promise((resolve) => setTimeout(resolve, 50));
      const toolbar = root.querySelector('.project-management-batch-toolbar');
      const toolbarRect = toolbar?.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      const removal = [...(toolbar?.querySelectorAll('button') ?? [])].find((button) =>
        /^(Remove selected|移除所选项目)$/u.test(button.textContent?.trim() ?? ''),
      );
      const cleanup = [...(toolbar?.querySelectorAll('button') ?? [])].find((button) =>
        /^(Delete conversations|删除项目会话)$/u.test(button.textContent?.trim() ?? ''),
      );
      return {
        selectedCount: root.querySelectorAll('.management-surface-row[data-selected="true"]').length,
        toolbarVisible: toolbar instanceof HTMLElement,
        toolbarText: toolbar?.textContent?.trim() ?? '',
        toolbarFits:
          toolbarRect !== undefined && toolbarRect.left >= rootRect.left && toolbarRect.right <= rootRect.right,
        cleanupDisabled: cleanup instanceof HTMLButtonElement && cleanup.disabled,
        removalEnabled: removal instanceof HTMLButtonElement && !removal.disabled,
      };
    })()`);
    if (
      batchSelection.selectedCount !== 2 ||
      !batchSelection.toolbarVisible ||
      !batchSelection.toolbarText ||
      !batchSelection.toolbarFits ||
      !batchSelection.cleanupDisabled ||
      !batchSelection.removalEnabled
    ) {
      throw new Error(
        `Unavailable Project batch selection is incorrect: ${JSON.stringify(batchSelection)}`,
      );
    }
    checkpoint('project-catalog-batch-selected', batchSelection);
    const batchSelectionScreenshot = await screenshot('project-catalog-batch-selected-minimum');

    const batchCancellation = await evaluate(`(async () => {
      const root = document.querySelector(${JSON.stringify(`${ACTIVE_WORKBENCH} .project-management-catalog`)});
      const removal = [
        ...(root?.querySelectorAll('.project-management-batch-toolbar button') ?? []),
      ].find((button) =>
        /^(Remove selected|移除所选项目)$/u.test(button.textContent?.trim() ?? ''),
      );
      const rowsBefore = root?.querySelectorAll('.management-surface-row').length ?? 0;
      globalThis.confirm = () => false;
      if (!(removal instanceof HTMLButtonElement)) {
        throw new Error('Project batch removal is unavailable.');
      }
      removal.click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      return {
        rowsBefore,
        rowsAfter: root?.querySelectorAll('.management-surface-row').length ?? 0,
        selectedAfter:
          root?.querySelectorAll('.management-surface-row[data-selected="true"]').length ?? 0,
      };
    })()`);
    if (
      batchCancellation.rowsBefore !== batchCancellation.rowsAfter ||
      batchCancellation.selectedAfter !== 2
    ) {
      throw new Error('Cancelled unavailable Project batch removal changed catalog state.');
    }
    checkpoint('project-catalog-batch-cancelled', batchCancellation);

    await evaluate(`(() => {
      const root = document.querySelector(${JSON.stringify(`${ACTIVE_WORKBENCH} .project-management-catalog`)});
      const removal = [
        ...(root?.querySelectorAll('.project-management-batch-toolbar button') ?? []),
      ].find((button) =>
        /^(Remove selected|移除所选项目)$/u.test(button.textContent?.trim() ?? ''),
      );
      globalThis.confirm = () => true;
      if (!(removal instanceof HTMLButtonElement)) {
        throw new Error('Project batch removal is unavailable.');
      }
      removal.click();
      return true;
    })()`);
    await waitForCondition(
      evaluate,
      `(() => {
        const root = document.querySelector(${JSON.stringify(`${ACTIVE_WORKBENCH} .project-management-catalog`)});
        return root?.querySelectorAll('.management-surface-row').length === ${String(
          SCROLL_PROJECT_COUNT,
        )} && root.querySelector('.project-management-batch-toolbar') === null;
      })()`,
      'Confirmed Project batch removal did not remove exactly two selected records.',
    );
    const batchRemoval = await evaluate(`(() => {
      const root = document.querySelector(${JSON.stringify(`${ACTIVE_WORKBENCH} .project-management-catalog`)});
      const list = root?.querySelector('.management-surface-list');
      if (list instanceof HTMLElement) list.scrollTop = 0;
      return {
        remainingRows: root?.querySelectorAll('.management-surface-row').length ?? -1,
        selectedRows: root?.querySelectorAll('.management-surface-row[data-selected="true"]').length ?? -1,
        batchToolbarVisible: root?.querySelector('.project-management-batch-toolbar') !== null,
      };
    })()`);
    checkpoint('project-catalog-batch-removed', batchRemoval);
    const batchRemovalScreenshot = await screenshot('project-catalog-batch-removed-minimum');

    await clickNavigation(evaluate, 0);
    await waitForSelector('.desktop-scene-workbench--agent-only');
    await scroll('.home-recent-navigation', 0, { deltaY: -2_000 });
    const lightNarrowEmptyProject = await evaluate(`(() => {
      const header = document.querySelector(${JSON.stringify(emptyProjectHeader)});
      const navigation = document.querySelector('.home-recent-navigation');
      const projectLink = header?.querySelector('.primary-conversation-group__project-link');
      const count = header?.querySelector('.primary-conversation-group__count');
      if (!(header instanceof HTMLElement) || !(navigation instanceof HTMLElement) ||
          !(projectLink instanceof HTMLElement) || !(count instanceof HTMLElement)) return null;
      const headerRect = header.getBoundingClientRect();
      const navigationRect = navigation.getBoundingClientRect();
      const projectLinkRect = projectLink.getBoundingClientRect();
      const countRect = count.getBoundingClientRect();
      return {
        theme: document.documentElement.dataset.nekoTheme,
        viewportWidth: window.innerWidth,
        headerWithinNavigation:
          headerRect.left >= navigationRect.left && headerRect.right <= navigationRect.right,
        projectClearOfCount: projectLinkRect.right <= countRect.left,
        count: count.textContent?.trim() ?? '',
      };
    })()`);
    if (
      !lightNarrowEmptyProject ||
      lightNarrowEmptyProject.theme !== 'light' ||
      lightNarrowEmptyProject.viewportWidth > 960 ||
      !lightNarrowEmptyProject.headerWithinNavigation ||
      !lightNarrowEmptyProject.projectClearOfCount ||
      lightNarrowEmptyProject.count !== '0'
    ) {
      throw new Error(
        `Light narrow empty Project is incorrect: ${JSON.stringify(lightNarrowEmptyProject)}`,
      );
    }
    checkpoint('empty-project-light-narrow', lightNarrowEmptyProject);
    const lightNarrowEmptyProjectScreenshot = await screenshot('empty-project-light-narrow');

    await evaluate(`(() => {
      const settings = document.querySelector('.home-navigation-footer__actions button:last-child');
      if (!(settings instanceof HTMLButtonElement)) throw new Error('Desktop Settings is unavailable.');
      settings.click();
      return true;
    })()`);
    await waitForSelector('[data-settings-surface="main"]');
    await evaluate(`(() => {
      const appearance = document.querySelectorAll(
        '.desktop-settings__navigation .home-nav-button',
      )[1];
      if (!(appearance instanceof HTMLButtonElement)) {
        throw new Error('Desktop Appearance settings are unavailable.');
      }
      appearance.click();
      return true;
    })()`);
    await waitForCondition(
      evaluate,
      `document.querySelector('[data-settings-surface="main"] select') instanceof HTMLSelectElement`,
      'Desktop Theme setting did not render.',
    );
    await evaluate(`(() => {
      const select = document.querySelector('[data-settings-surface="main"] select');
      if (!(select instanceof HTMLSelectElement)) throw new Error('Desktop Theme setting is unavailable.');
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      if (!setter) throw new Error('Desktop Theme select setter is unavailable.');
      setter.call(select, 'dark');
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await waitForCondition(
      evaluate,
      `document.documentElement.dataset.nekoTheme === 'dark'`,
      'Desktop Theme did not switch to dark through Settings.',
    );
    await clickNavigation(evaluate, 3);
    await waitForSelector(`${ACTIVE_WORKBENCH} .project-management-catalog`);
    const darkBatchSelection = await evaluate(`(async () => {
      const root = document.querySelector(${JSON.stringify(`${ACTIVE_WORKBENCH} .project-management-catalog`)});
      const buttons = root?.querySelectorAll('.management-surface-row__select');
      const first = buttons?.[0];
      const second = buttons?.[1];
      if (!(root instanceof HTMLElement) || !(first instanceof HTMLButtonElement) ||
          !(second instanceof HTMLButtonElement)) {
        throw new Error('Dark Project batch fixture requires two rows.');
      }
      first.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
      second.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
      await new Promise((resolve) => setTimeout(resolve, 50));
      const selected = root.querySelector('.management-surface-row[data-selected="true"]');
      const toolbar = root.querySelector('.project-management-batch-toolbar');
      const selectedStyle = selected instanceof HTMLElement ? getComputedStyle(selected) : undefined;
      return {
        theme: document.documentElement.dataset.nekoTheme,
        selectedCount: root.querySelectorAll('.management-surface-row[data-selected="true"]').length,
        toolbarVisible: toolbar instanceof HTMLElement,
        selectedBackground: selectedStyle?.backgroundColor ?? '',
        selectedBorder: selectedStyle?.borderColor ?? '',
        selectedShadow: selectedStyle?.boxShadow ?? '',
      };
    })()`);
    if (
      darkBatchSelection.theme !== 'dark' ||
      darkBatchSelection.selectedCount !== 2 ||
      !darkBatchSelection.toolbarVisible ||
      !darkBatchSelection.selectedBackground ||
      !darkBatchSelection.selectedBorder ||
      darkBatchSelection.selectedShadow !== 'none'
    ) {
      throw new Error(
        `Dark Project batch selection is incorrect: ${JSON.stringify(darkBatchSelection)}`,
      );
    }
    checkpoint('project-catalog-batch-selected-dark', darkBatchSelection);
    const darkBatchSelectionScreenshot = await screenshot('project-catalog-batch-selected-dark');
    await evaluate(`(() => {
      const clear = document.querySelector(
        ${JSON.stringify(`${ACTIVE_WORKBENCH} .project-management-batch-toolbar button:last-child`)},
      );
      if (!(clear instanceof HTMLButtonElement)) throw new Error('Dark Project batch clear is unavailable.');
      clear.click();
      return true;
    })()`);

    await clickNavigation(evaluate, 0);
    await waitForSelector('.desktop-scene-workbench--agent-only');
    await scroll('.home-recent-navigation', 0, { deltaY: -2_000 });
    await hover(`${emptyProjectHeader} .primary-conversation-group__project-link`);
    await waitForCondition(
      evaluate,
      `getComputedStyle(document.querySelector(${JSON.stringify(
        `${emptyProjectHeader} > .primary-navigation-row-actions`,
      )})).opacity === '1'`,
      'Dark narrow empty Project actions did not appear on hover.',
    );
    const darkNarrowEmptyProject = await evaluate(`(() => {
      const header = document.querySelector(${JSON.stringify(emptyProjectHeader)});
      const actions = header?.querySelector(':scope > .primary-navigation-row-actions');
      const projectLink = header?.querySelector('.primary-conversation-group__project-link');
      if (!(header instanceof HTMLElement) || !(actions instanceof HTMLElement) ||
          !(projectLink instanceof HTMLElement)) return null;
      const headerRect = header.getBoundingClientRect();
      const actionsRect = actions.getBoundingClientRect();
      const projectLinkRect = projectLink.getBoundingClientRect();
      return {
        theme: document.documentElement.dataset.nekoTheme,
        viewportWidth: window.innerWidth,
        actionOpacity: getComputedStyle(actions).opacity,
        actionsWithinHeader:
          actionsRect.left >= headerRect.left && actionsRect.right <= headerRect.right,
        projectClearOfActions: projectLinkRect.right <= actionsRect.left,
      };
    })()`);
    if (
      !darkNarrowEmptyProject ||
      darkNarrowEmptyProject.theme !== 'dark' ||
      darkNarrowEmptyProject.viewportWidth > 960 ||
      darkNarrowEmptyProject.actionOpacity !== '1' ||
      !darkNarrowEmptyProject.actionsWithinHeader ||
      !darkNarrowEmptyProject.projectClearOfActions
    ) {
      throw new Error(
        `Dark narrow empty Project is incorrect: ${JSON.stringify(darkNarrowEmptyProject)}`,
      );
    }
    checkpoint('empty-project-dark-narrow-hover', darkNarrowEmptyProject);
    const darkNarrowEmptyProjectScreenshot = await screenshot('empty-project-dark-narrow-hover');

    await clickNavigation(evaluate, 1);
    await waitForSelector(`${ACTIVE_WORKBENCH} [data-owner-root="asset-management"]`);
    await evaluate(`(() => {
      const root = document.querySelector(${JSON.stringify(`${ACTIVE_WORKBENCH} [data-owner-root="asset-management"]`)});
      const button = [...(root?.querySelectorAll('.global-library-browser__facets button') ?? [])]
        .find((candidate) => /^(Asset Library|资产库)$/u.test(candidate.textContent?.trim() ?? ''));
      if (!(button instanceof HTMLButtonElement)) throw new Error('Asset Library facet is unavailable.');
      if (button.getAttribute('aria-pressed') !== 'true') button.click();
      return true;
    })()`);
    await waitForCondition(
      evaluate,
      `(() => {
        const entry = [...document.querySelectorAll(${JSON.stringify(`${ACTIVE_WORKBENCH} .global-library-browser__entry`)})]
          .find((candidate) => candidate.querySelector('strong')?.textContent?.trim() === ${JSON.stringify(ASSET_LABEL)});
        return entry?.querySelector('.global-library-browser__entry-diagnostic')?.textContent
          ?.includes('sourceRelativePath') === true;
      })()`,
      'Retained Asset membership did not expose sourceRelativePath.',
    );
    const asset = await evaluate(`(() => {
      const root = document.querySelector(${JSON.stringify(`${ACTIVE_WORKBENCH} [data-owner-root="asset-management"]`)});
      const entry = [...(root?.querySelectorAll('.global-library-browser__entry') ?? [])]
        .find((candidate) => candidate.querySelector('strong')?.textContent?.trim() === ${JSON.stringify(ASSET_LABEL)});
      return {
        diagnostic: entry?.querySelector('.global-library-browser__entry-diagnostic')?.textContent?.trim() ?? '',
        listMode:
          root?.querySelector('.global-library-browser__collection')?.getAttribute('data-view-mode') ===
          'list',
      };
    })()`);
    if (!asset.listMode) throw new Error('Asset Library did not default to list mode.');
    const catalogScreenshot = await screenshot('no-active-project-catalogs-visible');
    checkpoint('retained-asset-membership-visible', asset);
    return {
      conversation,
      primaryProjects,
      project,
      asset,
      startupNotice,
      scrollBefore,
      scrollAfter,
      compactProject,
      wideBatchSelection,
      gridBatchSelection,
      batchSelection,
      batchCancellation,
      batchRemoval,
      darkBatchSelection,
      lightNarrowEmptyProject,
      darkNarrowEmptyProject,
      screenshots: [
        startupNoticeScreenshot,
        unavailableNavigationScreenshot,
        unavailableGroupActionScreenshot,
        emptyProjectNavigationScreenshot,
        emptyProjectHoverScreenshot,
        emptyProjectKeyboardScreenshot,
        projectScrollStartScreenshot,
        projectScrollEndScreenshot,
        wideBatchSelectionScreenshot,
        gridBatchSelectionScreenshot,
        compactProjectScreenshot,
        batchSelectionScreenshot,
        batchRemovalScreenshot,
        lightNarrowEmptyProjectScreenshot,
        darkBatchSelectionScreenshot,
        darkNarrowEmptyProjectScreenshot,
        catalogScreenshot,
      ],
    };
  },
});

async function clickNavigation(evaluate, index) {
  await evaluate(`(() => {
    const button = document.querySelectorAll('.home-primary-navigation .home-nav-button')[${String(index)}];
    if (!(button instanceof HTMLButtonElement)) throw new Error('Desktop navigation is unavailable.');
    button.click();
    return true;
  })()`);
}

async function waitForCondition(evaluate, expression, message, timeoutMs = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
}
