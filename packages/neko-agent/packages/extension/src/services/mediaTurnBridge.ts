import { randomUUID } from 'node:crypto';
import type * as vscode from 'vscode';

import type {
  AgentTurnTimelineAssistantTextItem,
  MediaModelCategory,
  ModelRef,
} from '@neko-agent/types';
import type { ConversationProjectionStore } from '@neko/agent/runtime';
import type {
  GenerationJobPort,
  GenerationJobSnapshot,
  SubmitGenerationJobInput,
} from '@neko/generation';
import {
  createGeneratedAssetsWorkspaceDeliveryBatch,
  type GeneratedAsset,
  type ResourceRef,
  type ThreeReferenceMediaControls,
} from '@neko/shared';

import type { AgentFileReference } from '@neko-agent/types';
import { getLogger } from '../base';
import { MediaGenerationDeliveryHost } from './mediaGenerationDeliveryHost';
import type { WorkspaceBoardProjectionHost } from './workspaceBoardProjectionHost';

const logger = getLogger('MediaTurnBridge');

export interface MediaTurnBridgeDeps {
  readonly generationJobs?: GenerationJobPort;
  readonly resolveGenerationResult?: (
    ref: ResourceRef,
  ) => ResolvedGenerationResource | Promise<ResolvedGenerationResource>;
  readonly mediaDeliveryHost: Pick<MediaGenerationDeliveryHost, 'toWebviewMediaUri'>;
  readonly getConversationProjection?: (conversationId: string) => ConversationProjectionStore;
  readonly workspaceBoardProjection?: Pick<WorkspaceBoardProjectionHost, 'deliverBatch'>;
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
  readonly threeReferenceControls?: ThreeReferenceMediaControls;
  readonly selectedFileReferences?: readonly AgentFileReference[];
}

export class MediaTurnBridge {
  constructor(private readonly deps: MediaTurnBridgeDeps) {}

  async execute(input: ExecuteMediaTurnForWebviewInput): Promise<void> {
    const jobs = this.deps.generationJobs;
    const resolveGenerationResult = this.deps.resolveGenerationResult;
    const projection = this.deps.getConversationProjection?.(input.conversationId);
    if (!jobs || !resolveGenerationResult || !projection) {
      throw new Error(
        'Direct media generation requires Generation Job, result resolver, and Timeline projection owners.',
      );
    }

    const operationId = randomUUID();
    const initial = await jobs.submitGeneration(
      createGenerationJobRequest(input, {
        operationId,
        source: 'direct-media-webview',
        conversationId: input.conversationId,
      }),
    );
    if (!isTerminalGeneration(initial)) {
      projectMediaJobProgress(projection, input.mediaModel.category, initial);
    }
    const terminal = await waitForTerminalGeneration(jobs, initial, (snapshot) => {
      projectMediaJobProgress(projection, input.mediaModel.category, snapshot);
    });
    if (terminal.phase !== 'succeeded') {
      projectFailedMediaResult(projection, input.mediaModel.category, terminal);
      throw new Error(
        terminal.failure?.message ??
          `Generation Job ${terminal.ref.jobId} ended in phase ${terminal.phase}.`,
      );
    }
    const resultRefs = terminal.resultRefs ?? [];
    if (resultRefs.length === 0) {
      throw new Error(
        `Generation Job ${terminal.ref.jobId} completed without stable ResourceRef results.`,
      );
    }
    const resolved = await Promise.all(
      resultRefs.map((resourceRef) => resolveGenerationResult(resourceRef)),
    );
    const resultUrls = resolved.map(({ path }) => {
      const uri = this.deps.mediaDeliveryHost.toWebviewMediaUri(input.webview, path);
      if (!uri) {
        throw new Error(
          `Generation Job ${terminal.ref.jobId} result cannot be projected into the Webview.`,
        );
      }
      return uri;
    });
    await this.deliverWorkspaceBatch(resolved.map(({ asset }) => asset));
    projectTerminalMediaResult(projection, {
      conversationId: input.conversationId,
      operationId: terminal.ref.jobId,
      category: input.mediaModel.category,
      resultUrls,
      itemRevision: terminal.revision,
      createdAt: terminal.createdAt,
      timestamp: this.deps.now?.() ?? Date.now(),
    });
  }

