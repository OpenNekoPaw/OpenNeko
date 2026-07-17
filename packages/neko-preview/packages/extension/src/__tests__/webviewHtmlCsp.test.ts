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
  });
}

function devHtml(entry: PreviewEntry): string {
  return getWebviewHtml({
    webview: webview as never,
    extensionUri: extensionUri as never,
    entry,
    devMode: true,
    devPort: 5174,
  });
}

describe('preview webview CSP', () => {
  it.each<PreviewEntry>(['video', 'audio', 'pdf', 'cbz', 'epub', 'docx'])(
    'allows bundled data URL fonts for %s in production',
    (entry) => {
      expect(prodHtml(entry)).toContain('font-src');
      expect(prodHtml(entry)).toContain('data:;');
    },
  );

  it('allows data URL fonts for video/audio entries in dev mode too', () => {
    expect(devHtml('video')).toContain('font-src http://localhost:5174 data:;');
    expect(devHtml('audio')).toContain('font-src http://localhost:5174 data:;');
  });
});
