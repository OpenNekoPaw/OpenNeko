import type { DshAcpProjectedEvent } from '../acp/dsh-acp-projection';
import type { AgentConversationContext } from '@neko/agent-contracts';
import { DOCUMENT_DSH_TOOL_NAME, decodeDocumentDshToolInput } from '@neko/content/document';
import {
  CONTENT_IMAGE_DSH_TOOL_NAME,
  contentLocatorKey,
  decodeContentImageDshToolSource,
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
      const batch = collectDshWorkspaceBoardArtifactBatch({
        events: input.events,
        turn: terminal.turn,
      });
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
export function collectDshWorkspaceBoardArtifactBatch(input: {
  readonly events: readonly DshAcpProjectedEvent[];
  readonly turn: number;
}): DshWorkspaceBoardArtifactBatch | undefined {
  const terminal = input.events.find(
    (event) => event.kind === 'turn' && event.phase === 'end' && event.turn === input.turn,
  );
  if (terminal?.kind !== 'turn' || terminal.phase !== 'end') return undefined;
  if (!isReviewableTurnEnd(terminal.reason)) return undefined;
  if (
    input.events.some(
      (event) =>
        event.kind === 'tool' &&
        event.turn === input.turn &&
        isContentTool(event.title) &&
        event.status !== 'completed',
    )
  ) {
    return undefined;
  }

  const sources = new Map<string, Extract<DshWorkspaceBoardArtifact, { role: 'source' }>>();
  for (const event of input.events) {
    if (event.kind !== 'tool' || event.turn !== input.turn || event.status !== 'completed')
      continue;
    const source = collectContentToolSource(event);
    if (!source) continue;
    const locatorIdentity = contentLocatorKey(source.contentLocator);
    const existing = sources.get(locatorIdentity);
    if (existing === undefined || (existing.kind === 'file-reference' && source.kind === 'image')) {
      sources.set(locatorIdentity, source);
    }
  }
  if (sources.size === 0) return undefined;

  const markdown = collectFinalAssistantMarkdown(input.events, input.turn);
  if (!markdown) return undefined;

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
    turn: input.turn,
    completedAt: terminal.completedAt,
    artifacts: [...orderedSources, analysis],
  };
}

function isContentTool(title: string | undefined): boolean {
  return title === DOCUMENT_DSH_TOOL_NAME || title === CONTENT_IMAGE_DSH_TOOL_NAME;
}

function collectContentToolSource(
  event: Extract<DshAcpProjectedEvent, { readonly kind: 'tool' }>,
): Extract<DshWorkspaceBoardArtifact, { role: 'source' }> | undefined {
  let locator: ContentLocator;
  let kind: 'file-reference' | 'image';
  if (event.title === DOCUMENT_DSH_TOOL_NAME) {
    const rawInput = requireRecord(event.rawInput, `${DOCUMENT_DSH_TOOL_NAME} input`);
    const decoded = decodeDocumentDshToolInput(rawInput['operation'], rawInput['input']);
    locator = decoded.input.source;
    kind = 'file-reference';
  } else if (event.title === CONTENT_IMAGE_DSH_TOOL_NAME) {
    const rawInput = requireRecord(event.rawInput, `${CONTENT_IMAGE_DSH_TOOL_NAME} input`);
    locator = decodeContentImageDshToolSource(rawInput['source']);
    kind = 'image';
  } else {
    return undefined;
  }
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
  const portablePath = locator.selector?.path ?? locator.file.path;
  return portablePath.split('/').at(-1) ?? portablePath;
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}
