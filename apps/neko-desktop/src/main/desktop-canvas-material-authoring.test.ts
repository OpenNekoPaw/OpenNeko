import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import type { CanvasHostRuntimeIdentity } from '@neko/canvas-domain';
import { type ContentLocator } from '@neko/content-domain';
import {
  DEFAULT_CANVAS_DATA,
  isCanvasEmbedNode,
  isFileNode,
  isMediaNode,
  type CanvasData,
  type CanvasMaterialMediaKind,
  type CanvasNode,
  type CanvasReferencedContentLocator,
} from '@neko/canvas-domain';
import { ConsoleLogger } from '@neko/shared/logger';
import { createWorkspaceLinkedMediaLibrary } from '@neko/assets-node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElectronNekoHostPorts } from './electron-host-ports';
import { CanvasMaterialAuthoringService } from '@neko/canvas-node';
import {
  createGlobalMediaLibraryConnection,
  ProjectMediaLibraryBindingRepository,
} from '@neko/assets-node';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe('CanvasMaterialAuthoringService', () => {
  it('sizes authorized and imported images from their intrinsic dimensions', async () => {
    const fixture = await createFixture();
    await writeFixtureBytes(
      fixture.workspace.workspacePath,
      'media/portrait.png',
      pngHeader(800, 1200),
    );
    const externalRoot = await mkdtemp(path.join(tmpdir(), 'openneko-image-source-'));
    roots.push(externalRoot);
    const externalPath = path.join(externalRoot, 'landscape.png');
    await writeFile(externalPath, pngHeader(1600, 900));
    const service = new CanvasMaterialAuthoringService({
      host: fixture.host,
      globalMediaLibraryRoot: fixture.globalMediaLibraryRoot,
    });

    let canvas = await service.author({
      canvas: emptyCanvas(),
      identity: fixture.identity,
      workspace: fixture.workspace,
      request: directRequest(
        fixture.identity,
        { file: { authority: 'workspace', path: 'media/portrait.png' } },
        'image',
      ),
    });
    const token = service.registerExternalSource(fixture.workspace, {
      absolutePath: externalPath,
      sourceName: 'landscape.png',
    });
    canvas = await service.author({
      canvas,
      identity: fixture.identity,
      workspace: fixture.workspace,
      request: {
        kind: 'external-import',
        identity: materialIdentity(fixture.identity),
        sourceToken: token,
        sourceName: 'landscape.png',
        mediaKind: 'image',
        conflictPolicy: 'reject',
      },
    });

    expect(canvas.nodes.map((node) => node.size)).toEqual([
      { width: 80, height: 120 },
      { width: 120, height: 67.5 },
    ]);
    expect(canvas.nodes.every((node) => !('intrinsicDimensions' in node.data))).toBe(true);
    service.dispose();
  });

  it('projects authorized workspace, linked-library, document and package locators exactly', async () => {
    const fixture = await createFixture();
    await writeFixtureFile(fixture.workspace.workspacePath, 'media/cat.png', 'cat');
    await writeFixtureFile(fixture.workspace.workspacePath, 'documents/story.epub', 'book');
    const linkedRoot = await mkdtemp(path.join(tmpdir(), 'openneko-linked-library-'));
    roots.push(linkedRoot);
    await writeFixtureFile(linkedRoot, 'shots/clip.mp4', 'clip');
    await writeFixtureFile(linkedRoot, 'books/story.epub', 'book');
    await bindProjectMediaLibrary(fixture, linkedRoot, 'Editorial');
    const authorizePackageResource = vi.fn(async () => undefined);
    const service = new CanvasMaterialAuthoringService({
      host: fixture.host,
      globalMediaLibraryRoot: fixture.globalMediaLibraryRoot,
      authorizePackageResource,
    });

    let canvas = emptyCanvas();
    canvas = await service.author({
      canvas,
      identity: fixture.identity,
      workspace: fixture.workspace,
      request: directRequest(
        fixture.identity,
        { file: { authority: 'workspace', path: 'media/cat.png' } },
        'image',
      ),
    });
    canvas = await service.author({
      canvas,
      identity: fixture.identity,
      workspace: fixture.workspace,
      request: directRequest(
        fixture.identity,
        { file: { authority: 'workspace', path: 'neko/assets/Editorial/shots/clip.mp4' } },
        'video',
      ),
    });
    canvas = await service.author({
      canvas,
      identity: fixture.identity,
      workspace: fixture.workspace,
      request: directRequest(
        fixture.identity,
        {
          file: { authority: 'workspace', path: 'documents/story.epub' },
          selector: { kind: 'entry', path: 'chapters/one.xhtml' },
        },
        'document',
      ),
    });
    canvas = await service.author({
      canvas,
      identity: fixture.identity,
      workspace: fixture.workspace,
      request: directRequest(
        fixture.identity,
        {
          file: { authority: 'workspace', path: 'neko/assets/Editorial/books/story.epub' },
          selector: { kind: 'entry', path: 'chapters/two.xhtml' },
        },
        'document',
      ),
    });
    canvas = await service.author({
      canvas,
      identity: fixture.identity,
      workspace: fixture.workspace,
      request: directRequest(
        fixture.identity,
        {
          file: {
            authority: 'package',
            packageId: 'character-pack',
            revision: '1',
            path: 'models/hero.glb',
          },
        },
        'model',
      ),
    });

    expect(canvas.nodes.map(contentLocatorOf)).toEqual([
      { file: { authority: 'workspace', path: 'media/cat.png' } },
      { file: { authority: 'workspace', path: 'neko/assets/Editorial/shots/clip.mp4' } },
      {
        file: { authority: 'workspace', path: 'documents/story.epub' },
        selector: { kind: 'entry', path: 'chapters/one.xhtml' },
      },
      {
        file: { authority: 'workspace', path: 'neko/assets/Editorial/books/story.epub' },
        selector: { kind: 'entry', path: 'chapters/two.xhtml' },
      },
      {
        file: {
          authority: 'package',
          packageId: 'character-pack',
          revision: '1',
          path: 'models/hero.glb',
        },
      },
    ]);
    expect(authorizePackageResource).toHaveBeenCalledOnce();
    expect(await readFile(path.join(linkedRoot, 'shots/clip.mp4'), 'utf8')).toBe('clip');
    service.dispose();
  });

  it('atomically imports an external source with a fingerprint and visible rename policy', async () => {
    const fixture = await createFixture();
    const externalRoot = await mkdtemp(path.join(tmpdir(), 'openneko-external-source-'));
    roots.push(externalRoot);
    const firstSource = path.join(externalRoot, 'clip.mp4');
    await writeFile(firstSource, 'first');
    const service = new CanvasMaterialAuthoringService({
      host: fixture.host,
      globalMediaLibraryRoot: fixture.globalMediaLibraryRoot,
    });

    const firstToken = service.registerExternalSource(fixture.workspace, {
      absolutePath: firstSource,
      sourceName: 'clip.mp4',
    });
    let canvas = await service.author({
      canvas: emptyCanvas(),
      identity: fixture.identity,
      workspace: fixture.workspace,
      request: externalRequest(fixture.identity, firstToken, 'clip.mp4', 'rename'),
    });

    const secondSource = path.join(externalRoot, 'replacement.mp4');
    await writeFile(secondSource, 'second');
    const secondToken = service.registerExternalSource(fixture.workspace, {
      absolutePath: secondSource,
      sourceName: 'clip.mp4',
    });
    canvas = await service.author({
      canvas,
      identity: fixture.identity,
      workspace: fixture.workspace,
      request: externalRequest(fixture.identity, secondToken, 'clip.mp4', 'rename'),
    });

    expect(canvas.nodes.map(contentLocatorOf)).toEqual([
      { file: { authority: 'workspace', path: 'neko/imports/video/clip.mp4' } },
      expect.objectContaining({
        file: { authority: 'workspace', path: 'neko/imports/video/clip 2.mp4' },
      }),
    ]);
    expect(
      await readFile(
        path.join(fixture.workspace.workspacePath, 'neko/imports/video/clip.mp4'),
        'utf8',
      ),
    ).toBe('first');
    expect(
      await readFile(
        path.join(fixture.workspace.workspacePath, 'neko/imports/video/clip 2.mp4'),
        'utf8',
      ),
    ).toBe('second');
    expect(
      (await readdir(path.join(fixture.workspace.workspacePath, 'neko/imports/video'))).some(
        (name) => name.endsWith('.tmp'),
      ),
    ).toBe(false);
    service.dispose();
  });

  it('rejects Canvas-owned binding and copies global Media Library content only when explicit', async () => {
    const fixture = await createFixture();
    const externalLibrary = await mkdtemp(path.join(tmpdir(), 'openneko-global-library-target-'));
    roots.push(externalLibrary);
    await writeFixtureFile(externalLibrary, 'stills/frame.png', 'frame');
    const { libraryId } = await createGlobalMediaLibraryConnection({
      mediaLibraryRoot: fixture.globalMediaLibraryRoot,
      sourceDirectory: externalLibrary,
      locationKind: 'local',
    });
    const service = new CanvasMaterialAuthoringService({
      host: fixture.host,
      globalMediaLibraryRoot: fixture.globalMediaLibraryRoot,
    });

    const initial = emptyCanvas();
    await expect(
      service.author({
        canvas: initial,
        identity: fixture.identity,
        workspace: fixture.workspace,
        request: {
          kind: 'global-library-link',
          identity: materialIdentity(fixture.identity),
          globalLibraryId: libraryId,
        },
      }),
    ).rejects.toThrow('project Media owner');

    const copied = await service.author({
      canvas: initial,
      identity: fixture.identity,
      workspace: fixture.workspace,
      request: {
        kind: 'global-library-copy',
        identity: materialIdentity(fixture.identity),
        globalLibraryId: libraryId,
        entryId: 'stills/frame.png',
        mediaKind: 'image',
        conflictPolicy: 'reject',
      },
    });
    expect(copied.nodes).toHaveLength(1);
    expect(contentLocatorOf(copied.nodes[0])).toEqual(
      expect.objectContaining({
        file: { authority: 'workspace', path: 'neko/imports/image/frame.png' },
      }),
    );
    expect(
      await readFile(
        path.join(fixture.workspace.workspacePath, 'neko/imports/image/frame.png'),
        'utf8',
      ),
    ).toBe('frame');
    service.dispose();
  });

  it('rejects expired, conflicting and oversized imports without mutating the Canvas', async () => {
    const fixture = await createFixture();
    const externalRoot = await mkdtemp(path.join(tmpdir(), 'openneko-import-failure-'));
    roots.push(externalRoot);
    await writeFixtureFile(fixture.workspace.workspacePath, 'neko/imports/video/clip.mp4', 'kept');
    const sourcePath = path.join(externalRoot, 'clip.mp4');
    await writeFile(sourcePath, 'too-large');
    const service = new CanvasMaterialAuthoringService({
      host: fixture.host,
      globalMediaLibraryRoot: fixture.globalMediaLibraryRoot,
      maxImportBytes: 4,
    });
    const canvas = emptyCanvas();
    const token = service.registerExternalSource(fixture.workspace, {
      absolutePath: sourcePath,
      sourceName: 'clip.mp4',
    });

    await expect(
      service.author({
        canvas,
        identity: fixture.identity,
        workspace: fixture.workspace,
        request: externalRequest(fixture.identity, token, 'clip.mp4', 'reject'),
      }),
    ).rejects.toThrow('import size limit');
    await expect(
      service.author({
        canvas,
        identity: fixture.identity,
        workspace: fixture.workspace,
        request: externalRequest(fixture.identity, token, 'clip.mp4', 'reject'),
      }),
    ).rejects.toThrow('authorization expired');
    expect(canvas.nodes).toEqual([]);
    expect(
      await readFile(
        path.join(fixture.workspace.workspacePath, 'neko/imports/video/clip.mp4'),
        'utf8',
      ),
    ).toBe('kept');
    expect(
      (await readdir(path.join(fixture.workspace.workspacePath, 'neko/imports/video'))).some(
        (name) => name.endsWith('.tmp'),
      ),
    ).toBe(false);
    service.dispose();
  });

  it('commits owner-produced derivatives as new nodes and preserves the referenced source', async () => {
    const fixture = await createFixture();
    await writeFixtureFile(fixture.workspace.workspacePath, 'media/source.png', 'source');
    await writeFixtureFile(
      fixture.workspace.workspacePath,
      'neko/derived/crop/source-cropped.png',
      'derived',
    );
    const service = new CanvasMaterialAuthoringService({
      host: fixture.host,
      globalMediaLibraryRoot: fixture.globalMediaLibraryRoot,
    });
    const source = await service.author({
      canvas: emptyCanvas(),
      identity: fixture.identity,
      workspace: fixture.workspace,
      request: directRequest(
        fixture.identity,
        { file: { authority: 'workspace', path: 'media/source.png' } },
        'image',
      ),
    });
    const sourceNode = source.nodes[0];
    if (!sourceNode) throw new Error('Fixture source node was not created.');

    const derived = await service.author({
      canvas: source,
      identity: fixture.identity,
      workspace: fixture.workspace,
      request: {
        kind: 'derived-output-commit',
        identity: materialIdentity(fixture.identity),
        locator: { file: { authority: 'workspace', path: 'neko/derived/crop/source-cropped.png' } },
        mediaKind: 'image',
        title: 'source-cropped.png',
        sourceNodeIds: [sourceNode.id],
      },
    });

    expect(derived.nodes).toHaveLength(2);
    expect(derived.nodes[0]).toEqual(sourceNode);
    expect(contentLocatorOf(derived.nodes[1])).toEqual({
      file: { authority: 'workspace', path: 'neko/derived/crop/source-cropped.png' },
    });
    expect(derived.nodes[1]?.data).not.toHaveProperty('generation');
    expect(derived.connections).toEqual([
      expect.objectContaining({
        sourceId: sourceNode.id,
        targetId: derived.nodes[1]?.id,
        type: 'derived-from',
      }),
    ]);
    service.dispose();
  });

  it('authorizes and explicitly replaces a non-stale Entity representation', async () => {
    const fixture = await createFixture();
    await writeFixtureFile(fixture.workspace.workspacePath, 'characters/neko-original.png', 'one');
    await writeFixtureFile(
      fixture.workspace.workspacePath,
      'characters/neko-replacement.png',
      'two',
    );
    const service = new CanvasMaterialAuthoringService({
      host: fixture.host,
      globalMediaLibraryRoot: fixture.globalMediaLibraryRoot,
    });
    const originalEntity = {
      entityId: 'character-neko',
      bindingId: 'binding-neko-original',
      role: 'portrait',
    } as const;
    const original = await service.author({
      canvas: emptyCanvas(),
      identity: fixture.identity,
      workspace: fixture.workspace,
      request: {
        ...directRequest(
          fixture.identity,
          { file: { authority: 'workspace', path: 'characters/neko-original.png' } },
          'image',
        ),
        entity: originalEntity,
      },
    });
    const node = original.nodes[0];
    if (!node) throw new Error('Fixture Entity node was not created.');
    const originalSnapshot = structuredClone(original);

    await expect(
      service.author({
        canvas: original,
        identity: fixture.identity,
        workspace: fixture.workspace,
        request: {
          kind: 'entity-representation-replace',
          identity: materialIdentity(fixture.identity),
          nodeId: node.id,
          expectedEntity: { ...originalEntity, bindingId: 'stale-binding' },
          locator: { file: { authority: 'workspace', path: 'characters/neko-replacement.png' } },
          mediaKind: 'image',
          title: 'neko-replacement.png',
          entity: {
            ...originalEntity,
            bindingId: 'binding-neko-replacement',
          },
        },
      }),
    ).rejects.toThrow('refresh is stale');

    const replaced = await service.author({
      canvas: original,
      identity: fixture.identity,
      workspace: fixture.workspace,
      request: {
        kind: 'entity-representation-replace',
        identity: materialIdentity(fixture.identity),
        nodeId: node.id,
        expectedEntity: originalEntity,
        locator: { file: { authority: 'workspace', path: 'characters/neko-replacement.png' } },
        mediaKind: 'image',
        title: 'neko-replacement.png',
        entity: {
          ...originalEntity,
          bindingId: 'binding-neko-replacement',
        },
      },
    });

    expect(original).toEqual(originalSnapshot);
    expect(replaced.nodes[0]).toMatchObject({
      id: node.id,
      data: {
        contentLocator: {
          file: { authority: 'workspace', path: 'characters/neko-replacement.png' },
        },
        entityRepresentation: {
          entityId: 'character-neko',
          bindingId: 'binding-neko-replacement',
          role: 'portrait',
        },
      },
    });
    service.dispose();
  });
});

