import type { ToolCall, ToolCallProgress } from '@neko/agent-contracts';
import type {
  ContentLocator,
  ContentRepresentationLocator,
  DocumentLocator,
  DocumentSourceRef,
} from '@neko/content';
import type { CanvasWorkspaceDeliveryState } from '@neko/canvas-domain';
import {
  isContentRepresentationLocator,
  parseDocumentLocator,
  parseDocumentSourceRef,
  serializeContentReferenceTarget,
  validateContentLocator,
} from '@neko/content';
import {
  parsePreviewMediaDescriptor,
  type PreviewContentKind,
  type PreviewMediaDescriptor,
} from '@neko/preview-domain';
import { validateCanvasAuthoringResultEnvelope } from '@neko/canvas-domain';
import {
  AUDIO_GENERATION_TOOLS,
  FILE_TOOLS,
  IMAGE_GENERATION_TOOLS,
  VIDEO_GENERATION_TOOLS,
  getToolSummary,
} from '@neko/agent-contracts';

export interface DocumentImageThumbnailProjection {
  id: string;
  index: number;
  filePath: string;
  source?: DocumentSourceRef;
  path: string;
  src?: string;
  width?: number;
  height?: number;
  byteSize?: number;
  mimeType?: string;
  locator?: DocumentLocator;
  contentLocator?: ContentLocator;
  representationLocator?: ContentRepresentationLocator;
  previewDescriptor?: PreviewMediaDescriptor;
  previewDiagnostic?: string;
  label: string;
  referenceJson: string;
}

export interface CanvasAuthoringRefProjection {
  readonly key: string;
  readonly kind: string;
  readonly id: string;
  readonly label: string;
  readonly details: readonly string[];
}

export interface CanvasAuthoringDiagnosticProjection {
  readonly key: string;
  readonly severity: 'info' | 'warning' | 'error';
  readonly code: string;
  readonly message: string;
  readonly target?: string;
  readonly requiredQuery?: string;
  readonly retryable?: boolean;
}

export interface CanvasAuthoringNextActionProjection {
  readonly key: string;
  readonly id: string;
  readonly label: string;
  readonly toolName?: string;
  readonly requiresApproval: boolean;
  readonly argumentsJson?: string;
}

export interface CanvasAuthoringPromptFieldAlignmentProjection {
  readonly key: string;
  readonly fieldId: string;
  readonly alignmentState: string;
  readonly sourceSpanId?: string;
  readonly userOverride?: boolean;
}

export interface CanvasAuthoringResultProjection {
  readonly isValid: boolean;
  readonly status: string;
  readonly summary?: string;
  readonly refs: readonly CanvasAuthoringRefProjection[];
  readonly diagnostics: readonly CanvasAuthoringDiagnosticProjection[];
  readonly blockedReason?: string;
  readonly changedFields: readonly string[];
  readonly nextActions: readonly CanvasAuthoringNextActionProjection[];
  readonly promptFieldAlignments: readonly CanvasAuthoringPromptFieldAlignmentProjection[];
}

export interface ToolCallDisplayProjection {
  argsJson: string;
  resultJson: string | null;
  hasExpandableContent: boolean;
  isBackgroundMode: boolean;
  backgroundTaskId?: string;
  shouldShowMediaPreview: boolean;
  isImageTool: boolean;
  imageDescriptors: PreviewMediaDescriptor[];
  isVideoTool: boolean;
  videoDescriptors: PreviewMediaDescriptor[];
  isAudioTool: boolean;
  audioDescriptors: PreviewMediaDescriptor[];
  documentThumbnails: DocumentImageThumbnailProjection[];
  copyText: string | null;
  isFileTool: boolean;
  filePath: string | null;
  fileContentLocator: ContentLocator | null;
  summary: string;
  isPending: boolean;
  isSuccess: boolean;
  isFailed: boolean;
  needsConfirmation: boolean;
  canvasAuthoringResult: CanvasAuthoringResultProjection | null;
  generationJob: GenerationJobCardProjection | null;
}

export interface GenerationJobCardProjection {
  readonly jobId: string;
  readonly phase: string;
  readonly stage: string;
  readonly percent: number;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly boardDelivery?: {
    readonly status: Exclude<CanvasWorkspaceDeliveryState, 'discarded'>;
    readonly nodeIds: readonly string[];
    readonly diagnostics: readonly {
      readonly code: string;
      readonly message: string;
    }[];
  };
}

