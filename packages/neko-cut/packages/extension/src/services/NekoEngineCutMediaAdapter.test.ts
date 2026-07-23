import { afterEach, describe, expect, it, vi } from 'vitest';
import * as nodeFs from 'node:fs/promises';
import * as nodeOs from 'node:os';
import * as nodePath from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ActionRequest, ActionResponse, MediaPlaybackEnginePort } from '@neko/neko-client';
import { CutMediaRuntimeUnavailableError } from '@neko-cut/domain';
import type { TimelineView } from '@neko-cut/domain';
import { NekoEngineCutMediaAdapter } from './NekoEngineCutMediaAdapter';

describe('NekoEngineCutMediaAdapter', () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map((directory) => nodeFs.rm(directory, { recursive: true, force: true })),
    );
  });
  it('fails visibly when the selected media runtime is unavailable', async () => {
    const adapter = new NekoEngineCutMediaAdapter('/workspace', {
      ensureClient: async () => null,
    });

    await expect(adapter.probe({ workspaceRelativePath: 'media/shot.mp4' })).rejects.toBeInstanceOf(
      CutMediaRuntimeUnavailableError,
    );
  });

  it('projects probe fields without exposing Engine response types', async () => {
    const engine = createEnginePort();
    const adapter = new NekoEngineCutMediaAdapter('/workspace', {
      ensureClient: async () => engine,
    });

    await expect(adapter.probe({ workspaceRelativePath: 'media/shot.mp4' })).resolves.toEqual({
      durationSeconds: 3,
      width: 1920,
      height: 1080,
      framesPerSecond: 30,
      hasVideo: true,
      hasAudio: true,
      audioChannels: 2,
      audioSampleRate: 48_000,
    });
    expect(engine.probe).toHaveBeenCalledWith('videos', '/workspace/media/shot.mp4');
  });

  it('projects Engine waveform peaks through the host-neutral Cut port', async () => {
    const engine = createEnginePort();
    const adapter = new NekoEngineCutMediaAdapter('/workspace', {
      ensureClient: async () => engine,
    });

    await expect(
      adapter.generateWaveform({ workspaceRelativePath: 'media/shot.mp4' }, { peaksPerSecond: 20 }),
    ).resolves.toEqual({ peaks: [], durationSeconds: 3, peaksPerSecond: 10 });
    expect(engine.waveform).toHaveBeenCalledWith('/workspace/media/shot.mp4', {
      peaksPerSecond: 20,
    });
  });

  it('owns preview/PCM sessions and releases both Engine streams', async () => {
    const engine = createEnginePort();
    const adapter = new NekoEngineCutMediaAdapter('/workspace', {
      ensureClient: async () => engine,
    });

    const preview = await adapter.startPreview(
      { workspaceRelativePath: 'media/shot.mp4' },
      { startTimeSeconds: 0, includeAudio: true, playbackRate: 1 },
    );
    const pcm = await adapter.startPcm(
      { workspaceRelativePath: 'media/shot.mp4' },
      { startTimeSeconds: 0, playbackRate: 1 },
    );
    expect(preview).toMatchObject({
      sessionId: 'cut-media-1',
      videoStreamUrl: 'ws://video/video-1',
      audioStreamUrl: 'ws://audio/audio-1',
    });
    expect(pcm).toEqual({ sessionId: 'cut-media-2', streamUrl: 'ws://audio/audio-2' });

    await adapter.stopPreview(preview.sessionId);
    await adapter.stopPcm(pcm.sessionId);
    expect(engine.controlStream).toHaveBeenCalledWith('videos', 'video-1', 'stop', undefined);
    expect(engine.controlStream).toHaveBeenCalledWith('audios', 'audio-1', 'stop', undefined);
    expect(engine.controlStream).toHaveBeenCalledWith('audios', 'audio-2', 'stop', undefined);
    await expect(adapter.stopPreview(preview.sessionId)).rejects.toThrow(
      'Unknown Cut media session',
    );
  });

  it('projects constant Clip speed to every preview stream', async () => {
    const engine = createEnginePort();
    const adapter = new NekoEngineCutMediaAdapter('/workspace', {
      ensureClient: async () => engine,
    });

    const preview = await adapter.startPreview(
      { workspaceRelativePath: 'media/shot.mp4' },
      { startTimeSeconds: 1.5, includeAudio: true, playbackRate: 2 },
    );

    expect(engine.controlStream).toHaveBeenCalledWith('videos', 'video-1', 'seek', {
      time: 1.5,
    });
    expect(engine.controlStream).toHaveBeenCalledWith('audios', 'audio-1', 'seek', {
      time: 1.5,
    });
    expect(engine.controlStream).toHaveBeenCalledWith('videos', 'video-1', 'speed', {
      speed: 2,
    });
    expect(engine.controlStream).toHaveBeenCalledWith('audios', 'audio-1', 'speed', {
      speed: 2,
    });

    await adapter.stopPreview(preview.sessionId);
  });

  it('honors cancellation before acquiring the runtime', async () => {
    const ensureClient = vi.fn(async () => createEnginePort());
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    const adapter = new NekoEngineCutMediaAdapter('/workspace', { ensureClient });

    await expect(
      adapter.captureFrame(
        { workspaceRelativePath: 'media/shot.mp4' },
        1,
        { width: 160, height: 90 },
        controller.signal,
      ),
    ).rejects.toThrow('cancelled');
    expect(ensureClient).not.toHaveBeenCalled();
  });

  it('releases Engine streams when cancellation arrives after acquisition', async () => {
    const controller = new AbortController();
    const engine = createEnginePort();
    const createStream = vi.mocked(engine.createStream);
    const implementation = createStream.getMockImplementation();
    if (!implementation) throw new Error('Engine fixture createStream implementation is missing.');
    createStream.mockImplementation(async (...args) => {
      const handle = await implementation(...args);
      if (args[0] === 'audios') controller.abort(new Error('cancelled after acquisition'));
      return handle;
    });
    const adapter = new NekoEngineCutMediaAdapter('/workspace', {
      ensureClient: async () => engine,
    });

    await expect(
      adapter.startPreview(
        { workspaceRelativePath: 'media/shot.mp4' },
        { startTimeSeconds: 0, includeAudio: true, playbackRate: 1 },
        controller.signal,
      ),
    ).rejects.toThrow('cancelled after acquisition');
    expect(engine.controlStream).toHaveBeenCalledWith('videos', 'video-1', 'stop', undefined);
    expect(engine.controlStream).toHaveBeenCalledWith('audios', 'audio-1', 'stop', undefined);
  });

  it('retains the session handle when stop cannot acquire the runtime', async () => {
    const engine = createEnginePort();
    const clients: Array<MediaPlaybackEnginePort | null> = [engine, null, engine];
    const adapter = new NekoEngineCutMediaAdapter('/workspace', {
      ensureClient: async () => clients.shift() ?? null,
    });
    const preview = await adapter.startPreview(
      { workspaceRelativePath: 'media/shot.mp4' },
      { startTimeSeconds: 0, includeAudio: true, playbackRate: 1 },
    );

    await expect(adapter.stopPreview(preview.sessionId)).rejects.toBeInstanceOf(
      CutMediaRuntimeUnavailableError,
    );
    await expect(adapter.stopPreview(preview.sessionId)).resolves.toBeUndefined();
    expect(engine.controlStream).toHaveBeenCalledWith('videos', 'video-1', 'stop', undefined);
  });

  it('exports through staging and atomically replaces an existing output', async () => {
    const workspace = await createExportWorkspace(temporaryDirectories);
    const currentProfile = workspace.timeline.profile;
    if (!currentProfile) throw new Error('Export fixture profile is unavailable.');
    workspace.timeline = {
      ...workspace.timeline,
      profile: {
        ...currentProfile,
        profile: 'short-video-1080p',
        width: 1080,
        height: 1920,
      },
    };
    const engine = createEnginePort();
    vi.mocked(engine.dispatch).mockImplementation(async (request: ActionRequest) => {
      if (request.action === 'export_enqueue') {
        const body = requireRecord(request.body);
        await nodeFs.writeFile(requireString(body['outputPath']), 'new-output');
      }
      if (request.action === 'export_progress') {
        return okResponse({ state: 'completed' });
      }
      return okResponse();
    });
    const adapter = new NekoEngineCutMediaAdapter(workspace.root, {
      ensureClient: async () => engine,
    });

    await expect(adapter.export(workspace.timeline, 'exports/demo.mp4')).resolves.toEqual({
      outputWorkspaceRelativePath: 'exports/demo.mp4',
    });
    await expect(nodeFs.readFile(workspace.output, 'utf8')).resolves.toBe('new-output');
    expect((await nodeFs.readdir(nodePath.dirname(workspace.output))).sort()).toEqual(['demo.mp4']);
    const request = findExportRequest(engine);
    expect(request).toMatchObject({
      body: {
        settings: {
          width: 1080,
          height: 1920,
        },
        timeline: {
          resolution: {
            width: 1080,
            height: 1920,
          },
          tracks: [
            { type: 'video', elements: [{ type: 'media', muted: false }] },
            { type: 'audio', elements: [{ type: 'audio', muted: false }] },
          ],
        },
      },
    });
  });

  it('projects Video and separated Audio Clip mute independently', async () => {
    const workspace = await createExportWorkspace(temporaryDirectories);
    const videoTrack = workspace.timeline.tracks[0];
    const videoClip = videoTrack?.items[0];
    if (!videoTrack || !videoClip || videoClip.kind !== 'clip') {
      throw new Error('Export fixture Video Clip is unavailable.');
    }
    const timeline: TimelineView = {
      ...workspace.timeline,
      tracks: [
        {
          ...videoTrack,
          items: [{ ...videoClip, audio: { ...videoClip.audio, muted: true } }],
        },
        ...workspace.timeline.tracks.slice(1),
      ],
    };
    const engine = createEnginePort();
    vi.mocked(engine.dispatch).mockImplementation(async (request: ActionRequest) => {
      if (request.action === 'export_enqueue') {
        const body = requireRecord(request.body);
        await nodeFs.writeFile(requireString(body['outputPath']), 'new-output');
      }
      if (request.action === 'export_progress') return okResponse({ state: 'completed' });
      return okResponse();
    });
    const adapter = new NekoEngineCutMediaAdapter(workspace.root, {
      ensureClient: async () => engine,
    });

    await adapter.export(timeline, 'exports/demo.mp4');

    expect(findExportRequest(engine)).toMatchObject({
      body: {
        timeline: {
          tracks: [
            { elements: [{ id: 'clip-1', muted: true }] },
            { elements: [{ id: 'audio-1', muted: false }] },
          ],
        },
      },
    });
  });

  it('excludes disabled Clips and Tracks from export projection', async () => {
    const workspace = await createExportWorkspace(temporaryDirectories);
    const videoTrack = workspace.timeline.tracks[0];
    const audioTrack = workspace.timeline.tracks[1];
    const videoItem = videoTrack?.items[0];
    if (!videoTrack || !audioTrack || !videoItem || videoItem.kind !== 'clip') {
      throw new Error('Export fixture Tracks are unavailable.');
    }
    const timeline: TimelineView = {
      ...workspace.timeline,
      tracks: [
        {
          ...videoTrack,
          items: [
            {
              ...videoItem,
              enabled: false,
            },
          ],
        },
        {
          ...audioTrack,
          enabled: false,
        },
      ],
    };
    const engine = createEnginePort();
    vi.mocked(engine.dispatch).mockImplementation(async (request: ActionRequest) => {
      if (request.action === 'export_enqueue') {
        const body = requireRecord(request.body);
        await nodeFs.writeFile(requireString(body['outputPath']), 'new-output');
      }
      if (request.action === 'export_progress') return okResponse({ state: 'completed' });
      return okResponse();
    });
    const adapter = new NekoEngineCutMediaAdapter(workspace.root, {
      ensureClient: async () => engine,
    });

    await adapter.export(timeline, 'exports/demo.mp4');

    expect(findExportRequest(engine)).toMatchObject({
      body: { timeline: { tracks: [{ id: 'video-1', elements: [] }] } },
    });
  });

  it('fails visibly instead of silently omitting a non-empty Subtitle Track', async () => {
    const workspace = await createExportWorkspace(temporaryDirectories);
    const subtitlePath = nodePath.join(workspace.root, 'media', 'captions.srt');
    await nodeFs.writeFile(subtitlePath, '1\n00:00:00,000 --> 00:00:02,000\nHello\n');
    const timeline: TimelineView = {
      ...workspace.timeline,
      tracks: [
        ...workspace.timeline.tracks,
        {
          trackId: 'subtitle-track-1',
          name: 'Subtitle 1',
          kind: 'Subtitle',
          enabled: true,
          locked: false,
          audioMuted: false,
          items: [
            {
              kind: 'clip',
              clipId: 'subtitle-1',
              name: 'Captions',
              targetUrl: '../media/captions.srt',
              startSeconds: 0,
              durationSeconds: 2,
              sourceStartSeconds: 0,
              playbackRate: 1,
              enabled: true,
              locked: false,
              audio: { muted: false, gainDb: 0, fadeInSeconds: 0, fadeOutSeconds: 0 },
            },
          ],
        },
      ],
    };
    const engine = createEnginePort();
    const adapter = new NekoEngineCutMediaAdapter(workspace.root, {
      ensureClient: async () => engine,
    });

    await expect(adapter.export(timeline, 'exports/demo.mp4')).rejects.toThrow(
      'cannot burn Subtitle Tracks',
    );
    expect(engine.dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'export_enqueue' }),
    );
  });

  it('preserves an existing output and removes staging when export fails', async () => {
    const workspace = await createExportWorkspace(temporaryDirectories);
    const engine = createEnginePort();
    vi.mocked(engine.dispatch).mockResolvedValue({
      id: 'action',
      status: 'error',
      error: { code: 'export-failed', message: 'encode failed' },
    });
    const adapter = new NekoEngineCutMediaAdapter(workspace.root, {
      ensureClient: async () => engine,
    });

    await expect(adapter.export(workspace.timeline, 'exports/demo.mp4')).rejects.toThrow(
      'encode failed',
    );
    await expect(nodeFs.readFile(workspace.output, 'utf8')).resolves.toBe('original-output');
    expect((await nodeFs.readdir(nodePath.dirname(workspace.output))).sort()).toEqual(['demo.mp4']);
  });

  it('cancels the Engine job and removes staging without replacing output', async () => {
    const workspace = await createExportWorkspace(temporaryDirectories);
    const controller = new AbortController();
    const engine = createEnginePort();
    vi.mocked(engine.dispatch).mockImplementation(async (request: ActionRequest) => {
      if (request.action === 'export_enqueue') {
        const body = requireRecord(request.body);
        await nodeFs.writeFile(requireString(body['outputPath']), 'partial-output');
        controller.abort(new Error('cancelled by user'));
      }
      return okResponse();
    });
    const adapter = new NekoEngineCutMediaAdapter(workspace.root, {
      ensureClient: async () => engine,
    });

    await expect(
      adapter.export(workspace.timeline, 'exports/demo.mp4', controller.signal),
    ).rejects.toThrow('cancelled by user');
    expect(engine.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'export_cancel' }),
    );
    await expect(nodeFs.readFile(workspace.output, 'utf8')).resolves.toBe('original-output');
    expect((await nodeFs.readdir(nodePath.dirname(workspace.output))).sort()).toEqual(['demo.mp4']);
  });
});

