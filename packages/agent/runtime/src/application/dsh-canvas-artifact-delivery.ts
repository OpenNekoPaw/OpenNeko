import { createHash } from 'node:crypto';
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
  type ContentLocator,
} from '@neko/content-domain';
import { hashStableValue } from '@neko/shared';
import {
  resolveWorkspaceGeneratedAssetRelativeDirectory,
  sanitizeGeneratedAssetPathSegment,
} from '@neko/generation-domain';
import {
  createAgentTerminalArtifactAdmission,
  parseAgentTerminalMarkdown,
} from './agent-terminal-markdown';

export type DshCanvasArtifact = DshCanvasArtifactResourceArtifact;

type DshCanvasArtifactResourceArtifact = {
  readonly kind: 'file-reference' | 'image';
  readonly artifactId: string;
  readonly contentFingerprint: string;
  readonly role: 'source' | 'analysis';
  readonly title: string;
  readonly sourceId: string;
  readonly sourceArtifactIds?: readonly string[];
  readonly mimeType?: 'text/markdown';
  readonly contentLocator: ContentLocator;
};

export interface DshCanvasArtifactBatch {
  readonly turn: number;
  readonly createdAt: number;
  readonly artifacts: readonly DshCanvasArtifactResourceArtifact[];
}

export interface DshCanvasArtifactCollectionDiagnostic {
  readonly code: 'DSH_CANVAS_ARTIFACT_CONTENT_TOOL_PROJECTION_INVALID';
  readonly toolCallId: string;
  readonly toolName: string;
  readonly message: string;
}

export interface DshCanvasArtifactCollection {
  readonly batch?: DshCanvasArtifactBatch;
  readonly diagnostics: readonly DshCanvasArtifactCollectionDiagnostic[];
}

