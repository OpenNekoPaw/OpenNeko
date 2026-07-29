// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  applyDesktopLocale,
  createDesktopI18n,
  detectDesktopLocale,
} from './index';

describe('Desktop renderer i18n', () => {
  it('provides complete English and Simplified Chinese Shell bundles', () => {
    const en = createDesktopI18n('en');
    const zhCN = createDesktopI18n('zh-cn');

    expect(en.t('home.start.title')).toBe('Start creating');
    expect(zhCN.t('home.start.title')).toBe('开始创作');
    expect(zhCN.t('workspace.canvas.unavailable')).toBe('画布尚不可用');
    expect(zhCN.t('shell.openProject')).not.toBe('shell.openProject');
  });

  it('normalizes the Electron locale and projects it onto the embedded Webview DOM', () => {
    expect(detectDesktopLocale({ languages: ['zh-Hans-HK'], language: 'en-US' })).toBe(
      'zh-cn',
    );

    applyDesktopLocale(document, 'zh-cn');

    expect(document.documentElement.lang).toBe('zh-CN');
    expect(document.documentElement.dataset.vscodeLocale).toBe('zh-cn');
  });
});
