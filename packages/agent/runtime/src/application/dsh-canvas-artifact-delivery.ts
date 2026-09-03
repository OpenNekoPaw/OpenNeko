import type { DshAcpProjectedEvent } from '../acp/dsh-acp-projection';
import type { AgentConversationContext } from '@neko/agent-contracts';
import type { CanvasWorkspaceTurnTarget } from '@neko/canvas-domain';
import { DOCUMENT_DSH_TOOL_NAME, decodeDocumentDshToolArgs } from '@neko/content-domain/document';
import {
  CONTENT_IMAGE_DSH_TOOL_NAME,
  CONTENT_IMAGES_DSH_TOOL_NAME,
  contentLocatorKey,
  decodeContentImageDshToolSource,
  decodeContentImagesDshToolInput,
  isWorkspaceFileContentLocator,
  type ContentLocator,
  type WorkspaceFileContentLocator,
} from '@neko/content-domain';
import { hashStableValue } from '@neko/shared';
import { posix as path } from 'node:path';

const DSH_TEXT_WRITE_TOOL_NAME = 'write';
const PORTABLE_TEXT_EXTENSIONS = new Set([
  '.ass',
  '.csv',
  '.fountain',
  '.htm',
  '.html',
  '.json',
  '.markdown',
  '.md',
  '.srt',
  '.ssa',
  '.tsv',
  '.txt',
  '.vtt',
  '.yaml',
  '.yml',
]);

export type DshCanvasArtifact = DshCanvasArtifactResourceArtifact;

type DshCanvasArtifactResourceArtifact = {
  readonly kind: 'file-reference' | 'image';
  readonly artifactId: string;
  readonly contentFingerprint: string;
  readonly role: 'source' | 'output';
  readonly title: string;
  readonly sourceId: string;
  readonly sourceArtifactIds?: readonly string[];
  readonly contentLocator: ContentLocator;
};

export interface DshCanvasArtifactBatch {
  readonly turn: number;
  readonly createdAt: number;
  readonly artifacts: readonly DshCanvasArtifactResourceArtifact[];
}

export interface DshCanvasArtifactCollectionDiagnostic {
  readonly code:
    | 'DSH_CANVAS_ARTIFACT_CONTENT_TOOL_PROJECTION_INVALID'
    | 'DSH_CANVAS_ARTIFACT_TEXT_WRITE_PROJECTION_INVALID';
  readonly toolCallId: string;
  readonly toolName: string;
  readonly message: string;
}

export interface DshCanvasArtifactCollection {
  readonly batch?: DshCanvasArtifactBatch;
  readonly diagnostics: readonly DshCanvasArtifactCollectionDiagnostic[];
}

export interface DshCompletedTextWriteReference {
  readonly toolCallId: string;
  readonly title: string;
  readonly contentLocator: WorkspaceFileContentLocator;
}

export interface DshCanvasArtifactDeliveryInput {
  readonly workspaceId: string;
  readonly conversationId: string;
  readonly dshSessionId: string;
  readonly turn: number;
  readonly createdAt: number;
  readonly canvasTurnTarget: CanvasWorkspaceTurnTarget;
  readonly delivery: { readonly kind: 'completed-tool'; readonly toolCallId: string };
  readonly artifacts: readonly DshCanvasArtifact[];
}

export type DshCanvasArtifactDeliveryOutcome =
  | { readonly status: 'accepted' }
  | {
      readonly status: 'blocked';
      readonly diagnostic: { readonly code: string; readonly message: string };
    };

export interface DshCanvasArtifactDeliveryPort {
  deliver(input: DshCanvasArtifactDeliveryInput): Promise<DshCanvasArtifactDeliveryOutcome>;
}

export interface DshCanvasArtifactCompletedToolDeliveryInput {
  readonly conversationId: string;
  readonly dshSessionId: string;
  readonly toolCallId: string;
  readonly events: readonly DshAcpProjectedEvent[];
  readonly canvasTurnTarget?: CanvasWorkspaceTurnTarget;
}

export interface DshCanvasArtifactDeliveryService {
  deliverCompletedTool(
    input: DshCanvasArtifactCompletedToolDeliveryInput,
  ): Promise<DshCanvasArtifactDeliveryOutcome | undefined>;
}

