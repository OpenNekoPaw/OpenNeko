import { createHash } from 'node:crypto';

import type { PiProductAgentEvent, PiProductEventSink, PiToolRunIdentity } from '../../pi';
import type {
  AgentResourceDisplayProjectionFact,
  DesktopAgentConnectionIdentity,
} from '@neko/agent-contracts';
import type {
  DesktopAgentNeutralFacts,
  DesktopAgentPermissionReceipt,
  DesktopAgentSkillReceipt,
  DesktopAgentToolReceipt,
} from '@neko/agent-contracts';
import {
  createDesktopAgentNeutralFacts,
  type DesktopAgentConversationEvidence,
  type DesktopAgentFactsTurnResult,
} from './desktop-agent-facts';

export interface DesktopAgentFactsProjector {
  beginTurn(input: {
    readonly identity: PiToolRunIdentity;
    readonly systemPrompt: string;
  }): PiProductEventSink;
  completeTurn(input: {
    readonly conversation: DesktopAgentConversationEvidence;
    readonly turn: DesktopAgentFactsTurnResult;
  }): void;
  recordResourceDisplayProjection(fact: AgentResourceDisplayProjectionFact): void;
  readFacts(
    identity: Pick<PiToolRunIdentity, 'conversationId' | 'turnId' | 'runId'>,
  ): DesktopAgentNeutralFacts;
  readLatestIdentity(conversationId: string): PiToolRunIdentity | undefined;
  dispose(): void;
  failDisposal(): void;
}

export interface DesktopAgentFactsStore {
  readonly owner: 'desktop-agent-facts';
}

const storeRecords = new WeakMap<DesktopAgentFactsStore, Map<string, TurnFactsRecord>>();

interface TurnFactsRecord {
  readonly identity: PiToolRunIdentity;
  readonly systemPrompt: string;
  readonly tools: Map<string, DesktopAgentToolReceipt>;
  readonly permissions: Map<string, DesktopAgentPermissionReceipt>;
  readonly skills: Map<string, DesktopAgentSkillReceipt>;
  readonly resourceDisplayProjections: Map<string, AgentResourceDisplayProjectionFact>;
  readonly diagnostics: Array<DesktopAgentNeutralFacts['diagnostics']['items'][number]>;
  usage: DesktopAgentNeutralFacts['usage'];
  conversation?: DesktopAgentConversationEvidence;
  turn?: DesktopAgentFactsTurnResult;
}

