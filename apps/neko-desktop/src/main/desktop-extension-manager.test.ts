import { mkdir, mkdtemp, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  createDesktopExtensionManager,
  createOpenNekoExtensionRepository,
  type DesktopExtensionAgentSupportPort,
} from './desktop-extension-manager';

describe('Desktop extension manager', () => {
  it('projects only OpenNeko installed and available plugins without execution fields', async () => {
    await withRepository(async (fixture) => {
      const installedRoot = join(fixture.installRoot, 'computer-use');
      const availableRoot = join(fixture.marketplaceRoot, 'plugins', 'latex');
      await writePlugin(installedRoot, {
        name: 'computer-use',
        version: '1.0.2',
        mcpServers: './.mcp.json',
        skills: './skills',
        interface: {
          displayName: 'Computer Use',
          shortDescription: 'Control desktop apps',
          developerName: 'OpenNeko',
          category: 'Productivity',
        },
      });
      await mkdir(join(installedRoot, 'skills'), { recursive: true });
      await writeFile(
        join(installedRoot, '.mcp.json'),
        JSON.stringify({
          mcpServers: {
            'computer-use': {
              command: './private-launcher',
              env_vars: ['PRIVATE_TOKEN'],
            },
          },
        }),
        'utf8',
      );
      await writePlugin(availableRoot, {
        name: 'latex',
        version: '0.2.4',
        skills: './skills',
        interface: { displayName: 'LaTeX' },
      });
      await mkdir(join(availableRoot, 'skills'), { recursive: true });
      await writeMarketplace(fixture.marketplaceRoot, [
        { name: 'latex', version: '0.2.4', path: 'plugins/latex' },
      ]);

      const manager = createManager(fixture);
      const snapshot = await manager.readCatalog();

      expect(snapshot.records).toEqual([
        expect.objectContaining({
          id: 'computer-use@openneko',
          marketplace: 'openneko',
          installed: true,
          canRemove: true,
          agentStatus: 'error',
          runtimeDiagnosticCode: 'runtime-not-composed',
          mcpServerIds: ['computer-use'],
          hasSkills: true,
        }),
        expect.objectContaining({
          id: 'latex@openneko',
          marketplace: 'openneko',
          installed: false,
          canInstall: true,
          agentStatus: 'not-installed',
        }),
      ]);
      expect(snapshot.runtimeDescriptors).toEqual([
        expect.objectContaining({
          pluginId: 'computer-use@openneko',
          mcpServerIds: ['computer-use'],
        }),
      ]);
      expect(snapshot.revision).toMatch(/^sha256:[0-9a-f]{64}$/u);
      const serialized = JSON.stringify(snapshot.records);
      expect(serialized).not.toContain(fixture.root);
      expect(serialized).not.toContain('private-launcher');
      expect(serialized).not.toContain('PRIVATE_TOKEN');

      manager.setRuntimeReadiness(
        snapshot.revision,
        new Map([['computer-use@openneko', { status: 'ready', diagnosticCode: '' }]]),
      );
      await expect(manager.readCatalog()).resolves.toMatchObject({
        records: [
          expect.objectContaining({
            id: 'computer-use@openneko',
            agentStatus: 'ready',
          }),
          expect.objectContaining({ id: 'latex@openneko' }),
        ],
      });
    });
  });

  it('installs and recoverably removes only revision-fenced OpenNeko packages', async () => {
    await withRepository(async (fixture) => {
      const sourceRoot = join(fixture.marketplaceRoot, 'plugins', 'sample');
      await writePlugin(sourceRoot, {
        name: 'sample',
        version: '1.0.0',
        skills: './skills',
      });
      await mkdir(join(sourceRoot, 'skills'), { recursive: true });
      await writeMarketplace(fixture.marketplaceRoot, [
        { name: 'sample', version: '1.0.0', path: 'plugins/sample' },
      ]);
      const manager = createManager(fixture);
      const snapshot = await manager.readCatalog();

      await expect(
        manager.installPlugin('sample@openneko', `sha256:${'0'.repeat(64)}`),
      ).rejects.toThrow('catalog changed');
      await expect(
        manager.installPlugin('sample@openai-bundled', snapshot.revision),
      ).rejects.toThrow('OpenNeko plugin id is invalid');

      const installed = await manager.installPlugin('sample@openneko', snapshot.revision);
      expect(installed.records).toEqual([
        expect.objectContaining({
          id: 'sample@openneko',
          installed: true,
          canRemove: true,
        }),
      ]);

      const removed = await manager.removePlugin('sample@openneko', installed.revision);
      expect(removed.records).toEqual([
        expect.objectContaining({
          id: 'sample@openneko',
          installed: false,
          canInstall: true,
        }),
      ]);
      expect(fixture.trashItem).toHaveBeenCalledOnce();
      expect(fixture.trashItem).toHaveBeenCalledWith(
        join(await realpath(fixture.installRoot), 'sample'),
      );
    });
  });

  it('returns an honest empty catalog and ignores foreign application marketplaces', async () => {
    await withRepository(async (fixture) => {
      await writeMarketplace(fixture.marketplaceRoot, []);
      const foreignRoot = join(fixture.root, '.codex', 'plugins', 'foreign');
      await mkdir(join(foreignRoot, '.codex-plugin'), { recursive: true });
      await writeFile(
        join(foreignRoot, '.codex-plugin', 'plugin.json'),
        JSON.stringify({ name: 'foreign', version: '9.9.9', skills: './skills' }),
        'utf8',
      );

      await expect(createManager(fixture).readCatalog()).resolves.toMatchObject({
        records: [],
        runtimeDescriptors: [],
        diagnostics: [],
      });
    });
  });

  it('rejects a marketplace package that escapes the OpenNeko snapshot through a parent symlink', async () => {
    await withRepository(async (fixture) => {
      const externalRoot = join(fixture.root, 'external-packages');
      await writePlugin(join(externalRoot, 'escaped'), {
        name: 'escaped',
        version: '1.0.0',
        skills: './skills',
      });
      await mkdir(join(externalRoot, 'escaped', 'skills'), { recursive: true });
      await symlink(externalRoot, join(fixture.marketplaceRoot, 'plugins'), 'dir');
      await writeMarketplace(fixture.marketplaceRoot, [
        { name: 'escaped', version: '1.0.0', path: 'plugins/escaped' },
      ]);

      await expect(createManager(fixture).readCatalog()).resolves.toMatchObject({
        records: [],
        runtimeDescriptors: [],
        diagnostics: [{ code: 'manifest_invalid', count: 1 }],
      });
    });
  });

  it('fails visibly for a non-OpenNeko repository index', async () => {
    await withRepository(async (fixture) => {
      await writeFile(
        join(fixture.marketplaceRoot, 'marketplace.json'),
        JSON.stringify({
          schemaVersion: 1,
          publisher: 'AnotherApplication',
          plugins: [],
        }),
        'utf8',
      );

      await expect(createManager(fixture).readCatalog()).resolves.toMatchObject({
        records: [],
        diagnostics: [{ code: 'repository_invalid', count: 1 }],
      });
    });
  });

  it('omits invalid manifests and returns grouped safe diagnostics', async () => {
    await withRepository(async (fixture) => {
      const installedRoot = join(fixture.installRoot, 'first');
      const availableRoot = join(fixture.marketplaceRoot, 'plugins', 'second');
      await writePlugin(installedRoot, { name: 'wrong-name', version: '1.0.0' });
      await writePlugin(availableRoot, { name: 'also-wrong', version: '1.0.0' });
      await writeMarketplace(fixture.marketplaceRoot, [
        { name: 'second', version: '1.0.0', path: 'plugins/second' },
      ]);

      await expect(createManager(fixture).readCatalog()).resolves.toMatchObject({
        records: [],
        diagnostics: [{ code: 'manifest_invalid', count: 2 }],
      });
    });
  });

  it('projects installed App-only plugins as unsupported and never ready', async () => {
    await withRepository(async (fixture) => {
      const installedRoot = join(fixture.installRoot, 'app-only');
      await writePlugin(installedRoot, {
        name: 'app-only',
        version: '1.0.0',
        apps: './apps.json',
      });
      await writeFile(
        join(installedRoot, 'apps.json'),
        JSON.stringify({ apps: { connector: { id: 'private-id' } } }),
        'utf8',
      );
      await writeMarketplace(fixture.marketplaceRoot, []);

      const snapshot = await createManager(fixture).readCatalog();
      expect(snapshot.records[0]).toMatchObject({
        agentStatus: 'unsupported',
        runtimeDiagnosticCode: 'app-unsupported',
        appIds: ['connector'],
      });
    });
  });

  it('uses OpenNeko Agent support for available inventory without hiding installed plugins', async () => {
    await withRepository(async (fixture) => {
      const installedRoot = join(fixture.installRoot, 'installed-app');
      const supportedRoot = join(fixture.marketplaceRoot, 'plugins', 'creative-skill');
      const unsupportedRoot = join(fixture.marketplaceRoot, 'plugins', 'unsupported-app');
      await writePlugin(installedRoot, {
        name: 'installed-app',
        version: '1.0.0',
        apps: './apps.json',
      });
      await writeFile(
        join(installedRoot, 'apps.json'),
        JSON.stringify({ apps: { connector: {} } }),
        'utf8',
      );
      await writePlugin(supportedRoot, {
        name: 'creative-skill',
        version: '1.0.0',
        skills: './skills',
      });
      await mkdir(join(supportedRoot, 'skills'), { recursive: true });
      await writePlugin(unsupportedRoot, {
        name: 'unsupported-app',
        version: '1.0.0',
        apps: './apps.json',
      });
      await writeFile(
        join(unsupportedRoot, 'apps.json'),
        JSON.stringify({ apps: { connector: {} } }),
        'utf8',
      );
      await writeMarketplace(fixture.marketplaceRoot, [
        { name: 'creative-skill', version: '1.0.0', path: 'plugins/creative-skill' },
        { name: 'unsupported-app', version: '1.0.0', path: 'plugins/unsupported-app' },
      ]);
      const agentSupport = createAgentSupport(new Set(['creative-skill@openneko']));
      const manager = createManager(fixture, agentSupport);

      const snapshot = await manager.readCatalog();

      expect(snapshot.records.map((record) => record.id)).toEqual([
        'installed-app@openneko',
        'creative-skill@openneko',
      ]);
      expect(agentSupport.isSupported).toHaveBeenCalledTimes(2);
      expect(agentSupport.isSupported).not.toHaveBeenCalledWith(
        expect.objectContaining({ pluginId: 'installed-app@openneko' }),
      );
    });
  });
});

