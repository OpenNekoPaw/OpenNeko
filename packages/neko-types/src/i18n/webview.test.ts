// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { createWebviewI18n, detectWebviewLocale } from './webview';

describe('createWebviewI18n', () => {
  it('detects the VS Code Webview locale and registers locale bundles', () => {
    document.documentElement.setAttribute('data-vscode-locale', 'zh-CN');

    const adapter = createWebviewI18n({
      bundles: {
        en: { market: { greeting: 'Hello {name}' } },
        'zh-cn': { market: { greeting: '你好 {name}' } },
      },
    });

    expect(detectWebviewLocale()).toBe('zh-cn');
    expect(adapter.getLocale()).toBe('zh-cn');
    expect(adapter.t('greeting', { name: 'Neko' })).toBe('你好 Neko');
  });

  it('falls back to the default locale and then the key for missing messages', () => {
    const adapter = createWebviewI18n({
      initialLocale: 'zh-cn',
      bundles: {
        en: { preview: { play: 'Play' } },
        'zh-cn': { preview: {} },
      },
    });

    expect(adapter.t('play')).toBe('Play');
    expect(adapter.t('missing.key')).toBe('missing.key');
  });

  it('updates and reports the current locale through the adapter', () => {
    const adapter = createWebviewI18n({
      initialLocale: 'en',
      bundles: {
        en: { story: { title: 'Story' } },
        'zh-cn': { story: { title: '剧本' } },
      },
    });

    adapter.setLocale('zh-cn');

    expect(adapter.getLocale()).toBe('zh-cn');
    expect(adapter.t('title')).toBe('剧本');
  });
});
