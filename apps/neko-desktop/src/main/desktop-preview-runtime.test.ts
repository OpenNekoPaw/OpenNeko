import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PREVIEW_HOST_RUNTIME_ROUTES, type PreviewProjection } from '@neko/preview-domain';
import { TextReader, Uint8ArrayWriter, ZipWriter } from '@zip.js/zip.js';
import type { ResourceBrowserIdentity } from '@neko/assets-domain/resource-browser/contract';
import {
  DESKTOP_PRIMARY_MAIN_GROUP_ID,
  DESKTOP_SECONDARY_MAIN_GROUP_ID,
  createDefaultDesktopWorkbenchLayout,
  getActiveMainView,
  openOrFocusMainView,
} from '@neko/host/desktop-workbench-contract';
import { DesktopResourceRegistry } from './desktop-resource-registry';
import { DesktopPreviewRuntime, type DesktopPreviewShellPort } from './desktop-preview-runtime';
import {
  createDefaultDesktopApplicationSidebar,
  parseDesktopWorkbenchSceneProjection,
} from '@neko/host/desktop-scene-contract';
import { createDesktopWindowComposition } from '@neko/host/desktop-window-composition-contract';

const roots: string[] = [];
const registries: DesktopResourceRegistry[] = [];
const resourceIdentity: ResourceBrowserIdentity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'resource-browser:project-view-1',
  viewInstanceId: 'view-instance-1',
  rendererSessionId: 'endpoint-1',
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
  ] as const)(
    'projects locator-backed %s through its package viewer MIME and Range source',
    async (label, contentKind, mediaType) => {
      const root = await mkdtemp(path.join(tmpdir(), 'openneko-preview-kind-'));
      roots.push(root);
      const absolutePath = path.join(root, label);
      await writeFile(absolutePath, 'preview-bytes');
      let workbench = createDefaultDesktopWorkbenchLayout('window-1');
      const shell: DesktopPreviewShellPort = {
        getProjection: async () => createShellProjection(workbench),
        updateWorkbench: vi.fn(async (_windowId, _endpoint, _instanceId, next) => {
          workbench = next;
        }),
      };
      const runtime = new DesktopPreviewRuntime({
        shell,
        resources: createResources(),
        createIdentity: () => `kind-${contentKind}-${label}`,
      });

      const opened = await runtime.open({
        identity: resourceIdentity,
        item: createItem(label, `content:${label}`),
        absolutePath,
      });
      expect(opened.status).toBe('loading');
      const projection = await preparePreview(runtime, opened);
      if (projection.status !== 'ready') throw new Error('Expected a ready Preview.');

      expect(projection.descriptor).toMatchObject({
        contentLocator: { file: { authority: 'workspace', path: label } },
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

  it('publishes authorized document-entry bytes with the stable locator and Range support', async () => {
    let workbench = createDefaultDesktopWorkbenchLayout('window-1');
    const shell: DesktopPreviewShellPort = {
      getProjection: async () => createShellProjection(workbench),
      updateWorkbench: vi.fn(async (_windowId, _endpoint, _instanceId, next) => {
        workbench = next;
      }),
    };
    const runtime = new DesktopPreviewRuntime({
      shell,
      resources: createResources(),
      createIdentity: () => 'document-entry-image',
    });
    const locator = {
      file: { authority: 'workspace' as const, path: 'books/story.epub' },
      selector: { kind: 'entry' as const, path: 'OPS/images/cover.png' },
    };
    const bytes = new TextEncoder().encode('embedded-image');

    const opened = await runtime.open({
      identity: resourceIdentity,
      item: { ...createItem('cover.png', 'content:cover'), locator },
      bytes,
    });
    const projection = await preparePreview(runtime, opened);
    if (projection.status !== 'ready') throw new Error('Expected a ready embedded Preview.');

    expect(projection.descriptor).toMatchObject({
      contentLocator: locator,
      contentKind: 'image',
      mediaType: 'image/png',
      byteLength: bytes.byteLength,
      sourceFingerprint: expect.stringMatching(/^sha256:/u),
    });
    const range = await fetchResource(projection.descriptor.url, {
      headers: { Range: 'bytes=0-7' },
    });
    expect(range.status).toBe(206);
    expect(range.headers.get('content-range')).toBe(`bytes 0-7/${bytes.byteLength}`);
    expect(await range.text()).toBe('embedded');
  });

  it('publishes EPUB as one virtual directory only when the first exact Snapshot is requested', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-preview-epub-'));
    roots.push(root);
    const absolutePath = path.join(root, 'book.epub');
    await writeEpubFixture(absolutePath);
    let workbench = createDefaultDesktopWorkbenchLayout('window-1');
    const shell: DesktopPreviewShellPort = {
      getProjection: async () => createShellProjection(workbench),
      updateWorkbench: vi.fn(async (_windowId, _endpoint, _instanceId, next) => {
        workbench = next;
      }),
    };
    const resources = createResources();
    const registerFile = vi.spyOn(resources, 'registerFile');
    const registerResourceTree = vi.spyOn(resources, 'registerResourceTree');
    const runtime = new DesktopPreviewRuntime({
      shell,
      resources,
      createIdentity: () => 'epub-one',
    });

    const opened = await runtime.open({
      identity: resourceIdentity,
      item: createItem('book.epub', 'content:book'),
      absolutePath,
    });
    expect(opened).toMatchObject({ status: 'loading' });
    expect(registerFile).not.toHaveBeenCalled();
    expect(registerResourceTree).not.toHaveBeenCalled();

    const [first, second] = await Promise.all([
      preparePreview(runtime, opened),
      preparePreview(runtime, opened),
    ]);
    expect(second).toEqual(first);
    if (first.status !== 'ready') throw new Error('Expected a ready EPUB Preview.');
    expect(registerResourceTree).toHaveBeenCalledOnce();
    expect(registerFile).not.toHaveBeenCalled();
    expect(first.descriptor.url).toMatch(/^openneko:\/\/resource\/[A-Za-z0-9_-]{32}\/$/u);
    expect(first.descriptor.url).not.toContain(absolutePath);
    const container = await fetchResource(new URL('META-INF/container.xml', first.descriptor.url));
    expect(container.status).toBe(200);
    expect(container.headers.get('content-type')).toBe('application/xml');
    expect(await container.text()).toContain('rootfile');
  });

  it('authorizes and releases a transient media descriptor without mutating the workbench', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-preview-hover-'));
    roots.push(root);
    const mediaPath = path.join(root, 'hover.mp4');
    await writeFile(mediaPath, 'video');
    const workbench = createDefaultDesktopWorkbenchLayout('window-1');
    const updateWorkbench = vi.fn();
    const shell: DesktopPreviewShellPort = {
      getProjection: async () => createShellProjection(workbench),
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
    let workbench = createDefaultDesktopWorkbenchLayout('window-1');
    const shell: DesktopPreviewShellPort = {
      getProjection: async () => createShellProjection(workbench),
      updateWorkbench: vi.fn(async (_windowId, _endpoint, _instanceId, next) => {
        workbench = next;
      }),
    };
    const runtime = new DesktopPreviewRuntime({
      shell,
      resources: createResources(),
      createIdentity: (() => {
        const identities = ['full', 'quick'];
        return () => identities.shift() ?? 'unexpected';
      })(),
    });
    const opened = await runtime.open({
      identity: resourceIdentity,
      item: createItem('preview.mp4', 'content:full'),
      absolutePath: mediaPath,
    });
    const projection = await preparePreview(runtime, opened);
    if (projection.status !== 'ready') throw new Error('Expected a ready Preview.');
    const quick = await runtime.openQuickPreview({
      identity: resourceIdentity,
      item: { ...createItem('preview.mp4', 'content:quick'), kind: 'video' },
      absolutePath: mediaPath,
    });

    await expect(
      runtime.execute('window-1', {
        requestId: 'wrong-panel-owner',
        route: PREVIEW_HOST_RUNTIME_ROUTES.snapshotGet,
        identity: { ...projection.identity, viewId: 'preview:another-panel' },
      }),
    ).rejects.toThrow('viewId does not match');
    expect((await fetchResource(projection.descriptor.url)).status).toBe(200);
    expect(() => runtime.releaseQuickPreview('window-2', quick.previewSessionId)).toThrow(
      'is unavailable',
    );
    expect((await fetchResource(quick.descriptor.url)).status).toBe(200);

    runtime.detachWindow('window-1');
    expect((await fetchResource(projection.descriptor.url)).status).toBe(404);
    expect((await fetchResource(quick.descriptor.url)).status).toBe(404);
  });

  it('releases a source registration that completes after its Preview was closed', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-preview-cancel-'));
    roots.push(root);
    const mediaPath = path.join(root, 'late.mp4');
    await writeFile(mediaPath, 'video');
    let workbench = createDefaultDesktopWorkbenchLayout('window-1');
    const shell: DesktopPreviewShellPort = {
      getProjection: async () => createShellProjection(workbench),
      updateWorkbench: vi.fn(async (_windowId, _endpoint, _instanceId, next) => {
        workbench = next;
      }),
    };
    const resources = createResources();
    const registerFile = resources.registerFile.bind(resources);
    let releaseRegistration: (() => void) | undefined;
    const registrationGate = new Promise<void>((resolve) => {
      releaseRegistration = resolve;
    });
    let lateUrl: string | undefined;
    vi.spyOn(resources, 'registerFile').mockImplementation(async (owner, source) => {
      await registrationGate;
      const lease = await registerFile(owner, source);
      lateUrl = lease.url;
      return lease;
    });
    const runtime = new DesktopPreviewRuntime({
      shell,
      resources,
      createIdentity: () => 'late-one',
    });
    const opened = await runtime.open({
      identity: resourceIdentity,
      item: createItem('late.mp4', 'content:late'),
      absolutePath: mediaPath,
    });
    const preparation = preparePreview(runtime, opened);
    await vi.waitFor(() => expect(resources.registerFile).toHaveBeenCalledOnce());

    await runtime.execute('window-1', {
      requestId: 'close-late',
      route: PREVIEW_HOST_RUNTIME_ROUTES.viewClose,
      identity: opened.identity,
    });
    releaseRegistration?.();
    await expect(preparation).rejects.toThrow('Preview source preparation was released.');
    expect(lateUrl).toBeDefined();
    expect((await fetchResource(lateUrl ?? '')).status).toBe(404);
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
      viewInstanceId: 'view-instance-1',
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
    let rendererSessionId = 'endpoint-1';
    const shell: DesktopPreviewShellPort = {
      getProjection: async () => createShellProjection(workbench, rendererSessionId),
      updateWorkbench: vi.fn(async (_windowId, _rendererSessionId, _workbenchInstanceId, next) => {
        workbench = next;
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
          viewId: 'preview:stale-view:temporary',
          presentation: 'temporary',
        },
      }),
    ).rejects.toThrow('target View identity is stale');
    const firstOpened = await runtime.open({
      identity: resourceIdentity,
      item: createItem('first.json', 'content:first'),
      absolutePath: firstPath,
      target: {
        viewId: 'preview:project-view-1:temporary',
        presentation: 'temporary',
      },
    });
    const first = await preparePreview(runtime, firstOpened);
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

    const secondOpened = await runtime.open({
      identity: resourceIdentity,
      item: createItem('second.glb', 'content:second'),
      absolutePath: secondPath,
    });
    const second = await preparePreview(runtime, secondOpened);
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
        requestId: 'request-1',
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        viewId: 'preview:project-view-1:temporary',
        viewInstanceId: 'view-instance-1',
        sessionId: 'preview-session:two',
        rendererSessionId: 'endpoint-1',
      }),
    ).resolves.toMatchObject({
      status: 'ready',
      descriptor: { contentKind: 'model' },
    });

    const pinned = await runtime.execute('window-1', {
      requestId: 'pin-second',
      route: PREVIEW_HOST_RUNTIME_ROUTES.viewPin,
      identity: second.identity,
    });
    expect(pinned).toMatchObject({
      presentation: 'pinned',
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
    const thirdOpened = await runtime.open({
      identity: resourceIdentity,
      item: createItem('third.md', 'content:third'),
      absolutePath: thirdPath,
    });
    const third = await preparePreview(runtime, thirdOpened);
    if (third.status !== 'ready') throw new Error('Expected a ready Preview.');
    expect((await fetchResource(second.descriptor.url)).status).toBe(200);
    expect(workbench.main.views.filter((view) => view.kind === 'preview')).toHaveLength(2);

    const side = await runtime.execute('window-1', {
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

    rendererSessionId = 'endpoint-2';
    await expect(
      runtime.getSnapshot('window-1', {
        requestId: 'renderer-reload',
        projectId: unsupported.identity.projectId,
        workspaceId: unsupported.identity.workspaceId,
        viewId: unsupported.identity.viewId,
        viewInstanceId: unsupported.identity.viewInstanceId,
        sessionId: unsupported.identity.sessionId,
        rendererSessionId,
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
    let workbench = createDefaultDesktopWorkbenchLayout('window-1');
    const shell: DesktopPreviewShellPort = {
      getProjection: async () => createShellProjection(workbench),
      updateWorkbench: vi.fn(async (_windowId, _endpoint, _instanceId, next) => {
        workbench = next;
      }),
    };
    const runtime = new DesktopPreviewRuntime({
      shell,
      resources: createResources(),
      createIdentity: () => 'gltf-one',
    });

    const opened = await runtime.open({
      identity: resourceIdentity,
      item: createItem('scene.gltf', 'content:gltf'),
      absolutePath: modelPath,
    });
    const projection = await preparePreview(runtime, opened);
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
    let workbench = createDefaultDesktopWorkbenchLayout('window-1');
    const shell: DesktopPreviewShellPort = {
      getProjection: async () => createShellProjection(workbench),
      updateWorkbench: vi.fn(async (_windowId, _endpoint, _instanceId, next) => {
        workbench = next;
      }),
    };
    const runtime = new DesktopPreviewRuntime({
      shell,
      resources: createResources(),
      createIdentity: () => 'gltf-unsafe',
    });

    const opened = await runtime.open({
      identity: resourceIdentity,
      item: createItem('unsafe.gltf', 'content:gltf-unsafe'),
      absolutePath: modelPath,
    });
    await expect(preparePreview(runtime, opened)).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: { message: expect.stringContaining('unsafe path segment') },
    });
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
    let workbench = createDefaultDesktopWorkbenchLayout('window-1');
    const shell: DesktopPreviewShellPort = {
      getProjection: async () => createShellProjection(workbench),
      updateWorkbench: vi.fn(async (_windowId, _endpoint, _instanceId, next) => {
        workbench = next;
      }),
    };
    const runtime = new DesktopPreviewRuntime({
      shell,
      resources: createResources(),
      createIdentity: () => 'gltf-unsafe-link',
    });

    const opened = await runtime.open({
      identity: resourceIdentity,
      item: createItem('unsafe-link.gltf', 'content:gltf-unsafe-link'),
      absolutePath: modelPath,
    });
    await expect(preparePreview(runtime, opened)).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: { message: expect.stringContaining('escapes the model directory') },
    });
  });
});

