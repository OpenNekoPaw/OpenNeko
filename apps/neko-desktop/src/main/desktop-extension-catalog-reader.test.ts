import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';
import { createDesktopExtensionCatalogReader } from './desktop-extension-catalog-reader';

describe('Desktop extension catalog reader', () => {
  it('projects enabled global plugin manifests and safe contribution ids', async () => {
    await withCodexHome(async (codexHome) => {
      await writeConfig(
        codexHome,
        [
          '[plugins."computer-use@openai-bundled"]',
          'enabled = true',
          '',
          '[plugins."disabled@openai-bundled"]',
          'enabled = false',
        ].join('\n'),
      );
      await writePlugin(codexHome, {
        marketplace: 'openai-bundled',
        name: 'computer-use',
        version: '1.0.2',
        manifest: {
          name: 'computer-use',
          version: '1.0.2',
          description: 'Canonical description',
          author: { name: 'OpenAI' },
          interface: {
            displayName: 'Computer Use',
            shortDescription: 'Control Mac apps',
            developerName: 'OpenAI',
          },
          mcpServers: './.mcp.json',
          skills: './skills',
          apps: './.app.json',
        },
        files: {
          '.mcp.json': JSON.stringify({
            mcpServers: {
              'computer-use': {
                command: './private-launcher',
                env_vars: ['CODEX_HOME', 'PRIVATE_TOKEN'],
              },
            },
          }),
          '.app.json': JSON.stringify({
            apps: {
              desktop_control: { id: 'private-connector-id' },
            },
          }),
        },
        directories: ['skills'],
      });

      const snapshot = await createDesktopExtensionCatalogReader({ codexHome }).readCatalog();

      expect(snapshot).toEqual({
        records: [
          {
            id: 'computer-use@openai-bundled',
            name: 'computer-use',
            displayName: 'Computer Use',
            description: 'Control Mac apps',
            version: '1.0.2',
            developer: 'OpenAI',
            marketplace: 'openai-bundled',
            mcpServerIds: ['computer-use'],
            hasSkills: true,
            appIds: ['desktop_control'],
          },
        ],
        diagnostics: [],
      });
      const serialized = JSON.stringify(snapshot);
      expect(serialized).not.toContain(codexHome);
      expect(serialized).not.toContain('private-launcher');
      expect(serialized).not.toContain('PRIVATE_TOKEN');
      expect(serialized).not.toContain('private-connector-id');
      expect(serialized).not.toContain('disabled');
    });
  });

  it('omits unverified packages and groups safe diagnostics', async () => {
    await withCodexHome(async (codexHome) => {
      await writeConfig(
        codexHome,
        [
          '[plugins."missing@market"]',
          'enabled = true',
          '',
          '[plugins."ambiguous@market"]',
          'enabled = true',
          '',
          '[plugins."unsafe@market"]',
          'enabled = true',
          '',
          '[plugins."../invalid@market"]',
          'enabled = true',
        ].join('\n'),
      );
      await writePlugin(codexHome, {
        marketplace: 'market',
        name: 'ambiguous',
        version: '1.0.0',
        manifest: { name: 'ambiguous', version: '1.0.0' },
      });
      await writePlugin(codexHome, {
        marketplace: 'market',
        name: 'ambiguous',
        version: '2.0.0',
        manifest: { name: 'ambiguous', version: '2.0.0' },
      });
      await writePlugin(codexHome, {
        marketplace: 'market',
        name: 'unsafe',
        version: '1.0.0',
        manifest: {
          name: 'unsafe',
          version: '1.0.0',
          mcpServers: '../../../../outside.json',
        },
      });

      const snapshot = await createDesktopExtensionCatalogReader({ codexHome }).readCatalog();

      expect(snapshot.records).toEqual([]);
      expect(snapshot.diagnostics).toEqual([
        { code: 'contribution_invalid', count: 1 },
        { code: 'package_missing', count: 1 },
        { code: 'package_version_ambiguous', count: 1 },
        { code: 'registration_invalid', count: 1 },
      ]);
    });
  });

  it('treats a missing Codex config as an empty optional catalog', async () => {
    await withCodexHome(async (codexHome) => {
      await expect(
        createDesktopExtensionCatalogReader({ codexHome }).readCatalog(),
      ).resolves.toEqual({
        records: [],
        diagnostics: [],
      });
    });
  });

  it('rejects a plugin package family redirected outside the cache root', async () => {
    await withCodexHome(async (codexHome) => {
      await writeConfig(codexHome, ['[plugins."escape@market"]', 'enabled = true'].join('\n'));
      const outsideRoot = join(codexHome, 'outside-plugin');
      await mkdir(join(outsideRoot, '1.0.0', '.codex-plugin'), { recursive: true });
      await writeFile(
        join(outsideRoot, '1.0.0', '.codex-plugin', 'plugin.json'),
        JSON.stringify({ name: 'escape', version: '1.0.0' }),
        'utf8',
      );
      const marketplaceRoot = join(codexHome, 'plugins', 'cache', 'market');
      await mkdir(marketplaceRoot, { recursive: true });
      await symlink(outsideRoot, join(marketplaceRoot, 'escape'), 'dir');

      await expect(
        createDesktopExtensionCatalogReader({ codexHome }).readCatalog(),
      ).resolves.toEqual({
        records: [],
        diagnostics: [{ code: 'package_missing', count: 1 }],
      });
    });
  });

  it('rejects a Skill contribution redirected through a symlinked parent', async () => {
    await withCodexHome(async (codexHome) => {
      await writeConfig(codexHome, ['[plugins."escape@market"]', 'enabled = true'].join('\n'));
      await writePlugin(codexHome, {
        marketplace: 'market',
        name: 'escape',
        version: '1.0.0',
        manifest: {
          name: 'escape',
          version: '1.0.0',
          skills: './linked/skills',
        },
      });
      const outsideRoot = join(codexHome, 'outside-skills');
      await mkdir(join(outsideRoot, 'skills'), { recursive: true });
      const pluginRoot = join(codexHome, 'plugins', 'cache', 'market', 'escape', '1.0.0');
      await symlink(outsideRoot, join(pluginRoot, 'linked'), 'dir');

      await expect(
        createDesktopExtensionCatalogReader({ codexHome }).readCatalog(),
      ).resolves.toEqual({
        records: [],
        diagnostics: [{ code: 'contribution_invalid', count: 1 }],
      });
    });
  });
});

