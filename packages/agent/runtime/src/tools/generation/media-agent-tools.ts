/**
 * Media Agent Tools - Tool executors for AI media generation in agent mode
 *
 * Bridges canonical image/video capability tools to the MediaGenerationService.
 * Each Tool waits for the linked provider execution to reach a terminal state.
 * Progress and the final result remain anchored to the originating Pi toolCallId.
 */

import { createTool } from '../base';
import { isContentLocator, type ContentLocator } from '@neko/content';
import { isVideoOperationId } from '@neko/generation';
import { requireToolExecutionRunScope } from '@neko/agent-contracts';
import type {
  GenerationIntent,
  IToolRegistry,
  ProviderAdaptationMode,
  ProviderGenerationCapability,
  ToolExecuteOptions,
  ToolResultAttachment,
} from '@neko/agent-contracts';
import type {
  GenerationJobCommandInput,
  GenerationJobPort,
  GenerationJobRequest,
  GenerationJobSnapshot,
  ImageGenerationRequest,
  VideoGenerationRequest,
} from '@neko/generation';
import { resolveImageGenerationType, resolveVideoGenerationType } from '@neko/generation/media';

interface AgentMediaExecutionIdentity {
  readonly conversationId: string;
  readonly runId: string;
  readonly turnId: string;
  readonly toolCallId: string;
}

interface ImageToolRequestInput {
  readonly args: Record<string, unknown>;
  readonly execution: AgentMediaExecutionIdentity;
  readonly target: GenerationTargetMetadata;
  readonly resolved: ResolvedGenerationPrompt;
  readonly transformMetadata?: Record<string, unknown>;
  readonly executionMetadata?: Record<string, unknown>;
}

interface ResolvedGenerationPrompt {
  readonly prompt: string;
  readonly negativePrompt?: string;
  readonly providerId?: string;
  readonly metadata?: Record<string, unknown>;
}

interface GenerationTargetMetadata {
  readonly requestedProviderId?: string;
  readonly requestedModelId?: string;
  readonly actualProviderId?: string;
  readonly actualModelId?: string;
}

interface ResolvedToolMediaTarget {
  readonly providerId: string;
  readonly modelId: string;
}

async function resolveGenerationPrompt(
  args: Record<string, unknown>,
  capability: ProviderGenerationCapability,
  defaultProviderId?: string,
): Promise<ResolvedGenerationPrompt> {
  const explicitProviderId = readOptionalString(args.providerId) ?? defaultProviderId;
  const prompt = typeof args.prompt === 'string' ? args.prompt : '';
  const negativePrompt = readOptionalString(args.negativePrompt);
  const intent = readMarkdownGenerationIntent(args, capability, prompt);
  const adaptationMode = readProviderAdaptationMode(args);

  if (!intent) {
    if (!prompt.trim()) {
      throw new Error(
        `${capability === 'image.generate' ? 'GenerateImage' : 'GenerateVideo'} requires prompt or taskRef/planRef markdown`,
      );
    }
    return {
      prompt,
      ...(negativePrompt ? { negativePrompt } : {}),
      ...(explicitProviderId ? { providerId: explicitProviderId } : {}),
      metadata: buildProviderAdaptationMetadata({
        mode: 'native',
        source: { kind: 'inline-prompt' },
        originalPrompt: prompt,
        providerPrompt: prompt,
        riskFlags: ['no-structured-intent'],
      }),
    };
  }

  if (adaptationMode === 'native') {
    return resolveNativeGenerationIntent(intent, explicitProviderId, negativePrompt, {
      reason: 'provider-adaptation-bypassed',
    });
  }

  return resolveNativeGenerationIntent(intent, explicitProviderId, negativePrompt, {
    mode: 'agentic',
    reason: 'agent-expression-context-only',
  });
}

function resolveNativeGenerationIntent(
  intent: GenerationIntent,
  providerId: string | undefined,
  negativePrompt: string | undefined,
  details: Record<string, unknown>,
): ResolvedGenerationPrompt {
  const defaultPrompt = composeGenerationIntentPrompt(intent);
  return {
    prompt: defaultPrompt,
    ...(negativePrompt ? { negativePrompt } : {}),
    ...(providerId ? { providerId } : {}),
    metadata: buildProviderAdaptationMetadata({
      mode: details.mode === 'agentic' ? 'agentic' : 'native',
      source: intent.source,
      extractedIntent: intent,
      providerPrompt: defaultPrompt,
      riskFlags: typeof details.reason === 'string' ? [details.reason] : [],
    }),
  };
}

function readProviderAdaptationMode(args: Record<string, unknown>): ProviderAdaptationMode {
  const value = args.providerAdaptationMode;
  return value === 'native' || value === 'agentic' ? value : 'auto';
}

function buildProviderAdaptationMetadata(input: {
  readonly mode: ProviderAdaptationMode;
  readonly source: GenerationIntent['source'];
  readonly originalPrompt?: string;
  readonly extractedIntent?: GenerationIntent;
  readonly providerPrompt: string;
  readonly riskFlags: readonly string[];
  readonly target?: GenerationTargetMetadata;
}): Record<string, unknown> {
  return {
    providerAdaptation: {
      mode: input.mode,
      source: input.source,
      ...(input.originalPrompt ? { originalPrompt: input.originalPrompt } : {}),
      ...(input.extractedIntent ? { extractedIntent: input.extractedIntent } : {}),
      providerPrompt: input.providerPrompt,
      ...(input.target?.requestedProviderId
        ? { providerId: input.target.requestedProviderId }
        : {}),
      ...(input.target?.requestedModelId ? { modelId: input.target.requestedModelId } : {}),
      ...(input.target?.actualProviderId || input.target?.actualModelId
        ? {
            resolvedTarget: {
              ...(input.target.actualProviderId
                ? { providerId: input.target.actualProviderId }
                : {}),
              ...(input.target.actualModelId ? { modelId: input.target.actualModelId } : {}),
            },
          }
        : {}),
      adaptationMetadata: {
        riskFlags: input.riskFlags,
      },
    },
  };
}

function withGenerationTargetMetadata(
  metadata: Record<string, unknown> | undefined,
  target: GenerationTargetMetadata,
): Record<string, unknown> | undefined {
  const providerAdaptation = metadata?.providerAdaptation;
  if (!isRecord(providerAdaptation)) return metadata;
  return buildProviderAdaptationMetadata({
    mode: providerAdaptation.mode === 'agentic' ? 'agentic' : 'native',
    source: readGenerationIntentSource(providerAdaptation.source),
    ...(typeof providerAdaptation.originalPrompt === 'string'
      ? { originalPrompt: providerAdaptation.originalPrompt }
      : {}),
    ...(isGenerationIntent(providerAdaptation.extractedIntent)
      ? { extractedIntent: providerAdaptation.extractedIntent }
      : {}),
    providerPrompt:
      typeof providerAdaptation.providerPrompt === 'string'
        ? providerAdaptation.providerPrompt
        : '',
    riskFlags: readRiskFlags(providerAdaptation.adaptationMetadata),
    target,
  });
}

function readRiskFlags(value: unknown): readonly string[] {
  if (!isRecord(value) || !Array.isArray(value.riskFlags)) return [];
  return value.riskFlags.filter((entry): entry is string => typeof entry === 'string');
}

function isGenerationIntent(value: unknown): value is GenerationIntent {
  return isRecord(value) && isGenerationIntentSource(value.source);
}

function readGenerationIntentSource(value: unknown): GenerationIntent['source'] {
  return isGenerationIntentSource(value) ? value : { kind: 'inline-prompt' };
}

