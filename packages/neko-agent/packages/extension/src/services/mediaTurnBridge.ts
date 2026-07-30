import { randomUUID } from 'node:crypto';
import type * as vscode from 'vscode';

import type {
  AgentTurnTimelineToolCallItem,
  MediaModelCategory,
  ModelRef,
} from '@neko-agent/types';
import type { ConversationProjectionStore } from '@neko/agent/runtime';
import type { AgentContentAccessRuntime } from '@neko/agent/runtime';
import type { CheckpointPiExternalTurnInput } from '@neko/agent/pi';
import type {
  GenerationJobPort,
  GenerationJobSnapshot,
  SubmitGenerationJobInput,
} from '@neko/generation';
import {
  createGeneratedAssetsWorkspaceDeliveryBatch,
  type CanvasWorkspaceProjectionResult,
  type ContentLocator,
  type ContentSourceRef,
  type GeneratedOutputContentLocator,
  type GeneratedAsset,
  type ThreeReferenceMediaControls,
} from '@neko/shared';

import type { AgentFileReference } from '@neko-agent/types';
import { getLogger } from '../base';
import type { WorkspaceBoardProjectionHost } from './workspaceBoardProjectionHost';

const logger = getLogger('MediaTurnBridge');

export interface MediaTurnBridgeDeps {
  readonly generationJobs?: GenerationJobPort;
  readonly contentAccessRuntime?: Pick<AgentContentAccessRuntime, 'resolveContentLocator'>;
  readonly resolveGenerationResult?: (
    locator: GeneratedOutputContentLocator,
  ) => ResolvedGenerationResource | Promise<ResolvedGenerationResource>;
  readonly getConversationProjection?: (conversationId: string) => ConversationProjectionStore;
  readonly workspaceBoardProjection: Pick<WorkspaceBoardProjectionHost, 'deliverBatch'>;
  readonly checkpointExternalTurn?: (input: CheckpointPiExternalTurnInput) => Promise<unknown>;
  readonly now?: () => number;
}

export interface ResolvedGenerationResource {
  readonly path: string;
  readonly asset: GeneratedAsset;
}

export interface ExecuteMediaTurnForWebviewInput {
  readonly webview: vscode.Webview;
  readonly conversationId: string;
  readonly prompt: string;
  readonly mediaModel: ModelRef<MediaModelCategory>;
  readonly userMessage: {
    readonly id: string;
    readonly content: string;
    readonly timestamp: number;
  };
  readonly threeReferenceControls?: ThreeReferenceMediaControls;
  readonly selectedFileReferences?: readonly AgentFileReference[];
}

export class MediaTurnBridge {
  constructor(private readonly deps: MediaTurnBridgeDeps) {}

  async execute(input: ExecuteMediaTurnForWebviewInput): Promise<void> {
    const jobs = this.deps.generationJobs;
    const resolveGenerationResult = this.deps.resolveGenerationResult;
    const projection = this.deps.getConversationProjection?.(input.conversationId);
    const checkpointExternalTurn = this.deps.checkpointExternalTurn;
    if (!jobs || !resolveGenerationResult || !projection || !checkpointExternalTurn) {
      throw new Error(
        'Direct media generation requires Generation Job, result resolver, Timeline projection, and Pi transcript owners.',
      );
    }

    const operationId = randomUUID();
    const initial = await jobs.submitGeneration(
      await createGenerationJobRequest(
        input,
        {
          operationId,
          source: 'direct-media-webview',
          conversationId: input.conversationId,
        },
        this.deps.contentAccessRuntime?.resolveContentLocator.bind(this.deps.contentAccessRuntime),
      ),
    );
    if (!isTerminalGeneration(initial)) {
      projectMediaJobProgress(projection, input, initial);
    }
    const terminal = await waitForTerminalGeneration(jobs, initial, (snapshot) => {
      projectMediaJobProgress(projection, input, snapshot);
    });
    if (terminal.phase !== 'succeeded') {
      const timestamp = this.deps.now?.() ?? Date.now();
      const result = createFailedMediaToolResult(input.mediaModel.category, terminal);
      await checkpointExternalTurn(
        createExternalTurnCheckpoint(input, terminal, result, timestamp),
      );
      projectFailedMediaResult(projection, input, terminal);
      throw new Error(
        terminal.failure?.message ??
          `Generation Job ${terminal.ref.jobId} ended in phase ${terminal.phase}.`,
      );
    }
    const resultLocators = terminal.resultLocators ?? [];
    if (resultLocators.length === 0) {
      throw new Error(
        `Generation Job ${terminal.ref.jobId} completed without stable ContentLocator results.`,
      );
    }
    const resolved = await Promise.all(
      resultLocators.map((contentLocator) => resolveGenerationResult(contentLocator)),
    );
    const boardDelivery = await this.deliverWorkspaceBatch(
      resolved.map(({ asset }) => asset),
      terminal.ref,
    );
    const timestamp = this.deps.now?.() ?? Date.now();
    const result = createSuccessfulMediaToolResult(
      input.mediaModel.category,
      terminal,
      resultLocators,
      boardDelivery,
    );
    await checkpointExternalTurn(createExternalTurnCheckpoint(input, terminal, result, timestamp));
    projectTerminalMediaResult(projection, {
      conversationId: input.conversationId,
      snapshot: terminal,
      category: input.mediaModel.category,
      prompt: input.prompt,
      mediaModel: input.mediaModel,
      resultLocators,
      boardDelivery,
      timestamp,
    });
  }