  private async deliverWorkspaceBatch(assets: readonly GeneratedAsset[]): Promise<void> {
    if (!this.deps.workspaceBoardProjection || assets.length === 0) return;
    const results = await this.deps.workspaceBoardProjection.deliverBatch(
      createGeneratedAssetsWorkspaceDeliveryBatch(assets, 'vscode'),
    );
    for (const result of results) {
      if (result.status === 'blocked') {
        logger.warn('Generated output persisted but Workspace Board projection was blocked', {
          diagnosticCodes: result.diagnostics.map((diagnostic) => diagnostic.code),
        });
      }
    }
  }
}

function createGenerationJobRequest(
  input: ExecuteMediaTurnForWebviewInput,
  metadata: Record<string, unknown>,
): SubmitGenerationJobInput {
  const binding = {
    providerId: input.mediaModel.providerId,
    modelId: input.mediaModel.modelId,
  };
  const request = {
    prompt: input.prompt,
    ...binding,
    metadata,
  };
  switch (input.mediaModel.category) {
    case 'image':
      return {
        ...binding,
        lifecycleMode: 'linked',
        generationType: 'text-to-image',
        request: {
          ...request,
          ...(input.threeReferenceControls?.controlImage
            ? {
                controlImageRef: input.threeReferenceControls.controlImage.imageRef,
                controlMode: input.threeReferenceControls.controlImage.mode,
              }
            : {}),
          ...(input.threeReferenceControls?.appearanceReferences.length
            ? {
                ipAdapterRefs: input.threeReferenceControls.appearanceReferences.map(
                  (reference) => ({
                    imageRef: reference.imageRef,
                    mode: 'subject' as const,
                  }),
                ),
              }
            : {}),
          ...(input.threeReferenceControls?.camera
            ? { cameraReference: input.threeReferenceControls.camera }
            : {}),
          ...(input.threeReferenceControls?.panorama
            ? { panoramaReference: input.threeReferenceControls.panorama }
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
  category: MediaModelCategory,
  snapshot: GenerationJobSnapshot,
): void {
  const label = mediaLabel(category);
  const item = createMediaTimelineItem({
    conversationId: projection.conversationId,
    operationId: snapshot.ref.jobId,
    itemRevision: snapshot.revision,
    status: 'streaming',
    content: `${label} ${snapshot.progress.percent}%`,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
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
  category: MediaModelCategory,
  snapshot: GenerationJobSnapshot,
): void {
  const item = createMediaTimelineItem({
    conversationId: projection.conversationId,
    operationId: snapshot.ref.jobId,
    itemRevision: snapshot.revision,
    status: 'complete',
    content:
      snapshot.failure?.message ?? `${mediaLabel(category)} ended in phase ${snapshot.phase}.`,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
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

function projectTerminalMediaResult(
  projection: ConversationProjectionStore,
  input: {
    readonly conversationId: string;
    readonly operationId: string;
    readonly category: MediaModelCategory;
    readonly resultUrls: readonly string[];
    readonly itemRevision: number;
    readonly createdAt: number;
    readonly timestamp: number;
  },
): void {
  if (input.resultUrls.length === 0) {
    throw new Error(`Media generation ${input.operationId} produced no renderable resources.`);
  }
  const label = mediaLabel(input.category);
  const item = createMediaTimelineItem({
    conversationId: input.conversationId,
    operationId: input.operationId,
    itemRevision: input.itemRevision,
    status: 'complete',
    content: input.resultUrls.map((url) => `[${label}](${url})`).join('\n\n'),
    createdAt: input.createdAt,
    updatedAt: input.timestamp,
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

function createMediaTimelineItem(input: {
  readonly conversationId: string;
  readonly operationId: string;
  readonly itemRevision: number;
  readonly status: AgentTurnTimelineAssistantTextItem['status'];
  readonly content: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}): AgentTurnTimelineAssistantTextItem {
  const turnId = `direct-media:${input.operationId}`;
  const runId = `${turnId}:run`;
  const messageId = `${turnId}:message`;
  return {
    kind: 'assistant_text',
    conversationId: input.conversationId,
    turnId,
    runId,
    messageId,
    itemId: `${messageId}:assistant-text`,
    sequence: 1,
    itemRevision: input.itemRevision,
    status: input.status,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    payload: {
      content: input.content,
      format: 'markdown',
      sourceGeneration: input.itemRevision,
    },
  };
}

function mediaLabel(category: MediaModelCategory): string {
  return category === 'image'
    ? 'Generated image'
    : category === 'video'
      ? 'Generated video'
      : 'Generated audio';
}
