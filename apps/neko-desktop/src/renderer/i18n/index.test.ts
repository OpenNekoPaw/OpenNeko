// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { applyDesktopLocale, createDesktopI18n, detectDesktopLocale } from './index';

describe('Desktop renderer i18n', () => {
  it('provides complete English and Simplified Chinese Shell bundles', () => {
    const en = createDesktopI18n('en');
    const zhCN = createDesktopI18n('zh-cn');

    expect(en.t('home.start.title')).toBe('Create with OpenNeko');
    expect(zhCN.t('home.start.title')).toBe('与 OpenNeko 一起创作');
    expect(
      (['home.allProjects', 'home.works', 'home.mediaLibrary', 'home.capabilities'] as const).map(
        (key) => zhCN.t(key),
      ),
    ).toEqual(['项目', '作品', '资产库', '扩展']);
    expect(zhCN.t('workspace.canvas.unavailable')).toBe('画布尚不可用');
    expect(en.t('workspace.quickCreate.open')).toBe('Create content');
    expect(zhCN.t('workspace.quickCreate.open')).toBe('创建内容');
    expect(zhCN.t('workspace.quickCreate.targetRoot')).toBe('工作区根目录');
    expect(
      en.t('shell.conversationRecordInvalid', { conversationId: 'conversation:invalid' }),
    ).toContain("Saved conversation 'conversation:invalid'");
    expect(
      zhCN.t('shell.conversationRecordInvalid', { conversationId: 'conversation:invalid' }),
    ).toContain('旧会话“conversation:invalid”');
    expect(zhCN.t('shell.openProject')).not.toBe('shell.openProject');
    expect(en.t('skill.catalog.content-authoring.title')).toBe('Content authoring');
    expect(zhCN.t('skill.catalog.content-authoring.title')).toBe('内容创作');
  });

  it('normalizes the Electron locale and projects it onto the embedded Webview DOM', () => {
    expect(detectDesktopLocale({ languages: ['zh-Hans-HK'], language: 'en-US' })).toBe('zh-cn');

    applyDesktopLocale(document, 'zh-cn');

    expect(document.documentElement.lang).toBe('zh-CN');
    expect(document.documentElement.dataset.nekoLocale).toBe('zh-cn');
  });
});