function isGenerationIntentSource(value: unknown): value is GenerationIntent['source'] {
  if (!isRecord(value)) return false;
  return (
    value.kind === 'inline-prompt' ||
    value.kind === 'task-markdown' ||
    value.kind === 'plan-markdown'
  );
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveToolMediaTarget(
  args: Record<string, unknown>,
  options: ToolExecuteOptions | undefined,
  purpose:
    | 'image.generate'
    | 'image.edit'
    | 'video.generate'
    | 'audio.generate'
    | 'audio.tts'
    | 'audio.music.generate',
): { providerId?: string; modelId?: string; source: 'args' | 'runtime' | 'missing' } {
  const argProviderId = readOptionalString(args.providerId);
  const argModelId = readOptionalString(args.modelId);
  if (argProviderId || argModelId) {
    return { source: 'args' };
  }
  const runtimeTarget = readRuntimeMediaModel(options, purpose);

  return {
    providerId: runtimeTarget?.providerId,
    modelId: runtimeTarget?.modelId,
    source: runtimeTarget ? 'runtime' : 'missing',
  };
}

function requireToolMediaTarget(
  target: ReturnType<typeof resolveToolMediaTarget>,
  toolName: string,
): string | null {
  if (target.providerId && target.modelId) return null;
  if (target.source === 'args') {
    return `${toolName} rejects model-authored providerId/modelId; routing is owned by the immutable turn purpose policy.`;
  }
  return `${toolName} requires an explicit Agent ${toolNameMediaCategory(toolName)} purpose model in the immutable turn policy.`;
}

function toResolvedToolMediaTarget(
  target: ReturnType<typeof resolveToolMediaTarget>,
): ResolvedToolMediaTarget {
  if (!target.providerId || !target.modelId) {
    throw new Error('Tool media target must be validated before request assembly.');
  }
  return { providerId: target.providerId, modelId: target.modelId };
}

function toGenerationTargetMetadata(target: ResolvedToolMediaTarget): GenerationTargetMetadata {
  return {
    requestedProviderId: target.providerId,
    requestedModelId: target.modelId,
  };
}

function toolNameMediaCategory(toolName: string): string {
  if (toolName.includes('Video')) return 'video';
  if (toolName.includes('Music') || toolName.includes('TTS')) return 'audio';
  return 'image';
}

function buildImageGenerationRequest(input: ImageToolRequestInput): ImageGenerationRequest {
  if (!input.target.requestedProviderId || !input.target.requestedModelId) {
    throw new Error('Image generation request assembly requires providerId and modelId.');
  }
  const aspectRatio = readOptionalString(input.args.aspectRatio);
  const sizeStr = readOptionalString(input.args.size);
  const [width, height] = sizeStr?.split('x').map(Number) ?? [];
  const metadata = buildImageToolMetadata({
    execution: input.execution,
    resolved: input.resolved,
    target: input.target,
    transformMetadata: input.transformMetadata,
    executionMetadata: input.executionMetadata,
  });

  return {
    prompt: input.resolved.prompt,
    ...(input.resolved.negativePrompt ? { negativePrompt: input.resolved.negativePrompt } : {}),
    providerId: input.target.requestedProviderId,
    modelId: input.target.requestedModelId,
    ...(Number.isFinite(width) ? { width } : {}),
    ...(Number.isFinite(height) ? { height } : {}),
    ...(aspectRatio ? { aspectRatio } : {}),
    ...(input.args.quality === 'standard' || input.args.quality === 'hd'
      ? { quality: input.args.quality }
      : {}),
    ...(readOptionalString(input.args.style)
      ? { style: readOptionalString(input.args.style) }
      : {}),
    ...(readOptionalNumber(input.args.n) !== undefined
      ? { count: readOptionalNumber(input.args.n) }
      : {}),
    ...readImageReferenceInputs(input.args),
    ...readImageControlInputs(input.args),
    ...(metadata ? { metadata } : {}),
  };
}

function buildImageToolMetadata(input: {
  readonly execution: AgentMediaExecutionIdentity;
  readonly resolved: ResolvedGenerationPrompt;
  readonly target: GenerationTargetMetadata;
  readonly transformMetadata?: Record<string, unknown>;
  readonly executionMetadata?: Record<string, unknown>;
}): Record<string, unknown> | undefined {
  const metadata = input.resolved.metadata
    ? withGenerationTargetMetadata(input.resolved.metadata, input.target)
    : undefined;
  const withUnderstandingModels = mergeRuntimeUnderstandingModels(
    metadata,
    input.executionMetadata,
  );
  const withConversation = mergeAgentMediaExecutionMetadata(
    withUnderstandingModels,
    input.execution,
  );
  if (!input.transformMetadata) return withConversation;
  return {
    ...(withConversation ?? {}),
    transformImage: input.transformMetadata,
  };
}

function mergeRuntimeUnderstandingModels(
  metadata: Record<string, unknown> | undefined,
  executionMetadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const understandingModels = executionMetadata?.understandingModels;
  if (!isRecord(understandingModels)) return metadata;
  return {
    ...(metadata ?? {}),
    understandingModels,
  };
}

function mergeAgentMediaExecutionMetadata(
  metadata: Record<string, unknown> | undefined,
  execution: AgentMediaExecutionIdentity,
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    conversationId: execution.conversationId,
    runId: execution.runId,
    turnId: execution.turnId,
    toolCallId: execution.toolCallId,
  };
}

function buildAgentMediaExecutionData(
  execution: AgentMediaExecutionIdentity,
): Record<string, unknown> {
  return {
    conversationId: execution.conversationId,
    runId: execution.runId,
    turnId: execution.turnId,
    toolCallId: execution.toolCallId,
  };
}

function requireAgentMediaExecutionIdentity(
  options: ToolExecuteOptions | undefined,
): AgentMediaExecutionIdentity {
  const run = requireToolExecutionRunScope(options);
  return {
    ...run,
    turnId: requireExecutionMetadataId(options, 'turnId'),
    toolCallId: requireExecutionMetadataId(options, 'toolCallId'),
  };
}

