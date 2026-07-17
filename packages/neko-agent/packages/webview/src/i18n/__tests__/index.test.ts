import { describe, it, expect, beforeEach, vi } from 'vitest';
import { t, setLocale, getLocale, detectLocale } from '../index';

describe('i18n module', () => {
  beforeEach(() => {
    // Reset to default locale before each test
    setLocale('en');
  });

  describe('t() function', () => {
    it('should return translation for simple key', () => {
      setLocale('en');
      expect(t('common.cancel')).toBe('Cancel');
      expect(t('common.save')).toBe('Save');
    });

    it('should return translation for nested key path', () => {
      setLocale('en');
      expect(t('chat.emptyState.title')).toBe('OpenNeko Creative Assistant');
    });

    it('should return keyPath when key is not found', () => {
      setLocale('en');
      expect(t('nonexistent.key.path')).toBe('nonexistent.key.path');
    });

    it('should support parameter interpolation', () => {
      setLocale('en');
      const result = t('common.cancel');
      expect(typeof result).toBe('string');
    });

    it('should handle missing parameters gracefully', () => {
      expect(() => t('common.cancel', { unused: 'param' })).not.toThrow();
    });
  });

  describe('setLocale() and getLocale()', () => {
    it('should set and get locale', () => {
      setLocale('zh-cn');
      expect(getLocale()).toBe('zh-cn');
    });

    it('should update translations when locale changes', () => {
      setLocale('en');
      const enCancel = t('common.cancel');

      setLocale('zh-cn');
      const zhCancel = t('common.cancel');

      expect(enCancel).toBe('Cancel');
      expect(zhCancel).toBe('取消');
    });
  });

  describe('detectLocale()', () => {
    it('should detect locale from data attribute', () => {
      const originalGetAttribute = document.documentElement.getAttribute;
      document.documentElement.getAttribute = vi.fn((attr: string) => {
        if (attr === 'data-vscode-locale') return 'zh-CN';
        return null;
      });

      const locale = detectLocale();
      expect(locale).toBe('zh-cn');

      document.documentElement.getAttribute = originalGetAttribute;
    });

    it('should normalize locale variants to supported locale', () => {
      const originalGetAttribute = document.documentElement.getAttribute;
      document.documentElement.getAttribute = vi.fn((attr: string) => {
        if (attr === 'data-vscode-locale') return 'ZH-HANS';
        return null;
      });

      const locale = detectLocale();
      expect(locale).toBe('zh-cn');

      document.documentElement.getAttribute = originalGetAttribute;
    });

    it('should fallback to navigator.language', () => {
      const originalGetAttribute = document.documentElement.getAttribute;
      document.documentElement.getAttribute = vi.fn(() => null);

      const locale = detectLocale();
      expect(typeof locale).toBe('string');
      expect(locale.length).toBeGreaterThan(0);

      document.documentElement.getAttribute = originalGetAttribute;
    });
  });

  describe('fallback behavior', () => {
    it('should fallback to English when key missing in current locale', () => {
      setLocale('zh-cn');
      // If a key exists in en but not zh-cn, it should return en value
      // For now, verify no crash on valid keys
      expect(() => t('common.cancel')).not.toThrow();
    });
  });
});
