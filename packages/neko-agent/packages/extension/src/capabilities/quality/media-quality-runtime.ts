import type {
  AudioTechnicalMetrics,
  EvalMediaType,
  IssueSeverity,
  MediaEvaluation,
  QualityIssue,
  QualityIssueCategory,
  RemediationAction,
  VideoTechnicalMetrics,
} from '@neko/shared';
import { isExplicitChatRoutingError } from './chat-routing-error';
import { QUALITY_ISSUE_CATEGORIES } from '@neko/shared';
import { createRemediationPlanner } from './remediation-planner';

export interface MediaQualityLLMService {
  chat(
    messages: unknown[],
    options?: { maxTokens?: number; providerId?: string; modelId?: string },
  ): Promise<{ message: { content: string | unknown[] } }>;
}

export interface MediaQualityChatModelRef {
  readonly providerId: string;
  readonly modelId: string;
}

export interface MediaQualityGenerator {
  generate(
    prompt: string,
    options: MediaGenerateOptions,
  ): Promise<{ path: string; duration?: number }>;
}

export interface MediaGenerateOptions {
  type?: 'image' | 'video';
  duration?: number;
  resolution?: string;
  style?: string;
  aspectRatio?: string;
}

/** @deprecated Migration-only path input. Canonical review uses QualityTarget. */
export interface MediaQualitySceneInput {
  index: number;
  mediaPath: string;
  prompt: string;
  description?: string;
}

export interface MediaQualityCheckInput {
  scenes?: MediaQualitySceneInput[];
  /**
   * Explicit repair attempts for failed non-audio scenes. Defaults to 0 so
   * read-only QualityCheck stays analysis-only.
   */
  maxRetries?: number;
  minScore?: number;
  style?: string;
  sceneDialogue?: string[];
}

export interface MediaQualityCheckResult {
  totalScenes: number;
  passed: number;
  failed: number;
  evaluations: Array<{
    index: number;
    finalScore: number;
    passed: boolean;
    attempts: number;
    issues: QualityIssue[];
    finalPath: string;
    timeRange?: { start: number; end: number };
    dimensions?: MediaEvaluation['dimensions'];
    remediations?: RemediationAction[];
    audioMetrics?: AudioTechnicalMetrics;
    videoMetrics?: VideoTechnicalMetrics;
  }>;
}

export interface MediaQualityEvalOptions {
  globalStyle?: string;
  dialogue?: string[];
}

export interface MediaQualityLogger {
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
}

export interface IAudioAnalyzer {
  analyzeLoudness(
    source: string,
    targetLufs?: number,
  ): Promise<{
    integratedLufs: number;
    truePeakDbfs: number;
    loudnessRange: number;
    recommendedGain: number;
    targetLufs: number;
  }>;
  detectSilence(
    source: string,
    thresholdDbfs?: number,
    minDuration?: number,
  ): Promise<{
    totalDuration: number;
    silenceDuration: number;
    silenceRatio: number;
    regionCount: number;
  }>;
}

export interface IFrameExtractor {
  extractFrame(source: string, time: number): Promise<string | null>;
  probe(source: string): Promise<{ duration: number; fps: number; width: number; height: number }>;
}

export interface MediaQualityRuntimeDeps {
  createService: () => MediaQualityLLMService;
  mediaGenerator: MediaQualityGenerator;
  readFileAsBase64(filePath: string): Promise<string>;
  chatModel?: MediaQualityChatModelRef;
  locale?: string;
  audioAnalyzer?: IAudioAnalyzer;
  frameExtractor?: IFrameExtractor;
  logger?: MediaQualityLogger;
}

const VALID_CATEGORIES = new Set<string>(QUALITY_ISSUE_CATEGORIES);
const VALID_SEVERITIES = new Set<string>(['critical', 'major', 'minor', 'info']);

const EVALUATION_SYSTEM_PROMPT = `You are a visual quality evaluator for AI-generated media.
Evaluate the provided image against the generation context.

Return ONLY valid JSON matching this exact schema:
{
  "overallScore": <0-100>,
  "dimensions": {
    "technicalQuality": <0-100>,
    "promptAdherence": <0-100>,
    "scriptAdherence": <0-100 or null if no script context>,
    "aesthetics": <0-100>
  },
  "issues": [
    {
      "category": "<category>",
      "severity": "<critical|major|minor|info>",
      "description": "<concise description>",
      "location": {
        "timeRange": { "start": <seconds>, "end": <seconds> }
      }
    }
  ]
}

Issue categories:
- artifact: visual noise, blur, distortion, deformities
- resolution: insufficient detail/sharpness for intended use
- color-distortion: unnatural colors, white balance issues
- prompt-mismatch: generated content doesn't match the prompt
- script-mismatch: doesn't match the scene description/dialogue
- style-drift: inconsistent with specified global style
- character-inconsistency: character appearance differs from reference
- composition-poor: poor framing, balance, or visual flow

Only report actual issues. Empty issues array is valid for a good image.
For images, omit location unless there is an explicit temporal range in context.`;

