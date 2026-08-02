export type AgentInputTriggerKind = 'command' | 'skill' | 'mention';
export type AgentInputTriggerPrefix = '/' | '$' | '@';

export type AgentCommandCatalogSource = 'builtin' | 'plugin' | 'command-artifact';
export type AgentSkillInvocationCatalogSource = 'builtin' | 'personal' | 'project';

export interface AgentInputCatalogEntryBase {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly icon?: string;
}

export interface AgentCommandCatalogEntry extends AgentInputCatalogEntryBase {
  readonly trigger: 'command';
  readonly prefix: '/';
  readonly source: AgentCommandCatalogSource;
  readonly commandId: string;
}

export interface AgentSkillInvocationCatalogEntry extends AgentInputCatalogEntryBase {
  readonly trigger: 'skill';
  readonly prefix: '$';
  readonly source: AgentSkillInvocationCatalogSource;
  readonly skillName: string;
  readonly enabled: boolean;
}

export interface AgentMentionCatalogEntry extends AgentInputCatalogEntryBase {
  readonly trigger: 'mention';
  readonly prefix: '@';
  readonly referenceId: string;
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
  if (startIndex < 0 || startIndex >= input.length) {
    return null;
  }

  const requireBoundary = options.requireBoundary ?? true;
  if (requireBoundary && !isAgentInputTriggerBoundary(input, startIndex)) {
    return null;
  }

  const prefix = input[startIndex];
  if (!prefix || !isAgentInputTriggerPrefix(prefix)) {
    return null;
  }

  const trigger = getAgentInputTriggerKind(prefix);
  if (!trigger) {
    return null;
  }

  const afterPrefix = input.slice(startIndex + 1);
  const match =
    trigger === 'mention'
      ? MENTION_NAME_PATTERN.exec(afterPrefix)
      : COMMAND_OR_SKILL_NAME_PATTERN.exec(afterPrefix);
  const rawToken = match?.[0] ?? '';
  if (!rawToken) {
    return null;
  }

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
