import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const CONVERSATION_TITLE = 'Retained historical conversation';
const ASSET_LABEL = 'missing-retained-asset.png';
const ACTIVE_WORKBENCH = '.desktop-scene-workbench';
const SCROLL_PROJECT_COUNT = 28;

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
      database
        .prepare(
          `INSERT INTO pi_conversations (
             workspace_id, conversation_id, title, active_branch_id, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'workspace-without-project',
          'conversation-retained',
          CONVERSATION_TITLE,
          'branch-main',
          timestamp,
          timestamp,
        );
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
              locale: 'system',
              startupTarget: 'home',
              resourceBrowserView: 'list',
            },
          }),
          timestamp,
        );
    } finally {
      database.close();
    }
    return { workspacePath };
  },
  async run({ checkpoint, click, evaluate, pressKey, screenshot, waitForSelector }) {
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
      return {
        noActiveProject: document.querySelector('.desktop-scene-workbench--workspace') === null,
        titleVisible: [...(group?.querySelectorAll('.home-conversation-link span') ?? [])]
          .some((element) => element.textContent?.trim() === ${JSON.stringify(CONVERSATION_TITLE)}),
        groupDiagnostic:
          heading?.querySelector(':scope > .primary-navigation-state .primary-navigation-unavailable')
            ?.textContent?.trim() ?? '',
        itemDiagnostic:
          row?.querySelector(':scope > .primary-navigation-state .primary-navigation-unavailable')
            ?.textContent?.trim() ?? '',
        rawWorkspaceFieldVisible: group?.textContent?.includes('workspaceId') === true,
        separateDiagnosticVisible:
          group?.querySelector('.primary-conversation-group__diagnostic') !== null,
        openDisabled: open instanceof HTMLButtonElement && open.disabled,
        cleanupEnabled: cleanup instanceof HTMLButtonElement && !cleanup.disabled,
        sceneUnchanged:
          JSON.stringify(before.window.workbench) === JSON.stringify(after.window.workbench),
      };
    })()`);
    if (
      !conversation.noActiveProject ||
      !conversation.titleVisible ||
      !conversation.openDisabled ||
      !conversation.cleanupEnabled ||
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
      const row = group?.querySelector('.primary-recent-conversation-row');
      const cleanup = row?.querySelector('button[aria-label*="${CONVERSATION_TITLE}"]');
      if (!(cleanup instanceof HTMLButtonElement) || cleanup.disabled) {
        throw new Error('Unavailable Conversation cleanup is unavailable.');
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

    const primaryProjects = await evaluate(`(async () => {
      const projection = await window.openNekoDesktop.shell.getSnapshot();
      return {
        catalogProjectPresent: projection.catalog.projects.some(
          (project) => project.displayName === 'missing-project',
        ),
        conversationGroupCount:
          document.querySelectorAll('.primary-conversation-group').length,
        projectGroupCount:
          document.querySelectorAll(
            '.primary-conversation-group[data-group-kind="project"]',
          ).length,
      };
    })()`);
    if (
      !primaryProjects.catalogProjectPresent ||
      primaryProjects.conversationGroupCount !== 0 ||
      primaryProjects.projectGroupCount !== 0
    ) {
      throw new Error('PrimarySidebar mirrored a Project without conversations.');
    }
    checkpoint('empty-project-primary-navigation-absent', primaryProjects);

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
        openDisabled: row?.querySelector('.management-surface-row-actions button')?.disabled === true,
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
      const open = finalRow?.querySelector('.management-surface-row-actions button:first-child');
      const removal = finalRow?.querySelector(
        '.management-surface-row-actions button:last-child',
      );
      return {
        scrollTop: list instanceof HTMLElement ? list.scrollTop : 0,
        finalProject: finalRow?.querySelector('strong')?.textContent?.trim() ?? '',
        headerTop: header instanceof HTMLElement ? header.getBoundingClientRect().top : -1,
        toolbarTop: toolbar instanceof HTMLElement ? toolbar.getBoundingClientRect().top : -1,
        diagnostic: finalRow?.querySelector('.management-surface-row__diagnostic')?.textContent?.trim() ?? '',
        openDisabled: open instanceof HTMLButtonElement && open.disabled,
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
          SCROLL_PROJECT_COUNT - 1,
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
      screenshots: [
        startupNoticeScreenshot,
        unavailableNavigationScreenshot,
        projectScrollStartScreenshot,
        projectScrollEndScreenshot,
        wideBatchSelectionScreenshot,
        gridBatchSelectionScreenshot,
        compactProjectScreenshot,
        batchSelectionScreenshot,
        batchRemovalScreenshot,
        darkBatchSelectionScreenshot,
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