function requireExecutionMetadataId(
  options: ToolExecuteOptions | undefined,
  field: 'turnId' | 'toolCallId',
): string {
  const value = options?.metadata?.[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Agent media Tool requires non-empty metadata.${field}.`);
  }
  return value.trim();
}

interface LinkedGenerationJobResult {
  readonly jobKind: 'generation';
  readonly jobId: string;
  readonly jobLifecycleOwner: 'generation-job-coordinator';
  readonly providerId: string;
  readonly modelId: string;
  readonly outputs: readonly {
    readonly type: 'image' | 'video' | 'audio';
    readonly contentLocator: ContentLocator;
  }[];
}

async function executeLinkedGenerationJob(
  jobs: GenerationJobPort,
  input: GenerationJobRequest,
  outputType: 'image' | 'video' | 'audio',
  options: ToolExecuteOptions | undefined,
): Promise<LinkedGenerationJobResult> {
  const initial = await jobs.submitGeneration({ ...input, lifecycleMode: 'linked' });
  const terminal = await waitForGenerationJobTerminal(jobs, initial, options);
  if (terminal.phase !== 'succeeded') {
    throw new Error(
      terminal.failure?.message ??
        `Generation Job ${terminal.ref.jobId} ended in phase ${terminal.phase}.`,
    );
  }
  const resultLocators = terminal.resultLocators ?? [];
  if (resultLocators.length === 0) {
    throw new Error(
      `Generation Job ${terminal.ref.jobId} succeeded without stable ContentLocator results.`,
    );
  }
  return {
    jobKind: terminal.ref.kind,
    jobId: terminal.ref.jobId,
    jobLifecycleOwner: 'generation-job-coordinator',
    providerId: terminal.request.providerId,
    modelId: terminal.request.modelId,
    outputs: resultLocators.map((contentLocator) => ({ type: outputType, contentLocator })),
  };
}

async function waitForGenerationJobTerminal(
  jobs: GenerationJobPort,
  initial: GenerationJobSnapshot,
  options: ToolExecuteOptions | undefined,
): Promise<GenerationJobSnapshot> {
  if (isGenerationJobTerminal(initial)) return initial;
  let latest = initial;
  const iterator = jobs.observeGeneration(initial.ref)[Symbol.asyncIterator]();
  try {
    while (true) {
      const update = await nextGenerationJobUpdate(iterator, options?.signal);
      if (update.done) {
        throw new Error(
          `Generation Job ${initial.ref.jobId} observation ended before a terminal snapshot.`,
        );
      }
      latest = update.value;
      options?.onProgress?.({
        percent: latest.progress.percent,
        stage: latest.progress.stage,
        data: projectGenerationJobProgress(latest),
      });
      if (isGenerationJobTerminal(latest)) return latest;
    }
  } catch (error) {
    if (!options?.signal?.aborted) throw error;
    await cancelLinkedGenerationJob(jobs, latest);
    throw abortReason(options.signal);
  } finally {
    await iterator.return?.();
  }
}

function projectGenerationJobProgress(snapshot: GenerationJobSnapshot) {
  return {
    kind: 'generation-job' as const,
    jobId: snapshot.ref.jobId,
    phase: snapshot.phase,
    stage: snapshot.progress.stage,
    percent: snapshot.progress.percent,
    providerId: snapshot.request.providerId,
    modelId: snapshot.request.modelId,
  };
}

async function nextGenerationJobUpdate(
  iterator: AsyncIterator<GenerationJobSnapshot>,
  signal: AbortSignal | undefined,
): Promise<IteratorResult<GenerationJobSnapshot>> {
  if (!signal) return iterator.next();
  if (signal.aborted) throw abortReason(signal);
  return new Promise<IteratorResult<GenerationJobSnapshot>>((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    void iterator.next().then(
      (result) => {
        signal.removeEventListener('abort', onAbort);
        resolve(result);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

async function cancelLinkedGenerationJob(
  jobs: GenerationJobPort,
  latest: GenerationJobSnapshot,
): Promise<void> {
  if (isGenerationJobTerminal(latest)) return;
  const current = await jobs.describeGeneration(latest.ref);
  if (isGenerationJobTerminal(current)) return;
  await jobs.cancelGeneration({ ref: current.ref });
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error('Generation Tool Call cancelled.');
}

function isGenerationJobTerminal(snapshot: GenerationJobSnapshot): boolean {
  return (
    snapshot.phase === 'succeeded' ||
    snapshot.phase === 'failed' ||
    snapshot.phase === 'cancelled' ||
    snapshot.phase === 'outcome-unknown'
  );
}

function createMediaToolAttachments(
  outputs: LinkedGenerationJobResult['outputs'],
): ToolResultAttachment[] {
  return outputs.map((output) => ({
    type: output.type,
    contentLocator: output.contentLocator,
  }));
}

function readImageReferenceInputs(args: Record<string, unknown>): Partial<ImageGenerationRequest> {
  rejectLegacyMediaInputFields(args, [
    'referenceImageUrl',
    'referenceImageUri',
    'referenceImageBase64',
    'maskUri',
    'maskBase64',
  ]);
  const referenceImageLocator = readOptionalContentLocator(
    args.referenceImageLocator,
    'referenceImageLocator',
  );
  const maskLocator = readOptionalContentLocator(args.maskLocator, 'maskLocator');
  const ipAdapterRefs = readIpAdapterRefs(args.ipAdapterRefs);
  return {
    ...(referenceImageLocator ? { referenceImageLocator } : {}),
    ...(maskLocator ? { maskLocator } : {}),
    ...(readOptionalNumber(args.inpaintStrength) !== undefined
      ? { inpaintStrength: readOptionalNumber(args.inpaintStrength) }
      : {}),
    ...(ipAdapterRefs ? { ipAdapterRefs } : {}),
    ...(readOptionalString(args.editInstruction)
      ? { editInstruction: readOptionalString(args.editInstruction) }
      : {}),
  };
}

function readImageControlInputs(args: Record<string, unknown>): Partial<ImageGenerationRequest> {
  rejectLegacyMediaInputFields(args, ['controlImageUri', 'controlImageBase64']);
  const controlImageLocator = readOptionalContentLocator(
    args.controlImageLocator,
    'controlImageLocator',
  );
  return {
    ...(controlImageLocator ? { controlImageLocator } : {}),
    ...(readOptionalControlMode(args.controlMode)
      ? { controlMode: readOptionalControlMode(args.controlMode) }
      : {}),
    ...(readOptionalNumber(args.controlStrength) !== undefined
      ? { controlStrength: readOptionalNumber(args.controlStrength) }
      : {}),
  };
}

function readVideoReferenceInputs(args: Record<string, unknown>): Partial<VideoGenerationRequest> {
  rejectLegacyMediaInputFields(args, [
    'startFrameRef',
    'endFrameRef',
    'referenceVideoRef',
    'referenceImageUrl',
    'referenceImageUri',
    'referenceImageBase64',
    'referenceVideoUrl',
    'startFrameImageBase64',
    'endFrameImageBase64',
  ]);
  const operation = readOptionalVideoOperation(args.operation);
  const startFrameLocator = readOptionalContentLocator(args.startFrameLocator, 'startFrameLocator');
  const endFrameLocator = readOptionalContentLocator(args.endFrameLocator, 'endFrameLocator');
  const referenceVideoLocator = readOptionalContentLocator(
    args.referenceVideoLocator,
    'referenceVideoLocator',
  );
  const referenceImages = readIpAdapterRefs(args.referenceImages);
  return {
    ...(operation ? { operation } : {}),
    ...(startFrameLocator ? { startFrameLocator } : {}),
    ...(endFrameLocator ? { endFrameLocator } : {}),
    ...(referenceVideoLocator ? { referenceVideoLocator } : {}),
    ...(referenceImages ? { referenceImages } : {}),
    ...(readOptionalNumber(args.motionStrength) !== undefined
      ? { motionStrength: readOptionalNumber(args.motionStrength) }
      : {}),
    ...(readOptionalString(args.cameraMovement)
      ? { cameraMovement: readOptionalString(args.cameraMovement) }
      : {}),
    ...(readOptionalString(args.cameraAngle)
      ? { cameraAngle: readOptionalString(args.cameraAngle) }
      : {}),
    ...(readOptionalString(args.shotScale)
      ? { shotScale: readOptionalString(args.shotScale) }
      : {}),
    ...(readOptionalString(args.aspectRatio)
      ? { aspectRatio: readOptionalString(args.aspectRatio) }
      : {}),
    ...(readOptionalString(args.editInstruction)
      ? { editInstruction: readOptionalString(args.editInstruction) }
      : {}),
  };
}

function readOptionalVideoOperation(value: unknown) {
  if (value === undefined) return undefined;
  if (!isVideoOperationId(value)) {
    throw new Error(`GenerateVideo received unsupported canonical operation: ${String(value)}`);
  }
  return value;
}

function readOptionalControlMode(
  value: unknown,
): ImageGenerationRequest['controlMode'] | undefined {
  if (value === undefined) return undefined;
  if (
    value !== 'canny' &&
    value !== 'depth' &&
    value !== 'pose' &&
    value !== 'normal' &&
    value !== 'segment' &&
    value !== 'lineart' &&
    value !== 'softedge' &&
    value !== 'scribble'
  ) {
    throw new Error(`GenerateImage received unsupported controlMode: ${String(value)}`);
  }
  return value;
}

function readOptionalContentLocator(value: unknown, fieldName: string): ContentLocator | undefined {
  if (value === undefined) return undefined;
  if (!isContentLocator(value)) {
    throw new Error(`${fieldName} must be a structurally valid ContentLocator.`);
  }
  return value;
}

function readTransformImageReferenceArgs(args: Record<string, unknown>): Record<string, unknown> {
  const operationPlan = Array.isArray(args.operationPlan)
    ? args.operationPlan.filter((entry): entry is string => typeof entry === 'string')
    : undefined;

  return {
    ...(operationPlan && operationPlan.length > 0 ? { operationPlan } : {}),
    ...(readOptionalString(args.planId) ? { planId: readOptionalString(args.planId) } : {}),
    ...(readOptionalString(args.sceneId) ? { sceneId: readOptionalString(args.sceneId) } : {}),
    ...(readOptionalString(args.shotId) ? { shotId: readOptionalString(args.shotId) } : {}),
    ...(readOptionalString(args.imageStrategy)
      ? { imageStrategy: readOptionalString(args.imageStrategy) }
      : {}),
    ...(readOptionalString(args.targetAspectRatio)
      ? { targetAspectRatio: readOptionalString(args.targetAspectRatio) }
      : {}),
    ...(readOptionalString(args.targetStyle)
      ? { targetStyle: readOptionalString(args.targetStyle) }
      : {}),
  };
}

function readIpAdapterRefs(value: unknown): ImageGenerationRequest['ipAdapterRefs'] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new Error('Media image references must be an array of locator-backed inputs.');
  }
  if (!value.every(isIpAdapterRef)) {
    throw new Error(
      'Media image references require a valid imageLocator and supported optional controls.',
    );
  }
  return value.length > 0 ? value : undefined;
}

function isIpAdapterRef(
  value: unknown,
): value is NonNullable<ImageGenerationRequest['ipAdapterRefs']>[number] {
  if (!isRecord(value) || !isContentLocator(value['imageLocator'])) return false;
  return (
    (value['mimeType'] === undefined || typeof value['mimeType'] === 'string') &&
    (value['strength'] === undefined ||
      (typeof value['strength'] === 'number' && Number.isFinite(value['strength']))) &&
    (value['mode'] === undefined ||
      value['mode'] === 'style' ||
      value['mode'] === 'subject' ||
      value['mode'] === 'both')
  );
}

function hasResolvedTransformSource(args: Record<string, unknown>): boolean {
  return (
    readOptionalContentLocator(
      args.referenceImageLocator ?? args.sourceImageLocator,
      'sourceImageLocator',
    ) !== undefined
  );
}

function rejectLegacyMediaInputFields(
  args: Record<string, unknown>,
  fields: readonly string[],
): void {
  const legacyField = fields.find((field) => Object.hasOwn(args, field));
  if (legacyField) {
    throw new Error(
      `${legacyField} is a runtime-only or legacy media field; pass a ContentLocator instead.`,
    );
  }
}

function readRuntimeMediaModel(
  options: ToolExecuteOptions | undefined,
  purpose: string,
): { providerId: string; modelId: string } | undefined {
  if (options?.metadata?.modelPurpose !== purpose) return undefined;
  const providerId = readOptionalString(options.metadata.modelProviderId);
  const modelId = readOptionalString(options.metadata.modelId);
  if (!providerId || !modelId) return undefined;

  return { providerId, modelId };
}

function readMarkdownGenerationIntent(
  args: Record<string, unknown>,
  capability: ProviderGenerationCapability,
  originalPrompt: string,
): GenerationIntent | null {
  const markdown =
    typeof args.taskMarkdown === 'string'
      ? args.taskMarkdown
      : typeof args.planMarkdown === 'string'
        ? args.planMarkdown
        : undefined;
  const ref =
    typeof args.taskRef === 'string'
      ? args.taskRef
      : typeof args.planRef === 'string'
        ? args.planRef
        : undefined;
  if (!markdown && !ref) return null;

  const sourceKind =
    typeof args.planMarkdown === 'string' || typeof args.planRef === 'string'
      ? 'plan-markdown'
      : 'task-markdown';
  const goal = readMarkdownSection(markdown ?? '', 'Goal');
  const style = readMarkdownListSection(markdown ?? '', 'Style');
  const mustInclude = readMarkdownListSection(markdown ?? '', 'Must Include');
  const avoid = readMarkdownListSection(markdown ?? '', 'Avoid');
  const output = readMarkdownOutput(markdown ?? '');
  const styleFamily = inferStyleFamily(
    [...style, goal, originalPrompt].filter((value): value is string => Boolean(value)),
  );

  return {
    source: {
      kind: sourceKind,
      ...(ref ? { uri: ref } : {}),
      ...(markdown ? { contentHash: hashText(markdown) } : {}),
    },
    ...(originalPrompt.trim() ? { originalPrompt } : {}),
    capability,
    ...(goal ? { subject: goal } : {}),
    ...(styleFamily ? { styleFamily } : {}),
    ...(style.length > 0 ? { style } : {}),
    ...(mustInclude.length > 0 ? { mustInclude } : {}),
    ...(avoid.length > 0 ? { avoid } : {}),
    ...(output ? { output } : {}),
  };
}

function composeGenerationIntentPrompt(intent: GenerationIntent): string {
  return [
    intent.originalPrompt,
    intent.subject,
    intent.composition,
    ...(intent.style ?? []),
    ...(intent.mood ?? []),
    ...(intent.quality ?? []),
    ...(intent.mustInclude ?? []),
    intent.avoid && intent.avoid.length > 0 ? `avoid ${intent.avoid.join(', ')}` : undefined,
  ]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(', ');
}

function readMarkdownSection(markdown: string, title: string): string | undefined {
  const match = new RegExp(
    `(?:^|\\n)##\\s+${escapeRegExp(title)}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`,
    'i',
  ).exec(markdown);
  return (
    match?.[1]
      ?.trim()
      .replace(/^[-*]\s+/gm, '')
      .trim() || undefined
  );
}