async function createFixture() {
  const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-material-workspace-'));
  const globalMediaLibraryRoot = await mkdtemp(
    path.join(tmpdir(), 'openneko-material-global-media-libraries-'),
  );
  roots.push(workspacePath, globalMediaLibraryRoot);
  const identity: CanvasHostRuntimeIdentity = {
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    windowId: 'window-1',
    viewId: 'canvas:view-1',
    viewInstanceId: 'view-instance-1',
    documentId: 'neko/boards/workspace.nkc',
    sessionId: 'canvas-session-1',
    rendererSessionId: 'endpoint-1',
  };
  const workspace: AssetWorkspaceResolution = {
    workspaceId: 'workspace-1',
    workspacePath,
    displayName: 'Fixture',
    locator: { kind: 'relative', value: '.' },
  };
  return {
    workspace,
    identity,
    globalMediaLibraryRoot,
    host: createElectronNekoHostPorts({
      homedir: workspacePath,
      nekoHome: path.join(workspacePath, '.neko-home'),
      workspaceRoot: workspacePath,
      logger: new ConsoleLogger('CanvasMaterialAuthoringTest'),
    }),
  };
}

async function bindProjectMediaLibrary(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  sourceDirectory: string,
  libraryName: string,
): Promise<void> {
  const { libraryId } = await createGlobalMediaLibraryConnection({
    mediaLibraryRoot: fixture.globalMediaLibraryRoot,
    sourceDirectory,
    locationKind: 'local',
  });
  await createWorkspaceLinkedMediaLibrary({
    workspaceRoot: fixture.workspace.workspacePath,
    name: libraryName,
    targetDirectory: sourceDirectory,
  });
  await new ProjectMediaLibraryBindingRepository(
    fixture.workspace.workspacePath,
    fixture.identity.projectId,
  ).apply({
    libraryName,
    connectionId: libraryId,
    expectedBindingFingerprint: null,
  });
}

