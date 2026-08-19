import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import type { CanvasHostRuntimeIdentity } from '@neko/canvas-domain';
import { afterEach, describe, expect, it } from 'vitest';
import { CanvasMediaLibraryCopyService } from './canvas-media-library-copy';
import {
  createGlobalMediaLibraryConnection,
  createProjectMediaLibraryBindingFingerprint,
  ProjectMediaLibraryBindingRepository,
} from '@neko/assets-node';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import { confirmProjectMediaLibraryRecovery } from '@neko/assets-domain/contracts';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('CanvasMediaLibraryCopyService', () => {
  it('copies through the selected project-linked Media Library and preserves the source', async () => {
    const fixture = await createFixture();
    const target = await createRoot('project-media-library');
    await bindProjectMediaLibrary(fixture, target, 'Editorial');
    await mkdir(path.join(target, 'Sequences'));
    await writeWorkspaceFile(fixture.workspace.workspacePath, 'source/shot.mp4', 'source-bytes');

    const result = await fixture.service.copy({
      runtimeIdentity: fixture.identity,
      workspace: fixture.workspace,
      request: {
        kind: 'copy-to-project-media-library',
        identity: materialIdentity(fixture.identity),
        source: { file: { authority: 'workspace', path: 'source/shot.mp4' } },
        libraryName: 'Editorial',
        destinationDirectory: 'Sequences',
        fileName: 'shot.mp4',
        conflictPolicy: 'fail-if-exists',
      },
    });

    expect(result).toEqual({
      status: 'copied',
      destinationKind: 'project-media-library',
      source: { file: { authority: 'workspace', path: 'source/shot.mp4' } },
      destination: {
        file: { authority: 'workspace', path: 'neko/assets/Editorial/Sequences/shot.mp4' },
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
    const { libraryId } = await createGlobalMediaLibraryConnection({
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
        source: { file: { authority: 'workspace', path: 'source/portrait.png' } },
        globalLibraryId: libraryId,
        destinationDirectory: 'Characters',
        fileName: 'portrait.png',
        conflictPolicy: 'fail-if-exists',
      },
    });

    expect(result).toEqual({
      status: 'copied',
      destinationKind: 'global-media-library',
      source: { file: { authority: 'workspace', path: 'source/portrait.png' } },
      globalLibraryId: libraryId,
      entryId: 'Characters/portrait.png',
      byteLength: 8,
    });
    expect(JSON.stringify(result)).not.toContain(target);
    await expect(readFile(path.join(target, 'Characters', 'portrait.png'), 'utf8')).resolves.toBe(
      'portrait',
    );
  });

  it('rejects malformed copy requests locally', async () => {
    const fixture = await createFixture();

    await expect(
      fixture.service.copy({
        runtimeIdentity: fixture.identity,
        workspace: fixture.workspace,
        request: {
          kind: 'unknown-copy-request',
        },
      }),
    ).rejects.toMatchObject({
      name: 'CanvasMediaLibraryCopyContractError',
      code: 'invalid-request',
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
          source: { file: { authority: 'workspace', path: 'source/portrait.png' } },
          libraryName: 'Editorial',
          destinationDirectory: '',
          fileName: 'portrait.png',
          conflictPolicy: 'fail-if-exists',
        },
      }),
    ).rejects.toMatchObject({
      name: 'CanvasMediaLibraryCopyContractError',
      code: 'canvas-media-library-identity-mismatch',
    });
  });
});

async function createFixture(): Promise<{
  readonly workspace: AssetWorkspaceResolution;
  readonly identity: CanvasHostRuntimeIdentity;
  readonly globalMediaLibraryRoot: string;
  readonly service: CanvasMediaLibraryCopyService;
}> {
  const workspacePath = await createRoot('workspace');
  const globalMediaLibraryRoot = await createRoot('global-registry');
  const identity: CanvasHostRuntimeIdentity = {
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    windowId: 'window-1',
    viewId: 'canvas-1',
    viewInstanceId: 'view-instance-1',
    documentId: 'neko/boards/workspace.nkc',
    sessionId: 'session-1',
    rendererSessionId: 'endpoint-1',
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
    service: new CanvasMediaLibraryCopyService({ globalMediaLibraryRoot }),
  };
}

async function createRoot(name: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), `openneko-${name}-`));
  roots.push(root);
  return root;
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
  const replacementBindingFingerprint = createProjectMediaLibraryBindingFingerprint({
    projectId: fixture.identity.projectId,
    libraryName,
    connectionId: libraryId,
  });
  await new ProjectMediaLibraryBindingRepository(
    fixture.workspace.workspacePath,
    fixture.identity.projectId,
  ).applyRecovery(
    confirmProjectMediaLibraryRecovery({
      projectId: fixture.identity.projectId,
      libraryName,
      connectionId: libraryId,
      requirementFingerprint: 'sha256:test-requirement-1234',
      validatedRelativePaths: [],
      expectedBindingFingerprint: null,
      replacementBindingFingerprint,
    }),
  );
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
