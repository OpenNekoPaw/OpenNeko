import type {
  ArtifactExecutionSummary,
  ArtifactMediaItem,
  ArtifactResourceRef,
  CompositeArtifact,
  PerceptionCard,
  ResourceRef,
  ToolResultAttachment,
} from '@neko/shared';
import type { AgentArtifactTransferPayload } from '@neko-agent/types';

export type TuiArtifactMediaKind =
  'image' | 'video' | 'audio' | 'document' | 'artifact' | 'unknown';

export interface TuiArtifactReference {
  readonly id: string;
  readonly kind: TuiArtifactMediaKind;
  readonly label?: string;
  readonly ref?: string;
  readonly assetId?: string;
  readonly artifactId?: string;
  readonly taskId?: string;
  readonly toolCallId?: string;
  readonly path?: string;
  readonly dimensions?: string;
  readonly duration?: string;
  readonly probe?: string;
  readonly commands: readonly string[];
  readonly diagnostics: readonly string[];
}

export interface TuiArtifactReferenceFormatOptions {
  readonly workspaceRoot?: string;
}

export function collectTuiArtifactReferences(
  input: {
    readonly attachments?: readonly ToolResultAttachment[];
    readonly perceptionCards?: readonly PerceptionCard[];
    readonly artifacts?: readonly AgentArtifactTransferPayload[];
    readonly taskId?: string;
    readonly toolCallId?: string;
  },
  options: TuiArtifactReferenceFormatOptions = {},
): TuiArtifactReference[] {
  return [
    ...(input.attachments ?? []).map((attachment, index) =>
      referenceFromAttachment(attachment, index, input, options),
    ),
    ...(input.perceptionCards ?? []).map((card) => referenceFromPerceptionCard(card, input)),
    ...(input.artifacts ?? []).flatMap((artifact) =>
      referencesFromArtifactTransfer(artifact, input),
    ),
  ];
}

export function referenceFromAttachment(
  attachment: ToolResultAttachment,
  index: number,
  context: { readonly taskId?: string; readonly toolCallId?: string } = {},
  options: TuiArtifactReferenceFormatOptions = {},
): TuiArtifactReference {
  const assetRef = attachment.assetRef;
  const diagnostics: string[] = [];
  const safePath = formatDurablePath(assetRef?.uri ?? attachment.path, options, diagnostics);
  const assetId = assetRef?.assetId;
  const id = assetId ?? `${attachment.type}-${context.toolCallId ?? 'attachment'}-${index + 1}`;

  return withCommands({
    id,
    kind: attachment.type,
    label: assetRef?.label,
    assetId,
    taskId: context.taskId,
    toolCallId: context.toolCallId,
    path: safePath,
    probe: attachment.mimeType ?? assetRef?.mimeType,
    diagnostics,
    commands: [],
  });
}

export function referenceFromPerceptionCard(
  card: PerceptionCard,
  context: { readonly taskId?: string; readonly toolCallId?: string } = {},
): TuiArtifactReference {
  return withCommands({
    id: card.assetId,
    kind: toMediaKind(card.modality),
    assetId: card.assetId,
    taskId: context.taskId,
    toolCallId: context.toolCallId ?? card.sourceToolCallId,
    dimensions: formatDimensions(card.structural.width, card.structural.height),
    duration: formatDurationMs(card.structural.durationMs),
    probe: [
      card.structural.mimeType,
      card.structural.format,
      card.structural.frameRate ? `${card.structural.frameRate}fps` : undefined,
      card.structural.channels ? `${card.structural.channels}ch` : undefined,
      card.structural.sampleRate ? `${card.structural.sampleRate}Hz` : undefined,
    ]
      .filter(Boolean)
      .join(' '),
    diagnostics: [],
    commands: [],
  });
}