/** Owns completed Tool resource projection to an explicitly admitted Canvas target. */
export function createDshCanvasArtifactDeliveryService(options: {
  readonly contexts: {
    readContext(conversationId: string): Promise<AgentConversationContext | undefined>;
  };
  readonly delivery: DshCanvasArtifactDeliveryPort;
  readonly diagnostics: {
    report(diagnostic: DshCanvasArtifactCollectionDiagnostic): void;
  };
}): DshCanvasArtifactDeliveryService {
  return Object.freeze({
    async deliverCompletedTool(input: DshCanvasArtifactCompletedToolDeliveryInput) {
      const context = await options.contexts.readContext(input.conversationId);
      if (context?.kind !== 'workspace' && context?.kind !== 'authoring') return undefined;
      const collection = collectDshCanvasArtifactCompletedToolArtifacts({
        events: input.events,
        toolCallId: input.toolCallId,
      });
      for (const diagnostic of collection.diagnostics) options.diagnostics.report(diagnostic);
      const batch = collection.batch;
      if (batch === undefined) return undefined;
      const canvasTurnTarget = resolveTurnTarget(context, input.canvasTurnTarget);
      return options.delivery.deliver({
        workspaceId: context.workspaceId,
        conversationId: input.conversationId,
        dshSessionId: input.dshSessionId,
        turn: batch.turn,
        createdAt: batch.createdAt,
        canvasTurnTarget,
        delivery: { kind: 'completed-tool', toolCallId: input.toolCallId },
        artifacts: batch.artifacts,
      });
    },
  });
}

/** Collects resource artifacts for one exact completed Tool call. */
export function collectDshCanvasArtifactCompletedToolArtifacts(input: {
  readonly events: readonly DshAcpProjectedEvent[];
  readonly toolCallId: string;
}): DshCanvasArtifactCollection {
  const diagnostics: DshCanvasArtifactCollectionDiagnostic[] = [];
  const event = [...input.events]
    .reverse()
    .find((candidate) => candidate.kind === 'tool' && candidate.toolCallId === input.toolCallId);
  if (event?.kind !== 'tool' || event.status !== 'completed' || !isSupportedArtifactTool(event)) {
    return { diagnostics };
  }
  try {
    if (event.turnStartedAt === undefined) {
      throw new Error(`DSH Tool '${input.toolCallId}' has no projected turn start.`);
    }
    const artifacts = deduplicateResources(collectToolArtifacts(event));
    if (artifacts.length === 0) return { diagnostics };
    return {
      batch: { turn: event.turn, createdAt: event.turnStartedAt, artifacts },
      diagnostics,
    };
  } catch (error) {
    diagnostics.push(contentToolDiagnostic(event, error));
    return { diagnostics };
  }
}

export function collectDshCompletedTextWriteReference(input: {
  readonly events: readonly DshAcpProjectedEvent[];
  readonly toolCallId: string;
}): DshCompletedTextWriteReference | undefined {
  const collection = collectDshCanvasArtifactCompletedToolArtifacts(input);
  const outputs =
    collection.batch?.artifacts.filter(
      (artifact) => artifact.kind === 'file-reference' && artifact.role === 'output',
    ) ?? [];
  if (outputs.length === 0) return undefined;
  if (outputs.length !== 1) {
    throw new Error(`DSH Tool '${input.toolCallId}' projected multiple text write references.`);
  }
  const output = outputs[0];
  if (output === undefined || !isWorkspaceFileContentLocator(output.contentLocator)) {
    throw new Error(
      `DSH Tool '${input.toolCallId}' projected a non-Workspace text write reference.`,
    );
  }
  return {
    toolCallId: input.toolCallId,
    title: output.title,
    contentLocator: output.contentLocator,
  };
}

function resolveTurnTarget(
  context: Extract<AgentConversationContext, { readonly kind: 'workspace' | 'authoring' }>,
  target: CanvasWorkspaceTurnTarget | undefined,
): CanvasWorkspaceTurnTarget {
  if (target === undefined) {
    throw new Error('Workspace DSH turn has no admitted Canvas target.');
  }
  if (target.workspaceId !== context.workspaceId) {
    throw new Error('DSH turn Canvas target does not match the Conversation Workspace.');
  }
  return target;
}

function collectToolArtifacts(
  event: Extract<DshAcpProjectedEvent, { readonly kind: 'tool' }>,
): readonly DshCanvasArtifactResourceArtifact[] {
  let locator: ContentLocator;
  if (event.title === DSH_TEXT_WRITE_TOOL_NAME) {
    locator = {
      file: { authority: 'workspace', path: decodePortableTextWritePath(event.rawInput) },
    };
    return [createResourceArtifact(locator, 'file-reference', [], 'output')];
  } else if (event.title === DOCUMENT_DSH_TOOL_NAME) {
    locator = decodeDocumentDshToolArgs(event.rawInput).input.source;
    return [createResourceArtifact({ file: locator.file }, 'file-reference')];
  } else if (event.title === CONTENT_IMAGE_DSH_TOOL_NAME) {
    const rawInput = requireRecord(event.rawInput, `${CONTENT_IMAGE_DSH_TOOL_NAME} input`);
    locator = decodeContentImageDshToolSource(rawInput['source']);
    return createLocatedImageSourceArtifacts(locator);
  } else if (event.title === CONTENT_IMAGES_DSH_TOOL_NAME) {
    return decodeContentImagesDshToolInput(event.rawInput).sources.flatMap((source) =>
      createLocatedImageSourceArtifacts(source),
    );
  } else {
    return [];
  }
}

