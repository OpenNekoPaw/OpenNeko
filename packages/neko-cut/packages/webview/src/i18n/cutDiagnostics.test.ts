import { describe, expect, it } from 'vitest';
import { CUT_USER_DIAGNOSTIC_CODES, type CutUserDiagnostic } from '@neko-cut/domain';
import { setLocale, t } from '.';
import { translateCutDiagnostic } from './cutDiagnostics';

describe('translateCutDiagnostic', () => {
  it('localizes every user diagnostic in English and Simplified Chinese', () => {
    for (const locale of ['en', 'zh-cn'] as const) {
      setLocale(locale);
      for (const code of CUT_USER_DIAGNOSTIC_CODES) {
        const message = translateCutDiagnostic(t, { code });
        expect(message, `${locale}:${code}`).not.toBe(`diagnostic.${code}`);
        expect(message.trim(), `${locale}:${code}`).not.toBe('');
      }
    }
  });

  it('uses a dedicated Chinese message for exact Clip placement overlap', () => {
    setLocale('zh-cn');
    expect(translateCutDiagnostic(t, { code: 'clip-placement-overlap' })).toBe(
      '片段不能与目标轨道上的其他片段重叠。',
    );
  });

  it('fails visibly for an unknown diagnostic code', () => {
    expect(() =>
      translateCutDiagnostic(t, { code: 'removed-code' } as unknown as CutUserDiagnostic),
    ).toThrow('Unknown Cut user diagnostic code');
  });
});
