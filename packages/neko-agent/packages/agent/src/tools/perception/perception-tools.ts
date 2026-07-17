import {
  BuiltinTool,
  TOOL_NAMES_PERCEPTION,
  createPerceptionEvidenceToolResult,
  type PerceptionToolMetadata,
  type ToolCategory,
  type ToolParameters,
  type ToolResult,
} from '@neko/shared';

export interface PerceptionTranscribeClient {
  readonly perception: {
    transcribe(request: { readonly model: string; readonly audio: string }): Promise<{
      readonly text: string;
      readonly segments?: readonly {
        readonly start: number;
        readonly end: number;
        readonly text: string;
      }[];
      readonly language?: string | null;
      readonly durationSecs?: number | null;
    }>;
  };
}

export interface PerceptionAudioTranscribeToolConfig {
  readonly client: PerceptionTranscribeClient;
  readonly now?: () => number;
}

export interface PerceptionSimilarityClient {
  readonly perception: {
    similarity(request: {
      readonly model: string;
      readonly image: string;
      readonly text: string;
    }): Promise<number>;
  };
}

export interface PerceptionImageSimilarityToolConfig {
  readonly client: PerceptionSimilarityClient;
  readonly now?: () => number;
}

export interface PerceptionClassifyClient {
  readonly perception: {
    classify(request: {
      readonly model: string;
      readonly image: string;
      readonly labels: readonly string[];
    }): Promise<readonly { readonly label: string; readonly score: number }[]>;
  };
}

export interface PerceptionImageClassifyToolConfig {
  readonly client: PerceptionClassifyClient;
  readonly now?: () => number;
}

export interface PerceptionDetectShotsClient {
  readonly perception: {
    detectShots(request: { readonly video: string }): Promise<
      readonly {
        readonly index: number;
        readonly start: number;
        readonly end: number | null;
        readonly confidence?: number | null;
      }[]
    >;
  };
}

export interface PerceptionVideoDetectShotsToolConfig {
  readonly client: PerceptionDetectShotsClient;
  readonly now?: () => number;
}

export const PERCEPTION_DESCRIBE_INPUT_METADATA: PerceptionToolMetadata = {
  kind: 'perception',
  modality: 'mixed',
  outputSchema: 'perception-evidence',
  cost: 'free',
  requiresGpu: false,
  cacheable: true,
  idempotent: true,
};

export class PerceptionDescribeInputTool extends BuiltinTool {
  readonly name = TOOL_NAMES_PERCEPTION.DESCRIBE_INPUT;
  readonly description =
    'Optional Agent-first perception evidence tool. It records a concise description of user-provided image, video, audio, data, or text input as PerceptionEvidence. Use only when extra evidence would help; do not treat it as the primary perceiver.';
  readonly parameters: ToolParameters = {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: 'Concise evidence summary produced or curated by the Agent.',
      },
      modality: {
        type: 'string',
        enum: ['image', 'video', 'audio', 'data', 'text', 'mixed'],
        description: 'Input modality that this evidence describes.',
      },
      observationId: {
        type: 'string',
        description: 'Optional AgentObservation id this evidence supports.',
      },
      confidence: {
        type: 'number',
        description: 'Optional numeric confidence from 0 to 1.',
      },
      evidenceId: {
        type: 'string',
        description: 'Optional stable evidence id. If omitted, one is derived from the summary.',
      },
    },
    required: ['summary', 'modality'],
  };
  readonly category: ToolCategory = 'analysis';
  readonly kind = 'perception' as const;
  readonly perception = PERCEPTION_DESCRIBE_INPUT_METADATA;
  override readonly isConcurrencySafe = true;
  override readonly isReadOnly = true;

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(validation.error ?? 'Invalid arguments');
    }

    const summary = readNonEmptyString(args['summary']);
    if (!summary) {
      return this.error('`summary` must be a non-empty string');
    }

    const modality = readModality(args['modality']);
    if (!modality) {
      return this.error('`modality` must be one of image, video, audio, data, text, mixed');
    }

    const confidence = readConfidence(args['confidence']);
    if (args['confidence'] !== undefined && confidence === undefined) {
      return this.error('`confidence` must be a number between 0 and 1');
    }

    return createPerceptionEvidenceToolResult({
      id: readNonEmptyString(args['evidenceId']) ?? createPerceptionEvidenceId(summary),
      source: 'tool',
      summary,
      ...(confidence !== undefined ? { confidence } : {}),
      toolName: this.name,
      ...(readNonEmptyString(args['observationId'])
        ? { observationId: readNonEmptyString(args['observationId']) }
        : {}),
      data: {
        kind: 'perception.describeInput',
        modality,
      },
      createdAt: Date.now(),
      status: 'active',
    });
  }
}