export function projectToolCallDisplayState(
  toolCall: ToolCall,
  progress?: ToolCallProgress,
): ToolCallDisplayProjection {
  const argsJson = JSON.stringify(toolCall.arguments, null, 2);
  const sanitizedResultData = sanitizeToolResultData(toolCall.result?.data);
  const resultJson =
    sanitizedResultData !== undefined ? JSON.stringify(sanitizedResultData, null, 2) : null;
  const resultData = asRecord(toolCall.result?.data);
  const canvasAuthoringResult = projectCanvasAuthoringResult(sanitizedResultData);
  const isBackgroundMode = resultData?.backgroundMode === true;
  const backgroundTaskStatus = readString(resultData, 'status');
  const shouldShowMediaPreview = !isBackgroundMode || backgroundTaskStatus === 'completed';
  const resultSuccess = toolCall.result?.success === true;
  const documentThumbnails = extractToolDocumentThumbnails(
    toolCall.name,
    toolCall.arguments,
    resultSuccess ? toolCall.result?.data : undefined,
    toolCall.result?.attachments,
    toolCall.result?.perceptionCards,
  );
  const copyText = resultSuccess ? extractToolCopyText(toolCall.name, toolCall.result?.data) : null;
  const isImageTool = isImageGenerationTool(toolCall.name);
  const isVideoTool = isVideoGenerationTool(toolCall.name);
  const isAudioTool = isAudioGenerationTool(toolCall.name);

  return {
    argsJson,
    resultJson,
    hasExpandableContent:
      Object.keys(toolCall.arguments).length > 0 || (resultJson !== null && resultJson.length > 0),
    isBackgroundMode,
    backgroundTaskId: isBackgroundMode ? readString(resultData, 'taskId') : undefined,
    shouldShowMediaPreview,
    isImageTool,
    imageDescriptors:
      resultSuccess && shouldShowMediaPreview && isImageTool
        ? extractToolPreviewDescriptors(resultData, 'image')
        : [],
    isVideoTool,
    videoDescriptors:
      resultSuccess && shouldShowMediaPreview && isVideoTool
        ? extractToolPreviewDescriptors(resultData, 'video')
        : [],
    isAudioTool,
    audioDescriptors:
      resultSuccess && shouldShowMediaPreview && isAudioTool
        ? extractToolPreviewDescriptors(resultData, 'audio')
        : [],
    documentThumbnails,
    copyText,
    isFileTool: isFileTool(toolCall.name),
    filePath: extractToolFilePath(toolCall.arguments) || extractToolFilePath(toolCall.result?.data),
    fileContentLocator:
      extractToolContentLocator(toolCall.arguments) ??
      extractToolContentLocator(toolCall.result?.data) ??
      null,
    summary: getToolSummary(toolCall.name, toolCall.arguments),
    isPending: !toolCall.result,
    isSuccess: resultSuccess,
    isFailed: toolCall.result?.success === false,
    needsConfirmation: toolCall.pendingConfirmation === true,
    canvasAuthoringResult,
    generationJob: projectGenerationJobCard(toolCall, progress),
  };
}

function projectGenerationJobCard(
  toolCall: ToolCall,
  progress: ToolCallProgress | undefined,
): GenerationJobCardProjection | null {
  if (!isGenerationTool(toolCall.name)) return null;
  const result = asRecord(toolCall.result?.data);
  const state =
    asRecord(result?.generationJob) ??
    asRecord(progress?.data) ??
    (readString(result, 'jobId') ? result : undefined);
  if (!state || (state.kind !== undefined && state.kind !== 'generation-job')) return null;
  const jobId = readString(state, 'jobId');
  const resultProgress = asRecord(state.progress);
  const phase =
    readString(state, 'phase') ??
    (readString(state, 'status') === 'completed' ? 'succeeded' : readString(state, 'status'));
  const stage =
    readString(state, 'stage') ??
    readString(resultProgress, 'stage') ??
    (phase === 'succeeded' ? 'completed' : phase);
  const percent =
    readProgressPercent(state, 'percent') ??
    readProgressPercent(resultProgress, 'percent') ??
    (phase === 'succeeded' ? 100 : undefined);
  if (!jobId || !phase || !stage || percent === undefined) return null;

  const board = asRecord(result?.boardDelivery);
  const routedTo = asRecord(result?.routedTo);
  return {
    jobId,
    phase,
    stage,
    percent,
    ...((readString(state, 'providerId') ?? readString(routedTo, 'provider'))
      ? { providerId: readString(state, 'providerId') ?? readString(routedTo, 'provider') }
      : {}),
    ...((readString(state, 'modelId') ?? readString(routedTo, 'model'))
      ? { modelId: readString(state, 'modelId') ?? readString(routedTo, 'model') }
      : {}),
    ...(board
      ? {
          boardDelivery: {
            status: requireBoardDeliveryStatus(board),
            nodeIds: readStringArray(board.nodeIds),
            diagnostics: readRecordArray(board, 'diagnostics').map((diagnostic, index) => ({
              code: readString(diagnostic, 'code') ?? `board-delivery-${index + 1}`,
              message: readString(diagnostic, 'message') ?? 'Workspace Board delivery failed.',
            })),
          },
        }
      : {}),
  };
}

