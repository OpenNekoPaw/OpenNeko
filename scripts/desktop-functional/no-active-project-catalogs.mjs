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
    const nekoRoot = join(fixtureHome, '.neko');
    await Promise.all([
      mkdir(workspacePath, { recursive: true }),
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
    } finally {
      database.close();
    }
    return { workspacePath };
  },
  async run({ checkpoint, evaluate, screenshot, waitForSelector }) {
    await waitForSelector('.desktop-scene-workbench--agent-only');
    await waitForSelector('.primary-conversation-group[data-group-kind="workspace"]');
    const conversation = await evaluate(`(() => {
      const group = document.querySelector('.primary-conversation-group[data-group-kind="workspace"]');
      return {
        noActiveProject: document.querySelector('.desktop-scene-workbench--workspace') === null,
        titleVisible: [...(group?.querySelectorAll('.home-conversation-link span') ?? [])]
          .some((element) => element.textContent?.trim() === ${JSON.stringify(CONVERSATION_TITLE)}),
        diagnostic: group?.querySelector('.primary-conversation-group__diagnostic')?.textContent?.trim() ?? '',
      };
    })()`);
    if (!conversation.noActiveProject || !conversation.titleVisible) {
      throw new Error('Historical Conversation was not visible without an active Project.');
    }
    if (!conversation.diagnostic.includes('workspaceId')) {
      throw new Error('Unavailable Conversation Workspace did not expose workspaceId.');
    }
    checkpoint('historical-conversation-visible', conversation);

    await clickNavigation(evaluate, 3);
    await waitForSelector(`${ACTIVE_WORKBENCH} .project-management-catalog`);
    await waitForCondition(
      evaluate,
      `(() => {
        const row = [...document.querySelectorAll(${JSON.stringify(`${ACTIVE_WORKBENCH} .project-management-catalog .management-surface-row`)})]
          .find((candidate) => candidate.querySelector('strong')?.textContent?.trim() === 'missing-project');
        const diagnostic = row?.querySelector('.management-surface-row__diagnostic')?.textContent ?? '';
        return diagnostic.includes('currentLocator') && diagnostic.includes('orphanedAt');
      })()`,
      'Retained Workspace did not expose currentLocator and orphanedAt.',
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
    return { conversation, project, asset, screenshots: [catalogScreenshot] };
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
