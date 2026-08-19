import { mkdir, mkdtemp, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { PluginStateRecord, PluginStateRepository } from '@neko/local-metadata';
import { describe, expect, it, vi } from 'vitest';

import {
  createAgentExtensionManager,
  createAgentExtensionMutationOwnership,
  createOpenNekoExtensionRepository,
} from './extension-manager';

describe('Desktop extension manager', () => {
  it('checks exact Agent turn and Automation session ownership without affecting siblings', async () => {
    let activePluginId: string | undefined = 'browser-use';
    const ownership = createAgentExtensionMutationOwnership({
      listOwnedAgentTurns: (pluginId) =>
        pluginId === activePluginId ? [{ runId: 'agent-run-1' }] : [],
      listOwnedAutomationSessions: (pluginId) =>
        pluginId === 'browser-use' ? [{ sessionId: 'automation-session-1' }] : [],
    });
    const input = {
      operationId: 'operation-1',
      pluginId: 'browser-use',
      mutation: 'disable' as const,
    };

    await expect(ownership.assertIdle(input)).rejects.toThrow('owns 1 Agent turn');
    await expect(ownership.assertIdle({ ...input, pluginId: 'sibling' })).resolves.toBeUndefined();
    activePluginId = undefined;
    await expect(ownership.assertIdle(input)).rejects.toThrow('owns 1 Automation session');
  });

  it('discovers an exact bundled root and persists only its SQLite enablement choice', async () => {
    await withRepository(async (fixture) => {
      const pluginRoot = join(fixture.bundledRoot, 'computer-use');
      await writePlugin(pluginRoot, {
        name: 'computer-use',
        version: '1.0.2',
        description: 'Control desktop apps',
        author: { name: 'OpenNeko' },
        extensions: {
          'io.openneko': {
            displayName: 'Computer Use',
            localization: { 'zh-cn': { description: '控制桌面应用' } },
            mcpToolExposure: 'adapter-only',
          },
        },
      });
      await mkdir(join(pluginRoot, 'skills'));
      await writeFile(
        join(pluginRoot, 'mcp.json'),
        JSON.stringify({ mcpServers: { 'computer-use': { command: './private-launcher' } } }),
      );
      fixture.bundledPluginRoots.push(pluginRoot);
      const manager = createManager(fixture);

      const disabled = await manager.readCatalog();
      expect(disabled.records).toEqual([
        expect.objectContaining({
          id: 'computer-use',
          version: '1.0.2',
          deliverySource: 'bundled',
          enabled: false,
          canRemove: false,
          agentStatus: 'disabled',
          localization: { 'zh-cn': { description: '控制桌面应用' } },
          mcpServerIds: ['computer-use'],
          hasSkills: true,
        }),
      ]);
      expect(JSON.stringify(disabled.records)).not.toContain(fixture.root);
      expect(JSON.stringify(disabled.records)).not.toContain('private-launcher');

      const enabled = await manager.enablePlugin('computer-use');
      expect(await fixture.pluginStates.get('computer-use')).toMatchObject({ enabled: true });
      expect(enabled.runtimeDescriptors).toEqual([
        expect.objectContaining({
          pluginId: 'computer-use',
          mcpServerIds: ['computer-use'],
          mcpToolExposure: 'adapter-only',
        }),
      ]);
      await expect(manager.removePlugin('computer-use')).rejects.toThrow(
        'does not allow this operation',
      );
    });
  });

  it('installs a selected local package through staging and removes only its exact record', async () => {
    await withRepository(async (fixture) => {
      const sourceRoot = join(fixture.root, 'selected-package');
      await writePlugin(sourceRoot, {
        name: 'third-party',
        version: '2.3.4',
        extensions: { 'com.example.plugin': { ignored: true } },
      });
      await mkdir(join(sourceRoot, 'skills'));
      const manager = createManager(fixture);

      await expect(manager.installLocalPlugin(sourceRoot)).resolves.toMatchObject({
        records: [
          expect.objectContaining({
            id: 'third-party',
            deliverySource: 'local',
            canRemove: true,
          }),
        ],
      });
      await expect(fixture.pluginStates.get('third-party')).resolves.toMatchObject({
        installState: 'installed',
        relativeInstallLocator: 'third-party',
      });

      await manager.removePlugin('third-party');
      expect(fixture.trashItem).toHaveBeenCalledOnce();
      await expect(fixture.pluginStates.get('third-party')).resolves.toBeNull();
    });
  });

  it('does not auto-register arbitrary package bytes or read an old JSON grant', async () => {
    await withRepository(async (fixture) => {
      await writePlugin(join(fixture.installRoot, 'orphan'), {
        name: 'orphan',
        version: '1.0.0',
      });
      await mkdir(join(fixture.root, 'extensions', 'state'), { recursive: true });
      await writeFile(
        join(fixture.root, 'extensions', 'state', 'orphan.json'),
        JSON.stringify({ pluginId: 'orphan', enabled: true }),
      );

      await expect(createManager(fixture).readCatalog()).resolves.toMatchObject({ records: [] });
    });
  });

  it('isolates duplicate bundled identities and preserves a sibling Plugin', async () => {
    await withRepository(async (fixture) => {
      for (const directory of ['duplicate-a', 'duplicate-b']) {
        const root = join(fixture.bundledRoot, directory);
        await writePlugin(root, { name: 'duplicate', version: '1.0.0' });
        fixture.bundledPluginRoots.push(root);
      }
      const sibling = join(fixture.bundledRoot, 'sibling');
      await writePlugin(sibling, { name: 'sibling', version: '1.0.0' });
      fixture.bundledPluginRoots.push(sibling);

      const snapshot = await createManager(fixture).readCatalog();
      expect(snapshot.records.map((record) => record.id)).toEqual(['sibling']);
      expect(snapshot.diagnostics).toContainEqual({ code: 'repository_invalid', count: 1 });

      const sourceRoot = join(fixture.root, 'selected-duplicate');
      await writePlugin(sourceRoot, { name: 'duplicate', version: '2.0.0' });
      await expect(createManager(fixture).installLocalPlugin(sourceRoot)).rejects.toThrow(
        "OpenNeko extension 'duplicate' already exists.",
      );
      await expect(fixture.pluginStates.get('duplicate')).resolves.toBeNull();
    });
  });

  it('keeps an invalid durable local row visible without hiding a valid sibling', async () => {
    await withRepository(async (fixture) => {
      await fixture.pluginStates.put(localState('broken'));
      await fixture.pluginStates.put(localState('valid'));
      await writePlugin(join(fixture.installRoot, 'broken'), {
        name: 'wrong-name',
        version: '1.0.0',
      });
      await writePlugin(join(fixture.installRoot, 'valid'), {
        name: 'valid',
        version: '1.0.0',
      });

      const snapshot = await createManager(fixture).readCatalog();
      expect(snapshot.records).toEqual([
        expect.objectContaining({ id: 'broken', agentStatus: 'error', canRemove: true }),
        expect.objectContaining({ id: 'valid', agentStatus: 'disabled', canRemove: true }),
      ]);
      expect(snapshot.diagnostics).toContainEqual({ code: 'manifest_invalid', count: 1 });
    });
  });

  it('keeps a valid Skill contribution when sibling MCP verification fails', async () => {
    await withRepository(async (fixture) => {
      const root = join(fixture.bundledRoot, 'mixed');
      await writePlugin(root, { name: 'mixed', version: '1.0.0' });
      await mkdir(join(root, 'skills'));
      await writeFile(join(root, 'mcp.json'), '{invalid');
      fixture.bundledPluginRoots.push(root);

      const manager = createManager(fixture);
      const enabled = await manager.enablePlugin('mixed');
      expect(enabled.records[0]).toMatchObject({
        hasSkills: true,
        componentReadiness: {
          skills: { status: 'error', diagnosticCode: 'runtime-not-composed' },
          mcp: { status: 'error', diagnosticCode: 'contribution-invalid' },
        },
      });
      expect(enabled.runtimeDescriptors[0]).toMatchObject({
        pluginId: 'mixed',
        skillRoot: expect.any(String),
      });
      manager.setRuntimeReadiness(
        enabled,
        new Map([
          [
            'mixed',
            {
              status: 'ready',
              diagnosticCode: '',
              componentReadiness: {
                skills: { status: 'ready', diagnosticCode: '' },
                mcp: { status: 'absent', diagnosticCode: '' },
                apps: { status: 'absent', diagnosticCode: '' },
              },
            },
          ],
        ]),
      );
      await expect(manager.readCatalog()).resolves.toMatchObject({
        records: [
          expect.objectContaining({
            componentReadiness: {
              skills: { status: 'ready', diagnosticCode: '' },
              mcp: { status: 'error', diagnosticCode: 'contribution-invalid' },
              apps: { status: 'absent', diagnosticCode: '' },
            },
          }),
        ],
      });
    });
  });

  it('retains an enabled Plugin with no executable contribution as unsupported', async () => {
    await withRepository(async (fixture) => {
      const root = join(fixture.bundledRoot, 'metadata-only');
      await writePlugin(root, { name: 'metadata-only', version: '1.0.0' });
      fixture.bundledPluginRoots.push(root);
      const manager = createManager(fixture);

      await expect(manager.enablePlugin('metadata-only')).resolves.toMatchObject({
        records: [
          expect.objectContaining({
            id: 'metadata-only',
            enabled: true,
            agentStatus: 'unsupported',
            runtimeDiagnosticCode: 'no-agent-contribution',
          }),
        ],
      });
    });
  });

  it('rejects symlinked component roots and private-only manifests', async () => {
    await withRepository(async (fixture) => {
      const privateOnly = join(fixture.bundledRoot, 'private-only');
      await mkdir(join(privateOnly, '.openneko-plugin'), { recursive: true });
      await writeFile(
        join(privateOnly, '.openneko-plugin', 'plugin.json'),
        JSON.stringify({ name: 'private-only', version: '1.0.0' }),
      );
      fixture.bundledPluginRoots.push(privateOnly);

      const linked = join(fixture.bundledRoot, 'linked');
      await writePlugin(linked, { name: 'linked', version: '1.0.0' });
      const external = join(fixture.root, 'external-skills');
      await mkdir(external);
      await symlink(external, join(linked, 'skills'));
      fixture.bundledPluginRoots.push(linked);

      const snapshot = await createManager(fixture).readCatalog();
      expect(snapshot.records).toEqual([
        expect.objectContaining({
          id: 'linked',
          hasSkills: false,
          componentReadiness: expect.objectContaining({
            skills: { status: 'error', diagnosticCode: 'contribution-invalid' },
          }),
        }),
        expect.objectContaining({ id: 'private-only', agentStatus: 'error' }),
      ]);
    });
  });

  it('rejects unknown manifest fields and invalid extension namespaces independently', async () => {
    await withRepository(async (fixture) => {
      const unknownField = join(fixture.bundledRoot, 'unknown-field');
      await writePlugin(unknownField, {
        name: 'unknown-field',
        version: '1.0.0',
        skills: './skills',
      });
      const invalidNamespace = join(fixture.bundledRoot, 'invalid-namespace');
      await writePlugin(invalidNamespace, {
        name: 'invalid-namespace',
        version: '1.0.0',
        extensions: { openneko: { displayName: 'Invalid' } },
      });
      fixture.bundledPluginRoots.push(unknownField, invalidNamespace);

      const snapshot = await createManager(fixture).readCatalog();
      expect(snapshot.records).toEqual([
        expect.objectContaining({ id: 'invalid-namespace', agentStatus: 'error' }),
        expect.objectContaining({ id: 'unknown-field', agentStatus: 'error' }),
      ]);
      expect(snapshot.diagnostics).toEqual([{ code: 'manifest_invalid', count: 2 }]);
    });
  });

  it('retains an invalid lifecycle row when package commit is interrupted by orphan bytes', async () => {
    await withRepository(async (fixture) => {
      const sourceRoot = join(fixture.root, 'selected-interrupted');
      await writePlugin(sourceRoot, { name: 'interrupted', version: '1.0.0' });
      await writePlugin(join(fixture.installRoot, 'interrupted'), {
        name: 'interrupted',
        version: '0.1.0',
      });
      const manager = createManager(fixture);

      await expect(manager.installLocalPlugin(sourceRoot)).rejects.toThrow();
      await expect(fixture.pluginStates.get('interrupted')).resolves.toMatchObject({
        installState: 'invalid',
        enabled: false,
      });
      await expect(manager.readCatalog()).resolves.toMatchObject({
        records: [
          expect.objectContaining({
            id: 'interrupted',
            agentStatus: 'error',
            runtimeDiagnosticCode: 'state-invalid',
          }),
        ],
      });
    });
  });
});

function createManager(fixture: RepositoryFixture) {
  return createAgentExtensionManager({
    repository: createOpenNekoExtensionRepository({
      bundledPluginRoots: fixture.bundledPluginRoots,
      installRoot: fixture.installRoot,
      pluginStates: fixture.pluginStates,
      trashItem: fixture.trashItem,
    }),
    mutationOwnership: { assertIdle: vi.fn(async () => undefined) },
  });
}

interface RepositoryFixture {
  readonly root: string;
  readonly bundledRoot: string;
  readonly bundledPluginRoots: string[];
  readonly installRoot: string;
  readonly pluginStates: MemoryPluginStateRepository;
  readonly trashItem: ReturnType<typeof vi.fn<(absolutePath: string) => Promise<void>>>;
}

async function withRepository(run: (fixture: RepositoryFixture) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'openneko-extension-repository-'));
  const bundledRoot = join(root, 'bundled');
  const installRoot = join(root, 'neko-home', 'extensions', 'plugins');
  const trashRoot = join(root, 'trash');
  await Promise.all([
    mkdir(bundledRoot, { recursive: true }),
    mkdir(installRoot, { recursive: true }),
    mkdir(trashRoot, { recursive: true }),
  ]);
  const trashItem = vi.fn(async (absolutePath: string) => {
    await rename(absolutePath, join(trashRoot, `removed-${Date.now()}`));
  });
  try {
    await run({
      root,
      bundledRoot,
      bundledPluginRoots: [],
      installRoot,
      pluginStates: new MemoryPluginStateRepository(),
      trashItem,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function localState(pluginId: string): PluginStateRecord {
  return {
    pluginId,
    deliverySource: 'local',
    relativeInstallLocator: pluginId,
    installState: 'installed',
    enabled: false,
    configurationReference: null,
  };
}

async function writePlugin(
  root: string,
  manifest: Readonly<Record<string, unknown>>,
): Promise<void> {
  await mkdir(root, { recursive: true });
  await writeFile(join(root, 'plugin.json'), JSON.stringify(manifest));
}

class MemoryPluginStateRepository implements PluginStateRepository {
  private readonly records = new Map<string, PluginStateRecord>();

  async get(pluginId: string): Promise<PluginStateRecord | null> {
    return this.records.get(pluginId) ?? null;
  }

  async list() {
    return {
      records: [...this.records.values()].sort((a, b) => a.pluginId.localeCompare(b.pluginId)),
      diagnostics: [],
    };
  }

  async put(record: PluginStateRecord): Promise<void> {
    this.records.set(record.pluginId, { ...record });
  }

  async setEnabled(pluginId: string, enabled: boolean): Promise<void> {
    const record = this.require(pluginId);
    this.records.set(pluginId, { ...record, enabled });
  }

  async setInstallState(
    pluginId: string,
    installState: PluginStateRecord['installState'],
  ): Promise<void> {
    const record = this.require(pluginId);
    this.records.set(pluginId, { ...record, installState });
  }

  async remove(pluginId: string): Promise<boolean> {
    return this.records.delete(pluginId);
  }

  private require(pluginId: string): PluginStateRecord {
    const record = this.records.get(pluginId);
    if (!record) throw new Error(`Missing Plugin state '${pluginId}'.`);
    return record;
  }
}