function requireBoardDeliveryStatus(
  board: Record<string, unknown>,
): Exclude<CanvasWorkspaceDeliveryState, 'discarded'> {
  const status = readString(board, 'status');
  if (
    status === 'queued' ||
    status === 'claimed' ||
    status === 'projected' ||
    status === 'noop' ||
    status === 'blocked' ||
    status === 'conflict'
  ) {
    return status;
  }
  throw new Error(
    `Generation result contains invalid Board delivery status ${status ?? '<missing>'}.`,
  );
}

function projectCanvasAuthoringResult(data: unknown): CanvasAuthoringResultProjection | null {
  const result = asRecord(data);
  const authoringResult = asRecord(result?.authoringResult);
  if (!authoringResult) return null;

  const validation = validateCanvasAuthoringResultEnvelope(authoringResult);
  const validationDiagnostics = validation.valid
    ? []
    : validation.diagnostics.map(projectCanvasAuthoringDiagnostic);
  if (!validation.valid) {
    return {
      isValid: false,
      status: readString(authoringResult, 'status') ?? 'malformed',
      refs: [],
      diagnostics: validationDiagnostics,
      changedFields: [],
      nextActions: [],
      promptFieldAlignments: collectPromptFieldAlignments(data),
    };
  }

  const diagnostics = readRecordArray(authoringResult, 'diagnostics').map(
    projectCanvasAuthoringDiagnostic,
  );
  return {
    isValid: true,
    status: readString(authoringResult, 'status') ?? 'unknown',
    ...(readString(authoringResult, 'summary')
      ? { summary: readString(authoringResult, 'summary') }
      : {}),
    refs: readRecordArray(authoringResult, 'refs').map(projectCanvasAuthoringRef),
    diagnostics,
    ...(readString(authoringResult, 'blockedReason')
      ? { blockedReason: readString(authoringResult, 'blockedReason') }
      : {}),
    changedFields: readStringArray(authoringResult.changedFields),
    nextActions: projectCanvasAuthoringNextActions(authoringResult, diagnostics),
    promptFieldAlignments: collectPromptFieldAlignments(data),
  };
}

function projectCanvasAuthoringRef(
  ref: Record<string, unknown>,
  index: number,
): CanvasAuthoringRefProjection {
  const kind = readString(ref, 'kind') ?? 'ref';
  const id = readString(ref, 'id') ?? `#${index + 1}`;
  const label = readString(ref, 'label') ?? id;
  const fieldPath = readString(ref, 'fieldPath');
  const details = [
    readString(ref, 'canvasId') ? `canvas:${readString(ref, 'canvasId')}` : undefined,
    readString(ref, 'nodeId') ? `node:${readString(ref, 'nodeId')}` : undefined,
    readString(ref, 'connectionId') ? `connection:${readString(ref, 'connectionId')}` : undefined,
    fieldPath ? `field:${fieldPath}` : undefined,
  ].filter(isPresentString);

  return {
    key: `${kind}:${id}:${index}`,
    kind,
    id,
    label,
    details,
  };
}

function projectCanvasAuthoringDiagnostic(
  diagnostic: unknown,
  index: number,
): CanvasAuthoringDiagnosticProjection {
  const record = asRecord(diagnostic);
  if (!record) {
    return {
      key: `error:malformed-authoring-diagnostic:${index}`,
      severity: 'error',
      code: 'malformed-authoring-diagnostic',
      message: 'Canvas authoring diagnostic is malformed.',
    };
  }
  const severity = readDiagnosticSeverity(record.severity);
  const code = readString(record, 'code') ?? `canvas-authoring-diagnostic-${index + 1}`;
  const message = readString(record, 'message') ?? code;
  return {
    key: `${severity}:${code}:${index}`,
    severity,
    code,
    message,
    ...(readString(record, 'target') ? { target: readString(record, 'target') } : {}),
    ...(readString(record, 'requiredQuery')
      ? { requiredQuery: readString(record, 'requiredQuery') }
      : {}),
    ...(typeof record.retryable === 'boolean' ? { retryable: record.retryable } : {}),
  };
}

