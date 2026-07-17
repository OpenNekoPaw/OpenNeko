import {
  projectShotDataPrompt,
  type CanvasShotPromptProjectableData,
  type CanvasStoryboardPromptState,
  type ConversationRunScope,
  type TaskRunScope,
} from '@neko/shared';
import type { ReferenceDescriptor } from '@neko/shared';

export interface CanvasPromptGenerator {
  generate(shotData: CanvasShotPromptData): Promise<string>;
}

export interface CanvasPurposeTextPort {
  complete(input: {
    purpose: 'canvas.prompt';
    instruction: string;
    input: string;
  }): Promise<{ text: string }>;
}

export interface CanvasShotPromptData {
  readonly visualDescription?: string;
  readonly storyboardPrompt?: CanvasStoryboardPromptState;
  readonly characters?: readonly { readonly characterName: string }[];
  readonly shotScale?: string;
  readonly cameraMovement?: string;
  readonly cameraAngle?: string;
  readonly characterAction?: string;
  readonly emotion?: readonly string[];
  readonly sceneTags?: readonly string[];
  readonly dialogue?: string;
  readonly generationPrompt?: string;
  readonly visualStyle?: string;
  readonly vfx?: readonly string[];
}

export type CanvasGenerationStatus = 'pending' | 'generating' | 'done' | 'error';

export type CanvasControlMode =
  'canny' | 'depth' | 'pose' | 'normal' | 'segment' | 'lineart' | 'softedge' | 'scribble';

export interface CanvasIpAdapterReferenceInput {
  readonly imageBase64: string;
  readonly mimeType?: string;
  readonly strength?: number;
  readonly mode?: string;
}

export interface CanvasIpAdapterReference {
  readonly imageBase64: string;
  readonly mimeType?: string;
  readonly strength?: number;
  readonly mode?: 'style' | 'subject' | 'both';
}

export interface CanvasGenerationInput {
  readonly ownerScope: ConversationRunScope;
  readonly nodeId: string;
  readonly cellId?: string;
  readonly prompt: string;
  readonly style?: string;
  readonly ratio?: string;
  readonly shotScale?: string;
  readonly cameraMovement?: string;
  readonly cameraAngle?: string;
  readonly referenceRefs?: readonly string[];
  readonly count?: number;
  readonly characterIds?: readonly string[];
  readonly sourceNodeId?: string;
  readonly controlMode?: string;
  readonly controlStrength?: number;
  readonly controlImageBase64?: string;
  readonly negativePrompt?: string;
  readonly ipAdapterRefs?: readonly CanvasIpAdapterReferenceInput[];
  readonly maskBase64?: string;
  readonly inpaintStrength?: number;
  readonly editInstruction?: string;
}

export interface CanvasGenerationProgress {
  readonly nodeId: string;
  readonly taskId: string;
  readonly cellId?: string;
  readonly status: CanvasGenerationStatus;
  readonly count?: number;
  readonly total?: number;
}

export interface CanvasImageGenerationRequest {
  readonly prompt: string;
  readonly aspectRatio: string;
  readonly count: number;
  readonly metadata: Record<string, unknown>;
  readonly style?: string;
  readonly negativePrompt?: string;
  readonly controlImageBase64?: string;
  readonly controlMode?: CanvasControlMode;
  readonly controlStrength?: number;
  readonly ipAdapterRefs?: CanvasIpAdapterReference[];
  readonly maskBase64?: string;
  readonly inpaintStrength?: number;
  readonly editInstruction?: string;
}

export interface CanvasMediaOutput {
  readonly url: string;
  readonly mimeType?: string;
}

export interface CanvasMediaTask {
  readonly scope: TaskRunScope;
  readonly id: string;
  readonly status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | string;
  readonly outputs?: readonly CanvasMediaOutput[];
}

export interface CanvasMediaService {
  generateImage(request: CanvasImageGenerationRequest): Promise<CanvasMediaTask>;
  waitForTask(taskScope: TaskRunScope, timeoutMs?: number): Promise<CanvasMediaTask>;
}

