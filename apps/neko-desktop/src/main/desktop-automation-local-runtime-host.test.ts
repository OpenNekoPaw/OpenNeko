import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BROWSER_USE_OBSERVE_PROFILE } from '@neko/automation-node';
import { createDesktopAutomationLocalRuntimeHost } from './desktop-automation-local-runtime-host';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('Desktop Automation local runtime Host', () => {
  it('keeps Host paths private behind opaque runtime identities', async () => {
    const root = await temporaryRoot();
    const runtimePath = path.join(root, 'browser-use');
    const browserPath = path.join(root, 'Chromium');
    await writeFile(runtimePath, 'runtime');
    await writeFile(browserPath, 'browser');
    const selections = new Map([
      ['provider-runtime', runtimePath],
      ['browser-executable', browserPath],
    ]);
    const host = createDesktopAutomationLocalRuntimeHost({
      assertDisconnectAllowed: async () => undefined,
      selectAsset: vi.fn(async ({ assetKey }) => selections.get(assetKey)),
      openExternal: vi.fn(async () => undefined),
      writeClipboardText: vi.fn(),
      createIdentity: identitySequence(),
    });

    await host.management.authorizeAsset(
      'browser-use.observe.local',
      'provider-runtime',
      'window-1',
    );
    await host.management.authorizeAsset(
      'browser-use.observe.local',
      'browser-executable',
      'window-1',
    );
    const [projection] = await host.management.list();
    expect(projection).toMatchObject({
      authorized: true,
      state: 'error',
      diagnostics: ['provider-unavailable'],
    });
    expect(JSON.stringify(projection)).not.toContain(root);
    const resolution = await host.resolve('browser-use.observe.local', projection?.runtimeId ?? '');
    expect(resolution.assets).toEqual({
      'provider-runtime': await realpath(runtimePath),
      'browser-executable': await realpath(browserPath),
    });
  });

  it('keeps path authorization stable across user-managed runtime updates', async () => {
    const root = await temporaryRoot();
    const runtimePath = path.join(root, 'browser-use');
    await writeFile(runtimePath, 'runtime-before');
    const selectAsset = vi.fn(async () => runtimePath);
    const host = createDesktopAutomationLocalRuntimeHost({
      assertDisconnectAllowed: async () => undefined,
      selectAsset,
      openExternal: vi.fn(async () => undefined),
      writeClipboardText: vi.fn(),
      createIdentity: identitySequence(),
    });

    await host.management.authorizeAsset(
      'browser-use.observe.local',
      'provider-runtime',
      'window-1',
    );
    await writeFile(runtimePath, 'runtime-after');
    const [projection] = await host.management.list();
    expect(projection).toMatchObject({
      state: 'error',
      diagnostics: ['asset-missing'],
    });
    expect(selectAsset).toHaveBeenCalledTimes(1);
  });

  it('does not treat an in-place application update as a new path authority', async () => {
    const root = await temporaryRoot();
    const appBundlePath = path.join(root, 'CuaDriver.app');
    const executablePath = path.join(appBundlePath, 'Contents', 'MacOS', 'cua-driver');
    await mkdir(path.dirname(executablePath), { recursive: true });
    await writeFile(executablePath, 'runtime-before');
    const host = createDesktopAutomationLocalRuntimeHost({
      assertDisconnectAllowed: async () => undefined,
      selectAsset: vi.fn(async () => appBundlePath),
      openExternal: vi.fn(async () => undefined),
      writeClipboardText: vi.fn(),
      createIdentity: identitySequence(),
    });
    await host.management.authorizeAsset(
      'computer-use.observe.local',
      'provider-runtime',
      'window-1',
    );

    await writeFile(executablePath, 'runtime-after');

    const projection = (await host.management.list()).find(
      (runtime) => runtime.sourceId === 'computer-use.observe.local',
    );
    expect(projection).toMatchObject({
      state: 'error',
      diagnostics: ['provider-unavailable'],
    });
  });

  it('projects ready after server identity and required operation structures match', async () => {
    const root = await temporaryRoot();
    const runtimePath = path.join(root, 'browser-use');
    const browserPath = path.join(root, 'Chromium');
    await Promise.all([writeFile(runtimePath, 'runtime'), writeFile(browserPath, 'browser')]);
    const selections = new Map([
      ['provider-runtime', runtimePath],
      ['browser-executable', browserPath],
    ]);
    const host = createDesktopAutomationLocalRuntimeHost({
      assertDisconnectAllowed: async () => undefined,
      selectAsset: vi.fn(async ({ assetKey }) => selections.get(assetKey)),
      openExternal: vi.fn(async () => undefined),
      writeClipboardText: vi.fn(),
      inspectProvider: vi.fn(async () => ({
        server: { name: 'browser-use' },
        operations: BROWSER_USE_OBSERVE_PROFILE.operations.map((operation) => ({
          name: operation.name,
          inputSchema: { type: 'object', properties: {} },
          annotations: {},
        })),
      })),
      createIdentity: identitySequence(),
    });
    await host.management.authorizeAsset(
      'browser-use.observe.local',
      'provider-runtime',
      'window-1',
    );
    await host.management.authorizeAsset(
      'browser-use.observe.local',
      'browser-executable',
      'window-1',
    );

    expect((await host.management.list())[0]).toMatchObject({
      state: 'ready',
      diagnostics: [],
    });
  });

  it('opens only the descriptor-owned guide and disconnects without deleting files', async () => {
    const root = await temporaryRoot();
    const runtimePath = path.join(root, 'cua-driver');
    await writeFile(runtimePath, 'runtime');
    const openExternal = vi.fn(async () => undefined);
    const writeClipboardText = vi.fn();
    const host = createDesktopAutomationLocalRuntimeHost({
      assertDisconnectAllowed: async () => undefined,
      selectAsset: vi.fn(async () => runtimePath),
      openExternal,
      writeClipboardText,
      createIdentity: identitySequence(),
    });

    await host.management.openInstallationGuide('computer-use.observe.local');
    expect(openExternal).toHaveBeenCalledWith('https://cua.ai/docs/how-to-guides/driver/install');
    await host.management.copyInstallationCommand('computer-use.observe.local');
    expect(writeClipboardText).toHaveBeenCalledWith(
      '/bin/bash -c "$(curl -fsSL https://cua.ai/driver/install.sh)"',
    );
    await host.management.authorizeAsset(
      'computer-use.observe.local',
      'provider-runtime',
      'window-1',
    );
    const configured = (await host.management.list()).find(
      (runtime) => runtime.sourceId === 'computer-use.observe.local',
    );
    await host.management.disconnect('computer-use.observe.local', configured?.runtimeId ?? '');
    expect(
      (await host.management.list()).find(
        (runtime) => runtime.sourceId === 'computer-use.observe.local',
      ),
    ).toMatchObject({ authorized: false, state: 'not-configured' });
    await expect(writeFile(runtimePath, 'still-user-owned')).resolves.toBeUndefined();
  });

  it('keeps authorization when an owned Automation session blocks disconnect', async () => {
    const root = await temporaryRoot();
    const runtimePath = path.join(root, 'CuaDriver.app');
    await mkdir(runtimePath);
    const host = createDesktopAutomationLocalRuntimeHost({
      assertDisconnectAllowed: async () => {
        throw new Error('runtime owns an active session');
      },
      selectAsset: vi.fn(async () => runtimePath),
      openExternal: vi.fn(async () => undefined),
      writeClipboardText: vi.fn(),
      createIdentity: identitySequence(),
    });
    await host.management.authorizeAsset(
      'computer-use.observe.local',
      'provider-runtime',
      'window-1',
    );
    const configured = (await host.management.list()).find(
      (runtime) => runtime.sourceId === 'computer-use.observe.local',
    );

    await expect(
      host.management.disconnect('computer-use.observe.local', configured?.runtimeId ?? ''),
    ).rejects.toThrow('runtime owns an active session');
    expect(
      (await host.management.list()).find(
        (runtime) => runtime.sourceId === 'computer-use.observe.local',
      ),
    ).toMatchObject({ authorized: true });
  });
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'openneko-local-runtime-'));
  temporaryRoots.push(root);
  return root;
}

function identitySequence(): () => string {
  let index = 0;
  return () => `fixture-${++index}`;
}