export const PERCEPTION_AUDIO_TRANSCRIBE_METADATA: PerceptionToolMetadata = {
  kind: 'perception',
  modality: 'audio',
  outputSchema: 'perception-evidence',
  cost: 'moderate',
  requiresGpu: false,
  cacheable: true,
  idempotent: true,
};

export const PERCEPTION_IMAGE_SIMILARITY_METADATA: PerceptionToolMetadata = {
  kind: 'perception',
  modality: 'image',
  outputSchema: 'perception-evidence',
  cost: 'moderate',
  requiresGpu: false,
  cacheable: true,
  idempotent: true,
};

export class PerceptionImageSimilarityTool extends BuiltinTool {
  readonly name = TOOL_NAMES_PERCEPTION.IMAGE_SIMILARITY;
  readonly description =
    'Optional Agent-first image perception evidence tool. It compares an image with a text prompt through the configured perception provider and returns PerceptionEvidence. Use only when similarity evidence would improve the Agent observation or rationale.';
  readonly parameters: ToolParameters = {
    type: 'object',
    properties: {
      imageSource: {
        type: 'string',
        description: 'Absolute path or resolved source path of the image to compare.',
      },
      text: {
        type: 'string',
        description: 'Text prompt or label to compare against the image.',
      },
      model: {
        type: 'string',
        description: 'CLIP model name registered in the engine. Default: clip-vit-b32.',
      },
      observationId: {
        type: 'string',
        description: 'Optional AgentObservation id this similarity evidence supports.',
      },
      evidenceId: {
        type: 'string',
        description:
          'Optional stable evidence id. If omitted, one is derived from image/model/text/score.',
      },
    },
    required: ['imageSource', 'text'],
  };
  readonly category: ToolCategory = 'analysis';
  readonly kind = 'perception' as const;
  readonly perception = PERCEPTION_IMAGE_SIMILARITY_METADATA;
  override readonly isConcurrencySafe = true;
  override readonly isReadOnly = true;

  private readonly client: PerceptionSimilarityClient;
  private readonly now: () => number;

  constructor(config: PerceptionImageSimilarityToolConfig) {
    super();
    this.client = config.client;
    this.now = config.now ?? (() => Date.now());
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(validation.error ?? 'Invalid arguments');
    }

    const imageSource = readNonEmptyString(args['imageSource']);
    if (!imageSource) {
      return this.error('`imageSource` must be a non-empty string');
    }

    const text = readNonEmptyString(args['text']);
    if (!text) {
      return this.error('`text` must be a non-empty string');
    }

