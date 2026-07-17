import { classifyVSCodeWebviewConsoleMessage } from '../vscode-webview-warning-policy.mjs';

const RUNTIME_ERROR_SOURCES = Object.freeze([
  'webview-exception',
  'unhandled-rejection',
  'console',
  'log',
  'csp',
  'resource',
  'extension-host',
  'electron-main',
  'electron-preload',
]);

const LEVELLED_OBSERVATION_SOURCES = new Set([
  'console',
  'log',
  'extension-host',
  'electron-main',
  'electron-preload',
]);

export function classifyRuntimeEvents(events, policy) {
  const classified = events.map((event) => classifyRuntimeEvent(event, policy));
  return {
    events: classified,
    failures: classified.filter((event) => event.disposition === 'fail'),
    expected: classified.filter((event) => event.disposition === 'expected'),
    benign: classified.filter((event) => event.disposition === 'benign'),
  };
}

function classifyRuntimeEvent(event, policy) {
  if (!RUNTIME_ERROR_SOURCES.includes(event.source)) {
    return { ...event, disposition: 'fail', classification: 'unknown-runtime-source' };
  }
  if (event.diagnosticCode && policy.expectedDiagnosticCodes.includes(event.diagnosticCode)) {
    return { ...event, disposition: 'expected', classification: 'expected-diagnostic' };
  }
  const expectedRuntimeDiagnostic = classifyExpectedRuntimeDiagnostic(event, policy);
  if (expectedRuntimeDiagnostic) {
    return expectedRuntimeDiagnostic;
  }
  if (
    LEVELLED_OBSERVATION_SOURCES.has(event.source) &&
    !['error', 'warning', 'warn'].includes(event.level)
  ) {
    return { ...event, disposition: 'record', classification: `${event.source}-observation` };
  }
  if (['console', 'log'].includes(event.source)) {
    const developmentMarketplaceFailure = classifyDevelopmentExtensionMarketplace404(event, policy);
    if (developmentMarketplaceFailure) {
      return developmentMarketplaceFailure;
    }
  }
  if (['console', 'log'].includes(event.source) && ['warning', 'warn'].includes(event.level)) {
    const warning = classifyVSCodeWebviewConsoleMessage(event);
    if (warning.benign && policy.knownBenignWarningIds.includes(warning.warning.id)) {
      return { ...event, disposition: 'benign', classification: warning.classification };
    }
    if (!policy.failOnConsoleWarning) {
      return { ...event, disposition: 'record', classification: 'console-warning' };
    }
  }
  return { ...event, disposition: 'fail', classification: event.source };
}

function classifyExpectedRuntimeDiagnostic(event, policy) {
  const diagnosticCode = 'cut.engine.stream-unavailable';
  if (!policy.expectedDiagnosticCodes.includes(diagnosticCode)) {
    return undefined;
  }
  if (!isCutEngineStreamUnavailableEvent(event)) {
    return undefined;
  }
  return {
    ...event,
    diagnosticCode,
    disposition: 'expected',
    classification: 'cut-engine-stream-unavailable.v1',
  };
}

function isCutEngineStreamUnavailableEvent(event) {
  if (isCutEngineDispatchFailure(event)) return true;
  if (isCutStreamWebSocketResourceFailure(event)) return true;
  if (isCutStreamClientError(event)) return true;
  return isCutPreviewStreamError(event);
}

function isCutEngineDispatchFailure(event) {
  return (
    event.source === 'console' &&
    ['warning', 'warn'].includes(event.level) &&
    /^%c\[Extension Host\] %c\[\d{2}:\d{2}:\d{2}\.\d{3}\] \[NekoClient:EngineClient\][\s\S]* dispatch streams\/(?:update|applyOperation|quality) failed Object(?: \(|$)/u.test(
      event.message,
    )
  );
}

function isCutStreamWebSocketResourceFailure(event) {
  if (
    event.source !== 'log' ||
    event.level !== 'error' ||
    !/^WebSocket connection to 'ws:\/\/(?:127\.0\.0\.1|localhost):\d+\/v1\/streams\/strm_editor-[av]_[A-Za-z0-9_-]+' failed: ?$/u.test(
      event.message,
    )
  ) {
    return false;
  }
  return isCutWebviewBundleUrl(event.url);
}

function isCutStreamClientError(event) {
  return (
    event.source === 'console' &&
    event.level === 'error' &&
    /^\[\d{2}:\d{2}:\d{2}\.\d{3}\] \[NekoClient:(?:Audio|H264)\] WebSocket error Event$/u.test(
      event.message,
    )
  );
}

function isCutPreviewStreamError(event) {
  if (event.source !== 'console' || event.level !== 'error') return false;
  const match = event.message.match(
    /^\[\d{2}:\d{2}:\d{2}\.\d{3}\] \[NekoCut:PreviewPanel\] H\.264 stream error: Error: WebSocket connection error(?:\n[\s\S]+)?$/u,
  );
  if (!match) return false;
  const stackStart = event.message.indexOf('\n');
  return stackStart === -1 || isCutWebviewBundleUrl(event.message.slice(stackStart + 1));
}

function isCutWebviewBundleUrl(value) {
  return (
    typeof value === 'string' &&
    value.includes('file+.vscode-resource.vscode-cdn.net/') &&
    value.includes('/packages/neko-cut/dist/webview/assets/')
  );
}

function classifyDevelopmentExtensionMarketplace404(event, policy) {
  const policyId = 'vscode-development-extension-marketplace-404';
  if (!policy.knownBenignWarningIds.includes(policyId) || event.level !== 'error') {
    return undefined;
  }
  if (event.message !== 'Failed to load resource: the server responded with a status of 404 ()') {
    return undefined;
  }
  let url;
  try {
    url = new URL(event.url);
  } catch {
    return undefined;
  }
  const match = url.pathname.match(
    /^\/_apis\/public\/gallery\/vscode\/([^/]+)\/([^/]+)\/latest$/u,
  );
  if (url.protocol !== 'https:' || url.hostname !== 'marketplace.visualstudio.com' || !match) {
    return undefined;
  }
  const extensionId = `${decodeURIComponent(match[1])}.${decodeURIComponent(match[2])}`;
  if (!policy.developmentExtensionIds?.includes(extensionId)) {
    return undefined;
  }
  return {
    ...event,
    disposition: 'benign',
    classification: policyId,
    extensionId,
  };
}