const EVALUATION_SYSTEM_PROMPT_ZH = `你是 AI 生成媒体的视觉质量评估器。
请根据生成上下文评估提供的图像。

只返回符合此 schema 的有效 JSON：
{
  "overallScore": <0-100>,
  "dimensions": {
    "technicalQuality": <0-100>,
    "promptAdherence": <0-100>,
    "scriptAdherence": <0-100 or null if no script context>,
    "aesthetics": <0-100>
  },
  "issues": [
    {
      "category": "<category>",
      "severity": "<critical|major|minor|info>",
      "description": "<concise description>",
      "location": {
        "timeRange": { "start": <seconds>, "end": <seconds> }
      }
    }
  ]
}

问题类别：
- artifact: 视觉噪声、模糊、扭曲、形变
- resolution: 对目标用途而言细节或清晰度不足
- color-distortion: 颜色不自然、白平衡问题
- prompt-mismatch: 生成内容与提示词不匹配
- script-mismatch: 与场景描述或对白不匹配
- style-drift: 与指定全局风格不一致
- character-inconsistency: 角色外观与参考不一致
- composition-poor: 构图、平衡或视觉流较差

只报告真实存在的问题。好图像可以返回空 issues 数组。
图像评估中，除非上下文有明确时间范围，否则省略 location。`;

const PROMPT_OPTIMIZATION_SYSTEM_PROMPT = `You are an AI image/video generation prompt engineer.
Given the original prompt and quality issues found, produce an improved prompt.
Focus on fixing the specific issues while preserving the original intent.
Return ONLY the improved prompt text, nothing else. Max 200 words.`;

const PROMPT_OPTIMIZATION_SYSTEM_PROMPT_ZH = `你是 AI 图像/视频生成提示词工程师。
给定原始提示词和已发现的质量问题，生成改进后的提示词。
重点修复具体问题，同时保留原始意图。
只返回改进后的提示词文本，不要其他内容。最多 200 个词。`;

const VIDEO_EVALUATION_SYSTEM_PROMPT = `You are a video quality evaluator for AI-generated video.
You will be shown multiple frames sampled from a video. Evaluate both per-frame quality
AND inter-frame consistency (temporal coherence).

Return ONLY valid JSON matching this exact schema:
{
  "overallScore": <0-100>,
  "dimensions": {
    "technicalQuality": <0-100>,
    "promptAdherence": <0-100>,
    "scriptAdherence": <0-100 or null if no script context>,
    "aesthetics": <0-100>,
    "videoQuality": <0-100>
  },
  "issues": [
    {
      "category": "<category>",
      "severity": "<critical|major|minor|info>",
      "description": "<concise description>",
      "location": {
        "timeRange": { "start": <seconds>, "end": <seconds> }
      }
    }
  ]
}

Issue categories (in addition to standard image categories):
- jitter: flickering, sudden brightness/color changes between frames
- tearing: visual tearing, misaligned frames, stitching artifacts
- stuttering: apparent frame drops, uneven motion, frozen segments
- artifact: visual noise, blur, distortion, deformities
- resolution: insufficient detail/sharpness
- color-distortion: unnatural colors, white balance issues
- prompt-mismatch: content doesn't match the prompt
- script-mismatch: doesn't match the scene description
- style-drift: inconsistent style across frames
- character-inconsistency: character appearance changes between frames
- composition-poor: poor framing or visual flow
- motion-unnatural: physically impossible or unnatural movement

For video issues, include location.timeRange in seconds when the sampled frames or prompt context
make the affected range identifiable. If the issue spans the full clip, use the full video range.
Pay special attention to temporal issues: consistency of lighting, color, character appearance,
and object positions across frames. Only report actual issues found.`;

const VIDEO_EVALUATION_SYSTEM_PROMPT_ZH = `你是 AI 生成视频的质量评估器。
你会看到从视频中采样的多帧图像。请同时评估单帧质量和帧间一致性（时间连续性）。

只返回符合此 schema 的有效 JSON：
{
  "overallScore": <0-100>,
  "dimensions": {
    "technicalQuality": <0-100>,
    "promptAdherence": <0-100>,
    "scriptAdherence": <0-100 or null if no script context>,
    "aesthetics": <0-100>,
    "videoQuality": <0-100>
  },
  "issues": [
    {
      "category": "<category>",
      "severity": "<critical|major|minor|info>",
      "description": "<concise description>",
      "location": {
        "timeRange": { "start": <seconds>, "end": <seconds> }
      }
    }
  ]
}

视频额外问题类别：
- jitter: 帧间闪烁、亮度或颜色突变
- tearing: 画面撕裂、帧错位、拼接瑕疵
- stuttering: 掉帧感、运动不均匀、画面冻结
- motion-unnatural: 物理上不可能或不自然的运动

如果可以定位问题影响范围，请包含 location.timeRange 秒数。
特别关注灯光、颜色、角色外观和物体位置的时间连续性。只报告真实发现的问题。`;

