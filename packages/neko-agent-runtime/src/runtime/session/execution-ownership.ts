export type ExecutionOwnerKind =
  'surface' | 'foreground-agent-run' | 'subagent-run' | 'domain-job' | 'tool-call';

export interface ExecutionRef {
  readonly kind: ExecutionOwnerKind;
  readonly instanceId: string;
  readonly executionId: string;
}

export interface ToolCallExecutionIdentity {
  readonly workspaceId: string;
  readonly conversationId: string;
  readonly branchId: string;
  readonly turnId: string;
  readonly agentRunId: string;
  readonly toolCallId: string;
}

export interface ToolCallExecution {
  readonly ref: ExecutionRef & { readonly kind: 'tool-call' };
  readonly identity: ToolCallExecutionIdentity;
  readonly signal: AbortSignal;
}

export interface OwnedExecution {
  readonly ref: ExecutionRef;
  cancel(reason: Error): void | Promise<void>;
  release(): void | Promise<void>;
}

export interface ExecutionOwnershipAttachment {
  dispose(): void;
}

export interface ExecutionOwnershipRegistry {
  attach(owner: ExecutionRef, child: OwnedExecution): ExecutionOwnershipAttachment;
  transfer(child: ExecutionRef, nextOwner: ExecutionRef): void;
  cancelOwned(owner: ExecutionRef, reason: Error): Promise<void>;
  releaseOwned(owner: ExecutionRef): Promise<void>;
  has(child: ExecutionRef): boolean;
}

interface OwnershipRecord {
  owner: ExecutionRef;
  child: OwnedExecution;
}

export class ExecutionOwnershipRegistryError extends Error {
  constructor(
    readonly code:
      'duplicate-execution' | 'execution-not-found' | 'identity-mismatch' | 'ownership-cycle',
    message: string,
  ) {
    super(message);
    this.name = 'ExecutionOwnershipRegistryError';
  }
}

export function createExecutionOwnershipRegistry(): ExecutionOwnershipRegistry {
  const records = new Map<string, OwnershipRecord>();

  const attach = (owner: ExecutionRef, child: OwnedExecution): ExecutionOwnershipAttachment => {
    assertRef(owner);
    assertRef(child.ref);
    const ownerKey = formatExecutionRef(owner);
    const childKey = formatExecutionRef(child.ref);
    if (ownerKey === childKey || ownsTransitively(records, child.ref, owner)) {
      throw new ExecutionOwnershipRegistryError(
        'ownership-cycle',
        `Execution ownership cycle rejected for ${childKey}.`,
      );
    }
    if (records.has(childKey)) {
      throw new ExecutionOwnershipRegistryError(
        'duplicate-execution',
        `Execution ${childKey} already has an owner.`,
      );
    }
    records.set(childKey, {
      owner: Object.freeze({ ...owner }),
      child,
    });
    let disposed = false;
    return Object.freeze({
      dispose: () => {
        if (disposed) return;
        disposed = true;
        const current = records.get(childKey);
        if (current?.child === child) records.delete(childKey);
      },
    });
  };

  const transfer = (child: ExecutionRef, nextOwner: ExecutionRef): void => {
    assertRef(child);
    assertRef(nextOwner);
    const childKey = formatExecutionRef(child);
    const record = records.get(childKey);
    if (!record) {
      throw new ExecutionOwnershipRegistryError(
        'execution-not-found',
        `Execution ${childKey} is not attached.`,
      );
    }
    assertSameRef(record.child.ref, child);
    if (childKey === formatExecutionRef(nextOwner) || ownsTransitively(records, child, nextOwner)) {
      throw new ExecutionOwnershipRegistryError(
        'ownership-cycle',
        `Execution ownership cycle rejected for ${childKey}.`,
      );
    }
    record.owner = Object.freeze({ ...nextOwner });
  };

  const cancelOwned = async (owner: ExecutionRef, reason: Error): Promise<void> => {
    assertRef(owner);
    const owned = findDirectChildren(records, owner);
    const failures: unknown[] = [];
    for (const record of owned) {
      try {
        await cancelOwned(record.child.ref, reason);
        await record.child.cancel(reason);
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        `Failed to cancel executions owned by ${formatExecutionRef(owner)}.`,
      );
    }
  };

  const releaseOwned = async (owner: ExecutionRef): Promise<void> => {
    assertRef(owner);
    const owned = findDirectChildren(records, owner);
    const failures: unknown[] = [];
    for (const record of owned) {
      try {
        await releaseOwned(record.child.ref);
        await record.child.release();
      } catch (error) {
        failures.push(error);
      } finally {
        records.delete(formatExecutionRef(record.child.ref));
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        `Failed to release executions owned by ${formatExecutionRef(owner)}.`,
      );
    }
  };

  return Object.freeze({
    attach,
    transfer,
    cancelOwned,
    releaseOwned,
    has: (child: ExecutionRef) => {
      assertRef(child);
      const record = records.get(formatExecutionRef(child));
      if (!record) return false;
      assertSameRef(record.child.ref, child);
      return true;
    },
  });
}

