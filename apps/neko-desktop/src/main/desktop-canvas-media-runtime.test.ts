import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import type { HtmlVideoDescriptor, MediaProbe, PcmStreamDescriptor } from '@neko/media';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DesktopCanvasMediaRuntime,
  type DesktopCanvasNodeMediaPort,
} from './desktop-canvas-media-runtime';
import { DesktopMediaDescriptorRegistry } from './desktop-media-protocol';

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('DesktopCanvasMediaRuntime', () => {
  it('projects probe and playback descriptors through the package media runtime', async () => {
    const workspacePath = await createWorkspace('cases/test.aac');
    const media = createMediaPort();
    const mediaRegistry = new DesktopMediaDescriptorRegistry();
    const runtime = createRuntime(media, mediaRegistry);
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
      audio: {
        protocol: 'neko-pcm-f32le-v1',
        transport: 'authorized',
        streamUrl: expect.stringMatching(/^neko-media:\/\/desktop\//u),
      },
    });
    const descriptorId = readDescriptorId(
      play?.type === 'media:streamReady' ? play.audio?.streamUrl : undefined,
    );
    expect(descriptorId).toBeDefined();
    expect(mediaRegistry.authorize(42, descriptorId ?? '')).toBe(true);
    expect(media.startPcm).toHaveBeenCalledWith(
      await realpath(path.join(workspacePath, 'cases/test.aac')),
      expect.objectContaining({ durationSeconds: 12 }),
    );

    runtime.detachWindow(identity.windowId);
    await runtime.dispose();
    expect(mediaRegistry.authorize(42, descriptorId ?? '')).toBe(false);
    expect(media.stop).toHaveBeenCalledWith('audio-session-1');
    expect(media.dispose).toHaveBeenCalledOnce();
  });

  it('returns a fail-visible media response for a source outside workspace authorization', async () => {
    const workspacePath = await createWorkspace('cases/test.aac');
    const outsidePath = await createWorkspace('secret.aac');
    const media = createMediaPort();
    const runtime = createRuntime(media, new DesktopMediaDescriptorRegistry());

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
      error: 'Desktop ContentLocator is outside its authorized source.',
    });
    expect(media.probe).not.toHaveBeenCalled();
    await runtime.dispose();
  });

  it('rewrites Canvas video and PCM descriptors to sender-bound Desktop media URLs', async () => {
    const workspacePath = await createWorkspace('media/test.mp4');
    const media = createMediaPort();
    const mediaRegistry = new DesktopMediaDescriptorRegistry();
    const runtime = createRuntime(media, mediaRegistry);

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
      video: {
        transport: 'authorized',
        url: expect.stringMatching(/^neko-media:\/\/desktop\//u),
      },
      audio: {
        transport: 'authorized',
        streamUrl: expect.stringMatching(/^neko-media:\/\/desktop\//u),
      },
    });
    const videoDescriptorId = readDescriptorId(
      response?.type === 'media:streamReady' ? response.video?.url : undefined,
    );
    const audioDescriptorId = readDescriptorId(
      response?.type === 'media:streamReady' ? response.audio?.streamUrl : undefined,
    );
    expect(mediaRegistry.authorize(42, videoDescriptorId ?? '')).toBe(true);
    expect(mediaRegistry.authorize(42, audioDescriptorId ?? '')).toBe(true);

    await runtime.execute(
      { identity, type: 'media:stop', nodeId: 'video-1' },
      createWorkspaceResolution(workspacePath),
    );
    expect(mediaRegistry.authorize(42, videoDescriptorId ?? '')).toBe(false);
    expect(mediaRegistry.authorize(42, audioDescriptorId ?? '')).toBe(false);
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
  const audio: PcmStreamDescriptor = {
    version: 1,
    transport: 'http',
    protocol: 'neko-pcm-f32le-v1',
    streamUrl: 'http://127.0.0.1/audio',
    sampleRate: 48_000,
    channels: 2,
  };
  const video: HtmlVideoDescriptor = {
    version: 1,
    transport: 'http',
    url: 'http://127.0.0.1/video',
    mimeType: 'video/mp4',
    preparationProfile: 'h264-mp4-direct',
    durationSeconds: 12,
  };
  return {
    probe: vi.fn(async () => probeValue),
    captureFrame: vi.fn(async () => 'data:image/jpeg;base64,ZnJhbWU='),
    prepareVideo: vi.fn(async () => ({ sessionId: 'video-session-1', video })),
    startPcm: vi.fn(async () => ({ sessionId: 'audio-session-1', stream: audio })),
    stop: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
  } satisfies DesktopCanvasNodeMediaPort;
}

function createRuntime(
  media: DesktopCanvasNodeMediaPort,
  mediaRegistry: DesktopMediaDescriptorRegistry,
): DesktopCanvasMediaRuntime {
  return new DesktopCanvasMediaRuntime({
    media,
    mediaRegistry,
    resolveWebContentsId: () => 42,
  });
}

function readDescriptorId(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const segment = new URL(url).pathname.split('/').filter(Boolean)[0];
  return segment ? decodeURIComponent(segment) : undefined;
}

function failMediaInfo(): never {
  throw new Error('Expected media probe metadata.');
}
