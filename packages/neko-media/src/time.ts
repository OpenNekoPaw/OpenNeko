export function formatMediaTime(seconds: number): string {
  const bounded = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const hours = Math.floor(bounded / 3600);
  const minutes = Math.floor((bounded % 3600) / 60);
  const remaining = Math.floor(bounded % 60);
  const minuteText = hours > 0 ? minutes.toString().padStart(2, '0') : String(minutes);
  const prefix = hours > 0 ? `${hours}:` : '';
  return `${prefix}${minuteText}:${remaining.toString().padStart(2, '0')}`;
}

export function formatMediaTimeWithFraction(seconds: number, fractionalDigits: number): string {
  const digits = Math.max(0, Math.min(3, Math.trunc(fractionalDigits)));
  const bounded = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const hours = Math.floor(bounded / 3600);
  const minutes = Math.floor((bounded % 3600) / 60);
  const wholeSeconds = Math.floor(bounded % 60);
  const scale = 10 ** digits;
  const fraction = Math.floor((bounded % 1) * scale);
  const secondText =
    digits > 0
      ? `${wholeSeconds.toString().padStart(2, '0')}.${fraction.toString().padStart(digits, '0')}`
      : wholeSeconds.toString().padStart(2, '0');
  const minuteText = hours > 0 ? minutes.toString().padStart(2, '0') : String(minutes);
  return `${hours > 0 ? `${hours}:` : ''}${minuteText}:${secondText}`;
}

export function formatMediaTimeCentiseconds(seconds: number): string {
  return formatMediaTimeWithFraction(seconds, 2);
}
