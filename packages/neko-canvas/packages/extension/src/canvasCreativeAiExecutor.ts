import * as vscode from 'vscode';
import {
  CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
  createCreativeAiDiagnostic,
  isCanvasCreativeAiActionId,
  isCanvasCreativeAiActionRequest,
  isContentLocator,
  type CanvasCreativeAiActionId,
  type CanvasCreativeAiActionRequest,
  type CreativeAiApplyRequest,
  type CreativeAiDiagnostic,
  type ExternalCreativeAiInvocation,
  type CreativeAiOutputRef,
  type ContentLocator,
  type ICapabilityPurposeTextRuntime,
  type StoryboardMediaRef,
} from '@neko/shared';
import type {
  GenerationJobSnapshot,
  PurposeGenerationJobPort,
  SubmitPurposeGenerationJobInput,
} from '@neko/generation';

const CANVAS_CREATIVE_AI_APPLY_COMMAND = 'neko.canvas.creativeAi.apply';
export interface CanvasCreativeAiExecutionInput {
  readonly invocation: ExternalCreativeAiInvocation;
  readonly conversationId: string;
  readonly runId: string;
  readonly workItemId: string;
}

export type CanvasCreativeAiExecutionResult =
  | {
      readonly status: 'completed';
      readonly outputRefs?: readonly CreativeAiOutputRef[];
      readonly diagnostics?: readonly CreativeAiDiagnostic[];
    }
  | {
      readonly status: 'stale' | 'failed';
      readonly diagnostics: readonly CreativeAiDiagnostic[];
    };

export interface CanvasCreativeAiRuntimeContext {
  readonly generationJobs?: PurposeGenerationJobPort;
  readonly purposeTextRuntime?: ICapabilityPurposeTextRuntime;
}

/** Canvas-owned execution for Canvas creative actions. */
export async function executeCanvasCreativeAi(
  input: CanvasCreativeAiExecutionInput,
  context: CanvasCreativeAiRuntimeContext,
): Promise<CanvasCreativeAiExecutionResult> {
  const actionId = readActionId(input);
  const request = readActionRequest(input);
  if (!actionId || !request) {
    return failed(
      diagnostic(
        'canvas-creative-ai-action-metadata-missing',
        'Canvas creative AI execution requires valid Canvas action metadata.',
        'metadata.canvasCreativeAiAction',
      ),
    );
  }

  const generated = isPromptAction(actionId)
    ? await optimizePrompt(actionId, request, input, context)
    : await generateMedia(actionId, request, input, context);
  if (!generated.ok) return { status: 'failed', diagnostics: generated.diagnostics };

  const applyResult = await vscode.commands.executeCommand<unknown>(
    CANVAS_CREATIVE_AI_APPLY_COMMAND,
    buildApplyRequest(input, generated.outputRefs),
  );
  const applyDiagnostics = readDiagnostics(applyResult);
  if (!isOkResult(applyResult)) {
    return {
      status: applyDiagnostics.some((item) => item.code.includes('stale')) ? 'stale' : 'failed',
      diagnostics: applyDiagnostics,
    };
  }

  const judged = await judgeCandidate(input, generated.outputRefs, context);
  if (!judged.ok) return { status: 'failed', diagnostics: judged.diagnostics };

  return {
    status: 'completed',
    outputRefs: generated.outputRefs,
    diagnostics: applyDiagnostics,
  };
}

type OutputResolution =
  | { readonly ok: true; readonly outputRefs: readonly CreativeAiOutputRef[] }
  | { readonly ok: false; readonly diagnostics: readonly CreativeAiDiagnostic[] };

