import { createHash } from 'node:crypto';
import type { DshAcpProjectedEvent } from '../acp/dsh-acp-projection';
import type { AgentConversationContext } from '@neko/agent-contracts';
import type { CanvasWorkspaceTurnTarget } from '@neko/canvas-domain';
import { DOCUMENT_DSH_TOOL_NAME, decodeDocumentDshToolArgs } from '@neko/content-domain/document';
import {
  CONTENT_IMAGE_DSH_TOOL_NAME,
  contentLocatorKey,
  decodeContentImageDshToolSource,
  isContentLocator,
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

export type DshWorkspaceBoardArtifact = DshWorkspaceBoardResourceArtifact;

type DshWorkspaceBoardResourceArtifact = {
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

export interface DshWorkspaceBoardArtifactBatch {
  readonly turn: number;
  readonly createdAt: number;
  readonly artifacts: readonly DshWorkspaceBoardResourceArtifact[];
}

export interface DshWorkspaceBoardArtifactCollectionDiagnostic {
  readonly code: 'DSH_WORKSPACE_BOARD_CONTENT_TOOL_PROJECTION_INVALID';
  readonly toolCallId: string;
  readonly toolName: string;
  readonly message: string;
}

export interface DshWorkspaceBoardArtifactCollection {
  readonly batch?: DshWorkspaceBoardArtifactBatch;
  readonly diagnostics: readonly DshWorkspaceBoardArtifactCollectionDiagnostic[];
}

export interface DshWorkspaceBoardArtifactDeliveryInput {
  readonly workspaceId: string;
  readonly conversationId: string;
  readonly dshSessionId: string;
  readonly turn: number;
  readonly createdAt: number;
  readonly canvasTurnTarget: CanvasWorkspaceTurnTarget;
  readonly delivery:
    | { readonly kind: 'completed-tool'; readonly toolCallId: string }
    | { readonly kind: 'completed-turn' };
  readonly artifacts: readonly DshWorkspaceBoardArtifact[];
}

export type DshWorkspaceBoardArtifactDeliveryOutcome =
  | { readonly status: 'accepted' }
  | {
      readonly status: 'blocked';
      readonly diagnostic: { readonly code: string; readonly message: string };
    };

export interface DshWorkspaceBoardArtifactDeliveryPort {
  deliver(
    input: DshWorkspaceBoardArtifactDeliveryInput,
  ): Promise<DshWorkspaceBoardArtifactDeliveryOutcome>;
}

export interface DshWorkspaceBoardCompletedToolDeliveryInput {
  readonly conversationId: string;
  readonly dshSessionId: string;
  readonly toolCallId: string;
  readonly events: readonly DshAcpProjectedEvent[];
  readonly canvasTurnTarget?: CanvasWorkspaceTurnTarget;
}

export interface DshWorkspaceBoardTerminalDeliveryInput {
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

export interface DshWorkspaceBoardArtifactDeliveryService {
  deliverCompletedTool(
    input: DshWorkspaceBoardCompletedToolDeliveryInput,
  ): Promise<DshWorkspaceBoardArtifactDeliveryOutcome | undefined>;
  deliverTerminal(
    input: DshWorkspaceBoardTerminalDeliveryInput,
  ): Promise<DshWorkspaceBoardArtifactDeliveryOutcome | undefined>;
  resolveTerminalArtifact(input: {
    readonly conversationId: string;
    readonly dshSessionId: string;
    readonly messageId: string;
    readonly events: readonly DshAcpProjectedEvent[];
  }): Promise<DshTerminalMarkdownArtifactReference | undefined>;
}

/** Owns completed content-Tool source projection and explicit terminal document delivery. */
export function createDshWorkspaceBoardArtifactDeliveryService(options: {
  readonly contexts: {
    readContext(conversationId: string): Promise<AgentConversationContext | undefined>;
  };
  readonly delivery: DshWorkspaceBoardArtifactDeliveryPort;
  readonly publication: DshDurableMarkdownArtifactPublicationPort;
  readonly diagnostics: {
    report(diagnostic: DshWorkspaceBoardArtifactCollectionDiagnostic): void;
  };
}): DshWorkspaceBoardArtifactDeliveryService {
  return Object.freeze({
    async deliverCompletedTool(input: DshWorkspaceBoardCompletedToolDeliveryInput) {
      const context = await options.contexts.readContext(input.conversationId);
      if (context?.kind !== 'workspace') return undefined;
      const collection = collectDshWorkspaceBoardCompletedToolArtifacts({
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
    async deliverTerminal(input: DshWorkspaceBoardTerminalDeliveryInput) {
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
      input: Parameters<DshWorkspaceBoardArtifactDeliveryService['resolveTerminalArtifact']>[0],
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
export function collectDshWorkspaceBoardCompletedToolArtifacts(input: {
  readonly events: readonly DshAcpProjectedEvent[];
  readonly toolCallId: string;
}): DshWorkspaceBoardArtifactCollection {
  const diagnostics: DshWorkspaceBoardArtifactCollectionDiagnostic[] = [];
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
): readonly DshWorkspaceBoardResourceArtifact[] {
  let locator: ContentLocator;
  if (event.title === DOCUMENT_DSH_TOOL_NAME) {
    const requested = decodeDocumentDshToolArgs(event.rawInput).input.source;
    const completed = readCompletedDocumentResult(event.rawOutput);
    if (contentLocatorKey(completed.source) !== contentLocatorKey(requested)) {
      throw new Error(
        'Completed openneko.document source does not match the requested ContentLocator.',
      );
    }
    locator = completed.source;
    const imageLocators = readImageOnlyReplacementLocators(completed.result, locator);
    if (imageLocators.length > 0) {
      const parent = createSourceArtifact({ file: locator.file }, 'file-reference');
      return [
        parent,
        ...imageLocators.map((imageLocator) =>
          createSourceArtifact(imageLocator, 'image', [parent.artifactId]),
        ),
      ];
    }
    return createLocatedSourceArtifacts(locator, 'file-reference');
  } else if (event.title === CONTENT_IMAGE_DSH_TOOL_NAME) {
    const rawInput = requireRecord(event.rawInput, `${CONTENT_IMAGE_DSH_TOOL_NAME} input`);
    locator = decodeContentImageDshToolSource(rawInput['source']);
    return createLocatedSourceArtifacts(locator, 'image');
  } else {
    return [];
  }
}

function createLocatedSourceArtifacts(
  locator: ContentLocator,
  kind: 'file-reference' | 'image',
): readonly DshWorkspaceBoardResourceArtifact[] {
  if (locator.selector === undefined) return [createSourceArtifact(locator, kind)];
  const parent = createSourceArtifact({ file: locator.file }, 'file-reference');
  return [parent, createSourceArtifact(locator, kind, [parent.artifactId])];
}

function deduplicateResources(
  artifacts: readonly DshWorkspaceBoardResourceArtifact[],
): readonly DshWorkspaceBoardResourceArtifact[] {
  const sources = new Map<string, DshWorkspaceBoardResourceArtifact>();
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
  return event.title === DOCUMENT_DSH_TOOL_NAME || event.title === CONTENT_IMAGE_DSH_TOOL_NAME;
}

function contentToolDiagnostic(
  event: Extract<DshAcpProjectedEvent, { readonly kind: 'tool' }> & { readonly title: string },
  error: unknown,
): DshWorkspaceBoardArtifactCollectionDiagnostic {
  return {
    code: 'DSH_WORKSPACE_BOARD_CONTENT_TOOL_PROJECTION_INVALID',
    toolCallId: event.toolCallId,
    toolName: event.title,
    message: error instanceof Error ? error.message : String(error),
  };
}

function createSourceArtifact(
  locator: ContentLocator,
  kind: 'file-reference' | 'image',
  sourceArtifactIds: readonly string[] = [],
): DshWorkspaceBoardResourceArtifact {
  return createResourceArtifact(locator, kind, 'source', sourceArtifactIds);
}

function createResourceArtifact(
  locator: ContentLocator,
  kind: 'file-reference' | 'image',
  role: 'source' | 'analysis',
  sourceArtifactIds: readonly string[] = [],
): DshWorkspaceBoardResourceArtifact {
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

function readCompletedDocumentResult(rawOutput: unknown): {
  readonly source: ContentLocator;
  readonly result: Record<string, unknown>;
} {
  const projected = parseProjectedToolOutput(rawOutput, DOCUMENT_DSH_TOOL_NAME);
  if (!isRecord(projected) || !isContentLocatorValue(projected['source'])) {
    throw new Error('Completed openneko.document output has no canonical source ContentLocator.');
  }
  return { source: projected['source'], result: projected };
}

function readImageOnlyReplacementLocators(
  result: Record<string, unknown>,
  source: ContentLocator,
): readonly ContentLocator[] {
  if (source.selector?.kind !== 'entry') return [];
  const excerpt = result['excerpt'];
  if (!isRecord(excerpt) || excerpt['contentKind'] !== 'image') return [];
  const imageInfo = result['imageInfo'];
  if (!Array.isArray(imageInfo)) return [];
  return imageInfo.flatMap((entry) => {
    if (!isRecord(entry) || !isContentLocatorValue(entry['contentLocator'])) return [];
    const image = entry['contentLocator'];
    if (contentLocatorKey({ file: image.file }) !== contentLocatorKey({ file: source.file })) {
      return [];
    }
    return [image];
  });
}

function parseProjectedToolOutput(value: unknown, toolName: string): unknown {
  if (Array.isArray(value)) {
    const text = value.find(
      (item): item is { readonly type: 'text'; readonly text: string } =>
        isRecord(item) && item['type'] === 'text' && typeof item['text'] === 'string',
    )?.text;
    if (text === undefined) return undefined;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error(`Completed ${toolName} output is not valid JSON.`);
    }
  }
  return value;
}

function isContentLocatorValue(value: unknown): value is ContentLocator {
  return isContentLocator(value);
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
