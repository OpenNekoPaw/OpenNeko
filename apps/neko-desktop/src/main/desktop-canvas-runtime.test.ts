import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { createCanvasHostIntentRequest, type CanvasHostRuntimeIdentity } from '@neko-canvas/domain';
import { ConsoleLogger } from '@neko/shared/logger';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElectronNekoHostPorts } from './electron-host-ports';
import { DesktopCanvasRuntime } from './desktop-canvas-runtime';
import type { DesktopCanvasViewGrant } from './shell-service';

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('DesktopCanvasRuntime', () => {
  it('projects an authorized ContentLocator through owning Canvas authoring', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-content-'));
    roots.push(workspacePath);
    await writeFixtureFile(workspacePath, 'media/cat.png', 'image');
    const identity = createIdentity();
    const runtime = createRuntime(workspacePath, identity);
    const initial = await runtime.getSnapshot('window-1', identity);

    const result = await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'request-project-content',
        commandId: 'command-project-content',
        expectedRevision: initial.revision,
        identity,
        intent: {
          type: 'project-content',
          locator: { kind: 'workspace-file', path: 'media/cat.png' },
        },
      }),
    );

    expect(result.status).toBe('accepted');
    if (result.status !== 'accepted') throw new Error(result.diagnostic.message);
    expect(result.snapshot.canvas.nodes).toEqual([
      expect.objectContaining({
        type: 'media',
        data: expect.objectContaining({
          assetPath: 'media/cat.png',
          contentLocator: { kind: 'workspace-file', path: 'media/cat.png' },
          mediaType: 'image',
        }),
      }),
    ]);
    expect(result.snapshot.dirty).toBe(true);
    expect(result.snapshot.revision).toBe(initial.revision + 1);
  });

  it('rejects an escaping ContentLocator without mutating the Canvas', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-escape-'));
    roots.push(workspacePath);
    const outsidePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-outside-'));
    roots.push(outsidePath);
    await writeFixtureFile(outsidePath, 'secret.png', 'secret');
    await symlink(outsidePath, path.join(workspacePath, 'escape'));
    const identity = createIdentity();
    const runtime = createRuntime(workspacePath, identity);
    const initial = await runtime.getSnapshot('window-1', identity);

    const result = await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'request-project-escape',
        commandId: 'command-project-escape',
        expectedRevision: initial.revision,
        identity,
        intent: {
          type: 'project-content',
          locator: { kind: 'workspace-file', path: 'escape/secret.png' },
        },
      }),
    );

    expect(result).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'canvas-runtime-effect-failed' },
    });
    expect((await runtime.getSnapshot('window-1', identity)).canvas.nodes).toEqual([]);
  });

  it('resolves an inline preview from the exact Canvas workspace without exposing a path', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-preview-'));
    roots.push(workspacePath);
    await writeFixtureFile(workspacePath, 'media/cat.png', 'image');
    const identity = createIdentity();
    const createPreviewVariant = vi.fn(async () => 'data:image/png;base64,Y2F0');
    const runtime = createRuntime(workspacePath, identity, createPreviewVariant);

    await runtime.getSnapshot('window-1', identity);
    await expect(
      runtime.resolvePreviewVariant('window-1', {
        identity,
        requestId: 'preview-1',
        locator: { kind: 'workspace-file', path: 'media/cat.png' },
        role: 'thumbnail',
        mediaType: 'image',
      }),
    ).resolves.toEqual({
      requestId: 'preview-1',
      url: 'data:image/png;base64,Y2F0',
    });
    expect(createPreviewVariant).toHaveBeenCalledWith({
      absolutePath: await realpath(path.join(workspacePath, 'media/cat.png')),
      mediaType: 'image',
    });

    await expect(
      runtime.resolvePreviewVariant('window-1', {
        identity,
        requestId: 'preview-escape',
        locator: { kind: 'workspace-file', path: '../cat.png' },
        role: 'thumbnail',
      }),
    ).rejects.toThrow('portable workspace-file');
  });

  it('loads one owner-bound Canvas session, applies revisioned edits and atomically saves .nkc', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-runtime-'));
    roots.push(workspacePath);
    const identity: CanvasHostRuntimeIdentity = {
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      windowId: 'window-1',
      viewId: 'canvas:view-1',
      viewEpoch: 1,
      documentId: 'neko/boards/workspace.nkc',
      sessionId: 'canvas-session:canvas:view-1:1',
      endpointEpoch: 'app-1:window-1:1',
    };
    const runtime = new DesktopCanvasRuntime({
      shell: {
        resolveCanvasViewGrant: vi.fn(async (): Promise<DesktopCanvasViewGrant> => ({
          identity,
          workspace: {
            workspaceId: 'workspace-1',
            workspacePath,
            displayName: 'Fixture',
            locator: { kind: 'relative', value: '.' },
          },
        })),
      },
      host: createElectronNekoHostPorts({
        homedir: workspacePath,
        nekoHome: path.join(workspacePath, '.neko-home'),
        workspaceRoot: workspacePath,
        version: 'test',
        logger: new ConsoleLogger('DesktopCanvasRuntimeTest'),
      }),
    });

    const initial = await runtime.getSnapshot('window-1', identity);
    expect(initial.canvas.name).toBe('Fixture Canvas');
    expect(initial.revision).toBe(0);

    const editedCanvas = {
      ...initial.canvas,
      name: 'Saved Canvas',
    };
    const edit = await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'request-edit',
        commandId: 'command-edit',
        expectedRevision: initial.revision,
        identity,
        intent: { type: 'replace-document', canvas: editedCanvas },
      }),
    );
    expect(edit.status).toBe('accepted');
    if (edit.status !== 'accepted') throw new Error(edit.diagnostic.message);

    const save = await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'request-save',
        commandId: 'command-save',
        expectedRevision: edit.snapshot.revision,
        identity,
        intent: { type: 'save' },
      }),
    );
    expect(save.status).toBe('accepted');
    expect(
      JSON.parse(await readFile(path.join(workspacePath, identity.documentId), 'utf8')),
    ).toMatchObject({ name: 'Saved Canvas' });

    runtime.dispose();
    await expect(runtime.getSnapshot('window-1', identity)).rejects.toThrow('disposed');

    const restartedRuntime = createRuntime(workspacePath, identity);
    const restarted = await restartedRuntime.getSnapshot('window-1', identity);
    expect(restarted.canvas.name).toBe('Saved Canvas');
    expect(restarted.canvas.nodes).toEqual([]);
    restartedRuntime.dispose();
  });

  it('isolates two Canvas document sessions in the same Window and releases both on detach', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-multi-'));
    roots.push(workspacePath);
    await writeFixtureFile(
      workspacePath,
      'boards/first.nkc',
      JSON.stringify({
        version: 1,
        name: 'First',
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
        nodes: [],
        connections: [],
      }),
    );
    await writeFixtureFile(
      workspacePath,
      'boards/second.nkc',
      JSON.stringify({
        version: 1,
        name: 'Second',
        viewport: { pan: { x: 20, y: 30 }, zoom: 1.5 },
        nodes: [],
        connections: [],
      }),
    );
    const first = {
      ...createIdentity(),
      viewId: 'canvas:first',
      documentId: 'boards/first.nkc',
      sessionId: 'canvas-session:canvas:first:1',
    };
    const second = {
      ...createIdentity(),
      viewId: 'canvas:second',
      documentId: 'boards/second.nkc',
      sessionId: 'canvas-session:canvas:second:1',
    };
    const runtime = new DesktopCanvasRuntime({
      shell: {
        resolveCanvasViewGrant: vi.fn(
          async (_windowId, requested): Promise<DesktopCanvasViewGrant> => ({
            identity: requested,
            workspace: {
              workspaceId: 'workspace-1',
              workspacePath,
              displayName: 'Fixture',
              locator: { kind: 'relative', value: '.' },
            },
          }),
        ),
      },
      host: createElectronNekoHostPorts({
        homedir: workspacePath,
        nekoHome: path.join(workspacePath, '.neko-home'),
        workspaceRoot: workspacePath,
        version: 'test',
        logger: new ConsoleLogger('DesktopCanvasRuntimeMultiTest'),
      }),
    });

    const firstSnapshot = await runtime.getSnapshot('window-1', first);
    const secondSnapshot = await runtime.getSnapshot('window-1', second);
    expect(firstSnapshot.canvas.name).toBe('First');
    expect(secondSnapshot.canvas.name).toBe('Second');
    const secondPresentation = await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'second-presentation',
        commandId: 'second-presentation',
        expectedRevision: secondSnapshot.revision,
        identity: second,
        intent: {
          type: 'update-presentation',
          presentation: {
            viewport: { pan: { x: 20, y: 30 }, zoom: 1.5 },
            selectedNodeIds: [],
          },
        },
      }),
    );
    expect(secondPresentation.status).toBe('accepted');
    expect((await runtime.getSnapshot('window-1', first)).presentation.viewport).toEqual({
      pan: { x: 0, y: 0 },
      zoom: 1,
    });
    expect((await runtime.getSnapshot('window-1', second)).presentation.viewport).toEqual({
      pan: { x: 20, y: 30 },
      zoom: 1.5,
    });

    const edit = await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'multi-edit',
        commandId: 'multi-edit',
        expectedRevision: firstSnapshot.revision,
        identity: first,
        intent: {
          type: 'replace-document',
          canvas: { ...firstSnapshot.canvas, name: 'First edited' },
        },
      }),
    );
    expect(edit.status).toBe('accepted');
    expect((await runtime.getSnapshot('window-1', second)).canvas.name).toBe('Second');

    runtime.detachWindow('window-1');
    expect((await runtime.getSnapshot('window-1', first)).canvas.name).toBe('First');
  });
});

