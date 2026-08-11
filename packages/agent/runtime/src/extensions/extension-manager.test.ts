import { mkdir, mkdtemp, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  createAgentExtensionManager,
  createAgentExtensionMutationOwnership,
  createOpenNekoExtensionRepository,
  type AgentExtensionSupportPort,
} from './extension-manager';

describe('Desktop extension manager', () => {
  it('checks exact Agent turn and Automation session ownership without affecting siblings', async () => {
    let activePluginId: string | undefined = 'browser-use@openneko';
    const ownership = createAgentExtensionMutationOwnership({
      listOwnedAgentTurns: (pluginId) =>
        pluginId === activePluginId ? [{ runId: 'agent-run-1' }] : [],
      listOwnedAutomationSessions: (pluginId) =>
        pluginId === 'browser-use@openneko' ? [{ sessionId: 'automation-session-1' }] : [],
    });
    const input = {
      operationId: 'operation-1',
      pluginId: 'browser-use@openneko',
      mutation: 'disable' as const,
    };

    await expect(ownership.assertIdle(input)).rejects.toThrow('owns 1 Agent turn');
    await expect(
      ownership.assertIdle({ ...input, pluginId: 'sibling@openneko' }),
    ).resolves.toBeUndefined();
    activePluginId = undefined;
    await expect(ownership.assertIdle(input)).rejects.toThrow('owns 1 Automation session');
  });

  it('discovers a bundled adapter and keeps enablement as the only managed state', async () => {
    await withRepository(async (fixture) => {
      await writePlugin(join(fixture.marketplaceRoot, 'plugins', 'computer-use'), {
        name: 'computer-use',
        version: '1.0.2',
        permissions: ['screen-recording', 'accessibility'],
        mcpServers: './.mcp.json',
        mcpToolExposure: 'adapter-only',
        skills: './skills',
        interface: {
          displayName: 'Computer Use',
          shortDescription: 'Control desktop apps',
          localization: { 'zh-cn': { shortDescription: '控制桌面应用' } },
          developerName: 'OpenNeko',
          category: 'Productivity',
        },
      });
      const pluginRoot = join(fixture.marketplaceRoot, 'plugins', 'computer-use');
      await mkdir(join(pluginRoot, 'skills'), { recursive: true });
      await writeFile(
        join(pluginRoot, '.mcp.json'),
        JSON.stringify({ mcpServers: { 'computer-use': { command: './private-launcher' } } }),
        'utf8',
      );
      await writeMarketplace(fixture.marketplaceRoot, [
        { name: 'computer-use', version: '1.0.2', path: 'plugins/computer-use' },
      ]);
      const manager = createManager(fixture);

      const disabled = await manager.readCatalog();
      expect(disabled.records).toEqual([
        expect.objectContaining({
          id: 'computer-use@openneko',
          version: '1.0.2',
          deliverySource: 'bundled',
          enabled: false,
          canEnable: true,
          canDisable: false,
          canRemove: false,
          agentStatus: 'disabled',
          localization: { 'zh-cn': { description: '控制桌面应用' } },
          mcpServerIds: ['computer-use'],
          hasSkills: true,
        }),
      ]);
      expect(JSON.stringify(disabled.records)).not.toContain(fixture.root);
      expect(JSON.stringify(disabled.records)).not.toContain('private-launcher');

      const enabled = await manager.enablePlugin('computer-use@openneko');
      expect(enabled.runtimeDescriptors).toEqual([
        expect.objectContaining({
          pluginId: 'computer-use@openneko',
          mcpServerIds: ['computer-use'],
          mcpToolExposure: 'adapter-only',
        }),
      ]);
      manager.setRuntimeReadiness(
        enabled,
        new Map([['computer-use@openneko', { status: 'ready', diagnosticCode: '' }]]),
      );
      await expect(manager.readCatalog()).resolves.toMatchObject({
        records: [expect.objectContaining({ agentStatus: 'ready' })],
      });

      const rescanned = await manager.rescanSources();
      expect(rescanned.records).toEqual([
        expect.objectContaining({ enabled: true, agentStatus: 'error' }),
      ]);
      await expect(manager.disablePlugin('computer-use@openneko')).resolves.toMatchObject({
        records: [expect.objectContaining({ enabled: false, agentStatus: 'disabled' })],
      });
      await expect(manager.removePlugin('computer-use@openneko')).rejects.toThrow(
        'does not allow this operation',
      );
    });
  });

  it('discovers and removes a personal copied plugin without owning its installation source', async () => {
    await withRepository(async (fixture) => {
      const pluginRoot = join(fixture.installRoot, 'third-party');
      await writePlugin(pluginRoot, {
        name: 'third-party',
        version: '2.3.4',
        skills: './skills',
        interface: { displayName: 'Third Party' },
      });
      await mkdir(join(pluginRoot, 'skills'), { recursive: true });
      const manager = createManager(fixture);

      await expect(manager.readCatalog()).resolves.toMatchObject({
        records: [
          expect.objectContaining({
            id: 'third-party@openneko',
            deliverySource: 'personal',
            canRemove: true,
          }),
        ],
      });
      await manager.removePlugin('third-party@openneko');
      expect(fixture.trashItem).toHaveBeenCalledOnce();
      await expect(manager.readCatalog()).resolves.toMatchObject({ records: [] });
    });
  });

  it('isolates a bundled/personal identity collision and preserves sibling plugins', async () => {
    await withRepository(async (fixture) => {
      await writePlugin(join(fixture.marketplaceRoot, 'plugins', 'duplicate'), {
        name: 'duplicate',
        version: '1.0.0',
        skills: './skills',
      });
      await mkdir(join(fixture.marketplaceRoot, 'plugins', 'duplicate', 'skills'), {
        recursive: true,
      });
      await writePlugin(join(fixture.installRoot, 'duplicate'), {
        name: 'duplicate',
        version: '9.0.0',
        skills: './skills',
      });
      await mkdir(join(fixture.installRoot, 'duplicate', 'skills'), { recursive: true });
      await writePlugin(join(fixture.installRoot, 'sibling'), {
        name: 'sibling',
        version: '1.0.0',
        skills: './skills',
      });
      await mkdir(join(fixture.installRoot, 'sibling', 'skills'), { recursive: true });
      await writeMarketplace(fixture.marketplaceRoot, [
        { name: 'duplicate', version: '1.0.0', path: 'plugins/duplicate' },
      ]);

      const snapshot = await createManager(fixture).readCatalog();
      expect(snapshot.records.map((record) => record.id)).toEqual(['sibling@openneko']);
      expect(snapshot.diagnostics).toEqual([{ code: 'repository_invalid', count: 1 }]);
    });
  });

  it('keeps an invalid personal plugin visible with a local diagnostic', async () => {
    await withRepository(async (fixture) => {
      await writePlugin(join(fixture.installRoot, 'broken'), {
        name: 'wrong-name',
        version: '1.0.0',
      });

      await expect(createManager(fixture).readCatalog()).resolves.toMatchObject({
        records: [
          expect.objectContaining({
            id: 'broken@openneko',
            deliverySource: 'personal',
            agentStatus: 'error',
            runtimeDiagnosticCode: 'manifest-invalid',
            canRemove: true,
          }),
        ],
        diagnostics: [{ code: 'manifest_invalid', count: 1 }],
      });
    });
  });

  it('rejects symlinked personal plugin roots without hiding valid siblings', async () => {
    await withRepository(async (fixture) => {
      const externalRoot = join(fixture.root, 'external-plugin');
      await writePlugin(externalRoot, { name: 'linked', version: '1.0.0', skills: './skills' });
      await mkdir(join(externalRoot, 'skills'), { recursive: true });
      await symlink(externalRoot, join(fixture.installRoot, 'linked'));
      await writePlugin(join(fixture.installRoot, 'valid'), {
        name: 'valid',
        version: '1.0.0',
        skills: './skills',
      });
      await mkdir(join(fixture.installRoot, 'valid', 'skills'), { recursive: true });

      const snapshot = await createManager(fixture).readCatalog();
      expect(snapshot.records.map((record) => record.id)).toEqual(['valid@openneko']);
      expect(snapshot.diagnostics).toEqual([{ code: 'manifest_invalid', count: 1 }]);
    });
  });

  it('reports an unavailable bundled source without failing the personal source', async () => {
    await withRepository(async (fixture) => {
      await rm(fixture.marketplaceRoot, { recursive: true, force: true });
      const snapshot = await createManager(fixture).readCatalog();
      expect(snapshot.records).toEqual([]);
      expect(snapshot.diagnostics).toEqual([{ code: 'repository_unavailable', count: 1 }]);
    });
  });
});

