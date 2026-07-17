/**
 * Layer-0 ownership contracts for conversation-scoped Agent execution.
 *
 * Local run identifiers are intentionally insufficient at runtime boundaries.
 * Callers must carry the complete owner scope for lookup, mutation, cancellation,
 * persistence, and recovery.
 */

export interface ConversationRunScope {
  readonly conversationId: string;
  readonly runId: string;
}

export type ChildRunKind = 'subagent' | 'task';

export interface ChildRunScope extends ConversationRunScope {
  readonly parentRunId: string;
  readonly childRunId: string;
  readonly childKind: ChildRunKind;
}

export type RuntimeScopeDiagnosticCode = 'invalid-runtime-scope' | 'runtime-scope-owner-mismatch';

export interface RuntimeScopeDiagnostic {
  readonly code: RuntimeScopeDiagnosticCode;
  readonly severity: 'error';
  readonly message: string;
  readonly expected?: ConversationRunScope;
  readonly actual?: ConversationRunScope;
}

export type RuntimeScopeValidationResult<TScope> =
  | { readonly ok: true; readonly scope: TScope }
  | { readonly ok: false; readonly diagnostic: RuntimeScopeDiagnostic };

export function validateConversationRunScope(
  value: unknown,
): RuntimeScopeValidationResult<ConversationRunScope> {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.conversationId) ||
    !isNonEmptyString(value.runId)
  ) {
    return {
      ok: false,
      diagnostic: {
        code: 'invalid-runtime-scope',
        severity: 'error',
        message: 'Agent run scope requires non-empty conversationId and runId.',
      },
    };
  }
  return {
    ok: true,
    scope: {
      conversationId: value.conversationId,
      runId: value.runId,
    },
  };
}

export function validateChildRunScope(value: unknown): RuntimeScopeValidationResult<ChildRunScope> {
  const runScope = validateConversationRunScope(value);
  if (!runScope.ok) {
    return { ok: false, diagnostic: runScope.diagnostic };
  }
  if (!isRecord(value)) {
    return {
      ok: false,
      diagnostic: {
        code: 'invalid-runtime-scope',
        severity: 'error',
        message: 'Child run scope must be an object.',
      },
    };
  }
  if (
    !isNonEmptyString(value.parentRunId) ||
    !isNonEmptyString(value.childRunId) ||
    (value.childKind !== 'subagent' && value.childKind !== 'task')
  ) {
    return {
      ok: false,
      diagnostic: {
        code: 'invalid-runtime-scope',
        severity: 'error',
        message:
          'Child run scope requires non-empty parentRunId and childRunId plus a valid childKind.',
      },
    };
  }
  return {
    ok: true,
    scope: {
      ...runScope.scope,
      parentRunId: value.parentRunId,
      childRunId: value.childRunId,
      childKind: value.childKind,
    },
  };
}

export function validateRuntimeScopeOwner(
  expected: ConversationRunScope,
  actual: ConversationRunScope,
): RuntimeScopeValidationResult<ConversationRunScope> {
  if (expected.conversationId !== actual.conversationId || expected.runId !== actual.runId) {
    return {
      ok: false,
      diagnostic: {
        code: 'runtime-scope-owner-mismatch',
        severity: 'error',
        message: `Runtime scope owner mismatch: expected ${formatRunScope(expected)}, received ${formatRunScope(actual)}.`,
        expected,
        actual,
      },
    };
  }
  return { ok: true, scope: actual };
}

export function formatRunScope(scope: ConversationRunScope): string {
  return `${scope.conversationId}/${scope.runId}`;
}

export function formatChildRunScope(scope: ChildRunScope): string {
  return `${formatRunScope(scope)}/${scope.parentRunId}/${scope.childKind}:${scope.childRunId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
