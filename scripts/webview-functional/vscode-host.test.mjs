import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_CONTROLLER_CONNECTION_FILE,
  DEFAULT_VSCODE_DEBUG_PORT,
  VSCodeFunctionalHost,
  collectMatchingTargetIds,
  validateDebugHostWorkspace,
} from './vscode-host.mjs';

describe('VS Code functional host attachment', () => {
  it('uses the dedicated built-in Debug endpoint and controller file', () => {
    assert.equal(DEFAULT_VSCODE_DEBUG_PORT, 9222);
    assert.equal(DEFAULT_CONTROLLER_CONNECTION_FILE, '.tmp/webview-functional-controller.json');
  });

  it('requires the attached Debug Host to own the configured workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'neko-built-in-debug-host-'));
    const expected = join(root, 'neko-test');
    const other = join(root, 'other');
    await Promise.all([mkdir(expected), mkdir(other)]);
    try {
      assert.equal((await validateDebugHostWorkspace(expected, expected)).matches, true);
      assert.equal((await validateDebugHostWorkspace(expected, other)).matches, false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('disconnects sessions without closing the VS Code-owned Debug Host', async () => {
    let closed = false;
    const host = new VSCodeFunctionalHost({});
    host.sessions.push({ close: () => { closed = true; } });
    host.controller = {
      readObservations: async () => [],
      execute: async () => { throw new Error('stop must not send host lifecycle commands'); },
    };

    await host.stop();

    assert.equal(closed, true);
    assert.equal(host.controller, undefined);
  });

  it('opens a fixture source before executing its public preview command', async () => {
    const calls = [];
    const host = new VSCodeFunctionalHost({
      scenario: {
        activation: {
          kind: 'open-file-command',
          path: 'story.fountain',
          command: 'neko.story.preview',
        },
      },
    });
    host.controller = {
      execute: async (...args) => {
        calls.push(args);
        return { ok: true };
      },
    };

    await host.activate();

    assert.deepEqual(calls, [
      ['open-file', { path: 'story.fountain' }],
      ['execute-command', { command: 'neko.story.preview', args: [] }],
    ]);
  });

  it('allows VS Code to preserve the Webview target across hide and reveal', async () => {
    const reconnects = [];
    const host = new VSCodeFunctionalHost({});
    host.webview = { target: { id: 'preserved-target' } };
    host.controller = {
      execute: async () => ({ toggled: true }),
    };
    host.connectWebview = async (options) => {
      reconnects.push(options);
      return host.webview;
    };

    await host.execute('hide-reveal', {});

    assert.deepEqual(reconnects, [{ reuseCurrentTarget: true }]);
  });

  it('requires a replacement Webview target after closing and reopening an editor', async () => {
    const reconnects = [];
    const host = new VSCodeFunctionalHost({});
    host.webview = { target: { id: 'disposed-target' } };
    host.controller = {
      execute: async () => ({ uri: 'file:///fixture.nkc' }),
    };
    host.connectWebview = async (options) => {
      reconnects.push(options);
      return host.webview;
    };

    await host.execute('close-reopen', { path: 'fixture.nkc', viewType: 'neko.canvasEditor' });

    assert.deepEqual(reconnects, [{ excludeTargetIds: ['disposed-target'] }]);
  });

  it('isolates scenario Webviews from matching targets that predate fixture activation', () => {
    const targets = [
      {
        id: 'user-canvas',
        type: 'iframe',
        title: 'Canvas',
        url: 'vscode-webview://host/?extensionId=neko.neko-canvas',
      },
      {
        id: 'agent-view',
        type: 'iframe',
        title: 'Agent',
        url: 'vscode-webview://host/?extensionId=neko.neko-agent',
      },
      {
        id: 'second-user-canvas',
        type: 'iframe',
        title: 'Canvas',
        url: 'vscode-webview://host/?extensionId=neko.neko-canvas',
      },
    ];

    assert.deepEqual(
      collectMatchingTargetIds(targets, {
        type: 'iframe',
        extensionId: 'neko.neko-canvas',
      }),
      ['user-canvas', 'second-user-canvas'],
    );
  });
});
