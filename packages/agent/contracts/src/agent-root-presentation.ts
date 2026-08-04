export const AGENT_ROOT_PRESENTATION_VERSION = 2 as const;

export type AgentAuthorityScopeProjection =
  | { readonly kind: 'unbound'; readonly draftId: string }
  | {
      readonly kind: 'assistant';
      readonly assistantSpaceId: string;
    }
  | {
      readonly kind: 'workspace';
      readonly workspaceId: string;
      readonly workspaceGrantId: string;
    };

export type AgentBoundAuthorityScopeProjection = Exclude<
  AgentAuthorityScopeProjection,
  { readonly kind: 'unbound' }
>;

export type AgentRootPresentation =
  | {
      readonly schemaVersion: typeof AGENT_ROOT_PRESENTATION_VERSION;
      readonly kind: 'draft';
      readonly draftId: string;
      readonly scope: AgentAuthorityScopeProjection;
    }
  | {
      readonly schemaVersion: typeof AGENT_ROOT_PRESENTATION_VERSION;
      readonly kind: 'session';
      readonly scope: AgentBoundAuthorityScopeProjection;
      readonly conversationId: string;
    };

export function createAgentDraftPresentation(
  draftId: string,
  scope: AgentAuthorityScopeProjection,
): AgentRootPresentation {
  return parseAgentRootPresentation({
    schemaVersion: AGENT_ROOT_PRESENTATION_VERSION,
    kind: 'draft',
    draftId,
    scope,
  });
}

export function createAgentSessionPresentation(
  scope: AgentBoundAuthorityScopeProjection,
  conversationId: string,
): AgentRootPresentation {
  return parseAgentRootPresentation({
    schemaVersion: AGENT_ROOT_PRESENTATION_VERSION,
    kind: 'session',
    scope,
    conversationId,
  });
}

export function parseAgentRootPresentation(value: unknown): AgentRootPresentation {
  const record = requireRecord(value, 'Agent Root presentation must be an object.');
  if (record['schemaVersion'] !== AGENT_ROOT_PRESENTATION_VERSION) {
    throw new Error('Agent Root presentation version is unsupported.');
  }
  if (record['kind'] === 'draft') {
    requireExactKeys(record, ['schemaVersion', 'kind', 'draftId', 'scope']);
    const draftId = requireIdentity(record['draftId'], 'draft');
    const scope = parseAgentAuthorityScopeProjection(record['scope']);
    if (scope.kind === 'unbound' && scope.draftId !== draftId) {
      throw new Error('Agent unbound authority scope does not match its draft identity.');
    }
    return {
      schemaVersion: AGENT_ROOT_PRESENTATION_VERSION,
      kind: 'draft',
      draftId,
      scope,
    };
  }
  if (record['kind'] === 'session') {
    requireExactKeys(record, ['schemaVersion', 'kind', 'scope', 'conversationId']);
    const scope = parseAgentAuthorityScopeProjection(record['scope']);
    if (scope.kind === 'unbound') {
      throw new Error('Agent session presentation requires a bound authority scope.');
    }
    return {
      schemaVersion: AGENT_ROOT_PRESENTATION_VERSION,
      kind: 'session',
      scope,
      conversationId: requireIdentity(record['conversationId'], 'conversation'),
    };
  }
  throw new Error(`Unknown Agent Root presentation kind '${String(record['kind'])}'.`);
}

export function parseAgentAuthorityScopeProjection(value: unknown): AgentAuthorityScopeProjection {
  const record = requireRecord(value, 'Agent authority scope must be an object.');
  if (record['kind'] === 'unbound') {
    requireExactKeys(record, ['kind', 'draftId']);
    return { kind: 'unbound', draftId: requireIdentity(record['draftId'], 'draft') };
  }
  if (record['kind'] === 'assistant') {
    requireExactKeys(record, ['kind', 'assistantSpaceId']);
    return {
      kind: 'assistant',
      assistantSpaceId: requireIdentity(record['assistantSpaceId'], 'Assistant Space'),
    };
  }
  if (record['kind'] === 'workspace') {
    requireExactKeys(record, ['kind', 'workspaceId', 'workspaceGrantId']);
    return {
      kind: 'workspace',
      workspaceId: requireIdentity(record['workspaceId'], 'Workspace'),
      workspaceGrantId: requireIdentity(record['workspaceGrantId'], 'Workspace grant'),
    };
  }
  throw new Error(`Unknown Agent authority scope '${String(record['kind'])}'.`);
}

function requireRecord(value: unknown, message: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(message);
  return value as Readonly<Record<string, unknown>>;
}

function requireExactKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): void {
  if (
    Object.keys(record).length !== keys.length ||
    Object.keys(record).some((key) => !keys.includes(key))
  ) {
    throw new Error('Agent Root presentation contains unsupported fields.');
  }
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Agent ${label} identity is required.`);
  }
  return value;
}
