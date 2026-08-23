import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DesktopApplicationSettingsService } from '@neko/host/application-settings-service';
import { DEFAULT_DESKTOP_APPLICATION_PREFERENCES } from '@neko/host/application-settings';
import { DesktopStorageSettingsRuntime } from './desktop-storage-settings-runtime';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('DesktopStorageSettingsRuntime', () => {
  it('projects real usage and preserves registered projects when the default changes', async () => {
    const homedir = await mkdtemp(path.join(tmpdir(), 'openneko-storage-settings-'));
    roots.push(homedir);
    await mkdir(path.join(homedir, '.neko', 'media-libraries'), { recursive: true });
    await mkdir(path.join(homedir, 'ExistingProject'), { recursive: true });
    await mkdir(path.join(homedir, 'FutureProjects'), { recursive: true });
    await writeFile(path.join(homedir, '.neko', 'data.bin'), new Uint8Array(16));
    await writeFile(path.join(homedir, 'ExistingProject', 'content.bin'), new Uint8Array(24));

    let preferences = { ...DEFAULT_DESKTOP_APPLICATION_PREFERENCES };
    const update = vi.fn(async (next) => {
      preferences = next;
      return { eventSequence: 1, preferences };
    });
    const applicationSettings = {
      get current() {
        return { eventSequence: 0, preferences };
      },
      update,
    } as unknown as DesktopApplicationSettingsService;
    const listAll = vi.fn(async () => [
      {
        workspaceId: 'workspace-a',
        currentLocator: { kind: 'relative' as const, value: 'ExistingProject' },
      },
    ]);
    const runtime = new DesktopStorageSettingsRuntime({
      homedir,
      repositories: { workspaces: { listAll } } as never,
      applicationSettings,
      selectDirectory: vi.fn(async () => path.join(homedir, 'FutureProjects')),
      openDirectory: vi.fn(async () => undefined),
    });

    const initial = await runtime.project();
    expect(initial.entries.find((entry) => entry.id === 'application-data')?.bytes).toBe(16);
    expect(initial.entries.find((entry) => entry.id === 'project:workspace-a')?.bytes).toBe(24);

    await runtime.execute({ requestId: 'request-1', operation: 'select-default-workspace' });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ defaultWorkspaceLocator: '${HOME}/FutureProjects' }),
    );
    expect(listAll).toHaveBeenCalled();
    expect(initial.entries.find((entry) => entry.id === 'project:workspace-a')?.locator).toBe(
      '${HOME}/ExistingProject',
    );
  });

  it('rejects a selected default outside HOME without mutating settings', async () => {
    const homedir = await mkdtemp(path.join(tmpdir(), 'openneko-storage-settings-'));
    roots.push(homedir);
    const update = vi.fn();
    const applicationSettings = {
      current: { eventSequence: 0, preferences: DEFAULT_DESKTOP_APPLICATION_PREFERENCES },
      update,
    } as unknown as DesktopApplicationSettingsService;
    const runtime = new DesktopStorageSettingsRuntime({
      homedir,
      repositories: { workspaces: { listAll: vi.fn(async () => []) } } as never,
      applicationSettings,
      selectDirectory: vi.fn(async () => tmpdir()),
      openDirectory: vi.fn(async () => undefined),
    });

    await expect(
      runtime.execute({ requestId: 'request-2', operation: 'select-default-workspace' }),
    ).rejects.toThrow(/inside the current HOME/u);
    expect(update).not.toHaveBeenCalled();
  });
});