function createManager(
  fixture: RepositoryFixture,
  agentSupport: DesktopExtensionAgentSupportPort = createAgentSupport(),
) {
  return createDesktopExtensionManager({
    repository: createOpenNekoExtensionRepository({
      marketplaceRoot: fixture.marketplaceRoot,
      installRoot: fixture.installRoot,
      trashItem: fixture.trashItem,
    }),
    agentSupport,
  });
}

function createAgentSupport(
  supportedPluginIds: ReadonlySet<string> | 'all' = 'all',
): DesktopExtensionAgentSupportPort & {
  readonly isSupported: ReturnType<
    typeof vi.fn<(descriptor: { readonly pluginId: string }) => Promise<boolean>>
  >;
} {
  return {
    isSupported: vi.fn(
      async (descriptor) =>
        supportedPluginIds === 'all' || supportedPluginIds.has(descriptor.pluginId),
    ),
  };
}

interface RepositoryFixture {
  readonly root: string;
  readonly marketplaceRoot: string;
  readonly installRoot: string;
  readonly trashRoot: string;
  readonly trashItem: ReturnType<typeof vi.fn<(absolutePath: string) => Promise<void>>>;
}

async function withRepository(run: (fixture: RepositoryFixture) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'openneko-extension-repository-'));
  const marketplaceRoot = join(root, 'marketplace');
  const installRoot = join(root, 'neko-home', 'extensions', 'plugins');
  const trashRoot = join(root, 'trash');
  await Promise.all([
    mkdir(marketplaceRoot, { recursive: true }),
    mkdir(installRoot, { recursive: true }),
    mkdir(trashRoot, { recursive: true }),
  ]);
  const trashItem = vi.fn(async (absolutePath: string) => {
    await rename(absolutePath, join(trashRoot, `removed-${Date.now()}`));
  });
  try {
    await run({ root, marketplaceRoot, installRoot, trashRoot, trashItem });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function writeMarketplace(
  marketplaceRoot: string,
  plugins: readonly {
    readonly name: string;
    readonly version: string;
    readonly path: string;
  }[],
): Promise<void> {
  await writeFile(
    join(marketplaceRoot, 'marketplace.json'),
    JSON.stringify({
      schemaVersion: 1,
      publisher: 'OpenNeko',
      plugins,
    }),
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
