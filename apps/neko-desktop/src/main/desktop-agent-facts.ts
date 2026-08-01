import type { DesktopAgentTurnResult } from './desktop-agent-app-host-composition';
import type { DesktopAgentConversationEvidence } from './desktop-agent-app-host-composition';
import type { DesktopAgentConnectionIdentity } from '../shared/agent-contract';
import { assertEffectiveAgentConfigurationProjection } from '@neko/platform/config/effective-agent-config';
import {
  DESKTOP_AGENT_FACTS_VERSION,
  type DesktopAgentBoundedFacts,
  type DesktopAgentNeutralFacts,
  type DesktopAgentPermissionReceipt,
  type DesktopAgentPromptReceipt,
  type DesktopAgentResourceDisplayProjectionFact,
  type DesktopAgentSkillReceipt,
  type DesktopAgentToolReceipt,
} from '../shared/agent-facts-contract';

const DEFAULT_FACT_LIMIT = 100;

export interface CreateDesktopAgentNeutralFactsInput {
  readonly connection: DesktopAgentConnectionIdentity;
  readonly conversation: DesktopAgentConversationEvidence;
  readonly turn: DesktopAgentTurnResult;
  readonly promptReceipts: readonly DesktopAgentPromptReceipt[];
  readonly skillReceipts: readonly DesktopAgentSkillReceipt[];
  readonly toolReceipts: readonly DesktopAgentToolReceipt[];
  readonly permissionReceipts: readonly DesktopAgentPermissionReceipt[];
  readonly resourceDisplayProjections?: readonly DesktopAgentResourceDisplayProjectionFact[];
  readonly usage?: DesktopAgentNeutralFacts['usage'];
  readonly diagnostics?: readonly DesktopAgentNeutralFacts['diagnostics']['items'][number][];
  readonly disposal: DesktopAgentNeutralFacts['disposal'];
  readonly factLimit?: number;
}

export function createDesktopAgentNeutralFacts(
  input: CreateDesktopAgentNeutralFactsInput,
): DesktopAgentNeutralFacts {
  assertIdentity(input.connection.workspaceId, input.conversation.workspaceId, 'Workspace');
  assertIdentity(
    input.conversation.conversationId,
    input.turn.identity.conversationId,
    'Conversation',
  );
  assertIdentity(input.conversation.branchId, input.turn.identity.branchId, 'Branch');
  assertIdentity(input.connection.workspaceId, input.turn.identity.workspaceId, 'turn Workspace');
  const limit = requireFactLimit(input.factLimit ?? DEFAULT_FACT_LIMIT);
  const facts: DesktopAgentNeutralFacts = Object.freeze({
    schemaVersion: DESKTOP_AGENT_FACTS_VERSION,
    identity: Object.freeze({
      connection: input.connection,
      conversationId: input.conversation.conversationId,
      branchId: input.conversation.branchId,
      piSessionId: input.conversation.piSessionId,
      turnId: input.turn.identity.turnId,
      runId: input.turn.identity.runId,
    }),
    runtimePath: Object.freeze({
      controller: 'sender-bound-desktop-agent-controller',
      ...input.turn.path,
      forbiddenPathCount: 0,
    }),
    configuration: Object.freeze({
      requested: assertEffectiveAgentConfigurationProjection(input.turn.configuration.requested),
      effective: assertEffectiveAgentConfigurationProjection(input.turn.configuration.effective),
    }),
    receipts: Object.freeze({
      prompts: bounded(input.promptReceipts, limit),
      skills: bounded(input.skillReceipts, limit),
      tools: bounded(input.toolReceipts, limit),
      permissions: bounded(input.permissionReceipts, limit),
    }),
    projection: Object.freeze({
      revision: requireNonNegativeInteger(
        input.turn.projection.projectionVersion,
        'projection revision',
      ),
      terminalState: terminalState(input.turn),
    }),
    resourceDisplayProjections: bounded(input.resourceDisplayProjections ?? [], limit),
    persistence: Object.freeze({
      durability: requireTerminalDurability(input.turn.durability),
      checkpoint: 'observed',
    }),
    usage: Object.freeze({ ...(input.usage ?? {}) }),
    diagnostics: bounded(input.diagnostics ?? [], limit),
    disposal: Object.freeze({ ...input.disposal }),
  });
  assertSecretSafeFacts(facts);
  return facts;
}