const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'opus', 'm4a', 'flac', 'ogg', 'aac']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'avi']);
const DEFAULT_VIDEO_SAMPLE_FRAMES = 4;

function getMediaQualityEvaluationSystemPrompt(locale: string | undefined): string {
  return isChineseQualityLocale(locale) ? EVALUATION_SYSTEM_PROMPT_ZH : EVALUATION_SYSTEM_PROMPT;
}

function getPromptOptimizationSystemPrompt(locale: string | undefined): string {
  return isChineseQualityLocale(locale)
    ? PROMPT_OPTIMIZATION_SYSTEM_PROMPT_ZH
    : PROMPT_OPTIMIZATION_SYSTEM_PROMPT;
}

function getVideoEvaluationSystemPrompt(locale: string | undefined): string {
  return isChineseQualityLocale(locale)
    ? VIDEO_EVALUATION_SYSTEM_PROMPT_ZH
    : VIDEO_EVALUATION_SYSTEM_PROMPT;
}

function isChineseQualityLocale(locale: string | undefined): boolean {
  return locale?.trim().toLowerCase().startsWith('zh') === true;
}

function formatVisionEvaluationUserText(
  originalPrompt: string,
  description: string | undefined,
  options: MediaQualityEvalOptions | undefined,
  locale: string | undefined,
): string {
  const textParts = isChineseQualityLocale(locale)
    ? [`原始提示词：“${originalPrompt}”`]
    : [`Original prompt: "${originalPrompt}"`];
  if (isChineseQualityLocale(locale)) {
    if (description) textParts.push(`场景描述：“${description}”`);
    if (options?.globalStyle) textParts.push(`全局风格：“${options.globalStyle}”`);
    if (options?.dialogue?.length) {
      textParts.push(`对白：${JSON.stringify(options.dialogue)}`);
    }
    return textParts.join('\n');
  }

  if (description) textParts.push(`Scene description: "${description}"`);
  if (options?.globalStyle) textParts.push(`Global style: "${options.globalStyle}"`);
  if (options?.dialogue?.length) {
    textParts.push(`Dialogue: ${JSON.stringify(options.dialogue)}`);
  }
  return textParts.join('\n');
}

function formatPromptOptimizationUserText(
  originalPrompt: string,
  issues: QualityIssue[],
  locale: string | undefined,
): string {
  const issueDescriptions = issues.map((issue) => `- [${issue.category}] ${issue.description}`);
  if (isChineseQualityLocale(locale)) {
    return `原始提示词：“${originalPrompt}”\n\n发现的问题：\n${issueDescriptions.join('\n')}\n\n请提供改进后的提示词：`;
  }

  return `Original prompt: "${originalPrompt}"\n\nIssues found:\n${issueDescriptions.join('\n')}\n\nProvide an improved prompt:`;
}

function formatVideoEvaluationUserText(
  originalPrompt: string,
  meta: { duration: number; fps: number; width: number; height: number },
  frames: Array<{ base64: string; time: number }>,
  description: string | undefined,
  options: MediaQualityEvalOptions | undefined,
  locale: string | undefined,
): string {
  const sampledTimes = frames.map((frame) => `${frame.time.toFixed(1)}s`).join(', ');
  if (isChineseQualityLocale(locale)) {
    const textParts = [
      `原始提示词：“${originalPrompt}”`,
      `视频元数据：${meta.width}x${meta.height}, ${meta.fps}fps, ${meta.duration.toFixed(1)}s`,
      `采样帧：${frames.length}（${sampledTimes}）`,
    ];
    if (description) textParts.push(`场景描述：“${description}”`);
    if (options?.globalStyle) textParts.push(`全局风格：“${options.globalStyle}”`);
    if (options?.dialogue?.length) {
      textParts.push(`对白：${JSON.stringify(options.dialogue)}`);
    }
    return textParts.join('\n');
  }

  const textParts = [
    `Original prompt: "${originalPrompt}"`,
    `Video metadata: ${meta.width}x${meta.height}, ${meta.fps}fps, ${meta.duration.toFixed(1)}s`,
    `Frames sampled: ${frames.length} (at ${sampledTimes})`,
  ];
  if (description) textParts.push(`Scene description: "${description}"`);
  if (options?.globalStyle) textParts.push(`Global style: "${options.globalStyle}"`);
  if (options?.dialogue?.length) {
    textParts.push(`Dialogue: ${JSON.stringify(options.dialogue)}`);
  }
  return textParts.join('\n');
}

const CLIPPING_THRESHOLD_DBFS = -1;
const LOUDNESS_MIN_LUFS = -24;
const LOUDNESS_MAX_LUFS = -8;
const LOUDNESS_BROADCAST_MIN = -16;
const LOUDNESS_BROADCAST_MAX = -12;
const SILENCE_RATIO_WARN = 0.5;
const LOUDNESS_RANGE_MAX_LU = 20;

