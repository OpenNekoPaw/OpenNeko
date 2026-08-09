import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CANVAS_WORKSPACE_BOARD_PATH, loadNkc } from '@neko/canvas-domain';
import type { NekoHostPorts } from '@neko/host/ports';
import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node';
import { resolveGlobalStorageLayout } from '@neko/local-metadata';
import {
  initializeAgentStateTables,
  initializeCoreLocalMetadataTables,
} from '@neko/local-metadata/sqlite';
import { DesktopWorkspaceBoardDelivery } from './desktop-workspace-board-delivery';

describe('DesktopWorkspaceBoardDelivery', () => {
  let root = '';

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-desktop-board-delivery-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('projects a durable Agent Write output once into the exact Workspace Board', async () => {
    const workspacePath = path.join(root, 'project');
    await fs.mkdir(path.join(workspacePath, 'docs'), { recursive: true });
    await fs.writeFile(path.join(workspacePath, 'docs', 'output.md'), '# Result\n', 'utf8');
    const metadataStore = createNodeSqliteLocalMetadataStore({ homedir: root });
    await metadataStore.open({
      databasePath: resolveGlobalStorageLayout(root).database,
      busyTimeoutMs: 2_000,
    });
    await initializeCoreLocalMetadataTables(metadataStore);
    await initializeAgentStateTables(metadataStore);
    await metadataStore.repositories.workspaces.bind({
      identity: { workspaceId: 'workspace-1' },
      locator: { kind: 'variable', value: '${HOME}/project' },
      seenAt: '2026-08-08T00:00:00.000Z',
    });
    let identity = 0;
    const delivery = new DesktopWorkspaceBoardDelivery({
      applicationInstanceId: 'desktop-instance',
      metadataStore,
      workspaceRegistry: {
        restore: async (workspaceId) => ({
          workspaceId,
          workspacePath,
          displayName: 'Project',
          locator: { kind: 'variable', value: '${HOME}/project' },
        }),
      },
      host: { files: createFilePort() },
      createIdentity: () => `identity-${++identity}`,
    });
    const input = {
      workspaceId: 'workspace-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      runId: 'run-1',
      completedAt: 1_700_000_000_000,
      artifacts: [
        {
          artifactId: 'workspace-file:docs/output.md',
          contentFingerprint: 'workspace-file:docs/output.md',
          role: 'output' as const,
          kind: 'file-reference' as const,
          title: 'output.md',
          sourceId: 'content:docs/output.md',
          contentLocator: { kind: 'workspace-file' as const, path: 'docs/output.md' },
        },
      ],
    };

    await expect(delivery.deliver(input)).resolves.toEqual({ status: 'accepted' });
    await expect(delivery.deliver(input)).resolves.toEqual({ status: 'accepted' });

    const boardSource = await fs.readFile(
      path.join(workspacePath, ...CANVAS_WORKSPACE_BOARD_PATH.split('/')),
      'utf8',
    );
    const board = loadNkc(boardSource);
    expect(board.validation.valid).toBe(true);
    expect(board.data.nodes).toHaveLength(1);
    expect(JSON.stringify(board.data.nodes)).toContain('docs/output.md');
    await metadataStore.dispose();
  });

  it('blocks only the current delivery when the exact Workspace cannot be restored', async () => {
    const metadataStore = createNodeSqliteLocalMetadataStore({ homedir: root });
    await metadataStore.open({
      databasePath: resolveGlobalStorageLayout(root).database,
      busyTimeoutMs: 2_000,
    });
    await initializeCoreLocalMetadataTables(metadataStore);
    await initializeAgentStateTables(metadataStore);
    const diagnostics: string[] = [];
    const delivery = new DesktopWorkspaceBoardDelivery({
      applicationInstanceId: 'desktop-instance',
      metadataStore,
      workspaceRegistry: {
        restore: async () => {
          throw new Error('Workspace is unavailable.');
        },
      },
      host: {
        files: createFilePort(),
        diagnostics: { report: (diagnostic) => diagnostics.push(diagnostic.code) },
      },
    });

    await expect(
      delivery.deliver({
        workspaceId: 'missing-workspace',
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        runId: 'run-1',
        completedAt: Date.now(),
        artifacts: [
          {
            artifactId: 'output-1',
            contentFingerprint: 'output-1',
            role: 'output',
            kind: 'file-reference',
            title: 'Output',
            sourceId: 'output-1',
            contentLocator: { kind: 'workspace-file', path: 'output.txt' },
          },
        ],
      }),
    ).resolves.toMatchObject({
      status: 'blocked',
      diagnostic: { code: 'desktop-workspace-board-delivery-failed' },
    });
    expect(diagnostics).toEqual(['desktop-workspace-board-delivery-failed']);
    await expect(fs.stat(path.join(root, 'neko', 'boards', 'workspace.nkc'))).rejects.toMatchObject(
      {
        code: 'ENOENT',
      },
    );
    await metadataStore.dispose();
  });
});

function createFilePort(): Pick<NekoHostPorts, 'files'>['files'] {
  return {
    readText: (filePath) => fs.readFile(filePath, 'utf8'),
    readBytes: (filePath) => fs.readFile(filePath),
    writeText: (filePath, content) => fs.writeFile(filePath, content, 'utf8'),
    writeBytes: (filePath, content) => fs.writeFile(filePath, content),
    rename: (oldPath, newPath) => fs.rename(oldPath, newPath),
    readDirectory: async (directoryPath) =>
      (await fs.readdir(directoryPath, { withFileTypes: true })).map((entry) => ({
        name: entry.name,
        type: entry.isFile() ? 'file' : entry.isDirectory() ? 'directory' : 'unknown',
      })),
    stat: async (filePath) => {
      const stat = await fs.stat(filePath);
      return {
        type: stat.isFile() ? 'file' : stat.isDirectory() ? 'directory' : 'unknown',
        sizeBytes: stat.size,
        modifiedAtMs: stat.mtimeMs,
        createdAtMs: stat.birthtimeMs,
      };
    },
    createDirectory: (directoryPath) =>
      fs.mkdir(directoryPath, { recursive: true }).then(() => undefined),
    delete: (targetPath, options) =>
      fs.rm(targetPath, {
        recursive: options?.recursive ?? false,
        force: options?.idempotent ?? false,
      }),
  };
}