export interface CanvasReferenceNode {
  readonly id?: string;
  readonly type: string;
  readonly data?: unknown;
}

export interface CanvasImageResolveResult {
  readonly base64: string;
  readonly mimeType: string;
}

export type CanvasImageSourcePlan =
  | {
      readonly kind: 'data-url';
      readonly result: CanvasImageResolveResult;
    }
  | {
      readonly kind: 'remote-url';
      readonly url: string;
      readonly fallbackMimeType: string;
    }
  | {
      readonly kind: 'local-file';
      readonly path: string;
      readonly mimeType: string;
    }
  | {
      readonly kind: 'base64';
      readonly base64: string;
      readonly mimeType: string;
    };

export interface CanvasGenerationRuntimeLogger {
  warn(message: string, metadata?: Record<string, unknown>): void;
}

export interface CanvasGenerationRuntimeDeps {
  readonly promptGenerator?: CanvasPromptGenerator;
  readonly media?: CanvasMediaService;
  readonly resolveCanvasNode?: (nodeId: string) => Promise<CanvasReferenceNode | null | undefined>;
  readonly resolveImageSource?: (source: string) => Promise<CanvasImageResolveResult | undefined>;
  readonly fetchOutputAsDataUrl?: (output: CanvasMediaOutput) => Promise<string | undefined>;
  readonly onProgress?: (progress: CanvasGenerationProgress) => void;
  readonly logger?: CanvasGenerationRuntimeLogger;
}

export interface CanvasGenerationResult {
  readonly dataUrl: string;
}

const CANVAS_GENERATION_TIMEOUT_MS = 3 * 60 * 1000;
const DEFAULT_ASPECT_RATIO = '16:9';
const DEFAULT_GENERATION_COUNT = 1;
const DEFAULT_CANVAS_IMAGE_MIME_TYPE = 'image/png';
const CANVAS_IMAGE_DATA_URL_RE = /^data:([^;]+);base64,(.*)$/s;

const VALID_CONTROL_MODES = new Set<string>([
  'canny',
  'depth',
  'pose',
  'normal',
  'segment',
  'lineart',
  'softedge',
  'scribble',
]);

const VALID_IP_ADAPTER_MODES = new Set<string>(['style', 'subject', 'both']);

const CANVAS_PROMPT_SYSTEM_MESSAGE =
  'You are an expert cinematographer and image generation prompt engineer. ' +
  'Given shot metadata (which may be in Chinese or English), output a single, ' +
  'concise English image generation prompt (<=120 words). ' +
  'Follow this structure: subject + environment + lighting + composition + style. ' +
  'Include shot scale, camera angle, and character emotions naturally. ' +
  'Output ONLY the prompt text, no explanations or markdown.';

const CANVAS_PROMPT_SYSTEM_MESSAGE_ZH =
  '你是专业摄影指导和图像生成提示词工程师。' +
  '给定镜头元数据（可能是中文或英文），输出一条简洁的英文图像生成提示词（不超过 120 个词）。' +
  '遵循这个结构：主体 + 环境 + 灯光 + 构图 + 风格。' +
  '自然包含景别、机位角度和角色情绪。' +
  '只输出提示词文本，不要解释或 Markdown。';

/** Canvas-owned adapter for its semantic prompt generation port. */
export function createCanvasPromptGenerator(
  completion: CanvasPurposeTextPort,
  locale: string,
): CanvasPromptGenerator {
  return {
    generate: async (shotData) => {
      const result = await completion.complete({
        purpose: 'canvas.prompt',
        instruction: isChineseCanvasLocale(locale)
          ? CANVAS_PROMPT_SYSTEM_MESSAGE_ZH
          : CANVAS_PROMPT_SYSTEM_MESSAGE,
        input: buildCanvasShotPromptUserContent(shotData, { locale }),
      });
      const prompt = result.text.trim();
      if (!prompt) throw new Error('Canvas prompt generation returned empty text.');
      return prompt;
    },
  };
}