function createLocatedImageSourceArtifacts(
  locator: ContentLocator,
): readonly DshCanvasArtifactResourceArtifact[] {
  if (locator.selector === undefined) return [createResourceArtifact(locator, 'image')];
  const parent = createResourceArtifact({ file: locator.file }, 'file-reference');
  return [parent, createResourceArtifact(locator, 'image', [parent.artifactId])];
}

function deduplicateResources(
  artifacts: readonly DshCanvasArtifactResourceArtifact[],
): readonly DshCanvasArtifactResourceArtifact[] {
  const sources = new Map<string, DshCanvasArtifactResourceArtifact>();
  for (const artifact of artifacts) {
    const identity = contentLocatorKey(artifact.contentLocator);
    const existing = sources.get(identity);
    if (existing === undefined) {
      sources.set(identity, artifact);
      continue;
    }
    const preferred =
      existing.kind === 'file-reference' && artifact.kind === 'image' ? artifact : existing;
    const sourceArtifactIds = [
      ...new Set([...(existing.sourceArtifactIds ?? []), ...(artifact.sourceArtifactIds ?? [])]),
    ];
    sources.set(
      identity,
      sourceArtifactIds.length > 0 ? { ...preferred, sourceArtifactIds } : preferred,
    );
  }
  return [...sources.values()];
}

function isSupportedArtifactTool(
  event: Extract<DshAcpProjectedEvent, { readonly kind: 'tool' }>,
): event is Extract<DshAcpProjectedEvent, { readonly kind: 'tool' }> & { readonly title: string } {
  return (
    event.title === DSH_TEXT_WRITE_TOOL_NAME ||
    event.title === DOCUMENT_DSH_TOOL_NAME ||
    event.title === CONTENT_IMAGE_DSH_TOOL_NAME ||
    event.title === CONTENT_IMAGES_DSH_TOOL_NAME
  );
}

function contentToolDiagnostic(
  event: Extract<DshAcpProjectedEvent, { readonly kind: 'tool' }> & { readonly title: string },
  error: unknown,
): DshCanvasArtifactCollectionDiagnostic {
  return {
    code:
      event.title === DSH_TEXT_WRITE_TOOL_NAME
        ? 'DSH_CANVAS_ARTIFACT_TEXT_WRITE_PROJECTION_INVALID'
        : 'DSH_CANVAS_ARTIFACT_CONTENT_TOOL_PROJECTION_INVALID',
    toolCallId: event.toolCallId,
    toolName: event.title,
    message: error instanceof Error ? error.message : String(error),
  };
}

function createResourceArtifact(
  locator: ContentLocator,
  kind: 'file-reference' | 'image',
  sourceArtifactIds: readonly string[] = [],
  role: 'source' | 'output' = 'source',
): DshCanvasArtifactResourceArtifact {
  const locatorKey = contentLocatorKey(locator);
  const locatorHash = hashStableValue(locatorKey);
  const sourceId = `content:${locatorHash}`;
  return {
    kind,
    artifactId: sourceId,
    contentFingerprint: `locator:${locatorHash}`,
    role,
    title: contentTitle(locator),
    sourceId,
    ...(sourceArtifactIds.length > 0 ? { sourceArtifactIds } : {}),
    contentLocator: locator,
  };
}

function decodePortableTextWritePath(value: unknown): string {
  const input = requireRecord(value, `${DSH_TEXT_WRITE_TOOL_NAME} input`);
  const filePath = input['file_path'];
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error('DSH write input requires one non-empty file_path.');
  }
  const segments = filePath.split('/');
  if (
    filePath.includes('\\') ||
    filePath.includes('\0') ||
    filePath.startsWith('~') ||
    path.isAbsolute(filePath) ||
    path.normalize(filePath) !== filePath ||
    filePath === '..' ||
    filePath.startsWith('../') ||
    segments.some((segment) => segment.length === 0 || segment.includes(':'))
  ) {
    throw new Error('DSH write file_path must be a normalized Workspace-relative path.');
  }
  const extension = path.extname(filePath).toLocaleLowerCase('en-US');
  if (!PORTABLE_TEXT_EXTENSIONS.has(extension)) {
    throw new Error(`DSH write file_path '${filePath}' is not a portable text document.`);
  }
  return filePath;
}

function contentTitle(locator: ContentLocator): string {
  const portablePath =
    locator.selector?.kind === 'entry' ? locator.selector.path : locator.file.path;
  return portablePath.split('/').at(-1) ?? portablePath;
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
