import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import type {
  PrepareTextEditorMarkdownMediaRequest,
  ReleaseTextEditorMarkdownMediaRequest,
} from '@neko/text-editor-domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  NodeTextEditorMarkdownMediaService,
  type NodeTextEditorMarkdownMediaResourcePort,
} from './node-markdown-media-service';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Node Text Editor Markdown media service', () => {
  it.each([
    ['image', 'assets/cover.png', 'image/png', '![封面](assets/cover.png)'],
    ['audio', 'assets/theme.mp3', 'audio/mpeg', '![[assets/theme.mp3]]'],
    ['video', 'assets/trailer.mp4', 'video/mp4', '![[assets/trailer.mp4]]'],
  ] as const)(
    'projects one authorized %s through the opaque resource port',
    async (kind, target, contentType, source) => {
      const workspacePath = await createWorkspaceFile(target);
      const resourceLease = lease(`openneko://resource/${'a'.repeat(32)}`);
      const resources = { registerFile: vi.fn(async () => resourceLease) };
      const service = createService(workspacePath, resources);
      const request = mediaRequest(source, target);

      await expect(
        service.prepare({
          request,
          source,
          resourceOwner: resourceOwner(),
          isCurrent: () => true,
        }),
      ).resolves.toEqual({
        ...request,
        status: 'ready',
        descriptor: {
          leaseId: 'lease-1',
          kind,
          renderUri: resourceLease.url,
          contentType,
          displayName: path.basename(target),
        },
      });
      expect(resources.registerFile).toHaveBeenCalledWith(resourceOwner(), {
        absolutePath: await realpath(path.join(workspacePath, ...target.split('/'))),
        mediaType: contentType,
      });
      expect(JSON.stringify(request)).not.toContain(workspacePath);
    },
  );

  it('rejects unsupported and missing targets without trying another resource authority', async () => {
    const workspacePath = await createWorkspaceFile('assets/notes.txt');
    const resources = rejectingResources();
    const service = createService(workspacePath, resources);
    const resolveWorkspace = vi.fn(async () => workspace(workspacePath));
    const isolated = new NodeTextEditorMarkdownMediaService({
      resolveWorkspace,
      globalMediaLibraryRoot: '/private/global-media-libraries',
      resources,
      createLeaseId: () => 'lease-1',
    });

    await expect(
      isolated.prepare({
        request: mediaRequest('![[assets/notes.txt]]', 'assets/notes.txt'),
        source: '![[assets/notes.txt]]',
        resourceOwner: resourceOwner(),
        isCurrent: () => true,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'text-editor-markdown-media-unsupported' },
    });
    expect(resolveWorkspace).not.toHaveBeenCalled();

    await expect(
      service.prepare({
        request: mediaRequest('![[assets/missing.png]]', 'assets/missing.png'),
        source: '![[assets/missing.png]]',
        resourceOwner: resourceOwner(),
        isCurrent: () => true,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'text-editor-markdown-media-missing' },
    });
    expect(resources.registerFile).not.toHaveBeenCalled();

    const linkedProjection = '![[neko/assets/References/cover.png]]';
    await expect(
      service.prepare({
        request: mediaRequest(linkedProjection, 'neko/assets/References/cover.png'),
        source: linkedProjection,
        resourceOwner: resourceOwner(),
        isCurrent: () => true,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'text-editor-markdown-media-unauthorized' },
    });
  });

  it('rejects an escaped symlink without registering its physical target', async () => {
    const workspacePath = await createWorkspaceFile('notes/readme.md');
    const outsideRoot = await mkdtemp(path.join(tmpdir(), 'openneko-media-outside-'));
    roots.push(outsideRoot);
    const outsidePath = path.join(outsideRoot, 'outside.png');
    await writeFile(outsidePath, 'outside');
    await symlink(outsidePath, path.join(workspacePath, 'outside.png'));
    const resources = rejectingResources();
    const service = createService(workspacePath, resources);
    const source = '![[outside.png]]';

    await expect(
      service.prepare({
        request: mediaRequest(source, 'outside.png'),
        source,
        resourceOwner: resourceOwner(),
        isCurrent: () => true,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'text-editor-markdown-media-unauthorized' },
    });
    expect(resources.registerFile).not.toHaveBeenCalled();
  });

  it('verifies the exact canonical source token and revokes a late resource lease', async () => {
    const workspacePath = await createWorkspaceFile('assets/cover.png');
    const resourceLease = lease(`openneko://resource/${'b'.repeat(32)}`);
    const service = createService(workspacePath, {
      registerFile: vi.fn(async () => resourceLease),
    });
    const source = '![[assets/cover.png]]';
    const request = mediaRequest(source, 'assets/cover.png');

    await expect(
      service.prepare({
        request: { ...request, token: { ...request.token, from: 1, to: request.token.to } },
        source,
        resourceOwner: resourceOwner(),
        isCurrent: () => true,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'text-editor-markdown-media-projection-failed' },
    });

    let checks = 0;
    await expect(
      service.prepare({
        request,
        source,
        resourceOwner: resourceOwner(),
        isCurrent: () => {
          checks += 1;
          return checks < 3;
        },
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'text-editor-markdown-media-stale-surface' },
    });
    expect(resourceLease.release).toHaveBeenCalledOnce();
  });

  it('releases only an exactly owned lease and preserves its sibling', async () => {
    const workspacePath = await createWorkspaceFile('assets/cover.png');
    const firstLease = lease(`openneko://resource/${'c'.repeat(32)}`);
    const secondLease = lease(`openneko://resource/${'d'.repeat(32)}`);
    const service = new NodeTextEditorMarkdownMediaService({
      resolveWorkspace: async () => workspace(workspacePath),
      globalMediaLibraryRoot: '/private/global-media-libraries',
      resources: {
        registerFile: vi.fn().mockResolvedValueOnce(firstLease).mockResolvedValueOnce(secondLease),
      },
      createLeaseId: sequence('lease-1', 'lease-2'),
    });
    const source = '![[assets/cover.png]]';
    const request = mediaRequest(source, 'assets/cover.png');
    await service.prepare({
      request,
      source,
      resourceOwner: resourceOwner(),
      isCurrent: () => true,
    });
    await service.prepare({
      request: { ...request, requestId: 'media-request-2', surfaceId: 'surface-2' },
      source,
      resourceOwner: resourceOwner(),
      isCurrent: () => true,
    });

    const releaseRequest: ReleaseTextEditorMarkdownMediaRequest = {
      requestId: 'release-1',
      identity: request.identity,
      sessionId: request.sessionId,
      surfaceId: request.surfaceId,
      leaseId: 'lease-1',
    };
    expect(() => service.release({ ...releaseRequest, surfaceId: 'surface-2' })).toThrow(
      'lease owner is stale or unavailable',
    );
    expect(firstLease.release).not.toHaveBeenCalled();
    expect(secondLease.release).not.toHaveBeenCalled();

    service.release(releaseRequest);
    expect(firstLease.release).toHaveBeenCalledOnce();
    expect(secondLease.release).not.toHaveBeenCalled();
    service.releaseSession(request.sessionId);
    expect(secondLease.release).toHaveBeenCalledOnce();
  });

  it('revokes a Host lease whose adapter returns a forbidden render URI', async () => {
    const workspacePath = await createWorkspaceFile('assets/cover.png');
    const resourceLease = lease('file:///tmp/cover.png');
    const service = createService(workspacePath, {
      registerFile: vi.fn(async () => resourceLease),
    });
    const source = '![[assets/cover.png]]';

    await expect(
      service.prepare({
        request: mediaRequest(source, 'assets/cover.png'),
        source,
        resourceOwner: resourceOwner(),
        isCurrent: () => true,
      }),
    ).rejects.toThrow('requires a Host-projected runtime URI');
    expect(resourceLease.release).toHaveBeenCalledOnce();
    service.releaseSession('session-1');
    expect(resourceLease.release).toHaveBeenCalledOnce();
  });
});