  private async deliverWorkspaceBatch(
    assets: readonly GeneratedAsset[],
    jobRef: GenerationJobSnapshot['ref'],
  ): Promise<GenerationBoardDeliveryProjection> {
    if (assets.length === 0) {
      throw new Error('Workspace Board delivery requires at least one generated asset.');
    }
    const results = await this.deps.workspaceBoardProjection.deliverBatch(
      createGeneratedAssetsWorkspaceDeliveryBatch(assets, 'vscode', jobRef),
    );
    if (results.length !== 1) {
      throw new Error(
        `Workspace Board delivery returned ${results.length} results for one resolved target.`,
      );
    }
    for (const result of results) {
      if (result.status === 'blocked') {
        logger.warn('Generated output persisted but Workspace Board projection was blocked', {
          diagnosticCodes: result.diagnostics.map((diagnostic) => diagnostic.code),
        });
      }
    }
    return projectBoardDelivery(results[0]!);
  }
}

interface GenerationBoardDeliveryProjection {
  readonly status: CanvasWorkspaceProjectionResult['status'];
  readonly nodeIds: readonly string[];
  readonly diagnostics: readonly {
    readonly code: string;
    readonly message: string;
  }[];
}

async function createGenerationJobRequest(
  input: ExecuteMediaTurnForWebviewInput,
  metadata: Record<string, unknown>,
  resolveContentLocator:
    ((source: ContentSourceRef) => Promise<ContentLocator | undefined>) | undefined,
): Promise<SubmitGenerationJobInput> {
  const binding = {
    providerId: input.mediaModel.providerId,
    modelId: input.mediaModel.modelId,
  };
  const request = {
    prompt: input.prompt,
    ...binding,
    metadata,
  };
  const threeReferenceControls = input.threeReferenceControls
    ? await resolveThreeReferenceControls(
        input.threeReferenceControls,
        input.mediaModel.category,
        resolveContentLocator,
      )
    : undefined;
  switch (input.mediaModel.category) {
    case 'image':
      return {
        ...binding,
        lifecycleMode: 'linked',
        generationType: 'text-to-image',
        request: {
          ...request,
          ...(threeReferenceControls?.controlImageLocator
            ? {
                controlImageLocator: threeReferenceControls.controlImageLocator,
                controlMode: input.threeReferenceControls?.controlImage?.mode,
              }
            : {}),
          ...(threeReferenceControls?.appearanceLocators.length
            ? {
                ipAdapterRefs: threeReferenceControls.appearanceLocators.map((imageLocator) => ({
                  imageLocator,
                  mode: 'subject' as const,
                })),
              }
            : {}),
          ...(input.threeReferenceControls?.camera
            ? { cameraReference: input.threeReferenceControls.camera }
            : {}),
          ...(threeReferenceControls?.panoramaLocator && input.threeReferenceControls?.panorama
            ? {
                panoramaReference: {
                  imageLocator: threeReferenceControls.panoramaLocator,
                  orientation: input.threeReferenceControls.panorama.orientation,
                  identity: input.threeReferenceControls.panorama.identity,
                },
              }
            : {}),
        },
      };
    case 'video':
      assertNoThreeReferenceControls(input);
      return { ...binding, lifecycleMode: 'linked', generationType: 'text-to-video', request };
    case 'audio':
      assertNoThreeReferenceControls(input);
      return { ...binding, lifecycleMode: 'linked', generationType: 'text-to-audio', request };
  }
}

