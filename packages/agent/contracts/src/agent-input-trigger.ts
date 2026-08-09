import {
  parseAgentAvailabilityProjection,
  type AgentAvailabilityProjection,
} from './agent-availability';
import type { AgentBindingKind, AgentInteractionPhase } from './agent-interaction-binding';

export type AgentInputTriggerKind = 'command' | 'skill' | 'mention';
export type AgentInputTriggerPrefix = '/' | '$' | '@';
export type AgentInputPhaseRequirement = 'any' | AgentInteractionPhase;
export type AgentInputBindingRequirement = 'any' | Exclude<AgentBindingKind, 'unbound'>;

export type AgentInputSourceReceipt =
  | { readonly kind: 'builtin'; readonly sourceId: string }
  | { readonly kind: 'personal'; readonly ownerId: string; readonly sourceId: string }
  | {
      readonly kind: 'project';
      readonly workspaceId: string;
      readonly sourceId: string;
    }
  | { readonly kind: 'plugin'; readonly pluginId: string; readonly sourceId: string }
  | {
      readonly kind: 'command-artifact';
      readonly workspaceId: string;
      readonly artifactId: string;
    };

interface AgentInputCatalogEntryBase {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon?: string;
  readonly phaseRequirement: AgentInputPhaseRequirement;
  readonly bindingRequirement: AgentInputBindingRequirement;
  readonly source: AgentInputSourceReceipt;
  readonly availability: AgentAvailabilityProjection;
}

export interface AgentCommandCatalogEntry extends AgentInputCatalogEntryBase {
  readonly trigger: 'command';
  readonly prefix: '/';
  readonly executable: {
    readonly kind: 'command';
    readonly commandId: string;
    readonly handlerId: string;
  };
}

export interface AgentSkillInvocationCatalogEntry extends AgentInputCatalogEntryBase {
  readonly trigger: 'skill';
  readonly prefix: '$';
  readonly executable: {
    readonly kind: 'skill';
    readonly skillName: string;
    readonly activationId: string;
  };
}

export interface AgentMentionCatalogEntry extends AgentInputCatalogEntryBase {
  readonly trigger: 'mention';
  readonly prefix: '@';
  readonly executable: {
    readonly kind: 'reference';
    readonly referenceId: string;
    readonly ownerKind: Exclude<AgentBindingKind, 'unbound'>;
    readonly ownerId: string;
  };
}

export type AgentInputCatalogEntry =
  AgentCommandCatalogEntry | AgentSkillInvocationCatalogEntry | AgentMentionCatalogEntry;

export interface ParsedAgentInputTrigger {
  readonly trigger: AgentInputTriggerKind;
  readonly prefix: AgentInputTriggerPrefix;
  readonly name: string;
  readonly args?: string;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly rawToken: string;
}

export interface ParseAgentInputTriggerOptions {
  readonly startIndex?: number;
  readonly requireBoundary?: boolean;
}

export const AGENT_INPUT_TRIGGER_PREFIXES: Record<AgentInputTriggerKind, AgentInputTriggerPrefix> =
  {
    command: '/',
    skill: '$',
    mention: '@',
  };

const AGENT_INPUT_TRIGGER_KINDS_BY_PREFIX: Record<AgentInputTriggerPrefix, AgentInputTriggerKind> =
  {
    '/': 'command',
    $: 'skill',
    '@': 'mention',
  };

const COMMAND_OR_SKILL_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]*/;
const MENTION_NAME_PATTERN = /^[^\s]+/;

export function parseAgentInputCatalogEntry(value: unknown): AgentInputCatalogEntry {
  const record = requireRecord(value, 'Agent input catalog entry must be an object.');
  const base = parseCatalogEntryBase(record);
  if (record['trigger'] === 'command') {
    requireCatalogKeys(record);
    if (record['prefix'] !== '/') throw new Error("Agent command prefix must be '/'.");
    const executable = parseExecutable(record['executable'], 'command');
    return {
      ...base,
      trigger: 'command',
      prefix: '/',
      executable: {
        kind: 'command',
        commandId: requireIdentity(executable['commandId'], 'command'),
        handlerId: requireIdentity(executable['handlerId'], 'command handler'),
      },
    };
  }
  if (record['trigger'] === 'skill') {
    requireCatalogKeys(record);
    if (record['prefix'] !== '$') throw new Error("Agent Skill prefix must be '$'.");
    const executable = parseExecutable(record['executable'], 'skill');
    return {
      ...base,
      trigger: 'skill',
      prefix: '$',
      executable: {
        kind: 'skill',
        skillName: requireIdentity(executable['skillName'], 'Skill'),
        activationId: requireIdentity(executable['activationId'], 'Skill activation'),
      },
    };
  }
  if (record['trigger'] === 'mention') {
    requireCatalogKeys(record);
    if (record['prefix'] !== '@') throw new Error("Agent mention prefix must be '@'.");
    const executable = parseExecutable(record['executable'], 'reference');
    return {
      ...base,
      trigger: 'mention',
      prefix: '@',
      executable: {
        kind: 'reference',
        referenceId: requireIdentity(executable['referenceId'], 'reference'),
        ownerKind: parseBoundBindingKind(executable['ownerKind']),
        ownerId: requireIdentity(executable['ownerId'], 'reference owner'),
      },
    };
  }
  throw new Error(`Unknown Agent input catalog trigger '${String(record['trigger'])}'.`);
}