async function optimizePrompt(
  actionId: CanvasCreativeAiActionId,
  request: CanvasCreativeAiActionRequest,
  input: CanvasCreativeAiExecutionInput,
  context: CanvasCreativeAiRuntimeContext,
): Promise<OutputResolution> {
  const runtime = context.purposeTextRuntime;
  if (!runtime) {
    return failedOutput(
      diagnostic(
        'canvas-purpose-text-runtime-unavailable',
        'Canvas prompt optimization requires the product purpose text port.',
        'canvas.prompt',
      ),
    );
  }
  const prompt = readPrompt(request, actionId);
  if (!prompt) return failedOutput(missingPromptDiagnostic(actionId));

  try {
    const completion = await runtime.complete({
      purpose: 'canvas.prompt',
      instruction:
        'Optimize the Canvas shot prompt. Return only the improved prompt text, without markdown fences or commentary.',
      input: [
        `Action: ${actionId}`,
        `Target: ${request.target.nodeId}`,
        '',
        'Current prompt:',
        prompt,
      ].join('\n'),
    });
    const text = completion.text.trim();
    if (!text) {
      return failedOutput(
        diagnostic(
          'canvas-empty-prompt-optimization',
          'Canvas prompt optimization returned empty text.',
          'output',
        ),
      );
    }
    return {
      ok: true,
      outputRefs: [
        {
          kind: 'text',
          id: `${input.workItemId}:optimized-prompt`,
          label: `${actionId} candidate prompt`,
          mimeType: 'text/plain',
          metadata: {
            text,
            actionId,
            sourcePromptRevision: request.targetRevision,
          },
        },
      ],
    };
  } catch (error) {
    return failedOutput(
      diagnostic(
        'canvas-prompt-optimization-failed',
        error instanceof Error ? error.message : String(error),
        'canvas.prompt',
      ),
    );
  }
}

async function generateMedia(
  actionId: CanvasCreativeAiActionId,
  request: CanvasCreativeAiActionRequest,
  input: CanvasCreativeAiExecutionInput,
  context: CanvasCreativeAiRuntimeContext,
): Promise<OutputResolution> {
  const jobs = context.generationJobs;
  if (!jobs) {
    return failedOutput(
      diagnostic(
        'canvas-generation-job-runtime-unavailable',
        'Canvas media generation requires the Generation Job port.',
        'generationJob',
      ),
    );
  }
  const prompt = readPrompt(request, actionId);
  if (!prompt) return failedOutput(missingPromptDiagnostic(actionId));

  try {
    const generation = request.creativeParameters?.generation;
    const referenceImageLocator = resolveFirstReferenceMediaLocator(
      request.creativeParameters?.referenceMedia?.imageRefs,
    );
    const metadata = {
      conversationId: input.conversationId,
      runId: input.runId,
      workItemId: input.workItemId,
      sourcePackage: 'neko-canvas',
      canvasActionId: actionId,
      canvasRequestId: request.requestId,
      targetRefId: request.targetRef.id,
      candidateTargetRefId: request.candidateTargetRef.id,
    };
    const submitted = await jobs.submitGeneration(
      buildCanvasGenerationJobInput(actionId, {
        prompt,
        generation,
        referenceImageLocator,
        referenceVideoLocator: resolveFirstReferenceMediaLocator(
          request.creativeParameters?.referenceMedia?.videoRefs,
        ),
        metadata,
      }),
    );
    const completed = await waitForTerminalGeneration(jobs, submitted);
    if (completed.phase !== 'succeeded') {
      return failedOutput(
        diagnostic(
          'canvas-media-generation-failed',
          completed.failure?.message ??
            `Generation Job ${completed.ref.jobId} ended in phase ${completed.phase}.`,
          'generationJob',
        ),
      );
    }
    const resultLocators = completed.resultLocators ?? [];
    if (resultLocators.length === 0) {
      return failedOutput(
        diagnostic(
          'canvas-media-generation-failed',
          'Canvas media generation completed without a generated-output ContentLocator.',
          'generationJob',
        ),
      );
    }
    return {
      ok: true,
      outputRefs: resultLocators.map((contentLocator, index) => {
        return {
          kind: 'generated-asset',
          id: contentLocator.outputId,
          generatedAssetId: contentLocator.outputId,
          label: `${actionId} output ${index + 1}`,
          contentLocator,
          metadata: {
            workItemId: input.workItemId,
            outputIndex: index,
            actionId,
            generationJobId: completed.ref.jobId,
          },
        } satisfies CreativeAiOutputRef;
      }),
    };
  } catch (error) {
    return failedOutput(
      diagnostic(
        'canvas-media-generation-failed',
        error instanceof Error ? error.message : String(error),
        'generationJob',
      ),
    );
  }
}

