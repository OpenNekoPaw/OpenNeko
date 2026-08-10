import {
  parseAutomationTargetSelectionDecision,
  parseAutomationTargetSelectionProjection,
  type AutomationTargetSelectionProjection,
  type AutomationTargetSelectionResult,
} from '@neko/automation-contracts/target-selection';
import type { AutomationTargetSelectionPort } from './session-authorization';

export interface AutomationTargetSelectionScope {
  readonly workspaceId: string;
  readonly conversationId: string;
}

export interface AutomationTargetSelectionCoordinator extends AutomationTargetSelectionPort {
  listPending(
    scope: AutomationTargetSelectionScope,
  ): readonly AutomationTargetSelectionProjection[];
  resolve(scope: AutomationTargetSelectionScope, decision: unknown): void;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

interface PendingSelection {
  readonly projection: AutomationTargetSelectionProjection;
  readonly resolve: (result: AutomationTargetSelectionResult | undefined) => void;
  readonly reject: (error: Error) => void;
  readonly signal?: AbortSignal;
  readonly onAbort?: () => void;
}

export function createAutomationTargetSelectionCoordinator(): AutomationTargetSelectionCoordinator {
  const pending = new Map<string, PendingSelection>();
  const listeners = new Set<() => void>();
  let disposed = false;

  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  const remove = (authorizationId: string): PendingSelection | undefined => {
    const current = pending.get(authorizationId);
    if (!current) return undefined;
    pending.delete(authorizationId);
    if (current.signal && current.onAbort) {
      current.signal.removeEventListener('abort', current.onAbort);
    }
    notify();
    return current;
  };

  return {
    select(input, signal) {
      if (disposed) {
        return Promise.reject(new Error('Automation target selection coordinator is disposed.'));
      }
      const projection = parseAutomationTargetSelectionProjection(input);
      if (pending.has(projection.authorizationId)) {
        return Promise.reject(
          new Error(
            `Automation target authorization '${projection.authorizationId}' is already pending.`,
          ),
        );
      }
      if (signal?.aborted) return Promise.reject(abortError(signal));
      return new Promise<AutomationTargetSelectionResult | undefined>((resolve, reject) => {
        const onAbort = signal
          ? () => {
              const current = remove(projection.authorizationId);
              if (current) current.reject(abortError(signal));
            }
          : undefined;
        pending.set(projection.authorizationId, {
          projection,
          resolve,
          reject,
          ...(signal === undefined ? {} : { signal }),
          ...(onAbort === undefined ? {} : { onAbort }),
        });
        if (signal && onAbort) {
          signal.addEventListener('abort', onAbort, { once: true });
        }
        notify();
      });
    },
    listPending(scope) {
      const owner = parseScope(scope);
      return Object.freeze(
        [...pending.values()]
          .map((item) => item.projection)
          .filter(
            (projection) =>
              projection.owner.workspaceId === owner.workspaceId &&
              projection.owner.conversationId === owner.conversationId,
          ),
      );
    },
    resolve(scope, input) {
      const owner = parseScope(scope);
      const decision = parseAutomationTargetSelectionDecision(input);
      const current = pending.get(decision.authorizationId);
      if (!current) {
        throw new Error('Automation target selection is unavailable or already resolved.');
      }
      if (
        current.projection.owner.workspaceId !== owner.workspaceId ||
        current.projection.owner.conversationId !== owner.conversationId
      ) {
        throw new Error('Automation target selection owner is stale.');
      }
      if (
        decision.decision === 'select' &&
        !current.projection.candidates.some(
          (candidate) => candidate.targetKey === decision.targetKey,
        )
      ) {
        throw new Error('Automation target selection did not choose an eligible target.');
      }
      const removed = remove(decision.authorizationId);
      if (!removed) {
        throw new Error('Automation target selection is unavailable or already resolved.');
      }
      removed.resolve(
        decision.decision === 'select'
          ? {
              authorizationId: decision.authorizationId,
              targetKey: decision.targetKey,
            }
          : undefined,
      );
    },
    subscribe(listener) {
      if (disposed) throw new Error('Automation target selection coordinator is disposed.');
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const current = [...pending.keys()];
      for (const authorizationId of current) {
        remove(authorizationId)?.reject(
          new Error('Automation target selection coordinator was disposed.'),
        );
      }
      listeners.clear();
    },
  };
}

function parseScope(value: unknown): AutomationTargetSelectionScope {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Automation target selection scope must be an object.');
  }
  const record = value as Readonly<Record<string, unknown>>;
  if (
    Object.keys(record).length !== 2 ||
    !Object.hasOwn(record, 'workspaceId') ||
    !Object.hasOwn(record, 'conversationId')
  ) {
    throw new Error('Automation target selection scope has unsupported or missing fields.');
  }
  return {
    workspaceId: identity(record['workspaceId'], 'Workspace'),
    conversationId: identity(record['conversationId'], 'Conversation'),
  };
}

function identity(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.trim() ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(value)
  ) {
    throw new Error(`${label} identity is invalid.`);
  }
  return value;
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error('Automation target selection was aborted.');
}
