import { validateChildRunScope, type ChildRunScope, type TaskRunScope } from '@neko/shared';

export type PersistedChildRunRecordKind = 'task' | 'task-recovery' | 'subagent-ref';
export type PersistedChildRunOwnershipFailure =
  'missing-scope' | 'invalid-scope' | 'child-kind-mismatch' | 'local-id-mismatch';

export interface PersistedChildRunOwnershipDiagnostic {
  readonly code: 'agent-persisted-child-run-ownership-ambiguous';
  readonly recordKind: PersistedChildRunRecordKind;
  readonly failure: PersistedChildRunOwnershipFailure;
  readonly source: string;
  readonly recordIndex: number;
  readonly localId?: string;
}

export class PersistedChildRunOwnershipError extends Error {
  override readonly name = 'PersistedChildRunOwnershipError';
  readonly diagnostic: PersistedChildRunOwnershipDiagnostic;

  constructor(diagnostic: PersistedChildRunOwnershipDiagnostic) {
    const localId = diagnostic.localId ? ` (${diagnostic.localId})` : '';
    super(
      `Persisted ${diagnostic.recordKind} record${localId} at ${diagnostic.source}[${diagnostic.recordIndex}] has ambiguous runtime ownership (${diagnostic.failure}); the record was preserved and requires migration.`,
    );
    this.diagnostic = diagnostic;
  }

  get code(): PersistedChildRunOwnershipDiagnostic['code'] {
    return this.diagnostic.code;
  }
}

interface RequirePersistedChildRunScopeInput {
  readonly value: unknown;
  readonly recordKind: PersistedChildRunRecordKind;
  readonly source: string;
  readonly recordIndex: number;
  readonly localId?: string;
  readonly expectedChildKind: 'task' | 'subagent';
}

export function requirePersistedTaskRunScope(
  input: Omit<RequirePersistedChildRunScopeInput, 'expectedChildKind'>,
): TaskRunScope {
  const scope = requirePersistedChildRunScope({ ...input, expectedChildKind: 'task' });
  if (scope.childKind !== 'task') {
    throw createOwnershipError(input, 'child-kind-mismatch');
  }
  return {
    conversationId: scope.conversationId,
    runId: scope.runId,
    parentRunId: scope.parentRunId,
    childRunId: scope.childRunId,
    childKind: 'task',
  };
}

export function requirePersistedSubAgentRunScope(
  input: Omit<RequirePersistedChildRunScopeInput, 'expectedChildKind'>,
): ChildRunScope {
  const scope = requirePersistedChildRunScope({ ...input, expectedChildKind: 'subagent' });
  if (scope.childKind !== 'subagent') {
    throw createOwnershipError(input, 'child-kind-mismatch');
  }
  return scope;
}

function requirePersistedChildRunScope(input: RequirePersistedChildRunScopeInput): ChildRunScope {
  if (input.value === undefined || input.value === null) {
    throw createOwnershipError(input, 'missing-scope');
  }

  const result = validateChildRunScope(input.value);
  if (!result.ok) {
    throw createOwnershipError(input, 'invalid-scope');
  }
  if (result.scope.childKind !== input.expectedChildKind) {
    throw createOwnershipError(input, 'child-kind-mismatch');
  }
  if (input.localId !== undefined && result.scope.childRunId !== input.localId) {
    throw createOwnershipError(input, 'local-id-mismatch');
  }
  return result.scope;
}

function createOwnershipError(
  input: Omit<RequirePersistedChildRunScopeInput, 'expectedChildKind'>,
  failure: PersistedChildRunOwnershipFailure,
): PersistedChildRunOwnershipError {
  return new PersistedChildRunOwnershipError({
    code: 'agent-persisted-child-run-ownership-ambiguous',
    recordKind: input.recordKind,
    failure,
    source: input.source,
    recordIndex: input.recordIndex,
    ...(input.localId ? { localId: input.localId } : {}),
  });
}
