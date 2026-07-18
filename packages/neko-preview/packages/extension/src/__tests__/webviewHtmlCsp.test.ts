import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  Uri: {
    joinPath: (base: { path: string }, ...segments: string[]) => ({
      path: [base.path, ...segments].join('/'),
    }),
  },
}));

vi.mock('@neko/shared/vscode/extension', () => ({
  injectLocaleAttribute: () => 'lang="en"',
}));

vi.mock('../utils/nonce', () => ({
  getNonce: () => 'test-nonce',
}));

import { getWebviewHtml, type PreviewEntry } from '../utils/html';

const webview = {
  cspSource: 'https://webview.csp',
  asWebviewUri: (uri: { path: string }) => `vscode-webview:${uri.path}`,
};

const extensionUri = { path: '/extension' };

function prodHtml(entry: PreviewEntry): string {
  return getWebviewHtml({
    webview: webview as never,
    extensionUri: extensionUri as never,
    entry,
    ...(entry === 'model' ? { modelSessionId: 'session-1' } : {}),
  });
}

function devHtml(entry: PreviewEntry): string {
  return getWebviewHtml({
    webview: webview as never,
    extensionUri: extensionUri as never,
    entry,
    devMode: true,
    devPort: 5174,
    ...(entry === 'model' ? { modelSessionId: 'session-1' } : {}),
  });
}

describe('preview webview CSP', () => {
  it.each<PreviewEntry>([
    'video',
    'audio',
    'panorama-image',
    'panorama-video',
    'pdf',
    'cbz',
    'epub',
    'docx',
    'model',
  ])('allows bundled data URL fonts for %s in production', (entry) => {
    expect(prodHtml(entry)).toContain('font-src');
    expect(prodHtml(entry)).toContain('data:;');
  });

  it('allows data URL fonts for video/audio entries in dev mode too', () => {
    expect(devHtml('video')).toContain('font-src http://localhost:5174 data:;');
    expect(devHtml('audio')).toContain('font-src http://localhost:5174 data:;');
  });

  it('keeps the model entry off loopback and websocket connections in production', () => {
    const html = prodHtml('model');
    expect(html).toContain('connect-src blob: https://webview.csp;');
    expect(html).toContain('img-src https://webview.csp data: blob:;');
    expect(html).not.toContain('ws://127.0.0.1');
    expect(html).not.toContain('http://127.0.0.1');
    expect(html).toContain('<title>3D Reference</title>');
    expect(html).toContain('data-model-session-id="session-1"');
  });

  it('allows only the Vite host and exact Webview resources for model loading in dev mode', () => {
    const html = devHtml('model');
    expect(html).toContain('connect-src blob: http://localhost:5174 https://webview.csp;');
    expect(html).toContain('img-src http://localhost:5174 https://webview.csp data: blob:;');
    expect(html).not.toContain('http://127.0.0.1');
  });
});
