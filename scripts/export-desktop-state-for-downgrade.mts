#!/usr/bin/env tsx

import { createHash } from 'node:crypto';
import path from 'node:path';

import {
  exportDesktopStateForDowngrade,
  resolveGlobalStorageLayout,
} from '../packages/local-metadata/src/index.ts';
import { createNodeSqliteLocalMetadataStore } from '../packages/local-metadata/src/node-sqlite-local-metadata-store.ts';
import {
  createDefaultDesktopApplicationSettingsState,
  parseDesktopApplicationSettingsStoredState,
} from '../packages/host/src/application-settings-state.ts';
import { createDesktopRetiredJsonStatePort } from '../apps/neko-desktop/src/main/desktop-state-migration-adapter.ts';
import {
  createEmptyDesktopShellState,
  parseDesktopShellStoredState,
} from '../packages/host/src/desktop-shell-state.ts';

const options = parseArguments(process.argv.slice(2));
const layout = resolveGlobalStorageLayout(options.home);
const store = createNodeSqliteLocalMetadataStore({ homedir: options.home });
await store.open({ databasePath: layout.database, busyTimeoutMs: 5_000 });
try {
  await exportDesktopStateForDowngrade({
    store,
    retiredJson: createDesktopRetiredJsonStatePort({
      shellStatePath: path.join(options.electronUserData, 'state', 'desktop-shell-state.json'),
      applicationSettingsPath: path.join(
        options.electronUserData,
        'state',
        'desktop-application-settings.v1.json',
      ),
    }),
    shellCodec: {
      createEmpty: createEmptyDesktopShellState,
      parse: parseDesktopShellStoredState,
      readStorageRevision: (state) => state.storageRevision,
    },
    settingsCodec: {
      createEmpty: createDefaultDesktopApplicationSettingsState,
      parse: parseDesktopApplicationSettingsStoredState,
      readStorageRevision: (state) => state.storageRevision,
    },
    digest: (content) => createHash('sha256').update(content).digest('hex'),
  });
  process.stdout.write(
    `Exported Desktop legacy state pair under ${path.join(options.electronUserData, 'state')}\n`,
  );
} finally {
  await store.dispose();
}

function parseArguments(args: readonly string[]): {
  readonly home: string;
  readonly electronUserData: string;
} {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if ((key !== '--home' && key !== '--electron-user-data') || !value) {
      usage();
    }
    values.set(key, value);
  }
  const home = values.get('--home');
  const electronUserData = values.get('--electron-user-data');
  if (!home || !electronUserData || values.size !== 2) usage();
  return {
    home: path.resolve(home),
    electronUserData: path.resolve(electronUserData),
  };
}

function usage(): never {
  throw new Error(
    'Usage: pnpm desktop:state:export-legacy --home <fixture-or-user-home> --electron-user-data <Electron userData>',
  );
}