async function resolveThreeReferenceControls(
  controls: ThreeReferenceMediaControls,
  category: MediaModelCategory,
  resolveContentLocator:
    ((source: ContentSourceRef) => Promise<ContentLocator | undefined>) | undefined,
): Promise<{
  readonly controlImageLocator?: ContentLocator;
  readonly appearanceLocators: readonly ContentLocator[];
  readonly panoramaLocator?: ContentLocator;
}> {
  if (category !== 'image') {
    throw new Error(`3D reference media controls are not supported for ${category} generation.`);
  }
  if (!resolveContentLocator) {
    throw new Error('3D reference media controls require Host content locator resolution.');
  }
  const controlImageLocator = controls.controlImage
    ? await requireResolvedLocator(
        resolveContentLocator,
        controls.controlImage.imageRef,
        'control image',
      )
    : undefined;
  const appearanceLocators = await Promise.all(
    controls.appearanceReferences.map((reference) =>
      requireResolvedLocator(resolveContentLocator, reference.imageRef, 'appearance image'),
    ),
  );
  const panoramaLocator = controls.panorama
    ? await requireResolvedLocator(
        resolveContentLocator,
        controls.panorama.imageRef,
        'panorama image',
      )
    : undefined;
  return {
    ...(controlImageLocator ? { controlImageLocator } : {}),
    appearanceLocators,
    ...(panoramaLocator ? { panoramaLocator } : {}),
  };
}

async function requireResolvedLocator(
  resolve: (source: ContentSourceRef) => Promise<ContentLocator | undefined>,
  source: ContentSourceRef,
  role: string,
): Promise<ContentLocator> {
  const locator = await resolve(source);
  if (!locator) {
    throw new Error(`3D reference ${role} does not resolve to a stable ContentLocator.`);
  }
  return locator;
}

async function waitForTerminalGeneration(
  jobs: GenerationJobPort,
  initial: GenerationJobSnapshot,
  onProgress: (snapshot: GenerationJobSnapshot) => void,
): Promise<GenerationJobSnapshot> {
  if (isTerminalGeneration(initial)) return initial;
  for await (const snapshot of jobs.observeGeneration(initial.ref, initial.revision)) {
    if (isTerminalGeneration(snapshot)) return snapshot;
    onProgress(snapshot);
  }
  throw new Error(
    `Generation Job ${initial.ref.jobId} observation ended before a terminal snapshot.`,
  );
}

function isTerminalGeneration(snapshot: GenerationJobSnapshot): boolean {
  return (
    snapshot.phase === 'succeeded' ||
    snapshot.phase === 'failed' ||
    snapshot.phase === 'cancelled' ||
    snapshot.phase === 'outcome-unknown'
  );
}

function assertNoThreeReferenceControls(input: ExecuteMediaTurnForWebviewInput): void {
  if (input.threeReferenceControls) {
    throw new Error(
      `3D reference media controls are not supported for ${input.mediaModel.category} generation.`,
    );
  }
}

function projectMediaJobProgress(
  projection: ConversationProjectionStore,
  input: Pick<ExecuteMediaTurnForWebviewInput, 'prompt' | 'mediaModel'>,
  snapshot: GenerationJobSnapshot,
): void {
  const item = createMediaTimelineItem({
    conversationId: projection.conversationId,
    snapshot,
    category: input.mediaModel.category,
    prompt: input.prompt,
    mediaModel: input.mediaModel,
  });
  projection.apply({
    type: 'agentTurnTimelineUpdate',
    conversationId: projection.conversationId,
    turnId: item.turnId,
    runId: item.runId,
    messageId: item.messageId,
    operations: [{ operation: 'snapshot', item }],
  });
}

