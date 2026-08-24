import { afterEach, describe, expect, it, vi } from 'vitest';
import { MiniMaxH3VideoModel } from './minimax-h3-video-model';
import { decodeVideoTaskOperation } from '../../video-task-operation';

describe('MiniMaxH3VideoModel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('maps multimodal references to the H3 V2 content contract and returns the task immediately', async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify({ task_id: 'h3-task-1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const model = createModel();

    const result = await model.doStart!({
      prompt: 'Preserve the rhythm and character identity',
      n: 1,
      aspectRatio: 'adaptive',
      resolution: undefined,
      duration: 5,
      fps: undefined,
      seed: undefined,
      image: undefined,
      frameImages: undefined,
      inputReferences: [
        { type: 'url', url: 'https://cdn.example/ref.png', mediaType: 'image/png' },
        { type: 'url', url: 'https://cdn.example/ref.mp4', mediaType: 'video/mp4' },
        { type: 'url', url: 'https://cdn.example/ref.mp3', mediaType: 'audio/mpeg' },
      ],
      generateAudio: undefined,
      providerOptions: { minimax: { resolution: '2K' } },
    });

    expect(decodeVideoTaskOperation(result.operation)).toEqual({ taskId: 'h3-task-1' });
    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'MiniMax-H3',
      content: [
        { type: 'text', text: 'Preserve the rhythm and character identity' },
        {
          type: 'image_url',
          image_url: { url: 'https://cdn.example/ref.png' },
          role: 'reference_image',
        },
        {
          type: 'video_url',
          video_url: { url: 'https://cdn.example/ref.mp4' },
          role: 'reference_video',
        },
        {
          type: 'audio_url',
          audio_url: { url: 'https://cdn.example/ref.mp3' },
          role: 'reference_audio',
        },
      ],
      resolution: '2K',
      duration: 5,
      ratio: 'adaptive',
    });
  });

  it('maps exact task status and cancellation endpoints', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            task: {
              id: 'h3-task-2',
              model: 'MiniMax-H3',
              status: 'succeeded',
              content: { url: 'https://cdn.example/output.mp4' },
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ task_id: 'h3-task-2', action: 'cancelled', status: 'cancelled' }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const model = createModel();

    await expect(model.doStatus!({ operation: { taskId: 'h3-task-2' } })).resolves.toMatchObject({
      status: 'completed',
      videos: [{ type: 'url', url: 'https://cdn.example/output.mp4' }],
    });
    await model.cancelTask('h3-task-2');

    expect(fetchMock.mock.calls.map(([url, init]) => [String(url), init?.method])).toEqual([
      ['https://api.minimaxi.com/v2/query/video_generation/h3-task-2', 'GET'],
      ['https://api.minimaxi.com/v2/video_generation/h3-task-2', 'DELETE'],
    ]);
  });

  it('rejects frame and reference modes before issuing a request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      createModel().doStart!({
        prompt: 'invalid mixed mode',
        n: 1,
        aspectRatio: 'adaptive',
        resolution: undefined,
        duration: 5,
        fps: undefined,
        seed: undefined,
        image: undefined,
        frameImages: [
          {
            frameType: 'first_frame',
            image: { type: 'url', url: 'https://cdn.example/first.png', mediaType: 'image/png' },
          },
        ],
        inputReferences: [
          { type: 'url', url: 'https://cdn.example/ref.mp4', mediaType: 'video/mp4' },
        ],
        generateAudio: undefined,
        providerOptions: { minimax: { resolution: '768P' } },
      }),
    ).rejects.toThrow('mutually exclusive');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unsupported reference media types before issuing a request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      createModel().doStart!({
        prompt: 'invalid reference format',
        n: 1,
        aspectRatio: 'adaptive',
        resolution: undefined,
        duration: 5,
        fps: undefined,
        seed: undefined,
        image: undefined,
        frameImages: undefined,
        inputReferences: [
          { type: 'url', url: 'https://cdn.example/ref.ogg', mediaType: 'audio/ogg' },
        ],
        generateAudio: undefined,
        providerOptions: { minimax: { resolution: '768P' } },
      }),
    ).rejects.toThrow('audio input media type audio/ogg is not supported');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function createModel(): MiniMaxH3VideoModel {
  return new MiniMaxH3VideoModel('MiniMax-H3', {
    apiUrl: 'https://api.minimaxi.com/v2',
    apiKey: 'test-key',
  });
}
