import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import type { CanvasHostRuntimeIdentity } from '@neko-canvas/domain';
import { createWorkspaceLinkedMediaLibrary } from '@neko/shared/node/workspace-linked-media-libraries';
import { afterEach, describe, expect, it } from 'vitest';
import { DesktopCanvasMediaLibraryCopyService } from './desktop-canvas-media-library-copy';
import { createDesktopGlobalMediaLibraryConnection } from './desktop-global-media-library-files';
import type { DesktopWorkspaceResolution } from './desktop-workspace-registry';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('DesktopCanvasMediaLibraryCopyService', () => {
  it('copies through the selected project-linked Media Library and preserves the source', async () => {
    const fixture = await createFixture();
    const target = await createRoot('project-media-library');
    await createWorkspaceLinkedMediaLibrary({
      workspaceRoot: fixture.workspace.workspacePath,
      name: 'Editorial',
      targetDirectory: target,
    });
    await mkdir(path.join(target, 'Sequences'));
    await writeWorkspaceFile(fixture.workspace.workspacePath, 'source/shot.mp4', 'source-bytes');

    const result = await fixture.service.copy({
      runtimeIdentity: fixture.identity,
      workspace: fixture.workspace,
      request: {
        kind: 'copy-to-project-media-library',
        identity: materialIdentity(fixture.identity),
        source: { kind: 'workspace-file', path: 'source/shot.mp4' },
        libraryName: 'Editorial',
        destinationDirectory: 'Sequences',
        fileName: 'shot.mp4',
        conflictPolicy: 'fail-if-exists',
      },
    });

    expect(result).toEqual({
      status: 'copied',
      destinationKind: 'project-media-library',
      source: { kind: 'workspace-file', path: 'source/shot.mp4' },
      destination: {
        kind: 'workspace-file',
        path: 'neko/assets/Editorial/Sequences/shot.mp4',
      },
      byteLength: 12,
    });
    await expect(readFile(path.join(target, 'Sequences', 'shot.mp4'), 'utf8')).resolves.toBe(
      'source-bytes',
    );
    await expect(
      readFile(path.join(fixture.workspace.workspacePath, 'source', 'shot.mp4'), 'utf8'),
    ).resolves.toBe('source-bytes');
  });

  it('copies through the selected Desktop-global Media Library without persisting its absolute path', async () => {
    const fixture = await createFixture();
    const target = await createRoot('global-media-library');
    const { libraryId } = await createDesktopGlobalMediaLibraryConnection({
      mediaLibraryRoot: fixture.globalMediaLibraryRoot,
      sourceDirectory: target,
      locationKind: 'local',
    });
    await writeWorkspaceFile(fixture.workspace.workspacePath, 'source/portrait.png', 'portrait');

    const result = await fixture.service.copy({
      runtimeIdentity: fixture.identity,
      workspace: fixture.workspace,
      request: {
        kind: 'copy-to-global-media-library',
        identity: materialIdentity(fixture.identity),
        source: { kind: 'workspace-file', path: 'source/portrait.png' },
        globalLibraryId: libraryId,
        destinationDirectory: 'Characters',
        fileName: 'portrait.png',
        conflictPolicy: 'fail-if-exists',
      },
    });

    expect(result).toEqual({
      status: 'copied',
      destinationKind: 'global-media-library',
      source: { kind: 'workspace-file', path: 'source/portrait.png' },
      globalLibraryId: libraryId,
      entryId: 'Characters/portrait.png',
      byteLength: 8,
    });
    expect(JSON.stringify(result)).not.toContain(target);
    await expect(readFile(path.join(target, 'Characters', 'portrait.png'), 'utf8')).resolves.toBe(
      'portrait',
    );
  });

  it('poisons ambiguous legacy promotion requests with a migration-required diagnostic', async () => {
    const fixture = await createFixture();

    await expect(
      fixture.service.copy({
        runtimeIdentity: fixture.identity,
        workspace: fixture.workspace,
        request: {
          kind: 'saveCanvasMaterialToAssetLibrary',
          identity: materialIdentity(fixture.identity),
          source: { kind: 'workspace-file', path: 'source/portrait.png' },
        },
      }),
    ).rejects.toMatchObject({
      name: 'DesktopCanvasMediaLibraryCopyContractError',
      code: 'migration-required',
    });
  });

  it('rejects stale Canvas identity before reading or mutating content', async () => {
    const fixture = await createFixture();

    await expect(
      fixture.service.copy({
        runtimeIdentity: fixture.identity,
        workspace: fixture.workspace,
        request: {
          kind: 'copy-to-project-media-library',
          identity: { ...materialIdentity(fixture.identity), canvasSessionId: 'stale-session' },
          source: { kind: 'workspace-file', path: 'source/portrait.png' },
          libraryName: 'Editorial',
          destinationDirectory: '',
          fileName: 'portrait.png',
          conflictPolicy: 'fail-if-exists',
        },
      }),
    ).rejects.toMatchObject({
      name: 'DesktopCanvasMediaLibraryCopyContractError',
      code: 'canvas-media-library-identity-mismatch',
    });
  });
});

async function createFixture(): Promise<{
  readonly workspace: DesktopWorkspaceResolution;
  readonly identity: CanvasHostRuntimeIdentity;
  readonly globalMediaLibraryRoot: string;
  readonly service: DesktopCanvasMediaLibraryCopyService;
}> {
  const workspacePath = await createRoot('workspace');
  const globalMediaLibraryRoot = await createRoot('global-registry');
  const identity: CanvasHostRuntimeIdentity = {
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    windowId: 'window-1',
    viewId: 'canvas-1',
    viewEpoch: 1,
    documentId: 'neko/boards/workspace.nkc',
    sessionId: 'session-1',
    endpointEpoch: 'endpoint-1',
  };
  return {
    workspace: {
      workspaceId: identity.workspaceId,
      workspacePath,
      displayName: 'Fixture',
      locator: { kind: 'relative', value: '.' },
    },
    identity,
    globalMediaLibraryRoot,
    service: new DesktopCanvasMediaLibraryCopyService({ globalMediaLibraryRoot }),
  };
}

async function createRoot(name: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), `openneko-${name}-`));
  roots.push(root);
  return root;
}

async function writeWorkspaceFile(
  workspaceRoot: string,
  relativePath: string,
  value: string,
): Promise<void> {
  const filePath = path.join(workspaceRoot, ...relativePath.split('/'));
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value);
}

function materialIdentity(identity: CanvasHostRuntimeIdentity) {
  return {
    projectId: identity.projectId,
    canvasId: identity.documentId,
    canvasSessionId: identity.sessionId,
  };
}