function readMarkdownListSection(markdown: string, title: string): readonly string[] {
  const section = readMarkdownSection(markdown, title);
  if (!section) return [];
  return section
    .split('\n')
    .map((line) => line.trim().replace(/^[-*]\s+/, ''))
    .filter(Boolean);
}

function readMarkdownOutput(markdown: string): GenerationIntent['output'] | undefined {
  const section = readMarkdownSection(markdown, 'Output');
  if (!section) return undefined;
  const duration = /duration\s*:\s*(\d+)/i.exec(section)?.[1];
  const resolution = /resolution\s*:\s*([^\n]+)/i.exec(section)?.[1]?.trim();
  const output = {
    ...(duration ? { duration: Number(duration) } : {}),
    ...(resolution ? { resolution } : {}),
  };
  return Object.keys(output).length > 0 ? output : undefined;
}

function inferStyleFamily(values: readonly string[]): GenerationIntent['styleFamily'] | undefined {
  const joined = values.join(' ').toLowerCase();
  if (/anime|manga|cel[-\s]?shaded/.test(joined)) return 'anime';
  if (/photo|realistic|cinematic|film/.test(joined)) return 'photorealistic';
  if (/pixel|8-bit|sprite/.test(joined)) return 'pixel-art';
  if (/concept/.test(joined)) return 'concept-art';
  if (/watercolor|oil|painting|acrylic/.test(joined)) return 'painting';
  if (/3d|cgi|blender|render/.test(joined)) return '3d-render';
  if (/illustration|flat art|editorial/.test(joined)) return 'illustration';
  return undefined;
}