async function createExportWorkspace(temporaryDirectories: string[]) {
  const root = await nodeFs.mkdtemp(nodePath.join(nodeOs.tmpdir(), 'neko-cut-export-'));
  temporaryDirectories.push(root);
  await nodeFs.mkdir(nodePath.join(root, 'projects'), { recursive: true });
  await nodeFs.mkdir(nodePath.join(root, 'media'), { recursive: true });
  await nodeFs.mkdir(nodePath.join(root, 'exports'), { recursive: true });
  await nodeFs.writeFile(nodePath.join(root, 'media', 'shot.mp4'), 'source');
  const output = nodePath.join(root, 'exports', 'demo.mp4');
  await nodeFs.writeFile(output, 'original-output');
  const timeline: TimelineView = {
    documentUri: pathToFileURL(nodePath.join(root, 'projects', 'edit.otio')).toString(),
    sessionId: 'session-export',
    revision: 2,
    name: 'Demo',
    profile: {
      profile: '1080p30',
      editRateNumerator: 30,
      editRateDenominator: 1,
      width: 1920,
      height: 1080,
    },
    durationSeconds: 2,
    tracks: [
      {
        trackId: 'video-1',
        name: 'Video 1',
        kind: 'Video',
        enabled: true,
        locked: false,
        audioMuted: false,
        items: [
          {
            kind: 'clip',
            clipId: 'clip-1',
            name: 'Shot',
            targetUrl: '../media/shot.mp4',
            startSeconds: 0,
            durationSeconds: 2,
            sourceStartSeconds: 0,
            playbackRate: 1,
            enabled: true,
            locked: false,
            audio: { muted: false, gainDb: 0, fadeInSeconds: 0, fadeOutSeconds: 0 },
          },
        ],
      },
      {
        trackId: 'audio-1',
        name: 'Audio 1',
        kind: 'Audio',
        enabled: true,
        locked: false,
        audioMuted: false,
        items: [
          {
            kind: 'clip',
            clipId: 'audio-1',
            name: 'Shot Audio',
            targetUrl: '../media/shot.mp4',
            startSeconds: 0,
            durationSeconds: 2,
            sourceStartSeconds: 0,
            playbackRate: 1,
            enabled: true,
            locked: false,
            audio: { muted: false, gainDb: 0, fadeInSeconds: 0, fadeOutSeconds: 0 },
          },
        ],
      },
    ],
  };
  return { root, output, timeline };
}