function referencesFromArtifactTransfer(
  artifact: AgentArtifactTransferPayload,
  context: { readonly taskId?: string; readonly toolCallId?: string } = {},
): TuiArtifactReference[] {
  switch (artifact.type) {
    case 'artifactSnapshot':
    case 'artifactBackfill':
      return [referenceFromCompositeArtifact(artifact.artifact, context)];
    case 'artifactBlockPage':
      return [
        withCommands({
          id: artifact.artifactId,
          kind: 'artifact',
          artifactId: artifact.artifactId,
          taskId: context.taskId,
          toolCallId: context.toolCallId,
          probe: `${artifact.blocks.length} blocks${artifact.complete ? ' complete' : ''}`,
          diagnostics: [],
          commands: [],
        }),
      ];
    case 'artifactExecutionSummary':
      return referencesFromExecutionSummary(artifact.summary, context);
  }
}

function referenceFromCompositeArtifact(
  artifact: CompositeArtifact,
  context: { readonly taskId?: string; readonly toolCallId?: string } = {},
): TuiArtifactReference {
  const mediaCount = artifact.blocks.reduce((count, block) => {
    if (block.kind === 'media') return count + 1;
    if (block.kind === 'gallery') return count + block.items.length;
    return count;
  }, 0);

  return withCommands({
    id: artifact.artifactId,
    kind: 'artifact',
    label: artifact.title,
    artifactId: artifact.artifactId,
    taskId: context.taskId ?? artifact.provenance?.taskId,
    toolCallId: context.toolCallId ?? artifact.provenance?.toolCallId,
    probe: `${artifact.blocks.length} blocks${mediaCount > 0 ? ` ${mediaCount} media` : ''}`,
    diagnostics: [],
    commands: [],
  });
}

export function referenceFromArtifactMediaItem(
  item: ArtifactMediaItem,
  options: TuiArtifactReferenceFormatOptions = {},
): TuiArtifactReference {
  const diagnostics: string[] = [];
  const resource = extractResourceRef(item.resourceRef);
  const stableRef = formatArtifactResourceRef(item.resourceRef);
  const path = formatDurablePath(readResourcePath(resource), options, diagnostics);
  return withCommands({
    id: item.itemId,
    kind: toMediaKind(item.mediaType),
    label: item.label,
    ref: stableRef,
    assetId: readArtifactAssetId(item.resourceRef),
    path,
    dimensions: formatDimensions(item.width, item.height),
    duration: formatDurationMs(item.durationMs),
    probe: item.mimeType,
    diagnostics,
    commands: [],
  });
}

function referencesFromExecutionSummary(
  summary: ArtifactExecutionSummary,
  context: { readonly taskId?: string; readonly toolCallId?: string },
): TuiArtifactReference[] {
  const refs = [...(summary.createdRefs ?? []), ...(summary.updatedRefs ?? [])];
  if (refs.length === 0) {
    return [
      withCommands({
        id: summary.summaryId,
        kind: 'artifact',
        artifactId: summary.artifactId,
        taskId: context.taskId,
        toolCallId: context.toolCallId,
        probe: `${summary.actionId} ${summary.status}`,
        diagnostics: summary.diagnostics?.map((diagnostic) => diagnostic.message) ?? [],
        commands: [],
      }),
    ];
  }

  return refs.map((ref, index) =>
    withCommands({
      id: readArtifactRefCommandId(ref) ?? `${summary.summaryId}-${index + 1}`,
      kind: 'artifact',
      ref: formatArtifactResourceRef(ref),
      artifactId: summary.artifactId,
      assetId: readArtifactAssetId(ref),
      taskId: context.taskId,
      toolCallId: context.toolCallId,
      probe: `${summary.actionId} ${summary.status}`,
      diagnostics: [],
      commands: [],
    }),
  );
}

function withCommands(reference: TuiArtifactReference): TuiArtifactReference {
  const commandId = reference.assetId ?? reference.artifactId ?? reference.ref ?? reference.id;
  return {
    ...reference,
    commands: [
      `/artifact show ${commandId}`,
      `/artifact open ${commandId}`,
      `/artifact send canvas ${commandId}`,
    ],
  };
}