    const model = readNonEmptyString(args['model']) ?? 'clip-vit-b32';
    try {
      const score = await this.client.perception.similarity({ model, image: imageSource, text });
      if (!Number.isFinite(score)) {
        return this.error('Image similarity failed: score must be a finite number');
      }

      const roundedScore = Math.round(score * 10000) / 10000;
      const summary = `Image similarity to "${text}": ${roundedScore}`;

      return createPerceptionEvidenceToolResult({
        id:
          readNonEmptyString(args['evidenceId']) ??
          createPerceptionEvidenceId(`${imageSource}|${model}|${text}|${roundedScore}`),
        source: 'tool',
        summary,
        confidence: clampConfidence(score),
        toolName: this.name,
        ...(readNonEmptyString(args['observationId'])
          ? { observationId: readNonEmptyString(args['observationId']) }
          : {}),
        modelContext: {
          modelId: model,
          providerId: 'neko-engine',
        },
        data: {
          kind: 'perception.image.similarity',
          imageSource,
          text,
          score,
        },
        createdAt: this.now(),
        status: 'active',
      });
    } catch (error) {
      return this.error(
        `Image similarity failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export const PERCEPTION_IMAGE_CLASSIFY_METADATA: PerceptionToolMetadata = {
  kind: 'perception',
  modality: 'image',
  outputSchema: 'perception-evidence',
  cost: 'moderate',
  requiresGpu: false,
  cacheable: true,
  idempotent: true,
};

export class PerceptionImageClassifyTool extends BuiltinTool {
  readonly name = TOOL_NAMES_PERCEPTION.IMAGE_CLASSIFY;
  readonly description =
    'Optional Agent-first image classification evidence tool. It ranks candidate labels through the configured perception provider and returns PerceptionEvidence. Use only when label evidence would improve the Agent observation or rationale.';
  readonly parameters: ToolParameters = {
    type: 'object',
    properties: {
      imageSource: {
        type: 'string',
        description: 'Absolute path or resolved source path of the image to classify.',
      },
      labels: {
        type: 'array',
        items: { type: 'string' },
        description: 'Candidate labels to rank against the image.',
      },
      model: {
        type: 'string',
        description: 'CLIP model name registered in the engine. Default: clip-vit-b32.',
      },
      observationId: {
        type: 'string',
        description: 'Optional AgentObservation id this classification evidence supports.',
      },
      evidenceId: {
        type: 'string',
        description:
          'Optional stable evidence id. If omitted, one is derived from image/model/labels/top label.',
      },
    },
    required: ['imageSource', 'labels'],
  };
  readonly category: ToolCategory = 'analysis';
  readonly kind = 'perception' as const;
  readonly perception = PERCEPTION_IMAGE_CLASSIFY_METADATA;
  override readonly isConcurrencySafe = true;
  override readonly isReadOnly = true;

  private readonly client: PerceptionClassifyClient;
  private readonly now: () => number;

  constructor(config: PerceptionImageClassifyToolConfig) {
    super();
    this.client = config.client;
    this.now = config.now ?? (() => Date.now());
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(validation.error ?? 'Invalid arguments');
    }

    const imageSource = readNonEmptyString(args['imageSource']);
    if (!imageSource) {
      return this.error('`imageSource` must be a non-empty string');
    }

    const labels = readStringArray(args['labels']);
    if (labels.length === 0) {
      return this.error('`labels` must contain at least one non-empty string');
    }

    const model = readNonEmptyString(args['model']) ?? 'clip-vit-b32';
    try {
      const rankedLabels = await this.client.perception.classify({
        model,
        image: imageSource,
        labels,
      });
      const top = rankedLabels[0];
      if (!top) {
        return this.error('Image classification failed: no label scores returned');
      }
      if (!rankedLabels.every((item) => Number.isFinite(item.score))) {
        return this.error('Image classification failed: scores must be finite numbers');
      }

      const summary = `Top image label: "${top.label}" (${Math.round(top.score * 10000) / 10000})`;

      return createPerceptionEvidenceToolResult({
        id:
          readNonEmptyString(args['evidenceId']) ??
          createPerceptionEvidenceId(
            `${imageSource}|${model}|${labels.join(',')}|${top.label}|${top.score}`,
          ),
        source: 'tool',
        summary,
        confidence: clampConfidence(top.score),
        toolName: this.name,
        ...(readNonEmptyString(args['observationId'])
          ? { observationId: readNonEmptyString(args['observationId']) }
          : {}),
        modelContext: {
          modelId: model,
          providerId: 'neko-engine',
        },
        data: {
          kind: 'perception.image.classify',
          imageSource,
          labels: rankedLabels,
        },
        createdAt: this.now(),
        status: 'active',
      });
    } catch (error) {
      return this.error(
        `Image classification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export class PerceptionAudioTranscribeTool extends BuiltinTool {
  readonly name = TOOL_NAMES_PERCEPTION.AUDIO_TRANSCRIBE;
  readonly description =
    'Optional Agent-first audio perception evidence tool. It transcribes an audio or video file through the configured perception provider and returns PerceptionEvidence. Use only when transcription evidence would improve the Agent observation or rationale.';
  readonly parameters: ToolParameters = {
    type: 'object',
    properties: {
      audioSource: {
        type: 'string',
        description: 'Absolute path or resolved source path of the audio/video file to transcribe.',
      },
      model: {
        type: 'string',
        description: 'Whisper model name registered in the engine. Default: whisper-base.',
      },
      observationId: {
        type: 'string',
        description: 'Optional AgentObservation id this transcription evidence supports.',
      },
      evidenceId: {
        type: 'string',
        description:
          'Optional stable evidence id. If omitted, one is derived from source/model/text.',
      },
    },
    required: ['audioSource'],
  };
  readonly category: ToolCategory = 'analysis';
  readonly kind = 'perception' as const;
  readonly perception = PERCEPTION_AUDIO_TRANSCRIBE_METADATA;
  override readonly isConcurrencySafe = true;
  override readonly isReadOnly = true;

  private readonly client: PerceptionTranscribeClient;
  private readonly now: () => number;

  constructor(config: PerceptionAudioTranscribeToolConfig) {
    super();
    this.client = config.client;
    this.now = config.now ?? (() => Date.now());
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(validation.error ?? 'Invalid arguments');
    }

    const audioSource = readNonEmptyString(args['audioSource']);
    if (!audioSource) {
      return this.error('`audioSource` must be a non-empty string');
    }

    const model = readNonEmptyString(args['model']) ?? 'whisper-base';
    try {
      const transcription = await this.client.perception.transcribe({ model, audio: audioSource });
      const text = transcription.text.trim();
      const summary = text.length > 0 ? text : '(empty transcription)';

      return createPerceptionEvidenceToolResult({
        id:
          readNonEmptyString(args['evidenceId']) ??
          createPerceptionEvidenceId(`${audioSource}|${model}|${summary}`),
        source: 'tool',
        summary,
        toolName: this.name,
        ...(readNonEmptyString(args['observationId'])
          ? { observationId: readNonEmptyString(args['observationId']) }
          : {}),
        modelContext: {
          modelId: model,
          providerId: 'neko-engine',
        },
        data: {
          kind: 'perception.audio.transcribe',
          audioSource,
          language: transcription.language ?? null,
          durationSecs: transcription.durationSecs ?? null,
          segments: transcription.segments ?? [],
        },
        createdAt: this.now(),
        status: 'active',
      });
    } catch (error) {
      return this.error(
        `Audio transcription failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export const PERCEPTION_VIDEO_DETECT_SHOTS_METADATA: PerceptionToolMetadata = {
  kind: 'perception',
  modality: 'video',
  outputSchema: 'perception-evidence',
  cost: 'moderate',
  requiresGpu: false,
  cacheable: true,
  idempotent: true,
};

export class PerceptionVideoDetectShotsTool extends BuiltinTool {
  readonly name = TOOL_NAMES_PERCEPTION.VIDEO_DETECT_SHOTS;
  readonly description =
    'Optional Agent-first video perception evidence tool. It detects candidate shot boundaries through the configured perception provider. Use only as supporting evidence; the Agent remains responsible for observation and edit decisions.';
  readonly parameters: ToolParameters = {
    type: 'object',
    properties: {
      videoSource: {
        type: 'string',
        description: 'Absolute path or resolved source path of the video to analyze.',
      },
      observationId: {
        type: 'string',
        description: 'Optional AgentObservation id this shot-boundary evidence supports.',
      },
      evidenceId: {
        type: 'string',
        description:
          'Optional stable evidence id. If omitted, one is derived from source and detected shots.',
      },
    },
    required: ['videoSource'],
  };
  readonly category: ToolCategory = 'analysis';
  readonly kind = 'perception' as const;
  readonly perception = PERCEPTION_VIDEO_DETECT_SHOTS_METADATA;
  override readonly isConcurrencySafe = true;
  override readonly isReadOnly = true;

  private readonly client: PerceptionDetectShotsClient;
  private readonly now: () => number;

  constructor(config: PerceptionVideoDetectShotsToolConfig) {
    super();
    this.client = config.client;
    this.now = config.now ?? (() => Date.now());
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(validation.error ?? 'Invalid arguments');
    }

    const videoSource = readNonEmptyString(args['videoSource']);
    if (!videoSource) {
      return this.error('`videoSource` must be a non-empty string');
    }

    try {
      const shots = await this.client.perception.detectShots({ video: videoSource });
      const orderedShots = shots
        .filter((shot) => Number.isFinite(shot.start))
        .map((shot) => ({
          index: shot.index,
          start: shot.start,
          end: shot.end,
          confidence: shot.confidence ?? null,
        }))
        .sort((left, right) => left.start - right.start);
      const summary =
        orderedShots.length === 0
          ? 'No shot boundary candidates detected.'
          : `Detected ${orderedShots.length} shot boundary candidate${orderedShots.length === 1 ? '' : 's'}.`;

      return createPerceptionEvidenceToolResult({
        id:
          readNonEmptyString(args['evidenceId']) ??
          createPerceptionEvidenceId(
            `${videoSource}|${orderedShots.map((shot) => shot.start).join(',')}`,
          ),
        source: 'tool',
        summary,
        toolName: this.name,
        ...(readNonEmptyString(args['observationId'])
          ? { observationId: readNonEmptyString(args['observationId']) }
          : {}),
        modelContext: {
          providerId: 'neko-engine',
        },
        data: {
          kind: 'perception.video.detectShots',
          videoSource,
          shots: orderedShots,
        },
        createdAt: this.now(),
        status: 'active',
      });
    } catch (error) {
      return this.error(
        `Video shot detection failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export function createPerceptionTools(config?: {
  readonly transcribeClient?: PerceptionTranscribeClient;
  readonly similarityClient?: PerceptionSimilarityClient;
  readonly classifyClient?: PerceptionClassifyClient;
  readonly detectShotsClient?: PerceptionDetectShotsClient;
}): readonly BuiltinTool[] {
  return [
    new PerceptionDescribeInputTool(),
    ...(config?.transcribeClient
      ? [new PerceptionAudioTranscribeTool({ client: config.transcribeClient })]
      : []),
    ...(config?.similarityClient
      ? [new PerceptionImageSimilarityTool({ client: config.similarityClient })]
      : []),
    ...(config?.classifyClient
      ? [new PerceptionImageClassifyTool({ client: config.classifyClient })]
      : []),
    ...(config?.detectShotsClient
      ? [new PerceptionVideoDetectShotsTool({ client: config.detectShotsClient })]
      : []),
  ];
}

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readModality(
  value: unknown,
): 'image' | 'video' | 'audio' | 'data' | 'text' | 'mixed' | undefined {
  if (
    value === 'image' ||
    value === 'video' ||
    value === 'audio' ||
    value === 'data' ||
    value === 'text' ||
    value === 'mixed'
  ) {
    return value;
  }
  return undefined;
}

function readStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const text = readNonEmptyString(item);
    return text ? [text] : [];
  });
}

function readConfidence(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    return undefined;
  }
  return value;
}

function clampConfidence(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function createPerceptionEvidenceId(summary: string): string {
  let hash = 0;
  for (let index = 0; index < summary.length; index += 1) {
    hash = (hash * 31 + summary.charCodeAt(index)) >>> 0;
  }
  return `perception:evidence:${hash.toString(16).padStart(8, '0')}`;
}
