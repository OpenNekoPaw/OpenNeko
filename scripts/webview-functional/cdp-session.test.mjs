import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createKeyDispatchSequence,
  createMouseDragSequence,
  resolveKeyIdentity,
  selectCdpTarget,
  selectWebviewContentFrameId,
} from './cdp-session.mjs';

describe('VS Code Webview CDP frame selection', () => {
  it('selects the actual Webview document below the bootstrap frame', () => {
    assert.equal(
      selectWebviewContentFrameId({
        frame: { id: 'bootstrap' },
        childFrames: [
          {
            frame: { id: 'active-frame' },
            childFrames: [{ frame: { id: 'content-frame' } }],
          },
        ],
      }),
      'active-frame',
    );
  });

  it('projects control keys with native identities for Electron input dispatch', () => {
    assert.deepEqual(resolveKeyIdentity('Enter'), {
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    });
  });

  it('dispatches a DOM keydown followed by keyup for Webview keyboard controllers', () => {
    assert.deepEqual(createKeyDispatchSequence('Delete'), [
      {
        method: 'Input.dispatchKeyEvent',
        params: {
          type: 'keyDown',
          key: 'Delete',
          code: 'Delete',
          windowsVirtualKeyCode: 46,
          nativeVirtualKeyCode: 46,
        },
      },
      {
        method: 'Input.dispatchKeyEvent',
        params: {
          type: 'keyUp',
          key: 'Delete',
          code: 'Delete',
          windowsVirtualKeyCode: 46,
          nativeVirtualKeyCode: 46,
        },
      },
    ]);
  });

  it('creates a pressed, interpolated, and released pointer drag sequence', () => {
    assert.deepEqual(createMouseDragSequence({ x: 10, y: 20 }, { x: 30, y: 40 }, 2), [
      {
        type: 'mousePressed',
        x: 10,
        y: 20,
        button: 'left',
        buttons: 1,
        clickCount: 1,
      },
      { type: 'mouseMoved', x: 20, y: 30, button: 'left', buttons: 1 },
      { type: 'mouseMoved', x: 30, y: 40, button: 'left', buttons: 1 },
      {
        type: 'mouseReleased',
        x: 30,
        y: 40,
        button: 'left',
        buttons: 0,
        clickCount: 1,
      },
    ]);
  });

  it('selects a replacement Webview target after lifecycle recreation', () => {
    const targets = [
      {
        id: 'disposed-target',
        type: 'iframe',
        title: 'neko.neko-agent',
        url: 'vscode-webview://host/?extensionId=neko.neko-agent',
      },
      {
        id: 'replacement-target',
        type: 'iframe',
        title: 'neko.neko-agent',
        url: 'vscode-webview://host/?extensionId=neko.neko-agent',
      },
    ];

    const target = selectCdpTarget(targets, {
      type: 'iframe',
      extensionId: 'neko.neko-agent',
      excludeTargetIds: ['disposed-target'],
    });

    assert.equal(target?.id, 'replacement-target');
  });
});