export function createDesktopAgentFactsProjector(input: {
  readonly connection: DesktopAgentConnectionIdentity;
  readonly factLimit?: number;
  readonly store?: DesktopAgentFactsStore;
}): DesktopAgentFactsProjector {
  const records =
    input.store === undefined ? new Map<string, TurnFactsRecord>() : requireStore(input.store);
  let disposed = false;
  let disposal: DesktopAgentNeutralFacts['disposal'] = { status: 'pending' };

  return {
    beginTurn({ identity, systemPrompt }) {
      if (disposed) throw new Error('Desktop Agent facts projector is disposed.');
      assertConnectionWorkspace(input.connection, identity);
      const key = turnKey(identity);
      if (records.has(key)) {
        throw new Error(`Desktop Agent facts already own turn '${key}'.`);
      }
      const record: TurnFactsRecord = {
        identity,
        systemPrompt,
        tools: new Map(),
        permissions: new Map(),
        skills: new Map(),
        resourceDisplayProjections: new Map(),
        diagnostics: [],
        usage: {},
      };
      records.set(key, record);
      return Object.freeze({
        emit(event: PiProductAgentEvent): void {
          assertEventIdentity(record.identity, event.identity);
          projectEvent(record, event);
        },
      });
    },
    completeTurn({ conversation, turn }) {
      const record = requireRecord(records, turn.identity);
      assertConnectionWorkspace(input.connection, turn.identity);
      assertEventIdentity(record.identity, turn.identity);
      record.conversation = conversation;
      record.turn = turn;
      for (const diagnostic of turn.configuration.diagnostics) {
        record.diagnostics.push({
          code: diagnostic.code,
          severity: 'warning',
          message: `Desktop Agent configuration diagnostic: ${diagnostic.code}.`,
        });
      }
      if (turn.artifactDelivery?.status === 'blocked') {
        record.diagnostics.push({
          code: turn.artifactDelivery.diagnostic.code,
          severity: 'error',
          message: 'Workspace Board delivery was blocked; durable artifacts were retained.',
        });
      }
    },
    recordResourceDisplayProjection(fact) {
      const record = [...records.values()]
        .reverse()
        .find(
          (candidate) =>
            candidate.identity.conversationId === fact.conversationId &&
            candidate.tools.has(fact.toolCallId),
        );
      if (!record) return;
      record.resourceDisplayProjections.set(resourceProjectionKey(fact), freezeProjection(fact));
    },
    readFacts(identity) {
      const record = requireRecord(records, identity);
      if (!record.conversation || !record.turn) {
        throw new Error(
          `Desktop Agent facts for ${turnKey(identity)} are unavailable before terminal completion.`,
        );
      }
      return createDesktopAgentNeutralFacts({
        connection: input.connection,
        conversation: record.conversation,
        turn: record.turn,
        promptReceipts: [
          {
            id: 'desktop-agent-system-prompt',
            source: 'system',
            digest: sha256(record.systemPrompt),
          },
        ],
        skillReceipts: [...record.skills.values()],
        toolReceipts: [...record.tools.values()],
        permissionReceipts: [...record.permissions.values()],
        resourceDisplayProjections: [...record.resourceDisplayProjections.values()],
        usage: record.usage,
        diagnostics: record.diagnostics,
        disposal,
        ...(input.factLimit === undefined ? {} : { factLimit: input.factLimit }),
      });
    },
    readLatestIdentity(conversationId) {
      return [...records.values()]
        .reverse()
        .find(
          (record) =>
            record.identity.conversationId === conversationId &&
            record.conversation !== undefined &&
            record.turn !== undefined,
        )?.identity;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      disposal = { status: 'disposed' };
    },
    failDisposal() {
      disposed = true;
      disposal = {
        status: 'failed',
        diagnostic: 'Desktop Agent connection resources failed to dispose.',
      };
    },
  };
}

export function createDesktopAgentFactsStore(): DesktopAgentFactsStore {
  const store: DesktopAgentFactsStore = Object.freeze({ owner: 'desktop-agent-facts' });
  storeRecords.set(store, new Map());
  return store;
}

function requireStore(store: DesktopAgentFactsStore): Map<string, TurnFactsRecord> {
  const records = storeRecords.get(store);
  if (!records) throw new Error('Desktop Agent facts store is not owned by this runtime.');
  return records;
}

function projectEvent(record: TurnFactsRecord, event: PiProductAgentEvent): void {
  switch (event.type) {
    case 'tool.started':
      record.tools.set(event.toolCallId, {
        name: event.toolName,
        callId: event.toolCallId,
        status: 'pending',
      });
      return;
    case 'tool.completed': {
      record.tools.set(event.toolCallId, {
        name: event.toolName,
        callId: event.toolCallId,
        status: event.isError ? 'error' : 'success',
      });
      const skill = readSkillReceipt(event);
      if (skill) record.skills.set(`${skill.source}:${skill.name}:${skill.fingerprint}`, skill);
      return;
    }
    case 'confirmation.resolved':
      record.permissions.set(event.toolCallId, {
        toolCallId: event.toolCallId,
        decision: event.approved ? 'approved' : 'denied',
      });
      return;
    case 'usage':
      record.usage = {
        inputTokens: (record.usage.inputTokens ?? 0) + event.usage.input,
        outputTokens: (record.usage.outputTokens ?? 0) + event.usage.output,
        costUsd: (record.usage.costUsd ?? 0) + event.usage.cost.total,
      };
      return;
    case 'skill.activated': {
      const skill = {
        name: event.skillName,
        source: event.source,
        fingerprint: normalizeSha256(event.fingerprint),
        status: 'injected' as const,
      };
      record.skills.set(`${skill.source}:${skill.name}:${skill.fingerprint}`, skill);
      return;
    }
    case 'turn.cancelled':
      for (const [key, receipt] of record.tools) {
        if (receipt.status === 'pending')
          record.tools.set(key, { ...receipt, status: 'cancelled' });
      }
      return;
    case 'turn.failed':
      record.diagnostics.push({
        code: 'desktop-agent-turn-failed',
        severity: 'error',
        message: 'Desktop Agent turn failed.',
      });
      return;
    case 'turn.started':
    case 'assistant.text.delta':
    case 'assistant.thinking.delta':
    case 'assistant.message.completed':
    case 'tool.updated':
    case 'confirmation.required':
    case 'turn.persistence':
    case 'turn.completed':
      return;
  }
}