function buildCanvasGenerationJobInput(
  actionId: CanvasCreativeAiActionId,
  input: {
    readonly prompt: string;
    readonly generation: NonNullable<
      CanvasCreativeAiActionRequest['creativeParameters']
    >['generation'];
    readonly referenceImageLocator?: ContentLocator;
    readonly referenceVideoLocator?: ContentLocator;
    readonly metadata: Record<string, unknown>;
  },
): SubmitPurposeGenerationJobInput {
  const common = {
    prompt: input.prompt,
    ...(input.generation?.aspectRatio ? { aspectRatio: input.generation.aspectRatio } : {}),
    metadata: input.metadata,
  };
  switch (actionId) {
    case 'generate-image':
      return {
        lifecycleMode: 'detached',
        purpose: 'image.generate',
        generationType: input.referenceImageLocator ? 'image-to-image' : 'text-to-image',
        request: {
          ...common,
          ...(input.referenceImageLocator
            ? { referenceImageLocator: input.referenceImageLocator }
            : {}),
        },
      };
    case 'edit-image':
      return {
        lifecycleMode: 'detached',
        purpose: 'image.edit',
        generationType: 'image-edit',
        request: {
          ...common,
          operation: 'edit',
          editInstruction: input.prompt,
          ...(input.referenceImageLocator
            ? { referenceImageLocator: input.referenceImageLocator }
            : {}),
        },
      };
    case 'generate-video':
      return {
        lifecycleMode: 'detached',
        purpose: 'video.generate',
        generationType: input.referenceImageLocator ? 'image-to-video' : 'text-to-video',
        request: {
          ...common,
          ...(input.referenceImageLocator
            ? { startFrameLocator: input.referenceImageLocator }
            : {}),
          ...(typeof input.generation?.duration === 'number'
            ? { duration: input.generation.duration }
            : {}),
        },
      };
    case 'edit-video':
      return {
        lifecycleMode: 'detached',
        purpose: 'video.generate',
        generationType: 'video-edit',
        request: {
          ...common,
          operation: 'transform',
          editInstruction: input.prompt,
          ...(input.referenceVideoLocator
            ? { referenceVideoLocator: input.referenceVideoLocator }
            : {}),
          ...(typeof input.generation?.duration === 'number'
            ? { duration: input.generation.duration }
            : {}),
        },
      };
    case 'optimize-image-prompt':
    case 'optimize-video-prompt':
      throw new Error(`Prompt action ${actionId} cannot submit a Generation Job.`);
  }
}

export async function waitForTerminalGeneration(
  jobs: PurposeGenerationJobPort,
  initial: GenerationJobSnapshot,
  options: {
    readonly signal?: AbortSignal;
    readonly onSnapshot?: (snapshot: GenerationJobSnapshot) => void;
  } = {},
): Promise<GenerationJobSnapshot> {
  if (isTerminalGeneration(initial)) return initial;
  let latest = initial;
  const iterator = jobs.observeGeneration(initial.ref, initial.revision)[Symbol.asyncIterator]();
  try {
    while (true) {
      const next = await nextGenerationSnapshot(iterator, options.signal);
      if (next.done) break;
      latest = next.value;
      options.onSnapshot?.(latest);
      if (isTerminalGeneration(latest)) return latest;
    }
  } catch (error) {
    if (!options.signal?.aborted) throw error;
    const current = await jobs.describeGeneration(latest.ref);
    if (!isTerminalGeneration(current)) {
      await jobs.cancelGeneration({
        ref: current.ref,
        expectedRevision: current.revision,
      });
    }
    throw options.signal.reason instanceof Error
      ? options.signal.reason
      : new Error('Canvas Generation Job observation cancelled.');
  } finally {
    await iterator.return?.();
  }
  throw new Error(
    `Generation Job ${initial.ref.jobId} observation ended before a terminal snapshot.`,
  );
}

