import {
  formatChildRunScope,
  formatRunScope,
  validateChildRunScope,
  validateConversationRunScope,
  type ChildRunScope,
  type ConversationRunScope,
  type RuntimeScopeDiagnosticCode,
} from '@neko-agent/types';

export type ConversationRunRegistryErrorCode =
  | RuntimeScopeDiagnosticCode
  | 'duplicate-runtime-scope'
  | 'runtime-scope-not-found'
  | 'runtime-scope-has-active-children'
  | 'runtime-registry-disposed';

export class ConversationRunRegistryError extends Error {
  constructor(
    readonly code: ConversationRunRegistryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ConversationRunRegistryError';
  }
}

export interface ConversationRunCancellationHandle<TScope extends ConversationRunScope> {
  readonly scope: TScope;
  readonly signal: AbortSignal;
}

export interface ConversationRunRegistry {
  readonly conversationId: string;
  readonly disposed: boolean;
  registerRun(
    scope: ConversationRunScope,
    onCancel: (reason?: unknown) => void,
  ): ConversationRunCancellationHandle<ConversationRunScope>;
  registerChild(
    scope: ChildRunScope,
    onCancel: (reason?: unknown) => void,
  ): ConversationRunCancellationHandle<ChildRunScope>;
  hasRun(scope: ConversationRunScope): boolean;
  hasChild(scope: ChildRunScope): boolean;
  completeRun(scope: ConversationRunScope): void;
  completeChild(scope: ChildRunScope): void;
  cancelRun(scope: ConversationRunScope, reason?: unknown): void;
  cancelChild(scope: ChildRunScope, reason?: unknown): void;
  dispose(reason?: unknown): void;
}

export function createConversationRunRegistry(conversationId: string): ConversationRunRegistry {
  return new DefaultConversationRunRegistry(conversationId);
}

interface RunNode<TScope extends ConversationRunScope = ConversationRunScope> {
  readonly key: string;
  readonly scope: TScope;
  readonly parentKey?: string;
  readonly children: Set<string>;
  readonly controller: AbortController;
  readonly onCancel: (reason?: unknown) => void;
}

class DefaultConversationRunRegistry implements ConversationRunRegistry {
  private readonly nodes = new Map<string, RunNode>();
  private _disposed = false;

  constructor(readonly conversationId: string) {
    if (conversationId.trim().length === 0) {
      throw new ConversationRunRegistryError(
        'invalid-runtime-scope',
        'conversationId is required for a conversation run registry.',
      );
    }
  }

  get disposed(): boolean {
    return this._disposed;
  }

  registerRun(
    scope: ConversationRunScope,
    onCancel: (reason?: unknown) => void,
  ): ConversationRunCancellationHandle<ConversationRunScope> {
    this.assertActive();
    const validated = validateConversationRunScope(scope);
    if (!validated.ok) throw diagnosticError(validated.diagnostic);
    this.assertOwner(validated.scope);
    const key = runKey(validated.scope);
    this.assertUnique(key, formatRunScope(validated.scope));
    const node = createNode(key, validated.scope, onCancel);
    this.nodes.set(key, node);
    return { scope: node.scope, signal: node.controller.signal };
  }

  registerChild(
    scope: ChildRunScope,
    onCancel: (reason?: unknown) => void,
  ): ConversationRunCancellationHandle<ChildRunScope> {
    this.assertActive();
    const validated = validateChildRunScope(scope);
    if (!validated.ok) throw diagnosticError(validated.diagnostic);
    this.assertOwner(validated.scope);
    const parent = this.requireParent(validated.scope);
    const key = childKey(validated.scope);
    this.assertUnique(key, formatChildRunScope(validated.scope));
    const node = createNode(key, validated.scope, onCancel, parent.key);
    this.nodes.set(key, node);
    parent.children.add(key);
    return { scope: node.scope, signal: node.controller.signal };
  }

  hasRun(scope: ConversationRunScope): boolean {
    const validated = this.requireRunScope(scope);
    return this.nodes.has(runKey(validated));
  }

  hasChild(scope: ChildRunScope): boolean {
    const validated = this.requireChildScope(scope);
    return this.nodes.has(childKey(validated));
  }

  completeRun(scope: ConversationRunScope): void {
    this.completeNode(runKey(this.requireRunScope(scope)), formatRunScope(scope));
  }

  completeChild(scope: ChildRunScope): void {
    this.completeNode(childKey(this.requireChildScope(scope)), formatChildRunScope(scope));
  }

  cancelRun(scope: ConversationRunScope, reason?: unknown): void {
    const validated = this.requireRunScope(scope);
    this.cancelNode(this.requireNode(runKey(validated), formatRunScope(validated)), reason);
  }

  cancelChild(scope: ChildRunScope, reason?: unknown): void {
    const validated = this.requireChildScope(scope);
    this.cancelNode(this.requireNode(childKey(validated), formatChildRunScope(validated)), reason);
  }

