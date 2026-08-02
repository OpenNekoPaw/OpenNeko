import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import type { HtmlVideoDescriptor, MediaProbe } from '@neko/media';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DesktopCanvasMediaRuntime,
  type DesktopCanvasNodeMediaPort,
} from './desktop-canvas-media-runtime';
import { DesktopResourceRegistry } from './desktop-resource-registry';

const roots: string[] = [];
const registries: DesktopResourceRegistry[] = [];

afterEach(async () => {
  for (const registry of registries.splice(0)) registry.dispose();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('DesktopCanvasMediaRuntime', () => {
  it('projects probe and playback descriptors through the package media runtime', async () => {
    const workspacePath = await createWorkspace('cases/test.aac');
    const media = createMediaPort();
    const runtime = createRuntime(media);
    const workspace = createWorkspaceResolution(workspacePath);

    const probe = await runtime.execute(
      {
        identity,
        type: 'media:probe',
        nodeId: 'audio-1',
        locator: { kind: 'workspace-file', path: 'cases/test.aac' },
        mediaType: 'audio',
      },
      workspace,
    );
    expect(probe).toEqual({
      type: 'media:probeResult',
      nodeId: 'audio-1',
      mediaInfo: {
        duration: 12,
        width: 0,
        height: 0,
        fps: 0,
        codec: 'aac',
        format: 'aac',
        hasAudio: true,
        audioCodec: 'aac',
        audioSampleRate: 48_000,
        audioChannels: 2,
      },
    });

    const play = await runtime.execute(
      {
        identity,
        type: 'media:play',
        nodeId: 'audio-1',
        locator: { kind: 'workspace-file', path: 'cases/test.aac' },
        mediaType: 'audio',
        mediaInfo:
          probe?.type === 'media:probeResult' && probe.mediaInfo
            ? probe.mediaInfo
            : failMediaInfo(),
        startTime: 0,
        speed: 1,
      },
      workspace,
    );
    expect(play).toMatchObject({
      type: 'media:streamReady',
      nodeId: 'audio-1',
      contentLocator: { kind: 'workspace-file', path: 'cases/test.aac' },
      audio: {
        url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
    });
    expect(media.publishFile).toHaveBeenCalledWith(
      await realpath(path.join(workspacePath, 'cases/test.aac')),
      'audio/aac',
    );

    runtime.detachWindow(identity.windowId);
    await runtime.dispose();
    expect(media.stop).toHaveBeenCalledWith('audio-session-1');
    expect(media.dispose).toHaveBeenCalledOnce();
  });

  it('returns a fail-visible media response for a source outside workspace authorization', async () => {
    const workspacePath = await createWorkspace('cases/test.aac');
    const outsidePath = await createWorkspace('secret.aac');
    const media = createMediaPort();
    const runtime = createRuntime(media);

    const response = await runtime.execute(
      {
        identity,
        type: 'media:probe',
        nodeId: 'audio-1',
        locator: {
          kind: 'workspace-file',
          path: path.relative(workspacePath, path.join(outsidePath, 'secret.aac')),
        },
        mediaType: 'audio',
      },
      createWorkspaceResolution(workspacePath),
    );

    expect(response).toMatchObject({
      type: 'media:probeResult',
      nodeId: 'audio-1',
      error: 'ContentLocator is outside its authorized workspace source.',
    });
    expect(media.probe).not.toHaveBeenCalled();
    await runtime.dispose();
  });

  it('returns one native Canvas video descriptor without a duplicate PCM stream', async () => {
    const workspacePath = await createWorkspace('media/test.mp4');
    const media = createMediaPort();
    const runtime = createRuntime(media);

    const response = await runtime.execute(
      {
        identity,
        type: 'media:play',
        nodeId: 'video-1',
        locator: { kind: 'workspace-file', path: 'media/test.mp4' },
        mediaType: 'video',
        mediaInfo: {
          duration: 12,
          width: 1920,
          height: 1080,
          fps: 30,
          codec: 'h264',
          format: 'mp4',
          hasAudio: true,
        },
        startTime: 0,
        speed: 1,
      },
      createWorkspaceResolution(workspacePath),
    );

    expect(response).toMatchObject({
      type: 'media:streamReady',
      nodeId: 'video-1',
      contentLocator: { kind: 'workspace-file', path: 'media/test.mp4' },
      video: {
        url: 'openneko://resource/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      },
    });
    if (response?.type !== 'media:streamReady') throw new Error('Expected stream response.');
    expect(response.audio).toBeUndefined();
    expect(media.publishFile).not.toHaveBeenCalled();

    await runtime.execute(
      { identity, type: 'media:stop', nodeId: 'video-1' },
      createWorkspaceResolution(workspacePath),
    );
    await runtime.dispose();
  });

  it('publishes native audio through the owner-scoped resource registry', async () => {
    const workspacePath = await createWorkspace('media/test.wav');
    const registry = createRegistry();
    const runtime = new DesktopCanvasMediaRuntime({ resources: registry });

    const response = await runtime.execute(
      {
        identity,
        type: 'media:play',
        nodeId: 'audio-resource',
        locator: { kind: 'workspace-file', path: 'media/test.wav' },
        mediaType: 'audio',
        mediaInfo: {
          duration: 12,
          width: 0,
          height: 0,
          fps: 0,
          codec: 'pcm_s16le',
          format: 'wav',
          hasAudio: true,
        },
        startTime: 0,
        speed: 1,
      },
      createWorkspaceResolution(workspacePath),
    );

    if (response?.type !== 'media:streamReady' || !response.audio) {
      throw new Error('Expected native Canvas audio descriptor.');
    }
    expect(response.audio.url).toMatch(/^openneko:\/\/resource\/[A-Za-z0-9_-]{32}$/u);
    expect(await (await fetchResource(response.audio.url)).text()).toBe('fixture');

    registry.releaseWindow(identity.windowId);
    expect((await fetchResource(response.audio.url)).status).toBe(404);
    await runtime.execute(
      { identity, type: 'media:stop', nodeId: 'audio-resource' },
      createWorkspaceResolution(workspacePath),
    );
    await runtime.dispose();
  });

  it('isolates two Canvas Views that use the same node identity', async () => {
    const workspacePath = await createWorkspace('media/test.wav');
    const registry = createRegistry();
    const runtime = new DesktopCanvasMediaRuntime({ resources: registry });
    const secondIdentity = {
      ...identity,
      viewId: 'canvas:view-2',
      documentId: 'Second.nkc',
      sessionId: 'canvas-session:canvas:view-2:1',
    };
    const request = {
      type: 'media:play' as const,
      nodeId: 'audio-shared-id',
      locator: { kind: 'workspace-file' as const, path: 'media/test.wav' },
      mediaType: 'audio' as const,
      mediaInfo: {
        duration: 12,
        width: 0,
        height: 0,
        fps: 0,
        codec: 'pcm_s16le',
        format: 'wav',
        hasAudio: true,
      },
      startTime: 0,
      speed: 1,
    };
    const first = await runtime.execute(
      { ...request, identity },
      createWorkspaceResolution(workspacePath),
    );
    const second = await runtime.execute(
      { ...request, identity: secondIdentity },
      createWorkspaceResolution(workspacePath),
    );
    if (
      first?.type !== 'media:streamReady' ||
      !first.audio ||
      second?.type !== 'media:streamReady' ||
      !second.audio
    ) {
      throw new Error('Expected two native Canvas audio descriptors.');
    }

    await runtime.execute(
      { identity, type: 'media:stop', nodeId: request.nodeId },
      createWorkspaceResolution(workspacePath),
    );

    expect((await fetchResource(first.audio.url)).status).toBe(404);
    expect((await fetchResource(second.audio.url)).status).toBe(200);
    await runtime.dispose();
    expect((await fetchResource(second.audio.url)).status).toBe(404);
  });

  it('returns prepared video failure without falling back to PCM or native audio', async () => {
    const workspacePath = await createWorkspace('media/unsupported.mkv');
    const media = createMediaPort();
    media.prepareVideo.mockRejectedValueOnce(
      new Error('No qualified complete seekable representation is available.'),
    );
    const runtime = createRuntime(media);

    const response = await runtime.execute(
      {
        identity,
        type: 'media:play',
        nodeId: 'video-unavailable',
        locator: { kind: 'workspace-file', path: 'media/unsupported.mkv' },
        mediaType: 'video',
        mediaInfo: {
          duration: 12,
          width: 1920,
          height: 1080,
          fps: 30,
          codec: 'unsupported',
          format: 'mkv',
          hasAudio: true,
        },
        startTime: 0,
        speed: 1,
      },
      createWorkspaceResolution(workspacePath),
    );

    expect(response).toEqual({
      type: 'media:streamReady',
      nodeId: 'video-unavailable',
      error: 'No qualified complete seekable representation is available.',
    });
    expect(media.publishFile).not.toHaveBeenCalled();
    await runtime.dispose();
  });
});

const identity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'canvas:view-1',
  viewEpoch: 1,
  documentId: 'Untitled.nkc',
  sessionId: 'canvas-session:canvas:view-1:1',
  endpointEpoch: 'endpoint-1',
};

async function createWorkspace(relativeFile: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-media-'));
  roots.push(root);
  const target = path.join(root, relativeFile);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, 'fixture');
  return root;
}

function createWorkspaceResolution(workspacePath: string) {
  return {
    workspaceId: identity.workspaceId,
    workspacePath,
    displayName: 'fixture',
    locator: { kind: 'relative' as const, value: 'fixture' },
  };
}

function createMediaPort() {
  const probeValue: MediaProbe = {
    durationSeconds: 12,
    formatName: 'aac',
    audioStreams: [
      {
        streamIndex: 0,
        codecName: 'aac',
        sampleRate: 48_000,
        channels: 2,
      },
    ],
  };
  const video: HtmlVideoDescriptor = {
    version: 1,
    url: 'openneko://resource/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    mimeType: 'video/mp4',
    preparationProfile: 'h264-mp4-direct',
    durationSeconds: 12,
  };
  return {
    probe: vi.fn(async () => probeValue),
    captureFrame: vi.fn(async () => 'data:image/jpeg;base64,ZnJhbWU='),
    prepareVideo: vi.fn(async () => ({ sessionId: 'video-session-1', video })),
    publishFile: vi.fn(async () => ({
      sessionId: 'audio-session-1',
      url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    })),
    stop: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
  } satisfies DesktopCanvasNodeMediaPort;
}

function createRuntime(media: DesktopCanvasNodeMediaPort): DesktopCanvasMediaRuntime {
  return new DesktopCanvasMediaRuntime({ media });
}

function failMediaInfo(): never {
  throw new Error('Expected media probe metadata.');
}

function createRegistry(): DesktopResourceRegistry {
  const registry = new DesktopResourceRegistry();
  registry.bindWindow(identity.windowId, 101);
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
