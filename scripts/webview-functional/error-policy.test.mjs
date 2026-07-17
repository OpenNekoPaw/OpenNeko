import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyRuntimeEvents } from './error-policy.mjs';

const policy = Object.freeze({
  knownBenignWarningIds: [
    'vscode-webview-local-network-access',
    'vscode-development-extension-marketplace-404',
  ],
  expectedDiagnosticCodes: ['engine.unavailable'],
  failOnConsoleWarning: true,
  developmentExtensionIds: ['neko.neko-agent'],
});

describe('webview runtime error policy', () => {
  it('fails unknown errors and preserves expected typed diagnostics', () => {
    const result = classifyRuntimeEvents(
      [
        { source: 'webview-exception', level: 'error', message: 'boom' },
        { source: 'extension-host', level: 'error', diagnosticCode: 'engine.unavailable' },
      ],
      policy,
    );
    assert.equal(result.failures.length, 1);
    assert.equal(result.expected.length, 1);
  });

  it('only filters an allowlisted VS Code container warning', () => {
    const result = classifyRuntimeEvents(
      [
        {
          source: 'log',
          level: 'warning',
          message: "webviewElement.ts:427 Unrecognized feature: 'local-network-access'.",
        },
        { source: 'console', level: 'warning', message: 'Neko renderer warning' },
      ],
      policy,
    );
    assert.equal(result.benign.length, 1);
    assert.equal(result.failures.length, 1);
  });

  it('records host information while retaining host errors as failures', () => {
    const result = classifyRuntimeEvents(
      [
        { source: 'electron-main', applicationId: 'home', level: 'info', message: 'DevTools listening' },
        { source: 'electron-main', applicationId: 'home', level: 'error', message: 'main process failed' },
      ],
      policy,
    );
    assert.equal(result.events[0].disposition, 'record');
    assert.equal(result.failures.length, 1);
  });

  it('only filters Marketplace latest 404s for loaded development extensions', () => {
    const message = 'Failed to load resource: the server responded with a status of 404 ()';
    const result = classifyRuntimeEvents(
      [
        {
          source: 'log',
          level: 'error',
          message,
          url: 'https://marketplace.visualstudio.com/_apis/public/gallery/vscode/neko/neko-agent/latest',
        },
        {
          source: 'log',
          level: 'error',
          message,
          url: 'https://marketplace.visualstudio.com/_apis/public/gallery/vscode/neko/neko-unknown/latest',
        },
        {
          source: 'log',
          level: 'error',
          message,
          url: 'https://example.com/_apis/public/gallery/vscode/neko/neko-agent/latest',
        },
      ],
      policy,
    );

    assert.equal(result.benign.length, 1);
    assert.equal(result.benign[0].extensionId, 'neko.neko-agent');
    assert.equal(result.failures.length, 2);
  });

  it('classifies only source-matched Cut stream disconnect evidence as an expected diagnostic', () => {
    const cutPolicy = {
      ...policy,
      expectedDiagnosticCodes: ['cut.engine.stream-unavailable'],
    };
    const cutBundleUrl =
      'https://file+.vscode-resource.vscode-cdn.net/workspace/packages/neko-cut/dist/webview/assets/index.js';
    const result = classifyRuntimeEvents(
      [
        {
          source: 'console',
          level: 'warning',
          message:
            '%c[Extension Host] %c[00:03:39.091] [NekoClient:EngineClient] color: blue color:  dispatch streams/update failed Object (at console.<anonymous>)',
        },
        {
          source: 'console',
          level: 'warning',
          message:
            '%c[Extension Host] %c[00:03:39.094] [NekoClient:EngineClient] color: blue color:  dispatch streams/applyOperation failed Object (at console.<anonymous>)',
        },
        {
          source: 'console',
          level: 'warning',
          message:
            '%c[Extension Host] %c[00:03:39.143] [NekoClient:EngineClient] color: blue color:  dispatch streams/quality failed Object (at console.<anonymous>)',
        },
        {
          source: 'log',
          level: 'error',
          message:
            "WebSocket connection to 'ws://127.0.0.1:55030/v1/streams/strm_editor-a_0001' failed: ",
          url: cutBundleUrl,
        },
        {
          source: 'console',
          level: 'error',
          message: '[00:03:39.086] [NekoClient:Audio] WebSocket error Event',
        },
        {
          source: 'log',
          level: 'error',
          message:
            "WebSocket connection to 'ws://127.0.0.1:55030/v1/streams/strm_editor-v_0000' failed: ",
          url: cutBundleUrl,
        },
        {
          source: 'console',
          level: 'error',
          message: '[00:03:39.141] [NekoClient:H264] WebSocket error Event',
        },
        {
          source: 'console',
          level: 'error',
          message:
            '[00:03:39.141] [NekoCut:PreviewPanel] H.264 stream error: Error: WebSocket connection error\n    at ws.onerror (https://file+.vscode-resource.vscode-cdn.net/workspace/packages/neko-cut/dist/webview/assets/index.js:96:95820)',
        },
      ],
      cutPolicy,
    );

    assert.equal(result.failures.length, 0);
    assert.equal(result.expected.length, 8);
    assert.ok(
      result.expected.every(
        (event) =>
          event.diagnosticCode === 'cut.engine.stream-unavailable' &&
          event.classification === 'cut-engine-stream-unavailable.v1',
      ),
    );
  });

  it('does not classify near-miss stream failures as the Cut expected diagnostic', () => {
    const cutPolicy = {
      ...policy,
      expectedDiagnosticCodes: ['cut.engine.stream-unavailable'],
    };
    const result = classifyRuntimeEvents(
      [
        {
          source: 'log',
          level: 'error',
          message:
            "WebSocket connection to 'wss://example.com/v1/streams/strm_editor-v_0000' failed: ",
          url: 'https://file+.vscode-resource.vscode-cdn.net/workspace/packages/neko-cut/dist/webview/assets/index.js',
        },
        {
          source: 'log',
          level: 'error',
          message:
            "WebSocket connection to 'ws://127.0.0.1:55030/v1/streams/strm_editor-v_0000' failed: ",
          url: 'https://file+.vscode-resource.vscode-cdn.net/workspace/packages/neko-model/dist/webview/assets/index.js',
        },
        {
          source: 'console',
          level: 'error',
          message: '[00:03:39.141] [NekoClient:H264] Decoder error Event',
        },
      ],
      cutPolicy,
    );

    assert.equal(result.expected.length, 0);
    assert.equal(result.failures.length, 3);
  });
});
