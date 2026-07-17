import { useMemo } from 'react';
import { useKeyboardDispatcher, type ShortcutBinding } from '@neko/ui/keyboard';

export interface CanvasKeyboardState extends Record<string, unknown> {
  readonly canDeleteSelection: boolean;
  readonly canGenerateSelection: boolean;
  readonly hasNodes: boolean;
  readonly isKeyboardFocused: boolean;
}

export interface UseCanvasKeyboardControllerOptions {
  readonly state: CanvasKeyboardState;
  readonly onDeleteSelected: () => void;
  readonly onEscape: () => void;
  readonly onSelectAll: () => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onCopy: () => void;
  readonly onCut: () => void;
  readonly onPaste: () => void;
  readonly onPasteInPlace: () => void;
  readonly onDuplicate: () => void;
  readonly onGenerateSelected?: () => void;
  readonly onSpacePanEnd: () => void;
  readonly onSpacePanStart: () => void;
  readonly onTogglePanMode: () => void;
  readonly target?: EventTarget | null;
}

const EDITOR_SCOPE = 'editor';
const VIEWPORT_SCOPE = 'viewport';

export function useCanvasKeyboardController({
  onCopy,
  onCut,
  onDeleteSelected,
  onDuplicate,
  onEscape,
  onGenerateSelected,
  onPaste,
  onPasteInPlace,
  onRedo,
  onSelectAll,
  onSpacePanEnd,
  onSpacePanStart,
  onTogglePanMode,
  onUndo,
  state,
  target,
}: UseCanvasKeyboardControllerOptions): void {
  const keyUpBindings = useMemo<readonly ShortcutBinding<CanvasKeyboardState>[]>(
    () => [
      createViewportBinding('space-pan-end', 'Space', onSpacePanEnd, {
        preventDefault: false,
        stopPropagation: false,
      }),
    ],
    [onSpacePanEnd],
  );
  const bindings = useMemo<readonly ShortcutBinding<CanvasKeyboardState>[]>(
    () => [
      createEditorBinding('delete-selected', 'Delete', onDeleteSelected, {
        when: (current) => current.canDeleteSelection,
      }),
      createEditorBinding('delete-selected-backspace', 'Backspace', onDeleteSelected, {
        when: (current) => current.canDeleteSelection,
      }),
      createEditorBinding('escape', 'Escape', onEscape),
      createEditorBinding('select-all', { key: 'KeyA', primary: true }, onSelectAll, {
        when: (current) => current.hasNodes,
      }),
      createEditorBinding('undo', { key: 'KeyZ', primary: true }, onUndo),
      createEditorBinding('redo', { key: 'KeyZ', primary: true, shift: true }, onRedo),
      createEditorBinding('copy', { key: 'KeyC', primary: true }, onCopy),
      createEditorBinding('cut', { key: 'KeyX', primary: true }, onCut, {
        when: (current) => current.canDeleteSelection,
      }),
      createEditorBinding('paste', { key: 'KeyV', primary: true }, onPaste),
      createEditorBinding(
        'paste-in-place',
        { key: 'KeyV', primary: true, shift: true },
        onPasteInPlace,
      ),
      createEditorBinding('duplicate', { key: 'KeyD', primary: true }, onDuplicate, {
        when: (current) => current.canDeleteSelection,
      }),
      createEditorBinding(
        'generate-selected',
        { key: 'KeyG', primary: true },
        () => {
          onGenerateSelected?.();
        },
        {
          when: (current) => current.canGenerateSelection,
        },
      ),
      createViewportBinding('toggle-pan-mode', 'KeyH', onTogglePanMode),
      createViewportBinding('space-pan-start', 'Space', onSpacePanStart, {
        when: (current) => current.isKeyboardFocused,
      }),
    ],
    [
      onCopy,
      onCut,
      onDeleteSelected,
      onDuplicate,
      onEscape,
      onGenerateSelected,
      onPaste,
      onPasteInPlace,
      onRedo,
      onSelectAll,
      onSpacePanStart,
      onTogglePanMode,
      onUndo,
    ],
  );

  useKeyboardDispatcher(bindings, state, {
    enabled: state.isKeyboardFocused,
    target,
  });
  useKeyboardDispatcher(keyUpBindings, state, {
    enabled: state.isKeyboardFocused,
    eventType: 'keyup',
    target,
    validateDuplicates: false,
  });
}

function createEditorBinding(
  id: string,
  key:
    | ShortcutBinding<CanvasKeyboardState>['key']['key']
    | ShortcutBinding<CanvasKeyboardState>['key'],
  run: () => void,
  options: Pick<ShortcutBinding<CanvasKeyboardState>, 'when'> = {},
): ShortcutBinding<CanvasKeyboardState> {
  return {
    id,
    key: typeof key === 'string' ? { key } : key,
    scope: EDITOR_SCOPE,
    run,
    when: options.when,
  };
}

function createViewportBinding(
  id: string,
  key:
    | ShortcutBinding<CanvasKeyboardState>['key']['key']
    | ShortcutBinding<CanvasKeyboardState>['key'],
  run: () => void,
  options: Pick<
    ShortcutBinding<CanvasKeyboardState>,
    'preventDefault' | 'stopPropagation' | 'when'
  > = {},
): ShortcutBinding<CanvasKeyboardState> {
  return {
    id,
    key: typeof key === 'string' ? { key } : key,
    scope: VIEWPORT_SCOPE,
    preventDefault: options.preventDefault,
    run,
    stopPropagation: options.stopPropagation,
    when: options.when,
  };
}
