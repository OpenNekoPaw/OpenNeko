/**
 * Time formatting utilities for media players
 */

/**
 * Format seconds to MM:SS or HH:MM:SS display string
 */
export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Format seconds to precise display with milliseconds (M:SS.mmm)
 */
export function formatTimePrecise(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00.000';

  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

export interface FormatMediaTimeOptions {
  readonly fractionalDigits?: 0 | 1 | 2 | 3;
  readonly padMinutes?: boolean;
  readonly alwaysHours?: boolean;
  readonly rollHoursIntoMinutes?: boolean;
  readonly milliseconds?: boolean;
}

export function formatMediaTime(seconds: number, options: FormatMediaTimeOptions = {}): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return formatZeroMediaTime(options);
  }

  const fractionalDigits = options.fractionalDigits ?? 0;
  const totalWholeSeconds = Math.floor(seconds);
  const hours = Math.floor(totalWholeSeconds / 3600);
  const minutes = options.rollHoursIntoMinutes
    ? Math.floor(totalWholeSeconds / 60)
    : Math.floor((totalWholeSeconds % 3600) / 60);
  const secondsPart = totalWholeSeconds % 60;
  const hasHours = hours > 0 && !options.rollHoursIntoMinutes;
  const minuteText =
    options.padMinutes || options.alwaysHours || hasHours
      ? minutes.toString().padStart(2, '0')
      : minutes.toString();
  const secondText = secondsPart.toString().padStart(2, '0');
  const fractionText = formatFraction(seconds, fractionalDigits);

  if (options.alwaysHours || hasHours) {
    return `${hours.toString().padStart(options.alwaysHours ? 2 : 1, '0')}:${minuteText}:${secondText}${fractionText}`;
  }

  return `${minuteText}:${secondText}${fractionText}`;
}

export function formatMediaTimeFromMilliseconds(
  milliseconds: number,
  options: Omit<FormatMediaTimeOptions, 'milliseconds'> = {},
): string {
  return formatMediaTime(milliseconds / 1000, options);
}

export function formatMediaTimeCentiseconds(
  seconds: number,
  options: Omit<FormatMediaTimeOptions, 'fractionalDigits' | 'milliseconds'> = {},
): string {
  return formatMediaTime(seconds, { ...options, fractionalDigits: 2 });
}

function formatZeroMediaTime(options: FormatMediaTimeOptions): string {
  const fractionalDigits = options.fractionalDigits ?? 0;
  const fractionText = fractionalDigits > 0 ? `.${'0'.repeat(fractionalDigits)}` : '';
  if (options.alwaysHours) {
    return `00:00:00${fractionText}`;
  }
  const minuteText = options.padMinutes ? '00' : '0';
  return `${minuteText}:00${fractionText}`;
}

function formatFraction(seconds: number, fractionalDigits: 0 | 1 | 2 | 3): string {
  if (fractionalDigits === 0) {
    return '';
  }
  const scale = 10 ** fractionalDigits;
  const fraction = Math.floor((seconds % 1) * scale);
  return `.${fraction.toString().padStart(fractionalDigits, '0')}`;
}
