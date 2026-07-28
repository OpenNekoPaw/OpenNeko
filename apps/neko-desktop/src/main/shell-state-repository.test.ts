import { mkdtemp, readFile, rm } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createNodeDesktopShellStateFilePort,
  DesktopShellStateError,
  DesktopShellStateRepository,
  type DesktopShellStoredState,
} from './shell-state-repository';

const temporaryDirectories: string[] = [];

describe('DesktopShellStateRepository', () => {
  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
    );
  });

  it('atomically persists state and rejects stale repository instances', async () => {
    const directory = await createTemporaryDirectory();
    const statePath = path.join(directory, 'desktop-shell-state.json');
    const first = new DesktopShellStateRepository(
      createNodeDesktopShellStateFilePort(statePath),
    );
    const second = new DesktopShellStateRepository(
      createNodeDesktopShellStateFilePort(statePath),
    );
    const initial = await first.read();
    const committed = await first.commit(0, withPrimaryWindow(initial, 'window-1'));

    await expect(second.commit(0, withPrimaryWindow(initial, 'window-2'))).rejects.toMatchObject({
      code: 'desktop-shell-stale-storage-revision',
    });
    expect((await second.read()).primaryWindowId).toBe('window-1');
    expect(committed.storageRevision).toBe(1);
    await expect(readFile(statePath, 'utf8')).resolves.toContain('"window-1"');
  });

  it('fails visibly for a Project Tab whose Project is absent', async () => {
    const directory = await createTemporaryDirectory();
    const repository = new DesktopShellStateRepository(
      createNodeDesktopShellStateFilePort(path.join(directory, 'state.json')),
    );
    const initial = await repository.read();
    const invalid: DesktopShellStoredState = {
      ...initial,
      storageRevision: 1,
      primaryWindowId: 'window-1',
      windows: [
        {
          windowId: 'window-1',
          revision: 1,
          activeTarget: { kind: 'project', tabId: 'tab-1' },
          tabs: [
            {
              tabId: 'tab-1',
              projectId: 'missing-project',
              viewId: 'view-1',
              viewEpoch: 1,
            },
          ],
        },
      ],
    };

    await expect(repository.commit(0, invalid)).rejects.toBeInstanceOf(DesktopShellStateError);
    expect((await repository.read()).storageRevision).toBe(0);
  });
});

function withPrimaryWindow(
  state: DesktopShellStoredState,
  windowId: string,
): DesktopShellStoredState {
  return {
    ...state,
    storageRevision: state.storageRevision + 1,
    primaryWindowId: windowId,
    windows: [
      {
        windowId,
        revision: 0,
        activeTarget: { kind: 'home' },
        tabs: [],
      },
    ],
  };
}

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'openneko-desktop-shell-'));
  temporaryDirectories.push(directory);
  return directory;
}
