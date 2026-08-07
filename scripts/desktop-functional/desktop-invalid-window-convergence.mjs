import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const INVALID_WINDOW_ID = 'window:invalid-presentation';

export const desktopInvalidWindowConvergenceScenario = Object.freeze({
  id: 'desktop-invalid-window-convergence',
  owner: '@neko/host',
  async prepare({ fixtureHome }) {
    const workspacePath = join(fixtureHome, 'workspace');
    const nekoRoot = join(fixtureHome, '.neko');
    await Promise.all([
      mkdir(workspacePath, { recursive: true }),
      mkdir(nekoRoot, { recursive: true }),
    ]);
    const sqlite = await import('node:sqlite');
    const database = new sqlite.DatabaseSync(join(nekoRoot, 'neko.db'));
    try {
      database.exec(`
        CREATE TABLE desktop_application_state (
          authority_key TEXT PRIMARY KEY,
          document_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;
      `);
      database
        .prepare(
          `INSERT INTO desktop_application_state(authority_key, document_json, updated_at)
           VALUES ('desktop.shell', ?, ?)`,
        )
        .run(
          JSON.stringify({
            primaryWindowId: INVALID_WINDOW_ID,
            projects: [],
            windows: [
              {
                windowId: INVALID_WINDOW_ID,
                activeTarget: { kind: 'home' },
                tabs: [],
                workbench: { invalidPresentation: true },
                applicationSidebar: {
                  windowId: INVALID_WINDOW_ID,
                  visible: true,
                  width: 240,
                },
              },
            ],
          }),
          '2026-08-07T00:00:00.000Z',
        );
    } finally {
      database.close();
    }
    return { workspacePath };
  },
  async run({ checkpoint, evaluate, restartApplication, screenshot, waitForSelector }) {
    await waitForSelector('.shell-diagnostic');
    const firstStartup = await readWindowState(evaluate);
    assertFirstStartup(firstStartup);
    checkpoint('invalid-window-diagnostic-visible-once', firstStartup);
    const firstScreenshot = await screenshot('invalid-window-diagnostic-visible-once');

    await restartApplication();
    await waitForSelector('[data-neko-controlled-workbench="true"]');
    await new Promise((resolve) => setTimeout(resolve, 500));
    const reopened = await readWindowState(evaluate);
    if (
      reopened.noticeVisible ||
      reopened.invalidWindowDiagnosticVisible ||
      reopened.windowId === INVALID_WINDOW_ID
    ) {
      throw new Error(
        `Invalid Window presentation recurred after application restart: ${JSON.stringify(reopened)}`,
      );
    }
    checkpoint('canonical-window-reopened-without-diagnostic', reopened);
    const reopenedScreenshot = await screenshot('canonical-window-reopened-without-diagnostic');

    return {
      firstStartup,
      reopened,
      screenshots: [firstScreenshot, reopenedScreenshot],
    };
  },
  assertObservation(_observation, evidence) {
    assertFirstStartup(evidence.firstStartup);
    if (
      evidence.reopened.noticeVisible ||
      evidence.reopened.invalidWindowDiagnosticVisible ||
      evidence.reopened.windowId === INVALID_WINDOW_ID
    ) {
      throw new Error('Invalid Window presentation did not converge to canonical Shell state.');
    }
  },
});

function readWindowState(evaluate) {
  return evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    return {
      windowId: projection.window.windowId,
      noticeVisible: document.querySelector('.shell-diagnostic') !== null,
      invalidWindowDiagnosticVisible:
        projection.stateDiagnostics?.some(
          (diagnostic) =>
            diagnostic.code === 'desktop-stored-window-invalid' &&
            diagnostic.windowId === ${JSON.stringify(INVALID_WINDOW_ID)},
        ) === true,
      workbenchVisible:
        document.querySelector('[data-neko-controlled-workbench="true"]') !== null,
    };
  })()`);
}

function assertFirstStartup(firstStartup) {
  if (
    !firstStartup.noticeVisible ||
    !firstStartup.invalidWindowDiagnosticVisible ||
    !firstStartup.workbenchVisible ||
    firstStartup.windowId === INVALID_WINDOW_ID
  ) {
    throw new Error(
      `Invalid Window presentation was not isolated locally: ${JSON.stringify(firstStartup)}`,
    );
  }
}
