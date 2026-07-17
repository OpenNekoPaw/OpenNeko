import type {
  AgentGeneratedArtifactProjection,
  AgentMediaMetadata,
  AgentMediaModality,
  AgentMediaPayload,
  AgentMultimodalEvidenceRef,
  AgentMultimodalEvidenceFeedback,
  AgentMultimodalEvidenceFeedbackPolicy,
  AgentMultimodalHostAdapter,
  AgentMultimodalPacketLinkage,
  AgentToolModalityDeclaration,
} from '@neko-agent/types';
import type {
  ArtifactKind,
  ArtifactRef,
  MultimodalContextPacket,
  PerceptionInputKind,
  PerceptionInputRef,
  ProjectData,
  ProjectObjectRef,
  SelectionRef,
  TimelineElement,
} from '@neko/shared';

export interface CanvasSelectionContextNode {
  readonly nodeId: string;
  readonly type: string;
  readonly summary: string;
  readonly assetUri?: string;
  readonly assetKind?: ArtifactRef['kind'];
  readonly bounds?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

export interface CanvasSelectionContextOptions {
  readonly createdAt?: number;
  readonly userAnnotation?: string;
}

export interface TimelineEditorContextInput {
  readonly content: unknown;
  readonly selectedElementIds: readonly string[];
  readonly selectedTrackId?: string;
  readonly currentTime?: number;
  readonly timeRange?: { readonly start: number; readonly end: number };
  readonly userAnnotation?: string;
  readonly createdAt?: number;
}

export interface TextContextInput {
  readonly text: string;
  readonly label?: string;
  readonly createdAt?: number;
}

export interface MediaAttachmentContextInput {
  readonly id: string;
  readonly uri: string;
  readonly modality: Exclude<AgentMediaModality, 'mixed'>;
  readonly metadata?: AgentMediaMetadata;
  readonly summary?: string;
  readonly createdAt?: number;
}

export interface CombineMultimodalContextPacketsOptions extends AgentMultimodalPacketLinkage {
  readonly id?: string;
  readonly createdAt?: number;
  readonly activePanel?: MultimodalContextPacket['uiContext']['activePanel'];
  readonly userAnnotation?: string;
  readonly evidenceRefs?: readonly AgentMultimodalEvidenceRef[];
}

export interface BuildTurnMultimodalContextPacketInput extends AgentMultimodalPacketLinkage {
  readonly message?: string;
  readonly imageAttachments?: readonly {
    readonly type: 'base64';
    readonly media_type: string;
    readonly data: string;
  }[];
  readonly mediaAttachments?: readonly MediaAttachmentContextInput[];
  readonly timelineContextPacket?: MultimodalContextPacket | null | undefined;
  readonly canvasContextPacket?: MultimodalContextPacket | null | undefined;
  readonly evidenceRefs?: readonly AgentMultimodalEvidenceRef[];
  readonly evidenceFeedback?: readonly AgentMultimodalEvidenceFeedback[];
  readonly evidencePolicy?: AgentMultimodalEvidenceFeedbackPolicy;
  readonly includeEvidence?: boolean;
  readonly createdAt?: number;
}

export interface ToolProducedMultimodalEvidenceInput extends AgentMultimodalPacketLinkage {
  readonly toolCallId: string;
  readonly toolName?: string;
  readonly taskId?: string;
  readonly resultData?: unknown;
  readonly attachments?: readonly {
    readonly type: 'image' | 'audio' | 'video';
    readonly path: string;
    readonly mimeType?: string;
  }[];
  readonly createdAt?: number;
}

export interface TimelineSelectionContextElement {
  readonly elementId: string;
  readonly trackId?: string;
  readonly sourceUri?: string;
  readonly mediaType?: 'video' | 'image' | 'audio' | 'text' | 'unknown';
  readonly startMs?: number;
  readonly durationMs?: number;
  readonly trimStartMs?: number;
  readonly trimEndMs?: number;
  readonly sourceInMs?: number;
  readonly sourceOutMs?: number;
  readonly resourceId?: string;
  readonly engineObjectId?: string;
  readonly lineage?: unknown;
  readonly summary?: string;
}

export interface TimelineSelectionContextOptions {
  readonly createdAt?: number;
  readonly playheadMs?: number;
  readonly rangeStartMs?: number;
  readonly rangeEndMs?: number;
  readonly activeTrackId?: string;
  readonly userAnnotation?: string;
}

export function createTimelineContextPacketFromEditor(
  input: TimelineEditorContextInput,
): MultimodalContextPacket | null {
  const project = asProjectData(input.content);
  const selectedElements = project
    ? resolveTimelineSelection(project, input.selectedElementIds, input.selectedTrackId)
    : input.selectedElementIds.map((elementId) => ({
        elementId,
        ...(input.selectedTrackId ? { trackId: input.selectedTrackId } : {}),
      }));

  return createTimelineSelectionContextPacket(selectedElements, {
    ...(input.createdAt !== undefined ? { createdAt: input.createdAt } : {}),
    ...(input.currentTime !== undefined ? { playheadMs: secondsToMs(input.currentTime) } : {}),
    ...(input.timeRange
      ? {
          rangeStartMs: secondsToMs(input.timeRange.start),
          rangeEndMs: secondsToMs(input.timeRange.end),
        }
      : {}),
    ...(input.selectedTrackId ? { activeTrackId: input.selectedTrackId } : {}),
    ...(input.userAnnotation ? { userAnnotation: input.userAnnotation } : {}),
  });
}

export function createTimelineSelectionContextPacket(
  selectedElements: readonly TimelineSelectionContextElement[],
  options: TimelineSelectionContextOptions = {},
): MultimodalContextPacket | null {
  if (selectedElements.length === 0 && options.rangeStartMs === undefined) {
    return null;
  }

  const createdAt = options.createdAt ?? Date.now();
  const selection = selectedElements.map((element) => toTimelineSelectionRef(element, options));
  const artifactRefs = selectedElements.flatMap(toTimelineArtifactRefs);
  const projectRefs = selectedElements.map(toTimelineProjectObjectRef);
  const perceptionInputs = selectedElements.map((element) =>
    toTimelinePerceptionInputRef(element, options),
  );

  return {
    id: createContextPacketId('timeline'),
    selection,
    artifactRefs,
    projectRefs,
    perceptionInputs,
    uiContext: {
      activePanel: 'timeline',
      selectionIds: selection.map((item) => item.id),
      timeline: {
        ...(options.playheadMs !== undefined ? { playheadMs: options.playheadMs } : {}),
        ...(options.rangeStartMs !== undefined ? { rangeStartMs: options.rangeStartMs } : {}),
        ...(options.rangeEndMs !== undefined ? { rangeEndMs: options.rangeEndMs } : {}),
        ...(options.activeTrackId ? { activeTrackId: options.activeTrackId } : {}),
      },
      ...(options.userAnnotation ? { userAnnotation: options.userAnnotation } : {}),
    },
    createdAt,
  };
}

export function createCanvasSelectionContextPacket(
  selectedNodes: readonly CanvasSelectionContextNode[],
  options: CanvasSelectionContextOptions = {},
): MultimodalContextPacket | null {
  if (selectedNodes.length === 0) {
    return null;
  }

  const createdAt = options.createdAt ?? Date.now();
  const selection = selectedNodes.map(toCanvasSelectionRef);
  const artifactRefs = selectedNodes.flatMap(toCanvasArtifactRefs);
  const projectRefs = selectedNodes.map(toCanvasProjectObjectRef);
  const perceptionInputs = selectedNodes.map(toCanvasPerceptionInputRef);

  return {
    id: createContextPacketId('canvas'),
    selection,
    artifactRefs,
    projectRefs,
    perceptionInputs,
    uiContext: {
      activePanel: 'canvas',
      selectionIds: selection.map((item) => item.id),
      ...(options.userAnnotation ? { userAnnotation: options.userAnnotation } : {}),
    },
    createdAt,
  };
}

export function createTextContextPacket(input: TextContextInput): MultimodalContextPacket | null {
  if (!input.text.trim()) {
    return null;
  }

  const createdAt = input.createdAt ?? Date.now();
  const id = `text-${stableIdPart(input.label ?? 'message')}`;
  return {
    id: createContextPacketId('text'),
    selection: [
      {
        id: `sel-${id}`,
        kind: 'unknown',
        panel: 'unknown',
        metadata: {
          label: input.label ?? 'message',
          text: input.text,
        },
      },
    ],
    artifactRefs: [],
    projectRefs: [],
    perceptionInputs: [
      {
        id: `input-${id}`,
        kind: 'structured-data',
        modality: 'text',
        sourceSelectionId: `sel-${id}`,
        metadata: {
          label: input.label ?? 'message',
          text: input.text,
        },
      },
    ],
    uiContext: {
      activePanel: 'unknown',
      selectionIds: [`sel-${id}`],
      userAnnotation: input.text,
    },
    createdAt,
  };
}

export function createMediaAttachmentContextPacket(
  attachment: MediaAttachmentContextInput,
): MultimodalContextPacket {
  const createdAt = attachment.createdAt ?? Date.now();
  const artifactId = `artifact-attachment-${stableIdPart(attachment.id)}`;
  const selectionId = `sel-attachment-${stableIdPart(attachment.id)}`;
  const inputId = `input-attachment-${stableIdPart(attachment.id)}`;
  const projectObjectId = `attachment-${stableIdPart(attachment.id)}`;

  return {
    id: createContextPacketId('attachment'),
    selection: [
      {
        id: selectionId,
        kind: 'asset',
        panel: 'asset-browser',
        projectObjectId,
        artifactId,
        metadata: {
          attachmentId: attachment.id,
          modality: attachment.modality,
          ...(attachment.summary ? { summary: attachment.summary } : {}),
        },
      },
    ],
    artifactRefs: [
      {
        id: artifactId,
        kind: toAttachmentArtifactKind(attachment.modality),
        uri: attachment.uri,
        ...(attachment.metadata?.mimeType ? { mimeType: attachment.metadata.mimeType } : {}),
        metadata: {
          attachmentId: attachment.id,
          modality: attachment.modality,
          ...(attachment.metadata ?? {}),
        },
      },
    ],
    projectRefs: [
      {
        id: projectObjectId,
        kind: 'asset-record',
        artifactIds: [artifactId],
        metadata: {
          attachmentId: attachment.id,
          modality: attachment.modality,
          ...(attachment.summary ? { summary: attachment.summary } : {}),
        },
      },
    ],
    perceptionInputs: [
      {
        id: inputId,
        kind: toAttachmentPerceptionInputKind(attachment.modality),
        modality:
          attachment.modality === 'document'
            ? 'data'
            : attachment.modality === 'data'
              ? 'data'
              : attachment.modality,
        sourceSelectionId: selectionId,
        artifactId,
        projectObjectId,
        uri: attachment.uri,
        metadata: {
          attachmentId: attachment.id,
          modality: attachment.modality,
          ...(attachment.metadata ?? {}),
        },
      },
    ],
    uiContext: {
      activePanel: 'asset-browser',
      selectionIds: [selectionId],
      ...(attachment.summary ? { userAnnotation: attachment.summary } : {}),
    },
    createdAt,
  };
}

export function combineMultimodalContextPackets(
  packets: readonly (MultimodalContextPacket | null | undefined)[],
  options: CombineMultimodalContextPacketsOptions = {},
): MultimodalContextPacket | null {
  const compactPackets = packets.filter((packet): packet is MultimodalContextPacket =>
    Boolean(packet),
  );
  if (compactPackets.length === 0 && (!options.evidenceRefs || options.evidenceRefs.length === 0)) {
    return null;
  }

  const createdAt = options.createdAt ?? compactPackets[0]?.createdAt ?? Date.now();
  const selection = dedupeById(compactPackets.flatMap((packet) => packet.selection));
  const artifactRefs = dedupeById(compactPackets.flatMap((packet) => packet.artifactRefs));
  const projectRefs = dedupeById(compactPackets.flatMap((packet) => packet.projectRefs));
  const perceptionInputs = dedupeById(compactPackets.flatMap((packet) => packet.perceptionInputs));
  const selectionIds = selection.map((item) => item.id);
  const firstUiContext = compactPackets[0]?.uiContext;

  return {
    id: options.id ?? createContextPacketId('turn'),
    selection,
    artifactRefs,
    projectRefs,
    perceptionInputs,
    uiContext: {
      activePanel: options.activePanel ?? firstUiContext?.activePanel ?? 'unknown',
      selectionIds,
      ...(firstUiContext?.timeline ? { timeline: firstUiContext.timeline } : {}),
      ...(firstUiContext?.viewport ? { viewport: firstUiContext.viewport } : {}),
      ...(options.userAnnotation ? { userAnnotation: options.userAnnotation } : {}),
    },
    createdAt,
    ...(options.conversationId || (options.evidenceRefs && options.evidenceRefs.length > 0)
      ? {
          metadata: {
            ...(options.conversationId ? { conversationId: options.conversationId } : {}),
            ...(options.evidenceRefs ? { evidenceRefs: options.evidenceRefs } : {}),
          },
        }
      : {}),
  } as MultimodalContextPacket;
}

export function buildTurnMultimodalContextPacket(
  input: BuildTurnMultimodalContextPacketInput,
): MultimodalContextPacket | null {
  const createdAt = input.createdAt ?? Date.now();
  const textPacket = input.message
    ? createTextContextPacket({ text: input.message, label: 'user-message', createdAt })
    : null;
  const imagePackets = (input.imageAttachments ?? []).map((attachment, index) =>
    createMediaAttachmentContextPacket({
      id: `image-${index + 1}`,
      uri: `data:${attachment.media_type};base64,${attachment.data}`,
      modality: 'image',
      metadata: {
        mimeType: attachment.media_type,
        uriPolicy: 'data-uri',
        byteSize: estimateBase64ByteSize(attachment.data),
      },
      createdAt,
    }),
  );
  const mediaPackets = (input.mediaAttachments ?? []).map((attachment) =>
    createMediaAttachmentContextPacket({
      ...attachment,
      createdAt: attachment.createdAt ?? createdAt,
    }),
  );
  const feedbackEvidenceRefs = applyEvidenceFeedbackPolicy(
    input.evidenceFeedback ?? [],
    input.evidencePolicy ?? {
      includeEvidence: input.includeEvidence,
    },
  );
  const evidenceRefs =
    input.includeEvidence === false
      ? [...(input.evidenceRefs ?? []), ...feedbackEvidenceRefs].map((evidence) => ({
          ...evidence,
          withheld: true,
          withheldReason: evidence.withheldReason ?? 'policy',
        }))
      : [...(input.evidenceRefs ?? []), ...feedbackEvidenceRefs];

  return combineMultimodalContextPackets(
    [
      textPacket,
      ...imagePackets,
      ...mediaPackets,
      input.timelineContextPacket,
      input.canvasContextPacket,
      ...projectEvidenceFeedbackPackets(input.evidenceFeedback ?? [], createdAt),
    ],
    {
      conversationId: input.conversationId,
      evidenceRefs,
      userAnnotation: input.message,
      createdAt,
    },
  );
}

export function createToolProducedMultimodalEvidenceFeedback(
  input: ToolProducedMultimodalEvidenceInput,
): readonly AgentMultimodalEvidenceFeedback[] {
  const attachmentFeedback = (input.attachments ?? []).map((attachment, index) =>
    createFeedbackFromAttachment(input, attachment, index),
  );
  const structuredFeedback = extractFeedbackFromResultData(input);
  return [...attachmentFeedback, ...structuredFeedback];
}

export function applyEvidenceFeedbackPolicy(
  feedback: readonly AgentMultimodalEvidenceFeedback[],
  policy: AgentMultimodalEvidenceFeedbackPolicy = {},
): readonly AgentMultimodalEvidenceRef[] {
  const includeEvidence = policy.includeEvidence ?? true;
  const allowedModalities = policy.allowedModalities ? new Set(policy.allowedModalities) : null;

  return feedback.map(({ evidence, artifact }) => {
    const modalityAllowed = !allowedModalities || allowedModalities.has(evidence.modality);
    const byteSize = readArtifactByteSize(artifact);
    const exceedsPayloadLimit =
      policy.maxPayloadBytes !== undefined &&
      byteSize !== undefined &&
      byteSize > policy.maxPayloadBytes;
    const withheldReason = !includeEvidence
      ? 'policy'
      : !modalityAllowed
        ? 'unsupported-modality'
        : exceedsPayloadLimit
          ? 'payload-too-large'
          : undefined;

    return {
      ...evidence,
      ...(withheldReason ? { withheld: true, withheldReason } : {}),
    };
  });
}

export function summarizeEvidenceFeedback(
  evidenceRefs: readonly AgentMultimodalEvidenceRef[],
): string {
  const included = evidenceRefs.filter((evidence) => !evidence.withheld);
  const withheld = evidenceRefs.filter((evidence) => evidence.withheld);
  const includedText =
    included.length > 0
      ? included.map((evidence) => `${evidence.id}:${evidence.modality}`).join(', ')
      : 'none';
  const withheldText =
    withheld.length > 0
      ? withheld
          .map(
            (evidence) =>
              `${evidence.id}:${evidence.modality}:${evidence.withheldReason ?? 'policy'}`,
          )
          .join(', ')
      : 'none';
  return `Feedback evidence included: ${includedText}. Feedback evidence withheld: ${withheldText}.`;
}

export function filterToolsByModalityAvailability(
  declarations: readonly AgentToolModalityDeclaration[],
  packet: MultimodalContextPacket | null,
  allowedToolNames: readonly string[],
): readonly string[] {
  const available = new Set(readPacketModalities(packet));
  return allowedToolNames.filter((toolName) => {
    const declaration = declarations.find((item) => item.toolName === toolName);
    if (!declaration?.requiredEvidence || declaration.requiredEvidence.length === 0) {
      return true;
    }
    return declaration.requiredEvidence.every((modality) => available.has(modality));
  });
}

export function projectGeneratedArtifactReference(
  input: AgentGeneratedArtifactProjection,
): Pick<MultimodalContextPacket, 'artifactRefs' | 'projectRefs'> {
  const artifactId = `generated-${stableIdPart(input.id)}`;
  return {
    artifactRefs: [
      {
        id: artifactId,
        kind: toAttachmentArtifactKind(input.type === 'unknown' ? 'data' : input.type),
        uri: input.uri,
        ...(input.mimeType ? { mimeType: input.mimeType } : {}),
        metadata: {
          generatedArtifactId: input.id,
          ...(input.conversationId ? { conversationId: input.conversationId } : {}),
          ...(input.taskId ? { taskId: input.taskId } : {}),
          ...(input.toolCallId ? { toolCallId: input.toolCallId } : {}),
          ...(input.metadata ?? {}),
        },
      },
    ],
    projectRefs: [
      {
        id: `generated-artifact-${stableIdPart(input.id)}`,
        kind: 'asset-record',
        artifactIds: [artifactId],
        metadata: {
          generatedArtifactId: input.id,
          type: input.type,
        },
      },
    ],
  };
}

export async function loadPacketMediaPayloads(
  packet: MultimodalContextPacket,
  adapter: AgentMultimodalHostAdapter,
  options: { readonly maxBytes?: number } = {},
): Promise<readonly Awaited<ReturnType<AgentMultimodalHostAdapter['loadMediaPayload']>>[]> {
  const payloads = await Promise.all(
    packet.artifactRefs.map((artifact) =>
      adapter.loadMediaPayload({
        artifactId: artifact.id,
        uri: artifact.uri,
        modality: toArtifactModality(artifact.kind),
        preferredEncoding: 'base64',
        ...(options.maxBytes !== undefined ? { maxBytes: options.maxBytes } : {}),
      }),
    ),
  );
  return payloads.map((payload, index) =>
    enforcePayloadLimit(payload, packet.artifactRefs[index]?.id, options.maxBytes),
  );
}

function createContextPacketId(
  scope: 'timeline' | 'canvas' | 'text' | 'attachment' | 'turn',
): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `ctx-${scope}-${globalThis.crypto.randomUUID()}`;
  }

  return `ctx-${scope}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function stableIdPart(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'item'
  );
}

function estimateBase64ByteSize(data: string): number {
  const normalized = data.replace(/=+$/g, '');
  return Math.floor((normalized.length * 3) / 4);
}

function dedupeById<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const byId = new Map<string, T>();
  for (const item of items) {
    if (!byId.has(item.id)) {
      byId.set(item.id, item);
    }
  }
  return Array.from(byId.values());
}

function readPacketModalities(
  packet: MultimodalContextPacket | null,
): readonly AgentMediaModality[] {
  if (!packet) return [];
  const modalities = new Set<AgentMediaModality>();
  for (const input of packet.perceptionInputs) {
    modalities.add(input.modality === 'mixed' ? 'mixed' : input.modality);
  }
  for (const evidence of readEvidenceRefs(packet)) {
    if (!evidence.withheld) {
      modalities.add(evidence.modality);
    }
  }
  return Array.from(modalities);
}

function readEvidenceRefs(packet: MultimodalContextPacket): readonly AgentMultimodalEvidenceRef[] {
  const evidenceRefs = packet.metadata?.['evidenceRefs'];
  return Array.isArray(evidenceRefs) ? evidenceRefs.filter(isAgentMultimodalEvidenceRef) : [];
}

function projectEvidenceFeedbackPackets(
  feedback: readonly AgentMultimodalEvidenceFeedback[],
  createdAt: number,
): readonly MultimodalContextPacket[] {
  return feedback.map(({ artifact, evidence }) => {
    const projected = projectGeneratedArtifactReference(artifact);
    return {
      id: createContextPacketId('attachment'),
      selection: [
        {
          id: `sel-feedback-${stableIdPart(evidence.id)}`,
          kind: 'asset',
          panel: 'asset-browser',
          artifactId: projected.artifactRefs[0]?.id,
          metadata: {
            evidenceId: evidence.id,
            modality: evidence.modality,
            ...(evidence.summary ? { summary: evidence.summary } : {}),
          },
        },
      ],
      artifactRefs: projected.artifactRefs,
      projectRefs: projected.projectRefs,
      perceptionInputs: [
        {
          id: evidence.perceptionInputId ?? `input-feedback-${stableIdPart(evidence.id)}`,
          kind: toAttachmentPerceptionInputKind(evidence.modality),
          modality: evidence.modality === 'document' ? 'data' : evidence.modality,
          sourceSelectionId: `sel-feedback-${stableIdPart(evidence.id)}`,
          artifactId: projected.artifactRefs[0]?.id,
          uri: artifact.uri,
          metadata: {
            evidenceId: evidence.id,
            source: evidence.source,
            ...(evidence.summary ? { summary: evidence.summary } : {}),
            ...(artifact.mimeType ? { mimeType: artifact.mimeType } : {}),
            ...(artifact.metadata ?? {}),
          },
        },
      ],
      uiContext: {
        activePanel: 'asset-browser',
        selectionIds: [`sel-feedback-${stableIdPart(evidence.id)}`],
        ...(evidence.summary ? { userAnnotation: evidence.summary } : {}),
      },
      createdAt,
      metadata: {
        evidenceRefs: [evidence],
      },
    };
  });
}

function createFeedbackFromAttachment(
  input: ToolProducedMultimodalEvidenceInput,
  attachment: NonNullable<ToolProducedMultimodalEvidenceInput['attachments']>[number],
  index: number,
): AgentMultimodalEvidenceFeedback {
  const artifactId = `tool-${stableIdPart(input.toolCallId)}-${index + 1}`;
  const modality = attachment.type;
  const artifact: AgentGeneratedArtifactProjection = {
    id: artifactId,
    type: modality,
    uri: attachment.path,
    ...(attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    ...(input.taskId ? { taskId: input.taskId } : {}),
    toolCallId: input.toolCallId,
    metadata: {
      uriPolicy: 'workspace-uri',
      toolName: input.toolName,
    },
  };
  const projected = projectGeneratedArtifactReference(artifact);
  const projectedArtifactId = projected.artifactRefs[0]?.id ?? artifact.id;
  return {
    artifact,
    evidence: {
      id: `evidence-${artifactId}`,
      source: 'tool',
      modality,
      summary: `${input.toolName ?? 'tool'} produced ${modality} artifact ${attachment.path}`,
      artifactId: projectedArtifactId,
      sourceArtifactId: artifact.id,
      perceptionInputId: `input-feedback-evidence-${artifactId}`,
      ...(input.conversationId ? { conversationId: input.conversationId } : {}),
      ...(input.taskId ? { taskId: input.taskId } : {}),
      toolCallId: input.toolCallId,
      metadata: {
        path: attachment.path,
        ...(attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
      },
    },
  };
}

function extractFeedbackFromResultData(
  input: ToolProducedMultimodalEvidenceInput,
): readonly AgentMultimodalEvidenceFeedback[] {
  if (!isRecord(input.resultData)) {
    return [];
  }

  const explicitArtifacts = readArray(input.resultData['artifacts']);
  const explicitEvidence = readArray(input.resultData['evidence']);
  if (explicitArtifacts.length === 0 && explicitEvidence.length === 0) {
    return [];
  }

  return explicitArtifacts.flatMap((candidate, index) => {
    const artifact = normalizeArtifactCandidate(candidate, input, index);
    if (!artifact) {
      return [];
    }
    const projected = projectGeneratedArtifactReference(artifact);
    const evidenceCandidate = explicitEvidence[index];
    const evidence = normalizeEvidenceCandidate(
      evidenceCandidate,
      artifact,
      projected,
      input,
      index,
    );
    return [{ artifact, evidence }];
  });
}

function normalizeArtifactCandidate(
  candidate: unknown,
  input: ToolProducedMultimodalEvidenceInput,
  index: number,
): AgentGeneratedArtifactProjection | null {
  if (!isRecord(candidate)) {
    return null;
  }
  const uri =
    readString(candidate['uri']) ?? readString(candidate['path']) ?? readString(candidate['url']);
  if (!uri) {
    return null;
  }
  const modality = normalizeArtifactType(
    readString(candidate['type']) ?? readString(candidate['modality']),
  );
  return {
    id: readString(candidate['id']) ?? `tool-data-${stableIdPart(input.toolCallId)}-${index + 1}`,
    type: modality,
    uri,
    ...(readString(candidate['mimeType']) ? { mimeType: readString(candidate['mimeType']) } : {}),
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    ...(input.taskId ? { taskId: input.taskId } : {}),
    toolCallId: input.toolCallId,
    metadata: {
      ...readMetadata(candidate['metadata']),
      toolName: input.toolName,
    },
  };
}

function normalizeEvidenceCandidate(
  candidate: unknown,
  artifact: AgentGeneratedArtifactProjection,
  projected: Pick<MultimodalContextPacket, 'artifactRefs' | 'projectRefs'>,
  input: ToolProducedMultimodalEvidenceInput,
  index: number,
): AgentMultimodalEvidenceRef {
  const record = isRecord(candidate) ? candidate : {};
  const modality = normalizeEvidenceModality(readString(record['modality']), artifact.type);
  return {
    id: readString(record['id']) ?? `evidence-${stableIdPart(artifact.id)}-${index + 1}`,
    source: normalizeEvidenceSource(readString(record['source'])),
    modality,
    ...(readString(record['summary']) ? { summary: readString(record['summary']) } : {}),
    artifactId: projected.artifactRefs[0]?.id ?? artifact.id,
    sourceArtifactId: artifact.id,
    perceptionInputId:
      readString(record['perceptionInputId']) ?? `input-feedback-${stableIdPart(artifact.id)}`,
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    ...(input.taskId ? { taskId: input.taskId } : {}),
    toolCallId: input.toolCallId,
    metadata: readMetadata(record['metadata']),
  };
}

function enforcePayloadLimit(
  payload: AgentMediaPayload,
  artifactId: string | undefined,
  maxBytes: number | undefined,
): AgentMediaPayload {
  if (maxBytes === undefined) {
    return payload;
  }
  const byteSize =
    payload.encoding === 'bytes'
      ? payload.data.byteLength
      : payload.encoding === 'base64'
        ? estimateBase64ByteSize(payload.data)
        : undefined;
  if (byteSize !== undefined && byteSize > maxBytes) {
    throw new Error(
      `Media payload${artifactId ? ` ${artifactId}` : ''} exceeds maxBytes (${byteSize} > ${maxBytes})`,
    );
  }
  return payload;
}

function readArtifactByteSize(artifact: AgentGeneratedArtifactProjection): number | undefined {
  return typeof artifact.metadata?.byteSize === 'number' ? artifact.metadata.byteSize : undefined;
}

function isAgentMultimodalEvidenceRef(value: unknown): value is AgentMultimodalEvidenceRef {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as { readonly id?: unknown }).id === 'string' &&
    typeof (value as { readonly modality?: unknown }).modality === 'string',
  );
}

function toAttachmentArtifactKind(
  modality: AgentMediaModality | AgentGeneratedArtifactProjection['type'],
): ArtifactKind {
  switch (modality) {
    case 'image':
      return 'image';
    case 'video':
      return 'video';
    case 'audio':
      return 'audio';
    case 'data':
    case 'document':
    case 'text':
      return 'metadata';
    default:
      return 'unknown';
  }
}

function toAttachmentPerceptionInputKind(modality: AgentMediaModality): PerceptionInputKind {
  switch (modality) {
    case 'image':
      return 'image-file';
    case 'video':
      return 'video-segment';
    case 'audio':
      return 'audio-segment';
    default:
      return 'structured-data';
  }
}

function toArtifactModality(kind: ArtifactKind): AgentMediaModality {
  switch (kind) {
    case 'image':
      return 'image';
    case 'video':
      return 'video';
    case 'audio':
      return 'audio';
    case 'metadata':
      return 'data';
    default:
      return 'data';
  }
}

function normalizeArtifactType(
  value: string | undefined,
): AgentGeneratedArtifactProjection['type'] {
  switch (value) {
    case 'image':
    case 'video':
    case 'audio':
    case 'document':
    case 'data':
      return value;
    default:
      return 'unknown';
  }
}

function normalizeEvidenceModality(
  value: string | undefined,
  defaultType: AgentGeneratedArtifactProjection['type'],
): AgentMediaModality {
  const candidate = value ?? defaultType;
  switch (candidate) {
    case 'text':
    case 'image':
    case 'video':
    case 'audio':
    case 'document':
    case 'data':
    case 'mixed':
      return candidate;
    default:
      return 'data';
  }
}

function normalizeEvidenceSource(value: string | undefined): AgentMultimodalEvidenceRef['source'] {
  switch (value) {
    case 'agent':
    case 'tool':
    case 'user':
    case 'memory':
    case 'engine':
    case 'subagent':
      return value;
    default:
      return 'tool';
  }
}

function readArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readMetadata(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toCanvasSelectionRef(node: CanvasSelectionContextNode): SelectionRef {
  return {
    id: `sel-canvas-${node.nodeId}`,
    kind: 'canvas-node',
    panel: 'canvas',
    projectObjectId: `canvas-node-${node.nodeId}`,
    metadata: {
      nodeId: node.nodeId,
      type: node.type,
      summary: node.summary,
      ...(node.bounds ? { bounds: node.bounds } : {}),
      ...(node.assetUri ? { assetUri: node.assetUri } : {}),
    },
  };
}

function toCanvasArtifactRefs(node: CanvasSelectionContextNode): ArtifactRef[] {
  if (!node.assetUri) {
    return [];
  }

  return [
    {
      id: `artifact-canvas-node-${node.nodeId}`,
      kind: node.assetKind ?? 'unknown',
      uri: node.assetUri,
      metadata: {
        nodeId: node.nodeId,
        type: node.type,
      },
    },
  ];
}

function toCanvasProjectObjectRef(node: CanvasSelectionContextNode): ProjectObjectRef {
  return {
    id: `canvas-node-${node.nodeId}`,
    kind: 'canvas-node',
    artifactIds: node.assetUri ? [`artifact-canvas-node-${node.nodeId}`] : [],
    metadata: {
      nodeId: node.nodeId,
      type: node.type,
      summary: node.summary,
      ...(node.bounds ? { bounds: node.bounds } : {}),
      ...(node.assetUri ? { assetUri: node.assetUri } : {}),
    },
  };
}

function toCanvasPerceptionInputRef(node: CanvasSelectionContextNode): PerceptionInputRef {
  const hasVisualAsset =
    node.assetUri && (node.assetKind === 'image' || node.assetKind === 'video');
  return {
    id: `input-canvas-node-${node.nodeId}`,
    kind: hasVisualAsset ? 'canvas-crop' : 'structured-data',
    modality: hasVisualAsset ? 'image' : 'data',
    sourceSelectionId: `sel-canvas-${node.nodeId}`,
    ...(node.assetUri
      ? { artifactId: `artifact-canvas-node-${node.nodeId}`, uri: node.assetUri }
      : {}),
    projectObjectId: `canvas-node-${node.nodeId}`,
    metadata: {
      nodeId: node.nodeId,
      type: node.type,
      summary: node.summary,
      ...(node.bounds ? { bounds: node.bounds } : {}),
      ...(node.assetKind ? { assetKind: node.assetKind } : {}),
    },
  };
}

function toTimelineSelectionRef(
  element: TimelineSelectionContextElement,
  options: TimelineSelectionContextOptions,
): SelectionRef {
  return {
    id: `sel-timeline-${element.elementId}`,
    kind: 'timeline-clip',
    panel: 'timeline',
    projectObjectId: `timeline-clip-${element.elementId}`,
    ...(element.sourceUri ? { artifactId: `artifact-${element.elementId}` } : {}),
    ...(options.playheadMs !== undefined ? { timeMs: options.playheadMs } : {}),
    ...(options.rangeStartMs !== undefined ? { rangeStartMs: options.rangeStartMs } : {}),
    ...(options.rangeEndMs !== undefined ? { rangeEndMs: options.rangeEndMs } : {}),
    metadata: {
      elementId: element.elementId,
      ...(element.trackId ? { trackId: element.trackId } : {}),
      ...(element.summary ? { summary: element.summary } : {}),
    },
  };
}

function toTimelineArtifactRefs(element: TimelineSelectionContextElement): ArtifactRef[] {
  if (!element.sourceUri) {
    return [];
  }

  return [
    {
      id: `artifact-${element.elementId}`,
      kind: toArtifactKind(element.mediaType),
      uri: element.sourceUri,
      metadata: {
        elementId: element.elementId,
        ...(element.trackId ? { trackId: element.trackId } : {}),
      },
    },
  ];
}

function toTimelineProjectObjectRef(element: TimelineSelectionContextElement): ProjectObjectRef {
  return {
    id: `timeline-clip-${element.elementId}`,
    kind: 'timeline-clip',
    engineObjectId: element.engineObjectId ?? createTimelineEngineObjectId(element),
    artifactIds: element.sourceUri ? [`artifact-${element.elementId}`] : [],
    metadata: {
      elementId: element.elementId,
      ...(element.trackId ? { trackId: element.trackId } : {}),
      ...(element.startMs !== undefined ? { startMs: element.startMs } : {}),
      ...(element.durationMs !== undefined ? { durationMs: element.durationMs } : {}),
      ...(element.trimStartMs !== undefined ? { trimStartMs: element.trimStartMs } : {}),
      ...(element.trimEndMs !== undefined ? { trimEndMs: element.trimEndMs } : {}),
      ...(element.sourceInMs !== undefined ? { sourceInMs: element.sourceInMs } : {}),
      ...(element.sourceOutMs !== undefined ? { sourceOutMs: element.sourceOutMs } : {}),
      ...(element.resourceId ? { resourceId: element.resourceId } : {}),
      ...(element.lineage !== undefined ? { lineage: element.lineage } : {}),
      ...(element.summary ? { summary: element.summary } : {}),
    },
  };
}

function toTimelinePerceptionInputRef(
  element: TimelineSelectionContextElement,
  options: TimelineSelectionContextOptions,
): PerceptionInputRef {
  const isAudio = element.mediaType === 'audio';
  const isVideo = element.mediaType === 'video';
  return {
    id: `input-timeline-${element.elementId}`,
    kind: isAudio ? 'audio-segment' : isVideo ? 'video-frame' : 'structured-data',
    modality: isAudio ? 'audio' : isVideo ? 'image' : 'data',
    sourceSelectionId: `sel-timeline-${element.elementId}`,
    ...(element.sourceUri
      ? { artifactId: `artifact-${element.elementId}`, uri: element.sourceUri }
      : {}),
    projectObjectId: `timeline-clip-${element.elementId}`,
    ...(options.playheadMs !== undefined ? { timeMs: options.playheadMs } : {}),
    ...(options.rangeStartMs !== undefined ? { rangeStartMs: options.rangeStartMs } : {}),
    ...(options.rangeEndMs !== undefined ? { rangeEndMs: options.rangeEndMs } : {}),
    metadata: {
      elementId: element.elementId,
      ...(element.trackId ? { trackId: element.trackId } : {}),
      ...(element.mediaType ? { mediaType: element.mediaType } : {}),
      ...(element.startMs !== undefined ? { startMs: element.startMs } : {}),
      ...(element.durationMs !== undefined ? { durationMs: element.durationMs } : {}),
      ...(element.trimStartMs !== undefined ? { trimStartMs: element.trimStartMs } : {}),
      ...(element.trimEndMs !== undefined ? { trimEndMs: element.trimEndMs } : {}),
      ...(element.sourceInMs !== undefined ? { sourceInMs: element.sourceInMs } : {}),
      ...(element.sourceOutMs !== undefined ? { sourceOutMs: element.sourceOutMs } : {}),
      ...(element.resourceId ? { resourceId: element.resourceId } : {}),
      engineObjectId: element.engineObjectId ?? createTimelineEngineObjectId(element),
      ...(element.lineage !== undefined ? { lineage: element.lineage } : {}),
      ...(element.summary ? { summary: element.summary } : {}),
    },
  };
}

function toArtifactKind(
  mediaType: TimelineSelectionContextElement['mediaType'],
): ArtifactRef['kind'] {
  if (mediaType === 'video' || mediaType === 'image' || mediaType === 'audio') {
    return mediaType;
  }
  return 'metadata';
}

function resolveTimelineSelection(
  project: ProjectData,
  selectedElementIds: readonly string[],
  selectedTrackId?: string,
): TimelineSelectionContextElement[] {
  const selectedIds = new Set(selectedElementIds);
  const elements: TimelineSelectionContextElement[] = [];

  for (const track of project.tracks) {
    if (selectedTrackId && track.id !== selectedTrackId) {
      continue;
    }

    for (const element of track.elements) {
      if (!selectedIds.has(element.id)) {
        continue;
      }

      elements.push(toTimelineSelectionElement(element, track.id));
    }
  }

  return elements;
}

function toTimelineSelectionElement(
  element: TimelineElement,
  trackId: string,
): TimelineSelectionContextElement {
  return {
    elementId: element.id,
    trackId,
    ...readElementSource(element),
    engineObjectId: createTimelineEngineObjectId({ elementId: element.id, trackId }),
    ...readElementEngineMetadata(element),
    startMs: secondsToMs(element.startTime),
    durationMs: secondsToMs(element.duration),
    trimStartMs: secondsToMs(element.trimStart),
    trimEndMs: secondsToMs(element.trimEnd),
    sourceInMs: secondsToMs(element.trimStart),
    sourceOutMs: secondsToMs(element.trimStart + element.duration),
    summary: element.name,
  };
}

function createTimelineEngineObjectId(
  element: Pick<TimelineSelectionContextElement, 'elementId' | 'trackId'>,
): string {
  return element.trackId
    ? `timeline:${element.trackId}:${element.elementId}`
    : `timeline:${element.elementId}`;
}

function readElementEngineMetadata(
  element: TimelineElement,
): Pick<TimelineSelectionContextElement, 'resourceId' | 'lineage'> {
  return {
    ...((element.type === 'media' || element.type === 'audio') && element.resourceId
      ? { resourceId: element.resourceId }
      : {}),
    ...(element.lineage !== undefined ? { lineage: element.lineage } : {}),
  };
}

function readElementSource(
  element: TimelineElement,
): Pick<TimelineSelectionContextElement, 'sourceUri' | 'mediaType'> {
  if (element.type === 'media') {
    return { sourceUri: element.src, mediaType: element.mediaType ?? 'video' };
  }

  if (element.type === 'audio') {
    return { sourceUri: element.src, mediaType: 'audio' };
  }

  return { mediaType: element.type === 'text' ? 'text' : 'unknown' };
}

function asProjectData(value: unknown): ProjectData | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const candidate = value as { readonly tracks?: unknown };
  return Array.isArray(candidate.tracks) ? (value as ProjectData) : null;
}

function secondsToMs(seconds: number): number {
  return Math.round(seconds * 1000);
}