export function extractTextFromContent(content: string | unknown[]): string {
  if (typeof content === 'string') return content;
  for (const part of content) {
    if (
      typeof part === 'object' &&
      part !== null &&
      'type' in part &&
      (part as { type: string }).type === 'text' &&
      'text' in part
    ) {
      return (part as { text: string }).text;
    }
  }
  return '';
}

export function coerceQualityScore(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function detectQualityMediaType(filePath: string): EvalMediaType {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  return 'image';
}

function isValidIssue(
  raw: unknown,
): raw is { category: string; severity?: string; description?: string; location?: unknown } {
  if (typeof raw !== 'object' || raw === null) return false;
  const obj = raw as Record<string, unknown>;
  return typeof obj['category'] === 'string' && VALID_CATEGORIES.has(obj['category']);
}

function normalizeIssue(raw: {
  category: string;
  severity?: string;
  description?: string;
  location?: unknown;
}): QualityIssue {
  const location = normalizeIssueLocation(raw.location);
  return {
    category: raw.category as QualityIssueCategory,
    severity: (typeof raw.severity === 'string' && VALID_SEVERITIES.has(raw.severity)
      ? raw.severity
      : 'major') as IssueSeverity,
    description: typeof raw.description === 'string' ? raw.description : raw.category,
    ...(location ? { location } : {}),
  };
}

function normalizeIssueLocation(value: unknown): QualityIssue['location'] | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const location: NonNullable<QualityIssue['location']> = {};

  if (typeof record['sceneIndex'] === 'number' && Number.isFinite(record['sceneIndex'])) {
    location.sceneIndex = Math.floor(record['sceneIndex']);
  }

  const timeRange = readIssueTimeRange(record['timeRange']);
  if (timeRange) {
    location.timeRange = timeRange;
  }

  const region = readIssueRegion(record['region']);
  if (region) {
    location.region = region;
  }

  return Object.keys(location).length > 0 ? location : undefined;
}

function readIssueTimeRange(value: unknown): { start: number; end: number } | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const start = record['start'];
  const end = record['end'];
  if (
    typeof start !== 'number' ||
    typeof end !== 'number' ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start
  ) {
    return undefined;
  }
  return { start, end };
}

function readIssueRegion(
  value: unknown,
): { x: number; y: number; w: number; h: number } | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const x = record['x'];
  const y = record['y'];
  const w = record['w'];
  const h = record['h'];
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof w !== 'number' ||
    typeof h !== 'number' ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(w) ||
    !Number.isFinite(h)
  ) {
    return undefined;
  }
  return { x, y, w, h };
}

