import type { SupportedLocale } from '@neko/ui/i18n';

export function foundationLabel(locale: SupportedLocale, chinese: string, english: string): string {
  return locale === 'zh-cn' ? chinese : english;
}

export function formatCount(
  locale: SupportedLocale,
  count: number,
  chineseNoun: string,
  englishNoun: string,
): string {
  return locale === 'zh-cn'
    ? `${String(count)} ${chineseNoun}`
    : `${String(count)} ${englishNoun}${count === 1 ? '' : 's'}`;
}
