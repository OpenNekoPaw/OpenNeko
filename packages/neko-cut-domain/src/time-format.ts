export interface FormatCutMediaTimeOptions {
  readonly fractionalDigits?: 0 | 1 | 2 | 3;
  readonly padMinutes?: boolean;
  readonly alwaysHours?: boolean;
  readonly rollHoursIntoMinutes?: boolean;
}

export function formatCutMediaTime(
  seconds: number,
  options: FormatCutMediaTimeOptions = {},
): string {
  if (!Number.isFinite(seconds) || seconds < 0) return zeroTime(options);
  const fractionalDigits = options.fractionalDigits ?? 0;
  const wholeSeconds = Math.floor(seconds);
  const hours = Math.floor(wholeSeconds / 3_600);
  const minutes = options.rollHoursIntoMinutes
    ? Math.floor(wholeSeconds / 60)
    : Math.floor((wholeSeconds % 3_600) / 60);
  const secondsPart = wholeSeconds % 60;
  const hasHours = hours > 0 && !options.rollHoursIntoMinutes;
  const minuteText =
    options.padMinutes || options.alwaysHours || hasHours
      ? minutes.toString().padStart(2, '0')
      : minutes.toString();
  const secondText = secondsPart.toString().padStart(2, '0');
  const fractionText = fraction(seconds, fractionalDigits);
  if (options.alwaysHours || hasHours) {
    return `${hours.toString().padStart(options.alwaysHours ? 2 : 1, '0')}:${minuteText}:${secondText}${fractionText}`;
  }
  return `${minuteText}:${secondText}${fractionText}`;
}

export function formatCutMediaTimeCentiseconds(
  seconds: number,
  options: Omit<FormatCutMediaTimeOptions, 'fractionalDigits'> = {},
): string {
  return formatCutMediaTime(seconds, { ...options, fractionalDigits: 2 });
}

function zeroTime(options: FormatCutMediaTimeOptions): string {
  const fractionalDigits = options.fractionalDigits ?? 0;
  const fractionText = fractionalDigits > 0 ? `.${'0'.repeat(fractionalDigits)}` : '';
  if (options.alwaysHours) return `00:00:00${fractionText}`;
  return `${options.padMinutes ? '00' : '0'}:00${fractionText}`;
}

function fraction(seconds: number, digits: 0 | 1 | 2 | 3): string {
  if (digits === 0) return '';
  const scale = 10 ** digits;
  return `.${Math.floor((seconds % 1) * scale)
    .toString()
    .padStart(digits, '0')}`;
}
