import { createHash } from 'node:crypto';
import { stableStringify } from '@neko/shared';
import {
  DESKTOP_AGENT_FACTS_VERSION,
  EFFECTIVE_AGENT_CONFIG_CONTRACT_VERSION,
  type AgentResourceDisplayProjectionFact,
  type DesktopAgentConnectionIdentity,
  type DesktopAgentBoundedFacts,
  type DesktopAgentNeutralFacts,
  type DesktopAgentPermissionReceipt,
  type DesktopAgentPromptReceipt,
  type DesktopAgentSkillReceipt,
  type DesktopAgentToolReceipt,
  type EffectiveAgentConfigurationProjection,
} from '@neko/agent-contracts';
import type { PiToolRunIdentity } from '../../pi';

const DEFAULT_FACT_LIMIT = 100;

export interface DesktopAgentConversationEvidence {
  readonly workspaceId: string;
  readonly conversationId: string;
  readonly branchId: string;
  readonly piSessionId: string;
  readonly writerEpoch: number;
}

export interface DesktopAgentFactsTurnResult {
  readonly identity: PiToolRunIdentity;
  readonly durability: 'volatile' | 'persisting' | 'durable' | 'persistence-delayed';
  readonly projection: {
    readonly projectionVersion: number;
    readonly turns: readonly {
      readonly turnId: string;
      readonly completion?: {
        readonly status: 'completed' | 'cancelled' | 'failed';
      };
    }[];
  };
  readonly configuration: {
    readonly requested: EffectiveAgentConfigurationProjection;
    readonly effective: EffectiveAgentConfigurationProjection;
    readonly diagnostics: readonly { readonly code: string; readonly message: string }[];
  };
  readonly path: {
    readonly runtime: 'pi-conversation-runtime';
    readonly transcript: 'pi-session';
    readonly metadata: 'sqlite';
    readonly projection: 'conversation-projection-store';
  };
}

export interface CreateDesktopAgentNeutralFactsInput {
  readonly connection: DesktopAgentConnectionIdentity;
  readonly conversation: DesktopAgentConversationEvidence;
  readonly turn: DesktopAgentFactsTurnResult;
  readonly promptReceipts: readonly DesktopAgentPromptReceipt[];
  readonly skillReceipts: readonly DesktopAgentSkillReceipt[];
  readonly toolReceipts: readonly DesktopAgentToolReceipt[];
  readonly permissionReceipts: readonly DesktopAgentPermissionReceipt[];
  readonly resourceDisplayProjections?: readonly AgentResourceDisplayProjectionFact[];
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

function assertEffectiveAgentConfigurationProjection(
  input: EffectiveAgentConfigurationProjection,
): EffectiveAgentConfigurationProjection {
  if (input.schemaVersion !== EFFECTIVE_AGENT_CONFIG_CONTRACT_VERSION) {
    throw new Error(`Unsupported effective Agent configuration version: ${input.schemaVersion}`);
  }
  const expectedDigest = `sha256:${createHash('sha256')
    .update(
      stableStringify({
        schemaVersion: EFFECTIVE_AGENT_CONFIG_CONTRACT_VERSION,
        values: input.values,
        sources: input.sources,
      }),
    )
    .digest('hex')}` as const;
  if (input.digest !== expectedDigest) {
    throw new Error('Effective Agent configuration digest does not match its frozen values.');
  }
  const expectedProfileId = `effective-agent-${expectedDigest.slice('sha256:'.length, 'sha256:'.length + 16)}`;
  if (input.profileId !== expectedProfileId) {
    throw new Error('Effective Agent configuration profile identity does not match its digest.');
  }
  return input;
}

function bounded<T>(items: readonly T[], limit: number): DesktopAgentBoundedFacts<T> {
  const retained = items.slice(0, limit).map((item) => Object.freeze({ ...item }));
  return Object.freeze({
    limit,
    items: Object.freeze(retained),
    droppedCount: Math.max(0, items.length - retained.length),
  });
}

function terminalState(turn: DesktopAgentFactsTurnResult): 'completed' | 'cancelled' | 'failed' {
  const latest = turn.projection.turns.find(
    (candidate) => candidate.turnId === turn.identity.turnId,
  );
  if (!latest?.completion) {
    throw new Error('Desktop Agent turn projection has no matching terminal completion.');
  }
  return latest.completion.status;
}

function requireTerminalDurability(
  value: DesktopAgentFactsTurnResult['durability'],
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