function parseEvaluationJson(text: string, defaultMessage: string): MediaEvaluation {
  try {
    const cleaned = text
      .replace(/```json?\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const dims = (parsed['dimensions'] ?? {}) as Record<string, unknown>;
    const rawIssues = Array.isArray(parsed['issues']) ? parsed['issues'] : [];

    return {
      overallScore: coerceQualityScore(parsed['overallScore']),
      dimensions: {
        technicalQuality: coerceQualityScore(dims['technicalQuality']),
        promptAdherence: coerceQualityScore(dims['promptAdherence']),
        scriptAdherence:
          dims['scriptAdherence'] != null ? coerceQualityScore(dims['scriptAdherence']) : undefined,
        aesthetics: coerceQualityScore(dims['aesthetics']),
        videoQuality:
          dims['videoQuality'] != null ? coerceQualityScore(dims['videoQuality']) : undefined,
      },
      issues: rawIssues.filter(isValidIssue).map(normalizeIssue),
      passed: false,
    };
  } catch {
    return qualityErrorResult(defaultMessage);
  }
}

function qualityErrorResult(
  message: string,
  category: QualityIssueCategory = 'artifact',
): MediaEvaluation {
  return {
    overallScore: 0,
    dimensions: { technicalQuality: 0, promptAdherence: 0, aesthetics: 0 },
    issues: [
      {
        category,
        severity: 'critical',
        description: message,
      },
    ],
    passed: false,
  };
}

function withMediaQualityChatModelRouting(
  options: { maxTokens?: number },
  chatModel: MediaQualityChatModelRef | undefined,
): { maxTokens?: number; providerId: string; modelId: string } {
  if (!chatModel?.providerId || !chatModel.modelId) {
    throw new Error(
      'Media quality LLM evaluation requires an explicit chat providerId and modelId.',
    );
  }

  return {
    ...options,
    providerId: chatModel.providerId,
    modelId: chatModel.modelId,
  };
}

class VisionEvaluator {
  constructor(
    private readonly deps: Pick<
      MediaQualityRuntimeDeps,
      'createService' | 'readFileAsBase64' | 'chatModel' | 'locale' | 'logger'
    >,
  ) {}

  async evaluate(
    mediaPath: string,
    originalPrompt: string,
    description?: string,
    options?: MediaQualityEvalOptions,
  ): Promise<MediaEvaluation> {
    try {
      const base64 = await this.deps.readFileAsBase64(mediaPath);
      const mimeType = this.detectMimeType(mediaPath);
      const userText = formatVisionEvaluationUserText(
        originalPrompt,
        description,
        options,
        this.deps.locale,
      );

      const response = await this.deps.createService().chat(
        [
          { role: 'system', content: getMediaQualityEvaluationSystemPrompt(this.deps.locale) },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: userText,
              },
              {
                type: 'image',
                imageUrl: `data:${mimeType};base64,${base64}`,
                detail: 'low',
              },
            ],
          },
        ],
        withMediaQualityChatModelRouting({ maxTokens: 800 }, this.deps.chatModel),
      );

      return parseEvaluationJson(
        extractTextFromContent(response.message.content),
        'Failed to parse LLM evaluation response',
      );
    } catch (error) {
      if (isExplicitChatRoutingError(error)) {
        throw error;
      }
      this.deps.logger?.warn('Vision evaluation failed', { mediaPath, error });
      return qualityErrorResult(
        `Evaluation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async optimizePrompt(originalPrompt: string, issues: QualityIssue[]): Promise<string> {
    try {
      const response = await this.deps.createService().chat(
        [
          { role: 'system', content: getPromptOptimizationSystemPrompt(this.deps.locale) },
          {
            role: 'user',
            content: formatPromptOptimizationUserText(originalPrompt, issues, this.deps.locale),
          },
        ],
        withMediaQualityChatModelRouting({ maxTokens: 500 }, this.deps.chatModel),
      );

      return extractTextFromContent(response.message.content).trim() || originalPrompt;
    } catch (error) {
      if (isExplicitChatRoutingError(error)) {
        throw error;
      }
      return originalPrompt;
    }
  }

  private detectMimeType(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    const mimeMap: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      gif: 'image/gif',
      mp4: 'video/mp4',
      webm: 'video/webm',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      opus: 'audio/opus',
      m4a: 'audio/mp4',
      flac: 'audio/flac',
    };
    return mimeMap[ext] ?? 'image/png';
  }
}

class AudioEvaluator {
  constructor(
    private readonly analyzer: IAudioAnalyzer,
    private readonly logger?: MediaQualityLogger,
  ) {}

  async evaluate(mediaPath: string): Promise<MediaEvaluation> {
    try {
      const [loudness, silence] = await Promise.all([
        this.analyzer.analyzeLoudness(mediaPath),
        this.analyzer.detectSilence(mediaPath),
      ]);

      const metrics: AudioTechnicalMetrics = {
        integratedLufs: loudness.integratedLufs,
        truePeakDbfs: loudness.truePeakDbfs,
        loudnessRange: loudness.loudnessRange,
        silenceRatio: silence.silenceRatio,
        silenceRegionCount: silence.regionCount,
        clippingDetected: loudness.truePeakDbfs > CLIPPING_THRESHOLD_DBFS,
        loudnessInRange:
          loudness.integratedLufs >= LOUDNESS_BROADCAST_MIN &&
          loudness.integratedLufs <= LOUDNESS_BROADCAST_MAX,
      };

      const audioQuality = this.computeAudioScore(metrics);
      return {
        overallScore: audioQuality,
        dimensions: {
          technicalQuality: audioQuality,
          promptAdherence: 100,
          aesthetics: 100,
          audioQuality,
        },
        issues: this.detectIssues(metrics),
        passed: false,
        audioMetrics: metrics,
      };
    } catch (error) {
      this.logger?.warn('Audio evaluation failed', { mediaPath, error });
      return {
        ...qualityErrorResult(
          `Audio analysis failed: ${error instanceof Error ? error.message : String(error)}`,
          'audio-noise',
        ),
        dimensions: { technicalQuality: 0, promptAdherence: 0, aesthetics: 0, audioQuality: 0 },
      };
    }
  }

  private detectIssues(metrics: AudioTechnicalMetrics): QualityIssue[] {
    const issues: QualityIssue[] = [];

    if (metrics.truePeakDbfs > CLIPPING_THRESHOLD_DBFS) {
      issues.push({
        category: 'audio-clipping',
        severity: metrics.truePeakDbfs > 0 ? 'critical' : 'major',
        description: `True peak at ${metrics.truePeakDbfs.toFixed(1)} dBFS exceeds ${CLIPPING_THRESHOLD_DBFS} dBFS threshold`,
      });
    }

    if (metrics.integratedLufs < LOUDNESS_MIN_LUFS || metrics.integratedLufs > LOUDNESS_MAX_LUFS) {
      issues.push({
        category: 'loudness-off',
        severity: 'major',
        description: `Integrated loudness ${metrics.integratedLufs.toFixed(1)} LUFS outside acceptable range (${LOUDNESS_MIN_LUFS} to ${LOUDNESS_MAX_LUFS} LUFS)`,
      });
    } else if (!metrics.loudnessInRange) {
      issues.push({
        category: 'loudness-off',
        severity: 'minor',
        description: `Loudness ${metrics.integratedLufs.toFixed(1)} LUFS outside broadcast range (${LOUDNESS_BROADCAST_MIN} to ${LOUDNESS_BROADCAST_MAX} LUFS)`,
      });
    }

    if (metrics.loudnessRange > LOUDNESS_RANGE_MAX_LU) {
      issues.push({
        category: 'loudness-off',
        severity: 'minor',
        description: `Loudness range ${metrics.loudnessRange.toFixed(1)} LU exceeds ${LOUDNESS_RANGE_MAX_LU} LU; dynamic range too wide`,
      });
    }

    if (metrics.silenceRatio > SILENCE_RATIO_WARN) {
      issues.push({
        category: 'audio-noise',
        severity: 'info',
        description: `${(metrics.silenceRatio * 100).toFixed(0)}% silence detected (${metrics.silenceRegionCount} regions)`,
      });
    }

    return issues;
  }

  private computeAudioScore(metrics: AudioTechnicalMetrics): number {
    let score = 100;

    if (metrics.clippingDetected) {
      const overshoot = Math.max(0, metrics.truePeakDbfs - CLIPPING_THRESHOLD_DBFS);
      score -= Math.min(40, overshoot * 20);
    }

    if (metrics.integratedLufs < LOUDNESS_MIN_LUFS) {
      score -= Math.min(30, Math.abs(metrics.integratedLufs - LOUDNESS_MIN_LUFS) * 2);
    } else if (metrics.integratedLufs > LOUDNESS_MAX_LUFS) {
      score -= Math.min(30, (metrics.integratedLufs - LOUDNESS_MAX_LUFS) * 2);
    } else if (!metrics.loudnessInRange) {
      score -= 10;
    }

    if (metrics.loudnessRange > LOUDNESS_RANGE_MAX_LU) {
      score -= Math.min(15, metrics.loudnessRange - LOUDNESS_RANGE_MAX_LU);
    }

    if (metrics.silenceRatio > SILENCE_RATIO_WARN) {
      score -= Math.min(10, (metrics.silenceRatio - SILENCE_RATIO_WARN) * 20);
    }

    return coerceQualityScore(Math.round(score));
  }
}

class VideoFrameEvaluator {
  constructor(
    private readonly createService: () => MediaQualityLLMService,
    private readonly frameExtractor: IFrameExtractor,
    private readonly chatModel?: MediaQualityChatModelRef,
    private readonly locale?: string,
    private readonly logger?: MediaQualityLogger,
    private readonly maxFrames: number = DEFAULT_VIDEO_SAMPLE_FRAMES,
  ) {}

  async evaluate(
    mediaPath: string,
    originalPrompt: string,
    description?: string,
    options?: MediaQualityEvalOptions,
  ): Promise<MediaEvaluation> {
    try {
      const meta = await this.frameExtractor.probe(mediaPath);
      if (meta.duration <= 0) {
        return this.errorResult('Video has zero duration');
      }

      const times = this.selectSampleTimes(meta.duration, meta.fps);
      const frameResults = await Promise.allSettled(
        times.map((time) => this.frameExtractor.extractFrame(mediaPath, time)),
      );

      const frames: Array<{ base64: string; time: number }> = [];
      for (let i = 0; i < frameResults.length; i++) {
        const result = frameResults[i];
        const time = times[i];
        if (result?.status === 'fulfilled' && result.value && typeof time === 'number') {
          frames.push({ base64: result.value, time });
        }
      }

      if (frames.length === 0) {
        return this.errorResult('Failed to extract any frames from video');
      }

      const userText = formatVideoEvaluationUserText(
        originalPrompt,
        meta,
        frames,
        description,
        options,
        this.locale,
      );

      const contentParts: unknown[] = [{ type: 'text', text: userText }];
      for (const frame of frames) {
        contentParts.push({
          type: 'image',
          imageUrl: `data:image/jpeg;base64,${frame.base64}`,
          detail: 'low',
        });
      }

      const response = await this.createService().chat(
        [
          { role: 'system', content: getVideoEvaluationSystemPrompt(this.locale) },
          { role: 'user', content: contentParts },
        ],
        withMediaQualityChatModelRouting({ maxTokens: 1000 }, this.chatModel),
      );

      const evaluation = parseEvaluationJson(
        extractTextFromContent(response.message.content),
        'Failed to parse LLM video evaluation response',
      );
      const videoMetrics: VideoTechnicalMetrics = {
        duration: meta.duration,
        fps: meta.fps,
        width: meta.width,
        height: meta.height,
        framesSampled: frames.length,
      };

      return {
        ...evaluation,
        videoMetrics,
        dimensions: {
          ...evaluation.dimensions,
          videoQuality: evaluation.dimensions.videoQuality ?? evaluation.overallScore,
        },
      };
    } catch (error) {
      if (isExplicitChatRoutingError(error)) {
        throw error;
      }
      this.logger?.warn('Video evaluation failed', { mediaPath, error });
      return this.errorResult(
        `Video evaluation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private selectSampleTimes(duration: number, fps: number): number[] {
    const margin = duration * 0.05;
    const effectiveDuration = duration - 2 * margin;
    const frameCount = Math.min(this.maxFrames, Math.max(2, Math.floor(fps * duration)));
    const times: number[] = [];
    for (let i = 0; i < frameCount; i++) {
      times.push(margin + (effectiveDuration * i) / (frameCount - 1 || 1));
    }
    return times;
  }

  private errorResult(message: string): MediaEvaluation {
    return {
      ...qualityErrorResult(message),
      dimensions: { technicalQuality: 0, promptAdherence: 0, aesthetics: 0, videoQuality: 0 },
    };
  }
}

/** @deprecated Migration-only runtime. Use QualityGateRuntime for default execution. */
export class MediaQualityRuntime {
  private readonly evaluator: VisionEvaluator;
  private readonly audioEvaluator: AudioEvaluator | undefined;
  private readonly videoEvaluator: VideoFrameEvaluator | undefined;
  private readonly planner = createRemediationPlanner();

  constructor(private readonly deps: MediaQualityRuntimeDeps) {
    this.evaluator = new VisionEvaluator(deps);
    this.audioEvaluator = deps.audioAnalyzer
      ? new AudioEvaluator(deps.audioAnalyzer, deps.logger)
      : undefined;
    this.videoEvaluator = deps.frameExtractor
      ? new VideoFrameEvaluator(
          deps.createService,
          deps.frameExtractor,
          deps.chatModel,
          deps.locale,
          deps.logger,
        )
      : undefined;
  }

  async evaluate(input: MediaQualityCheckInput): Promise<MediaQualityCheckResult> {
    const scenes = input.scenes ?? [];
    const maxRetries = Math.max(0, Math.floor(input.maxRetries ?? 0));
    const minScore = input.minScore ?? 60;

    if (scenes.length === 0) {
      return { totalScenes: 0, passed: 0, failed: 0, evaluations: [] };
    }

    const evalOptions: MediaQualityEvalOptions = {
      globalStyle: input.style,
      dialogue: input.sceneDialogue,
    };

    this.deps.logger?.info('Starting quality check', {
      sceneCount: scenes.length,
      maxRetries,
      minScore,
    });

    const initialResults = await Promise.allSettled(
      scenes.map(async (scene) => {
        const mediaType = detectQualityMediaType(scene.mediaPath);
        const result = await this.evaluateScene(scene, mediaType, evalOptions);
        return { ...result, sceneIndex: scene.index, mediaType };
      }),
    );

    const evaluations: MediaQualityCheckResult['evaluations'] = [];
    const needsRetry: Array<{
      scene: MediaQualitySceneInput;
      evaluation: MediaEvaluation;
      mediaType: EvalMediaType;
    }> = [];

    for (let i = 0; i < initialResults.length; i++) {
      const settled = initialResults[i];
      const scene = scenes[i];
      if (!scene || !settled) continue;

      if (settled.status === 'fulfilled') {
        const evalResult = settled.value;
        this.collectInitialEvaluation({
          evalResult,
          scene,
          minScore,
          evaluations,
          needsRetry,
        });
      } else {
        if (isExplicitChatRoutingError(settled.reason)) {
          throw settled.reason;
        }
        needsRetry.push({
          scene,
          mediaType: detectQualityMediaType(scene.mediaPath),
          evaluation: qualityErrorResult('Evaluation failed'),
        });
      }
    }

    await this.retryFailedScenes({
      needsRetry,
      maxRetries,
      minScore,
      style: input.style,
      evalOptions,
      evaluations,
    });

    evaluations.sort((a, b) => a.index - b.index);

    const result: MediaQualityCheckResult = {
      totalScenes: scenes.length,
      passed: evaluations.filter((evaluation) => evaluation.passed).length,
      failed: evaluations.filter((evaluation) => !evaluation.passed).length,
      evaluations,
    };

    this.deps.logger?.info('Quality check complete', {
      total: result.totalScenes,
      passed: result.passed,
      failed: result.failed,
    });

    return result;
  }

  private async evaluateScene(
    scene: MediaQualitySceneInput,
    mediaType: EvalMediaType,
    evalOptions: MediaQualityEvalOptions,
  ): Promise<MediaEvaluation> {
    if (mediaType === 'audio' && this.audioEvaluator) {
      return this.audioEvaluator.evaluate(scene.mediaPath);
    }
    if (mediaType === 'video' && this.videoEvaluator) {
      return this.videoEvaluator.evaluate(
        scene.mediaPath,
        scene.prompt,
        scene.description,
        evalOptions,
      );
    }
    return this.evaluator.evaluate(scene.mediaPath, scene.prompt, scene.description, evalOptions);
  }

  private collectInitialEvaluation(input: {
    evalResult: MediaEvaluation & { mediaType: EvalMediaType };
    scene: MediaQualitySceneInput;
    minScore: number;
    evaluations: MediaQualityCheckResult['evaluations'];
    needsRetry: Array<{
      scene: MediaQualitySceneInput;
      evaluation: MediaEvaluation;
      mediaType: EvalMediaType;
    }>;
  }): void {
    const { evalResult, scene, minScore, evaluations, needsRetry } = input;
    const mediaType = evalResult.mediaType;

    if (evalResult.overallScore >= minScore || mediaType === 'audio') {
      const remediations = this.planCriticalRemediations(evalResult.issues, mediaType);
      evaluations.push({
        index: scene.index,
        finalScore: evalResult.overallScore,
        passed: evalResult.overallScore >= minScore,
        attempts: 1,
        issues: evalResult.issues,
        finalPath: scene.mediaPath,
        ...(evalResult.videoMetrics
          ? { timeRange: { start: 0, end: evalResult.videoMetrics.duration } }
          : {}),
        dimensions: evalResult.dimensions,
        remediations: remediations.length > 0 ? remediations : undefined,
        audioMetrics: evalResult.audioMetrics,
        videoMetrics: evalResult.videoMetrics,
      });
      return;
    }

    needsRetry.push({ scene, evaluation: evalResult, mediaType });
  }

  private async retryFailedScenes(input: {
    needsRetry: Array<{
      scene: MediaQualitySceneInput;
      evaluation: MediaEvaluation;
      mediaType: EvalMediaType;
    }>;
    maxRetries: number;
    minScore: number;
    style?: string;
    evalOptions: MediaQualityEvalOptions;
    evaluations: MediaQualityCheckResult['evaluations'];
  }): Promise<void> {
    const { needsRetry, maxRetries, minScore, style, evalOptions, evaluations } = input;

    for (const { scene, evaluation, mediaType } of needsRetry) {
      let currentPath = scene.mediaPath;
      let currentPrompt = scene.prompt;
      let bestScore = evaluation.overallScore;
      let bestPath = currentPath;
      let bestIssues = evaluation.issues;
      let bestDimensions = evaluation.dimensions;
      let bestAudioMetrics = evaluation.audioMetrics;
      let bestVideoMetrics = evaluation.videoMetrics;
      let attempts = 1;

      for (let retry = 0; retry < maxRetries; retry++) {
        try {
          const optimizedPrompt = await this.evaluator.optimizePrompt(
            currentPrompt,
            evaluation.issues,
          );
          const result = await this.deps.mediaGenerator.generate(optimizedPrompt, {
            type: mediaType === 'video' ? 'video' : 'image',
            style,
          });

          currentPath = result.path;
          currentPrompt = optimizedPrompt;

          const reEval =
            mediaType === 'video' && this.videoEvaluator
              ? await this.videoEvaluator.evaluate(
                  currentPath,
                  optimizedPrompt,
                  scene.description,
                  evalOptions,
                )
              : await this.evaluator.evaluate(
                  currentPath,
                  optimizedPrompt,
                  scene.description,
                  evalOptions,
                );

          attempts++;

          if (reEval.overallScore > bestScore) {
            bestScore = reEval.overallScore;
            bestPath = currentPath;
            bestIssues = reEval.issues;
            bestDimensions = reEval.dimensions;
            bestAudioMetrics = reEval.audioMetrics;
            bestVideoMetrics = reEval.videoMetrics;
          }

          if (reEval.overallScore >= minScore) {
            break;
          }
        } catch (error) {
          if (isExplicitChatRoutingError(error)) {
            throw error;
          }
          this.deps.logger?.warn('Retry failed for scene', {
            sceneIndex: scene.index,
            retry,
            error,
          });
          attempts++;
        }
      }

      const remediations = this.planCriticalRemediations(bestIssues, mediaType);
      evaluations.push({
        index: scene.index,
        finalScore: bestScore,
        passed: bestScore >= minScore,
        attempts,
        issues: bestIssues,
        finalPath: bestPath,
        ...(bestVideoMetrics ? { timeRange: { start: 0, end: bestVideoMetrics.duration } } : {}),
        dimensions: bestDimensions,
        remediations: remediations.length > 0 ? remediations : undefined,
        audioMetrics: bestAudioMetrics,
        videoMetrics: bestVideoMetrics,
      });
    }
  }

  private planCriticalRemediations(
    issues: QualityIssue[],
    mediaType: EvalMediaType,
  ): RemediationAction[] {
    return issues
      .filter((issue) => issue.severity === 'critical' || issue.severity === 'major')
      .map((issue) => this.planner.plan(issue, mediaType));
  }
}

/** @deprecated Migration-only factory. Use createQualityGateRuntime. */
export function createMediaQualityRuntime(deps: MediaQualityRuntimeDeps): MediaQualityRuntime {
  return new MediaQualityRuntime(deps);
}