function hashText(text: string): string {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const MEDIA_TOOL_LOCALIZATION = {
  GenerateImage: {
    zh: {
      description:
        '使用当前 Provider/model 生成图像，并等待当前 Tool Call 返回终态结果。结果仅是 generated 草稿，不修改项目、不导入资产库，也不证明质量或交付完成；参考输入、限制和当前模型支持必须在 dispatch 前通过校验。观察实际图像和适用的 Quality 证据后再决定接受、修复或阻塞。',
      parameters: {
        prompt: '图像生成或编辑提示词。',
        negativePrompt: '可选反向提示词，描述要避免的内容。',
        taskRef: '可选 Task markdown URI/path，作为生成意图来源。',
        planRef: '可选 Plan markdown URI/path，作为生成意图来源。',
        taskMarkdown: '可选内联 Task markdown 内容，用于提取生成意图。',
        planMarkdown: '可选内联 Plan markdown 内容，用于提取生成意图。',
        providerAdaptationMode:
          'Provider 表达适配模式。auto/agentic 使用 Agent prompt 上下文；native 直接发送提示词。',
        size: '图像尺寸，默认 1024x1024。',
        quality: '图像质量，默认 standard。',
        style: '图像风格，默认 vivid。',
        aspectRatio: '可选目标画幅比例，例如 16:9、9:16 或 1:1。',
        referenceImageLocator: '可选参考图 ContentLocator，用于 image-to-image 生成。',
        maskLocator: '可选 inpaint mask ContentLocator。',
        inpaintStrength: '可选 inpaint 强度，范围 0.0 到 1.0。',
        ipAdapterRefs: '可选 IP-Adapter 参考图 locator，用于主体或风格一致性。',
        imageLocator: '参考图 ContentLocator。',
        mimeType: '参考图 MIME type。',
        strength: '参考影响强度，范围 0.0 到 1.0。',
        mode: '参考图引导 style、subject 或 both。',
        controlImageLocator: '可选 ControlNet 图像 ContentLocator。',
        controlMode: '可选 ControlNet conditioning mode。',
        controlStrength: '可选 ControlNet conditioning 强度，范围 0.0 到 1.0。',
        editInstruction: '可选自然语言编辑指令，供支持编辑的图像 provider 使用。',
        n: '要生成的图像数量，1 到 4，默认 1。',
      },
    },
  },
  TransformImage: {
    zh: {
      description:
        '使用当前 Provider/model 执行生成式、source-bound 图像编辑，并等待当前 Tool Call 返回终态结果。它不是确定性裁切、缩放、旋转或像素合成；源图、mask、参考角色、未修改区域保留语义和当前模型支持必须在 dispatch 前通过校验。结果仅是带 lineage 的 generated 草稿，不等于项目写回或质量完成；必须观察实际图像后再接受或修复。',
      parameters: {
        prompt: '可选提示词；未提供时使用 editInstruction。',
        editInstruction: '针对源图像的自然语言编辑指令。',
        negativePrompt: '可选反向提示词，描述要避免的内容。',
        sourceImageLocator: '必填源图像 ContentLocator。',
        maskLocator: '可选 inpaint mask ContentLocator。',
        inpaintStrength: '可选 inpaint 强度，范围 0.0 到 1.0。',
        ipAdapterRefs: '可选 IP-Adapter 参考图 locator，用于主体或风格一致性。',
        imageLocator: '参考图 ContentLocator。',
        mimeType: '参考图 MIME type。',
        strength: '参考影响强度，范围 0.0 到 1.0。',
        mode: '参考图引导 style、subject 或 both。',
        controlImageLocator: '可选 ControlNet 图像 ContentLocator。',
        controlMode: '可选 ControlNet conditioning mode。',
        controlStrength: '可选 ControlNet conditioning 强度，范围 0.0 到 1.0。',
        targetAspectRatio: '可选目标画幅比例，例如 16:9、9:16 或 1:1。',
        targetStyle: '可选目标风格，用于风格规范化。',
        operationPlan: '可审阅的 transform 操作，例如 crop-panel、remove-text、inpaint、outpaint。',
        planId: '可选 shot image prep plan id，用于 lineage metadata。',
        sceneId: '可选 scene id，用于 lineage metadata。',
        shotId: '可选 shot id，用于 lineage metadata。',
        size: '图像尺寸，默认 1024x1024。',
        quality: '图像质量，默认 standard。',
        style: '图像风格，默认 vivid。',
        n: '要生成的图像数量，1 到 4，默认 1。',
      },
    },
  },
  GenerateVideo: {
    zh: {
      description:
        '使用当前 Provider/model 生成单个视频片段，并等待当前 Tool Call 返回终态结果。只有当生成式视频适合当前镜头且所需首帧、尾帧、参考视频、运动、时长和尺寸控制均通过当前支持校验时使用；结果仅是 generated clip 草稿，不是时间线、成片或交付证明。观察实际视频和适用的 Quality 证据后再决定接受、修复或阻塞。',
      parameters: {
        prompt: '视频生成或编辑提示词。',
        taskRef: '可选 Task markdown URI/path，作为生成意图来源。',
        planRef: '可选 Plan markdown URI/path，作为生成意图来源。',
        taskMarkdown: '可选内联 Task markdown 内容，用于提取生成意图。',
        planMarkdown: '可选内联 Plan markdown 内容，用于提取生成意图。',
        providerAdaptationMode:
          'Provider 表达适配模式。auto/agentic 使用 Agent prompt 上下文；native 直接发送提示词。',
        operation: '可选规范化单片段视频操作。',
        duration: '视频时长，单位秒，范围 1 到 30，默认 4。',
        resolution: '视频分辨率，默认 720p。',
        fps: '帧率，默认 24。',
        aspectRatio: '可选目标画幅比例，例如 16:9、9:16 或 1:1。',
        startFrameLocator: '可选首帧 ContentLocator，由宿主在 provider 边界物化。',
        endFrameLocator: '可选尾帧 ContentLocator，由宿主在 provider 边界物化。',
        referenceVideoLocator: '可选源/参考视频 ContentLocator，由宿主在 provider 边界物化。',
        referenceImages: '可选主体一致性参考图 locator。',
        imageLocator: '参考图 ContentLocator。',
        motionStrength: '可选运动强度，范围 0.0 到 1.0。',
        cameraMovement: '可选镜头运动指令，例如 static、pan 或 zoom-in。',
        cameraAngle: '可选机位角度指令，例如 eye-level 或 low-angle。',
        shotScale: '可选景别指令，例如 CU、MS、LS 或 VLS。',
        editInstruction: '可选自然语言指令，用于视频编辑或运动设计。',
      },
    },
  },
  GenerateMusic: {
    zh: {
      description:
        '生成音乐并等待当前 Tool Call 返回终态音频结果。执行会继承当前 Agent Run 的取消信号。',
      parameters: {
        prompt: '音乐生成提示词。',
        duration: '音乐时长，单位秒，范围 5 到 300，默认 30。',
        genre: '音乐类型，例如 corporate、ambient、electronic。',
        mood: '音乐情绪，例如 upbeat、calm、dramatic。',
      },
    },
  },
  GenerateTTS: {
    zh: {
      description:
        '执行文本转语音并等待当前 Tool Call 返回终态音频结果。执行会继承当前 Agent Run 的取消信号。',
      parameters: {
        text: '要朗读的文本。',
        voice: '声音 ID 或名称，例如 alloy、echo、onyx、nova。',
        language: '语言代码，例如 en、zh、ja。',
        speed: '语速倍率，范围 0.5 到 2，默认 1。',
        sourceCueId: '可选结构化分镜对白 cue ID，用于 lineage。',
        speakerEntityId: '可选说话人的 creative entity ID。',
        voiceAssetId: '可选声音表示或 voice asset ID，用于该 cue。',
      },
    },
  },
} as const;

/**
 * Register media generation tools into the tool registry.
 * Tool names must match the canonical image/video capability catalog exactly.
 */
export function registerMediaAgentTools(
  toolRegistry: IToolRegistry,
  jobs: GenerationJobPort,
): void {
  // GenerateImage
  toolRegistry.register(
    createTool({
      name: 'GenerateImage',
      description:
        'Generate an image with the current Provider/model and wait for the linked Tool Call to return a terminal result. The output is only a generated draft: it does not mutate a project, import an asset, satisfy Quality, or complete a deliverable. Validate references, limits, and current model support before dispatch, then inspect the actual image and applicable Quality evidence before accepting, repairing, or blocking it.',
      localization: MEDIA_TOOL_LOCALIZATION.GenerateImage,
      category: 'generation',
      safetyKind: 'non-destructive-mutation',
      requirements: { generationJob: true },
      traits: {
        cost: 'moderate',
        reversible: true,
        locality: 'network',
        impactLevel: 'low',
      },
      isConcurrencySafe: true,
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Text description of the image to generate',
          },
          negativePrompt: {
            type: 'string',
            description: 'Optional negative prompt describing what to avoid',
          },
          taskRef: {
            type: 'string',
            description: 'Optional task markdown URI/path used as the generation intent source',
          },
          planRef: {
            type: 'string',
            description: 'Optional plan markdown URI/path used as the generation intent source',
          },
          taskMarkdown: {
            type: 'string',
            description: 'Optional inline task markdown content for extracting generation intent',
          },
          planMarkdown: {
            type: 'string',
            description: 'Optional inline plan markdown content for extracting generation intent',
          },
          providerAdaptationMode: {
            type: 'string',
            enum: ['auto', 'agentic', 'native'],
            description:
              'Provider expression adaptation mode. auto/agentic rely on the agent prompt context; native sends the prompt directly.',
          },

          size: {
            type: 'string',
            enum: ['256x256', '512x512', '1024x1024', '1792x1024', '1024x1792'],
            description: 'Image dimensions (default: 1024x1024)',
          },
          quality: {
            type: 'string',
            enum: ['standard', 'hd'],
            description: 'Image quality (default: standard)',
          },
          style: {
            type: 'string',
            enum: ['natural', 'vivid'],
            description: 'Image style (default: vivid)',
          },
          aspectRatio: {
            type: 'string',
            description: 'Optional target aspect ratio such as 16:9, 9:16, or 1:1',
          },
          referenceImageLocator: {
            type: 'object',
            description: 'Optional validated ContentLocator for the image-to-image reference input',
          },
          maskLocator: {
            type: 'object',
            description: 'Optional validated ContentLocator for the inpaint mask',
          },
          inpaintStrength: {
            type: 'number',
            description: 'Optional inpaint strength from 0.0 to 1.0',
          },
          ipAdapterRefs: {
            type: 'array',
            description: 'Optional locator-backed IP-Adapter image references',
            items: {
              type: 'object',
              properties: {
                imageLocator: {
                  type: 'object',
                  description: 'Validated ContentLocator for the reference image',
                },
                mimeType: {
                  type: 'string',
                  description: 'Reference image MIME type',
                },
                strength: {
                  type: 'number',
                  description: 'Influence strength from 0.0 to 1.0',
                },
                mode: {
                  type: 'string',
                  enum: ['style', 'subject', 'both'],
                  description: 'Whether the reference should guide style, subject, or both',
                },
              },
            },
          },
          controlImageLocator: {
            type: 'object',
            description: 'Optional validated ContentLocator for the ControlNet image',
          },
          controlMode: {
            type: 'string',
            enum: [
              'canny',
              'depth',
              'pose',
              'normal',
              'segment',
              'lineart',
              'softedge',
              'scribble',
            ],
            description: 'Optional ControlNet conditioning mode',
          },
          controlStrength: {
            type: 'number',
            description: 'Optional ControlNet conditioning strength from 0.0 to 1.0',
          },
          editInstruction: {
            type: 'string',
            description:
              'Optional natural language edit instruction for edit-capable image providers',
          },
          n: {
            type: 'number',
            description: 'Number of images to generate (1-4, default: 1)',
          },
        },
        required: [],
      },
      execute: async (args, options) => {
        const target = resolveToolMediaTarget(args, options, 'image.generate');
        const targetError = requireToolMediaTarget(target, 'GenerateImage');
        if (targetError) {
          return { success: false, error: targetError };
        }
        const resolvedTarget = toResolvedToolMediaTarget(target);

        try {
          const execution = requireAgentMediaExecutionIdentity(options);
          const resolved = await resolveGenerationPrompt(
            args,
            'image.generate',
            resolvedTarget.providerId,
          );
          const requestTarget = toGenerationTargetMetadata(resolvedTarget);
          const request = buildImageGenerationRequest({
            args: { size: '1024x1024', ...args },
            execution,
            target: requestTarget,
            resolved,
            executionMetadata: options?.metadata,
          });
          const result = await executeLinkedGenerationJob(
            jobs,
            {
              generationType: resolveImageGenerationType(request),
              providerId: resolvedTarget.providerId,
              modelId: resolvedTarget.modelId,
              request,
            },
            'image',
            options,
          );
          return {
            success: true,
            data: {
              ...buildAgentMediaExecutionData(execution),
              type: 'image',
              status: 'completed',
              jobKind: result.jobKind,
              jobId: result.jobId,
              jobLifecycleOwner: result.jobLifecycleOwner,
              message: resolved.prompt,
              outputs: result.outputs,
              routedTo: {
                provider: result.providerId,
                model: result.modelId,
                ...(resolved.providerId ? { requestedProvider: resolved.providerId } : {}),
              },
              ...(resolved.metadata
                ? {
                    providerAdaptation: withGenerationTargetMetadata(resolved.metadata, {
                      ...(resolved.providerId ? { requestedProviderId: resolved.providerId } : {}),
                      ...(target.modelId ? { requestedModelId: target.modelId } : {}),
                      actualProviderId: result.providerId,
                      actualModelId: result.modelId,
                    })?.providerAdaptation,
                  }
                : {}),
            },
            attachments: createMediaToolAttachments(result.outputs),
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Image generation failed',
          };
        }
      },
    }),
  );

  // TransformImage
  toolRegistry.register(
    createTool({
      name: 'TransformImage',
      description:
        'Run a generative, source-bound image edit with the current Provider/model and wait for the linked Tool Call to return a terminal result. This is not deterministic crop, resize, rotate, or pixel compositing. Source, mask, reference roles, unmodified-region preservation, and current model support must validate before dispatch. The result is a lineage-bound generated draft, not project writeback or Quality completion; observe the actual image before accepting or repairing it.',
      localization: MEDIA_TOOL_LOCALIZATION.TransformImage,
      category: 'generation',
      safetyKind: 'non-destructive-mutation',
      requirements: { generationJob: true, contentAccess: true },
      traits: {
        cost: 'moderate',
        reversible: true,
        locality: 'network',
        impactLevel: 'low',
      },
      isConcurrencySafe: true,
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Optional prompt; editInstruction is used when prompt is omitted',
          },
          editInstruction: {
            type: 'string',
            description: 'Natural language edit instruction for the source-bound transform',
          },
          negativePrompt: {
            type: 'string',
            description: 'Optional negative prompt describing what to avoid',
          },
          sourceImageLocator: {
            type: 'object',
            description: 'Validated ContentLocator for the source image',
          },
          maskLocator: {
            type: 'object',
            description: 'Optional validated ContentLocator for the inpaint mask',
          },
          inpaintStrength: {
            type: 'number',
            description: 'Optional inpaint strength from 0.0 to 1.0',
          },
          ipAdapterRefs: {
            type: 'array',
            description: 'Optional locator-backed IP-Adapter image references',
            items: {
              type: 'object',
              properties: {
                imageLocator: {
                  type: 'object',
                  description: 'Validated ContentLocator for the reference image',
                },
                mimeType: {
                  type: 'string',
                  description: 'Reference image MIME type',
                },
                strength: {
                  type: 'number',
                  description: 'Influence strength from 0.0 to 1.0',
                },
                mode: {
                  type: 'string',
                  enum: ['style', 'subject', 'both'],
                  description: 'Whether the reference should guide style, subject, or both',
                },
              },
            },
          },
          controlImageLocator: {
            type: 'object',
            description: 'Optional validated ContentLocator for the ControlNet image',
          },
          controlMode: {
            type: 'string',
            enum: [
              'canny',
              'depth',
              'pose',
              'normal',
              'segment',
              'lineart',
              'softedge',
              'scribble',
            ],
            description: 'Optional ControlNet conditioning mode',
          },
          controlStrength: {
            type: 'number',
            description: 'Optional ControlNet conditioning strength from 0.0 to 1.0',
          },
          targetAspectRatio: {
            type: 'string',
            description: 'Optional target aspect ratio such as 16:9, 9:16, or 1:1',
          },
          targetStyle: {
            type: 'string',
            description: 'Optional target style for style normalization',
          },
          operationPlan: {
            type: 'array',
            description:
              'Reviewable transform operations such as crop-panel, remove-text, inpaint, outpaint',
            items: { type: 'string' },
          },
          planId: {
            type: 'string',
            description: 'Optional shot image prep plan id for lineage metadata',
          },
          sceneId: {
            type: 'string',
            description: 'Optional scene id for lineage metadata',
          },
          shotId: {
            type: 'string',
            description: 'Optional shot id for lineage metadata',
          },
          size: {
            type: 'string',
            enum: ['256x256', '512x512', '1024x1024', '1792x1024', '1024x1792'],
            description: 'Image dimensions (default: 1024x1024)',
          },
          quality: {
            type: 'string',
            enum: ['standard', 'hd'],
            description: 'Image quality (default: standard)',
          },
          style: {
            type: 'string',
            enum: ['natural', 'vivid'],
            description: 'Image style (default: vivid)',
          },
          n: {
            type: 'number',
            description: 'Number of images to generate (1-4, default: 1)',
          },
        },
        required: [],
      },
      execute: async (args, options) => {
        const target = resolveToolMediaTarget(args, options, 'image.edit');
        const targetError = requireToolMediaTarget(target, 'TransformImage');
        if (targetError) {
          return { success: false, error: targetError };
        }
        const resolvedTarget = toResolvedToolMediaTarget(target);
        const editInstruction = readOptionalString(args.editInstruction);
        const prompt = readOptionalString(args.prompt) ?? editInstruction ?? '';
        if (!prompt.trim()) {
          return {
            success: false,
            error: 'TransformImage requires prompt or editInstruction.',
          };
        }
        try {
          rejectLegacyMediaInputFields(args, [
            'sourceImageRef',
            'sourceImageUri',
            'referenceImageRef',
            'referenceImageUri',
            'referenceImageUrl',
            'referenceImageBase64',
            'maskRefs',
            'maskUri',
            'maskBase64',
            'referenceBundle',
          ]);
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Invalid image transform input',
          };
        }
        if (!hasResolvedTransformSource(args)) {
          return {
            success: false,
            error: 'TransformImage requires a structurally valid sourceImageLocator.',
          };
        }

        try {
          const execution = requireAgentMediaExecutionIdentity(options);
          const resolved = await resolveGenerationPrompt(
            { ...args, prompt },
            'image.generate',
            resolvedTarget.providerId,
          );
          const requestTarget = toGenerationTargetMetadata(resolvedTarget);
          const transformMetadata = readTransformImageReferenceArgs(args);
          const request = buildImageGenerationRequest({
            args: {
              size: '1024x1024',
              ...args,
              referenceImageLocator: readOptionalContentLocator(
                args.sourceImageLocator,
                'sourceImageLocator',
              ),
              aspectRatio:
                readOptionalString(args.targetAspectRatio) ?? readOptionalString(args.aspectRatio),
              style: readOptionalString(args.style) ?? readOptionalString(args.targetStyle),
              editInstruction,
            },
            execution,
            target: requestTarget,
            resolved,
            transformMetadata,
            executionMetadata: options?.metadata,
          });
          const result = await executeLinkedGenerationJob(
            jobs,
            {
              generationType: resolveImageGenerationType(request),
              providerId: resolvedTarget.providerId,
              modelId: resolvedTarget.modelId,
              request,
            },
            'image',
            options,
          );
          return {
            success: true,
            data: {
              ...buildAgentMediaExecutionData(execution),
              type: 'image-transform',
              status: 'completed',
              jobKind: result.jobKind,
              jobId: result.jobId,
              jobLifecycleOwner: result.jobLifecycleOwner,
              message: resolved.prompt,
              outputs: result.outputs,
              routedTo: {
                provider: result.providerId,
                model: result.modelId,
                ...(resolved.providerId ? { requestedProvider: resolved.providerId } : {}),
              },
              transformImage: transformMetadata,
              ...(resolved.metadata
                ? {
                    providerAdaptation: withGenerationTargetMetadata(resolved.metadata, {
                      ...requestTarget,
                      actualProviderId: result.providerId,
                      actualModelId: result.modelId,
                    })?.providerAdaptation,
                  }
                : {}),
            },
            attachments: createMediaToolAttachments(result.outputs),
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Image transform failed',
          };
        }
      },
    }),
  );

  // GenerateVideo
  toolRegistry.register(
    createTool({
      name: 'GenerateVideo',
      description:
        'Generate one video clip with the current Provider/model and wait for the linked Tool Call to return a terminal result. Use it only when generative video fits the shot and every required first-frame, last-frame, reference-video, motion, duration, and size control validates against current support. The result is only a generated clip draft, not a timeline, final cut, or deliverable; inspect the actual video plus applicable Quality evidence.',
      localization: MEDIA_TOOL_LOCALIZATION.GenerateVideo,
      category: 'generation',
      safetyKind: 'non-destructive-mutation',
      requirements: { generationJob: true, contentAccess: true },
      traits: {
        cost: 'expensive',
        reversible: true,
        locality: 'network',
        impactLevel: 'low',
      },
      isConcurrencySafe: true,
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Text description of the video to generate',
          },
          taskRef: {
            type: 'string',
            description: 'Optional task markdown URI/path used as the generation intent source',
          },
          planRef: {
            type: 'string',
            description: 'Optional plan markdown URI/path used as the generation intent source',
          },
          taskMarkdown: {
            type: 'string',
            description: 'Optional inline task markdown content for extracting generation intent',
          },
          planMarkdown: {
            type: 'string',
            description: 'Optional inline plan markdown content for extracting generation intent',
          },
          providerAdaptationMode: {
            type: 'string',
            enum: ['auto', 'agentic', 'native'],
            description:
              'Provider expression adaptation mode. auto/agentic rely on the agent prompt context; native sends the prompt directly.',
          },

          operation: {
            type: 'string',
            enum: [
              'generate-from-prompt',
              'generate-from-image',
              'generate-from-keyframes',
              'transform',
              'restyle',
              'extend',
              'enhance',
              'trim',
              'retime',
              'prepare-for-timeline',
            ],
            description: 'Optional canonical single-clip video operation.',
          },
          duration: {
            type: 'number',
            description: 'Video duration in seconds (1-30, default: 4)',
          },
          resolution: {
            type: 'string',
            enum: ['480p', '720p', '1080p'],
            description: 'Video resolution (default: 720p)',
          },
          fps: {
            type: 'number',
            enum: [24, 30, 60],
            description: 'Frames per second (default: 24)',
          },
          aspectRatio: {
            type: 'string',
            description: 'Optional target aspect ratio such as 16:9, 9:16, or 1:1',
          },
          startFrameLocator: {
            type: 'object',
            description: 'Optional validated ContentLocator for the first frame',
          },
          endFrameLocator: {
            type: 'object',
            description: 'Optional validated ContentLocator for the last frame',
          },
          referenceVideoLocator: {
            type: 'object',
            description: 'Optional validated ContentLocator for a source/reference video',
          },
          referenceImages: {
            type: 'array',
            description: 'Optional locator-backed reference images for subject consistency',
            items: {
              type: 'object',
              properties: {
                imageLocator: {
                  type: 'object',
                  description: 'Validated ContentLocator for the reference image',
                },
                mimeType: {
                  type: 'string',
                  description: 'Reference image MIME type',
                },
                strength: {
                  type: 'number',
                  description: 'Influence strength from 0.0 to 1.0',
                },
                mode: {
                  type: 'string',
                  enum: ['style', 'subject', 'both'],
                  description: 'Whether the reference should guide style, subject, or both',
                },
              },
            },
          },
          motionStrength: {
            type: 'number',
            description: 'Optional motion strength from 0.0 to 1.0',
          },
          cameraMovement: {
            type: 'string',
            description: 'Optional camera movement directive such as static, pan, or zoom-in',
          },
          cameraAngle: {
            type: 'string',
            description: 'Optional camera angle directive such as eye-level or low-angle',
          },
          shotScale: {
            type: 'string',
            description: 'Optional shot scale directive such as CU, MS, LS, or VLS',
          },
          editInstruction: {
            type: 'string',
            description: 'Optional natural language instruction for video editing or motion',
          },
        },
        required: [],
      },
      execute: async (args, options) => {
        const target = resolveToolMediaTarget(args, options, 'video.generate');
        const targetError = requireToolMediaTarget(target, 'GenerateVideo');
        if (targetError) {
          return { success: false, error: targetError };
        }
        const resolvedTarget = toResolvedToolMediaTarget(target);

        try {
          const execution = requireAgentMediaExecutionIdentity(options);
          const resolved = await resolveGenerationPrompt(
            args,
            'video.generate',
            resolvedTarget.providerId,
          );
          const metadata = mergeAgentMediaExecutionMetadata(
            resolved.metadata
              ? withGenerationTargetMetadata(resolved.metadata, {
                  ...toGenerationTargetMetadata(resolvedTarget),
                })
              : undefined,
            execution,
          );
          const request = {
            prompt: resolved.prompt,
            providerId: resolvedTarget.providerId,
            modelId: resolvedTarget.modelId,
            duration: args.duration as number | undefined,
            resolution: args.resolution as string | undefined,
            fps: args.fps as number | undefined,
            ...readVideoReferenceInputs(args),
            ...(metadata ? { metadata } : {}),
          };
          const result = await executeLinkedGenerationJob(
            jobs,
            {
              generationType: resolveVideoGenerationType(request),
              providerId: resolvedTarget.providerId,
              modelId: resolvedTarget.modelId,
              request,
            },
            'video',
            options,
          );
          return {
            success: true,
            data: {
              ...buildAgentMediaExecutionData(execution),
              type: 'video',
              status: 'completed',
              jobKind: result.jobKind,
              jobId: result.jobId,
              jobLifecycleOwner: result.jobLifecycleOwner,
              message: resolved.prompt,
              outputs: result.outputs,
              routedTo: {
                provider: result.providerId,
                model: result.modelId,
                ...(resolved.providerId ? { requestedProvider: resolved.providerId } : {}),
              },
              ...(resolved.metadata
                ? {
                    providerAdaptation: withGenerationTargetMetadata(resolved.metadata, {
                      ...toGenerationTargetMetadata(resolvedTarget),
                      actualProviderId: result.providerId,
                      actualModelId: result.modelId,
                    })?.providerAdaptation,
                  }
                : {}),
            },
            attachments: createMediaToolAttachments(result.outputs),
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Video generation failed',
          };
        }
      },
    }),
  );

  // GenerateMusic
  toolRegistry.register(
    createTool({
      name: 'GenerateMusic',
      description:
        'Generate music and wait for the linked Tool Call to return terminal audio output. Execution inherits cancellation from the current Agent Run.',
      localization: MEDIA_TOOL_LOCALIZATION.GenerateMusic,
      category: 'generation',
      safetyKind: 'non-destructive-mutation',
      requirements: { generationJob: true },
      traits: {
        cost: 'moderate',
        reversible: true,
        locality: 'network',
        impactLevel: 'low',
      },
      isConcurrencySafe: true,
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Description of the music to generate',
          },
          duration: {
            type: 'number',
            description: 'Music duration in seconds (5-300, default: 30)',
          },
          genre: {
            type: 'string',
            description: 'Music genre (e.g., corporate, ambient, electronic)',
          },
          mood: {
            type: 'string',
            description: 'Music mood (e.g., upbeat, calm, dramatic)',
          },
        },
        required: ['prompt'],
      },
      execute: async (args, options) => {
        const prompt = args.prompt as string;
        const moodStr = args.mood ? ` (mood: ${args.mood})` : '';
        const genreStr = args.genre ? ` (genre: ${args.genre})` : '';
        const target = resolveToolMediaTarget(args, options, 'audio.music.generate');
        const targetError = requireToolMediaTarget(target, 'GenerateMusic');
        if (targetError) {
          return { success: false, error: targetError };
        }
        const resolvedTarget = toResolvedToolMediaTarget(target);

        try {
          const execution = requireAgentMediaExecutionIdentity(options);
          const metadata = mergeAgentMediaExecutionMetadata(undefined, execution);
          const request = {
            prompt: `${prompt}${genreStr}${moodStr}`,
            providerId: resolvedTarget.providerId,
            modelId: resolvedTarget.modelId,
            duration: args.duration as number | undefined,
            isMusic: true,
            genre: args.genre as string | undefined,
            ...(metadata ? { metadata } : {}),
          };
          const result = await executeLinkedGenerationJob(
            jobs,
            {
              generationType: 'text-to-music',
              providerId: resolvedTarget.providerId,
              modelId: resolvedTarget.modelId,
              request,
            },
            'audio',
            options,
          );
          return {
            success: true,
            data: {
              ...buildAgentMediaExecutionData(execution),
              type: 'audio',
              status: 'completed',
              jobKind: result.jobKind,
              jobId: result.jobId,
              jobLifecycleOwner: result.jobLifecycleOwner,
              message: prompt,
              outputs: result.outputs,
              routedTo: { provider: result.providerId, model: result.modelId },
            },
            attachments: createMediaToolAttachments(result.outputs),
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Music generation failed',
          };
        }
      },
    }),
  );

  // GenerateTTS
  toolRegistry.register(
    createTool({
      name: 'GenerateTTS',
      description:
        'Generate speech and wait for the linked Tool Call to return terminal audio output. Execution inherits cancellation from the current Agent Run.',
      localization: MEDIA_TOOL_LOCALIZATION.GenerateTTS,
      category: 'generation',
      safetyKind: 'non-destructive-mutation',
      requirements: { generationJob: true },
      traits: {
        cost: 'cheap',
        reversible: true,
        locality: 'network',
        impactLevel: 'low',
      },
      isConcurrencySafe: true,
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'Text to convert to speech',
          },
          voice: {
            type: 'string',
            description: 'Voice ID or name (e.g., alloy, echo, onyx, nova)',
          },
          language: {
            type: 'string',
            description: 'Language code (e.g., en, zh, ja)',
          },
          speed: {
            type: 'number',
            description: 'Speech speed multiplier (0.5-2, default: 1)',
          },
          sourceCueId: {
            type: 'string',
            description: 'Optional structured storyboard voice cue ID for lineage',
          },
          speakerEntityId: {
            type: 'string',
            description: 'Optional creative entity ID for the speaker',
          },
          voiceAssetId: {
            type: 'string',
            description: 'Optional voice representation or voice asset ID used for this cue',
          },
        },
        required: ['text'],
      },
      execute: async (args, options) => {
        const text = args.text as string;
        const target = resolveToolMediaTarget(args, options, 'audio.tts');
        const targetError = requireToolMediaTarget(target, 'GenerateTTS');
        if (targetError) {
          return { success: false, error: targetError };
        }
        const resolvedTarget = toResolvedToolMediaTarget(target);

        try {
          const execution = requireAgentMediaExecutionIdentity(options);
          const metadata = mergeAgentMediaExecutionMetadata(
            {
              voice: args.voice,
              language: args.language,
              speed: args.speed,
              ...(typeof args.sourceCueId === 'string' ? { sourceCueId: args.sourceCueId } : {}),
              ...(typeof args.speakerEntityId === 'string'
                ? { speakerEntityId: args.speakerEntityId }
                : {}),
              ...(typeof args.voiceAssetId === 'string' ? { voiceAssetId: args.voiceAssetId } : {}),
              ...(typeof args.speakerEntityId === 'string'
                ? { characterIds: [args.speakerEntityId] }
                : {}),
            },
            execution,
          );
          const request = {
            prompt: text,
            providerId: resolvedTarget.providerId,
            modelId: resolvedTarget.modelId,
            isMusic: false,
            ...(metadata ? { metadata } : {}),
          };
          const result = await executeLinkedGenerationJob(
            jobs,
            {
              generationType: 'text-to-audio',
              providerId: resolvedTarget.providerId,
              modelId: resolvedTarget.modelId,
              request,
            },
            'audio',
            options,
          );
          return {
            success: true,
            data: {
              ...buildAgentMediaExecutionData(execution),
              type: 'audio',
              status: 'completed',
              jobKind: result.jobKind,
              jobId: result.jobId,
              jobLifecycleOwner: result.jobLifecycleOwner,
              message: text,
              outputs: result.outputs,
              routedTo: { provider: result.providerId, model: result.modelId },
            },
            attachments: createMediaToolAttachments(result.outputs),
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'TTS generation failed',
          };
        }
      },
    }),
  );

  registerDetachedGenerationJobTool(toolRegistry, jobs);
  registerGenerationJobManagementTools(toolRegistry, jobs);
}