function emptyCanvas(): CanvasData {
  return structuredClone(DEFAULT_CANVAS_DATA);
}

function contentLocatorOf(node: CanvasNode | undefined): ContentLocator | undefined {
  if (!node) return undefined;
  if (isMediaNode(node) || isFileNode(node) || isCanvasEmbedNode(node)) {
    return node.data.contentLocator;
  }
  return undefined;
}

function materialIdentity(identity: CanvasHostRuntimeIdentity) {
  return {
    projectId: identity.projectId,
    canvasId: identity.documentId,
    canvasSessionId: identity.sessionId,
  };
}

function directRequest(
  identity: CanvasHostRuntimeIdentity,
  locator: CanvasReferencedContentLocator,
  mediaKind: CanvasMaterialMediaKind,
) {
  return {
    kind: 'direct-reference' as const,
    identity: materialIdentity(identity),
    locator,
    mediaKind,
  };
}

function externalRequest(
  identity: CanvasHostRuntimeIdentity,
  sourceToken: string,
  sourceName: string,
  conflictPolicy: 'reject' | 'rename',
) {
  return {
    kind: 'external-import' as const,
    identity: materialIdentity(identity),
    sourceToken,
    sourceName,
    mediaKind: 'video' as const,
    conflictPolicy,
  };
}

async function writeFixtureFile(
  root: string,
  relativePath: string,
  contents: string,
): Promise<void> {
  const absolutePath = path.join(root, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents);
}

async function writeFixtureBytes(
  root: string,
  relativePath: string,
  contents: Uint8Array,
): Promise<void> {
  const absolutePath = path.join(root, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents);
}

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}
