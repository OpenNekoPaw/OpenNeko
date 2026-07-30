import { describe, expect, it } from 'vitest';
import {
  formatKeybinding,
  matchesShortcutKeySpec,
  normalizeKeyboardKey,
  parseKeybinding,
  serializeShortcutKeySpec,
} from './key-spec';

describe('keyboard key specs', () => {
  it('parses portable keybinding strings into structured specs', () => {
    expect(parseKeybinding('ctrl+a')).toEqual({ key: 'KeyA', primary: true });
    expect(parseKeybinding('meta+shift+z')).toEqual({
      key: 'KeyZ',
      primary: true,
      shift: true,
    });
    expect(parseKeybinding('cmdOrCtrl+Space')).toEqual({
      key: 'Space',
      primary: true,
    });
  });

  it('formats structured specs back to portable keybinding strings', () => {
    expect(formatKeybinding({ key: 'KeyZ', primary: true, shift: true })).toBe('ctrl+shift+z');
    expect(
      formatKeybinding({ key: 'KeyZ', primary: true, shift: true }, { primaryModifier: 'cmd' }),
    ).toBe('cmd+shift+z');
    expect(formatKeybinding({ key: 'Space' })).toBe('space');
  });

  it('serializes shortcut specs with stable modifier ordering', () => {
    expect(serializeShortcutKeySpec({ key: 'KeyZ', shift: true, primary: true })).toBe(
      'primary+shift+KeyZ',
    );
  });

  it('normalizes DOM key and code values', () => {
    expect(normalizeKeyboardKey('a')).toBe('KeyA');
    expect(normalizeKeyboardKey('Digit1')).toBe('Digit1');
    expect(normalizeKeyboardKey('Esc')).toBe('Escape');
  });

  it('matches primary modifier against the current platform policy', () => {
    const macEvent = new KeyboardEvent('keydown', {
      code: 'KeyA',
      key: 'a',
      metaKey: true,
    });
    const winEvent = new KeyboardEvent('keydown', {
      code: 'KeyA',
      key: 'a',
      ctrlKey: true,
    });

    expect(matchesShortcutKeySpec({ key: 'KeyA', primary: true }, macEvent, { isMac: true })).toBe(
      true,
    );
    expect(matchesShortcutKeySpec({ key: 'KeyA', primary: true }, winEvent, { isMac: false })).toBe(
      true,
    );
  });
});
