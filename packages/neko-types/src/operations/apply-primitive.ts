// =============================================================================
// Apply Primitive — common contract over every kind of Apply
// =============================================================================
//
// See: docs/architecture/agent-unified-workflow.md §2, §11.6
//      plan v2 P2 W6 (Apply primitive abstraction)
//
// Background: every sub-package (sketch, canvas, audio, timeline, etc.)
// has its own `applyXxxOperation(data, op)` function. Q3's
// recovery guidance and Q4's Puppet/Model Operations will both need to say
// "Apply this operation" without caring which sub-system owns it.
//
// This module provides:
//   1. A generic `ApplyFn<TData, TOp>` type — every existing apply
//      function already conforms.
//   2. An `ApplyDescriptor<TData, TOp>` that pairs the function with
//      an operation-kind discriminator.
//   3. A tiny `ApplyRegistry` so callers can dispatch by kind string
//      (`'sketch.layer.add'`, `'canvas.node.update'`, ...) without
//      importing every concrete module.
//
// Pure types + in-memory registry. No side effects.
// =============================================================================

// =============================================================================
// Generic Apply contract
// =============================================================================

/** Every apply-* function has this shape: (data, op) → newData. */
export type ApplyFn<TData, TOp> = (data: TData, op: TOp) => TData;

/**
 * Metadata around an apply function. Used by recovery guidance + Operation
 * layer to route a generic Apply request to the right sub-system.
 */
export interface ApplyDescriptor<TData = unknown, TOp = unknown> {
  /** Namespace key — e.g. 'sketch', 'canvas', 'audio', 'timeline'. */
  namespace: string;
  /**
   * Whether running the same op twice produces the same result (pure
   * functional apply) or whether it has side effects the caller must
   * guard against (e.g. remote API calls).
   *
   * Recovery flows only reuse descriptors where this is true.
   */
  idempotent: boolean;
  /**
   * Whether the op produces a destructive change (delete / overwrite).
   * Destructive ops go through ApprovalEngine before Apply.
   */
  destructive: boolean;
  /** The apply function itself. */
  apply: ApplyFn<TData, TOp>;
}

// =============================================================================
// Registry
// =============================================================================

export interface IApplyRegistry {
  /** Register a descriptor under its namespace. Throws on duplicate. */
  register<TData, TOp>(key: string, descriptor: ApplyDescriptor<TData, TOp>): void;
  /** Look up a descriptor; returns undefined if unknown. */
  get<TData = unknown, TOp = unknown>(key: string): ApplyDescriptor<TData, TOp> | undefined;
  /** List all registered namespace keys (stable order: insertion). */
  list(): readonly string[];
  /** Remove a descriptor. No-op if absent. */
  unregister(key: string): void;
}

class ApplyRegistry implements IApplyRegistry {
  private readonly _items = new Map<string, ApplyDescriptor>();

  register<TData, TOp>(key: string, descriptor: ApplyDescriptor<TData, TOp>): void {
    if (this._items.has(key)) {
      throw new Error(`ApplyRegistry: duplicate key "${key}"`);
    }
    this._items.set(key, descriptor as ApplyDescriptor);
  }

  get<TData = unknown, TOp = unknown>(key: string): ApplyDescriptor<TData, TOp> | undefined {
    return this._items.get(key) as ApplyDescriptor<TData, TOp> | undefined;
  }

  list(): readonly string[] {
    const out: string[] = [];
    this._items.forEach((_, key) => out.push(key));
    return out;
  }

  unregister(key: string): void {
    this._items.delete(key);
  }
}

export function createApplyRegistry(): IApplyRegistry {
  return new ApplyRegistry();
}
