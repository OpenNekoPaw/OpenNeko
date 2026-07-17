import type {
  ArtifactDiagnostic,
  ArtifactExecutionSummary,
  ArtifactJsonValue,
  CompositeArtifact,
  EntityMemoryContribution,
  ToolResultArtifactTransfer,
  ToolResultBackfillPayload,
} from '@neko/shared';
import { isEntityMemoryContribution } from '@neko/shared';
import type { AgentEvent } from '@neko/agent';
import { extractCompositeContentFenceCandidates } from '@neko-agent/types';

export interface EntityMemoryContributionAutomationDecision {
  readonly kind: string;
  readonly name?: string;
  readonly entityRef?: unknown;
  readonly candidateId?: string;
  readonly reason?: string;
  readonly storyboardCharacterId?: string;
  readonly characterId?: string;
  readonly shotId?: string;
  readonly shotNumber?: number;
  readonly characterIndex?: number;
  readonly sourceRef?: string;
  readonly provenance?: Record<string, unknown>;
}

export interface EntityMemoryContributionAutomationResult {
  readonly contributionId: string;
  readonly decisions: readonly EntityMemoryContributionAutomationDecision[];
}

export interface EntityMemoryContributionAutomationPort {
  processContribution(input: {
    readonly contribution: EntityMemoryContribution;
    readonly toolCallId: string;
    readonly sourceArtifactId?: string;
  }): Promise<EntityMemoryContributionAutomationResult | undefined>;
}

export interface EntityMemoryContributionAutomationLogger {
  warn(message: string, metadata?: Record<string, unknown>): void;
  debug?(message: string, metadata?: Record<string, unknown>): void;
}

export interface ObserveEntityMemoryContributionAutomationInput {
  readonly events: AsyncIterable<AgentEvent>;
  readonly automation?: EntityMemoryContributionAutomationPort;
  readonly now?: () => number;
  readonly logger?: EntityMemoryContributionAutomationLogger;
}

interface ContributionContext {
  readonly contribution: EntityMemoryContribution;
  readonly toolCallId: string;
  readonly sourceArtifactId?: string;
}

const ENTITY_MEMORY_CONTRIBUTION_EXTENSION_KEYS = [
  'neko.entityMemoryContribution',
  'neko.entityMemoryContributionPayload',
] as const;
const MAX_CONTRIBUTION_CANDIDATES_PER_EVENT = 16;
const MAX_CONTRIBUTION_SCAN_DEPTH = 5;

export async function* observeEntityMemoryContributionAutomation(
  input: ObserveEntityMemoryContributionAutomationInput,
): AsyncIterable<AgentEvent> {
  const processed = new Set<string>();
  let accumulatedText = '';

  for await (const event of input.events) {
    if (event.type === 'text' || event.type === 'text_delta') {
      accumulatedText += event.content ?? '';
    }

    yield event;

    if (!input.automation) {
      continue;
    }

    for await (const backfill of processContributionContexts({
      contexts: collectContributionContexts(event),
      processed,
      automation: input.automation,
      now: input.now,
      logger: input.logger,
    })) {
      yield backfill;
    }
  }

  if (input.automation && accumulatedText.length > 0) {
    for await (const backfill of processContributionContexts({
      contexts: collectContributionContextsFromText(accumulatedText),
      processed,
      automation: input.automation,
      now: input.now,
      logger: input.logger,
    })) {
      yield backfill;
    }
  }
}

function collectContributionContexts(event: AgentEvent): readonly ContributionContext[] {
  if (event.type === 'tool_result' && event.toolResult?.toolCallId) {
    return collectContributionContextsFromPayload({
      toolCallId: event.toolResult.toolCallId,
      data: event.toolResult.data,
      artifacts: event.toolResult.artifacts,
    });
  }

  if (event.type === 'tool_result_backfill' && event.toolResultBackfill?.toolCallId) {
    return collectContributionContextsFromPayload({
      toolCallId: event.toolResultBackfill.toolCallId,
      data: event.toolResultBackfill.dataPatch,
      artifacts: event.toolResultBackfill.artifacts,
    });
  }

  return [];
}

