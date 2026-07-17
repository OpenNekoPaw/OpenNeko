import { describe, expect, it, vi } from 'vitest';
import { TOOL_NAMES_PERCEPTION, isPerceptionEvidenceToolResult } from '@neko/shared';
import {
  PERCEPTION_AUDIO_TRANSCRIBE_METADATA,
  PERCEPTION_DESCRIBE_INPUT_METADATA,
  PERCEPTION_IMAGE_SIMILARITY_METADATA,
  PERCEPTION_IMAGE_CLASSIFY_METADATA,
  PERCEPTION_VIDEO_DETECT_SHOTS_METADATA,
  PerceptionAudioTranscribeTool,
  PerceptionDescribeInputTool,
  PerceptionImageSimilarityTool,
  PerceptionImageClassifyTool,
  PerceptionVideoDetectShotsTool,
  createPerceptionTools,
  type PerceptionClassifyClient,
  type PerceptionSimilarityClient,
  type PerceptionTranscribeClient,
  type PerceptionDetectShotsClient,
} from './perception-tools';

describe('PerceptionDescribeInputTool', () => {
  it('declares optional perception metadata and safe read-only behavior', () => {
    const tool = new PerceptionDescribeInputTool();

    expect(tool.name).toBe(TOOL_NAMES_PERCEPTION.DESCRIBE_INPUT);
    expect(tool.category).toBe('analysis');
    expect(tool.isReadOnly).toBe(true);
    expect(tool.isConcurrencySafe).toBe(true);
    expect(PERCEPTION_DESCRIBE_INPUT_METADATA).toEqual({
      kind: 'perception',
      modality: 'mixed',
      outputSchema: 'perception-evidence',
      cost: 'free',
      requiresGpu: false,
      cacheable: true,
      idempotent: true,
    });
  });

  it('returns PerceptionEvidence without mutating project state', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(123);
    const tool = new PerceptionDescribeInputTool();

    const result = await tool.execute({
      summary: 'The reference video contains a two-shot dialogue scene.',
      modality: 'video',
      confidence: 0.75,
      observationId: 'obs-1',
      evidenceId: 'evidence-video-1',
    });

    expect(isPerceptionEvidenceToolResult(result)).toBe(true);
    expect(result).toEqual({
      success: true,
      data: {
        id: 'evidence-video-1',
        source: 'tool',
        summary: 'The reference video contains a two-shot dialogue scene.',
        confidence: 0.75,
        toolName: TOOL_NAMES_PERCEPTION.DESCRIBE_INPUT,
        observationId: 'obs-1',
        data: {
          kind: 'perception.describeInput',
          modality: 'video',
        },
        createdAt: 123,
        status: 'active',
      },
    });
  });

  it('fails closed for invalid confidence values', async () => {
    const tool = new PerceptionDescribeInputTool();

    await expect(
      tool.execute({
        summary: 'Audio may contain speech.',
        modality: 'audio',
        confidence: 2,
      }),
    ).resolves.toEqual({
      success: false,
      error: '`confidence` must be a number between 0 and 1',
    });
  });

  it('creates the optional perception tool list', () => {
    const transcribeClient: PerceptionTranscribeClient = {
      perception: {
        transcribe: vi.fn(),
      },
    };
    const similarityClient: PerceptionSimilarityClient = {
      perception: {
        similarity: vi.fn(),
      },
    };
    const classifyClient: PerceptionClassifyClient = {
      perception: {
        classify: vi.fn(),
      },
    };
    const detectShotsClient: PerceptionDetectShotsClient = {
      perception: {
        detectShots: vi.fn(),
      },
    };

    expect(createPerceptionTools().map((tool) => tool.name)).toEqual([
      TOOL_NAMES_PERCEPTION.DESCRIBE_INPUT,
    ]);
    expect(createPerceptionTools({ transcribeClient }).map((tool) => tool.name)).toEqual([
      TOOL_NAMES_PERCEPTION.DESCRIBE_INPUT,
      TOOL_NAMES_PERCEPTION.AUDIO_TRANSCRIBE,
    ]);
    expect(
      createPerceptionTools({
        transcribeClient,
        similarityClient,
        classifyClient,
        detectShotsClient,
      }).map((tool) => tool.name),
    ).toEqual([
      TOOL_NAMES_PERCEPTION.DESCRIBE_INPUT,
      TOOL_NAMES_PERCEPTION.AUDIO_TRANSCRIBE,
      TOOL_NAMES_PERCEPTION.IMAGE_SIMILARITY,
      TOOL_NAMES_PERCEPTION.IMAGE_CLASSIFY,
      TOOL_NAMES_PERCEPTION.VIDEO_DETECT_SHOTS,
    ]);
  });
});