function projectCanvasAuthoringNextActions(
  authoringResult: Record<string, unknown>,
  diagnostics: readonly CanvasAuthoringDiagnosticProjection[],
): readonly CanvasAuthoringNextActionProjection[] {
  const actions = [
    ...readRecordArray(authoringResult, 'nextActions'),
    ...readRecordArrayFromDiagnostics(authoringResult),
  ];
  const seen = new Set<string>();
  const seenToolNames = new Set<string>();
  const projected: CanvasAuthoringNextActionProjection[] = [];
  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index]!;
    const id = readString(action, 'id') ?? `next-action-${index + 1}`;
    const toolName = readString(action, 'toolName');
    const dedupeKey = `${id}:${toolName ?? ''}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    if (toolName) seenToolNames.add(toolName);
    projected.push({
      key: `${dedupeKey}:${index}`,
      id,
      label: readString(action, 'label') ?? toolName ?? id,
      ...(toolName ? { toolName } : {}),
      requiresApproval: action.requiresApproval === true,
      ...(asRecord(action.arguments)
        ? { argumentsJson: JSON.stringify(action.arguments, null, 2) }
        : {}),
    });
  }

  for (const diagnostic of diagnostics) {
    if (!diagnostic.requiredQuery) continue;
    if (seenToolNames.has(diagnostic.requiredQuery)) continue;
    const id = `required-query:${diagnostic.requiredQuery}`;
    if (seen.has(id)) continue;
    seen.add(id);
    projected.push({
      key: `${id}:${projected.length}`,
      id,
      label: `Query ${diagnostic.requiredQuery}`,
      toolName: diagnostic.requiredQuery,
      requiresApproval: false,
    });
  }
  return projected;
}

function readRecordArrayFromDiagnostics(
  authoringResult: Record<string, unknown>,
): readonly Record<string, unknown>[] {
  const diagnostics = readRecordArray(authoringResult, 'diagnostics');
  return diagnostics.flatMap((diagnostic) => readRecordArray(diagnostic, 'suggestedActions'));
}

function collectPromptFieldAlignments(
  data: unknown,
): readonly CanvasAuthoringPromptFieldAlignmentProjection[] {
  const alignments: CanvasAuthoringPromptFieldAlignmentProjection[] = [];
  const seenAlignments = new Set<string>();
  collectPromptFieldAlignmentsFromValue(data, new WeakSet<object>(), alignments, seenAlignments);
  return alignments;
}

function collectPromptFieldAlignmentsFromValue(
  value: unknown,
  seen: WeakSet<object>,
  alignments: CanvasAuthoringPromptFieldAlignmentProjection[],
  seenAlignments: Set<string>,
): void {
  if (!value || typeof value !== 'object' || alignments.length >= 12) return;
  if (seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      collectPromptFieldAlignmentsFromValue(item, seen, alignments, seenAlignments);
    }
    return;
  }

  const record = value as Record<string, unknown>;
  addPromptFieldAlignment(record, alignments, seenAlignments);
  for (const item of readRecordArray(record, 'fieldProjections')) {
    addPromptFieldAlignment(item, alignments, seenAlignments);
  }
  for (const item of readRecordArray(record, 'promptFieldAlignments')) {
    addPromptFieldAlignment(item, alignments, seenAlignments);
  }
  for (const item of readRecordArray(record, 'promptFieldAlignment')) {
    addPromptFieldAlignment(item, alignments, seenAlignments);
  }

  for (const child of Object.values(record)) {
    collectPromptFieldAlignmentsFromValue(child, seen, alignments, seenAlignments);
  }
}

function addPromptFieldAlignment(
  record: Record<string, unknown>,
  alignments: CanvasAuthoringPromptFieldAlignmentProjection[],
  seenAlignments: Set<string>,
): void {
  const fieldId = readString(record, 'fieldId');
  const alignmentState = readString(record, 'alignmentState');
  if (!fieldId || !alignmentState) return;
  const sourceSpanId = readString(record, 'sourceSpanId');
  const key = `${fieldId}:${alignmentState}:${sourceSpanId ?? ''}`;
  if (seenAlignments.has(key)) return;
  seenAlignments.add(key);
  alignments.push({
    key,
    fieldId,
    alignmentState,
    ...(sourceSpanId ? { sourceSpanId } : {}),
    ...(typeof record.userOverride === 'boolean' ? { userOverride: record.userOverride } : {}),
  });
}

function extractDocumentImageThumbnails(data: unknown): DocumentImageThumbnailProjection[] {
  const result = asRecord(data);
  if (!result) return [];

  const filePath = extractDocumentFilePath(result);
  if (!filePath) return [];

  const source = parseDocumentSourceRef(result.source);
  const imageInfo = Array.isArray(result.imageInfo) ? result.imageInfo : [];

  const thumbnails: DocumentImageThumbnailProjection[] = [];
  for (let index = 0; index < imageInfo.length; index += 1) {
    const info = asRecord(imageInfo[index]);
    const locator = parseDocumentLocator(info?.locator);
    const width = readFiniteNumber(info, 'width');
    const height = readFiniteNumber(info, 'height');
    const byteSize = readFiniteNumber(info, 'byteSize');
    const mimeType = readString(info, 'mimeType');
    if (info?.resourceRef !== undefined || info?.documentResourceRef !== undefined) continue;
    const contentLocator = parseStableContentLocator(info?.contentLocator);
    const representationLocator = isContentRepresentationLocator(info?.representationLocator)
      ? info.representationLocator
      : undefined;
    if (!contentLocator && !representationLocator) continue;
    const locatorIdentity = describeContentLocatorForDisplay(
      contentLocator ?? representationLocator!.source,
    );
    const path =
      (contentLocator?.kind === 'document-entry' ? contentLocator.entryPath : undefined) ??
      readString(info, 'entryPath') ??
      (locator ? formatDocumentLocator(locator) : locatorIdentity.path);
    const documentFilePath = locatorIdentity.filePath || filePath;
    const previewDescriptor = readPreviewDescriptor(info);
    const src = previewDescriptor?.url ?? readString(info, 'renderUri');
    const previewDiagnostic = readResourceProjectionDiagnostic(info);
    thumbnails.push({
      id: `${path}:${index}`,
      index,
      filePath: documentFilePath,
      ...(source ? { source } : {}),
      path,
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      ...(byteSize !== undefined ? { byteSize } : {}),
      ...(mimeType ? { mimeType } : {}),
      ...(locator ? { locator } : {}),
      ...(contentLocator ? { contentLocator } : {}),
      ...(representationLocator ? { representationLocator } : {}),
      ...(previewDescriptor ? { previewDescriptor } : {}),
      ...(src ? { src } : {}),
      ...(previewDiagnostic ? { previewDiagnostic } : {}),
      label: formatDocumentThumbnailLabel(locator, index),
      referenceJson: formatDocumentImageReferenceJson({
        filePath: documentFilePath,
        source,
        path,
        index,
        width,
        height,
        byteSize,
        mimeType,
        locator,
        contentLocator,
        representationLocator,
      }),
    });
  }

  return thumbnails;
}

function extractReadImageThumbnails(
  data: unknown,
  attachments?: readonly unknown[],
  perceptionCards?: readonly unknown[],
): DocumentImageThumbnailProjection[] {
  const result = asRecord(data);
  if (!result) return [];

  const filePath = extractDocumentFilePath(result);
  const source = parseDocumentSourceRef(result.source);
  const locators = Array.isArray(result.locators) ? result.locators : [];
  const images = Array.isArray(result.images) ? result.images : [];

  if (images.length > 0) {
    return images.flatMap((value, index) => {
      const image = asRecord(value);
      if (!image) return [];

      const documentImage = asRecord(image.documentImage);
      const metadata = asRecord(image.metadata);

      const locator =
        parseDocumentLocator(metadata?.locator) ??
        parseDocumentLocator(documentImage?.locator) ??
        parseDocumentLocator(locators[index]);
      const width = readFiniteNumber(image, 'width') ?? readFiniteNumber(documentImage, 'width');
      const height = readFiniteNumber(image, 'height') ?? readFiniteNumber(documentImage, 'height');
      const byteSize =
        readFiniteNumber(image, 'byteSize') ?? readFiniteNumber(documentImage, 'byteSize');
      const mimeType = readString(image, 'mimeType') ?? readString(documentImage, 'mimeType');
      if (documentImage?.resourceRef !== undefined || image.resourceRef !== undefined) return [];
      const contentLocator =
        parseStableContentLocator(image.contentLocator) ??
        parseStableContentLocator(documentImage?.contentLocator);
      const representationLocator = isContentRepresentationLocator(image.representationLocator)
        ? image.representationLocator
        : isContentRepresentationLocator(documentImage?.representationLocator)
          ? documentImage.representationLocator
          : undefined;
      const attachment = asRecord(attachments?.[index]);
      const attachmentAssetRef = asRecord(attachment?.assetRef);
      const perceptionCard = asRecord(perceptionCards?.[index]);
      const perceptual = asRecord(perceptionCard?.perceptual);
      const perceptionThumbnailRef = asRecord(perceptual?.thumbnailRef);
      const path = readString(image, 'path') ?? readString(documentImage, 'path');
      const previewDescriptor =
        readPreviewDescriptor(image) ??
        readPreviewDescriptor(documentImage) ??
        readPreviewDescriptor(attachment) ??
        readPreviewDescriptor(attachmentAssetRef) ??
        readPreviewDescriptor(perceptionThumbnailRef);
      const src =
        previewDescriptor?.url ??
        readString(image, 'renderUri') ??
        readString(documentImage, 'renderUri') ??
        readString(image, 'src') ??
        readString(documentImage, 'src') ??
        readString(attachment, 'previewUri') ??
        readString(attachmentAssetRef, 'previewUri') ??
        readString(attachmentAssetRef, 'renderUri') ??
        readString(perceptionThumbnailRef, 'previewUri');
      const previewDiagnostic =
        readString(attachmentAssetRef, 'previewDiagnostic') ??
        readString(perceptionThumbnailRef, 'previewDiagnostic') ??
        readResourceProjectionDiagnostic(image) ??
        readResourceProjectionDiagnostic(documentImage);
      const locatorIdentity =
        contentLocator || representationLocator
          ? describeContentLocatorForDisplay(contentLocator ?? representationLocator!.source)
          : undefined;
      const displayPath =
        (contentLocator?.kind === 'document-entry' ? contentLocator.entryPath : undefined) ??
        readString(image, 'entryPath') ??
        path ??
        locatorIdentity?.path;
      if (!displayPath || (!src && !contentLocator && !representationLocator)) return [];

      const thumbnailFilePath = filePath ?? locatorIdentity?.filePath ?? displayPath;
      const label = readString(image, 'label') ?? formatDocumentThumbnailLabel(locator, index);

      return [
        {
          id: `${displayPath}:${index}`,
          index,
          filePath: thumbnailFilePath,
          ...(source ? { source } : {}),
          path: displayPath,
          ...(src ? { src } : {}),
          ...(width !== undefined ? { width } : {}),
          ...(height !== undefined ? { height } : {}),
          ...(byteSize !== undefined ? { byteSize } : {}),
          ...(mimeType ? { mimeType } : {}),
          ...(locator ? { locator } : {}),
          ...(contentLocator ? { contentLocator } : {}),
          ...(representationLocator ? { representationLocator } : {}),
          ...(previewDescriptor ? { previewDescriptor } : {}),
          ...(previewDiagnostic ? { previewDiagnostic } : {}),
          label,
          referenceJson: formatDocumentImageReferenceJson({
            filePath: thumbnailFilePath,
            source,
            path: displayPath,
            ...(src ? { src } : {}),
            index,
            width,
            height,
            byteSize,
            mimeType,
            locator,
            contentLocator,
            representationLocator,
            displayPath,
          }),
        },
      ];
    });
  }

  return [];
}

function readPreviewDescriptor(
  record: Record<string, unknown> | undefined,
): PreviewMediaDescriptor | undefined {
  if (!record || !('previewDescriptor' in record)) return undefined;
  try {
    return parsePreviewMediaDescriptor(record.previewDescriptor);
  } catch {
    return undefined;
  }
}

function readResourceProjectionDiagnostic(
  record: Record<string, unknown> | undefined,
): string | undefined {
  const diagnostics = record?.['resourceProjectionDiagnostics'];
  if (!Array.isArray(diagnostics)) return undefined;
  for (const value of diagnostics) {
    const diagnostic = asRecord(value);
    const message = readString(diagnostic, 'message');
    if (message) return message;
  }
  return undefined;
}

function extractToolDocumentThumbnails(
  toolName: string,
  args: unknown,
  resultData: unknown,
  attachments?: readonly unknown[],
  perceptionCards?: readonly unknown[],
): DocumentImageThumbnailProjection[] {
  if (toolName === 'ReadDocument') {
    return extractDocumentImageThumbnails(resultData);
  }
  if (toolName === 'ReadImage') {
    const resultThumbnails = resultData
      ? extractReadImageThumbnails(resultData, attachments, perceptionCards)
      : [];
    return resultThumbnails.length > 0 ? resultThumbnails : extractReadImageThumbnails(args);
  }

  return [];
}

function formatDocumentImageReferenceJson(input: {
  readonly filePath: string;
  readonly source?: DocumentSourceRef;
  readonly path: string;
  readonly src?: string;
  readonly index: number;
  readonly width?: number;
  readonly height?: number;
  readonly byteSize?: number;
  readonly mimeType?: string;
  readonly locator?: DocumentLocator;
  readonly contentLocator?: ContentLocator;
  readonly representationLocator?: ContentRepresentationLocator;
  readonly displayPath?: string;
}): string {
  return JSON.stringify(
    {
      kind: 'document-image-reference',
      document: {
        filePath: input.filePath,
        ...(input.source ? { source: input.source } : {}),
        ...(input.locator ? { locator: input.locator } : {}),
        ...(input.contentLocator ? { contentLocator: input.contentLocator } : {}),
        ...(input.representationLocator
          ? { representationLocator: input.representationLocator }
          : {}),
      },
      image: {
        index: input.index,
        ...(input.width !== undefined ? { width: input.width } : {}),
        ...(input.height !== undefined ? { height: input.height } : {}),
        ...(input.byteSize !== undefined ? { byteSize: input.byteSize } : {}),
        ...(input.mimeType ? { mimeType: input.mimeType } : {}),
        ...(input.contentLocator ? { contentLocator: input.contentLocator } : {}),
        ...(input.representationLocator
          ? { representationLocator: input.representationLocator }
          : {}),
      },
      ...(input.displayPath
        ? {
            display: {
              runtimeOnly: true,
              path: input.displayPath,
            },
          }
        : {}),
    },
    null,
    2,
  );
}

function parseStableContentLocator(value: unknown): ContentLocator | undefined {
  const result = validateContentLocator(value);
  return result.ok ? result.locator : undefined;
}

function extractToolContentLocator(value: unknown): ContentLocator | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  return (
    parseStableContentLocator(record.contentLocator) ??
    parseStableContentLocator(asRecord(record.assetRef)?.contentLocator) ??
    parseStableContentLocator(asRecord(record.output)?.contentLocator)
  );
}

function describeContentLocatorForDisplay(locator: ContentLocator): {
  readonly filePath: string;
  readonly path: string;
} {
  switch (locator.kind) {
    case 'document-entry':
      return { filePath: serializeContentReferenceTarget(locator.source), path: locator.entryPath };
    case 'workspace-file':
      return { filePath: locator.path, path: locator.path };
    case 'generated-output':
      return { filePath: locator.path, path: locator.path };
    case 'package-resource':
      return {
        filePath: locator.manifestPath ?? `${locator.packageId}@${locator.revision}`,
        path: locator.resourcePath,
      };
  }
}

function extractToolFilePath(data: unknown): string | null {
  const obj = asRecord(data);
  if (!obj) return null;

  for (const field of ['path', 'filePath', 'file_path', 'file', 'filename']) {
    const value = obj[field];
    if (typeof value === 'string' && isFilePath(value)) {
      return value;
    }
  }
  return null;
}

function extractToolPreviewDescriptors(
  data: unknown,
  contentKind: PreviewContentKind,
): PreviewMediaDescriptor[] {
  const descriptors = new Map<string, PreviewMediaDescriptor>();
  collectPreviewDescriptors(data, new WeakSet<object>(), (candidate) => {
    try {
      const descriptor = parsePreviewMediaDescriptor(candidate);
      if (descriptor.contentKind === contentKind)
        descriptors.set(descriptor.descriptorId, descriptor);
    } catch {
      // Invalid individual projections remain local to their result item.
    }
  });
  return [...descriptors.values()];
}

function collectPreviewDescriptors(
  value: unknown,
  visited: WeakSet<object>,
  collect: (value: unknown) => void,
): void {
  if (!value || typeof value !== 'object' || visited.has(value)) return;
  visited.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectPreviewDescriptors(item, visited, collect);
    return;
  }
  const record = asRecord(value);
  if (!record) return;
  if ('previewDescriptor' in record) collect(record.previewDescriptor);
  for (const child of Object.values(record)) collectPreviewDescriptors(child, visited, collect);
}

function extractToolCopyText(toolName: string, data: unknown): string | null {
  if (toolName !== 'ReadDocument') return null;
  return formatReadDocumentCopyText(data);
}

function isImageGenerationTool(toolName: string): boolean {
  return isOneOf(toolName.toLowerCase(), IMAGE_GENERATION_TOOLS);
}

function isVideoGenerationTool(toolName: string): boolean {
  return isOneOf(toolName.toLowerCase(), VIDEO_GENERATION_TOOLS);
}

function isAudioGenerationTool(toolName: string): boolean {
  return isOneOf(toolName.toLowerCase(), AUDIO_GENERATION_TOOLS);
}

function isGenerationTool(toolName: string): boolean {
  return (
    isImageGenerationTool(toolName) ||
    isVideoGenerationTool(toolName) ||
    isAudioGenerationTool(toolName)
  );
}

function isFileTool(toolName: string): boolean {
  return isOneOf(toolName, FILE_TOOLS);
}

function formatReadDocumentCopyText(data: unknown): string | null {
  const result = asRecord(data);
  if (!result) return null;

  const lines: string[] = [];
  const filePath = extractDocumentFilePath(result);
  if (filePath) lines.push(`Document: ${filePath}`);

  const locator = parseDocumentLocator(result.locator);
  if (locator) lines.push(`Location: ${formatDocumentLocator(locator)}`);

  const text = readString(result, 'text');
  if (text) lines.push(text);

  const thumbnails = extractDocumentImageThumbnails(data);
  if (thumbnails.length > 0) {
    lines.push(
      ...thumbnails.map((thumbnail) => {
        const dimensions = formatDimensions(thumbnail.width, thumbnail.height);
        const byteSize = formatByteSize(thumbnail.byteSize);
        return [
          thumbnail.label,
          dimensions,
          byteSize,
          thumbnail.contentLocator?.kind === 'document-entry'
            ? thumbnail.contentLocator.entryPath
            : undefined,
        ]
          .filter(Boolean)
          .join(' · ');
      }),
    );
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

function formatDocumentLocator(locator: DocumentLocator): string {
  switch (locator.kind) {
    case 'page':
      return `page:${locator.pageNumber}`;
    case 'region':
      return `page:${locator.pageNumber}:region`;
    case 'chapter':
      return locator.spineIndex !== undefined
        ? `chapter:${locator.chapterHref}@${locator.spineIndex}`
        : `chapter:${locator.chapterHref}`;
    case 'slide':
      return `slide:${locator.slideNumber}`;
    case 'text-range':
      if (locator.startLine !== undefined || locator.endLine !== undefined) {
        return `lines:${locator.startLine ?? '?'}-${locator.endLine ?? '?'}`;
      }
      return `chars:${locator.startChar ?? '?'}-${locator.endChar ?? '?'}`;
  }
}

function formatDimensions(width: number | undefined, height: number | undefined): string {
  return width !== undefined && height !== undefined ? `${width} x ${height}` : '';
}

function formatByteSize(byteSize: number | undefined): string {
  if (byteSize === undefined) return '';
  if (byteSize < 1024) return `${byteSize} B`;
  if (byteSize < 1024 * 1024) return `${Math.round(byteSize / 1024)} KB`;
  return `${(byteSize / 1024 / 1024).toFixed(1)} MB`;
}

function isFilePath(value: string): boolean {
  if (!value) return false;
  if (isAbsolutePath(value)) return true;
  return /\.\w{1,10}$/.test(value) && !value.includes('://');
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value);
}

function readString(obj: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = obj?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readFiniteNumber(
  obj: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = obj?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readProgressPercent(
  obj: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = obj?.[key];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
    ? value
    : undefined;
}

function readStringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

function readRecordArray(
  obj: Record<string, unknown> | undefined,
  key: string,
): readonly Record<string, unknown>[] {
  const value = obj?.[key];
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const record = asRecord(item);
        return record ? [record] : [];
      })
    : [];
}

function readDiagnosticSeverity(value: unknown): 'info' | 'warning' | 'error' {
  return value === 'info' || value === 'warning' || value === 'error' ? value : 'error';
}

function isPresentString(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

function sanitizeToolResultData(data: unknown): unknown {
  return stripRuntimeOnlyResultFields(data, new WeakSet<object>());
}

function stripRuntimeOnlyResultFields(value: unknown, seen: WeakSet<object>): unknown {
  if (!value || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return undefined;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value
      .map((item) => stripRuntimeOnlyResultFields(item, seen))
      .filter((item): item is unknown => item !== undefined);
  }

  const record = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    if (isRuntimeOnlyResultField(key)) {
      continue;
    }
    const sanitizedChild = stripRuntimeOnlyResultFields(child, seen);
    if (sanitizedChild !== undefined) {
      sanitized[key] = sanitizedChild;
    }
  }
  return sanitized;
}

function isRuntimeOnlyResultField(key: string): boolean {
  return (
    key === 'localPath' ||
    key === 'localPaths' ||
    key === 'renderUri' ||
    key === 'renderUris' ||
    key === 'previewDescriptor'
  );
}

function extractDocumentFilePath(result: Record<string, unknown>): string | null {
  const source = asRecord(result.source);
  return (
    readString(result, 'filePath') ??
    readString(result, 'file_path') ??
    readString(source, 'filePath') ??
    readString(source, 'file_path') ??
    null
  );
}

function formatDocumentThumbnailLabel(locator: DocumentLocator | undefined, index: number): string {
  if (!locator) return `#${index + 1}`;
  if (locator.kind === 'page' || locator.kind === 'region') return `P${locator.pageNumber}`;
  if (locator.kind === 'chapter') {
    return locator.spineIndex !== undefined ? `C${locator.spineIndex + 1}` : `C${index + 1}`;
  }
  if (locator.kind === 'slide') return `S${locator.slideNumber}`;
  return `#${index + 1}`;
}

function isOneOf<T extends readonly string[]>(value: string, values: T): boolean {
  return values.includes(value as T[number]);
}