export function parseAgentInputCatalog(value: unknown): readonly AgentInputCatalogEntry[] {
  if (!Array.isArray(value)) throw new Error('Agent input catalog must be an array.');
  const entries = value.map(parseAgentInputCatalogEntry);
  const duplicate = entries.find(
    (entry, index) => entries.findIndex((candidate) => candidate.id === entry.id) !== index,
  );
  if (duplicate) throw new Error(`Duplicate Agent input catalog identity '${duplicate.id}'.`);
  return entries;
}

export function isAgentInputCatalogEntryExecutable(input: {
  readonly entry: AgentInputCatalogEntry;
  readonly phase: AgentInteractionPhase;
  readonly bindingKind: AgentBindingKind;
}): boolean {
  return (
    input.entry.availability.status === 'available' &&
    (input.entry.phaseRequirement === 'any' || input.entry.phaseRequirement === input.phase) &&
    (input.entry.bindingRequirement === 'any' ||
      input.entry.bindingRequirement === input.bindingKind)
  );
}

export function getAgentInputTriggerKind(prefix: string): AgentInputTriggerKind | undefined {
  return isAgentInputTriggerPrefix(prefix)
    ? AGENT_INPUT_TRIGGER_KINDS_BY_PREFIX[prefix]
    : undefined;
}

export function getAgentInputTriggerPrefix(
  trigger: AgentInputTriggerKind,
): AgentInputTriggerPrefix {
  return AGENT_INPUT_TRIGGER_PREFIXES[trigger];
}

export function isAgentInputTriggerPrefix(value: string): value is AgentInputTriggerPrefix {
  return value === '/' || value === '$' || value === '@';
}

export function isAgentInputTriggerBoundary(input: string, startIndex: number): boolean {
  if (startIndex <= 0) return true;
  return /\s/.test(input[startIndex - 1] ?? '');
}

export function normalizeAgentInputTriggerName(name: string): string {
  const trimmed = name.trim();
  const withoutPrefix = isAgentInputTriggerPrefix(trimmed[0] ?? '') ? trimmed.slice(1) : trimmed;
  return withoutPrefix.toLowerCase();
}

export function parseAgentInputTrigger(
  input: string,
  options: ParseAgentInputTriggerOptions = {},
): ParsedAgentInputTrigger | null {
  const startIndex = options.startIndex ?? input.search(/\S/);
  if (startIndex < 0 || startIndex >= input.length) return null;
  const requireBoundary = options.requireBoundary ?? true;
  if (requireBoundary && !isAgentInputTriggerBoundary(input, startIndex)) return null;
  const prefix = input[startIndex];
  if (!prefix || !isAgentInputTriggerPrefix(prefix)) return null;
  const trigger = getAgentInputTriggerKind(prefix);
  if (!trigger) return null;
  const afterPrefix = input.slice(startIndex + 1);
  const match =
    trigger === 'mention'
      ? MENTION_NAME_PATTERN.exec(afterPrefix)
      : COMMAND_OR_SKILL_NAME_PATTERN.exec(afterPrefix);
  const rawToken = match?.[0] ?? '';
  if (!rawToken) return null;
  const endIndex = startIndex + prefix.length + rawToken.length;
  const rawArgs = input.slice(endIndex).trim();
  return {
    trigger,
    prefix,
    name: normalizeAgentInputTriggerName(rawToken),
    ...(rawArgs.length > 0 ? { args: rawArgs } : {}),
    startIndex,
    endIndex,
    rawToken,
  };
}

