import type { KeyboardKey, ShortcutKeySpec, VSCodeKeybindingFormatOptions } from './types';

const KEY_ALIASES: ReadonlyMap<string, KeyboardKey> = new Map([
  ['space', 'Space'],
  ['spacebar', 'Space'],
  ['delete', 'Delete'],
  ['del', 'Delete'],
  ['backspace', 'Backspace'],
  ['enter', 'Enter'],
  ['return', 'Enter'],
  ['escape', 'Escape'],
  ['esc', 'Escape'],
  ['tab', 'Tab'],
  ['up', 'ArrowUp'],
  ['arrowup', 'ArrowUp'],
  ['down', 'ArrowDown'],
  ['arrowdown', 'ArrowDown'],
  ['left', 'ArrowLeft'],
  ['arrowleft', 'ArrowLeft'],
  ['right', 'ArrowRight'],
  ['arrowright', 'ArrowRight'],
  ['home', 'Home'],
  ['end', 'End'],
  ['pageup', 'PageUp'],
  ['pagedown', 'PageDown'],
  ['-', 'Minus'],
  ['minus', 'Minus'],
  ['=', 'Equal'],
  ['equal', 'Equal'],
  ['[', 'BracketLeft'],
  ['bracketleft', 'BracketLeft'],
  [']', 'BracketRight'],
  ['bracketright', 'BracketRight'],
  ['\\', 'Backslash'],
  ['backslash', 'Backslash'],
  [';', 'Semicolon'],
  ['semicolon', 'Semicolon'],
  ["'", 'Quote'],
  ['quote', 'Quote'],
  ['`', 'Backquote'],
  ['backquote', 'Backquote'],
  [',', 'Comma'],
  ['comma', 'Comma'],
  ['.', 'Period'],
  ['period', 'Period'],
  ['/', 'Slash'],
  ['slash', 'Slash'],
]);

const KEY_TO_VSCODE: ReadonlyMap<KeyboardKey, string> = new Map([
  ['Space', 'space'],
  ['Delete', 'delete'],
  ['Backspace', 'backspace'],
  ['Enter', 'enter'],
  ['Escape', 'escape'],
  ['Tab', 'tab'],
  ['ArrowUp', 'up'],
  ['ArrowDown', 'down'],
  ['ArrowLeft', 'left'],
  ['ArrowRight', 'right'],
  ['Home', 'home'],
  ['End', 'end'],
  ['PageUp', 'pageup'],
  ['PageDown', 'pagedown'],
  ['Minus', '-'],
  ['Equal', '='],
  ['BracketLeft', '['],
  ['BracketRight', ']'],
  ['Backslash', '\\'],
  ['Semicolon', ';'],
  ['Quote', "'"],
  ['Backquote', '`'],
  ['Comma', ','],
  ['Period', '.'],
  ['Slash', '/'],
]);

/**
 * Parse a VSCode-style keybinding string into the Webview shortcut contract.
 *
 * This is intentionally lossy: platform-specific primary modifiers such as
 * `ctrl`, `cmd`, and `meta` are normalized to `primary` so Webview shortcut
 * tables can use one cross-platform Cmd/Ctrl policy.
 */
export function parseVSCodeKeybinding(value: string): ShortcutKeySpec {
  const tokens = value
    .trim()
    .split('+')
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    throw new Error('Keybinding must include a key.');
  }

  let key: KeyboardKey | undefined;
  let primary = false;
  const ctrl = false;
  const meta = false;
  let shift = false;
  let alt = false;

  for (const token of tokens) {
    const normalized = normalizeToken(token);

    switch (normalized) {
      case 'primary':
      case 'cmdorctrl':
      case 'mod':
        primary = true;
        continue;
      case 'ctrl':
      case 'control':
        primary = true;
        continue;
      case 'cmd':
      case 'command':
      case 'meta':
        primary = true;
        continue;
      case 'shift':
        shift = true;
        continue;
      case 'alt':
      case 'option':
        alt = true;
        continue;
      default:
        if (key) {
          throw new Error(`Keybinding must include exactly one key: ${value}`);
        }
        key = normalizeKeyboardKey(token);
    }
  }

  if (!key) {
    throw new Error(`Keybinding must include a non-modifier key: ${value}`);
  }

  return compactShortcutKeySpec({ key, primary, ctrl, meta, shift, alt });
}