function createShellProjection(
  workbench: ReturnType<typeof createDefaultDesktopWorkbenchLayout>,
  rendererSessionId = 'endpoint-1',
): Awaited<ReturnType<DesktopPreviewShellPort['getProjection']>> {
  const sceneId = 'scene:window-1:workspace-1';
  const scope = {
    kind: 'workspace' as const,
    draftId: 'draft:workspace-1',
    workspaceId: 'workspace-1',
    workspaceGrantId: 'workspace-grant:workspace-1',
  };
  const scene = parseDesktopWorkbenchSceneProjection({
    sceneId,
    windowId: 'window-1',
    context: { kind: 'agent', agentViewId: 'project-view-1', scope },
    slots: {
      interaction: {
        kind: 'agent',
        agentSurfaceId: 'agent-surface:workspace-1',
        agentViewId: 'project-view-1',
        phase: 'draft',
        scope,
      },
      rightManager: { kind: 'workspace-resources', workspaceId: 'workspace-1' },
      status: { kind: 'scene-status', sceneId },
    },
  });
  const instance = createDesktopWindowComposition({
    workbenchInstanceId: 'workbench:workspace-1',
    layout: workbench,
    scene,
  });
  return {
    rendererSessionId,
    catalog: {
      projects: [
        {
          projectId: 'project-1',
          workspaceId: 'workspace-1',
          profile: 'content',
          displayName: 'Fixture',
          createdAt: '2026-08-05T00:00:00.000Z',
          updatedAt: '2026-08-05T00:00:00.000Z',
        },
      ],
    },
    window: {
      windowId: 'window-1',
      activeTarget: { kind: 'project', tabId: 'tab-1' },
      tabs: [
        {
          tabId: 'tab-1',
          projectId: 'project-1',
          viewId: 'project-view-1',
          viewInstanceId: 'view-instance-1',
        },
      ],
      workbench: instance,
      applicationSidebar: createDefaultDesktopApplicationSidebar('window-1'),
    },
  };
}

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

