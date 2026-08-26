import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CanvasAudioExtractionService,
  type CanvasAudioExtractionMediaPort,
} from './canvas-audio-extraction';

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('CanvasAudioExtractionService', () => {
  it('transcodes the exact authorized video into a unique Workspace audio derivative', async () => {
    const fixture = await createFixture();
    const sourcePath = await realpath(
      await writeWorkspaceFile(fixture.workspace, 'media/cat.mp4', 'video'),
    );
    const probe = vi.fn(async () => availableVideoProbe());
    const transcode = vi.fn(async (_input: string, output: string) => {
      await writeFile(output, 'audio');
    });
    const dispose = vi.fn(async () => undefined);
    const service = createService(fixture, { probe, transcode, dispose });

    await expect(
      service.resolveAvailability({
        projectId: 'project-1',
        workspace: fixture.workspace,
        source: workspaceLocator('media/cat.mp4'),
      }),
    ).resolves.toEqual({ status: 'available' });
    const result = await service.extract({
      projectId: 'project-1',
      workspace: fixture.workspace,
      source: workspaceLocator('media/cat.mp4'),
    });

    expect(result).toEqual({
      locator: {
        file: {
          authority: 'workspace',
          path: 'neko/derived/audio/cat-audio-output-1.m4a',
        },
      },
      title: 'cat-audio.m4a',
    });
    expect(probe).toHaveBeenNthCalledWith(1, sourcePath);
    expect(probe).toHaveBeenNthCalledWith(2, sourcePath, undefined);
    expect(transcode).toHaveBeenCalledWith(
      sourcePath,
      path.join(fixture.workspace.workspacePath, 'neko/derived/audio/cat-audio-output-1.m4a'),
      { kind: 'audio' },
      undefined,
    );
    expect(
      await readFile(path.join(fixture.workspace.workspacePath, result.locator.file.path), 'utf8'),
    ).toBe('audio');
    await service.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('disables only audio extraction when the selected video has no audio stream', async () => {
    const fixture = await createFixture();
    await writeWorkspaceFile(fixture.workspace, 'media/silent.mp4', 'video');
    const transcode = vi.fn(async () => undefined);
    const service = createService(fixture, {
      probe: vi.fn(async () => ({ ...availableVideoProbe(), audioStreams: [] })),
      transcode,
      dispose: vi.fn(async () => undefined),
    });

    await expect(
      service.resolveAvailability({
        projectId: 'project-1',
        workspace: fixture.workspace,
        source: workspaceLocator('media/silent.mp4'),
      }),
    ).resolves.toEqual({
      status: 'unavailable',
      diagnostic: {
        code: 'media-audio-stream-unavailable',
        message: 'This video does not contain an audio stream to extract.',
      },
    });
    await expect(
      service.extract({
        projectId: 'project-1',
        workspace: fixture.workspace,
        source: workspaceLocator('media/silent.mp4'),
      }),
    ).rejects.toThrow('does not contain an audio stream');
    expect(transcode).not.toHaveBeenCalled();
    await service.dispose();
  });

  it('rejects an unmanaged symlink in the derived output namespace', async () => {
    const fixture = await createFixture();
    await writeWorkspaceFile(fixture.workspace, 'media/cat.mp4', 'video');
    const external = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-audio-external-'));
    roots.push(external);
    await symlink(external, path.join(fixture.workspace.workspacePath, 'neko'));
    const transcode = vi.fn(async () => undefined);
    const service = createService(fixture, {
      probe: vi.fn(async () => availableVideoProbe()),
      transcode,
      dispose: vi.fn(async () => undefined),
    });

    await expect(
      service.extract({
        projectId: 'project-1',
        workspace: fixture.workspace,
        source: workspaceLocator('media/cat.mp4'),
      }),
    ).rejects.toThrow('derived audio directory is unavailable');
    expect(transcode).not.toHaveBeenCalled();
    await expect(
      readFile(path.join(external, 'derived/audio/cat-audio-output-1.m4a')),
    ).rejects.toThrow('ENOENT');
    await service.dispose();
  });
});

async function createFixture(): Promise<{
  readonly workspace: AssetWorkspaceResolution;
  readonly globalMediaLibraryRoot: string;
}> {
  const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-audio-workspace-'));
  roots.push(workspacePath);
  return {
    workspace: {
      workspaceId: 'workspace-1',
      workspacePath,
      displayName: 'Fixture',
      locator: { kind: 'relative', value: '.' },
    },
    globalMediaLibraryRoot: path.join(workspacePath, '.global-media-libraries'),
  };
}

function createService(
  fixture: { readonly globalMediaLibraryRoot: string },
  media: CanvasAudioExtractionMediaPort,
): CanvasAudioExtractionService {
  return new CanvasAudioExtractionService({
    globalMediaLibraryRoot: fixture.globalMediaLibraryRoot,
    media,
    createId: () => 'output-1',
  });
}

async function writeWorkspaceFile(
  workspace: AssetWorkspaceResolution,
  relativePath: string,
  contents: string,
): Promise<string> {
  const absolutePath = path.join(workspace.workspacePath, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents);
  return absolutePath;
}

function workspaceLocator(relativePath: string) {
  return { file: { authority: 'workspace' as const, path: relativePath } };
}

function availableVideoProbe() {
  return {
    durationSeconds: 5,
    video: {
      streamIndex: 0,
      codecName: 'h264',
      width: 1280,
      height: 720,
      framesPerSecond: 30,
      color: {},
    },
    audioStreams: [
      {
        streamIndex: 1,
        codecName: 'aac',
        sampleRate: 48_000,
        channels: 2,
      },
    ],
  };
}