async function withCodexHome(run: (codexHome: string) => Promise<void>): Promise<void> {
  const codexHome = await mkdtemp(join(tmpdir(), 'openneko-extension-catalog-'));
  try {
    await run(codexHome);
  } finally {
    await rm(codexHome, { recursive: true, force: true });
  }
}

async function writeConfig(codexHome: string, source: string): Promise<void> {
  await mkdir(codexHome, { recursive: true });
  await writeFile(join(codexHome, 'config.toml'), source, 'utf8');
}

async function writePlugin(
  codexHome: string,
  input: {
    readonly marketplace: string;
    readonly name: string;
    readonly version: string;
    readonly manifest: Readonly<Record<string, unknown>>;
    readonly files?: Readonly<Record<string, string>>;
    readonly directories?: readonly string[];
  },
): Promise<void> {
  const root = join(codexHome, 'plugins', 'cache', input.marketplace, input.name, input.version);
  await mkdir(join(root, '.codex-plugin'), { recursive: true });
  await writeFile(
    join(root, '.codex-plugin', 'plugin.json'),
    JSON.stringify(input.manifest),
    'utf8',
  );
  for (const directory of input.directories ?? []) {
    await mkdir(join(root, directory), { recursive: true });
  }
  for (const [relativePath, source] of Object.entries(input.files ?? {})) {
    await writeFile(join(root, relativePath), source, 'utf8');
  }
}
