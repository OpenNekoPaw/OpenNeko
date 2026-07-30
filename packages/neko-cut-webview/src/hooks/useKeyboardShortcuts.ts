import { useMemo } from 'react';
import { useKeyboardDispatcher, type ShortcutBinding } from '@neko/ui/keyboard';

export interface CutKeyboardShortcutState extends Record<string, unknown> {
  readonly hasView: boolean;
  readonly hasSelection: boolean;
  readonly hasClipboard: boolean;
  readonly canSplit: boolean;
}

export interface CutKeyboardShortcutActions {
  readonly togglePlayback: () => void;
  readonly seekByFrames: (frames: number) => void;
  readonly seekStart: () => void;
  readonly seekEnd: () => void;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly split: () => void;
  readonly duplicateSelection: () => void;
  readonly cutSelection: () => void;
  readonly copySelection: () => void;
  readonly paste: () => void;
  readonly selectAll: () => void;
  readonly deleteSelection: () => void;
  readonly clearSelection: () => void;
}

export interface UseKeyboardShortcutsOptions {
  readonly enabled: boolean;
  readonly state: CutKeyboardShortcutState;
  readonly actions: CutKeyboardShortcutActions;
}

const EDITOR_SCOPE = 'editor';

export function useKeyboardShortcuts({
  enabled,
  state,
  actions,
}: UseKeyboardShortcutsOptions): void {
  const bindings = useMemo(() => createCutShortcutBindings(actions), [actions]);
  useKeyboardDispatcher(bindings, state, { enabled });
}

export function createCutShortcutBindings(
  actions: CutKeyboardShortcutActions,
): readonly ShortcutBinding<CutKeyboardShortcutState>[] {
  const hasView = (state: CutKeyboardShortcutState) => state.hasView;
  const hasSelection = (state: CutKeyboardShortcutState) => state.hasView && state.hasSelection;
  const hasClipboard = (state: CutKeyboardShortcutState) => state.hasView && state.hasClipboard;
  return [
    binding('toggle-playback', 'Space', actions.togglePlayback, hasView),
    binding('pause', 'KeyK', actions.togglePlayback, hasView),
    binding('rewind', 'KeyJ', () => actions.seekByFrames(-150), hasView),
    binding('forward', 'KeyL', () => actions.seekByFrames(150), hasView),
    binding('frame-back', 'ArrowLeft', () => actions.seekByFrames(-1), hasView),
    binding('frame-forward', 'ArrowRight', () => actions.seekByFrames(1), hasView),
    binding('go-start-primary', { key: 'ArrowLeft', primary: true }, actions.seekStart, hasView),
    binding('go-end-primary', { key: 'ArrowRight', primary: true }, actions.seekEnd, hasView),
    binding('go-start', 'Home', actions.seekStart, hasView),
    binding('go-end', 'End', actions.seekEnd, hasView),
    binding('undo', { key: 'KeyZ', primary: true }, actions.undo, hasView),
    binding('redo', { key: 'KeyZ', primary: true, shift: true }, actions.redo, hasView),
    binding('split-at-playhead', 'KeyS', actions.split, (state) => state.canSplit),
    binding(
      'duplicate-selected',
      { key: 'KeyD', primary: true },
      actions.duplicateSelection,
      hasSelection,
    ),
    binding('cut-selected', { key: 'KeyX', primary: true }, actions.cutSelection, hasSelection),
    binding('copy-selected', { key: 'KeyC', primary: true }, actions.copySelection, hasSelection),
    binding('paste', { key: 'KeyV', primary: true }, actions.paste, hasClipboard),
    binding('select-all', { key: 'KeyA', primary: true }, actions.selectAll, hasView),
    binding('delete-selected', 'Delete', actions.deleteSelection, hasSelection),
    binding('delete-selected-backspace', 'Backspace', actions.deleteSelection, hasSelection),
    binding('escape-clear-selection', 'Escape', actions.clearSelection),
  ];
}

function binding(
  id: string,
  key:
    | ShortcutBinding<CutKeyboardShortcutState>['key']['key']
    | ShortcutBinding<CutKeyboardShortcutState>['key'],
  run: () => void,
  when?: (state: CutKeyboardShortcutState) => boolean,
): ShortcutBinding<CutKeyboardShortcutState> {
  return {
    id,
    key: typeof key === 'string' ? { key } : key,
    scope: EDITOR_SCOPE,
    run,
    ...(when ? { when } : {}),
  };
}
