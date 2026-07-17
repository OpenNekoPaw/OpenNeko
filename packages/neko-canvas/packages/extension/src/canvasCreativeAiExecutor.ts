import * as vscode from 'vscode';
import {
  CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
  createCreativeAiDiagnostic,
  isCanvasCreativeAiActionId,
  isCanvasCreativeAiActionRequest,
  type CanvasCreativeAiActionId,
  type CanvasCreativeAiActionRequest,
  type CreativeAiApplyRequest,
  type CreativeAiDiagnostic,
  type ExternalCreativeAiInvocation,
  type CreativeAiOutputRef,
  type ICapabilityPurposeMediaService,
  type ICapabilityPurposeTextRuntime,
  type StoryboardMediaRef,
} from '@neko/shared';

const CANVAS_CREATIVE_AI_APPLY_COMMAND = 'neko.canvas.creativeAi.apply';
const CANVAS_MEDIA_TIMEOUT_MS = 3 * 60 * 1000;

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
  readonly purposeMediaService?: ICapabilityPurposeMediaService;
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
  const media = context.purposeMediaService;
  if (!media) {
    return failedOutput(
      diagnostic(
        'canvas-purpose-media-runtime-unavailable',
        'Canvas media generation requires the product purpose media port.',
        'media',
      ),
    );
  }
  const prompt = readPrompt(request, actionId);
  if (!prompt) return failedOutput(missingPromptDiagnostic(actionId));

  try {
    const generation = request.creativeParameters?.generation;
    const referenceImageUri = resolveFirstReferenceMediaUri(
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
    const task =
      actionId === 'generate-image' || actionId === 'edit-image'
        ? await media.generateImage(actionId === 'edit-image' ? 'image.edit' : 'image.generate', {
            prompt,
            ...(generation?.aspectRatio ? { aspectRatio: generation.aspectRatio } : {}),
            ...(actionId === 'edit-image' ? { editInstruction: prompt } : {}),
            ...(referenceImageUri ? { referenceImageUri } : {}),
            metadata,
          })
        : await media.generateVideo('video.generate', {
            prompt,
            ...(typeof generation?.duration === 'number'
              ? { duration: generation.duration }
              : {}),
            ...(generation?.aspectRatio ? { aspectRatio: generation.aspectRatio } : {}),
            ...(actionId === 'edit-video' ? { editInstruction: prompt } : {}),
            ...(referenceImageUri ? { referenceImageUri } : {}),
            ...(resolveFirstReferenceMediaUri(
              request.creativeParameters?.referenceMedia?.videoRefs,
            )
              ? {
                  sourceVideoUrl: resolveFirstReferenceMediaUri(
                    request.creativeParameters?.referenceMedia?.videoRefs,
                  ),
                }
              : {}),
            metadata,
          });
    const completed = await media.waitForTask(task.scope, CANVAS_MEDIA_TIMEOUT_MS);
    if (completed.status !== 'completed' || !completed.outputs?.length) {
      return failedOutput(
        diagnostic(
          'canvas-media-task-failed',
          `Canvas media task ${task.id} completed without output.`,
          'mediaTask',
        ),
      );
    }
    return {
      ok: true,
      outputRefs: completed.outputs.map((output, index) => {
        const generatedAssetId = `${task.id}:output:${index}`;
        return {
          kind: 'generated-asset',
          id: generatedAssetId,
          generatedAssetId,
          mimeType: output.mimeType,
          label: `${actionId} output ${index + 1}`,
          resourceRef: {
            id: generatedAssetId,
            scope: 'project',
            provider: 'neko-canvas',
            kind: 'generated',
            source: {
              kind: 'generated-asset',
              generatedAssetId,
              metadata: { mediaTaskId: task.id, outputIndex: index },
            },
            locator: { kind: 'generated-asset', assetId: generatedAssetId },
            fingerprint: {
              strategy: 'provider',
              value: `${task.id}:${index}`,
              providerId: 'neko-canvas',
            },
          },
          metadata: { mediaTaskId: task.id, outputIndex: index, actionId },
        } satisfies CreativeAiOutputRef;
      }),
    };
  } catch (error) {
    return failedOutput(
      diagnostic(
        'canvas-media-generation-failed',
        error instanceof Error ? error.message : String(error),
        'media',
      ),
    );
  }
}

async function judgeCandidate(
  input: CanvasCreativeAiExecutionInput,
  outputRefs: readonly CreativeAiOutputRef[],
  context: CanvasCreativeAiRuntimeContext,
): Promise<{ readonly ok: true } | { readonly ok: false; diagnostics: readonly CreativeAiDiagnostic[] }> {
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

function readActionId(
  input: CanvasCreativeAiExecutionInput,
): CanvasCreativeAiActionId | undefined {
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

function resolveFirstReferenceMediaUri(
  refs: readonly StoryboardMediaRef[] | undefined,
): string | undefined {
  if (!refs) return undefined;
  for (const ref of refs) {
    const resourcePath =
      ref.resourceRef?.source?.projectRelativePath ??
      ref.resourceRef?.source?.uri ??
      (ref.resourceRef?.locator?.kind === 'file' ? ref.resourceRef.locator.path : undefined);
    if (resourcePath) return resourcePath;
    if (isRecord(ref.locator)) {
      if (ref.locator['type'] === 'workspace-path' && typeof ref.locator['path'] === 'string') {
        return ref.locator['path'];
      }
      if (ref.locator['type'] === 'asset' && typeof ref.locator['uri'] === 'string') {
        return ref.locator['uri'];
      }
    }
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