function projectFailedMediaResult(
  projection: ConversationProjectionStore,
  input: Pick<ExecuteMediaTurnForWebviewInput, 'prompt' | 'mediaModel'>,
  snapshot: GenerationJobSnapshot,
): void {
  const item = createMediaTimelineItem({
    conversationId: projection.conversationId,
    snapshot,
    category: input.mediaModel.category,
    prompt: input.prompt,
    mediaModel: input.mediaModel,
    result: createFailedMediaToolResult(input.mediaModel.category, snapshot),
  });
  projection.apply({
    type: 'agentTurnTimelineUpdate',
    conversationId: projection.conversationId,
    turnId: item.turnId,
    runId: item.runId,
    messageId: item.messageId,
    operations: [{ operation: 'snapshot', item }],
    completion: { status: 'failed', completedAt: snapshot.updatedAt },
  });
}

function createSuccessfulMediaToolResult(
  category: MediaModelCategory,
  snapshot: GenerationJobSnapshot,
  resultLocators: readonly GeneratedOutputContentLocator[],
  boardDelivery: GenerationBoardDeliveryProjection,
): NonNullable<AgentTurnTimelineToolCallItem['payload']['toolCall']['result']> {
  return {
    success: true,
    data: {
      generationJob: projectGenerationJobState(snapshot),
      outputs: resultLocators.map((contentLocator) => ({
        type: category,
        contentLocator,
      })),
      boardDelivery,
    },
  };
}

function createFailedMediaToolResult(
  category: MediaModelCategory,
  snapshot: GenerationJobSnapshot,
): NonNullable<AgentTurnTimelineToolCallItem['payload']['toolCall']['result']> {
  return {
    success: false,
    data: { generationJob: projectGenerationJobState(snapshot) },
    error: snapshot.failure?.message ?? `${mediaLabel(category)} ended in phase ${snapshot.phase}.`,
  };
}

function projectTerminalMediaResult(
  projection: ConversationProjectionStore,
  input: {
    readonly conversationId: string;
    readonly snapshot: GenerationJobSnapshot;
    readonly category: MediaModelCategory;
    readonly prompt: string;
    readonly mediaModel: ModelRef<MediaModelCategory>;
    readonly resultLocators: readonly GeneratedOutputContentLocator[];
    readonly boardDelivery: GenerationBoardDeliveryProjection;
    readonly timestamp: number;
  },
): void {
  if (input.resultLocators.length === 0) {
    throw new Error(
      `Media generation ${input.snapshot.ref.jobId} produced no renderable resources.`,
    );
  }
  const item = createMediaTimelineItem({
    conversationId: input.conversationId,
    snapshot: input.snapshot,
    category: input.category,
    prompt: input.prompt,
    mediaModel: input.mediaModel,
    updatedAt: input.timestamp,
    result: createSuccessfulMediaToolResult(
      input.category,
      input.snapshot,
      input.resultLocators,
      input.boardDelivery,
    ),
  });
  projection.apply({
    type: 'agentTurnTimelineUpdate',
    conversationId: input.conversationId,
    turnId: item.turnId,
    runId: item.runId,
    messageId: item.messageId,
    operations: [{ operation: 'snapshot', item }],
    completion: { status: 'completed', completedAt: input.timestamp },
  });
}