function preparePreview(
  runtime: DesktopPreviewRuntime,
  projection: PreviewProjection,
): Promise<PreviewProjection> {
  return runtime.execute(projection.identity.windowId, {
    requestId: `prepare:${projection.identity.sessionId}`,
    route: PREVIEW_HOST_RUNTIME_ROUTES.snapshotGet,
    identity: projection.identity,
  });
}

async function writeEpubFixture(absolutePath: string): Promise<void> {
  const writer = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false });
  await writer.add('mimetype', new TextReader('application/epub+zip'));
  await writer.add(
    'META-INF/container.xml',
    new TextReader(
      '<?xml version="1.0"?><container><rootfiles><rootfile full-path="OPS/package.opf"/></rootfiles></container>',
    ),
  );
  await writer.add(
    'OPS/package.opf',
    new TextReader(
      '<package><manifest><item id="chapter" href="chapter.xhtml"/></manifest><spine><itemref idref="chapter"/></spine></package>',
    ),
  );
  await writer.add('OPS/chapter.xhtml', new TextReader('<html><body>chapter</body></html>'));
  await writeFile(absolutePath, await writer.close());
}

function createItem(label: string, resourceId: string) {
  return {
    resourceId,
    source: 'files' as const,
    role: 'content' as const,
    depth: 0,
    kind: 'file' as const,
    label,
    locator: { file: { authority: 'workspace' as const, path: label } },
    capabilities: ['preview', 'reveal'] as const,
  };
}