export function createToolCallExecution(
  identity: ToolCallExecutionIdentity,
  signal: AbortSignal,
): ToolCallExecution {
  assertIdentityPart(identity.workspaceId, 'workspaceId');
  assertIdentityPart(identity.conversationId, 'conversationId');
  assertIdentityPart(identity.branchId, 'branchId');
  assertIdentityPart(identity.turnId, 'turnId');
  assertIdentityPart(identity.agentRunId, 'agentRunId');
  assertIdentityPart(identity.toolCallId, 'toolCallId');
  return Object.freeze({
    ref: Object.freeze({
      kind: 'tool-call',
      instanceId: identity.conversationId,
      executionId: identity.toolCallId,
    }),
    identity: Object.freeze({ ...identity }),
    signal,
  });
}

function findDirectChildren(
  records: ReadonlyMap<string, OwnershipRecord>,
  owner: ExecutionRef,
): readonly OwnershipRecord[] {
  const ownerKey = formatExecutionRef(owner);
  return [...records.values()].filter((record) => formatExecutionRef(record.owner) === ownerKey);
}

function ownsTransitively(
  records: ReadonlyMap<string, OwnershipRecord>,
  child: ExecutionRef,
  candidateOwner: ExecutionRef,
): boolean {
  let current = records.get(formatExecutionRef(candidateOwner));
  const childKey = formatExecutionRef(child);
  const visited = new Set<string>();
  while (current) {
    const ownerKey = formatExecutionRef(current.owner);
    if (ownerKey === childKey) return true;
    if (visited.has(ownerKey)) return false;
    visited.add(ownerKey);
    current = records.get(ownerKey);
  }
  return false;
}

function assertSameRef(actual: ExecutionRef, expected: ExecutionRef): void {
  if (
    actual.kind !== expected.kind ||
    actual.instanceId !== expected.instanceId ||
    actual.executionId !== expected.executionId
  ) {
    throw new ExecutionOwnershipRegistryError(
      'identity-mismatch',
      `Execution identity mismatch: expected ${formatExecutionRef(expected)}, received ${formatExecutionRef(actual)}.`,
    );
  }
}

function assertRef(ref: ExecutionRef): void {
  assertIdentityPart(ref.kind, 'kind');
  assertIdentityPart(ref.instanceId, 'instanceId');
  assertIdentityPart(ref.executionId, 'executionId');
}

function assertIdentityPart(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new ExecutionOwnershipRegistryError(
      'identity-mismatch',
      `Execution ${field} must be non-empty.`,
    );
  }
}

function formatExecutionRef(ref: ExecutionRef): string {
  return `${ref.kind}:${ref.instanceId}:${ref.executionId}`;
}