function createExternalTurnCheckpoint(
  input: ExecuteMediaTurnForWebviewInput,
  snapshot: GenerationJobSnapshot,
  result: NonNullable<AgentTurnTimelineToolCallItem['payload']['toolCall']['result']>,
  timestamp: number,
): CheckpointPiExternalTurnInput {
  const toolName = mediaToolName(input.mediaModel.category);
  const toolCallArguments = {
    prompt: input.prompt,
    providerId: input.mediaModel.providerId,
    modelId: input.mediaModel.modelId,
  };
  const resultText = result.success
    ? `${mediaGenerationLabel(input.mediaModel.category)} completed.`
    : (result.error ?? `${mediaGenerationLabel(input.mediaModel.category)} failed.`);
  return {
    conversationId: input.conversationId,
    turnId: `direct-media:${snapshot.ref.jobId}`,
    terminalState:
      snapshot.phase === 'cancelled' ? 'cancelled' : result.success ? 'completed' : 'failed',
    messages: [
      {
        role: 'user',
        content: input.userMessage.content,
        timestamp: input.userMessage.timestamp,
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'toolCall',
            id: snapshot.ref.jobId,
            name: toolName,
            arguments: toolCallArguments,
          },
        ],
        api: 'openai-completions',
        provider: input.mediaModel.providerId,
        model: input.mediaModel.modelId,
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            total: 0,
          },
        },
        stopReason: 'toolUse',
        timestamp: snapshot.createdAt,
      },
      {
        role: 'toolResult',
        toolCallId: snapshot.ref.jobId,
        toolName,
        content: [{ type: 'text', text: resultText }],
        details: result.data,
        isError: !result.success,
        timestamp,
      },
    ],
  };
}

function createMediaTimelineItem(input: {
  readonly conversationId: string;
  readonly snapshot: GenerationJobSnapshot;
  readonly category: MediaModelCategory;
  readonly prompt: string;
  readonly mediaModel: ModelRef<MediaModelCategory>;
  readonly updatedAt?: number;
  readonly result?: NonNullable<AgentTurnTimelineToolCallItem['payload']['toolCall']['result']>;
}): AgentTurnTimelineToolCallItem {
  const turnId = `direct-media:${input.snapshot.ref.jobId}`;
  const runId = `${turnId}:run`;
  const messageId = `${turnId}:message`;
  return {
    kind: 'tool_call',
    conversationId: input.conversationId,
    turnId,
    runId,
    messageId,
    itemId: `${messageId}:generation-job`,
    sequence: 1,
    itemRevision: input.snapshot.revision,
    status: input.result ? (input.result.success ? 'succeeded' : 'failed') : 'pending',
    createdAt: input.snapshot.createdAt,
    updatedAt: input.updatedAt ?? input.snapshot.updatedAt,
    payload: {
      displayName: mediaGenerationLabel(input.category),
      toolCall: {
        id: input.snapshot.ref.jobId,
        name: mediaToolName(input.category),
        arguments: {
          prompt: input.prompt,
          providerId: input.mediaModel.providerId,
          modelId: input.mediaModel.modelId,
        },
        ...(input.result ? { result: input.result } : {}),
      },
      progress: {
        summary: `${input.snapshot.progress.stage} ${input.snapshot.progress.percent}%`,
        data: projectGenerationJobState(input.snapshot),
      },
    },
  };
}

function projectGenerationJobState(snapshot: GenerationJobSnapshot) {
  return {
    kind: 'generation-job' as const,
    jobId: snapshot.ref.jobId,
    revision: snapshot.revision,
    phase: snapshot.phase,
    stage: snapshot.progress.stage,
    percent: snapshot.progress.percent,
    providerId: snapshot.request.providerId,
    modelId: snapshot.request.modelId,
  };
}

function projectBoardDelivery(
  result: CanvasWorkspaceProjectionResult,
): GenerationBoardDeliveryProjection {
  return {
    status: result.status,
    nodeIds: [...(result.nodeIds ?? [])],
    diagnostics: result.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      message: diagnostic.message,
    })),
  };
}

function mediaToolName(category: MediaModelCategory): string {
  return category === 'image'
    ? 'GenerateImage'
    : category === 'video'
      ? 'GenerateVideo'
      : 'GenerateAudio';
}

function mediaGenerationLabel(category: MediaModelCategory): string {
  return category === 'image'
    ? 'Image generation'
    : category === 'video'
      ? 'Video generation'
      : 'Audio generation';
}

function mediaLabel(category: MediaModelCategory): string {
  return category === 'image'
    ? 'Generated image'
    : category === 'video'
      ? 'Generated video'
      : 'Generated audio';
}