function collectContributionContextsFromPayload(input: {
  readonly toolCallId: string;
  readonly data: unknown;
  readonly artifacts?: readonly ToolResultArtifactTransfer[];
}): readonly ContributionContext[] {
  const contexts: ContributionContext[] = [];
  pushContributionContexts(contexts, input.data, {
    toolCallId: input.toolCallId,
  });

  for (const artifactTransfer of input.artifacts ?? []) {
    const artifact = readArtifactFromTransfer(artifactTransfer);
    if (!artifact) {
      continue;
    }
    for (const key of ENTITY_MEMORY_CONTRIBUTION_EXTENSION_KEYS) {
      pushContributionContexts(contexts, artifact.extensions?.[key], {
        toolCallId: input.toolCallId,
        sourceArtifactId: artifact.artifactId,
      });
    }
  }

  return dedupeContributionContexts(contexts);
}

function collectContributionContextsFromText(markdown: string): readonly ContributionContext[] {
  const contexts: ContributionContext[] = [];
  for (const candidate of parseCompositeJsonFenceCandidates(markdown)) {
    const sourceArtifactId = readCompositeArtifactId(candidate);
    for (const contribution of collectEntityMemoryContributions(candidate)) {
      if (!hasClassifiableContribution(contribution)) {
        continue;
      }
      const toolCallId = inferContributionToolCallId(contribution);
      if (!toolCallId) {
        continue;
      }
      contexts.push({
        contribution,
        toolCallId,
        ...(sourceArtifactId ? { sourceArtifactId } : {}),
      });
    }
  }
  return dedupeContributionContexts(contexts);
}

async function* processContributionContexts(input: {
  readonly contexts: readonly ContributionContext[];
  readonly processed: Set<string>;
  readonly automation: EntityMemoryContributionAutomationPort;
  readonly now?: () => number;
  readonly logger?: EntityMemoryContributionAutomationLogger;
}): AsyncIterable<AgentEvent> {
  for (const context of input.contexts) {
    const processKey = `${context.toolCallId}\u0000${context.contribution.contributionId}`;
    if (input.processed.has(processKey)) {
      continue;
    }
    input.processed.add(processKey);

    try {
      const result = await input.automation.processContribution(context);
      if (!result) {
        continue;
      }
      yield createAutomationBackfillEvent({
        context,
        result,
        timestamp: input.now?.() ?? Date.now(),
      });
    } catch (error) {
      input.logger?.warn('Failed to process entity memory contribution automation', {
        contributionId: context.contribution.contributionId,
        toolCallId: context.toolCallId,
        error,
      });
      yield createAutomationFailureBackfillEvent({
        context,
        error,
        timestamp: input.now?.() ?? Date.now(),
      });
    }
  }
}

function pushContributionContexts(
  contexts: ContributionContext[],
  value: unknown,
  source: {
    readonly toolCallId: string;
    readonly sourceArtifactId?: string;
  },
): void {
  for (const contribution of collectEntityMemoryContributions(value)) {
    if (!hasClassifiableContribution(contribution)) {
      continue;
    }
    contexts.push({
      contribution,
      toolCallId: source.toolCallId,
      ...(source.sourceArtifactId ? { sourceArtifactId: source.sourceArtifactId } : {}),
    });
  }
}

function collectEntityMemoryContributions(value: unknown): readonly EntityMemoryContribution[] {
  const contributions: EntityMemoryContribution[] = [];
  collectEntityMemoryContributionsInto(value, contributions, 0);
  return contributions;
}