export function formatVSCodeKeybinding(
  spec: ShortcutKeySpec,
  options: VSCodeKeybindingFormatOptions = {},
): string {
  const primaryModifier = options.primaryModifier ?? 'ctrl';
  const modifiers = [
    spec.primary ? primaryModifier : undefined,
    spec.ctrl ? 'ctrl' : undefined,
    spec.meta ? 'meta' : undefined,
    spec.shift ? 'shift' : undefined,
    spec.alt ? 'alt' : undefined,
  ].filter((token): token is string => Boolean(token));

  return [...modifiers, formatVSCodeKey(spec.key)].join('+');
}

export function serializeShortcutKeySpec(spec: ShortcutKeySpec): string {
  return [
    spec.primary ? 'primary' : undefined,
    spec.ctrl ? 'ctrl' : undefined,
    spec.meta ? 'meta' : undefined,
    spec.shift ? 'shift' : undefined,
    spec.alt ? 'alt' : undefined,
    spec.key,
  ]
    .filter((token): token is string => Boolean(token))
    .join('+');
}

export function matchesShortcutKeySpec(
  spec: ShortcutKeySpec,
  event: KeyboardEvent,
  options: { readonly isMac?: boolean } = {},
): boolean {
  if (normalizeKeyboardEventKey(event) !== spec.key) {
    return false;
  }

  const isMac = options.isMac ?? isMacLikePlatform();
  const expectedCtrl = Boolean(spec.ctrl || (spec.primary && !isMac));
  const expectedMeta = Boolean(spec.meta || (spec.primary && isMac));

  return (
    event.ctrlKey === expectedCtrl &&
    event.metaKey === expectedMeta &&
    event.shiftKey === Boolean(spec.shift) &&
    event.altKey === Boolean(spec.alt)
  );
}

export function normalizeKeyboardEventKey(event: KeyboardEvent): KeyboardKey {
  if (event.code && event.code !== 'Unidentified') {
    return normalizeKeyboardKey(event.code);
  }

  return normalizeKeyboardKey(event.key);
}

export function normalizeKeyboardKey(value: string): KeyboardKey {
  const token = value.trim();
  const normalized = normalizeToken(token);
  const alias = KEY_ALIASES.get(normalized);

  if (alias) {
    return alias;
  }

  if (/^key[a-z]$/.test(normalized)) {
    return `Key${normalized.slice(3).toUpperCase()}` as KeyboardKey;
  }

  if (/^[a-z]$/.test(normalized)) {
    return `Key${normalized.toUpperCase()}` as KeyboardKey;
  }

  if (/^digit[0-9]$/.test(normalized)) {
    return `Digit${normalized.slice(5)}` as KeyboardKey;
  }

  if (/^[0-9]$/.test(normalized)) {
    return `Digit${normalized}` as KeyboardKey;
  }

  if (/^f(?:[1-9]|1[0-9]|2[0-4])$/.test(normalized)) {
    return normalized.toUpperCase() as KeyboardKey;
  }

  return token as KeyboardKey;
}

function formatVSCodeKey(key: KeyboardKey): string {
  const mapped = KEY_TO_VSCODE.get(key);
  if (mapped) {
    return mapped;
  }

  if (/^Key[A-Z]$/.test(key)) {
    return key.slice(3).toLowerCase();
  }

  if (/^Digit[0-9]$/.test(key)) {
    return key.slice(5);
  }

  return key.toLowerCase();
}

function compactShortcutKeySpec(spec: Required<ShortcutKeySpec>): ShortcutKeySpec {
  return {
    key: spec.key,
    primary: spec.primary || undefined,
    ctrl: spec.ctrl || undefined,
    meta: spec.meta || undefined,
    shift: spec.shift || undefined,
    alt: spec.alt || undefined,
  };
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[\s_-]/g, '');
}

function isMacLikePlatform(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }

  return /mac|iphone|ipad|ipod/i.test(navigator.platform);
}