export class CanvasGenerationRuntime {
  constructor(private readonly deps: CanvasGenerationRuntimeDeps) {}

  async buildPrompt(shotData: CanvasShotPromptData): Promise<string> {
    if (!this.deps.promptGenerator) {
      this.deps.logger?.warn(
        'Canvas prompt generation skipped because no prompt generator is set.',
      );
      return '';
    }
    return (await this.deps.promptGenerator.generate(shotData)).trim();
  }

  async generateForNode(input: CanvasGenerationInput): Promise<CanvasGenerationResult | undefined> {
    if (!this.deps.media) {
      this.deps.logger?.warn('Canvas image generation skipped because no media service is set.');
      return undefined;
    }
    if (!this.deps.fetchOutputAsDataUrl) {
      this.deps.logger?.warn('Canvas image generation skipped because no output fetcher is set.');
      return undefined;
    }

    const ipAdapterRefs = await resolveCanvasIpAdapterReferences(input, this.deps);
    const request = buildCanvasImageGenerationRequest(input, ipAdapterRefs);
    const task = await this.deps.media.generateImage(request);

    this.emitProgress(input, task.id, 'generating');

    const completed = await this.deps.media.waitForTask(task.scope, CANVAS_GENERATION_TIMEOUT_MS);
    const firstOutput = completed.outputs?.[0];
    if (completed.status !== 'completed' || !firstOutput) {
      this.emitProgress(input, task.id, 'error');
      return undefined;
    }

    const dataUrl = await this.deps.fetchOutputAsDataUrl(firstOutput);
    if (!dataUrl) {
      this.emitProgress(input, task.id, 'error');
      return undefined;
    }

    this.emitProgress(input, task.id, 'done');
    return { dataUrl };
  }

  private emitProgress(
    input: CanvasGenerationInput,
    taskId: string,
    status: CanvasGenerationStatus,
  ): void {
    this.deps.onProgress?.({
      nodeId: input.nodeId,
      taskId,
      ...(input.cellId ? { cellId: input.cellId } : {}),
      status,
    });
  }
}

export function buildCanvasShotPromptUserContent(
  shotData: CanvasShotPromptData,
  options: { readonly locale?: string } = {},
): string {
  const labels = isChineseCanvasLocale(options.locale)
    ? {
        scene: '场景',
        promptDocument: '语义提示词',
        style: '风格',
        characters: '角色',
        shotScale: '景别',
        camera: '摄影机',
        angle: '机位角度',
        action: '动作',
        emotion: '情绪',
        tags: '标签',
        dialogue: '对白',
        fallback: '为这个镜头生成图像提示词。',
      }
    : {
        scene: 'Scene',
        promptDocument: 'Semantic prompt',
        style: 'Style',
        characters: 'Characters',
        shotScale: 'Shot scale',
        camera: 'Camera',
        angle: 'Angle',
        action: 'Action',
        emotion: 'Emotion',
        tags: 'Tags',
        dialogue: 'Dialogue',
        fallback: 'Generate an image prompt for this shot.',
      };
  const parts: string[] = [];
  const promptProjection = projectShotDataPrompt(toProjectableShotData(shotData), {
    preferredBlockKind: 'image',
  });
  if (promptProjection.source === 'semantic-prompt-document') {
    parts.push(`${labels.promptDocument}: ${promptProjection.prompt}`);
  } else if (shotData.visualDescription) {
    parts.push(`${labels.scene}: ${shotData.visualDescription}`);
  }
  if (shotData.visualStyle) parts.push(`${labels.style}: ${shotData.visualStyle}`);
  if (shotData.characters?.length) {
    parts.push(
      `${labels.characters}: ${shotData.characters.map((c) => c.characterName).join(', ')}`,
    );
  }
  if (shotData.shotScale) parts.push(`${labels.shotScale}: ${shotData.shotScale}`);
  if (shotData.cameraMovement && shotData.cameraMovement !== 'static') {
    parts.push(`${labels.camera}: ${shotData.cameraMovement}`);
  }
  if (shotData.cameraAngle && shotData.cameraAngle !== 'eye-level') {
    parts.push(`${labels.angle}: ${shotData.cameraAngle}`);
  }
  if (shotData.characterAction) parts.push(`${labels.action}: ${shotData.characterAction}`);
  if (shotData.emotion?.length) parts.push(`${labels.emotion}: ${shotData.emotion.join(', ')}`);
  if (shotData.sceneTags?.length) parts.push(`${labels.tags}: ${shotData.sceneTags.join(', ')}`);
  if (shotData.dialogue) parts.push(`${labels.dialogue}: "${shotData.dialogue}"`);
  if (shotData.vfx?.length) parts.push(`VFX: ${shotData.vfx.join(', ')}`);

  return parts.join('\n') || labels.fallback;
}

