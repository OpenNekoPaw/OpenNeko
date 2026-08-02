import { useEffect, useMemo, useRef } from 'react';
import { collectKeyboardBoundaryPath } from './boundary';
import { isComposingKeyboardEvent, isEditableTarget } from './editable-target';
import {
  matchesShortcutKeySpec,
  normalizeKeyboardEventKey,
  serializeShortcutKeySpec,
} from './key-spec';
import type {
  KeyboardBoundarySnapshot,
  KeyboardDispatchResult,
  KeyboardDispatcherOptions,
  KeyboardScope,
  ShortcutBinding,
} from './types';

const SCOPE_PRIORITY: Readonly<Record<string, number>> = {
  'text-input': 100,
  modal: 90,
  menu: 90,
  popover: 90,
  'inline-editor': 80,
  'property-panel': 70,
  tree: 70,
  node: 60,
  container: 60,
  timeline: 50,
  canvas: 40,
  viewport: 40,
  editor: 10,
};

export class DuplicateShortcutBindingError extends Error {
  constructor(readonly diagnostics: readonly string[]) {
    super(`Duplicate shortcut bindings: ${diagnostics.join('; ')}`);
    this.name = 'DuplicateShortcutBindingError';
  }
}

export function useKeyboardDispatcher<S extends Record<string, unknown> = Record<string, unknown>>(
  bindings: readonly ShortcutBinding<S>[],
  state: S,
  options: KeyboardDispatcherOptions = {},
): void {
  const {
    capture = true,
    enabled = true,
    eventType = 'keydown',
    isMac,
    stopOnComposition,
    stopOnEditableTarget,
    target,
    validateDuplicates = true,
  } = options;
  const diagnostics = useMemo(
    () => (validateDuplicates ? validateShortcutBindings(bindings) : []),
    [bindings, validateDuplicates],
  );

  if (diagnostics.length > 0 && shouldThrowDuplicateShortcutDiagnostics()) {
    throw new DuplicateShortcutBindingError(diagnostics);
  }

  const latestRef = useRef({
    bindings,
    enabled,
    isMac,
    state,
    stopOnComposition,
    stopOnEditableTarget,
    validateDuplicates,
  });
  latestRef.current = {
    bindings,
    enabled,
    isMac,
    state,
    stopOnComposition,
    stopOnEditableTarget,
    validateDuplicates,
  };

  useEffect(() => {
    const listenerTarget = target ?? (typeof window === 'undefined' ? null : window);
    if (!listenerTarget) {
      return undefined;
    }

    const handleKeyEvent = (event: Event): void => {
      if (event instanceof KeyboardEvent) {
        const latest = latestRef.current;
        dispatchKeyboardShortcut(event, latest.bindings, latest.state, {
          enabled: latest.enabled,
          isMac: latest.isMac,
          stopOnComposition: latest.stopOnComposition,
          stopOnEditableTarget: latest.stopOnEditableTarget,
          validateDuplicates: latest.validateDuplicates,
        });
      }
    };

    listenerTarget.addEventListener(eventType, handleKeyEvent, {
      capture,
    });

    return () => {
      listenerTarget.removeEventListener(eventType, handleKeyEvent, {
        capture,
      });
    };
  }, [capture, eventType, target]);
}

export function dispatchKeyboardShortcut<
  S extends Record<string, unknown> = Record<string, unknown>,
>(
  event: KeyboardEvent,
  bindings: readonly ShortcutBinding<S>[],
  state: S,
  options: KeyboardDispatcherOptions = {},
): KeyboardDispatchResult<S> {
  const diagnostics =
    options.validateDuplicates === false ? [] : validateShortcutBindings(bindings);

  if (diagnostics.length > 0) {
    return { outcome: 'duplicate-shortcut', diagnostics };
  }

  if (options.enabled === false) {
    return { outcome: 'stopped-unfocused', diagnostics };
  }

  if ((options.stopOnComposition ?? true) && isComposingKeyboardEvent(event)) {
    const hasCompositionOwner = bindings.some(
      (binding) =>
        binding.allowComposition &&
        binding.when?.(state) !== false &&
        matchesShortcutKeySpec(binding.key, event, { isMac: options.isMac }),
    );

    if (!hasCompositionOwner) {
      return { outcome: 'stopped-composing', diagnostics };
    }
  }

  if ((options.stopOnEditableTarget ?? true) && isEditableTarget(event.target)) {
    const hasEditableOwner = bindings.some(
      (binding) =>
        binding.allowEditableTarget &&
        binding.when?.(state) !== false &&
        matchesShortcutKeySpec(binding.key, event, { isMac: options.isMac }),
    );

    if (!hasEditableOwner) {
      return { outcome: 'stopped-editable', diagnostics };
    }
  }

  const boundaryPath = collectKeyboardBoundaryPath(event.target);
  if (isOwnedByInnerBoundary(event, boundaryPath, bindings, { isMac: options.isMac })) {
    return { outcome: 'stopped-owned-boundary', diagnostics };
  }

  const candidates = bindings
    .filter((binding) => binding.when?.(state) !== false)
    .filter((binding) => matchesShortcutKeySpec(binding.key, event, { isMac: options.isMac }))
    .map((binding) => ({
      binding,
      boundary: resolveBindingBoundary(binding, boundaryPath),
    }))
    .sort((left, right) => compareCandidates(left, right));

  const winner = candidates[0];
  if (!winner) {
    return { outcome: 'ignored', diagnostics };
  }

  if (winner.binding.preventDefault !== false) {
    event.preventDefault();
  }
  if (winner.binding.stopPropagation !== false) {
    event.stopPropagation();
  }

  winner.binding.run({
    event,
    state,
    binding: winner.binding,
    boundary: winner.boundary.boundary,
    boundaryPath,
  });

  return {
    outcome: 'handled',
    binding: winner.binding,
    boundary: winner.boundary.boundary,
    diagnostics,
  };
}

