import type { SupportedLocale } from './types';

export type StrictMessageParameters = Readonly<Record<string, string | number>>;

export interface StrictMessageBundleSource<
  EnglishBundle extends Readonly<Record<string, string>> = Readonly<Record<string, string>>,
  ChineseBundle extends Readonly<Record<string, string>> = Readonly<Record<string, string>>,
> {
  readonly owner: string;
  readonly bundles: Readonly<{
    readonly en: EnglishBundle;
    readonly 'zh-cn': ChineseBundle;
  }>;
}

type SourceMessageKey<Source> = Source extends {
  readonly bundles: {
    readonly en: infer EnglishBundle;
  };
}
  ? EnglishBundle extends Readonly<Record<string, string>>
    ? Extract<keyof EnglishBundle, string>
    : never
  : never;

export type StrictMessageKey<Sources extends readonly StrictMessageBundleSource[]> =
  SourceMessageKey<Sources[number]>;

export interface StrictTranslator<MessageKey extends string> {
  readonly locale: SupportedLocale;
  readonly t: (key: MessageKey, params?: StrictMessageParameters) => string;
}

interface CompiledMessage {
  readonly template: string;
  readonly placeholders: ReadonlySet<string>;
}

export function createStrictTranslator<const Sources extends readonly StrictMessageBundleSource[]>(
  locale: SupportedLocale,
  sources: Sources,
): StrictTranslator<StrictMessageKey<Sources>> {
  if (sources.length === 0) {
    throw new Error('Strict translator requires at least one message bundle source.');
  }

  const messages = new Map<string, CompiledMessage>();
  const owners = new Map<string, string>();

  for (const source of sources) {
    validateSource(source);
    const englishKeys = Object.keys(source.bundles.en);
    const chineseKeys = Object.keys(source.bundles['zh-cn']);
    assertSameKeys(source.owner, englishKeys, chineseKeys);

    for (const key of englishKeys) {
      const previousOwner = owners.get(key);
      if (previousOwner !== undefined) {
        throw new Error(
          `Strict translator message key collision: "${key}" is owned by both "${previousOwner}" and "${source.owner}".`,
        );
      }

      const englishTemplate = source.bundles.en[key];
      const chineseTemplate = source.bundles['zh-cn'][key];
      if (englishTemplate === undefined || chineseTemplate === undefined) {
        throw new Error(`Strict translator bundle "${source.owner}" is missing key "${key}".`);
      }

      const englishPlaceholders = parsePlaceholders(key, 'en', englishTemplate);
      const chinesePlaceholders = parsePlaceholders(key, 'zh-cn', chineseTemplate);
      assertSamePlaceholders(key, englishPlaceholders, chinesePlaceholders);

      owners.set(key, source.owner);
      messages.set(key, {
        template: locale === 'en' ? englishTemplate : chineseTemplate,
        placeholders: englishPlaceholders,
      });
    }
  }

  return {
    locale,
    t(key, params) {
      const message = messages.get(key);
      if (message === undefined) {
        throw new Error(`Strict translator is missing message key "${key}".`);
      }
      validateParameters(key, message.placeholders, params);
      return renderTemplate(message.template, params);
    },
  };
}

function validateSource(source: StrictMessageBundleSource): void {
  if (source.owner.length === 0) {
    throw new Error('Strict translator bundle owner must not be empty.');
  }
  if (!isBundle(source.bundles.en) || !isBundle(source.bundles['zh-cn'])) {
    throw new Error(
      `Strict translator bundle "${source.owner}" must contain valid en and zh-cn maps.`,
    );
  }
}

function isBundle(value: unknown): value is Readonly<Record<string, string>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value).every((message) => typeof message === 'string');
}

function assertSameKeys(
  owner: string,
  englishKeys: readonly string[],
  chineseKeys: readonly string[],
): void {
  const english = [...englishKeys].sort();
  const chinese = [...chineseKeys].sort();
  if (english.length === chinese.length && english.every((key, index) => key === chinese[index])) {
    return;
  }
  throw new Error(
    `Strict translator bundle "${owner}" has mismatched locale keys: en=[${english.join(', ')}], zh-cn=[${chinese.join(', ')}].`,
  );
}

function parsePlaceholders(
  key: string,
  locale: SupportedLocale,
  template: string,
): ReadonlySet<string> {
  const placeholders = new Set<string>();
  for (let index = 0; index < template.length; index += 1) {
    const character = template[index];
    const next = template[index + 1];
    if ((character === '{' && next === '{') || (character === '}' && next === '}')) {
      index += 1;
      continue;
    }
    if (character === '}') {
      throw invalidTemplate(key, locale, 'unescaped closing brace');
    }
    if (character !== '{') continue;

    const closingIndex = template.indexOf('}', index + 1);
    if (closingIndex === -1) {
      throw invalidTemplate(key, locale, 'unclosed placeholder');
    }
    const name = template.slice(index + 1, closingIndex);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw invalidTemplate(key, locale, `invalid placeholder "${name}"`);
    }
    placeholders.add(name);
    index = closingIndex;
  }
  return placeholders;
}

function invalidTemplate(key: string, locale: SupportedLocale, reason: string): Error {
  return new Error(`Strict translator message "${key}" (${locale}) has ${reason}.`);
}

function assertSamePlaceholders(
  key: string,
  english: ReadonlySet<string>,
  chinese: ReadonlySet<string>,
): void {
  const englishNames = [...english].sort();
  const chineseNames = [...chinese].sort();
  if (
    englishNames.length === chineseNames.length &&
    englishNames.every((name, index) => name === chineseNames[index])
  ) {
    return;
  }
  throw new Error(
    `Strict translator message "${key}" has mismatched placeholders: en=[${englishNames.join(', ')}], zh-cn=[${chineseNames.join(', ')}].`,
  );
}

function validateParameters(
  key: string,
  expected: ReadonlySet<string>,
  params: StrictMessageParameters | undefined,
): void {
  const actualParams = params ?? {};
  const actualNames = Object.keys(actualParams).sort();
  const expectedNames = [...expected].sort();

  for (const name of actualNames) {
    const value: unknown = actualParams[name];
    if (value === undefined || (typeof value !== 'string' && typeof value !== 'number')) {
      throw new Error(
        `Strict translator message "${key}" parameter "${name}" must be a defined string or number.`,
      );
    }
  }

  if (
    actualNames.length !== expectedNames.length ||
    !actualNames.every((name, index) => name === expectedNames[index])
  ) {
    throw new Error(
      `Strict translator message "${key}" requires exact parameters [${expectedNames.join(', ')}], received [${actualNames.join(', ')}].`,
    );
  }
}

function renderTemplate(template: string, params: StrictMessageParameters | undefined): string {
  let result = '';
  for (let index = 0; index < template.length; index += 1) {
    const character = template[index];
    const next = template[index + 1];
    if (character === '{' && next === '{') {
      result += '{';
      index += 1;
      continue;
    }
    if (character === '}' && next === '}') {
      result += '}';
      index += 1;
      continue;
    }
    if (character !== '{') {
      result += character;
      continue;
    }

    const closingIndex = template.indexOf('}', index + 1);
    const name = template.slice(index + 1, closingIndex);
    result += String(params?.[name]);
    index = closingIndex;
  }
  return result;
}