function registerDetachedGenerationJobTool(
  toolRegistry: IToolRegistry,
  jobs: GenerationJobPort,
): void {
  toolRegistry.register(
    createTool({
      name: 'SubmitGenerationJob',
      description:
        'Submit one explicit detached Generation Job and return its authoritative identity immediately. Use later Generation Job Tools with the returned jobId.',
      category: 'generation',
      safetyKind: 'non-destructive-mutation',
      requirements: { generationJob: true },
      traits: {
        cost: 'expensive',
        reversible: false,
        locality: 'network',
        impactLevel: 'low',
      },
      isConcurrencySafe: true,
      parameters: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['image', 'video', 'audio'],
            description: 'Generation media kind.',
          },
          prompt: {
            type: 'string',
            description: 'Generation prompt.',
          },
        },
        required: ['kind', 'prompt'],
      },
      execute: async (args, options) =>
        executeGenerationJobCommand(async () => {
          const kind = requireDetachedGenerationKind(args['kind']);
          const prompt = requireNonEmptyString(args['prompt'], 'prompt');
          const purpose =
            kind === 'image'
              ? 'image.generate'
              : kind === 'video'
                ? 'video.generate'
                : 'audio.generate';
          const target = resolveToolMediaTarget(args, options, purpose);
          const targetError = requireToolMediaTarget(target, 'SubmitGenerationJob');
          if (targetError) throw new Error(targetError);
          const resolved = toResolvedToolMediaTarget(target);
          const execution = requireAgentMediaExecutionIdentity(options);
          const request = {
            prompt,
            providerId: resolved.providerId,
            modelId: resolved.modelId,
            metadata: mergeAgentMediaExecutionMetadata(
              { detached: true, source: 'agent-generation-job-tool' },
              execution,
            ),
          };
          const snapshot = await jobs.submitGeneration({
            lifecycleMode: 'detached',
            generationType:
              kind === 'image'
                ? 'text-to-image'
                : kind === 'video'
                  ? 'text-to-video'
                  : 'text-to-audio',
            providerId: resolved.providerId,
            modelId: resolved.modelId,
            request,
          });
          return summarizeGenerationJob(snapshot);
        }),
    }),
  );
}

