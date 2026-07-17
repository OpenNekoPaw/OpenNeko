// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectData } from '../types';
import { useEditorStore } from '../stores/editor-store';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

vi.mock('./useVSCodeMessaging', () => ({
  useVSCodeMessaging: () => ({}),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('useKeyboardShortcuts', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    useEditorStore.setState(createKeyboardState(), true);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it('keeps Delete, Space, and primary+A inside text inputs', () => {
    act(() => {
      root.render(<KeyboardHarness />);
    });

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    act(() => {
      input.dispatchEvent(createKeyEvent('Delete', 'Delete'));
      input.dispatchEvent(createKeyEvent(' ', 'Space'));
      input.dispatchEvent(createKeyEvent('a', 'KeyA', { metaKey: true }));
    });

    expect(useEditorStore.getState().selectedElements).toEqual([
      { trackId: 'track-1', elementId: 'clip-1' },
    ]);
    expect(useEditorStore.getState().isPlaying).toBe(false);

    input.remove();
  });

  it('ignores editor shortcuts during IME composition', () => {
    act(() => {
      root.render(<KeyboardHarness />);
    });

    act(() => {
      window.dispatchEvent(createKeyEvent(' ', 'Space', { isComposing: true }));
      window.dispatchEvent(createKeyEvent('Enter', 'Enter', { isComposing: true }));
    });

    expect(useEditorStore.getState().isPlaying).toBe(false);
  });

  it('dispatches editor shortcuts when the editor owns the key event', () => {
    act(() => {
      root.render(<KeyboardHarness />);
    });

    act(() => {
      window.dispatchEvent(createKeyEvent('Delete', 'Delete'));
    });
    expect(useEditorStore.getState().selectedElements).toEqual([]);

    act(() => {
      window.dispatchEvent(createKeyEvent('a', 'KeyA', { ctrlKey: true }));
    });
    expect(useEditorStore.getState().selectedElements).toEqual([
      { trackId: 'track-1', elementId: 'clip-2' },
    ]);

    act(() => {
      window.dispatchEvent(createKeyEvent(' ', 'Space'));
    });
    expect(useEditorStore.getState().isPlaying).toBe(true);
  });

  it('leaves primary+S to the VS Code workbench save keybinding', () => {
    act(() => {
      root.render(<KeyboardHarness />);
    });

    const event = createKeyEvent('s', 'KeyS', { metaKey: true });
    act(() => {
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
  });
});

function KeyboardHarness(): React.ReactElement | null {
  useKeyboardShortcuts();
  return null;
}

function createKeyboardState(): ReturnType<typeof useEditorStore.getState> {
  const project = createProject();

  return {
    ...useEditorStore.getState(),
    project,
    currentTime: 1,
    isPlaying: false,
    selectedElements: [{ trackId: 'track-1', elementId: 'clip-1' }],
  };
}

function createProject(): ProjectData {
  return {
    version: '2.0',
    name: 'Keyboard Test',
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    tracks: [
      {
        id: 'track-1',
        name: 'Video',
        type: 'media',
        muted: false,
        locked: false,
        hidden: false,
        isMain: true,
        elements: [createMediaElement('clip-1', 0), createMediaElement('clip-2', 2)],
      },
    ],
  };
}

function createMediaElement(
  id: string,
  startTime: number,
): ProjectData['tracks'][number]['elements'][number] {
  return {
    id,
    type: 'media',
    name: id,
    src: `${id}.mp4`,
    startTime,
    duration: 2,
    trimStart: 0,
    trimEnd: 0,
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0, anchorY: 0 },
    opacity: 1,
    blendMode: 'normal',
    effects: [],
    muted: false,
    hidden: false,
    locked: false,
  };
}

function createKeyEvent(key: string, code: string, options: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    code,
    key,
    ...options,
  });
}