function toProjectableShotData(shotData: CanvasShotPromptData): CanvasShotPromptProjectableData {
  const data: CanvasShotPromptProjectableData = {};
  if (shotData.storyboardPrompt) data.storyboardPrompt = shotData.storyboardPrompt;
  if (shotData.generationPrompt) data.generationPrompt = shotData.generationPrompt;
  if (shotData.visualDescription) data.visualDescription = shotData.visualDescription;
  if (shotData.characters) {
    data.characters = shotData.characters.map((character) => ({
      characterName: character.characterName,
    }));
  }
  return data;
}

function isChineseCanvasLocale(locale: string | undefined): boolean {
  return locale?.trim().toLowerCase().startsWith('zh') === true;
}

export function inferCanvasImageMimeType(source: string): string {
  const pathPart = source.split(/[?#]/, 1)[0] ?? source;
  const extension = pathPart.match(/\.([^.\\/:\s]+)$/)?.[1]?.toLowerCase();

  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'bmp':
      return 'image/bmp';
    case 'avif':
      return 'image/avif';
    case 'png':
    default:
      return DEFAULT_CANVAS_IMAGE_MIME_TYPE;
  }
}

export function parseCanvasImageDataUrl(source: string): CanvasImageResolveResult | undefined {
  const match = CANVAS_IMAGE_DATA_URL_RE.exec(source);
  if (!match) return undefined;

  return {
    mimeType: match[1] ?? DEFAULT_CANVAS_IMAGE_MIME_TYPE,
    base64: match[2] ?? '',
  };
}

export function convertCanvasFileUrlToPath(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const pathname = decodeURIComponent(parsed.pathname);
    const host = parsed.host;

    if (host) {
      return `\\\\${host}${pathname.replace(/\//g, '\\')}`;
    }
    if (/^\/[A-Za-z]:[\\/]/.test(pathname)) {
      return pathname.slice(1);
    }
    return pathname;
  } catch {
    return undefined;
  }
}

export function isCanvasLocalFilePath(source: string): boolean {
  return source.startsWith('/') || /^[A-Za-z]:[\\/]/.test(source) || source.startsWith('\\\\');
}

export function planCanvasImageSource(source: string): CanvasImageSourcePlan | undefined {
  if (!source) return undefined;

  if (source.startsWith('data:')) {
    const result = parseCanvasImageDataUrl(source);
    return result ? { kind: 'data-url', result } : undefined;
  }

  if (source.startsWith('http://') || source.startsWith('https://')) {
    return {
      kind: 'remote-url',
      url: source,
      fallbackMimeType: inferCanvasImageMimeType(source),
    };
  }

  const path = source.startsWith('file://') ? convertCanvasFileUrlToPath(source) : source;
  if (path && isCanvasLocalFilePath(path)) {
    return {
      kind: 'local-file',
      path,
      mimeType: inferCanvasImageMimeType(path),
    };
  }

  return {
    kind: 'base64',
    base64: source,
    mimeType: DEFAULT_CANVAS_IMAGE_MIME_TYPE,
  };
}

