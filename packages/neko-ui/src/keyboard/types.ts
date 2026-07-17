export type KeyboardScope =
  | 'editor'
  | 'viewport'
  | 'canvas'
  | 'node'
  | 'container'
  | 'inline-editor'
  | 'timeline'
  | 'property-panel'
  | 'text-input'
  | 'modal'
  | 'menu'
  | 'popover'
  | 'tree'
  | (string & {});

export type KeyboardKey =
  | `Key${Uppercase<string>}`
  | `Digit${number}`
  | `F${number}`
  | 'Space'
  | 'Enter'
  | 'Escape'
  | 'Backspace'
  | 'Delete'
  | 'Tab'
  | 'ArrowUp'
  | 'ArrowDown'
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'Home'
  | 'End'
  | 'PageUp'
  | 'PageDown'
  | 'Minus'
  | 'Equal'
  | 'BracketLeft'
  | 'BracketRight'
  | 'Backslash'
  | 'Semicolon'
  | 'Quote'
  | 'Backquote'
  | 'Comma'
  | 'Period'
  | 'Slash'
  | (string & {});

export interface ShortcutKeySpec {
  readonly key: KeyboardKey;
  readonly primary?: boolean;
  readonly ctrl?: boolean;
  readonly meta?: boolean;
  readonly shift?: boolean;
  readonly alt?: boolean;
}

export interface KeyboardBoundarySnapshot {
  readonly element: Element;
  readonly scope: KeyboardScope;
  readonly ownerId?: string;
  readonly priority: number;
  readonly ownedKeys: readonly KeyboardKey[];
}

export interface ShortcutBinding<S extends Record<string, unknown> = Record<string, unknown>> {
  readonly id: string;
  readonly key: ShortcutKeySpec;
  readonly scope: KeyboardScope;
  readonly ownerId?: string;
  readonly priority?: number;
  readonly when?: (state: S) => boolean;
  readonly run: (context: KeyboardShortcutContext<S>) => void;
  readonly preventDefault?: boolean;
  readonly stopPropagation?: boolean;
  readonly allowEditableTarget?: boolean;
  readonly allowComposition?: boolean;
}

export interface KeyboardShortcutContext<
  S extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly event: KeyboardEvent;
  readonly state: S;
  readonly binding: ShortcutBinding<S>;
  readonly boundary?: KeyboardBoundarySnapshot;
  readonly boundaryPath: readonly KeyboardBoundarySnapshot[];
}

export type KeyboardDispatchOutcome =
  | 'handled'
  | 'ignored'
  | 'stopped-editable'
  | 'stopped-composing'
  | 'stopped-owned-boundary'
  | 'stopped-unfocused'
  | 'duplicate-shortcut';

export interface KeyboardDispatchResult<
  S extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly outcome: KeyboardDispatchOutcome;
  readonly binding?: ShortcutBinding<S>;
  readonly boundary?: KeyboardBoundarySnapshot;
  readonly diagnostics: readonly string[];
}

export interface KeyboardDispatcherOptions {
  readonly target?: EventTarget | null;
  readonly capture?: boolean;
  readonly eventType?: 'keydown' | 'keyup';
  readonly validateDuplicates?: boolean;
  readonly isMac?: boolean;
  readonly enabled?: boolean;
  readonly stopOnEditableTarget?: boolean;
  readonly stopOnComposition?: boolean;
}

export interface VSCodeKeybindingFormatOptions {
  readonly primaryModifier?: 'ctrl' | 'cmd' | 'meta';
}