function readSkillReceipt(
  event: Extract<PiProductAgentEvent, { readonly type: 'tool.completed' }>,
): DesktopAgentSkillReceipt | undefined {
  if (event.toolName !== 'read_skill' || event.isError) return undefined;
  const result = asRecord(event.result);
  const details = asRecord(result?.['details']);
  const skillName = details?.['skillName'];
  const source = asRecord(details?.['source'])?.['kind'];
  const fingerprint = details?.['fingerprint'];
  if (typeof skillName !== 'string' || !isSkillSource(source) || typeof fingerprint !== 'string') {
    return undefined;
  }
  return {
    name: skillName,
    source,
    fingerprint: normalizeSha256(fingerprint),
    status: 'injected',
  };
}

function requireRecord(
  records: ReadonlyMap<string, TurnFactsRecord>,
  identity: Pick<PiToolRunIdentity, 'conversationId' | 'turnId' | 'runId'>,
): TurnFactsRecord {
  const record = records.get(turnKey(identity));
  if (!record) throw new Error(`Desktop Agent facts do not own turn '${turnKey(identity)}'.`);
  return record;
}

function assertConnectionWorkspace(
  connection: DesktopAgentConnectionIdentity,
  identity: PiToolRunIdentity,
): void {
  if (connection.workspaceId !== identity.workspaceId) {
    throw new Error('Desktop Agent facts turn Workspace does not match its connection owner.');
  }
}

function assertEventIdentity(expected: PiToolRunIdentity, actual: PiToolRunIdentity): void {
  if (turnKey(expected) !== turnKey(actual) || expected.workspaceId !== actual.workspaceId) {
    throw new Error('Desktop Agent facts event identity does not match its turn owner.');
  }
}

function turnKey(identity: Pick<PiToolRunIdentity, 'conversationId' | 'turnId' | 'runId'>): string {
  return `${identity.conversationId}\u0000${identity.turnId}\u0000${identity.runId}`;
}

function resourceProjectionKey(fact: AgentResourceDisplayProjectionFact): string {
  return `${fact.toolCallId}\u0000${fact.locatorKind}\u0000${fact.status}`;
}

function freezeProjection(
  fact: AgentResourceDisplayProjectionFact,
): AgentResourceDisplayProjectionFact {
  return Object.freeze({ ...fact, diagnosticCodes: Object.freeze([...fact.diagnosticCodes]) });
}

function sha256(value: string): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function normalizeSha256(value: string): `sha256:${string}` {
  return `sha256:${value.startsWith('sha256:') ? value.slice('sha256:'.length) : value}`;
}

function isSkillSource(value: unknown): value is DesktopAgentSkillReceipt['source'] {
  return value === 'project' || value === 'personal' || value === 'builtin' || value === 'plugin';
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Reflect.getPrototypeOf(value) === Object.prototype
      ? Object.fromEntries(Object.entries(value))
      : undefined
    : undefined;
}
