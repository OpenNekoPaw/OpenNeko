import { describe, expect, it } from 'vitest';
import type { PromptFragment } from '../prompt-fragment';
import { localizePromptFragment } from '../prompt-fragment';

describe('PromptFragment localization', () => {
  it('projects locale-specific content while preserving fragment metadata', () => {
    const fragment: PromptFragment = {
      id: 'provider:guide',
      content: 'English guide.',
      priority: 75,
      toolNames: ['CanvasQuery'],
      locales: {
        zh: {
          content: '中文指导。',
        },
      },
    };

    expect(localizePromptFragment(fragment, 'zh-TW')).toEqual({
      ...fragment,
      content: '中文指导。',
    });
  });

  it('falls back to English localized content for unsupported locales', () => {
    const fragment: PromptFragment = {
      id: 'provider:guide',
      content: 'Default guide.',
      toolNames: ['CanvasQuery'],
      locales: {
        en: {
          content: 'English guide.',
        },
      },
    };

    expect(localizePromptFragment(fragment, 'fr-FR').content).toBe('English guide.');
  });

  it('keeps the original fragment when no localized content matches', () => {
    const fragment: PromptFragment = {
      id: 'provider:guide',
      content: 'Default guide.',
      toolNames: ['CanvasQuery'],
      locales: {
        ja: {
          content: '日本語ガイド。',
        },
      },
    };

    expect(localizePromptFragment(fragment, 'zh-CN')).toBe(fragment);
  });
});
