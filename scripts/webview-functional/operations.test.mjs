import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runStep, waitForState } from './operations.mjs';

describe('webview functional operations', () => {
  it('sequences input through the DOM instead of private state', async () => {
    const expressions = [];
    const commands = [];
    const session = {
      evaluate: async (expression) => {
        expressions.push(expression);
        return expressions.length === 1 ? { x: 20, y: 30 } : 'text-input';
      },
      send: async (...args) => commands.push(args),
      dispatchClick: async (x, y) => commands.push(['click', { x, y }]),
    };
    await runStep(
      { id: 'input', operation: 'input', selector: { testId: 'chat-input' }, value: 'hello' },
      { webview: session, defaultTimeoutMs: 1000 },
    );
    assert.match(expressions[1], /element\.select/u);
    assert.doesNotMatch(expressions.join('\n'), /store\./u);
    assert.deepEqual(commands, [
      ['click', { x: 20, y: 30 }],
      ['Input.insertText', { text: 'hello' }],
    ]);
  });

  it('clicks the visible element center through CDP input dispatch', async () => {
    const clicks = [];
    const expressions = [];
    const session = {
      evaluate: async (expression) => {
        expressions.push(expression);
        return expressions.length === 1 ? { x: 12, y: 18 } : true;
      },
      dispatchClick: async (x, y) => clicks.push({ x, y }),
    };

    await runStep(
      { id: 'click', operation: 'click', selector: { role: 'button', name: 'Send' } },
      { webview: session, defaultTimeoutMs: 1000 },
    );

    assert.deepEqual(clicks, [{ x: 12, y: 18 }]);
    assert.match(expressions[1], /element\.focus\(\{ preventScroll: true \}\)/u);
  });

  it('drags from the visible element center by the declared screen-space delta', async () => {
    const drags = [];
    const session = {
      evaluate: async () => ({ x: 12, y: 18 }),
      dispatchDrag: async (origin, destination) => drags.push({ origin, destination }),
    };

    const result = await runStep(
      {
        id: 'drag',
        operation: 'drag',
        selector: { testId: 'canvas-node' },
        delta: { x: 40, y: -16 },
      },
      { webview: session, defaultTimeoutMs: 1000 },
    );

    assert.deepEqual(drags, [
      { origin: { x: 12, y: 18 }, destination: { x: 52, y: 2 } },
    ]);
    assert.deepEqual(result.destination, { x: 52, y: 2 });
  });

  it('times out when a declared state never becomes true', async () => {
    const session = { evaluate: async () => false };
    await assert.rejects(
      waitForState(session, { testId: 'missing' }, { kind: 'visible' }, 20),
      /Timed out waiting for state/u,
    );
  });

  it('delegates host commands to the public host controller', async () => {
    const calls = [];
    await runStep(
      { id: 'command', operation: 'host-command', command: 'neko.canvas.resetZoom', args: [] },
      { host: { execute: async (...args) => calls.push(args) }, defaultTimeoutMs: 1000 },
    );
    assert.deepEqual(calls, [['execute-command', { command: 'neko.canvas.resetZoom', args: [] }]]);
  });

  it('reads typed diagnostics through the public VS Code host boundary', async () => {
    const calls = [];
    await runStep(
      { id: 'diagnostics', operation: 'read-diagnostics', path: 'story.fountain' },
      { host: { execute: async (...args) => calls.push(args) }, defaultTimeoutMs: 1000 },
    );
    assert.deepEqual(calls, [['read-diagnostics', { path: 'story.fountain' }]]);
  });

  it('focuses the nested VS Code Webview frame chain before iframe keyboard input', async () => {
    const calls = [];
    await runStep(
      { id: 'delete', operation: 'key', key: 'Delete' },
      {
        keyboard: {
          focusFrame: async (frameId) => calls.push(['focus-frame', frameId]),
          dispatchKey: async (key) => calls.push(['page', key]),
        },
        webview: {
          target: { id: 'canvas-webview-bootstrap-frame' },
          documentFrameId: 'canvas-webview-content-frame',
          hasDocumentFocus: async () => false,
          focusFrame: async (frameId) => calls.push(['focus-content-frame', frameId]),
          dispatchKey: async (key) => calls.push(['iframe', key]),
        },
        defaultTimeoutMs: 1000,
      },
    );

    assert.deepEqual(calls, [
      ['focus-frame', 'canvas-webview-bootstrap-frame'],
      ['focus-content-frame', 'canvas-webview-content-frame'],
      ['iframe', 'Delete'],
    ]);
  });

  it('preserves an editable element that already owns Webview document focus', async () => {
    const calls = [];
    await runStep(
      { id: 'delete', operation: 'key', key: 'Delete' },
      {
        keyboard: { focusFrame: async (frameId) => calls.push(['focus-frame', frameId]) },
        webview: {
          target: { id: 'canvas-webview-bootstrap-frame' },
          documentFrameId: 'canvas-webview-content-frame',
          hasDocumentFocus: async () => true,
          focusFrame: async (frameId) => calls.push(['focus-content-frame', frameId]),
          dispatchKey: async (key) => calls.push(['iframe', key]),
        },
        defaultTimeoutMs: 1000,
      },
    );

    assert.deepEqual(calls, [['iframe', 'Delete']]);
  });
});