export function buildCanvasMediaOutputDataUrl(
  output: Pick<CanvasMediaOutput, 'mimeType'>,
  base64: string,
  responseContentType?: string | null,
): string {
  const mimeType = output.mimeType ?? responseContentType ?? DEFAULT_CANVAS_IMAGE_MIME_TYPE;
  return `data:${mimeType};base64,${base64}`;
}

export function buildCanvasGenerationPrompt(input: CanvasGenerationInput): string {
  const parts: string[] = [input.prompt];
  if (input.shotScale) parts.push(`Shot: ${input.shotScale}`);
  if (input.cameraAngle) parts.push(`Angle: ${input.cameraAngle}`);
  if (input.cameraMovement && input.cameraMovement !== 'static') {
    parts.push(`Camera: ${input.cameraMovement}`);
  }
  if (input.style) parts.push(`Style: ${input.style}`);
  return parts.filter((part) => part.trim().length > 0).join(', ');
}

export function buildCanvasImageGenerationRequest(
  input: CanvasGenerationInput,
  ipAdapterRefs?: readonly CanvasIpAdapterReference[],
): CanvasImageGenerationRequest {
  const referenceDescriptors = collectCanvasGenerationReferenceDescriptors(input);
  const metadata: Record<string, unknown> = {
    ...input.ownerScope,
    nodeId: input.nodeId,
    sourceNodeId: input.sourceNodeId ?? input.nodeId,
  };
  if (input.cellId) metadata['cellId'] = input.cellId;
  if (input.characterIds && input.characterIds.length > 0) {
    metadata['characterIds'] = [...input.characterIds];
  }
  if (referenceDescriptors.length > 0) {
    metadata['referenceDescriptors'] = referenceDescriptors;
  }

  const controlMode = normalizeCanvasControlMode(input.controlMode);

  return {
    prompt: buildCanvasGenerationPrompt(input),
    aspectRatio: input.ratio ?? DEFAULT_ASPECT_RATIO,
    count: normalizeCanvasGenerationCount(input.count),
    metadata,
    ...(input.style ? { style: input.style } : {}),
    ...(input.negativePrompt ? { negativePrompt: input.negativePrompt } : {}),
    ...(input.controlImageBase64 ? { controlImageBase64: input.controlImageBase64 } : {}),
    ...(controlMode ? { controlMode } : {}),
    ...(input.controlStrength !== undefined ? { controlStrength: input.controlStrength } : {}),
    ...(ipAdapterRefs && ipAdapterRefs.length > 0 ? { ipAdapterRefs: [...ipAdapterRefs] } : {}),
    ...(input.maskBase64 ? { maskBase64: input.maskBase64 } : {}),
    ...(input.inpaintStrength !== undefined ? { inpaintStrength: input.inpaintStrength } : {}),
    ...(input.editInstruction ? { editInstruction: input.editInstruction } : {}),
  };
}

export function collectCanvasGenerationReferenceDescriptors(
  input: CanvasGenerationInput,
): readonly ReferenceDescriptor[] {
  return (input.referenceRefs ?? []).flatMap((ref, index): readonly ReferenceDescriptor[] => {
    const parsed = parseCanvasReferenceRef(ref);
    if (!parsed) return [];
    return [
      {
        schemaVersion: 1,
        kind: 'reference-descriptor',
        referenceId: `${input.nodeId}:referenceRefs:${index}`,
        sourceKind: 'canvas-node',
        sourceId: input.nodeId,
        referenceKind: 'canvas-node',
        role: 'reference',
        modality: 'image',
        payload: {
          type: 'canvas-node',
          nodeId: parsed.nodeId,
          ...(parsed.cellId ? { cellId: parsed.cellId } : {}),
        },
        metadata: { field: 'referenceRefs', index },
      },
    ];
  });
}