function collectEntityMemoryContributionsInto(
  value: unknown,
  contributions: EntityMemoryContribution[],
  depth: number,
): void {
  if (contributions.length >= MAX_CONTRIBUTION_CANDIDATES_PER_EVENT) {
    return;
  }
  if (isEntityMemoryContribution(value)) {
    contributions.push(value);
    return;
  }
  if (depth >= MAX_CONTRIBUTION_SCAN_DEPTH || !isRecord(value)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        collectEntityMemoryContributionsInto(item, contributions, depth + 1);
      }
    }
    return;
  }

  for (const key of [
    'entityMemoryContribution',
    'entityMemoryContributionPayload',
    'contribution',
    'entityMemoryContributions',
    'contributions',
  ]) {
    collectEntityMemoryContributionsInto(value[key], contributions, depth + 1);
  }

  const extensions = value['extensions'];
  if (isRecord(extensions)) {
    for (const key of ENTITY_MEMORY_CONTRIBUTION_EXTENSION_KEYS) {
      collectEntityMemoryContributionsInto(extensions[key], contributions, depth + 1);
    }
  }
}

function hasClassifiableContribution(contribution: EntityMemoryContribution): boolean {
  return (
    (contribution.entityCandidates?.length ?? 0) > 0 ||
    (contribution.characterObservations?.length ?? 0) > 0
  );
}

function readArtifactFromTransfer(
  artifactTransfer: ToolResultArtifactTransfer,
): CompositeArtifact | undefined {
  switch (artifactTransfer.type) {
    case 'artifactSnapshot':
    case 'artifactBackfill':
      return artifactTransfer.artifact;
    case 'artifactBlockPage':
    case 'artifactExecutionSummary':
      return undefined;
  }
}

function parseCompositeJsonFenceCandidates(markdown: string): readonly unknown[] {
  return extractCompositeContentFenceCandidates(markdown).map((candidate) => candidate.value);
}

function readCompositeArtifactId(value: unknown): string | undefined {
  if (
    isRecord(value) &&
    value['kind'] === 'composite-artifact' &&
    typeof value['artifactId'] === 'string' &&
    value['artifactId'].trim().length > 0
  ) {
    return value['artifactId'];
  }
  return undefined;
}

function inferContributionToolCallId(contribution: EntityMemoryContribution): string | undefined {
  const direct = readToolResultSourceRefToolCallId(contribution.sourceRef);
  if (direct) {
    return direct;
  }
  for (const observation of contribution.characterObservations ?? []) {
    const fromObservation = readToolResultSourceRefToolCallId(observation.sourceRef);
    if (fromObservation) {
      return fromObservation;
    }
    const fromMention = readToolResultSourceRefToolCallId(observation.mention?.sourceRef);
    if (fromMention) {
      return fromMention;
    }
  }
  for (const segment of contribution.mediaTextSegments ?? []) {
    const fromSegment = readToolResultSourceRefToolCallId(segment.sourceRef);
    if (fromSegment) {
      return fromSegment;
    }
  }
  return undefined;
}

function readToolResultSourceRefToolCallId(sourceRef: unknown): string | undefined {
  if (
    isRecord(sourceRef) &&
    sourceRef['kind'] === 'tool-result' &&
    typeof sourceRef['toolCallId'] === 'string' &&
    sourceRef['toolCallId'].trim().length > 0
  ) {
    return sourceRef['toolCallId'];
  }
  return undefined;
}

function dedupeContributionContexts(
  contexts: readonly ContributionContext[],
): readonly ContributionContext[] {
  const seen = new Set<string>();
  const result: ContributionContext[] = [];
  for (const context of contexts) {
    const key = [
      context.toolCallId,
      context.sourceArtifactId ?? '',
      context.contribution.contributionId,
    ].join('\u0000');
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(context);
  }
  return result;
}

function createAutomationBackfillEvent(input: {
  readonly context: ContributionContext;
  readonly result: EntityMemoryContributionAutomationResult;
  readonly timestamp: number;
}): AgentEvent {
  return {
    type: 'tool_result_backfill',
    toolResultBackfill: createAutomationBackfillPayload({
      context: input.context,
      result: input.result,
      timestamp: input.timestamp,
    }),
  };
}

