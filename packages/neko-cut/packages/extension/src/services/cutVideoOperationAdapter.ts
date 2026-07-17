import {
  CREATIVE_MEDIA_OPERATION_CONTRACT_VERSION,
  validateDurableResourceRef,
  type CreativeMediaOperationAdapter,
  type CreativeMediaOperationDiagnostic,
  type CreativeMediaOperationRequest,
  type CreativeMediaOperationResult,
  type NekoProjectAuthoringTarget,
  type ResourceRef,
} from '@neko/shared';
import type {
  CutProjectAuthoringImportGeneratedClipRequest,
  CutProjectAuthoringImportedClip,
  ICutProjectAuthoringService,
} from './CutProjectAuthoringService';

export type CutTimelinePreparationAuthoringPort = Pick<
  ICutProjectAuthoringService,
  'importGeneratedClip'
>;

export type CutResourcePathResolver = (resourceRef: ResourceRef) => Promise<string>;

export interface CutTimelinePreparationAdapterOptions {
  readonly authoring: CutTimelinePreparationAuthoringPort;
  readonly target: NekoProjectAuthoringTarget;
  readonly resolveResourcePath: CutResourcePathResolver;
  readonly trackId?: string;
  readonly trackIndex?: number;
  readonly startTime?: number;
}

/**
 * Cut owns accepted generated-clip insertion and single-clip preparation only.
 * Timeline-wide editing remains in Cut's video-editing authoring APIs.
 */
export function createCutTimelinePreparationAdapter(
  options: CutTimelinePreparationAdapterOptions,
): CreativeMediaOperationAdapter {
  return {
    support: {
      version: CREATIVE_MEDIA_OPERATION_CONTRACT_VERSION,
      mediaKind: 'video',
      operationId: 'prepare-for-timeline',
      level: 'supported',
      adapterId: 'neko-cut:single-clip-timeline-preparation',
      acceptedControls: ['reference-video', 'duration'],
      requirements: { requiredInputRoles: ['reference-video'] },
      diagnostics: [],
    },
    execute: async (request) => executeTimelinePreparation(request, options),
  };
}

async function executeTimelinePreparation(
  request: CreativeMediaOperationRequest,
  options: CutTimelinePreparationAdapterOptions,
): Promise<CreativeMediaOperationResult> {
  if (request.mediaKind !== 'video' || request.operationId !== 'prepare-for-timeline') {
    return failedResult(
      request,
      'operation-unsupported',
      'Cut adapter only accepts prepare-for-timeline video requests.',
    );
  }
  const sourceRef = request.referenceVideoRef;
  if (!sourceRef) {
    return failedResult(
      request,
      'missing-required-input',
      'Cut timeline preparation requires a stable referenceVideoRef.',
    );
  }
  const validation = validateDurableResourceRef(sourceRef, ['referenceVideoRef']);
  if (!validation.ok) {
    return {
      ...failedResult(
        request,
        'invalid-operation-request',
        'Cut timeline preparation rejected non-durable media identity.',
      ),
      diagnostics: validation.diagnostics,
    };
  }

  let sourcePath: string;
  try {
    sourcePath = await options.resolveResourcePath(sourceRef);
  } catch (error) {
    return failedResult(
      request,
      'invalid-operation-request',
      `Cut could not authorize/materialize the generated clip: ${formatError(error)}`,
    );
  }

  const authoringRequest: CutProjectAuthoringImportGeneratedClipRequest = {
    target: options.target,
    sourcePath,
    mediaType: 'video',
    requestId: request.requestId,
    ...(request.requestedDurationSeconds !== undefined
      ? { duration: request.requestedDurationSeconds }
      : {}),
    ...(options.trackId ? { trackId: options.trackId } : {}),
    ...(options.trackIndex !== undefined ? { trackIndex: options.trackIndex } : {}),
    ...(options.startTime !== undefined ? { startTime: options.startTime } : {}),
  };
  const result = await options.authoring.importGeneratedClip(authoringRequest);
  if (!result.ok || !result.data) {
    return failedResult(
      request,
      'invalid-operation-result',
      result.diagnostics.map((diagnostic) => diagnostic.message).join('; ') ||
        'Cut failed to insert the generated clip.',
    );
  }
  return succeededResult(request, sourceRef, result.data);
}

function succeededResult(
  request: CreativeMediaOperationRequest,
  sourceRef: ResourceRef,
  importedClip: CutProjectAuthoringImportedClip,
): CreativeMediaOperationResult {
  return {
    version: CREATIVE_MEDIA_OPERATION_CONTRACT_VERSION,
    requestId: request.requestId,
    mediaKind: request.mediaKind,
    operationId: request.operationId,
    status: 'succeeded',
    outputRefs: [sourceRef],
    diagnostics: [],
    provenance: {
      adapterId: 'neko-cut:single-clip-timeline-preparation',
      trackId: importedClip.trackId,
      elementId: importedClip.elementId,
      startTime: importedClip.startTime,
      duration: importedClip.duration,
    },
  };
}

function failedResult(
  request: CreativeMediaOperationRequest,
  code: CreativeMediaOperationDiagnostic['code'],
  message: string,
): CreativeMediaOperationResult {
  const diagnostic: CreativeMediaOperationDiagnostic = {
    code,
    severity: 'error',
    message,
  };
  return {
    version: CREATIVE_MEDIA_OPERATION_CONTRACT_VERSION,
    requestId: request.requestId,
    mediaKind: request.mediaKind,
    operationId: request.operationId,
    status: 'failed',
    outputRefs: [],
    diagnostics: [diagnostic],
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