function createIdentity(): CanvasHostRuntimeIdentity {
  return {
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    windowId: 'window-1',
    viewId: 'canvas:view-1',
    viewEpoch: 1,
    documentId: 'neko/boards/workspace.nkc',
    sessionId: 'canvas-session:canvas:view-1:1',
    endpointEpoch: 'app-1:window-1:1',
  };
}

function createRuntime(
  workspacePath: string,
  identity: CanvasHostRuntimeIdentity,
  createPreviewVariant?: (input: {
    readonly absolutePath: string;
    readonly mediaType?: string;
  }) => Promise<string>,
): DesktopCanvasRuntime {
  return new DesktopCanvasRuntime({
    shell: {
      resolveCanvasViewGrant: vi.fn(async (): Promise<DesktopCanvasViewGrant> => ({
        identity,
        workspace: {
          workspaceId: 'workspace-1',
          workspacePath,
          displayName: 'Fixture',
          locator: { kind: 'relative', value: '.' },
        },
      })),
    },
    host: createElectronNekoHostPorts({
      homedir: workspacePath,
      nekoHome: path.join(workspacePath, '.neko-home'),
      workspaceRoot: workspacePath,
      version: 'test',
      logger: new ConsoleLogger('DesktopCanvasRuntimeTest'),
    }),
    ...(createPreviewVariant ? { createPreviewVariant } : {}),
  });
}

async function writeFixtureFile(
  workspacePath: string,
  relativePath: string,
  contents: string,
): Promise<void> {
  const absolutePath = path.join(workspacePath, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents);
}
