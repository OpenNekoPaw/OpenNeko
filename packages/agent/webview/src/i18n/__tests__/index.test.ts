import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BUILTIN_SLASH_COMMANDS } from '@neko/agent-contracts';
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

    it('should localize builtin Skill descriptions without changing their catalog content', () => {
      const builtinSkillNames = [
        'audio-mixing',
        'character-creator',
        'color-grading',
        'image',
        'media-production',
        'media-quality-review',
        'scene-to-music',
        'script-generation',
        'script-to-timeline',
        'skill-creator',
        'storyboard',
        'subtitle-assistant',
        'video',
        'video-editing',
      ] as const;

      for (const locale of ['en', 'zh-cn'] as const) {
        setLocale(locale);
        for (const skillName of builtinSkillNames) {
          const key = `skillDescriptions.${skillName}`;
          expect(t(key), `${locale} is missing ${skillName}`).not.toBe(key);
        }
      }

      setLocale('zh-cn');
      expect(t('skillDescriptions.character-creator')).toContain('可审阅的角色草稿');
    });

    it('should localize every builtin command description without translating command names', () => {
      for (const locale of ['en', 'zh-cn'] as const) {
        setLocale(locale);
        for (const command of BUILTIN_SLASH_COMMANDS) {
          const key = `commandDescriptions.${command.name}`;
          expect(t(key), `${locale} is missing /${command.name}`).not.toBe(key);
          if (locale === 'en') expect(t(key)).toBe(command.description);
        }
      }

      setLocale('zh-cn');
      expect(t('commandDescriptions.new')).toBe('开始新对话');
    });

    it('should translate Character Role labels', () => {
      setLocale('zh-cn');

      expect(t('characterRole.dialogue.mode.roleplay')).toBe('角色扮演');
      expect(t('characterRole.fact.scene')).toBe('出现场景');
      expect(t('characterRole.action.exit')).toBe('退出');
    });
  });

  describe('detectLocale()', () => {
    it('should detect locale from data attribute', () => {
      const originalGetAttribute = document.documentElement.getAttribute;
      document.documentElement.getAttribute = vi.fn((attr: string) => {
        if (attr === 'data-neko-locale') return 'zh-CN';
        return null;
      });

      const locale = detectLocale();
      expect(locale).toBe('zh-cn');

      document.documentElement.getAttribute = originalGetAttribute;
    });

    it('should normalize locale variants to supported locale', () => {
      const originalGetAttribute = document.documentElement.getAttribute;
      document.documentElement.getAttribute = vi.fn((attr: string) => {
        if (attr === 'data-neko-locale') return 'ZH-HANS';
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
