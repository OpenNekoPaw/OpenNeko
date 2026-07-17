import { describe, expect, expectTypeOf, it } from 'vitest';
import { createStrictTranslator, type StrictMessageKey } from './strict';

const source = {
  owner: '@neko/test',
  bundles: {
    en: {
      'test.greeting': 'Hello, {name}.',
      'test.braces': '{{value}} = {value}',
      'test.once': '{value}',
      'test.empty': 'Ready',
    },
    'zh-cn': {
      'test.greeting': '你好，{name}。',
      'test.braces': '{{值}} = {value}',
      'test.once': '{value}',
      'test.empty': '就绪',
    },
  },
} as const;

describe('createStrictTranslator', () => {
  it('selects one resolved locale and exposes a typed key union', () => {
    const translator = createStrictTranslator('zh-cn', [source] as const);

    expect(translator.locale).toBe('zh-cn');
    expect(translator.t('test.greeting', { name: 'Neko' })).toBe('你好，Neko。');
    expectTypeOf(translator.t)
      .parameter(0)
      .toEqualTypeOf<'test.greeting' | 'test.braces' | 'test.once' | 'test.empty'>();
  });

  it('composes heterogeneous owner key unions without collapsing to never', () => {
    const secondSource = {
      owner: '@neko/second-test',
      bundles: {
        en: { 'second.ready': 'Ready' },
        'zh-cn': { 'second.ready': '就绪' },
      },
    } as const;
    const sources = [source, secondSource] as const;
    const translator = createStrictTranslator('en', sources);

    expectTypeOf<StrictMessageKey<typeof sources>>().toEqualTypeOf<
      'test.greeting' | 'test.braces' | 'test.once' | 'test.empty' | 'second.ready'
    >();
    expectTypeOf(translator.t)
      .parameter(0)
      .toEqualTypeOf<
        'test.greeting' | 'test.braces' | 'test.once' | 'test.empty' | 'second.ready'
      >();
    expect(translator.t('second.ready')).toBe('Ready');
  });

  it('supports escaped braces and interpolates inserted values only once', () => {
    const translator = createStrictTranslator('en', [source] as const);

    expect(translator.t('test.braces', { value: 3 })).toBe('{value} = 3');
    expect(translator.t('test.once', { value: '{name}' })).toBe('{name}');
  });

  it('requires the exact runtime parameter set', () => {
    const translator = createStrictTranslator('en', [source] as const);

    expect(() => translator.t('test.greeting')).toThrow('requires exact parameters [name]');
    expect(() => translator.t('test.greeting', {})).toThrow('requires exact parameters [name]');
    expect(() => translator.t('test.greeting', { name: 'Neko', extra: 1 })).toThrow(
      'received [extra, name]',
    );
    expect(() =>
      translator.t('test.greeting', { name: undefined } as unknown as { name: string }),
    ).toThrow('must be a defined string or number');
    expect(translator.t('test.empty')).toBe('Ready');
    expect(translator.t('test.empty', {})).toBe('Ready');
  });

  it('rejects locale key mismatches', () => {
    expect(() =>
      createStrictTranslator('en', [
        {
          owner: 'mismatch',
          bundles: { en: { 'test.a': 'A' }, 'zh-cn': { 'test.b': '乙' } },
        },
      ] as const),
    ).toThrow('mismatched locale keys');
  });

  it('rejects placeholder mismatches and invalid placeholder syntax', () => {
    expect(() =>
      createStrictTranslator('en', [
        {
          owner: 'placeholder-mismatch',
          bundles: { en: { 'test.a': '{name}' }, 'zh-cn': { 'test.a': '{value}' } },
        },
      ] as const),
    ).toThrow('mismatched placeholders');

    for (const template of ['{0}', '{nested.value}', '{name', 'name}', '{}']) {
      expect(() =>
        createStrictTranslator('en', [
          {
            owner: 'invalid',
            bundles: { en: { 'test.a': template }, 'zh-cn': { 'test.a': template } },
          },
        ] as const),
      ).toThrow(/has (invalid placeholder|unclosed placeholder|unescaped closing brace)/);
    }
  });

  it('rejects collisions between statically composed owners', () => {
    expect(() => createStrictTranslator('en', [source, source] as const)).toThrow(
      'message key collision',
    );
  });

  it('fails visibly for unknown runtime keys without fallback', () => {
    const translator = createStrictTranslator('en', [source] as const);

    expect(() => translator.t('test.missing' as 'test.greeting')).toThrow(
      'missing message key "test.missing"',
    );
  });

  it('requires a non-empty static source set and valid owner', () => {
    expect(() => createStrictTranslator('en', [])).toThrow('at least one message bundle source');
    expect(() =>
      createStrictTranslator('en', [
        { owner: '', bundles: { en: { 'test.a': 'A' }, 'zh-cn': { 'test.a': '甲' } } },
      ] as const),
    ).toThrow('owner must not be empty');
  });
});