describe('PerceptionVideoDetectShotsTool', () => {
  it('returns candidate shot-boundary evidence from the engine client', async () => {
    const client: PerceptionDetectShotsClient = {
      perception: {
        detectShots: vi.fn(async () => [
          { index: 1, start: 2.5, end: 5, confidence: null },
          { index: 0, start: 0, end: 2.5, confidence: 0.9 },
        ]),
      },
    };
    const tool = new PerceptionVideoDetectShotsTool({ client, now: () => 456 });

    const result = await tool.execute({
      videoSource: '/tmp/scene.mp4',
      observationId: 'obs-video-1',
      evidenceId: 'evidence-shots-1',
    });

    expect(isPerceptionEvidenceToolResult(result)).toBe(true);
    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        id: 'evidence-shots-1',
        summary: 'Detected 2 shot boundary candidates.',
        toolName: TOOL_NAMES_PERCEPTION.VIDEO_DETECT_SHOTS,
        observationId: 'obs-video-1',
        createdAt: 456,
        data: {
          kind: 'perception.video.detectShots',
          videoSource: '/tmp/scene.mp4',
          shots: [
            { index: 0, start: 0, end: 2.5, confidence: 0.9 },
            { index: 1, start: 2.5, end: 5, confidence: null },
          ],
        },
      }),
    });
    expect(client.perception.detectShots).toHaveBeenCalledWith({ video: '/tmp/scene.mp4' });
  });

  it('declares optional video evidence metadata and safe read-only behavior', () => {
    const client: PerceptionDetectShotsClient = { perception: { detectShots: vi.fn() } };
    const tool = new PerceptionVideoDetectShotsTool({ client });

    expect(tool.name).toBe(TOOL_NAMES_PERCEPTION.VIDEO_DETECT_SHOTS);
    expect(tool.category).toBe('analysis');
    expect(tool.isReadOnly).toBe(true);
    expect(tool.isConcurrencySafe).toBe(true);
    expect(PERCEPTION_VIDEO_DETECT_SHOTS_METADATA).toEqual({
      kind: 'perception',
      modality: 'video',
      outputSchema: 'perception-evidence',
      cost: 'moderate',
      requiresGpu: false,
      cacheable: true,
      idempotent: true,
    });
  });
});

describe('PerceptionImageSimilarityTool', () => {
  it('declares optional image evidence metadata and safe read-only behavior', () => {
    const client: PerceptionSimilarityClient = {
      perception: {
        similarity: vi.fn(),
      },
    };
    const tool = new PerceptionImageSimilarityTool({ client });

    expect(tool.name).toBe(TOOL_NAMES_PERCEPTION.IMAGE_SIMILARITY);
    expect(tool.category).toBe('analysis');
    expect(tool.isReadOnly).toBe(true);
    expect(tool.isConcurrencySafe).toBe(true);
    expect(PERCEPTION_IMAGE_SIMILARITY_METADATA).toEqual({
      kind: 'perception',
      modality: 'image',
      outputSchema: 'perception-evidence',
      cost: 'moderate',
      requiresGpu: false,
      cacheable: true,
      idempotent: true,
    });
  });

  it('returns similarity score as PerceptionEvidence through an injected client', async () => {
    const similarity = vi.fn(async () => 0.823456);
    const client: PerceptionSimilarityClient = {
      perception: { similarity },
    };
    const tool = new PerceptionImageSimilarityTool({ client, now: () => 789 });

    const result = await tool.execute({
      imageSource: '/tmp/frame.png',
      text: 'red umbrella',
      model: 'clip-vit-b32',
      observationId: 'obs-image',
      evidenceId: 'evidence-image-1',
    });

    expect(similarity).toHaveBeenCalledWith({
      model: 'clip-vit-b32',
      image: '/tmp/frame.png',
      text: 'red umbrella',
    });
    expect(isPerceptionEvidenceToolResult(result)).toBe(true);
    expect(result).toEqual({
      success: true,
      data: {
        id: 'evidence-image-1',
        source: 'tool',
        summary: 'Image similarity to "red umbrella": 0.8235',
        confidence: 0.823456,
        toolName: TOOL_NAMES_PERCEPTION.IMAGE_SIMILARITY,
        observationId: 'obs-image',
        modelContext: {
          modelId: 'clip-vit-b32',
          providerId: 'neko-engine',
        },
        data: {
          kind: 'perception.image.similarity',
          imageSource: '/tmp/frame.png',
          text: 'red umbrella',
          score: 0.823456,
        },
        createdAt: 789,
        status: 'active',
      },
    });
  });

  it('uses default CLIP model and clamps confidence to evidence range', async () => {
    const similarity = vi.fn(async () => 1.2);
    const client: PerceptionSimilarityClient = {
      perception: { similarity },
    };
    const tool = new PerceptionImageSimilarityTool({ client, now: () => 790 });

    const result = await tool.execute({ imageSource: '/tmp/frame.png', text: 'cat' });

    expect(similarity).toHaveBeenCalledWith({
      model: 'clip-vit-b32',
      image: '/tmp/frame.png',
      text: 'cat',
    });
    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        confidence: 1,
        summary: 'Image similarity to "cat": 1.2',
        toolName: TOOL_NAMES_PERCEPTION.IMAGE_SIMILARITY,
        modelContext: {
          modelId: 'clip-vit-b32',
          providerId: 'neko-engine',
        },
      }),
    });
  });

  it('fails closed when similarity fails or returns a non-finite score', async () => {
    const failingClient: PerceptionSimilarityClient = {
      perception: {
        similarity: vi.fn(async () => {
          throw new Error('clip unavailable');
        }),
      },
    };
    await expect(
      new PerceptionImageSimilarityTool({ client: failingClient }).execute({
        imageSource: '/tmp/frame.png',
        text: 'cat',
      }),
    ).resolves.toEqual({
      success: false,
      error: 'Image similarity failed: clip unavailable',
    });

    const invalidClient: PerceptionSimilarityClient = {
      perception: {
        similarity: vi.fn(async () => Number.NaN),
      },
    };
    await expect(
      new PerceptionImageSimilarityTool({ client: invalidClient }).execute({
        imageSource: '/tmp/frame.png',
        text: 'cat',
      }),
    ).resolves.toEqual({
      success: false,
      error: 'Image similarity failed: score must be a finite number',
    });
  });
});

