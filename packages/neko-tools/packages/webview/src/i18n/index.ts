/**
 * i18n setup for neko-tools webview
 *
 * Uses shared I18nService from @neko/shared with Model B namespacing.
 * Registers 'mediaDiff' and 'assetDiff' namespaces.
 */
import { createWebviewI18n } from '@neko/shared/i18n/webview';

import { bundles as enBundles } from './locales/en';
import { bundles as zhCnBundles } from './locales/zh-cn';

const webviewI18n = createWebviewI18n({
  bundles: {
    en: enBundles,
    'zh-cn': zhCnBundles,
  },
});

export const { i18nService } = webviewI18n;