export function assertCompleteDesktopAgentNeutralFacts(
  facts: DesktopAgentNeutralFacts,
): DesktopAgentNeutralFacts {
  if (facts.schemaVersion !== DESKTOP_AGENT_FACTS_VERSION) {
    throw new Error(`Unsupported Desktop Agent facts version: ${facts.schemaVersion}`);
  }
  for (const [label, collection] of Object.entries({
    prompts: facts.receipts.prompts,
    skills: facts.receipts.skills,
    tools: facts.receipts.tools,
    permissions: facts.receipts.permissions,
    diagnostics: facts.diagnostics,
    resourceDisplayProjections: facts.resourceDisplayProjections,
  })) {
    if (collection.droppedCount > 0) {
      throw new Error(`Desktop Agent required ${label} facts were truncated.`);
    }
  }
  if (facts.disposal.status !== 'disposed') {
    throw new Error(`Desktop Agent disposal is not complete: ${facts.disposal.status}.`);
  }
  if (facts.runtimePath.forbiddenPathCount !== 0) {
    throw new Error('Desktop Agent facts report a forbidden fallback.');
  }
  assertEffectiveAgentConfigurationProjection(facts.configuration.requested);
  assertEffectiveAgentConfigurationProjection(facts.configuration.effective);
  assertSecretSafeFacts(facts);
  return facts;
}

function bounded<T>(items: readonly T[], limit: number): DesktopAgentBoundedFacts<T> {
  const retained = items.slice(0, limit).map((item) => Object.freeze({ ...item }));
  return Object.freeze({
    limit,
    items: Object.freeze(retained),
    droppedCount: Math.max(0, items.length - retained.length),
  });
}

function terminalState(turn: DesktopAgentTurnResult): 'completed' | 'cancelled' | 'failed' {
  const latest = turn.projection.turns.find(
    (candidate) => candidate.turnId === turn.identity.turnId,
  );
  if (!latest?.completion) {
    throw new Error('Desktop Agent turn projection has no matching terminal completion.');
  }
  return latest.completion.status;
}

function requireTerminalDurability(
  value: DesktopAgentTurnResult['durability'],
): 'durable' | 'persistence-delayed' {
  if (value !== 'durable' && value !== 'persistence-delayed') {
    throw new Error(`Desktop Agent turn durability is not terminal: ${value}.`);
  }
  return value;
}

function assertSecretSafeFacts(facts: DesktopAgentNeutralFacts): void {
  const serialized = JSON.stringify(facts);
  if (/\b(api[-_]?key|authorization|password|secret|access[-_]?token)\b/iu.test(serialized)) {
    throw new Error('Desktop Agent facts contain credential-shaped data.');
  }
  if (
    collectStringValues(facts).some((value) =>
      [value, ...value.split(/[\s"'(),;]+/u)].some((candidate) => isAbsolute(candidate)),
    )
  ) {
    throw new Error('Desktop Agent facts contain an absolute filesystem path.');
  }
  if (/\b(suite|case|variant|baseline|score|pass|fail)\b/iu.test(serialized)) {
    throw new Error('Desktop Agent facts contain Evaluation outcome concepts.');
  }
}

function collectStringValues(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(collectStringValues);
  if (typeof value !== 'object' || value === null) return [];
  return Object.values(value).flatMap(collectStringValues);
}

function assertIdentity(actual: string, expected: string, label: string): void {
  if (!actual || actual !== expected) {
    throw new Error(`Desktop Agent ${label} identity does not match its authoritative owner.`);
  }
}

function requireFactLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_000) {
    throw new Error('Desktop Agent fact limit must be an integer between 1 and 1000.');
  }
  return value;
}

function requireNonNegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Desktop Agent ${label} must be a non-negative integer.`);
  }
  return value;
}
import { isAbsolute } from 'node:path';