describe('PerceptionImageClassifyTool', () => {
  it('declares optional image classification metadata and safe read-only behavior', () => {
    const client: PerceptionClassifyClient = {
      perception: { classify: vi.fn() },
    };
    const tool = new PerceptionImageClassifyTool({ client });

    expect(tool.name).toBe(TOOL_NAMES_PERCEPTION.IMAGE_CLASSIFY);
    expect(tool.category).toBe('analysis');
    expect(tool.isReadOnly).toBe(true);
    expect(tool.isConcurrencySafe).toBe(true);
    expect(PERCEPTION_IMAGE_CLASSIFY_METADATA).toEqual({
      kind: 'perception',
      modality: 'image',
      outputSchema: 'perception-evidence',
      cost: 'moderate',
      requiresGpu: false,
      cacheable: true,
      idempotent: true,
    });
  });

  it('returns ranked labels as PerceptionEvidence through an injected client', async () => {
    const classify = vi.fn(async () => [
      { label: 'red umbrella', score: 0.91 },
      { label: 'blue hair', score: 0.31 },
    ]);
    const client: PerceptionClassifyClient = {
      perception: { classify },
    };
    const tool = new PerceptionImageClassifyTool({ client, now: () => 791 });

    const result = await tool.execute({
      imageSource: '/tmp/frame.png',
      labels: ['blue hair', 'red umbrella'],
      model: 'clip-vit-b32',
      observationId: 'obs-image',
      evidenceId: 'evidence-classify-1',
    });

    expect(classify).toHaveBeenCalledWith({
      model: 'clip-vit-b32',
      image: '/tmp/frame.png',
      labels: ['blue hair', 'red umbrella'],
    });
    expect(isPerceptionEvidenceToolResult(result)).toBe(true);
    expect(result).toEqual({
      success: true,
      data: {
        id: 'evidence-classify-1',
        source: 'tool',
        summary: 'Top image label: "red umbrella" (0.91)',
        confidence: 0.91,
        toolName: TOOL_NAMES_PERCEPTION.IMAGE_CLASSIFY,
        observationId: 'obs-image',
        modelContext: {
          modelId: 'clip-vit-b32',
          providerId: 'neko-engine',
        },
        data: {
          kind: 'perception.image.classify',
          imageSource: '/tmp/frame.png',
          labels: [
            { label: 'red umbrella', score: 0.91 },
            { label: 'blue hair', score: 0.31 },
          ],
        },
        createdAt: 791,
        status: 'active',
      },
    });
  });

  it('fails closed for empty labels and non-finite scores', async () => {
    const invalidClient: PerceptionClassifyClient = {
      perception: { classify: vi.fn(async () => [{ label: 'cat', score: Number.NaN }]) },
    };
    const tool = new PerceptionImageClassifyTool({ client: invalidClient });

    await expect(tool.execute({ imageSource: '/tmp/frame.png', labels: [] })).resolves.toEqual({
      success: false,
      error: '`labels` must contain at least one non-empty string',
    });
    await expect(tool.execute({ imageSource: '/tmp/frame.png', labels: ['cat'] })).resolves.toEqual(
      {
        success: false,
        error: 'Image classification failed: scores must be finite numbers',
      },
    );
  });
});

