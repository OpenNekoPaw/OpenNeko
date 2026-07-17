import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BENIGN_VSCODE_WEBVIEW_CONSOLE_WARNINGS,
  classifyVSCodeWebviewConsoleMessage,
} from './vscode-webview-warning-policy.mjs';

describe('VS Code webview warning policy', () => {
  it('classifies the local-network-access warning as benign VS Code container noise', () => {
    const result = classifyVSCodeWebviewConsoleMessage(
      "webviewElement.ts:427 Unrecognized feature: 'local-network-access'.",
    );

    assert.equal(result.benign, true);
    assert.equal(result.warning?.id, 'vscode-webview-local-network-access');
    assert.equal(result.classification, 'benign-vscode-webview-container');
  });

  it('classifies the sandbox allow-scripts plus allow-same-origin warning as benign', () => {
    const result = classifyVSCodeWebviewConsoleMessage({
      text: 'An iframe which has both allow-scripts and allow-same-origin for its sandbox attribute can escape its sandboxing.',
      stack: 'mountTo @ webviewElement.ts:507\n_show @ overlayWebview.ts:232',
    });

    assert.equal(result.benign, true);
    assert.equal(result.warning?.id, 'vscode-webview-sandbox-same-origin-scripts');
    assert.equal(result.classification, 'benign-vscode-webview-container');
  });

  it('keeps unrelated warnings outside the benign policy', () => {
    const result = classifyVSCodeWebviewConsoleMessage(
      'Failed to load resource: net::ERR_FILE_NOT_FOUND',
    );

    assert.equal(result.benign, false);
    assert.equal(result.warning, undefined);
    assert.equal(result.classification, 'unknown');
  });

  it('publishes smoke guidance for every benign warning pattern', () => {
    assert.equal(BENIGN_VSCODE_WEBVIEW_CONSOLE_WARNINGS.length, 2);
    for (const warning of BENIGN_VSCODE_WEBVIEW_CONSOLE_WARNINGS) {
      assert.match(warning.id, /^vscode-webview-/);
      assert.equal(warning.source, 'VS Code Webview container');
      assert.ok(warning.pattern.length > 0);
      assert.ok(warning.handling.length > 0);
    }
  });
});
