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
      durationSeconds: 2,
      width: 1920,
      height: 1080,
      framesPerSecond: 30,
      hasVideo: true,
      hasAudio: true,
      audioChannels: 2,
      audioSampleRate: 48_000 as const,
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
    ).resolves.toEqual({ peaks: [], durationSeconds: 2, peaksPerSecond: 10 });
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
      { startTimeSeconds: 0, includeAudio: true, playbackRate: 1, startPaused: false },
    );
    const pcm = await adapter.startPcm(
      { workspaceRelativePath: 'media/shot.mp4' },
      { startTimeSeconds: 0, playbackRate: 1, startPaused: false },
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

  it('keeps prepared preview streams paused until the owning session is resumed', async () => {
    const engine = createEnginePort();
    const adapter = new NekoEngineCutMediaAdapter('/workspace', {
      ensureClient: async () => engine,
    });

    const preview = await adapter.startPreview(
      { workspaceRelativePath: 'media/shot.mp4' },
      { startTimeSeconds: 0, includeAudio: true, playbackRate: 1, startPaused: true },
    );
    expect(engine.createStream).toHaveBeenNthCalledWith(1, 'videos', '/workspace/media/shot.mp4', {
      initialPaused: true,
      sessionId: expect.stringMatching(/^playback-/),
      speed: 1,
      startTime: 0,
    });
    expect(engine.createStream).toHaveBeenNthCalledWith(2, 'audios', '/workspace/media/shot.mp4', {
      initialPaused: true,
      sessionId: expect.stringMatching(/^playback-audio-/),
      speed: 1,
      startTime: 0,
    });
    expect(engine.controlStream).not.toHaveBeenCalled();

    await adapter.resumePreview(preview.sessionId);

    expect(engine.controlStream).toHaveBeenCalledWith('videos', 'video-1', 'resume', undefined);
    expect(engine.controlStream).toHaveBeenCalledWith('audios', 'audio-1', 'resume', undefined);
    await adapter.stopPreview(preview.sessionId);
  });

  it('projects constant Clip speed to every preview stream', async () => {
    const engine = createEnginePort();
    const adapter = new NekoEngineCutMediaAdapter('/workspace', {
      ensureClient: async () => engine,
    });

    const preview = await adapter.startPreview(
      { workspaceRelativePath: 'media/shot.mp4' },
      { startTimeSeconds: 1.5, includeAudio: true, playbackRate: 2, startPaused: false },
    );

    expect(engine.createStream).toHaveBeenNthCalledWith(1, 'videos', '/workspace/media/shot.mp4', {
      initialPaused: false,
      sessionId: expect.stringMatching(/^playback-/),
      speed: 2,
      startTime: 1.5,
    });
    expect(engine.createStream).toHaveBeenNthCalledWith(2, 'audios', '/workspace/media/shot.mp4', {
      initialPaused: false,
      sessionId: expect.stringMatching(/^playback-audio-/),
      speed: 2,
      startTime: 1.5,
    });
    expect(engine.controlStream).not.toHaveBeenCalled();

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
        { startTimeSeconds: 0, includeAudio: true, playbackRate: 1, startPaused: false },
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
      { startTimeSeconds: 0, includeAudio: true, playbackRate: 1, startPaused: false },
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

    await expect(adapter.export(exportRequest(workspace.timeline))).resolves.toEqual({
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

    await adapter.export(exportRequest(timeline));

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

  it('projects mixed Clip timing, trim, speed and audio settings from one frozen view', async () => {
    const workspace = await createExportWorkspace(temporaryDirectories);
    const videoTrack = workspace.timeline.tracks[0];
    const audioTrack = workspace.timeline.tracks[1];
    const videoClip = videoTrack?.items[0];
    const audioClip = audioTrack?.items[0];
    if (
      !videoTrack ||
      !audioTrack ||
      !videoClip ||
      videoClip.kind !== 'clip' ||
      !audioClip ||
      audioClip.kind !== 'clip'
    ) {
      throw new Error('Mixed export fixture Clips are unavailable.');
    }
    const timeline: TimelineView = {
      ...workspace.timeline,
      durationSeconds: 5,
      tracks: [
        {
          ...videoTrack,
          items: [
            { kind: 'gap', startSeconds: 0, durationSeconds: 1 },
            {
              ...videoClip,
              startSeconds: 1,
              durationSeconds: 4,
              sourceStartSeconds: 3,
              playbackRate: 2,
              audio: { muted: false, gainDb: -3, fadeInSeconds: 0.25, fadeOutSeconds: 0.5 },
            },
          ],
        },
        {
          ...audioTrack,
          items: [
            {
              ...audioClip,
              startSeconds: 1,
              durationSeconds: 4,
              sourceStartSeconds: 3,
              playbackRate: 2,
              audio: { muted: false, gainDb: -6, fadeInSeconds: 0.75, fadeOutSeconds: 1 },
            },
          ],
        },
      ],
    };
    const engine = createEnginePort();
    vi.mocked(engine.probe).mockResolvedValue({
      duration: 5,
      width: 1920,
      height: 1080,
      fps: 24,
      codec: 'h264',
      format: 'mp4',
      hasAudio: true,
      audioChannels: 2,
      audioSampleRate: 48_000 as const,
    });
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

    await adapter.export({
      timeline,
      outputWorkspaceRelativePath: 'exports/demo.mp4',
      settings: {
        outputName: 'Project',
        container: 'mp4' as const,
        width: 1280,
        height: 720,
        framesPerSecond: 24,
        videoBitrate: 8_000_000,
        includeAudio: true,
        audioBitrate: 192_000,
        audioSampleRate: 48_000 as const,
      },
    });

    expect(findExportRequest(engine)).toMatchObject({
      body: {
        settings: { width: 1280, height: 720, fps: 24 },
        timeline: {
          duration: 5,
          resolution: { width: 1280, height: 720 },
          fps: 24,
          tracks: [
            {
              elements: [
                {
                  id: 'clip-1',
                  startTime: 1,
                  duration: 4,
                  trimStart: 3,
                  speed: { speed: 2 },
                  audio: { gain: -3, fadeIn: 0.25, fadeOut: 0.5 },
                },
              ],
            },
            {
              elements: [
                {
                  id: 'audio-1',
                  startTime: 1,
                  duration: 4,
                  trimStart: 3,
                  speed: { speed: 2 },
                  audio: { gain: -6, fadeIn: 0.75, fadeOut: 1 },
                },
              ],
            },
          ],
        },
      },
    });
  });

  it('exports the final enabled media end instead of the retained presentation extent', async () => {
    const workspace = await createExportWorkspace(temporaryDirectories);
    const timeline: TimelineView = {
      ...workspace.timeline,
      durationSeconds: 50.89,
    };
    const engine = createEnginePort();
    vi.mocked(engine.probe).mockResolvedValue({
      duration: 2,
      width: 1920,
      height: 1080,
      fps: 30,
      codec: 'h264',
      format: 'mp4',
      hasAudio: true,
      audioChannels: 2,
      audioSampleRate: 48_000 as const,
    });
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

    await expect(adapter.export(exportRequest(timeline))).resolves.toEqual({
      outputWorkspaceRelativePath: 'exports/demo.mp4',
    });

    expect(findExportRequest(engine)).toMatchObject({
      body: {
        timeline: {
          duration: 2,
        },
      },
    });
  });

  it('marks embedded audio only on Video sources whose probe reports audio', async () => {
    const workspace = await createExportWorkspace(temporaryDirectories);
    const videoTrack = workspace.timeline.tracks[0];
    const videoClip = videoTrack?.items[0];
    if (!videoTrack || !videoClip || videoClip.kind !== 'clip') {
      throw new Error('Video export fixture is unavailable.');
    }
    await nodeFs.writeFile(nodePath.join(workspace.root, 'media', 'silent.mp4'), 'silent-source');
    const timeline: TimelineView = {
      ...workspace.timeline,
      tracks: [
        {
          ...videoTrack,
          items: [
            { ...videoClip, durationSeconds: 1 },
            {
              ...videoClip,
              clipId: 'clip-silent',
              targetUrl: '../media/silent.mp4',
              startSeconds: 1,
              durationSeconds: 1,
            },
          ],
        },
      ],
    };
    const engine = createEnginePort();
    vi.mocked(engine.probe).mockImplementation(async (_group, source) => ({
      duration: 2,
      width: 1920,
      height: 1080,
      fps: 30,
      codec: 'h264',
      format: 'mp4',
      hasAudio: !source.endsWith('silent.mp4'),
      ...(!source.endsWith('silent.mp4')
        ? { audioChannels: 2, audioSampleRate: 48_000 as const }
        : {}),
    }));
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

    await adapter.export(exportRequest(timeline));

    const request = requireRecord(findExportRequest(engine).body);
    const projectedTimeline = requireRecord(request['timeline']);
    const tracks = projectedTimeline['tracks'];
    if (!Array.isArray(tracks)) throw new Error('Projected export Tracks are unavailable.');
    const projectedVideoTrack = requireRecord(tracks[0]);
    const elements = projectedVideoTrack['elements'];
    if (!Array.isArray(elements)) throw new Error('Projected Video elements are unavailable.');
    expect(requireRecord(elements[0])['audio']).toMatchObject({ muted: false });
    expect(requireRecord(elements[1])['audio']).toBeUndefined();
  });

  it('rejects an output whose duration does not match the frozen timeline', async () => {
    const workspace = await createExportWorkspace(temporaryDirectories);
    const engine = createEnginePort();
    vi.mocked(engine.probe).mockResolvedValue({
      duration: 1,
      width: 1920,
      height: 1080,
      fps: 30,
      codec: 'h264',
      format: 'mp4',
      hasAudio: true,
      audioChannels: 2,
      audioSampleRate: 48_000 as const,
    });
    vi.mocked(engine.dispatch).mockImplementation(async (request: ActionRequest) => {
      if (request.action === 'export_enqueue') {
        const body = requireRecord(request.body);
        await nodeFs.writeFile(requireString(body['outputPath']), 'bad-output');
      }
      if (request.action === 'export_progress') return okResponse({ state: 'completed' });
      return okResponse();
    });
    const adapter = new NekoEngineCutMediaAdapter(workspace.root, {
      ensureClient: async () => engine,
    });

    await expect(adapter.export(exportRequest(workspace.timeline))).rejects.toThrow('duration');
    await expect(nodeFs.readFile(workspace.output, 'utf8')).resolves.toBe('original-output');
  });

  it('rejects an output without audio when the frozen timeline has audible inputs', async () => {
    const workspace = await createExportWorkspace(temporaryDirectories);
    const engine = createEnginePort();
    vi.mocked(engine.probe).mockResolvedValue({
      duration: 2,
      width: 1920,
      height: 1080,
      fps: 30,
      codec: 'h264',
      format: 'mp4',
      hasAudio: false,
    });
    vi.mocked(engine.dispatch).mockImplementation(async (request: ActionRequest) => {
      if (request.action === 'export_enqueue') {
        const body = requireRecord(request.body);
        await nodeFs.writeFile(requireString(body['outputPath']), 'silent-output');
      }
      if (request.action === 'export_progress') return okResponse({ state: 'completed' });
      return okResponse();
    });
    const adapter = new NekoEngineCutMediaAdapter(workspace.root, {
      ensureClient: async () => engine,
    });

    await expect(adapter.export(exportRequest(workspace.timeline))).rejects.toThrow('audio stream');
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
        },
        {
          ...audioTrack,
          trackId: 'audio-disabled',
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

    await adapter.export(exportRequest(timeline));

    expect(findExportRequest(engine)).toMatchObject({
      body: {
        timeline: {
          tracks: [
            { id: 'video-1', elements: [] },
            { id: 'audio-1', elements: [{ id: 'audio-1' }] },
          ],
        },
      },
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

    await expect(adapter.export(exportRequest(timeline))).rejects.toThrow(
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

    await expect(adapter.export(exportRequest(workspace.timeline))).rejects.toThrow(
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
      adapter.export(exportRequest(workspace.timeline), controller.signal),
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

function exportRequest(timeline: TimelineView) {
  const profile = timeline.profile;
  if (!profile) throw new Error('Export fixture profile is unavailable.');
  return {
    timeline,
    outputWorkspaceRelativePath: 'exports/demo.mp4',
    settings: {
      outputName: 'Project',
      container: 'mp4' as const,
      width: profile.width,
      height: profile.height,
      framesPerSecond: profile.editRateNumerator / profile.editRateDenominator,
      videoBitrate: 8_000_000,
      includeAudio: true,
      audioBitrate: 192_000,
      audioSampleRate: 48_000 as const,
    },
  };
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
      duration: 2,
      width: 1920,
      height: 1080,
      fps: 30,
      codec: 'h264',
      format: 'mp4',
      hasAudio: true,
      audioChannels: 2,
      audioSampleRate: 48_000 as const,
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
      duration: 2,
      peaksPerSecond: 10,
    })),
  };
}

function okResponse(data?: unknown): ActionResponse {
  return { id: 'action', status: 'ok', ...(data !== undefined ? { data } : {}) };
}
