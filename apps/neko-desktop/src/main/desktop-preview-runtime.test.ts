import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PREVIEW_HOST_RUNTIME_ROUTES, PREVIEW_HOST_RUNTIME_VERSION } from '@neko/preview-domain';
import type { ResourceBrowserIdentity } from '@neko/assets-domain/resource-browser/contract';
import {
  DESKTOP_PRIMARY_MAIN_GROUP_ID,
  DESKTOP_SECONDARY_MAIN_GROUP_ID,
  createDefaultDesktopWorkbenchLayout,
  getActiveMainView,
  openOrFocusMainView,
} from '../shared/workbench-contract';
import { DesktopResourceRegistry } from './desktop-resource-registry';
import { DesktopPreviewRuntime, type DesktopPreviewShellPort } from './desktop-preview-runtime';

const roots: string[] = [];
const registries: DesktopResourceRegistry[] = [];
const resourceIdentity: ResourceBrowserIdentity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'resource-browser:project-view-1',
  viewEpoch: 1,
  endpointEpoch: 'endpoint-1',
};

afterEach(async () => {
  for (const registry of registries.splice(0)) registry.dispose();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('DesktopPreviewRuntime', () => {
  it.each([
    ['reference.png', 'image', 'image/png'],
    ['voice.wav', 'audio', 'audio/wav'],
    ['clip.mp4', 'video', 'video/mp4'],
    ['document.pdf', 'document', 'application/pdf'],
    ['comic.cbz', 'document', 'application/x-cbz'],
    [
      'document.docx',
      'document',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    ['book.epub', 'document', 'application/epub+zip'],
  ] as const)(
    'projects locator-backed %s through its package viewer MIME and Range source',
    async (label, contentKind, mediaType) => {
      const root = await mkdtemp(path.join(tmpdir(), 'openneko-preview-kind-'));
      roots.push(root);
      const absolutePath = path.join(root, label);
      await writeFile(absolutePath, 'preview-bytes');
      const workbench = createDefaultDesktopWorkbenchLayout('window-1');
      const shell: DesktopPreviewShellPort = {
        getProjection: async () => ({
          endpointEpoch: 'endpoint-1',
          catalog: {
            projects: [{ projectId: 'project-1', workspaceId: 'workspace-1' }],
          },
          window: {
            windowId: 'window-1',
            revision: 1,
            tabs: [{ projectId: 'project-1', viewId: 'project-view-1', viewEpoch: 1 }],
            workbench,
          },
        }),
        updateWorkbench: vi.fn(async () => undefined),
      };
      const runtime = new DesktopPreviewRuntime({
        shell,
        resources: createResources(),
        createIdentity: () => `kind-${contentKind}-${label}`,
      });

      const projection = await runtime.open({
        identity: resourceIdentity,
        item: createItem(label, `content:${label}`),
        absolutePath,
      });
      if (projection.status !== 'ready') throw new Error('Expected a ready Preview.');

      expect(projection.descriptor).toMatchObject({
        contentLocator: { kind: 'workspace-file', path: label },
        contentKind,
        mediaType,
        byteLength: 13,
      });
      const range = await fetchResource(projection.descriptor.url, {
        headers: { Range: 'bytes=0-6' },
      });
      expect(range.status).toBe(206);
      expect(range.headers.get('content-type')).toBe(mediaType);
      expect(range.headers.get('content-range')).toBe('bytes 0-6/13');
      expect(await range.text()).toBe('preview');
      runtime.dispose();
      expect((await fetchResource(projection.descriptor.url)).status).toBe(404);
    },
  );

  it('authorizes and releases a transient media descriptor without mutating the workbench', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-preview-hover-'));
    roots.push(root);
    const mediaPath = path.join(root, 'hover.mp4');
    await writeFile(mediaPath, 'video');
    const workbench = createDefaultDesktopWorkbenchLayout('window-1');
    const updateWorkbench = vi.fn();
    const shell: DesktopPreviewShellPort = {
      getProjection: async () => ({
        endpointEpoch: 'endpoint-1',
        catalog: {
          projects: [{ projectId: 'project-1', workspaceId: 'workspace-1' }],
        },
        window: {
          windowId: 'window-1',
          revision: 1,
          tabs: [{ projectId: 'project-1', viewId: 'project-view-1', viewEpoch: 1 }],
          workbench,
        },
      }),
      updateWorkbench,
    };
    const resources = createResources();
    const runtime = new DesktopPreviewRuntime({
      shell,
      resources,
      createIdentity: () => 'hover-one',
    });

    const opened = await runtime.openQuickPreview({
      identity: resourceIdentity,
      item: { ...createItem('hover.mp4', 'content:hover'), kind: 'video' },
      absolutePath: mediaPath,
    });

    expect(opened).toMatchObject({
      previewSessionId: 'preview-hover:hover-one',
      descriptor: {
        contentKind: 'video',
        mediaType: 'video/mp4',
        displayName: 'hover.mp4',
      },
    });
    expect((await fetchResource(opened.descriptor.url)).status).toBe(200);
    expect(updateWorkbench).not.toHaveBeenCalled();

    runtime.releaseQuickPreview('window-1', opened.previewSessionId);
    expect((await fetchResource(opened.descriptor.url)).status).toBe(404);
    expect(() => runtime.releaseQuickPreview('window-1', opened.previewSessionId)).toThrow(
      'is unavailable',
    );
  });

  it('fences stale Preview identity and revokes only the detached Window sessions', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-preview-fencing-'));
    roots.push(root);
    const mediaPath = path.join(root, 'preview.mp4');
    await writeFile(mediaPath, 'video');
    const workbench = createDefaultDesktopWorkbenchLayout('window-1');
    const shell: DesktopPreviewShellPort = {
      getProjection: async () => ({
        endpointEpoch: 'endpoint-1',
        catalog: {
          projects: [{ projectId: 'project-1', workspaceId: 'workspace-1' }],
        },
        window: {
          windowId: 'window-1',
          revision: 1,
          tabs: [{ projectId: 'project-1', viewId: 'project-view-1', viewEpoch: 1 }],
          workbench,
        },
      }),
      updateWorkbench: vi.fn(async () => undefined),
    };
    const runtime = new DesktopPreviewRuntime({
      shell,
      resources: createResources(),
      createIdentity: (() => {
        const identities = ['full', 'quick'];
        return () => identities.shift() ?? 'unexpected';
      })(),
    });
    const projection = await runtime.open({
      identity: resourceIdentity,
      item: createItem('preview.mp4', 'content:full'),
      absolutePath: mediaPath,
    });
    if (projection.status !== 'ready') throw new Error('Expected a ready Preview.');
    const quick = await runtime.openQuickPreview({
      identity: resourceIdentity,
      item: { ...createItem('preview.mp4', 'content:quick'), kind: 'video' },
      absolutePath: mediaPath,
    });

    await expect(
      runtime.execute('window-1', {
        schemaVersion: PREVIEW_HOST_RUNTIME_VERSION,
        requestId: 'stale-revision',
        route: PREVIEW_HOST_RUNTIME_ROUTES.snapshotGet,
        identity: { ...projection.identity, revision: projection.identity.revision + 1 },
      }),
    ).rejects.toThrow('revision does not match');
    expect((await fetchResource(projection.descriptor.url)).status).toBe(200);
    expect(() => runtime.releaseQuickPreview('window-2', quick.previewSessionId)).toThrow(
      'is unavailable',
    );
    expect((await fetchResource(quick.descriptor.url)).status).toBe(200);

    runtime.detachWindow('window-1');
    expect((await fetchResource(projection.descriptor.url)).status).toBe(404);
    expect((await fetchResource(quick.descriptor.url)).status).toBe(404);
  });

  it('opens one temporary owner-bound Preview View and releases the replaced descriptor', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-preview-runtime-'));
    roots.push(root);
    const firstPath = path.join(root, 'first.json');
    const secondPath = path.join(root, 'second.glb');
    await writeFile(firstPath, '{"first":true}');
    await writeFile(secondPath, 'glb');
    let workbench = openOrFocusMainView(createDefaultDesktopWorkbenchLayout('window-1'), {
      viewId: 'canvas:project-view-1:board',
      viewEpoch: 1,
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      kind: 'canvas',
      ownerId: 'canvas:project-view-1',
      displayLabel: 'board.nkc',
      documentId: 'boards/board.nkc',
    });
    workbench = {
      ...workbench,
      resourceDock: {
        ...workbench.resourceDock,
        presentation: 'docked',
      },
      display: {
        ...workbench.display,
        mode: 'chat-main',
      },
    };
    let windowRevision = 1;
    let endpointEpoch = 'endpoint-1';
    const shell: DesktopPreviewShellPort = {
      getProjection: async () => ({
        endpointEpoch,
        catalog: {
          projects: [{ projectId: 'project-1', workspaceId: 'workspace-1' }],
        },
        window: {
          windowId: 'window-1',
          revision: windowRevision,
          tabs: [{ projectId: 'project-1', viewId: 'project-view-1', viewEpoch: 1 }],
          workbench,
        },
      }),
      updateWorkbench: vi.fn(async (_windowId, _epoch, _windowRevision, _revision, next) => {
        workbench = next;
        windowRevision += 1;
      }),
    };
    const resources = createResources();
    const identities = ['one', 'two', 'three'];
    const runtime = new DesktopPreviewRuntime({
      shell,
      resources,
      createIdentity: () => identities.shift() ?? 'unexpected',
    });

    await expect(
      runtime.open({
        identity: resourceIdentity,
        item: createItem('first.json', 'content:first'),
        absolutePath: firstPath,
        target: {
          viewId: 'preview:project-view-1:temporary',
          presentation: 'temporary',
          expectedWorkbenchRevision: 0,
        },
      }),
    ).rejects.toThrow('target View or workbench revision is stale');
    const first = await runtime.open({
      identity: resourceIdentity,
      item: createItem('first.json', 'content:first'),
      absolutePath: firstPath,
      target: {
        viewId: 'preview:project-view-1:temporary',
        presentation: 'temporary',
        expectedWorkbenchRevision: 1,
      },
    });
    if (first.status !== 'ready') throw new Error('Expected a ready Preview.');
    expect((await fetchResource(first.descriptor.url)).status).toBe(200);
    expect(workbench).toMatchObject({
      resourceDock: { presentation: 'docked' },
      display: { mode: 'chat-main' },
      main: {
        views: [
          { kind: 'canvas', ownerId: 'canvas:project-view-1' },
          { kind: 'preview', ownerId: 'preview-session:one' },
        ],
        groups: [
          {
            groupId: DESKTOP_PRIMARY_MAIN_GROUP_ID,
            activeViewId: 'preview:project-view-1:temporary',
          },
        ],
      },
    });

    const second = await runtime.open({
      identity: resourceIdentity,
      item: createItem('second.glb', 'content:second'),
      absolutePath: secondPath,
    });
    if (second.status !== 'ready') throw new Error('Expected a ready Preview.');
    expect(second.descriptor.contentKind).toBe('model');
    expect((await fetchResource(first.descriptor.url)).status).toBe(404);
    expect((await fetchResource(second.descriptor.url)).status).toBe(200);
    expect(workbench.main.views).toEqual([
      expect.objectContaining({ kind: 'canvas', ownerId: 'canvas:project-view-1' }),
      expect.objectContaining({ kind: 'preview', ownerId: 'preview-session:two' }),
    ]);
    await expect(
      runtime.getSnapshot('window-1', {
        schemaVersion: 1,
        requestId: 'request-1',
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        viewId: 'preview:project-view-1:temporary',
        viewEpoch: 1,
        sessionId: 'preview-session:two',
        endpointEpoch: 'endpoint-1',
      }),
    ).resolves.toMatchObject({
      status: 'ready',
      descriptor: { contentKind: 'model' },
    });

    const pinned = await runtime.execute('window-1', {
      schemaVersion: PREVIEW_HOST_RUNTIME_VERSION,
      requestId: 'pin-second',
      route: PREVIEW_HOST_RUNTIME_ROUTES.viewPin,
      identity: second.identity,
    });
    expect(pinned).toMatchObject({
      presentation: 'pinned',
      identity: { revision: 1 },
    });
    expect(pinned.identity.viewId).not.toBe(second.identity.viewId);
    expect(workbench.main.views).toContainEqual(
      expect.objectContaining({
        ownerId: 'preview-session:two',
        previewPresentation: 'pinned',
      }),
    );

    const thirdPath = path.join(root, 'third.md');
    await writeFile(thirdPath, '# Third');
    const third = await runtime.open({
      identity: resourceIdentity,
      item: createItem('third.md', 'content:third'),
      absolutePath: thirdPath,
    });
    if (third.status !== 'ready') throw new Error('Expected a ready Preview.');
    expect((await fetchResource(second.descriptor.url)).status).toBe(200);
    expect(workbench.main.views.filter((view) => view.kind === 'preview')).toHaveLength(2);

    const side = await runtime.execute('window-1', {
      schemaVersion: PREVIEW_HOST_RUNTIME_VERSION,
      requestId: 'side-third',
      route: PREVIEW_HOST_RUNTIME_ROUTES.viewOpen,
      identity: third.identity,
    });
    expect(side.presentation).toBe('side');
    expect(workbench.display.mode).toBe('chat-main');
    expect(workbench.main).toMatchObject({
      activeGroupId: DESKTOP_SECONDARY_MAIN_GROUP_ID,
      split: { axis: 'columns', ratio: 0.5 },
      groups: [
        {
          groupId: DESKTOP_PRIMARY_MAIN_GROUP_ID,
        },
        {
          groupId: DESKTOP_SECONDARY_MAIN_GROUP_ID,
          activeViewId: side.identity.viewId,
          viewIds: [side.identity.viewId],
        },
      ],
    });
    expect(getActiveMainView(workbench)?.viewId).toBe(side.identity.viewId);

    await runtime.execute('window-1', {
      schemaVersion: PREVIEW_HOST_RUNTIME_VERSION,
      requestId: 'close-third',
      route: PREVIEW_HOST_RUNTIME_ROUTES.viewClose,
      identity: side.identity,
    });
    expect((await fetchResource(third.descriptor.url)).status).toBe(404);
    expect((await fetchResource(second.descriptor.url)).status).toBe(200);
    expect(workbench.main.views).toContainEqual(
      expect.objectContaining({
        ownerId: 'preview-session:two',
        previewPresentation: 'pinned',
      }),
    );

    const unsupported = await runtime.open({
      identity: resourceIdentity,
      item: createItem('archive.unknown', 'content:unsupported'),
      absolutePath: path.join(root, 'must-not-be-opened.unknown'),
    });
    expect(unsupported).toMatchObject({
      status: 'unsupported',
      diagnostic: { code: 'preview-unsupported-kind' },
    });
    expect(JSON.stringify(unsupported)).not.toMatch(/absolutePath|must-not-be-opened|neko-media:/u);

    endpointEpoch = 'endpoint-2';
    await expect(
      runtime.getSnapshot('window-1', {
        schemaVersion: PREVIEW_HOST_RUNTIME_VERSION,
        requestId: 'renderer-reload',
        projectId: unsupported.identity.projectId,
        workspaceId: unsupported.identity.workspaceId,
        viewId: unsupported.identity.viewId,
        viewEpoch: unsupported.identity.viewEpoch,
        sessionId: unsupported.identity.sessionId,
        endpointEpoch,
      }),
    ).rejects.toThrow('endpoint is stale');
  });

  it('publishes only declared glTF dependencies through a frozen resource set', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-preview-gltf-'));
    roots.push(root);
    await mkdir(path.join(root, 'textures'));
    const modelPath = path.join(root, 'scene.gltf');
    await writeFile(
      modelPath,
      JSON.stringify({
        asset: { version: '2.0' },
        buffers: [{ uri: 'scene.bin', byteLength: 6 }],
        images: [{ uri: 'textures/base.png' }],
      }),
    );
    await writeFile(path.join(root, 'scene.bin'), 'buffer');
    await writeFile(path.join(root, 'textures', 'base.png'), 'image');
    await writeFile(path.join(root, 'undeclared.bin'), 'private');
    const workbench = createDefaultDesktopWorkbenchLayout('window-1');
    const shell: DesktopPreviewShellPort = {
      getProjection: async () => ({
        endpointEpoch: 'endpoint-1',
        catalog: {
          projects: [{ projectId: 'project-1', workspaceId: 'workspace-1' }],
        },
        window: {
          windowId: 'window-1',
          revision: 1,
          tabs: [{ projectId: 'project-1', viewId: 'project-view-1', viewEpoch: 1 }],
          workbench,
        },
      }),
      updateWorkbench: vi.fn(async () => undefined),
    };
    const runtime = new DesktopPreviewRuntime({
      shell,
      resources: createResources(),
      createIdentity: () => 'gltf-one',
    });

    const projection = await runtime.open({
      identity: resourceIdentity,
      item: createItem('scene.gltf', 'content:gltf'),
      absolutePath: modelPath,
    });
    if (projection.status !== 'ready') throw new Error('Expected a ready glTF Preview.');

    expect(projection.descriptor.resourceUris).toEqual({
      'scene.gltf': projection.descriptor.url,
      'scene.bin': new URL('scene.bin', projection.descriptor.url).toString(),
      'textures/base.png': new URL('textures/base.png', projection.descriptor.url).toString(),
    });
    expect(await (await fetchResource(projection.descriptor.url)).json()).toMatchObject({
      buffers: [{ uri: 'scene.bin' }],
    });
    expect(
      await (await fetchResource(new URL('scene.bin', projection.descriptor.url))).text(),
    ).toBe('buffer');
    expect(
      await (await fetchResource(new URL('textures/base.png', projection.descriptor.url))).text(),
    ).toBe('image');
    expect((await fetchResource(new URL('undeclared.bin', projection.descriptor.url))).status).toBe(
      404,
    );

    runtime.dispose();
    expect((await fetchResource(projection.descriptor.url)).status).toBe(404);
  });

  it('rejects encoded glTF traversal before registering a resource set', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-preview-gltf-'));
    roots.push(root);
    const modelPath = path.join(root, 'unsafe.gltf');
    await writeFile(
      modelPath,
      JSON.stringify({
        asset: { version: '2.0' },
        buffers: [{ uri: '%2e%2e/secret.bin', byteLength: 6 }],
      }),
    );
    const workbench = createDefaultDesktopWorkbenchLayout('window-1');
    const shell: DesktopPreviewShellPort = {
      getProjection: async () => ({
        endpointEpoch: 'endpoint-1',
        catalog: {
          projects: [{ projectId: 'project-1', workspaceId: 'workspace-1' }],
        },
        window: {
          windowId: 'window-1',
          revision: 1,
          tabs: [{ projectId: 'project-1', viewId: 'project-view-1', viewEpoch: 1 }],
          workbench,
        },
      }),
      updateWorkbench: vi.fn(async () => undefined),
    };
    const runtime = new DesktopPreviewRuntime({
      shell,
      resources: createResources(),
      createIdentity: () => 'gltf-unsafe',
    });

    await expect(
      runtime.open({
        identity: resourceIdentity,
        item: createItem('unsafe.gltf', 'content:gltf-unsafe'),
        absolutePath: modelPath,
      }),
    ).rejects.toThrow('unsafe path segment');
  });

  it('rejects a glTF dependency symlink that escapes the model directory', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-preview-gltf-'));
    const outside = await mkdtemp(path.join(tmpdir(), 'openneko-preview-gltf-outside-'));
    roots.push(root, outside);
    const modelPath = path.join(root, 'unsafe-link.gltf');
    await writeFile(
      modelPath,
      JSON.stringify({
        asset: { version: '2.0' },
        buffers: [{ uri: 'linked.bin', byteLength: 6 }],
      }),
    );
    await writeFile(path.join(outside, 'secret.bin'), 'secret');
    await symlink(path.join(outside, 'secret.bin'), path.join(root, 'linked.bin'));
    const workbench = createDefaultDesktopWorkbenchLayout('window-1');
    const shell: DesktopPreviewShellPort = {
      getProjection: async () => ({
        endpointEpoch: 'endpoint-1',
        catalog: {
          projects: [{ projectId: 'project-1', workspaceId: 'workspace-1' }],
        },
        window: {
          windowId: 'window-1',
          revision: 1,
          tabs: [{ projectId: 'project-1', viewId: 'project-view-1', viewEpoch: 1 }],
          workbench,
        },
      }),
      updateWorkbench: vi.fn(async () => undefined),
    };
    const runtime = new DesktopPreviewRuntime({
      shell,
      resources: createResources(),
      createIdentity: () => 'gltf-unsafe-link',
    });

    await expect(
      runtime.open({
        identity: resourceIdentity,
        item: createItem('unsafe-link.gltf', 'content:gltf-unsafe-link'),
        absolutePath: modelPath,
      }),
    ).rejects.toThrow('escapes the model directory');
  });
});

function createResources(): DesktopResourceRegistry {
  const registry = new DesktopResourceRegistry();
  registry.bindWindow(resourceIdentity.windowId, 101);
  registries.push(registry);
  return registry;
}

function fetchResource(input: string | URL, init?: RequestInit): Promise<Response> {
  const url = input.toString();
  const registry = registries.find((candidate) => candidate.authorizeRequest(url, 101));
  if (!registry) {
    return Promise.resolve(new Response('Resource not found', { status: 404 }));
  }
  return registry.handle(new Request(url, init));
}

function createItem(label: string, resourceId: string) {
  return {
    resourceId,
    facet: 'files' as const,
    role: 'content' as const,
    depth: 0,
    kind: 'file' as const,
    label,
    locator: { kind: 'workspace-file' as const, path: label },
    capabilities: ['preview', 'reveal'] as const,
  };
}