export interface DshCanvasArtifactDeliveryInput {
  readonly workspaceId: string;
  readonly conversationId: string;
  readonly dshSessionId: string;
  readonly turn: number;
  readonly createdAt: number;
  readonly canvasTurnTarget: CanvasWorkspaceTurnTarget;
  readonly delivery:
    | { readonly kind: 'completed-tool'; readonly toolCallId: string }
    | { readonly kind: 'completed-turn' };
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

export interface DshCanvasArtifactTerminalDeliveryInput {
  readonly conversationId: string;
  readonly dshSessionId: string;
  readonly turn: number;
  readonly events: readonly DshAcpProjectedEvent[];
  readonly canvasTurnTarget?: CanvasWorkspaceTurnTarget;
}

export interface DshDurableMarkdownArtifactPublicationPort {
  publish(input: {
    readonly workspaceId: string;
    readonly contentLocator: ContentLocator;
    readonly markdown: string;
    readonly contentFingerprint: string;
  }): Promise<{ readonly contentLocator: ContentLocator; readonly contentFingerprint: string }>;
  resolve(input: {
    readonly workspaceId: string;
    readonly contentLocator: ContentLocator;
  }): Promise<{ readonly contentLocator: ContentLocator } | undefined>;
}

export interface DshTerminalMarkdownArtifactReference {
  readonly messageId: string;
  readonly title: string;
  readonly contentLocator: ContentLocator;
}

export interface DshCanvasArtifactDeliveryService {
  deliverCompletedTool(
    input: DshCanvasArtifactCompletedToolDeliveryInput,
  ): Promise<DshCanvasArtifactDeliveryOutcome | undefined>;
  deliverTerminal(
    input: DshCanvasArtifactTerminalDeliveryInput,
  ): Promise<DshCanvasArtifactDeliveryOutcome | undefined>;
  resolveTerminalArtifact(input: {
    readonly conversationId: string;
    readonly dshSessionId: string;
    readonly messageId: string;
    readonly events: readonly DshAcpProjectedEvent[];
  }): Promise<DshTerminalMarkdownArtifactReference | undefined>;
}

/** Owns completed content-Tool source projection and explicit terminal document delivery. */
export function createDshCanvasArtifactDeliveryService(options: {
  readonly contexts: {
    readContext(conversationId: string): Promise<AgentConversationContext | undefined>;
  };
  readonly delivery: DshCanvasArtifactDeliveryPort;
  readonly publication: DshDurableMarkdownArtifactPublicationPort;
  readonly diagnostics: {
    report(diagnostic: DshCanvasArtifactCollectionDiagnostic): void;
  };
}): DshCanvasArtifactDeliveryService {
  return Object.freeze({
    async deliverCompletedTool(input: DshCanvasArtifactCompletedToolDeliveryInput) {
      const context = await options.contexts.readContext(input.conversationId);
      if (context?.kind !== 'workspace') return undefined;
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
    async deliverTerminal(input: DshCanvasArtifactTerminalDeliveryInput) {
      const context = await options.contexts.readContext(input.conversationId);
      if (context?.kind !== 'workspace') return undefined;
      const terminal = input.events.find(
        (event) => event.kind === 'turn' && event.phase === 'end' && event.turn === input.turn,
      );
      if (terminal?.kind !== 'turn' || terminal.phase !== 'end') {
        throw new Error(`DSH Session '${input.dshSessionId}' has no projected terminal turn.`);
      }
      if (!isReviewableTurnEnd(terminal.reason)) return undefined;
      const finalMarkdown = collectFinalAssistantMarkdown(input.events, terminal.turn);
      if (finalMarkdown === undefined) return undefined;
      const result = parseAgentTerminalMarkdown(
        finalMarkdown,
        createAgentTerminalArtifactAdmission(),
      );
      if (result.artifact === undefined) return undefined;
      const artifact = deriveTerminalMarkdownArtifact(result.artifact);
      const canvasTurnTarget = resolveTurnTarget(context, input.canvasTurnTarget);
      const published = await options.publication.publish({
        workspaceId: context.workspaceId,
        contentLocator: artifact.contentLocator,
        markdown: artifact.markdown,
        contentFingerprint: artifact.contentFingerprint,
      });
      assertPublishedTerminalArtifact(artifact, published);
      return options.delivery.deliver({
        workspaceId: context.workspaceId,
        conversationId: input.conversationId,
        dshSessionId: input.dshSessionId,
        turn: terminal.turn,
        createdAt: terminal.completedAt,
        canvasTurnTarget,
        delivery: { kind: 'completed-turn' },
        artifacts: [
          {
            kind: 'file-reference',
            artifactId: `reviewable-markdown:${artifact.artifactHash}`,
            contentFingerprint: published.contentFingerprint,
            role: 'analysis',
            title: artifact.title,
            sourceId: `artifact:reviewable-markdown:${artifact.artifactHash}`,
            mimeType: 'text/markdown',
            contentLocator: published.contentLocator,
          },
        ],
      });
    },
    async resolveTerminalArtifact(
      input: Parameters<DshCanvasArtifactDeliveryService['resolveTerminalArtifact']>[0],
    ) {
      const context = await options.contexts.readContext(input.conversationId);
      if (context?.kind !== 'workspace') return undefined;
      const event = input.events.find(
        (candidate) =>
          candidate.kind === 'message' &&
          candidate.role === 'assistant' &&
          candidate.state === 'final' &&
          candidate.messageId === input.messageId,
      );
      if (event?.kind !== 'message' || event.role !== 'assistant' || event.state !== 'final') {
        throw new Error(
          `DSH Session '${input.dshSessionId}' has no final assistant message '${input.messageId}'.`,
        );
      }
      const terminal = input.events.find(
        (candidate) =>
          candidate.kind === 'turn' && candidate.phase === 'end' && candidate.turn === event.turn,
      );
      if (
        terminal?.kind !== 'turn' ||
        terminal.phase !== 'end' ||
        !isReviewableTurnEnd(terminal.reason)
      ) {
        return undefined;
      }
      const result = parseAgentTerminalMarkdown(event.text, createAgentTerminalArtifactAdmission());
      if (result.artifact === undefined) return undefined;
      const artifact = deriveTerminalMarkdownArtifact(result.artifact);
      const resolved = await options.publication.resolve({
        workspaceId: context.workspaceId,
        contentLocator: artifact.contentLocator,
      });
      if (resolved === undefined) return undefined;
      assertResolvedTerminalArtifact(artifact, resolved);
      return {
        messageId: event.messageId,
        title: artifact.title,
        contentLocator: resolved.contentLocator,
      };
    },
  });
}

interface DerivedTerminalMarkdownArtifact {
  readonly artifactHash: string;
  readonly title: string;
  readonly markdown: string;
  readonly contentFingerprint: string;
  readonly contentLocator: ContentLocator;
}

function deriveTerminalMarkdownArtifact(
  artifact: NonNullable<ReturnType<typeof parseAgentTerminalMarkdown>['artifact']>,
): DerivedTerminalMarkdownArtifact {
  const artifactHash = sha256Digest(
    `${artifact.profile}\0${artifact.title}\0${artifact.markdown}`,
  ).slice(0, 24);
  return {
    artifactHash,
    title: artifact.title,
    markdown: artifact.markdown,
    contentFingerprint: `sha256:${sha256Digest(artifact.markdown)}`,
    contentLocator: createTerminalArtifactContentLocator(artifact.title, artifactHash),
  };
}

function assertPublishedTerminalArtifact(
  expected: DerivedTerminalMarkdownArtifact,
  published: { readonly contentLocator: ContentLocator; readonly contentFingerprint: string },
): void {
  if (contentLocatorKey(published.contentLocator) !== contentLocatorKey(expected.contentLocator)) {
    throw new Error('Durable Markdown publication returned another ContentLocator.');
  }
  if (published.contentFingerprint !== expected.contentFingerprint) {
    throw new Error('Durable Markdown publication returned another content fingerprint.');
  }
}

function assertResolvedTerminalArtifact(
  expected: DerivedTerminalMarkdownArtifact,
  resolved: { readonly contentLocator: ContentLocator },
): void {
  if (contentLocatorKey(resolved.contentLocator) !== contentLocatorKey(expected.contentLocator)) {
    throw new Error('Durable Markdown resolution returned another ContentLocator.');
  }
}

function sha256Digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Collects source artifacts for one exact completed Tool call. */
export function collectDshCanvasArtifactCompletedToolArtifacts(input: {
  readonly events: readonly DshAcpProjectedEvent[];
  readonly toolCallId: string;
}): DshCanvasArtifactCollection {
  const diagnostics: DshCanvasArtifactCollectionDiagnostic[] = [];
  const event = [...input.events]
    .reverse()
    .find((candidate) => candidate.kind === 'tool' && candidate.toolCallId === input.toolCallId);
  if (event?.kind !== 'tool' || event.status !== 'completed' || !isSupportedContentTool(event)) {
    return { diagnostics };
  }
  try {
    if (event.turnStartedAt === undefined) {
      throw new Error(`DSH Tool '${input.toolCallId}' has no projected turn start.`);
    }
    const artifacts = deduplicateResources(collectContentToolSources(event));
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

function resolveTurnTarget(
  context: Extract<AgentConversationContext, { readonly kind: 'workspace' }>,
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

function createTerminalArtifactContentLocator(title: string, artifactHash: string): ContentLocator {
  const stem = sanitizeGeneratedAssetPathSegment(title).slice(0, 80);
  return {
    file: {
      authority: 'workspace',
      path: `${resolveWorkspaceGeneratedAssetRelativeDirectory({ mimeType: 'text/markdown' })}/${stem}-${artifactHash}.md`,
    },
  };
}

function collectFinalAssistantMarkdown(
  events: readonly DshAcpProjectedEvent[],
  turn: number,
): string | undefined {
  return events
    .filter(
      (
        event,
      ): event is Extract<
        DshAcpProjectedEvent,
        { readonly kind: 'message'; readonly role: 'assistant' }
      > =>
        event.kind === 'message' &&
        event.role === 'assistant' &&
        event.turn === turn &&
        event.state === 'final' &&
        event.text.trim().length > 0,
    )
    .sort((left, right) => left.step - right.step)
    .at(-1)
    ?.text.trim();
}

function isReviewableTurnEnd(reason: string | undefined): boolean {
  return !['interrupted', 'max-tokens', 'failed', 'error', 'cancelled'].includes(reason ?? '');
}

function collectContentToolSources(
  event: Extract<DshAcpProjectedEvent, { readonly kind: 'tool' }>,
): readonly DshCanvasArtifactResourceArtifact[] {
  let locator: ContentLocator;
  if (event.title === DOCUMENT_DSH_TOOL_NAME) {
    locator = decodeDocumentDshToolArgs(event.rawInput).input.source;
    return createLocatedSourceArtifacts(locator, 'file-reference');
  } else if (event.title === CONTENT_IMAGE_DSH_TOOL_NAME) {
    const rawInput = requireRecord(event.rawInput, `${CONTENT_IMAGE_DSH_TOOL_NAME} input`);
    locator = decodeContentImageDshToolSource(rawInput['source']);
    return createLocatedSourceArtifacts(locator, 'image');
  } else if (event.title === CONTENT_IMAGES_DSH_TOOL_NAME) {
    return decodeContentImagesDshToolInput(event.rawInput).sources.flatMap((source) =>
      createLocatedSourceArtifacts(source, 'image'),
    );
  } else {
    return [];
  }
}

function createLocatedSourceArtifacts(
  locator: ContentLocator,
  kind: 'file-reference' | 'image',
): readonly DshCanvasArtifactResourceArtifact[] {
  if (locator.selector === undefined) return [createSourceArtifact(locator, kind)];
  const parent = createSourceArtifact({ file: locator.file }, 'file-reference');
  return [parent, createSourceArtifact(locator, kind, [parent.artifactId])];
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

function isSupportedContentTool(
  event: Extract<DshAcpProjectedEvent, { readonly kind: 'tool' }>,
): event is Extract<DshAcpProjectedEvent, { readonly kind: 'tool' }> & { readonly title: string } {
  return (
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
    code: 'DSH_CANVAS_ARTIFACT_CONTENT_TOOL_PROJECTION_INVALID',
    toolCallId: event.toolCallId,
    toolName: event.title,
    message: error instanceof Error ? error.message : String(error),
  };
}

function createSourceArtifact(
  locator: ContentLocator,
  kind: 'file-reference' | 'image',
  sourceArtifactIds: readonly string[] = [],
): DshCanvasArtifactResourceArtifact {
  return createResourceArtifact(locator, kind, 'source', sourceArtifactIds);
}

function createResourceArtifact(
  locator: ContentLocator,
  kind: 'file-reference' | 'image',
  role: 'source' | 'analysis',
  sourceArtifactIds: readonly string[] = [],
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