function findExportRequest(engine: MediaPlaybackEnginePort): ActionRequest {
  const request = vi
    .mocked(engine.dispatch)
    .mock.calls.map(([candidate]) => candidate)
    .find((candidate) => candidate.action === 'export_enqueue');
  if (!request) throw new Error('Expected an export_enqueue request.');
  return request;
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('Expected record.');
  return value;
}

function requireString(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected string.');
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createEnginePort(): MediaPlaybackEnginePort {
  let videoIndex = 0;
  let audioIndex = 0;
  return {
    port: 43123,
    getStreamWsUrl: (streamId) => `ws://video/${streamId}`,
    getAudioWsUrl: (streamId) => `ws://audio/${streamId}`,
    dispatch: vi.fn(async () => okResponse({ data: 'frame' })),
    probe: vi.fn(async () => ({
      duration: 3,
      width: 1920,
      height: 1080,
      fps: 30,
      codec: 'h264',
      format: 'mp4',
      hasAudio: true,
      audioChannels: 2,
      audioSampleRate: 48_000,
    })),
    createStream: vi.fn(async (group) => {
      const streamId =
        group === 'videos' ? `video-${(videoIndex += 1)}` : `audio-${(audioIndex += 1)}`;
      return {
        streamId,
        wsUrl: `ws://video/${streamId}`,
        ...(group === 'audios' ? { audioWsUrl: `ws://audio/${streamId}` } : {}),
      };
    }),
    controlStream: vi.fn(async () => okResponse()),
    waveform: vi.fn(async () => ({
      peaks: [],
      sampleRate: 48_000,
      channels: 2,
      duration: 3,
      peaksPerSecond: 10,
    })),
  };
}

function okResponse(data?: unknown): ActionResponse {
  return { id: 'action', status: 'ok', ...(data !== undefined ? { data } : {}) };
}
