import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  createAgentExtensionManager,
  createAgentExtensionMutationOwnership,
  createOpenNekoExtensionRepository,
  type AgentExtensionArtifactHostPort,
  type AgentExtensionArtifactStageReceipt,
  type AgentExtensionCandidateQualificationPort,
  type AgentExtensionReviewedArtifact,
  type AgentExtensionSupportPort,
} from './extension-manager';
import { calculateExtensionPackageTreeSha256 } from './extension-package-integrity';

describe('Desktop extension manager', () => {
  it('checks Agent turn and exact Automation session ownership without affecting siblings', async () => {
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
    await expect(
      ownership.assertIdle({ ...input, pluginId: 'sibling@openneko' }),
    ).resolves.toBeUndefined();
  });

  it('projects explicit enablement and exact reviewed update state without execution fields', async () => {
    await withRepository(async (fixture) => {
      const installedRoot = join(fixture.installRoot, 'computer-use');
      const availableRoot = join(fixture.marketplaceRoot, 'plugins', 'computer-use');
      await writePlugin(installedRoot, {
        name: 'computer-use',
        version: '0.1.0',
        permissions: ['screen-recording', 'accessibility'],
        mcpServers: './.mcp.json',
        mcpToolExposure: 'adapter-only',
        skills: './skills',
        interface: {
          displayName: 'Computer Use',
          shortDescription: 'Control desktop apps',
          localization: {
            'zh-cn': { shortDescription: '控制桌面应用' },
          },
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
      await writeInstalledArtifactState(fixture, 'computer-use', '0.1.0');
      await writePlugin(availableRoot, {
        name: 'computer-use',
        version: '0.2.4',
        skills: './skills',
        interface: { displayName: 'Computer Use' },
      });
      await mkdir(join(availableRoot, 'skills'), { recursive: true });
      const computerUseDefinition = {
        name: 'computer-use',
        version: '0.2.4',
        path: 'plugins/computer-use',
        updatesFrom: ['0.1.0'],
      };
      await writeMarketplace(fixture.marketplaceRoot, [computerUseDefinition]);

      const manager = createManager(fixture);
      const snapshot = await manager.readCatalog();

      expect(snapshot.records).toEqual([
        expect.objectContaining({
          id: 'computer-use@openneko',
          marketplace: 'openneko',
          installed: true,
          enabled: false,
          canUpdate: true,
          updatePackageRelease: '0.2.4',
          canEnable: true,
          canRemove: true,
          agentStatus: 'disabled',
          runtimeDiagnosticCode: '',
          declaredPermissions: ['accessibility', 'screen-recording'],
          acceptedPermissions: [],
          localization: {
            'zh-cn': { description: '控制桌面应用' },
          },
          mcpServerIds: ['computer-use'],
          hasSkills: true,
        }),
      ]);
      expect(snapshot.runtimeDescriptors).toEqual([]);
      await writeMarketplace(fixture.marketplaceRoot, [
        { ...computerUseDefinition, updatesFrom: ['0.0.9'] },
      ]);
      await expect(manager.readCatalog()).resolves.toMatchObject({
        records: [
          expect.objectContaining({
            id: 'computer-use@openneko',
            canUpdate: false,
            updatePackageRelease: '',
          }),
        ],
        diagnostics: [],
      });
      await writeMarketplace(fixture.marketplaceRoot, [computerUseDefinition]);
      const candidateManifestPath = join(availableRoot, '.openneko-plugin', 'plugin.json');
      await writeFile(
        candidateManifestPath,
        (await readFile(candidateManifestPath, 'utf8')).replace(
          '"name":"computer-use"',
          '"name":"wrong-name"',
        ),
        'utf8',
      );
      await expect(manager.readCatalog()).resolves.toMatchObject({
        records: [
          expect.objectContaining({
            id: 'computer-use@openneko',
            installed: true,
            canUpdate: false,
            updatePackageRelease: '',
          }),
        ],
        runtimeDescriptors: [],
        diagnostics: [{ code: 'manifest_invalid', count: 1 }],
      });
      const enabled = await manager.enablePlugin('computer-use@openneko');
      expect(enabled.runtimeDescriptors).toEqual([
        expect.objectContaining({
          pluginId: 'computer-use@openneko',
          mcpServerIds: ['computer-use'],
          mcpToolExposure: 'adapter-only',
        }),
      ]);
      const serialized = JSON.stringify(snapshot.records);
      expect(serialized).not.toContain(fixture.root);
      expect(serialized).not.toContain('private-launcher');
      expect(serialized).not.toContain('PRIVATE_TOKEN');

      manager.setRuntimeReadiness(
        enabled,
        new Map([
          [
            'computer-use@openneko',
            {
              status: 'ready',
              diagnosticCode: '',
              dependencyStatus: 'ready',
              hostPermissionStatus: 'granted',
              qualificationStatus: 'qualified',
            },
          ],
        ]),
      );
      await expect(manager.readCatalog()).resolves.toMatchObject({
        records: [
          expect.objectContaining({
            id: 'computer-use@openneko',
            agentStatus: 'ready',
          }),
        ],
      });
    });
  });

  it('isolates invalid localized interface metadata to its plugin manifest', async () => {
    await withRepository(async (fixture) => {
      const validRoot = join(fixture.marketplaceRoot, 'plugins', 'valid');
      const invalidRoot = join(fixture.marketplaceRoot, 'plugins', 'invalid');
      await writePlugin(validRoot, {
        name: 'valid',
        version: '1.0.0',
        skills: './skills',
        interface: {
          shortDescription: 'Valid description',
          localization: { 'zh-cn': { shortDescription: '有效介绍' } },
        },
      });
      await writePlugin(invalidRoot, {
        name: 'invalid',
        version: '1.0.0',
        skills: './skills',
        interface: {
          shortDescription: 'Invalid description',
          localization: { zh_CN: { shortDescription: '无效介绍' } },
        },
      });
      await Promise.all([
        mkdir(join(validRoot, 'skills'), { recursive: true }),
        mkdir(join(invalidRoot, 'skills'), { recursive: true }),
      ]);
      await writeMarketplace(fixture.marketplaceRoot, [
        { name: 'valid', version: '1.0.0', path: 'plugins/valid' },
        { name: 'invalid', version: '1.0.0', path: 'plugins/invalid' },
      ]);

      await expect(createManager(fixture).readCatalog()).resolves.toMatchObject({
        records: [
          expect.objectContaining({
            id: 'valid@openneko',
            localization: { 'zh-cn': { description: '有效介绍' } },
          }),
        ],
        diagnostics: [{ code: 'manifest_invalid', count: 1 }],
      });
    });
  });

  it('serializes install and recoverable removal for OpenNeko packages', async () => {
    await withRepository(async (fixture) => {
      const sourceRoot = join(fixture.marketplaceRoot, 'plugins', 'sample');
      const artifactRoot = join(fixture.artifactRoot, 'sample');
      await writePlugin(sourceRoot, {
        name: 'sample',
        version: '1.0.0',
        skills: './skills',
      });
      await mkdir(join(sourceRoot, 'skills'), { recursive: true });
      await cp(sourceRoot, artifactRoot, { recursive: true, errorOnExist: true });
      await writeFile(join(artifactRoot, 'artifact-only.txt'), 'reviewed artifact', 'utf8');
      await writeMarketplace(fixture.marketplaceRoot, [
        { name: 'sample', version: '1.0.0', path: 'plugins/sample' },
      ]);
      const manager = createManager(fixture);

      await expect(manager.installPlugin('sample@openai-bundled')).rejects.toThrow(
        'OpenNeko plugin id is invalid',
      );

      const installed = await manager.installPlugin('sample@openneko');
      expect(installed.records).toEqual([
        expect.objectContaining({
          id: 'sample@openneko',
          installed: true,
          enabled: false,
          canEnable: true,
          canRemove: true,
          agentStatus: 'disabled',
        }),
      ]);
      await expect(
        readFile(join(fixture.installRoot, 'sample', 'artifact-only.txt'), 'utf8'),
      ).resolves.toBe('reviewed artifact');
      expect(fixture.artifactHost.stage).toHaveBeenCalledOnce();

      const enabled = await manager.enablePlugin('sample@openneko');
      expect(enabled.records[0]).toMatchObject({
        enabled: true,
        canDisable: true,
        canRemove: false,
      });
      await expect(manager.removePlugin('sample@openneko')).rejects.toThrow(
        'does not allow this operation',
      );
      const disabled = await manager.disablePlugin('sample@openneko');
      expect(disabled.records[0]).toMatchObject({ enabled: false, canRemove: true });

      const removed = await manager.removePlugin('sample@openneko');
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

      const receiptMismatches = [
        { sha256: `sha256:${'f'.repeat(64)}` },
        { signatureVerified: false },
        {
          provenance: {
            ...reviewedArtifact().provenance,
            sourceCommit: 'e'.repeat(40),
          },
        },
        {
          licenseInventory: {
            ...reviewedArtifact().licenseInventory,
            sha256: `sha256:${'f'.repeat(64)}`,
          },
        },
      ] satisfies readonly Partial<AgentExtensionArtifactStageReceipt>[];
      for (const receiptPatch of receiptMismatches) {
        Object.assign(fixture.receiptPatch, receiptPatch);
        await expect(manager.installPlugin('sample@openneko')).rejects.toThrow(
          'artifact receipt is invalid',
        );
        await expect(realpath(join(fixture.installRoot, 'sample'))).rejects.toThrow();
        for (const key of Object.keys(receiptPatch)) {
          Reflect.deleteProperty(fixture.receiptPatch, key);
        }
      }
      expect(fixture.artifactHost.commit).toHaveBeenCalledOnce();
      expect(fixture.artifactHost.discard).toHaveBeenCalledTimes(receiptMismatches.length);
    });
  });

  it('owns artifact progress outside the caller and cancels the exact operation', async () => {
    await withRepository(async (fixture) => {
      const sourceRoot = join(fixture.marketplaceRoot, 'plugins', 'sample');
      await writePlugin(sourceRoot, { name: 'sample', version: '1.0.0' });
      await writeMarketplace(fixture.marketplaceRoot, [
        { name: 'sample', version: '1.0.0', path: 'plugins/sample' },
      ]);
      fixture.artifactHost.stage.mockImplementationOnce(async (input) => {
        input.reportProgress(41);
        await new Promise<void>((_resolve, reject) => {
          input.signal.addEventListener(
            'abort',
            () => {
              const error = new Error('Fixture download cancelled.');
              error.name = 'AbortError';
              reject(error);
            },
            { once: true },
          );
        });
        throw new Error('Fixture download unexpectedly continued.');
      });
      const manager = createManager(fixture);

      const installing = manager.installPlugin('sample@openneko');
      await vi.waitFor(() => {
        expect(manager.readArtifactOperations()).toEqual([
          expect.objectContaining({
            pluginId: 'sample@openneko',
            kind: 'install',
            phase: 'downloading',
            status: 'active',
            transferredBytes: 41,
            totalBytes: 123,
            canCancel: true,
          }),
        ]);
      });
      const operation = manager.readArtifactOperations()[0];
      if (!operation) throw new Error('Expected an active artifact operation.');
      manager.cancelArtifactOperation(operation.operationId);

      await expect(installing).rejects.toMatchObject({ name: 'AbortError' });
      expect(manager.readArtifactOperations()).toEqual([
        expect.objectContaining({
          operationId: operation.operationId,
          status: 'cancelled',
          phase: 'cancelling',
          canCancel: false,
          diagnosticCode: 'cancelled',
        }),
      ]);
      expect(fixture.artifactHost.discard).toHaveBeenCalledWith(operation.operationId);
      await expect(manager.readCatalog()).resolves.toMatchObject({
        records: [expect.objectContaining({ id: 'sample@openneko', installed: false })],
      });
    });
  });

  it('removes only stale operation staging during repository restart initialization', async () => {
    await withRepository(async (fixture) => {
      const staleStaging = join(
        fixture.installRoot,
        '.artifact-2dfc4cf2-f30e-4dde-a127-0dd4d9758c9a',
      );
      const installedRoot = join(fixture.installRoot, 'sibling');
      await mkdir(staleStaging, { recursive: true });
      await writePlugin(installedRoot, { name: 'sibling', version: '1.0.0' });
      await writeInstalledArtifactState(fixture, 'sibling', '1.0.0');
      await writeMarketplace(fixture.marketplaceRoot, []);

      await expect(createManager(fixture).readCatalog()).resolves.toMatchObject({
        records: [expect.objectContaining({ id: 'sibling@openneko', installed: true })],
      });
      await expect(realpath(staleStaging)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(realpath(installedRoot)).resolves.toEqual(expect.stringContaining('/sibling'));
    });
  });

  it('stages an update, rechecks exact idle ownership, atomically replaces runtime, and revokes expanded permissions', async () => {
    await withRepository(async (fixture) => {
      const installedRoot = join(fixture.installRoot, 'sample');
      const marketplaceRoot = join(fixture.marketplaceRoot, 'plugins', 'sample');
      const artifactRoot = join(fixture.artifactRoot, 'sample');
      await writePlugin(installedRoot, {
        name: 'sample',
        version: '1.0.0',
        permissions: ['observe'],
        skills: './skills',
      });
      await mkdir(join(installedRoot, 'skills'), { recursive: true });
      await writeFile(join(installedRoot, 'runtime-marker.txt'), 'old', 'utf8');
      await writeInstalledArtifactState(fixture, 'sample', '1.0.0');
      await writePlugin(marketplaceRoot, {
        name: 'sample',
        version: '2.0.0',
        permissions: ['observe', 'interact'],
        skills: './skills',
      });
      await mkdir(join(marketplaceRoot, 'skills'), { recursive: true });
      await cp(marketplaceRoot, artifactRoot, { recursive: true, errorOnExist: true });
      await writeFile(join(artifactRoot, 'runtime-marker.txt'), 'new', 'utf8');
      await writeMarketplace(fixture.marketplaceRoot, [
        {
          name: 'sample',
          version: '2.0.0',
          path: 'plugins/sample',
          updatesFrom: ['1.0.0'],
        },
      ]);
      const lifecycle: string[] = [];
      const ownership = {
        assertIdle: vi.fn(async () => {
          lifecycle.push('assert-idle');
        }),
      };
      const qualificationClose = vi.fn(async () => {
        lifecycle.push('candidate-close');
      });
      const cancellationClose = vi.fn(async () => undefined);
      const candidateQualification: AgentExtensionCandidateQualificationPort = {
        qualify: vi
          .fn<AgentExtensionCandidateQualificationPort['qualify']>()
          .mockRejectedValueOnce(new Error('Candidate qualification failed.'))
          .mockResolvedValueOnce({
            close: vi.fn(async () => {
              throw new Error('Candidate process did not close.');
            }),
          })
          .mockImplementationOnce(
            ({ signal }) =>
              new Promise((resolve) => {
                signal.addEventListener('abort', () => resolve({ close: cancellationClose }), {
                  once: true,
                });
              }),
          )
          .mockImplementationOnce(async () => {
            lifecycle.push('candidate-qualify');
            return { close: qualificationClose };
          }),
      };
      const commit = fixture.artifactHost.commit.getMockImplementation();
      if (!commit) throw new Error('Expected the fixture artifact commit implementation.');
      fixture.artifactHost.commit.mockImplementation(async (input) => {
        lifecycle.push('commit');
        await commit(input);
      });
      const manager = createManager(
        fixture,
        createAgentSupport(),
        ownership,
        candidateQualification,
      );
      await manager.enablePlugin('sample@openneko');
      await manager.disablePlugin('sample@openneko');
      ownership.assertIdle.mockClear();
      lifecycle.length = 0;

      await expect(manager.updatePlugin('sample@openneko')).rejects.toThrow(
        'Candidate qualification failed',
      );
      await expect(manager.updatePlugin('sample@openneko')).rejects.toThrow(
        'Candidate process did not close',
      );
      const cancelling = manager.updatePlugin('sample@openneko');
      await vi.waitFor(() => expect(candidateQualification.qualify).toHaveBeenCalledTimes(3));
      const cancellingOperation = manager.readArtifactOperations()[0];
      if (!cancellingOperation) throw new Error('Expected an active update operation.');
      manager.cancelArtifactOperation(cancellingOperation.operationId);
      await expect(cancelling).rejects.toMatchObject({ name: 'AbortError' });
      expect(cancellationClose).toHaveBeenCalledOnce();
      expect(fixture.artifactHost.commit).not.toHaveBeenCalled();
      expect(fixture.artifactHost.discard).toHaveBeenCalledTimes(3);
      await expect(readFile(join(installedRoot, 'runtime-marker.txt'), 'utf8')).resolves.toBe(
        'old',
      );

      ownership.assertIdle.mockClear();
      lifecycle.length = 0;

      const updated = await manager.updatePlugin('sample@openneko');

      expect(updated.records).toEqual([
        expect.objectContaining({
          id: 'sample@openneko',
          version: '2.0.0',
          installed: true,
          enabled: false,
          canUpdate: false,
          acceptedPermissions: [],
          declaredPermissions: ['interact', 'observe'],
          enableGrantStatus: 'required',
        }),
      ]);
      expect(ownership.assertIdle).toHaveBeenCalledTimes(2);
      const ownershipCalls = ownership.assertIdle.mock.calls.map(([input]) => input);
      expect(ownershipCalls).toEqual([
        expect.objectContaining({ mutation: 'update' }),
        expect.objectContaining({ mutation: 'update' }),
      ]);
      const updateOperationId = ownershipCalls[0]?.operationId;
      if (!updateOperationId) throw new Error('Expected update operation ownership.');
      expect(updateOperationId).toBe(ownershipCalls[1]?.operationId);
      expect(candidateQualification.qualify).toHaveBeenLastCalledWith({
        operationId: updateOperationId,
        descriptor: expect.objectContaining({
          pluginId: 'sample@openneko',
          pluginRoot: expect.stringContaining('.artifact-'),
        }),
        signal: expect.any(AbortSignal),
      });
      expect(qualificationClose).toHaveBeenCalledOnce();
      expect(lifecycle).toEqual([
        'assert-idle',
        'candidate-qualify',
        'candidate-close',
        'assert-idle',
        'commit',
      ]);
      await expect(readFile(join(installedRoot, 'runtime-marker.txt'), 'utf8')).resolves.toBe(
        'new',
      );
      await expect(
        readFile(join(fixture.stateRoot, 'sample.install.json'), 'utf8'),
      ).resolves.toContain('"packageRelease":"2.0.0"');
      await expect(readFile(join(fixture.stateRoot, 'sample.json'), 'utf8')).resolves.toBe(
        JSON.stringify({
          pluginId: 'sample@openneko',
          enabled: false,
          acceptedPermissions: [],
        }),
      );
    });
  });

  it('keeps the authoritative runtime unchanged when update commit ownership becomes busy', async () => {
    await withRepository(async (fixture) => {
      const installedRoot = join(fixture.installRoot, 'sample');
      const marketplaceRoot = join(fixture.marketplaceRoot, 'plugins', 'sample');
      const artifactRoot = join(fixture.artifactRoot, 'sample');
      await writePlugin(installedRoot, { name: 'sample', version: '1.0.0' });
      await writeFile(join(installedRoot, 'runtime-marker.txt'), 'old', 'utf8');
      await writeInstalledArtifactState(fixture, 'sample', '1.0.0');
      await writePlugin(marketplaceRoot, { name: 'sample', version: '2.0.0' });
      await cp(marketplaceRoot, artifactRoot, { recursive: true, errorOnExist: true });
      await writeFile(join(artifactRoot, 'runtime-marker.txt'), 'new', 'utf8');
      await writeMarketplace(fixture.marketplaceRoot, [
        {
          name: 'sample',
          version: '2.0.0',
          path: 'plugins/sample',
          updatesFrom: ['1.0.0'],
        },
      ]);
      const ownership = {
        assertIdle: vi
          .fn(async () => undefined)
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(new Error('Agent runtime became busy.')),
      };
      const manager = createManager(fixture, createAgentSupport(), ownership);

      await expect(manager.updatePlugin('sample@openneko')).rejects.toThrow(
        'Agent runtime became busy',
      );
      await expect(readFile(join(installedRoot, 'runtime-marker.txt'), 'utf8')).resolves.toBe(
        'old',
      );
      await expect(
        readFile(join(fixture.stateRoot, 'sample.install.json'), 'utf8'),
      ).resolves.toContain('"packageRelease":"1.0.0"');
      expect(fixture.artifactHost.commit).not.toHaveBeenCalled();
      expect(fixture.artifactHost.discard).toHaveBeenCalledOnce();

      ownership.assertIdle.mockReset().mockResolvedValue(undefined);
      fixture.artifactHost.commit.mockRejectedValueOnce(new Error('Atomic commit failed.'));
      await expect(manager.updatePlugin('sample@openneko')).rejects.toThrow('Atomic commit failed');
      await expect(readFile(join(installedRoot, 'runtime-marker.txt'), 'utf8')).resolves.toBe(
        'old',
      );
      await expect(
        readFile(join(fixture.stateRoot, 'sample.install.json'), 'utf8'),
      ).resolves.toContain('"packageRelease":"1.0.0"');
    });
  });

  it('gates runtime mutations with exact operation ownership and keeps siblings available', async () => {
    await withRepository(async (fixture) => {
      for (const name of ['blocked', 'sibling']) {
        const installedRoot = join(fixture.installRoot, name);
        await writePlugin(installedRoot, {
          name,
          version: '1.0.0',
          skills: './skills',
        });
        await mkdir(join(installedRoot, 'skills'), { recursive: true });
        await writeInstalledArtifactState(fixture, name, '1.0.0');
      }
      await writeMarketplace(fixture.marketplaceRoot, []);
      const operations: Array<{
        readonly operationId: string;
        readonly pluginId: string;
        readonly mutation: 'enable' | 'disable' | 'remove';
      }> = [];
      const manager = createManager(fixture, createAgentSupport(), {
        assertIdle: vi.fn(async (input) => {
          operations.push(input);
          if (input.pluginId === 'blocked@openneko') {
            throw new Error(
              `OpenNeko extension '${input.pluginId}' cannot ${input.mutation} while its runtime is owned.`,
            );
          }
        }),
      });

      await expect(manager.enablePlugin('blocked@openneko')).rejects.toThrow(
        "extension 'blocked@openneko' cannot enable",
      );
      const enabled = await manager.enablePlugin('sibling@openneko');
      expect(enabled.records).toEqual([
        expect.objectContaining({ id: 'blocked@openneko', enabled: false }),
        expect.objectContaining({ id: 'sibling@openneko', enabled: true }),
      ]);
      expect(enabled.runtimeDescriptors).toEqual([
        expect.objectContaining({ pluginId: 'sibling@openneko' }),
      ]);
      await manager.disablePlugin('sibling@openneko');
      await manager.removePlugin('sibling@openneko');

      expect(operations.map((operation) => operation.mutation)).toEqual([
        'enable',
        'enable',
        'disable',
        'remove',
      ]);
      expect(new Set(operations.map((operation) => operation.operationId))).toHaveProperty(
        'size',
        operations.length,
      );
      expect(operations.every((operation) => /^[0-9a-f-]{36}$/u.test(operation.operationId))).toBe(
        true,
      );
      await expect(manager.readCatalog()).resolves.toMatchObject({
        records: [expect.objectContaining({ id: 'blocked@openneko', installed: true })],
      });
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

  it('lists reviewed first-party automation extensions without allowing an unavailable artifact install', async () => {
    await withRepository(async (fixture) => {
      const sourceRoot = join(fixture.marketplaceRoot, 'plugins', 'browser-use');
      await writePlugin(sourceRoot, {
        name: 'browser-use',
        version: '0.13.7',
        permissions: ['browser-observe'],
        mcpServers: './.mcp.json',
        mcpToolExposure: 'adapter-only',
        interface: { displayName: 'Browser Use' },
      });
      await writeFile(
        join(sourceRoot, '.mcp.json'),
        JSON.stringify({
          mcpServers: {
            'browser-use': { command: './runtime/bin/browser-use', args: ['--mcp'] },
          },
        }),
        'utf8',
      );
      const browserUseDefinition = {
        name: 'browser-use',
        version: '0.13.7',
        path: 'plugins/browser-use',
        availability: 'unavailable' as const,
      };
      await writeMarketplace(fixture.marketplaceRoot, [browserUseDefinition]);

      const manager = createManager(fixture);
      await expect(manager.readCatalog()).resolves.toMatchObject({
        records: [
          {
            id: 'browser-use@openneko',
            installed: false,
            canInstall: false,
            agentStatus: 'unsupported',
            runtimeDiagnosticCode: 'artifact-unavailable',
          },
        ],
        runtimeDescriptors: [],
      });
      await expect(manager.installPlugin('browser-use@openneko')).rejects.toThrow(
        'does not allow this operation',
      );
      await expect(manager.refreshMarketplaces()).resolves.toMatchObject({
        records: [
          expect.objectContaining({
            id: 'browser-use@openneko',
            artifactStatus: 'unavailable',
          }),
        ],
      });
      expect(fixture.artifactHost.stage).not.toHaveBeenCalled();

      await writeMarketplace(fixture.marketplaceRoot, [
        {
          ...browserUseDefinition,
          artifacts: [
            {
              ...reviewedArtifact(),
              url: 'https://unreviewed.example/extensions/fixture.tar.gz',
            },
          ],
        },
      ]);
      await expect(manager.readCatalog()).resolves.toMatchObject({
        records: [],
        diagnostics: [{ code: 'repository_invalid', count: 1 }],
      });
      expect(fixture.artifactHost.stage).not.toHaveBeenCalled();
    });
  });

  it('rejects an unknown artifact platform before staging', async () => {
    await withRepository(async (fixture) => {
      const sourceRoot = join(fixture.marketplaceRoot, 'plugins', 'unknown-platform');
      await writePlugin(sourceRoot, {
        name: 'unknown-platform',
        version: '1.0.0',
        interface: { displayName: 'Unknown platform' },
      });
      await writeFile(
        join(fixture.marketplaceRoot, 'marketplace.json'),
        JSON.stringify({
          publisher: 'OpenNeko',
          plugins: [
            {
              name: 'unknown-platform',
              version: '1.0.0',
              path: 'plugins/unknown-platform',
              artifacts: [
                {
                  ...reviewedArtifact(),
                  platform: { os: 'linux', arch: 'riscv64' },
                },
              ],
            },
          ],
        }),
        'utf8',
      );

      await expect(createManager(fixture).readCatalog()).resolves.toMatchObject({
        records: [],
        runtimeDescriptors: [],
        diagnostics: [{ code: 'repository_invalid', count: 1 }],
      });
      expect(fixture.artifactHost.stage).not.toHaveBeenCalled();
    });
  });

  it('keeps managed delivery sources explicit and rejects a GitHub source on a non-GitHub origin', async () => {
    await withRepository(async (fixture) => {
      const sourceRoot = join(fixture.marketplaceRoot, 'plugins', 'browser-use');
      await writePlugin(sourceRoot, {
        name: 'browser-use',
        version: '0.13.7',
        interface: { displayName: 'Browser Use' },
      });
      await writeMarketplace(fixture.marketplaceRoot, [
        { name: 'browser-use', version: '0.13.7', path: 'plugins/browser-use' },
      ]);

      await expect(createManager(fixture).readCatalog()).resolves.toMatchObject({
        records: [
          expect.objectContaining({
            id: 'browser-use@openneko',
            deliverySource: 'official-download',
            canInstall: true,
          }),
        ],
      });

      await writeMarketplace(fixture.marketplaceRoot, [
        {
          name: 'browser-use',
          version: '0.13.7',
          path: 'plugins/browser-use',
          artifacts: [{ ...reviewedArtifact(), deliverySource: 'github-release' }],
        },
      ]);
      await expect(createManager(fixture).readCatalog()).resolves.toMatchObject({
        records: [],
        diagnostics: [{ code: 'repository_invalid', count: 1 }],
      });
      expect(fixture.artifactHost.stage).not.toHaveBeenCalled();
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

  it('keeps invalid installed records visible and returns grouped safe diagnostics', async () => {
    await withRepository(async (fixture) => {
      const installedRoot = join(fixture.installRoot, 'first');
      const availableRoot = join(fixture.marketplaceRoot, 'plugins', 'second');
      await writePlugin(installedRoot, { name: 'wrong-name', version: '1.0.0' });
      await writeInstalledArtifactState(fixture, 'first', '1.0.0');
      await writePlugin(availableRoot, { name: 'also-wrong', version: '1.0.0' });
      await writeMarketplace(fixture.marketplaceRoot, [
        { name: 'second', version: '1.0.0', path: 'plugins/second' },
      ]);

      await expect(createManager(fixture).readCatalog()).resolves.toMatchObject({
        records: [
          expect.objectContaining({
            id: 'first@openneko',
            installed: true,
            enabled: false,
            canEnable: false,
            agentStatus: 'error',
            runtimeDiagnosticCode: 'manifest-invalid',
          }),
        ],
        diagnostics: [{ code: 'manifest_invalid', count: 2 }],
      });
    });
  });

  it('keeps exact installed artifact authority separate from enable grants', async () => {
    await withRepository(async (fixture) => {
      const installedRoot = join(fixture.installRoot, 'browser-use');
      await writePlugin(installedRoot, {
        name: 'browser-use',
        version: '0.13.7',
        permissions: ['browser-observe'],
        skills: './skills',
      });
      await mkdir(join(installedRoot, 'skills'), { recursive: true });
      await writeInstalledArtifactState(fixture, 'browser-use', '0.13.7');
      await writeMarketplace(fixture.marketplaceRoot, []);
      const manager = createManager(fixture);

      const disabled = await manager.readCatalog();
      expect(disabled.records[0]).toMatchObject({
        installed: true,
        enabled: false,
        artifactPlatform: 'darwin-arm64',
        downloadSizeBytes: 123,
        artifactStatus: 'installed',
        enableGrantStatus: 'required',
      });
      await manager.enablePlugin('browser-use@openneko');
      const installStatePath = join(fixture.stateRoot, 'browser-use.install.json');
      const installState = JSON.parse(await readFile(installStatePath, 'utf8')) as Record<
        string,
        unknown
      >;
      await writeFile(
        installStatePath,
        JSON.stringify({ ...installState, sha256: 'corrupted' }),
        'utf8',
      );

      await expect(manager.readCatalog()).resolves.toMatchObject({
        records: [
          expect.objectContaining({
            id: 'browser-use@openneko',
            installed: true,
            enabled: true,
            artifactStatus: 'invalid',
            agentStatus: 'error',
            runtimeDiagnosticCode: 'state-invalid',
          }),
        ],
        runtimeDescriptors: [],
        diagnostics: [{ code: 'state_invalid', count: 1 }],
      });
    });
  });

  it('recovers the exact enable grant after restart while requiring fresh readiness facts', async () => {
    await withRepository(async (fixture) => {
      const installedRoot = join(fixture.installRoot, 'browser-use');
      await writePlugin(installedRoot, {
        name: 'browser-use',
        version: '0.13.7',
        permissions: ['browser-observe'],
        skills: './skills',
      });
      await mkdir(join(installedRoot, 'skills'), { recursive: true });
      await writeInstalledArtifactState(fixture, 'browser-use', '0.13.7');
      await writeMarketplace(fixture.marketplaceRoot, []);

      await createManager(fixture).enablePlugin('browser-use@openneko');
      const restartedManager = createManager(fixture);
      const restarted = await restartedManager.readCatalog();
      expect(restarted).toMatchObject({
        records: [
          expect.objectContaining({
            id: 'browser-use@openneko',
            enabled: true,
            artifactStatus: 'installed',
            enableGrantStatus: 'accepted',
            dependencyStatus: 'unchecked',
            acceptedPermissions: ['browser-observe'],
            agentStatus: 'error',
            runtimeDiagnosticCode: 'runtime-not-composed',
          }),
        ],
        runtimeDescriptors: [expect.objectContaining({ pluginId: 'browser-use@openneko' })],
      });
      restartedManager.setRuntimeReadiness(
        restarted,
        new Map([
          [
            'browser-use@openneko',
            {
              status: 'ready',
              diagnosticCode: '',
              dependencyStatus: 'ready',
              hostPermissionStatus: 'not-applicable',
              qualificationStatus: 'qualified',
            },
          ],
        ]),
      );
      await expect(restartedManager.readCatalog()).resolves.toMatchObject({
        records: [expect.objectContaining({ agentStatus: 'ready' })],
      });

      await restartedManager.disablePlugin('browser-use@openneko');
      await expect(createManager(fixture).readCatalog()).resolves.toMatchObject({
        records: [
          expect.objectContaining({
            id: 'browser-use@openneko',
            enabled: false,
            enableGrantStatus: 'accepted',
            acceptedPermissions: ['browser-observe'],
            agentStatus: 'disabled',
          }),
        ],
        runtimeDescriptors: [],
      });

      await writeFile(
        join(fixture.stateRoot, 'browser-use.json'),
        JSON.stringify({
          pluginId: 'browser-use@openneko',
          acceptedPermissions: [],
        }),
        'utf8',
      );
      await expect(createManager(fixture).readCatalog()).resolves.toMatchObject({
        records: [
          expect.objectContaining({
            id: 'browser-use@openneko',
            installed: true,
            enabled: false,
            artifactStatus: 'installed',
            enableGrantStatus: 'required',
            acceptedPermissions: [],
            agentStatus: 'error',
            runtimeDiagnosticCode: 'state-invalid',
          }),
        ],
        runtimeDescriptors: [],
        diagnostics: [{ code: 'state_invalid', count: 1 }],
      });

      await writeFile(
        join(fixture.stateRoot, 'browser-use.json'),
        JSON.stringify({
          pluginId: 'browser-use@openneko',
          enabled: false,
          acceptedPermissions: ['browser-interact'],
        }),
        'utf8',
      );
      await expect(createManager(fixture).readCatalog()).resolves.toMatchObject({
        records: [
          expect.objectContaining({
            id: 'browser-use@openneko',
            enabled: false,
            acceptedPermissions: [],
            agentStatus: 'error',
            runtimeDiagnosticCode: 'state-invalid',
          }),
        ],
        runtimeDescriptors: [],
        diagnostics: [{ code: 'state_invalid', count: 1 }],
      });
    });
  });

  it('blocks a tampered installed tree after restart without affecting a valid sibling', async () => {
    await withRepository(async (fixture) => {
      for (const name of ['browser-use', 'sibling']) {
        const installedRoot = join(fixture.installRoot, name);
        await writePlugin(installedRoot, {
          name,
          version: '1.2.3',
          skills: './skills',
        });
        await mkdir(join(installedRoot, 'skills'), { recursive: true });
        await writeFile(join(installedRoot, 'runtime.txt'), 'reviewed', 'utf8');
        await writeInstalledArtifactState(fixture, name, '1.2.3');
      }
      await writeMarketplace(fixture.marketplaceRoot, []);
      const manager = createManager(fixture);
      await manager.enablePlugin('browser-use@openneko');
      await manager.enablePlugin('sibling@openneko');

      await writeFile(
        join(fixture.installRoot, 'browser-use', 'runtime.txt'),
        'modified after install',
        'utf8',
      );
      await expect(createManager(fixture).readCatalog()).resolves.toMatchObject({
        records: [
          expect.objectContaining({
            id: 'browser-use@openneko',
            installed: true,
            artifactStatus: 'invalid',
            agentStatus: 'error',
            runtimeDiagnosticCode: 'state-invalid',
          }),
          expect.objectContaining({
            id: 'sibling@openneko',
            installed: true,
            enabled: true,
            artifactStatus: 'installed',
          }),
        ],
        runtimeDescriptors: [expect.objectContaining({ pluginId: 'sibling@openneko' })],
        diagnostics: [{ code: 'state_invalid', count: 1 }],
      });
    });
  });

  it('keeps installed App-only plugins disabled until explicitly enabled', async () => {
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
      await writeInstalledArtifactState(fixture, 'app-only', '1.0.0');
      await writeMarketplace(fixture.marketplaceRoot, []);

      const manager = createManager(fixture);
      const snapshot = await manager.readCatalog();
      expect(snapshot.records[0]).toMatchObject({
        agentStatus: 'disabled',
        runtimeDiagnosticCode: '',
        appIds: ['connector'],
      });
      const enabled = await manager.enablePlugin('app-only@openneko');
      expect(enabled.records[0]).toMatchObject({
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
      await writeInstalledArtifactState(fixture, 'installed-app', '1.0.0');
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

  it('retains the exact accepted grant when an update reduces permissions', async () => {
    await withRepository(async (fixture) => {
      const installedRoot = join(fixture.installRoot, 'sample');
      const marketplaceRoot = join(fixture.marketplaceRoot, 'plugins', 'sample');
      const artifactRoot = join(fixture.artifactRoot, 'sample');
      const externalPackageReleaseField = 'version';
      await writePlugin(installedRoot, {
        name: 'sample',
        [externalPackageReleaseField]: '1.0.0',
        permissions: ['observe', 'interact'],
        skills: './skills',
      });
      await mkdir(join(installedRoot, 'skills'), { recursive: true });
      await writeInstalledArtifactState(fixture, 'sample', '1.0.0');
      await writePlugin(marketplaceRoot, {
        name: 'sample',
        [externalPackageReleaseField]: '2.0.0',
        permissions: ['observe'],
        skills: './skills',
      });
      await mkdir(join(marketplaceRoot, 'skills'), { recursive: true });
      await cp(marketplaceRoot, artifactRoot, { recursive: true, errorOnExist: true });
      await writeMarketplace(fixture.marketplaceRoot, [
        {
          name: 'sample',
          [externalPackageReleaseField]: '2.0.0',
          path: 'plugins/sample',
          updatesFrom: ['1.0.0'],
        },
      ]);
      const manager = createManager(fixture);
      await manager.enablePlugin('sample@openneko');
      await manager.disablePlugin('sample@openneko');

      await expect(manager.updatePlugin('sample@openneko')).resolves.toMatchObject({
        records: [
          expect.objectContaining({
            enabled: false,
            declaredPermissions: ['observe'],
            acceptedPermissions: ['observe'],
            enableGrantStatus: 'accepted',
          }),
        ],
        runtimeDescriptors: [],
      });
      await expect(readFile(join(fixture.stateRoot, 'sample.json'), 'utf8')).resolves.toBe(
        JSON.stringify({
          pluginId: 'sample@openneko',
          enabled: false,
          acceptedPermissions: ['observe'],
        }),
      );
    });
  });
});

function createManager(
  fixture: RepositoryFixture,
  agentSupport: AgentExtensionSupportPort = createAgentSupport(),
  mutationOwnership: Parameters<typeof createAgentExtensionManager>[0]['mutationOwnership'] = {
    assertIdle: vi.fn(async () => undefined),
  },
  candidateQualification: AgentExtensionCandidateQualificationPort = createCandidateQualification(),
) {
  return createAgentExtensionManager({
    repository: createOpenNekoExtensionRepository({
      marketplaceRoot: fixture.marketplaceRoot,
      installRoot: fixture.installRoot,
      stateRoot: fixture.stateRoot,
      trashItem: fixture.trashItem,
      artifactHost: fixture.artifactHost,
      candidateQualification,
    }),
    agentSupport,
    mutationOwnership,
  });
}

function createCandidateQualification(): AgentExtensionCandidateQualificationPort {
  return {
    qualify: vi.fn(async () => ({ close: vi.fn(async () => undefined) })),
  };
}

function createAgentSupport(
  supportedPluginIds: ReadonlySet<string> | 'all' = 'all',
): AgentExtensionSupportPort & {
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
  readonly artifactRoot: string;
  readonly installRoot: string;
  readonly stateRoot: string;
  readonly trashRoot: string;
  readonly trashItem: ReturnType<typeof vi.fn<(absolutePath: string) => Promise<void>>>;
  readonly artifactHost: AgentExtensionArtifactHostPort & {
    readonly stage: ReturnType<typeof vi.fn<AgentExtensionArtifactHostPort['stage']>>;
    readonly commit: ReturnType<typeof vi.fn<AgentExtensionArtifactHostPort['commit']>>;
    readonly discard: ReturnType<typeof vi.fn<AgentExtensionArtifactHostPort['discard']>>;
  };
  readonly receiptPatch: Partial<AgentExtensionArtifactStageReceipt>;
}

async function withRepository(run: (fixture: RepositoryFixture) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'openneko-extension-repository-'));
  const marketplaceRoot = join(root, 'marketplace');
  const artifactRoot = join(root, 'artifacts');
  const installRoot = join(root, 'neko-home', 'extensions', 'plugins');
  const stateRoot = join(root, 'neko-home', 'extensions', 'state');
  const trashRoot = join(root, 'trash');
  await Promise.all([
    mkdir(marketplaceRoot, { recursive: true }),
    mkdir(artifactRoot, { recursive: true }),
    mkdir(installRoot, { recursive: true }),
    mkdir(stateRoot, { recursive: true }),
    mkdir(trashRoot, { recursive: true }),
  ]);
  const trashItem = vi.fn(async (absolutePath: string) => {
    await rename(absolutePath, join(trashRoot, `removed-${Date.now()}`));
  });
  const stagedRoots = new Map<string, string>();
  const receiptPatch: Partial<AgentExtensionArtifactStageReceipt> = {};
  const artifactHost: RepositoryFixture['artifactHost'] = {
    available: true,
    platform: { os: 'darwin', arch: 'arm64' },
    stage: vi.fn(async (input) => {
      const pluginName = input.pluginId.replace(/@openneko$/, '');
      await cp(join(artifactRoot, pluginName), input.stagingRoot, {
        recursive: true,
        errorOnExist: true,
      });
      stagedRoots.set(input.operationId, input.stagingRoot);
      return {
        operationId: input.operationId,
        pluginId: input.pluginId,
        packageRelease: input.packageRelease,
        artifactUrl: input.artifact.url,
        finalUrl: input.artifact.url,
        stagingRoot: input.stagingRoot,
        sizeBytes: input.artifact.sizeBytes,
        sha256: input.artifact.sha256,
        signatureVerified: true,
        signatureKeyId: input.artifact.signature.keyId,
        provenance: input.artifact.provenance,
        licenseInventory: input.artifact.licenseInventory,
        ...receiptPatch,
      };
    }),
    commit: vi.fn(async (input) => {
      if (stagedRoots.get(input.operationId) !== input.stagingRoot) {
        throw new Error(`Unknown staged artifact operation: ${input.operationId}`);
      }
      await rename(input.stagingRoot, input.targetRoot);
      stagedRoots.delete(input.operationId);
    }),
    discard: vi.fn(async (operationId) => {
      const stagingRoot = stagedRoots.get(operationId);
      if (stagingRoot) {
        await rm(stagingRoot, { recursive: true, force: true });
        stagedRoots.delete(operationId);
      }
    }),
  };
  try {
    await run({
      root,
      marketplaceRoot,
      artifactRoot,
      installRoot,
      stateRoot,
      trashRoot,
      trashItem,
      artifactHost,
      receiptPatch,
    });
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
    readonly availability?: 'installable' | 'unavailable';
    readonly updatesFrom?: readonly string[];
    readonly artifacts?: readonly AgentExtensionReviewedArtifact[];
  }[],
): Promise<void> {
  await writeFile(
    join(marketplaceRoot, 'marketplace.json'),
    JSON.stringify({
      publisher: 'OpenNeko',
      plugins: plugins.map((plugin) => ({
        ...plugin,
        artifacts:
          plugin.artifacts ??
          (plugin.availability === 'unavailable' ? undefined : [reviewedArtifact()]),
      })),
    }),
    'utf8',
  );
}

function reviewedArtifact(): AgentExtensionReviewedArtifact {
  return {
    deliverySource: 'official-download',
    platform: { os: 'darwin', arch: 'arm64' },
    archive: 'tar.gz',
    url: 'https://artifacts.openneko.example/extensions/fixture.tar.gz',
    allowedHosts: ['artifacts.openneko.example'],
    sizeBytes: 123,
    sha256: `sha256:${'a'.repeat(64)}`,
    signature: {
      algorithm: 'ed25519',
      keyId: 'openneko-release',
      value: `${'A'.repeat(86)}==`,
    },
    provenance: {
      sourceRepository: 'https://github.com/openneko/extension-artifacts',
      sourceCommit: 'b'.repeat(40),
      buildRecipeSha256: `sha256:${'d'.repeat(64)}`,
    },
    licenseInventory: {
      path: 'THIRD_PARTY_LICENSES.spdx.json',
      sha256: `sha256:${'c'.repeat(64)}`,
    },
  };
}

async function writePlugin(
  root: string,
  manifest: Readonly<Record<string, unknown>>,
): Promise<void> {
  await mkdir(join(root, '.openneko-plugin'), { recursive: true });
  await writeFile(join(root, '.openneko-plugin', 'plugin.json'), JSON.stringify(manifest), 'utf8');
}

async function writeInstalledArtifactState(
  fixture: RepositoryFixture,
  name: string,
  packageRelease: string,
): Promise<void> {
  const artifact = reviewedArtifact();
  const packageTreeSha256 = await calculateExtensionPackageTreeSha256(
    join(fixture.installRoot, name),
  );
  await writeFile(
    join(fixture.stateRoot, `${name}.install.json`),
    JSON.stringify({
      pluginId: `${name}@openneko`,
      packageRelease,
      deliverySource: artifact.deliverySource,
      platform: artifact.platform,
      archive: artifact.archive,
      artifactUrl: artifact.url,
      finalUrl: artifact.url,
      sizeBytes: artifact.sizeBytes,
      sha256: artifact.sha256,
      packageTreeSha256,
      signatureKeyId: artifact.signature.keyId,
      provenance: artifact.provenance,
      licenseInventory: artifact.licenseInventory,
    }),
    'utf8',
  );
}