describe('PerceptionAudioTranscribeTool', () => {
  it('declares optional audio evidence metadata and safe read-only behavior', () => {
    const client: PerceptionTranscribeClient = {
      perception: {
        transcribe: vi.fn(),
      },
    };
    const tool = new PerceptionAudioTranscribeTool({ client });

    expect(tool.name).toBe(TOOL_NAMES_PERCEPTION.AUDIO_TRANSCRIBE);
    expect(tool.category).toBe('analysis');
    expect(tool.isReadOnly).toBe(true);
    expect(tool.isConcurrencySafe).toBe(true);
    expect(PERCEPTION_AUDIO_TRANSCRIBE_METADATA).toEqual({
      kind: 'perception',
      modality: 'audio',
      outputSchema: 'perception-evidence',
      cost: 'moderate',
      requiresGpu: false,
      cacheable: true,
      idempotent: true,
    });
  });

  it('returns transcription as PerceptionEvidence through an injected client', async () => {
    const transcribe = vi.fn(async () => ({
      text: ' hello world ',
      segments: [{ start: 0, end: 1.2, text: 'hello world' }],
      language: 'en',
      durationSecs: 1.2,
    }));
    const client: PerceptionTranscribeClient = {
      perception: { transcribe },
    };
    const tool = new PerceptionAudioTranscribeTool({ client, now: () => 123 });

    const result = await tool.execute({
      audioSource: '/tmp/a.wav',
      model: 'whisper-small',
      observationId: 'obs-a',
      evidenceId: 'evidence-audio-1',
    });

    expect(transcribe).toHaveBeenCalledWith({ model: 'whisper-small', audio: '/tmp/a.wav' });
    expect(isPerceptionEvidenceToolResult(result)).toBe(true);
    expect(result).toEqual({
      success: true,
      data: {
        id: 'evidence-audio-1',
        source: 'tool',
        summary: 'hello world',
        toolName: TOOL_NAMES_PERCEPTION.AUDIO_TRANSCRIBE,
        observationId: 'obs-a',
        modelContext: {
          modelId: 'whisper-small',
          providerId: 'neko-engine',
        },
        data: {
          kind: 'perception.audio.transcribe',
          audioSource: '/tmp/a.wav',
          language: 'en',
          durationSecs: 1.2,
          segments: [{ start: 0, end: 1.2, text: 'hello world' }],
        },
        createdAt: 123,
        status: 'active',
      },
    });
  });

  it('uses the default whisper model and empty transcription summary', async () => {
    const transcribe = vi.fn(async () => ({ text: '   ' }));
    const client: PerceptionTranscribeClient = {
      perception: { transcribe },
    };
    const tool = new PerceptionAudioTranscribeTool({ client, now: () => 456 });

    const result = await tool.execute({ audioSource: '/tmp/empty.wav' });

    expect(transcribe).toHaveBeenCalledWith({ model: 'whisper-base', audio: '/tmp/empty.wav' });
    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        source: 'tool',
        summary: '(empty transcription)',
        toolName: TOOL_NAMES_PERCEPTION.AUDIO_TRANSCRIBE,
        modelContext: {
          modelId: 'whisper-base',
          providerId: 'neko-engine',
        },
        data: expect.objectContaining({
          kind: 'perception.audio.transcribe',
          audioSource: '/tmp/empty.wav',
          language: null,
          durationSecs: null,
          segments: [],
        }),
        createdAt: 456,
        status: 'active',
      }),
    });
  });

  it('fails closed when transcription fails', async () => {
    const client: PerceptionTranscribeClient = {
      perception: {
        transcribe: vi.fn(async () => {
          throw new Error('engine unavailable');
        }),
      },
    };
    const tool = new PerceptionAudioTranscribeTool({ client });

    await expect(tool.execute({ audioSource: '/tmp/a.wav' })).resolves.toEqual({
      success: false,
      error: 'Audio transcription failed: engine unavailable',
    });
  });
});