function createAutomationFailureBackfillEvent(input: {
  readonly context: ContributionContext;
  readonly error: unknown;
  readonly timestamp: number;
}): AgentEvent {
  const diagnostic: ArtifactDiagnostic = {
    severity: 'warning',
    code: 'provider-unavailable',
    path: ['entityMemoryAutomation'],
    message: errorMessage(input.error),
  };
  const summary: ArtifactExecutionSummary = {
    summaryId: summaryIdForContribution(input.context.contribution.contributionId),
    artifactId:
      input.context.sourceArtifactId ??
      artifactIdForContribution(input.context.contribution.contributionId),
    actionId: 'entity-memory.processContribution',
    providerId: 'neko-entity',
    status: 'failed',
    diagnostics: [diagnostic],
    metadata: {
      contributionId: input.context.contribution.contributionId,
    },
  };
  return {
    type: 'tool_result_backfill',
    toolResultBackfill: {
      toolCallId: input.context.toolCallId,
      timestamp: input.timestamp,
      dataPatch: {
        entityMemoryAutomation: {
          status: 'failed',
          contributionId: input.context.contribution.contributionId,
          message: diagnostic.message,
        },
      },
      artifacts: [{ type: 'artifactExecutionSummary', summary }],
      diagnostics: [
        {
          path: 'entityMemoryAutomation',
          reason: 'invalid-existing-result',
          incoming: diagnostic.message,
        },
      ],
      mergePolicy: {
        overwriteKeys: ['entityMemoryAutomation'],
        conflictStrategy: 'overwrite-listed',
      },
    },
  };
}

function createAutomationBackfillPayload(input: {
  readonly context: ContributionContext;
  readonly result: EntityMemoryContributionAutomationResult;
  readonly timestamp: number;
}): ToolResultBackfillPayload {
  const status = summaryStatusForDecisions(input.result.decisions);
  const metadata = {
    contributionId: input.result.contributionId,
    sourceArtifactId: input.context.sourceArtifactId ?? null,
    decisions: toArtifactJsonValue(input.result.decisions),
  };
  return {
    toolCallId: input.context.toolCallId,
    timestamp: input.timestamp,
    dataPatch: {
      entityMemoryAutomation: {
        status,
        contributionId: input.result.contributionId,
        decisions: toArtifactJsonValue(input.result.decisions),
      },
    },
    artifacts: [
      {
        type: 'artifactExecutionSummary',
        summary: {
          summaryId: summaryIdForContribution(input.result.contributionId),
          artifactId:
            input.context.sourceArtifactId ??
            artifactIdForContribution(input.result.contributionId),
          actionId: 'entity-memory.processContribution',
          providerId: 'neko-entity',
          status,
          metadata,
        },
      },
    ],
    mergePolicy: {
      overwriteKeys: ['entityMemoryAutomation'],
      conflictStrategy: 'overwrite-listed',
    },
  };
}

function summaryStatusForDecisions(
  decisions: readonly EntityMemoryContributionAutomationDecision[],
): ArtifactExecutionSummary['status'] {
  if (decisions.length === 0) {
    return 'unavailable';
  }
  const skipped = decisions.filter((decision) => decision.kind === 'skipped').length;
  if (skipped === 0) {
    return 'succeeded';
  }
  return skipped === decisions.length ? 'unavailable' : 'partial';
}

function summaryIdForContribution(contributionId: string): string {
  return `entity-memory:${contributionId}`;
}

function artifactIdForContribution(contributionId: string): string {
  return `entity-memory-contribution:${contributionId}`;
}

function toArtifactJsonValue(value: unknown): ArtifactJsonValue {
  if (isArtifactJsonPrimitive(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => toArtifactJsonValue(item));
  }
  if (isRecord(value)) {
    const record: Record<string, ArtifactJsonValue> = {};
    for (const [key, entryValue] of Object.entries(value)) {
      if (entryValue !== undefined) {
        record[key] = toArtifactJsonValue(entryValue);
      }
    }
    return record;
  }
  return String(value);
}

function isArtifactJsonPrimitive(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Entity memory automation failed.';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