function createManager(
  fixture: RepositoryFixture,
  agentSupport: AgentExtensionSupportPort = { isSupported: vi.fn(async () => true) },
) {
  return createAgentExtensionManager({
    repository: createOpenNekoExtensionRepository({
      marketplaceRoot: fixture.marketplaceRoot,
      installRoot: fixture.installRoot,
      stateRoot: fixture.stateRoot,
      trashItem: fixture.trashItem,
    }),
    agentSupport,
    mutationOwnership: { assertIdle: vi.fn(async () => undefined) },
  });
}

interface RepositoryFixture {
  readonly root: string;
  readonly marketplaceRoot: string;
  readonly installRoot: string;
  readonly stateRoot: string;
  readonly trashRoot: string;
  readonly trashItem: ReturnType<typeof vi.fn<(absolutePath: string) => Promise<void>>>;
}

async function withRepository(run: (fixture: RepositoryFixture) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'openneko-extension-repository-'));
  const marketplaceRoot = join(root, 'marketplace');
  const installRoot = join(root, 'neko-home', 'extensions', 'plugins');
  const stateRoot = join(root, 'neko-home', 'extensions', 'state');
  const trashRoot = join(root, 'trash');
  await Promise.all([
    mkdir(marketplaceRoot, { recursive: true }),
    mkdir(installRoot, { recursive: true }),
    mkdir(stateRoot, { recursive: true }),
    mkdir(trashRoot, { recursive: true }),
  ]);
  await writeMarketplace(marketplaceRoot, []);
  const trashItem = vi.fn(async (absolutePath: string) => {
    await rename(absolutePath, join(trashRoot, `removed-${Date.now()}`));
  });
  try {
    await run({ root, marketplaceRoot, installRoot, stateRoot, trashRoot, trashItem });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function writeMarketplace(
  marketplaceRoot: string,
  plugins: readonly { readonly name: string; readonly version: string; readonly path: string }[],
): Promise<void> {
  await writeFile(
    join(marketplaceRoot, 'marketplace.json'),
    JSON.stringify({ publisher: 'OpenNeko', plugins }),
    'utf8',
  );
}

async function writePlugin(
  root: string,
  manifest: Readonly<Record<string, unknown>>,
): Promise<void> {
  await mkdir(join(root, '.openneko-plugin'), { recursive: true });
  await writeFile(join(root, '.openneko-plugin', 'plugin.json'), JSON.stringify(manifest), 'utf8');
}
