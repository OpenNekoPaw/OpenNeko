import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PREVIEW_HOST_RUNTIME_ROUTES,
  PREVIEW_HOST_RUNTIME_VERSION,
} from '@neko-preview/contracts';
import type { ResourceBrowserIdentity } from 'neko-assets/resource-browser/contract';
import { createDefaultDesktopWorkbenchLayout } from '../shared/workbench-contract';
import { DesktopMediaDescriptorRegistry } from './desktop-media-protocol';
import {
  DesktopPreviewRuntime,
  type DesktopPreviewShellPort,
} from './desktop-preview-runtime';

const roots: string[] = [];
const resourceIdentity: ResourceBrowserIdentity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'resource-browser:project-view-1',
  viewEpoch: 1,
  endpointEpoch: 'endpoint-1',
};

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('DesktopPreviewRuntime', () => {
  it('opens one temporary owner-bound Preview View and releases the replaced descriptor', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-preview-runtime-'));
    roots.push(root);
    const firstPath = path.join(root, 'first.json');
    const secondPath = path.join(root, 'second.glb');
    await writeFile(firstPath, '{"first":true}');
    await writeFile(secondPath, 'glb');
    let workbench = createDefaultDesktopWorkbenchLayout('window-1');
    workbench = {
      ...workbench,
      revision: 1,
      resourceDock: {
        ...workbench.resourceDock,
        presentation: 'docked',
      },
      main: {
        views: [
          {
            viewId: 'project-view-1',
            viewEpoch: 1,
            projectId: 'project-1',
            workspaceId: 'workspace-1',
            kind: 'agent',
            ownerId: 'project-view-1',
          },
        ],
        activeViewId: 'project-view-1',
        split: 'none',
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
    const mediaRegistry = new DesktopMediaDescriptorRegistry();
    const identities = ['one', 'two', 'three'];
    const runtime = new DesktopPreviewRuntime({
      shell,
      mediaRegistry,
      resolveWebContentsId: () => 10,
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
    expect(mediaRegistry.authorize(10, first.descriptor.descriptorId)).toBe(true);
    expect(workbench).toMatchObject({
      preset: 'preview-focus',
      resourceDock: { presentation: 'docked' },
      main: {
        activeViewId: 'preview:project-view-1:temporary',
        views: [
          { kind: 'agent', ownerId: 'project-view-1' },
          { kind: 'preview', ownerId: 'preview-session:one' },
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
    expect(mediaRegistry.authorize(10, first.descriptor.descriptorId)).toBe(false);
    expect(mediaRegistry.authorize(10, second.descriptor.descriptorId)).toBe(true);
    expect(workbench.main.views).toEqual([
      expect.objectContaining({ kind: 'agent', ownerId: 'project-view-1' }),
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
    expect(mediaRegistry.authorize(10, second.descriptor.descriptorId)).toBe(true);
    expect(workbench.main.views.filter((view) => view.kind === 'preview')).toHaveLength(2);

    const side = await runtime.execute('window-1', {
      schemaVersion: PREVIEW_HOST_RUNTIME_VERSION,
      requestId: 'side-third',
      route: PREVIEW_HOST_RUNTIME_ROUTES.viewOpen,
      identity: third.identity,
    });
    expect(side.presentation).toBe('side');
    expect(workbench.main).toMatchObject({
      activeViewId: 'project-view-1',
      sideViewId: side.identity.viewId,
      split: 'horizontal',
    });

    await runtime.execute('window-1', {
      schemaVersion: PREVIEW_HOST_RUNTIME_VERSION,
      requestId: 'close-third',
      route: PREVIEW_HOST_RUNTIME_ROUTES.viewClose,
      identity: side.identity,
    });
    expect(mediaRegistry.authorize(10, third.descriptor.descriptorId)).toBe(false);
    expect(mediaRegistry.authorize(10, second.descriptor.descriptorId)).toBe(true);
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
    expect(JSON.stringify(unsupported)).not.toMatch(
      /absolutePath|must-not-be-opened|neko-media:/u,
    );

    endpointEpoch = 'endpoint-2';
    const recovered = await runtime.getSnapshot('window-1', {
      schemaVersion: PREVIEW_HOST_RUNTIME_VERSION,
      requestId: 'renderer-reload',
      projectId: unsupported.identity.projectId,
      workspaceId: unsupported.identity.workspaceId,
      viewId: unsupported.identity.viewId,
      viewEpoch: unsupported.identity.viewEpoch,
      sessionId: unsupported.identity.sessionId,
      endpointEpoch,
    });
    expect(recovered.identity).toMatchObject({
      endpointEpoch: 'endpoint-2',
      revision: unsupported.identity.revision + 1,
    });
    await expect(
      runtime.getSnapshot('window-1', {
        schemaVersion: PREVIEW_HOST_RUNTIME_VERSION,
        requestId: 'late-renderer',
        projectId: unsupported.identity.projectId,
        workspaceId: unsupported.identity.workspaceId,
        viewId: unsupported.identity.viewId,
        viewEpoch: unsupported.identity.viewEpoch,
        sessionId: unsupported.identity.sessionId,
        endpointEpoch: 'endpoint-1',
      }),
    ).rejects.toThrow('endpoint is stale');
  });
});

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