function nextGenerationSnapshot(
  iterator: AsyncIterator<GenerationJobSnapshot>,
  signal: AbortSignal | undefined,
): Promise<IteratorResult<GenerationJobSnapshot>> {
  if (!signal) return iterator.next();
  if (signal.aborted) {
    return Promise.reject(
      signal.reason instanceof Error
        ? signal.reason
        : new Error('Generation observation cancelled.'),
    );
  }
  return new Promise((resolve, reject) => {
    const onAbort = () =>
      reject(
        signal.reason instanceof Error
          ? signal.reason
          : new Error('Generation observation cancelled.'),
      );
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

function isTerminalGeneration(snapshot: GenerationJobSnapshot): boolean {
  return (
    snapshot.phase === 'succeeded' ||
    snapshot.phase === 'failed' ||
    snapshot.phase === 'cancelled' ||
    snapshot.phase === 'outcome-unknown'
  );
}

async function judgeCandidate(
  input: CanvasCreativeAiExecutionInput,
  outputRefs: readonly CreativeAiOutputRef[],
  context: CanvasCreativeAiRuntimeContext,
): Promise<
  { readonly ok: true } | { readonly ok: false; diagnostics: readonly CreativeAiDiagnostic[] }
> {
  if (input.invocation.metadata?.['judgeRequired'] !== true) return { ok: true };
  const runtime = context.purposeTextRuntime;
  if (!runtime) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'canvas-judge-runtime-unavailable',
          'Canvas candidate judging requires the product purpose text port.',
          'canvas.judge',
        ),
      ],
    };
  }
  try {
    const completion = await runtime.complete({
      purpose: 'canvas.judge',
      instruction:
        'Judge whether the Canvas creative AI candidate is acceptable. Return JSON with {"pass":true|false,"reason":"..."} only.',
      input: JSON.stringify(
        {
          intent: input.invocation.intent,
          targetRef: input.invocation.targetRef,
          candidateTargetRef: input.invocation.candidateTargetRef,
          outputRefs,
        },
        null,
        2,
      ),
    });
    const result = parseJudgeResponse(completion.text);
    return result.pass
      ? { ok: true }
      : {
          ok: false,
          diagnostics: [
            diagnostic(
              'canvas-judge-rejected-candidate',
              result.reason ?? 'Canvas judge rejected the candidate.',
              'canvas.judge',
            ),
          ],
        };
  } catch (error) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'canvas-judge-failed',
          error instanceof Error ? error.message : String(error),
          'canvas.judge',
        ),
      ],
    };
  }
}

function buildApplyRequest(
  input: CanvasCreativeAiExecutionInput,
  outputRefs: readonly CreativeAiOutputRef[],
): CreativeAiApplyRequest {
  return {
    schemaVersion: CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
    requestId: `canvas-creative-ai-apply:${input.runId}:${input.workItemId}`,
    conversationId: input.conversationId,
    runId: input.runId,
    workItemId: input.workItemId,
    sourcePackage: input.invocation.sourcePackage,
    ...(input.invocation.targetRef ? { targetRef: input.invocation.targetRef } : {}),
    ...(input.invocation.candidateTargetRef
      ? { candidateTargetRef: input.invocation.candidateTargetRef }
      : {}),
    outputRefs,
    writeback: {
      kind: 'candidate',
      atomicity: 'per-target',
      requiresRevisionMatch: true,
    },
    ...(input.invocation.targetRevision !== undefined
      ? { targetRevision: input.invocation.targetRevision }
      : {}),
    idempotencyKey: `${input.invocation.idempotencyKey}:candidate-apply:${input.workItemId}`,
    requestedAt: new Date().toISOString(),
    diagnostics: [],
  };
}

