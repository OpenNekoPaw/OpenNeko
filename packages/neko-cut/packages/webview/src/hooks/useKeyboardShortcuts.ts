import { useMemo } from 'react';
import { useKeyboardDispatcher, type ShortcutBinding } from '@neko/ui/keyboard';
import { useEditorStore } from '../stores/editor-store';

interface CutKeyboardState extends Record<string, unknown> {
  readonly hasProject: boolean;
  readonly hasSelection: boolean;
}

const EDITOR_SCOPE = 'editor';

export function useKeyboardShortcuts(): void {
  const {
    project,
    currentTime,
    selectedElements,
    togglePlayback,
    pause,
    seek,
    opUndo,
    opRedo,
    toggleSnapping,
    toggleRippleEditing,
    toggleFrameAlign,
    copySelected,
    pasteAtTime,
    removeElement,
    clearSelectedElements,
    getTotalDuration,
    splitAtPlayhead,
    splitAndKeepLeft,
    splitAndKeepRight,
    toggleElementHidden,
    toggleElementMuted,
  } = useEditorStore();
  const fps = project?.fps ?? 30;
  const state = useMemo<CutKeyboardState>(
    () => ({
      hasProject: Boolean(project),
      hasSelection: selectedElements.length > 0,
    }),
    [project, selectedElements.length],
  );

  const bindings = useMemo<readonly ShortcutBinding<CutKeyboardState>[]>(
    () => [
      createBinding('toggle-playback', 'Space', () => togglePlayback()),
      createBinding('pause', 'KeyK', () => pause()),
      createBinding('rewind-5s', 'KeyJ', () => seek(Math.max(0, currentTime - 5), fps)),
      createBinding('forward-5s', 'KeyL', () =>
        seek(Math.min(getTotalDuration() || 60, currentTime + 5), fps),
      ),
      createBinding('frame-back', 'ArrowLeft', () => seek(Math.max(0, currentTime - 1 / 30), fps)),
      createBinding('frame-forward', 'ArrowRight', () => seek(currentTime + 1 / 30, fps)),
      createBinding('go-start-primary', { key: 'ArrowLeft', primary: true }, () => seek(0, fps)),
      createBinding('go-end-primary', { key: 'ArrowRight', primary: true }, () =>
        seek(getTotalDuration() || 0, fps),
      ),
      createBinding('go-start', 'Home', () => seek(0, fps)),
      createBinding('go-end', 'End', () => seek(getTotalDuration() || 0, fps)),
      createBinding('undo', { key: 'KeyZ', primary: true }, () => opUndo()),
      createBinding('redo', { key: 'KeyZ', primary: true, shift: true }, () => opRedo()),
      createBinding('copy', { key: 'KeyC', primary: true }, () => copySelected()),
      createBinding('paste', { key: 'KeyV', primary: true }, () => pasteAtTime(currentTime)),
      createBinding(
        'delete-selected',
        'Delete',
        () => deleteSelectedElements(selectedElements, removeElement, clearSelectedElements),
        { when: (current) => current.hasProject && current.hasSelection },
      ),
      createBinding(
        'delete-selected-backspace',
        'Backspace',
        () => deleteSelectedElements(selectedElements, removeElement, clearSelectedElements),
        { when: (current) => current.hasProject && current.hasSelection },
      ),
      createBinding(
        'select-all',
        { key: 'KeyA', primary: true },
        () => selectAllProjectElements(),
        {
          when: (current) => current.hasProject,
        },
      ),
      createBinding('escape-clear-selection', 'Escape', () => clearSelectedElements()),
      createBinding('toggle-snapping', 'KeyN', () => toggleSnapping()),
      createBinding('toggle-ripple-editing', 'KeyR', () => toggleRippleEditing()),
      createBinding('toggle-frame-align', 'KeyF', () => toggleFrameAlign()),
      createBinding(
        'split-at-playhead',
        'KeyS',
        () => {
          for (const { trackId, elementId } of selectedElements) {
            splitAtPlayhead(trackId, elementId);
          }
        },
        { when: (current) => current.hasProject && current.hasSelection },
      ),
      createBinding(
        'split-keep-left',
        'KeyQ',
        () => {
          for (const { trackId, elementId } of selectedElements) {
            splitAndKeepLeft(trackId, elementId);
          }
        },
        { when: (current) => current.hasSelection },
      ),
      createBinding(
        'split-keep-right',
        'KeyW',
        () => {
          for (const { trackId, elementId } of selectedElements) {
            splitAndKeepRight(trackId, elementId);
          }
        },
        { when: (current) => current.hasSelection },
      ),
      createBinding(
        'toggle-hidden',
        'KeyH',
        () => {
          for (const { trackId, elementId } of selectedElements) {
            toggleElementHidden(trackId, elementId);
          }
        },
        { when: (current) => current.hasSelection },
      ),
      createBinding(
        'toggle-muted',
        'KeyM',
        () => {
          for (const { trackId, elementId } of selectedElements) {
            toggleElementMuted(trackId, elementId);
          }
        },
        { when: (current) => current.hasSelection },
      ),
    ],
    [
      clearSelectedElements,
      copySelected,
      currentTime,
      fps,
      getTotalDuration,
      opRedo,
      opUndo,
      pasteAtTime,
      pause,
      removeElement,
      seek,
      selectedElements,
      splitAndKeepLeft,
      splitAndKeepRight,
      splitAtPlayhead,
      toggleElementHidden,
      toggleElementMuted,
      toggleFrameAlign,
      togglePlayback,
      toggleRippleEditing,
      toggleSnapping,
    ],
  );

  useKeyboardDispatcher(bindings, state);
}

function createBinding(
  id: string,
  key: ShortcutBinding<CutKeyboardState>['key']['key'] | ShortcutBinding<CutKeyboardState>['key'],
  run: () => void,
  options: Pick<ShortcutBinding<CutKeyboardState>, 'when'> = {},
): ShortcutBinding<CutKeyboardState> {
  return {
    id,
    key: typeof key === 'string' ? { key } : key,
    scope: EDITOR_SCOPE,
    run,
    when: options.when,
  };
}

function deleteSelectedElements(
  selectedElements: readonly { readonly trackId: string; readonly elementId: string }[],
  removeElement: (trackId: string, elementId: string) => void,
  clearSelectedElements: () => void,
): void {
  for (const { trackId, elementId } of selectedElements) {
    removeElement(trackId, elementId);
  }
  clearSelectedElements();
}

function selectAllProjectElements(): void {
  const { project, setSelectedElements } = useEditorStore.getState();
  if (!project) {
    return;
  }

  setSelectedElements(
    project.tracks.flatMap((track) =>
      track.elements.map((element) => ({ trackId: track.id, elementId: element.id })),
    ),
  );
}
