export const BENIGN_VSCODE_WEBVIEW_CONSOLE_WARNINGS = Object.freeze([
  Object.freeze({
    id: 'vscode-webview-local-network-access',
    source: 'VS Code Webview container',
    pattern: "Unrecognized feature: 'local-network-access'",
    handling:
      'Ignore for Neko runtime acceptance. VS Code emits this while creating Webview iframes; extension code cannot change the iframe allow attribute.',
  }),
  Object.freeze({
    id: 'vscode-webview-sandbox-same-origin-scripts',
    source: 'VS Code Webview container',
    pattern:
      'An iframe which has both allow-scripts and allow-same-origin for its sandbox attribute can escape its sandboxing.',
    handling:
      'Ignore for Neko runtime acceptance when the stack points to VS Code webviewElement/overlayWebview creation. Treat Neko CSP or resource errors separately.',
  }),
]);

const VSCODE_WEBVIEW_CONTAINER_STACK_MARKERS = Object.freeze([
  'webviewElement.ts',
  'overlayWebview.ts',
  'customEditorInput.ts',
  'webviewEditor.ts',
]);

export function classifyVSCodeWebviewConsoleMessage(messageOrText) {
  const text = normalizeConsoleMessage(messageOrText);
  const matchedWarning = BENIGN_VSCODE_WEBVIEW_CONSOLE_WARNINGS.find((warning) =>
    text.includes(warning.pattern),
  );

  if (!matchedWarning) {
    return {
      classification: 'unknown',
      benign: false,
      warning: undefined,
    };
  }

  return {
    classification: hasVSCodeWebviewContainerStack(text)
      ? 'benign-vscode-webview-container'
      : 'known-vscode-webview-container-warning',
    benign: true,
    warning: matchedWarning,
  };
}

function normalizeConsoleMessage(messageOrText) {
  if (typeof messageOrText === 'string') {
    return messageOrText;
  }
  if (!messageOrText || typeof messageOrText !== 'object') {
    return '';
  }

  const candidates = [
    messageOrText.text,
    messageOrText.message,
    messageOrText.description,
    messageOrText.stack,
    messageOrText.url,
  ];

  return candidates
    .filter((candidate) => typeof candidate === 'string')
    .join('\n');
}

function hasVSCodeWebviewContainerStack(text) {
  return VSCODE_WEBVIEW_CONTAINER_STACK_MARKERS.some((marker) => text.includes(marker));
}
