import { describe, expect, it } from 'vitest';
import {
  captureLocaleSourceSnapshot,
  detectHostLocale,
  LocaleResolutionError,
  resolveInvocationLocales,
} from '../locale-bootstrap';
import { formatTerminalDiagnosticLiteral } from '../../presentation/diagnostic-literal';

function resolve(input: Parameters<typeof captureLocaleSourceSnapshot>[0]) {
  return resolveInvocationLocales(captureLocaleSourceSnapshot(input));
}

function captureResolutionError(
  input: Parameters<typeof captureLocaleSourceSnapshot>[0],
): LocaleResolutionError {
  try {
    resolve(input);
  } catch (error) {
    if (error instanceof LocaleResolutionError) return error;
    throw error;
  }
  throw new Error('Expected locale resolution to fail.');
}

describe('invocation Locale bootstrap', () => {
  it('resolves UI and prompt precedence independently with prompt omission inheriting final UI', () => {
    expect(
      resolve({
        cliUiLocale: 'zh-cn',
        environment: { NEKO_UI_LOCALE: 'en', NEKO_PROMPT_LOCALE: 'en' },
        userConfig: { ui_locale: 'en', prompt_locale: 'zh-cn' },
        intlLocale: 'en-US',
      }),
    ).toEqual({ uiLocale: 'zh-cn', promptLocale: 'en' });

    expect(
      resolve({ environment: {}, userConfig: { ui_locale: 'zh-cn' }, intlLocale: 'en-US' }),
    ).toEqual({ uiLocale: 'zh-cn', promptLocale: 'zh-cn' });
  });

  it('makes explicit prompt auto follow final UI so automatic values cannot split', () => {
    expect(
      resolve({
        cliUiLocale: 'en',
        cliPromptLocale: 'auto',
        environment: { LANG: 'zh_CN.UTF-8' },
      }),
    ).toEqual({ uiLocale: 'en', promptLocale: 'en' });
  });

  it('validates every present explicit source even when a higher-precedence source exists', () => {
    for (const value of ['', ' zh-cn', 'zh-cn ', 'ZH-CN', 'zh', 'en-US']) {
      expect(
        captureResolutionError({
          cliUiLocale: 'en',
          environment: { NEKO_UI_LOCALE: value },
          intlLocale: 'en-US',
        }).diagnostic,
      ).toEqual({
        code: 'invalid-preference',
        source: 'NEKO_UI_LOCALE',
        value,
      });
    }
  });

  it('preserves absent versus present undefined environment values', () => {
    expect(
      captureResolutionError({
        environment: { NEKO_PROMPT_LOCALE: undefined },
        intlLocale: 'en-US',
      }).diagnostic,
    ).toEqual({
      code: 'invalid-preference',
      source: 'NEKO_PROMPT_LOCALE',
      value: undefined,
    });
    expect(resolve({ environment: {}, intlLocale: 'en-US' })).toEqual({
      uiLocale: 'en',
      promptLocale: 'en',
    });
  });

  it('rejects Locale ownership in workspace configuration without fallback', () => {
    expect(
      captureResolutionError({
        environment: {},
        workspaceConfig: { ui_locale: 'zh-cn' },
        intlLocale: 'en-US',
      }).diagnostic,
    ).toEqual({ code: 'workspace-locale-forbidden', key: 'ui_locale' });
    expect(
      captureResolutionError({
        environment: {},
        workspaceConfig: { prompt_locale: 'en' },
        intlLocale: 'en-US',
      }).diagnostic,
    ).toEqual({ code: 'workspace-locale-forbidden', key: 'prompt_locale' });
  });
});

describe('detectHostLocale', () => {
  it('uses LC_ALL → LC_MESSAGES → LANGUAGE → LANG → Intl and the first LANGUAGE token', () => {
    expect(
      detectHostLocale(
        { LC_ALL: 'en_US.UTF-8', LC_MESSAGES: 'zh_CN', LANGUAGE: 'zh_CN:en', LANG: 'zh_CN' },
        'zh-CN',
      ),
    ).toBe('en');
    expect(detectHostLocale({ LANGUAGE: 'zh_TW.UTF-8@variant:en_US' }, 'en-US')).toBe('zh-cn');
    expect(detectHostLocale({}, 'zh-Hant-TW')).toBe('zh-cn');
  });

  it('maps C/POSIX and every non-Chinese family to English', () => {
    expect(detectHostLocale({ LANG: 'C' }, 'zh-CN')).toBe('en');
    expect(detectHostLocale({ LANG: 'POSIX' }, 'zh-CN')).toBe('en');
    expect(detectHostLocale({ LANG: 'ja_JP.UTF-8' }, 'zh-CN')).toBe('en');
  });

  it('uses the operating-system preferred language ahead of conflicting process Locale', () => {
    expect(
      detectHostLocale({ LC_ALL: 'C.UTF-8', LANG: 'en_AU.UTF-8' }, 'en-US', {
        kind: 'os-preferred',
        locale: 'zh-Hans-CN',
      }),
    ).toBe('zh-cn');
  });

  it('falls back to English when the first operating-system language is unsupported or unavailable', () => {
    expect(
      detectHostLocale({ LC_ALL: 'zh_CN.UTF-8' }, 'zh-CN', {
        kind: 'os-preferred',
        locale: 'ja-JP',
      }),
    ).toBe('en');
    expect(detectHostLocale({ LC_ALL: 'zh_CN.UTF-8' }, 'zh-CN', { kind: 'os-unavailable' })).toBe(
      'en',
    );
  });
});

describe('formatTerminalDiagnosticLiteral', () => {
  it('escapes terminal controls, bidi controls and bounds raw values', () => {
    expect(formatTerminalDiagnosticLiteral('zh-cn\n\u001b[31m\u202e')).toBe(
      '"zh-cn\\n\\u001b[31m\\u202e"',
    );
    expect(formatTerminalDiagnosticLiteral('x'.repeat(100), 8)).toBe('"xxxxxxxx…"');
  });
});