function registerGenerationJobManagementTools(
  toolRegistry: IToolRegistry,
  jobs: GenerationJobPort,
): void {
  toolRegistry.register(
    createTool({
      name: 'DescribeGenerationJob',
      description: 'Read the current authoritative snapshot for one exact Generation Job identity.',
      category: 'generation',
      isReadOnly: true,
      isConcurrencySafe: true,
      requirements: { generationJob: true },
      parameters: generationJobIdentityParameters(),
      execute: async (args) =>
        executeGenerationJobCommand(async () =>
          summarizeGenerationJob(await jobs.describeGeneration(requireGenerationJobRef(args))),
        ),
    }),
  );
  toolRegistry.register(
    createTool({
      name: 'ObserveGenerationJob',
      description: 'Read the current state and then observe one exact Generation Job identity.',
      category: 'generation',
      isReadOnly: true,
      isConcurrencySafe: true,
      requirements: { generationJob: true },
      parameters: generationJobIdentityParameters(),
      execute: async (args, options) =>
        executeGenerationJobCommand(async () => {
          const ref = requireGenerationJobRef(args);
          const iterator = jobs.observeGeneration(ref)[Symbol.asyncIterator]();
          try {
            const next = await nextGenerationJobUpdate(iterator, options?.signal);
            if (next.done) {
              throw new Error(
                `Generation Job ${ref.jobId} observation ended before a snapshot was available.`,
              );
            }
            options?.onProgress?.({
              percent: next.value.progress.percent,
              stage: next.value.progress.stage,
            });
            return summarizeGenerationJob(next.value);
          } finally {
            await iterator.return?.();
          }
        }),
    }),
  );
  for (const command of [
    {
      name: 'CancelGenerationJob',
      description: 'Cancel one exact non-terminal Generation Job.',
      execute: (input: GenerationJobCommandInput) => jobs.cancelGeneration(input),
    },
    {
      name: 'RetryGenerationJob',
      description:
        'Create a new Generation Job retry from one exact failed, cancelled, or outcome-unknown Job.',
      execute: (input: GenerationJobCommandInput) => jobs.retryGeneration(input),
    },
    {
      name: 'ReconcileGenerationJob',
      description:
        'Query the owning provider through the Generation coordinator for one exact recoverable Job.',
      execute: (input: GenerationJobCommandInput) => jobs.reconcileGeneration(input),
    },
  ] as const) {
    toolRegistry.register(
      createTool({
        name: command.name,
        description: command.description,
        category: 'generation',
        isConcurrencySafe: true,
        requirements: { generationJob: true },
        safetyKind: 'non-destructive-mutation',
        traits: {
          cost: command.name === 'RetryGenerationJob' ? 'moderate' : 'cheap',
          reversible: command.name !== 'RetryGenerationJob',
          locality: 'network',
          impactLevel: 'low',
        },
        parameters: generationJobIdentityParameters(),
        execute: async (args) =>
          executeGenerationJobCommand(async () =>
            summarizeGenerationJob(
              await command.execute({
                ref: requireGenerationJobRef(args),
              }),
            ),
          ),
      }),
    );
  }
}