export function validateShortcutBindings<
  S extends Record<string, unknown> = Record<string, unknown>,
>(bindings: readonly ShortcutBinding<S>[]): readonly string[] {
  const seen = new Map<string, string>();
  const diagnostics: string[] = [];

  for (const binding of bindings) {
    const key = [binding.ownerId ?? '*', binding.scope, serializeShortcutKeySpec(binding.key)].join(
      '::',
    );
    const existing = seen.get(key);

    if (existing) {
      diagnostics.push(
        `${binding.scope}/${binding.ownerId ?? '*'} ${key}: ${existing}, ${binding.id}`,
      );
      continue;
    }

    seen.set(key, binding.id);
  }

  return diagnostics;
}

function resolveBindingBoundary<S extends Record<string, unknown> = Record<string, unknown>>(
  binding: ShortcutBinding<S>,
  boundaryPath: readonly KeyboardBoundarySnapshot[],
): {
  readonly boundary?: KeyboardBoundarySnapshot;
  readonly boundaryIndex: number;
  readonly priority: number;
} {
  const boundaryIndex = boundaryPath.findIndex((boundary) => {
    if (boundary.scope !== binding.scope) {
      return false;
    }

    return !binding.ownerId || boundary.ownerId === binding.ownerId;
  });
  const boundary = boundaryIndex >= 0 ? boundaryPath[boundaryIndex] : undefined;

  return {
    boundary,
    boundaryIndex: boundaryIndex >= 0 ? boundaryIndex : Number.MAX_SAFE_INTEGER,
    priority: (binding.priority ?? 0) + (boundary?.priority ?? 0) + getScopePriority(binding.scope),
  };
}

function compareCandidates<S extends Record<string, unknown> = Record<string, unknown>>(
  left: {
    readonly binding: ShortcutBinding<S>;
    readonly boundary: {
      readonly boundary?: KeyboardBoundarySnapshot;
      readonly boundaryIndex: number;
      readonly priority: number;
    };
  },
  right: {
    readonly binding: ShortcutBinding<S>;
    readonly boundary: {
      readonly boundary?: KeyboardBoundarySnapshot;
      readonly boundaryIndex: number;
      readonly priority: number;
    };
  },
): number {
  if (left.boundary.boundaryIndex !== right.boundary.boundaryIndex) {
    return left.boundary.boundaryIndex - right.boundary.boundaryIndex;
  }

  if (left.boundary.priority !== right.boundary.priority) {
    return right.boundary.priority - left.boundary.priority;
  }

  return left.binding.id.localeCompare(right.binding.id);
}

function getScopePriority(scope: KeyboardScope): number {
  return SCOPE_PRIORITY[scope] ?? 0;
}

export const __keyboardDispatcherTestUtils = {
  getScopePriority,
  shouldThrowDuplicateShortcutDiagnostics,
} as const;

function isOwnedByInnerBoundary<S extends Record<string, unknown> = Record<string, unknown>>(
  event: KeyboardEvent,
  boundaryPath: readonly KeyboardBoundarySnapshot[],
  bindings: readonly ShortcutBinding<S>[],
  options: { readonly isMac?: boolean },
): boolean {
  const owningBoundaryIndex = boundaryPath.findIndex((boundary) =>
    boundary.ownedKeys.includes(normalizeKeyboardEventKey(event)),
  );

  if (owningBoundaryIndex < 0) {
    return false;
  }

  return bindings
    .filter((binding) => matchesShortcutKeySpec(binding.key, event, { isMac: options.isMac }))
    .every((binding) => {
      const bindingBoundaryIndex = boundaryPath.findIndex((boundary) => {
        if (boundary.scope !== binding.scope) {
          return false;
        }
        return !binding.ownerId || boundary.ownerId === binding.ownerId;
      });

      return bindingBoundaryIndex < 0 || bindingBoundaryIndex > owningBoundaryIndex;
    });
}

function shouldThrowDuplicateShortcutDiagnostics(env = readRuntimeEnv()): boolean {
  if (env.nodeEnv === 'production' || env.mode === 'production' || env.prod === true) {
    return false;
  }

  return (
    env.dev === true ||
    env.mode === 'development' ||
    env.mode === 'test' ||
    env.nodeEnv === 'development' ||
    env.nodeEnv === 'test' ||
    env.vitest === true
  );
}

function readRuntimeEnv(): {
  readonly dev?: boolean;
  readonly mode?: string;
  readonly nodeEnv?: string;
  readonly prod?: boolean;
  readonly vitest?: boolean;
} {
  const importMetaEnv = readRecord(readRecord(import.meta)?.env);
  const processEnv = readRecord(readRecord(readRecord(globalThis)?.process)?.env);

  return {
    dev: readBoolean(importMetaEnv, 'DEV'),
    mode: readString(importMetaEnv, 'MODE'),
    nodeEnv: readString(processEnv, 'NODE_ENV'),
    prod: readBoolean(importMetaEnv, 'PROD'),
    vitest: readBoolean(importMetaEnv, 'VITEST') ?? Boolean(readString(processEnv, 'VITEST')),
  };
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function readBoolean(
  record: Record<string, unknown> | undefined,
  key: string,
): boolean | undefined {
  const value = record?.[key];
  return typeof value === 'boolean' ? value : undefined;
}

function readString(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' ? value : undefined;
}