function formatArtifactResourceRef(ref: ArtifactResourceRef): string {
  switch (ref.kind) {
    case 'resource':
      return formatResourceRef(ref.resource);
    case 'document-entry':
      return `document:${ref.resource.entryPath ?? ref.resource.source.filePath ?? 'entry'}`;
    case 'generated-asset':
      return ref.resourceRef ? formatResourceRef(ref.resourceRef) : `asset:${ref.assetId}`;
    case 'tool-result':
      return `tool:${ref.toolCallId}${ref.taskId ? ` task:${ref.taskId}` : ''}`;
    case 'canvas-node':
      return `canvas:${ref.canvasNodeId}${ref.outputId ? `/${ref.outputId}` : ''}`;
    case 'story-source':
      return `story:${ref.storyId}${ref.sceneId ? `/${ref.sceneId}` : ''}`;
    case 'perception-card':
      return ref.resourceRef ? formatResourceRef(ref.resourceRef) : `perception:${ref.assetId}`;
  }
}

function formatResourceRef(ref: ResourceRef): string {
  return `resource:${ref.provider}:${ref.id}`;
}

function extractResourceRef(ref: ArtifactResourceRef): ResourceRef | undefined {
  switch (ref.kind) {
    case 'resource':
      return ref.resource;
    case 'generated-asset':
    case 'tool-result':
    case 'perception-card':
      return ref.resourceRef;
    default:
      return undefined;
  }
}

function readArtifactAssetId(ref: ArtifactResourceRef): string | undefined {
  switch (ref.kind) {
    case 'generated-asset':
    case 'perception-card':
      return ref.assetId;
    default:
      return undefined;
  }
}

function readArtifactRefCommandId(ref: ArtifactResourceRef): string | undefined {
  return readArtifactAssetId(ref) ?? formatArtifactResourceRef(ref);
}

function readResourcePath(resource: ResourceRef | undefined): string | undefined {
  if (!resource) return undefined;
  return (
    resource.source.projectRelativePath ??
    resource.source.filePath ??
    resource.source.document?.filePath ??
    (resource.locator?.kind === 'file' ? resource.locator.path : undefined)
  );
}

function formatDurablePath(
  value: string | undefined,
  options: TuiArtifactReferenceFormatOptions,
  diagnostics: string[],
): string | undefined {
  if (!value) return undefined;
  if (isPoisonedUri(value)) {
    diagnostics.push(`Omitted non-durable runtime reference: ${redactPath(value)}`);
    return undefined;
  }
  if (isTempOrCachePath(value)) {
    diagnostics.push(`Omitted non-durable temp/cache path: ${redactPath(value)}`);
    return undefined;
  }
  if (options.workspaceRoot && value.startsWith(`${options.workspaceRoot}/`)) {
    return value.slice(options.workspaceRoot.length + 1);
  }
  if (isAbsolutePath(value)) {
    diagnostics.push(`Omitted absolute path without workspace root: ${redactPath(value)}`);
    return undefined;
  }
  return value;
}

function isPoisonedUri(value: string): boolean {
  return (
    value.startsWith('vscode-resource:') ||
    value.startsWith('vscode-webview-resource:') ||
    value.startsWith('blob:') ||
    value.startsWith('file:') ||
    value.startsWith('data:')
  );
}

function isTempOrCachePath(value: string): boolean {
  return (
    /(^|\/)(tmp|temp|var\/folders)\//i.test(value) ||
    /(^|\/)\.neko\/\.cache(\/|$)/i.test(value) ||
    /(^|\/)Library\/Caches(\/|$)/i.test(value)
  );
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value);
}

function redactPath(value: string): string {
  return value.length > 80 ? `${value.slice(0, 77)}...` : value;
}

function toMediaKind(kind: string): TuiArtifactMediaKind {
  if (kind === 'image' || kind === 'video' || kind === 'audio' || kind === 'document') {
    return kind;
  }
  return 'unknown';
}

function formatDimensions(
  width: number | undefined,
  height: number | undefined,
): string | undefined {
  return width && height ? `${width}x${height}` : undefined;
}

function formatDurationMs(durationMs: number | undefined): string | undefined {
  if (durationMs === undefined) return undefined;
  const seconds = durationMs / 1000;
  return `${Number.isInteger(seconds) ? seconds.toFixed(0) : seconds.toFixed(2)}s`;
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
