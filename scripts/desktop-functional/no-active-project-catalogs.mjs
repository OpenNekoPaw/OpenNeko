import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const CONVERSATION_TITLE = 'Retained historical conversation';
const ASSET_LABEL = 'missing-retained-asset.png';
const ACTIVE_WORKBENCH = '.desktop-workbench-slot-deck__item[data-active="true"]';

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
  async run({ checkpoint, evaluate, screenshot, waitForSelector }) {
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
      return {
        noActiveProject: document.querySelector('.desktop-scene-workbench--workspace') === null,
        titleVisible: [...(group?.querySelectorAll('.home-conversation-link span') ?? [])]
          .some((element) => element.textContent?.trim() === ${JSON.stringify(CONVERSATION_TITLE)}),
        diagnostic: group?.querySelector('.primary-conversation-group__diagnostic')?.textContent?.trim() ?? '',
        itemDiagnostic: row?.querySelector('.primary-navigation-unavailable')?.textContent?.trim() ?? '',
        openDisabled: open instanceof HTMLButtonElement && open.disabled,
        cleanupEnabled: cleanup instanceof HTMLButtonElement && !cleanup.disabled,
        sceneUnchanged:
          before.window.workbenches.activeWorkbenchInstanceId ===
            after.window.workbenches.activeWorkbenchInstanceId &&
          JSON.stringify(before.window.workbenches.instances) ===
            JSON.stringify(after.window.workbenches.instances),
      };
    })()`);
    if (
      !conversation.noActiveProject ||
      !conversation.titleVisible ||
      !conversation.openDisabled ||
      !conversation.cleanupEnabled ||
      !conversation.sceneUnchanged ||
      !conversation.itemDiagnostic
    ) {
      throw new Error('Historical Conversation visibility or inert navigation is incorrect.');
    }
    if (!conversation.diagnostic.includes('workspaceId')) {
      throw new Error('Unavailable Conversation Workspace did not expose workspaceId.');
    }
    checkpoint('historical-conversation-visible', conversation);
    const unavailableNavigationScreenshot = await screenshot('unavailable-navigation-visible');

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

    const primaryProject = await evaluate(`(async () => {
      const group = [...document.querySelectorAll('.primary-conversation-group[data-group-kind="project"]')]
        .find((candidate) => candidate.querySelector('.primary-conversation-group__header')
          ?.textContent?.includes('missing-project'));
      const open = group?.querySelector('.primary-conversation-group__header .home-project-link');
      const cleanup = group?.querySelector('.primary-conversation-group__header button[aria-label]');
      const before = await window.openNekoDesktop.shell.getSnapshot();
      if (open instanceof HTMLButtonElement) open.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
      const after = await window.openNekoDesktop.shell.getSnapshot();
      return {
        visible: group instanceof HTMLElement,
        itemDiagnostic: group?.querySelector('.primary-navigation-unavailable')?.textContent?.trim() ?? '',
        openDisabled: open instanceof HTMLButtonElement && open.disabled,
        cleanupEnabled: cleanup instanceof HTMLButtonElement && !cleanup.disabled,
        sceneUnchanged:
          before.window.workbenches.activeWorkbenchInstanceId ===
            after.window.workbenches.activeWorkbenchInstanceId &&
          JSON.stringify(before.window.workbenches.instances) ===
            JSON.stringify(after.window.workbenches.instances),
      };
    })()`);
    if (
      !primaryProject.visible ||
      !primaryProject.openDisabled ||
      !primaryProject.cleanupEnabled ||
      !primaryProject.sceneUnchanged ||
      !primaryProject.itemDiagnostic
    ) {
      throw new Error('Unavailable Project primary navigation is not visible and inert.');
    }
    checkpoint('unavailable-project-primary-navigation-visible', primaryProject);

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
      primaryProject,
      project,
      asset,
      startupNotice,
      screenshots: [startupNoticeScreenshot, unavailableNavigationScreenshot, catalogScreenshot],
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
