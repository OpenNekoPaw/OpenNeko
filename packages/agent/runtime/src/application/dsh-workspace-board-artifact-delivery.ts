import type { DshAcpProjectedEvent } from '../acp/dsh-acp-projection';
import type { AgentConversationContext } from '@neko/agent-contracts';
import { DOCUMENT_DSH_TOOL_NAME, decodeDocumentDshToolArgs } from '@neko/content/document';
import {
  CONTENT_IMAGE_DSH_TOOL_NAME,
  contentLocatorKey,
  decodeContentImageDshToolSource,
  isContentLocator,
  type ContentLocator,
} from '@neko/content';
import { hashStableValue } from '@neko/shared';

export type DshWorkspaceBoardArtifact =
  | {
      readonly kind: 'markdown';
      readonly artifactId: string;
      readonly contentFingerprint: string;
      readonly role: 'analysis';
      readonly title: string;
      readonly sourceId: string;
      readonly sourceArtifactIds: readonly string[];
      readonly markdown: string;
    }
  | {
      readonly kind: 'file-reference' | 'image';
      readonly artifactId: string;
      readonly contentFingerprint: string;
      readonly role: 'source';
      readonly title: string;
      readonly sourceId: string;
      readonly contentLocator: ContentLocator;
    };

export interface DshWorkspaceBoardArtifactBatch {
  readonly turn: number;
  readonly completedAt: number;
  readonly artifacts: readonly DshWorkspaceBoardArtifact[];
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

type DshWorkspaceBoardSourceArtifact = Extract<
  DshWorkspaceBoardArtifact,
  { readonly role: 'source' }
>;

interface CollectedContentToolSource {
  readonly artifact: DshWorkspaceBoardSourceArtifact;
  readonly imageOnlyReplacementLocators: readonly ContentLocator[];
}

export interface DshWorkspaceBoardArtifactDeliveryInput {
  readonly workspaceId: string;
  readonly conversationId: string;
  readonly dshSessionId: string;
  readonly turn: number;
  readonly completedAt: number;
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

export interface DshWorkspaceBoardTerminalDeliveryInput {
  readonly conversationId: string;
  readonly dshSessionId: string;
  readonly events: readonly DshAcpProjectedEvent[];
}

export interface DshWorkspaceBoardTerminalDeliveryService {
  deliverTerminal(
    input: DshWorkspaceBoardTerminalDeliveryInput,
  ): Promise<DshWorkspaceBoardArtifactDeliveryOutcome | undefined>;
}

/**
 * Owns the terminal-turn application workflow. Desktop supplies the exact Conversation context
 * authority and the Canvas delivery port; it does not repeat collection or targeting rules.
 */
export function createDshWorkspaceBoardTerminalDeliveryService(options: {
  readonly contexts: {
    readContext(conversationId: string): Promise<AgentConversationContext | undefined>;
  };
  readonly delivery: DshWorkspaceBoardArtifactDeliveryPort;
  readonly diagnostics: {
    report(diagnostic: DshWorkspaceBoardArtifactCollectionDiagnostic): void;
  };
}): DshWorkspaceBoardTerminalDeliveryService {
  return Object.freeze({
    async deliverTerminal(input: DshWorkspaceBoardTerminalDeliveryInput) {
      const context = await options.contexts.readContext(input.conversationId);
      if (context?.kind !== 'workspace' && context?.kind !== 'authoring') return undefined;
      const terminal = [...input.events]
        .reverse()
        .find((event) => event.kind === 'turn' && event.phase === 'end');
      if (terminal?.kind !== 'turn' || terminal.phase !== 'end') {
        throw new Error(`DSH Session '${input.dshSessionId}' has no projected terminal turn.`);
      }
      const collection = collectDshWorkspaceBoardArtifacts({
        events: input.events,
        turn: terminal.turn,
      });
      for (const diagnostic of collection.diagnostics) options.diagnostics.report(diagnostic);
      const batch = collection.batch;
      if (batch === undefined) return undefined;
      return options.delivery.deliver({
        workspaceId: context.workspaceId,
        conversationId: input.conversationId,
        dshSessionId: input.dshSessionId,
        turn: batch.turn,
        completedAt: batch.completedAt,
        artifacts: batch.artifacts,
      });
    },
  });
}

/**
 * Collects one reviewable batch only after the exact DSH turn has reached a successful terminal
 * projection. Tool events are evidence; they never mutate Canvas directly.
 */
export function collectDshWorkspaceBoardArtifacts(input: {
  readonly events: readonly DshAcpProjectedEvent[];
  readonly turn: number;
}): DshWorkspaceBoardArtifactCollection {
  const diagnostics: DshWorkspaceBoardArtifactCollectionDiagnostic[] = [];
  const terminal = input.events.find(
    (event) => event.kind === 'turn' && event.phase === 'end' && event.turn === input.turn,
  );
  if (terminal?.kind !== 'turn' || terminal.phase !== 'end') return { diagnostics };
  if (!isReviewableTurnEnd(terminal.reason)) return { diagnostics };
  const sources = new Map<string, DshWorkspaceBoardSourceArtifact>();
  const imageOnlyReplacements = new Map<string, readonly ContentLocator[]>();
  for (const event of input.events) {
    if (event.kind !== 'tool' || event.turn !== input.turn || event.status !== 'completed')
      continue;
    if (event.title !== DOCUMENT_DSH_TOOL_NAME && event.title !== CONTENT_IMAGE_DSH_TOOL_NAME) {
      continue;
    }
    let source: CollectedContentToolSource | undefined;
    try {
      source = collectContentToolSource(event);
    } catch (error) {
      diagnostics.push({
        code: 'DSH_WORKSPACE_BOARD_CONTENT_TOOL_PROJECTION_INVALID',
        toolCallId: event.toolCallId,
        toolName: event.title,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    if (!source) continue;
    const locatorIdentity = contentLocatorKey(source.artifact.contentLocator);
    const existing = sources.get(locatorIdentity);
    if (
      existing === undefined ||
      (existing.kind === 'file-reference' && source.artifact.kind === 'image')
    ) {
      sources.set(locatorIdentity, source.artifact);
    }
    if (source.imageOnlyReplacementLocators.length > 0) {
      imageOnlyReplacements.set(locatorIdentity, source.imageOnlyReplacementLocators);
    }
  }
  collapseConsumedImageOnlyDocumentWrappers(sources, imageOnlyReplacements);
  if (sources.size === 0) return { diagnostics };

  const markdown = collectFinalAssistantMarkdown(input.events, input.turn);
  if (!markdown) return { diagnostics };

  const orderedSources = [...sources.values()].sort((left, right) =>
    left.sourceId.localeCompare(right.sourceId),
  );
  const sourceArtifactIds = orderedSources.map((source) => source.artifactId);
  const analysisIdentity = {
    kind: 'content-analysis',
    sourceArtifactIds,
    markdown,
  } as const;
  const analysisHash = hashStableValue(analysisIdentity);
  const analysis: Extract<DshWorkspaceBoardArtifact, { role: 'analysis' }> = {
    kind: 'markdown',
    artifactId: `content-analysis:${analysisHash}`,
    contentFingerprint: `markdown:${hashStableValue(markdown)}`,
    role: 'analysis',
    title: markdownTitle(markdown),
    sourceId: `artifact:content-analysis:${analysisHash}`,
    sourceArtifactIds,
    markdown,
  };
  return {
    batch: {
      turn: input.turn,
      completedAt: terminal.completedAt,
      artifacts: [...orderedSources, analysis],
    },
    diagnostics,
  };
}

function collectContentToolSource(
  event: Extract<DshAcpProjectedEvent, { readonly kind: 'tool' }>,
): CollectedContentToolSource | undefined {
  let locator: ContentLocator;
  let kind: 'file-reference' | 'image';
  let imageOnlyReplacementLocators: readonly ContentLocator[] = [];
  if (event.title === DOCUMENT_DSH_TOOL_NAME) {
    const requested = decodeDocumentDshToolArgs(event.rawInput).input.source;
    const completed = readCompletedDocumentResult(event.rawOutput);
    if (contentLocatorKey(completed.source) !== contentLocatorKey(requested)) {
      throw new Error(
        'Completed openneko.document source does not match the requested ContentLocator.',
      );
    }
    locator = completed.source;
    kind = 'file-reference';
    imageOnlyReplacementLocators = readImageOnlyReplacementLocators(completed.result, locator);
  } else if (event.title === CONTENT_IMAGE_DSH_TOOL_NAME) {
    const rawInput = requireRecord(event.rawInput, `${CONTENT_IMAGE_DSH_TOOL_NAME} input`);
    locator = decodeContentImageDshToolSource(rawInput['source']);
    kind = 'image';
  } else {
    return undefined;
  }
  return {
    artifact: createSourceArtifact(locator, kind),
    imageOnlyReplacementLocators,
  };
}

function createSourceArtifact(
  locator: ContentLocator,
  kind: 'file-reference' | 'image',
): DshWorkspaceBoardSourceArtifact {
  const locatorKey = contentLocatorKey(locator);
  const locatorHash = hashStableValue(locatorKey);
  const sourceId = `content:${locatorHash}`;
  return {
    kind,
    artifactId: sourceId,
    contentFingerprint: `locator:${locatorHash}`,
    role: 'source',
    title: contentTitle(locator),
    sourceId,
    contentLocator: locator,
  };
}

function readCompletedDocumentResult(rawOutput: unknown): {
  readonly source: ContentLocator;
  readonly result: Record<string, unknown>;
} {
  const projected = parseProjectedToolOutput(rawOutput);
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

function collapseConsumedImageOnlyDocumentWrappers(
  sources: Map<string, DshWorkspaceBoardSourceArtifact>,
  replacements: ReadonlyMap<string, readonly ContentLocator[]>,
): void {
  for (const [wrapperIdentity, imageLocators] of replacements) {
    if (imageLocators.length === 0) continue;
    const imageIdentities = imageLocators.map(contentLocatorKey);
    if (
      imageIdentities.every((identity) => {
        const source = sources.get(identity);
        return source?.kind === 'image';
      })
    ) {
      sources.delete(wrapperIdentity);
    }
  }
}

function parseProjectedToolOutput(value: unknown): unknown {
  if (Array.isArray(value)) {
    const text = value.find(
      (item): item is { readonly type: 'text'; readonly text: string } =>
        isRecord(item) && item['type'] === 'text' && typeof item['text'] === 'string',
    )?.text;
    if (text === undefined) return undefined;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error('Completed openneko.document output is not valid JSON.');
    }
  }
  return value;
}

function isContentLocatorValue(value: unknown): value is ContentLocator {
  return isContentLocator(value);
}

function collectFinalAssistantMarkdown(
  events: readonly DshAcpProjectedEvent[],
  turn: number,
): string | undefined {
  const final = events
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
    .at(-1);
  return final?.text.trim();
}

function isReviewableTurnEnd(reason: string | undefined): boolean {
  return (
    reason !== 'interrupted' &&
    reason !== 'max-tokens' &&
    reason !== 'failed' &&
    reason !== 'error' &&
    reason !== 'cancelled'
  );
}

function markdownTitle(markdown: string): string {
  const heading = markdown
    .split(/\r?\n/u)
    .map((line) => /^#{1,6}\s+(.+)$/u.exec(line.trim())?.[1]?.trim())
    .find((value): value is string => value !== undefined && value.length > 0);
  return heading?.slice(0, 160) ?? 'Content Analysis';
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