function createService(
  workspacePath: string,
  resources: NodeTextEditorMarkdownMediaResourcePort,
): NodeTextEditorMarkdownMediaService {
  return new NodeTextEditorMarkdownMediaService({
    resolveWorkspace: async () => workspace(workspacePath),
    globalMediaLibraryRoot: '/private/global-media-libraries',
    resources,
    createLeaseId: () => 'lease-1',
  });
}

async function createWorkspaceFile(relativePath: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'openneko-markdown-media-'));
  roots.push(root);
  const absolutePath = path.join(root, ...relativePath.split('/'));
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, 'fixture');
  return root;
}

function workspace(workspacePath: string) {
  return {
    workspaceId: 'workspace-1',
    workspacePath,
    displayName: 'Fixture',
    locator: { kind: 'relative' as const, value: 'fixture' },
  };
}

function mediaRequest(source: string, target: string): PrepareTextEditorMarkdownMediaRequest {
  const commonMark = source.startsWith('![') && !source.startsWith('![[');
  return {
    requestId: 'media-request-1',
    identity: {
      owner: { kind: 'window', windowId: 'window-1', projectId: 'project-1' },
      workspaceId: 'workspace-1',
      documentId: 'notes/readme.md',
      locator: { kind: 'workspace-file', path: 'notes/readme.md' },
    },
    sessionId: 'session-1',
    editSequence: 0,
    surfaceId: 'surface-1',
    token: {
      kind: commonMark ? 'commonmark-image' : 'resource-embed',
      from: 0,
      to: source.length,
      target,
      ...(commonMark ? { altText: '封面' } : {}),
    },
  };
}

function resourceOwner() {
  return {
    windowId: 'window-1',
    viewId: 'view-1',
    sessionId: 'session-1',
    rendererSessionId: 'renderer-1',
  };
}

function lease(url: string) {
  return { url, release: vi.fn() };
}

function rejectingResources() {
  return {
    registerFile: vi.fn(async () => {
      throw new Error('Resource registration must not be reached.');
    }),
  };
}

function sequence(...values: string[]): () => string {
  return () => values.shift() ?? 'lease-next';
}