  dispose(reason?: unknown): void {
    if (this._disposed) return;
    this._disposed = true;
    const errors: unknown[] = [];
    const roots = Array.from(this.nodes.values()).filter((node) => node.parentKey === undefined);
    for (const root of roots) {
      try {
        this.cancelNode(root, reason);
      } catch (error) {
        errors.push(error);
      }
    }
    this.nodes.clear();
    throwCollectedErrors(
      errors,
      `Conversation run registry ${this.conversationId} failed to dispose.`,
    );
  }

  private completeNode(key: string, label: string): void {
    this.assertActive();
    const node = this.requireNode(key, label);
    if (node.children.size > 0) {
      throw new ConversationRunRegistryError(
        'runtime-scope-has-active-children',
        `Runtime scope ${label} still has active children.`,
      );
    }
    this.detachNode(node);
  }

  private cancelNode(node: RunNode, reason?: unknown): void {
    const errors: unknown[] = [];
    for (const childKey of Array.from(node.children)) {
      const child = this.nodes.get(childKey);
      if (!child) {
        errors.push(
          new ConversationRunRegistryError(
            'runtime-scope-not-found',
            `Cancellation tree child ${childKey} is missing.`,
          ),
        );
        continue;
      }
      try {
        this.cancelNode(child, reason);
      } catch (error) {
        errors.push(error);
      }
    }
    if (!node.controller.signal.aborted) {
      node.controller.abort(reason);
      try {
        node.onCancel(reason);
      } catch (error) {
        errors.push(error);
      }
    }
    this.detachNode(node);
    throwCollectedErrors(errors, `Runtime scope ${node.key} failed to cancel.`);
  }

  private requireParent(scope: ChildRunScope): RunNode {
    const root = this.nodes.get(runKey(scope));
    if (!root) {
      throw new ConversationRunRegistryError(
        'runtime-scope-not-found',
        `Parent Agent run ${formatRunScope(scope)} is not registered.`,
      );
    }
    if (scope.parentRunId === scope.runId) return root;

    const matches = Array.from(this.nodes.values()).filter(
      (node) =>
        node.parentKey !== undefined &&
        node.scope.runId === scope.runId &&
        'childRunId' in node.scope &&
        node.scope.childRunId === scope.parentRunId,
    );
    const [parent] = matches;
    if (matches.length !== 1 || !parent) {
      throw new ConversationRunRegistryError(
        'runtime-scope-not-found',
        `Parent child run ${scope.parentRunId} is not uniquely registered under ${formatRunScope(scope)}.`,
      );
    }
    return parent;
  }

  private detachNode(node: RunNode): void {
    this.nodes.delete(node.key);
    if (node.parentKey) this.nodes.get(node.parentKey)?.children.delete(node.key);
  }

  private requireRunScope(scope: ConversationRunScope): ConversationRunScope {
    this.assertActive();
    const validated = validateConversationRunScope(scope);
    if (!validated.ok) throw diagnosticError(validated.diagnostic);
    this.assertOwner(validated.scope);
    return validated.scope;
  }

  private requireChildScope(scope: ChildRunScope): ChildRunScope {
    this.assertActive();
    const validated = validateChildRunScope(scope);
    if (!validated.ok) throw diagnosticError(validated.diagnostic);
    this.assertOwner(validated.scope);
    return validated.scope;
  }

  private assertOwner(scope: ConversationRunScope): void {
    if (scope.conversationId !== this.conversationId) {
      throw new ConversationRunRegistryError(
        'runtime-scope-owner-mismatch',
        `Runtime scope owner mismatch: registry ${this.conversationId}, received ${formatRunScope(scope)}.`,
      );
    }
  }

  private assertUnique(key: string, label: string): void {
    if (this.nodes.has(key)) {
      throw new ConversationRunRegistryError(
        'duplicate-runtime-scope',
        `Runtime scope ${label} is already registered.`,
      );
    }
  }

  private requireNode(key: string, label: string): RunNode {
    const node = this.nodes.get(key);
    if (!node) {
      throw new ConversationRunRegistryError(
        'runtime-scope-not-found',
        `Runtime scope ${label} is not registered.`,
      );
    }
    return node;
  }

  private assertActive(): void {
    if (this._disposed) {
      throw new ConversationRunRegistryError(
        'runtime-registry-disposed',
        `Conversation run registry ${this.conversationId} is disposed.`,
      );
    }
  }
}

function createNode<TScope extends ConversationRunScope>(
  key: string,
  scope: TScope,
  onCancel: (reason?: unknown) => void,
  parentKey?: string,
): RunNode<TScope> {
  return {
    key,
    scope: Object.freeze({ ...scope }),
    ...(parentKey ? { parentKey } : {}),
    children: new Set(),
    controller: new AbortController(),
    onCancel,
  };
}

function runKey(scope: ConversationRunScope): string {
  return `run:${formatRunScope(scope)}`;
}

function childKey(scope: ChildRunScope): string {
  return `child:${formatChildRunScope(scope)}`;
}

function diagnosticError(diagnostic: {
  readonly code: RuntimeScopeDiagnosticCode;
  readonly message: string;
}): ConversationRunRegistryError {
  return new ConversationRunRegistryError(diagnostic.code, diagnostic.message);
}

function throwCollectedErrors(errors: readonly unknown[], message: string): void {
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, message);
}
