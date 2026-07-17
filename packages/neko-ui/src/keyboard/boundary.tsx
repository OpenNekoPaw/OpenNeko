import type React from 'react';
import { normalizeKeyboardKey } from './key-spec';
import type { KeyboardBoundarySnapshot, KeyboardKey, KeyboardScope } from './types';

export const KEYBOARD_SCOPE_ATTRIBUTE = 'data-neko-keyboard-scope';
export const KEYBOARD_OWNER_ATTRIBUTE = 'data-neko-keyboard-owner';
export const KEYBOARD_PRIORITY_ATTRIBUTE = 'data-neko-keyboard-priority';
export const KEYBOARD_FOCUSED_ATTRIBUTE = 'data-neko-keyboard-focused';
export const KEYBOARD_OWNED_KEYS_ATTRIBUTE = 'data-neko-keyboard-owned-keys';

export interface KeyboardBoundaryProps extends React.HTMLAttributes<HTMLElement> {
  readonly as?: React.ElementType;
  readonly scope: KeyboardScope;
  readonly ownerId?: string;
  readonly priority?: number;
  readonly ownedKeys?: readonly KeyboardKey[];
  readonly children: React.ReactNode;
}

export interface KeyboardBoundaryMetadataOptions {
  readonly scope: KeyboardScope;
  readonly ownerId?: string;
  readonly priority?: number;
  readonly ownedKeys?: readonly KeyboardKey[];
}

export type KeyboardBoundaryMetadata = {
  readonly [KEYBOARD_SCOPE_ATTRIBUTE]: KeyboardScope;
  readonly [KEYBOARD_OWNER_ATTRIBUTE]?: string;
  readonly [KEYBOARD_PRIORITY_ATTRIBUTE]: string;
  readonly [KEYBOARD_OWNED_KEYS_ATTRIBUTE]?: string;
};

export function KeyboardBoundary({
  as,
  children,
  ownedKeys,
  ownerId,
  priority = 0,
  scope,
  ...props
}: KeyboardBoundaryProps): React.ReactElement {
  const Component = as ?? 'div';

  return (
    <Component {...props} {...getKeyboardBoundaryMetadata({ ownedKeys, ownerId, priority, scope })}>
      {children}
    </Component>
  );
}

export function getKeyboardBoundaryMetadata({
  ownedKeys,
  ownerId,
  priority = 0,
  scope,
}: KeyboardBoundaryMetadataOptions): KeyboardBoundaryMetadata {
  return {
    [KEYBOARD_SCOPE_ATTRIBUTE]: scope,
    [KEYBOARD_OWNER_ATTRIBUTE]: ownerId,
    [KEYBOARD_PRIORITY_ATTRIBUTE]: String(priority),
    [KEYBOARD_OWNED_KEYS_ATTRIBUTE]: serializeOwnedKeys(ownedKeys),
  };
}

export function collectKeyboardBoundaryPath(
  target: EventTarget | null,
): readonly KeyboardBoundarySnapshot[] {
  if (!(target instanceof Element)) {
    return [];
  }

  const boundaries: KeyboardBoundarySnapshot[] = [];
  let current: Element | null = target;

  while (current) {
    const scope = current.getAttribute(KEYBOARD_SCOPE_ATTRIBUTE);
    if (scope) {
      boundaries.push({
        element: current,
        scope,
        ownerId: current.getAttribute(KEYBOARD_OWNER_ATTRIBUTE) ?? undefined,
        priority: parseBoundaryPriority(current.getAttribute(KEYBOARD_PRIORITY_ATTRIBUTE)),
        ownedKeys: parseOwnedKeys(current.getAttribute(KEYBOARD_OWNED_KEYS_ATTRIBUTE)),
      });
    }
    current = current.parentElement;
  }

  return boundaries;
}

export function setKeyboardFocusedAttribute(element: HTMLElement, focused: boolean): void {
  element.setAttribute(KEYBOARD_FOCUSED_ATTRIBUTE, focused ? 'true' : 'false');
}

function parseBoundaryPriority(value: string | null): number {
  if (!value) {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function serializeOwnedKeys(keys: readonly KeyboardKey[] | undefined): string | undefined {
  if (!keys || keys.length === 0) {
    return undefined;
  }

  return Array.from(new Set(keys.map((key) => normalizeKeyboardKey(key)))).join(' ');
}

function parseOwnedKeys(value: string | null): readonly KeyboardKey[] {
  if (!value) {
    return [];
  }

  return value
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => normalizeKeyboardKey(token));
}