function parseCatalogEntryBase(record: Record<string, unknown>) {
  const icon = record['icon'];
  if (icon !== undefined && (typeof icon !== 'string' || icon.trim().length === 0)) {
    throw new Error('Agent input catalog icon must be a non-empty string.');
  }
  return {
    id: requireIdentity(record['id'], 'catalog entry'),
    name: requireIdentity(record['name'], 'catalog entry name'),
    description: requireText(record['description'], 'catalog entry description'),
    ...(icon === undefined ? {} : { icon }),
    phaseRequirement: parsePhaseRequirement(record['phaseRequirement']),
    bindingRequirement: parseBindingRequirement(record['bindingRequirement']),
    source: parseSource(record['source']),
    availability: parseAgentAvailabilityProjection(record['availability']),
  };
}

function parseSource(value: unknown): AgentInputSourceReceipt {
  const record = requireRecord(value, 'Agent input source receipt must be an object.');
  switch (record['kind']) {
    case 'builtin':
      requireExactKeys(record, ['kind', 'sourceId'], 'builtin source');
      return { kind: 'builtin', sourceId: requireIdentity(record['sourceId'], 'source') };
    case 'personal':
      requireExactKeys(record, ['kind', 'ownerId', 'sourceId'], 'personal source');
      return {
        kind: 'personal',
        ownerId: requireIdentity(record['ownerId'], 'personal source owner'),
        sourceId: requireIdentity(record['sourceId'], 'source'),
      };
    case 'project':
      requireExactKeys(record, ['kind', 'workspaceId', 'sourceId'], 'project source');
      return {
        kind: 'project',
        workspaceId: requireIdentity(record['workspaceId'], 'Workspace'),
        sourceId: requireIdentity(record['sourceId'], 'source'),
      };
    case 'plugin':
      requireExactKeys(record, ['kind', 'pluginId', 'sourceId'], 'plugin source');
      return {
        kind: 'plugin',
        pluginId: requireIdentity(record['pluginId'], 'plugin'),
        sourceId: requireIdentity(record['sourceId'], 'source'),
      };
    case 'command-artifact':
      requireExactKeys(record, ['kind', 'workspaceId', 'artifactId'], 'command artifact source');
      return {
        kind: 'command-artifact',
        workspaceId: requireIdentity(record['workspaceId'], 'Workspace'),
        artifactId: requireIdentity(record['artifactId'], 'command artifact'),
      };
    default:
      throw new Error(`Unknown Agent input source '${String(record['kind'])}'.`);
  }
}

function parseExecutable(
  value: unknown,
  kind: 'command' | 'skill' | 'reference',
): Record<string, unknown> {
  const record = requireRecord(value, 'Agent input executable identity must be an object.');
  const keys =
    kind === 'command'
      ? ['kind', 'commandId', 'handlerId']
      : kind === 'skill'
        ? ['kind', 'skillName', 'activationId']
        : ['kind', 'referenceId', 'ownerKind', 'ownerId'];
  requireExactKeys(record, keys, 'input executable identity');
  if (record['kind'] !== kind) {
    throw new Error(`Agent input executable identity must be '${kind}'.`);
  }
  return record;
}

function parsePhaseRequirement(value: unknown): AgentInputPhaseRequirement {
  if (value !== 'any' && value !== 'draft' && value !== 'session') {
    throw new Error(`Unknown Agent input phase requirement '${String(value)}'.`);
  }
  return value;
}

function parseBindingRequirement(value: unknown): AgentInputBindingRequirement {
  return value === 'any' ? value : parseBoundBindingKind(value);
}

function parseBoundBindingKind(value: unknown): Exclude<AgentBindingKind, 'unbound'> {
  if (
    value !== 'assistant' &&
    value !== 'workspace' &&
    value !== 'character' &&
    value !== 'world'
  ) {
    throw new Error(`Unknown Agent input binding requirement '${String(value)}'.`);
  }
  return value;
}

function requireCatalogKeys(record: Record<string, unknown>): void {
  const required = [
    'id',
    'name',
    'description',
    'trigger',
    'prefix',
    'phaseRequirement',
    'bindingRequirement',
    'source',
    'availability',
    'executable',
  ];
  const allowed = [...required, 'icon'];
  const unknown = Object.keys(record).find((key) => !allowed.includes(key));
  if (unknown)
    throw new Error(`Agent input catalog entry contains unsupported field '${unknown}'.`);
  const missing = required.find((key) => !(key in record));
  if (missing) throw new Error(`Agent input catalog entry is missing field '${missing}'.`);
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function requireExactKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(record);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    throw new Error(`Agent ${label} contains unsupported fields.`);
  }
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Agent ${label} identity is required.`);
  }
  return value;
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`Agent ${label} is required.`);
  return value;
}