function requireDetachedGenerationKind(value: unknown): 'image' | 'video' | 'audio' {
  if (value === 'image' || value === 'video' || value === 'audio') return value;
  throw new Error('SubmitGenerationJob kind must be image, video, or audio.');
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`SubmitGenerationJob ${field} must be a non-empty string.`);
  }
  return value.trim();
}

function generationJobIdentityParameters() {
  return {
    type: 'object' as const,
    properties: {
      jobId: {
        type: 'string' as const,
        description: 'Exact Generation Job ID',
      },
    },
    required: ['jobId'],
  };
}

function requireGenerationJobRef(args: Record<string, unknown>) {
  const jobId = args.jobId;
  if (typeof jobId !== 'string' || jobId.trim().length === 0) {
    throw new Error('Generation Job command requires a non-empty jobId.');
  }
  return { kind: 'generation' as const, jobId: jobId.trim() };
}

async function executeGenerationJobCommand(
  execute: () => Promise<ReturnType<typeof summarizeGenerationJob>>,
) {
  try {
    return { success: true, data: await execute() };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Generation Job command failed.',
    };
  }
}

function summarizeGenerationJob(snapshot: GenerationJobSnapshot) {
  return {
    jobKind: snapshot.ref.kind,
    jobId: snapshot.ref.jobId,
    jobLifecycleOwner: 'generation-job-coordinator' as const,
    phase: snapshot.phase,
    progress: snapshot.progress,
    providerId: snapshot.request.providerId,
    modelId: snapshot.request.modelId,
    ...(snapshot.resultLocators ? { resultLocators: snapshot.resultLocators } : {}),
    ...(snapshot.failure ? { failure: snapshot.failure } : {}),
  };
}