export async function resolveCanvasIpAdapterReferences(
  input: CanvasGenerationInput,
  deps: Pick<CanvasGenerationRuntimeDeps, 'resolveCanvasNode' | 'resolveImageSource' | 'logger'>,
): Promise<CanvasIpAdapterReference[] | undefined> {
  const explicitRefs = normalizeCanvasIpAdapterReferences(input.ipAdapterRefs);
  if (explicitRefs?.length) return explicitRefs;
  if (!input.referenceRefs?.length || !deps.resolveCanvasNode || !deps.resolveImageSource) {
    return undefined;
  }

  const refs: CanvasIpAdapterReference[] = [];
  for (const ref of input.referenceRefs) {
    const parsed = parseCanvasReferenceRef(ref);
    if (!parsed) continue;

    try {
      const node = await deps.resolveCanvasNode(parsed.nodeId);
      if (!node) continue;

      const imageSource = selectCanvasReferenceImageSource(node, parsed.cellId);
      if (!imageSource) continue;

      const resolved = await deps.resolveImageSource(imageSource);
      if (!resolved) continue;

      refs.push({
        imageBase64: resolved.base64,
        mimeType: resolved.mimeType,
        strength: 0.6,
        mode: 'both',
      });
    } catch (error) {
      deps.logger?.warn('Failed to resolve canvas IP-Adapter reference.', {
        reference: ref,
        error,
      });
    }
  }

  return refs.length > 0 ? refs : undefined;
}

export function normalizeCanvasIpAdapterReferences(
  refs: readonly CanvasIpAdapterReferenceInput[] | undefined,
): CanvasIpAdapterReference[] | undefined {
  if (!refs?.length) return undefined;

  const normalized: CanvasIpAdapterReference[] = [];
  for (const ref of refs) {
    if (!ref.imageBase64) continue;
    normalized.push({
      imageBase64: ref.imageBase64,
      ...(ref.mimeType ? { mimeType: ref.mimeType } : {}),
      ...(ref.strength !== undefined ? { strength: ref.strength } : {}),
      ...(normalizeCanvasIpAdapterMode(ref.mode)
        ? { mode: normalizeCanvasIpAdapterMode(ref.mode) }
        : {}),
    });
  }

  return normalized.length > 0 ? normalized : undefined;
}

export function selectCanvasReferenceImageSource(
  node: CanvasReferenceNode,
  cellId?: string,
): string | undefined {
  const data = isRecord(node.data) ? node.data : {};

  if (node.type === 'gallery') {
    const cells = Array.isArray(data['cells']) ? data['cells'] : [];
    for (const rawCell of cells) {
      if (!isRecord(rawCell)) continue;
      if (cellId && rawCell['id'] !== cellId) continue;

      const generatedAsset = isRecord(rawCell['generatedAsset'])
        ? rawCell['generatedAsset']
        : undefined;
      const source = readString(generatedAsset?.['path']) ?? readString(rawCell['image']);
      if (source) return source;
      if (cellId) return undefined;
    }
    return undefined;
  }

  if (node.type === 'shot') {
    const generatedAsset = isRecord(data['generatedAsset']) ? data['generatedAsset'] : undefined;
    return readString(generatedAsset?.['path']) ?? readString(data['generatedImage']);
  }

  return undefined;
}

export function parseCanvasReferenceRef(
  ref: string,
): { readonly nodeId: string; readonly cellId?: string } | null {
  const [nodeId, cellId] = ref.split(':');
  if (!nodeId) return null;
  return {
    nodeId,
    ...(cellId ? { cellId } : {}),
  };
}

export function normalizeCanvasGenerationCount(count: number | undefined): number {
  if (typeof count !== 'number' || !Number.isFinite(count) || count < 1) {
    return DEFAULT_GENERATION_COUNT;
  }
  return Math.floor(count);
}

export function normalizeCanvasControlMode(
  mode: string | undefined,
): CanvasControlMode | undefined {
  return mode && VALID_CONTROL_MODES.has(mode) ? (mode as CanvasControlMode) : undefined;
}

export function normalizeCanvasIpAdapterMode(
  mode: string | undefined,
): CanvasIpAdapterReference['mode'] | undefined {
  return mode && VALID_IP_ADAPTER_MODES.has(mode)
    ? (mode as CanvasIpAdapterReference['mode'])
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