function readActionId(input: CanvasCreativeAiExecutionInput): CanvasCreativeAiActionId | undefined {
  const value = input.invocation.metadata?.['actionId'];
  return isCanvasCreativeAiActionId(value) ? value : undefined;
}

function readActionRequest(
  input: CanvasCreativeAiExecutionInput,
): CanvasCreativeAiActionRequest | undefined {
  const value = input.invocation.metadata?.['canvasCreativeAiAction'];
  return isCanvasCreativeAiActionRequest(value) ? value : undefined;
}

function isPromptAction(actionId: CanvasCreativeAiActionId): boolean {
  return actionId === 'optimize-image-prompt' || actionId === 'optimize-video-prompt';
}

function readPrompt(
  request: CanvasCreativeAiActionRequest,
  actionId: CanvasCreativeAiActionId,
): string | undefined {
  const blockKind =
    actionId === 'optimize-video-prompt' ||
    actionId === 'generate-video' ||
    actionId === 'edit-video'
      ? 'video'
      : 'image';
  const text = request.creativeParameters?.promptDocuments?.find(
    (document) => document.blockKind === blockKind,
  )?.text;
  return typeof text === 'string' && text.trim() ? text.trim() : undefined;
}

function resolveFirstReferenceMediaLocator(
  refs: readonly StoryboardMediaRef[] | undefined,
): ContentLocator | undefined {
  if (!refs) return undefined;
  for (const ref of refs) {
    if (isContentLocator(ref.contentLocator)) return ref.contentLocator;
    throw new Error(
      `canvas-reference-media-content-locator-migration-required: Storyboard media ref ${ref.refId} requires contentLocator.`,
    );
  }
  return undefined;
}

function missingPromptDiagnostic(actionId: CanvasCreativeAiActionId): CreativeAiDiagnostic {
  return diagnostic(
    'canvas-creative-ai-prompt-missing',
    `Canvas action ${actionId} requires a semantic prompt document.`,
    'creativeParameters.promptDocuments',
  );
}

function parseJudgeResponse(text: string): { readonly pass: boolean; readonly reason?: string } {
  try {
    const value: unknown = JSON.parse(text);
    if (isRecord(value) && typeof value['pass'] === 'boolean') {
      return {
        pass: value['pass'],
        ...(typeof value['reason'] === 'string' ? { reason: value['reason'] } : {}),
      };
    }
  } catch {
    // Invalid provider output is a visible judge rejection below.
  }
  return { pass: false, reason: 'Canvas judge response was not valid JSON.' };
}

function readDiagnostics(value: unknown): readonly CreativeAiDiagnostic[] {
  if (!isRecord(value) || !Array.isArray(value['diagnostics'])) {
    return [
      diagnostic(
        'canvas-creative-ai-apply-result-invalid',
        'Canvas creative AI apply returned an invalid result.',
        'applyResult',
      ),
    ];
  }
  return value['diagnostics'].filter(isCreativeAiDiagnostic);
}

function isCreativeAiDiagnostic(value: unknown): value is CreativeAiDiagnostic {
  return (
    isRecord(value) &&
    (value['severity'] === 'info' ||
      value['severity'] === 'warning' ||
      value['severity'] === 'error') &&
    typeof value['code'] === 'string' &&
    typeof value['message'] === 'string'
  );
}

function isOkResult(value: unknown): boolean {
  return isRecord(value) && value['ok'] === true;
}

function failed(diagnosticValue: CreativeAiDiagnostic): CanvasCreativeAiExecutionResult {
  return { status: 'failed', diagnostics: [diagnosticValue] };
}

function failedOutput(diagnosticValue: CreativeAiDiagnostic): OutputResolution {
  return { ok: false, diagnostics: [diagnosticValue] };
}

function diagnostic(code: string, message: string, target?: string): CreativeAiDiagnostic {
  return createCreativeAiDiagnostic('error', code, message, target);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
