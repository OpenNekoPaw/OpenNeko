import type { SupportedLocale } from '@neko/shared/i18n';
import type { AgentTerminalFormatters } from './context';

const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB'] as const;
const MILLISECONDS_PER_SECOND = 1_000;
const MILLISECONDS_PER_MINUTE = 60 * MILLISECONDS_PER_SECOND;
const MILLISECONDS_PER_HOUR = 60 * MILLISECONDS_PER_MINUTE;

export function createAgentTerminalFormatters(input: {
  readonly locale: SupportedLocale;
  readonly timeZone: string;
}): AgentTerminalFormatters {
  if (input.timeZone.length === 0) {
    throw new Error('Terminal formatter timeZone must not be empty.');
  }

  const integer = new Intl.NumberFormat(input.locale, { maximumFractionDigits: 0 });
  const decimal = new Intl.NumberFormat(input.locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
  const dateTime = new Intl.DateTimeFormat(input.locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZone: input.timeZone,
  });

  return Object.freeze({
    count(value: number): string {
      assertFiniteNonNegative(value, 'count');
      return integer.format(value);
    },
    dateTime(value: Date | number): string {
      const epochMilliseconds = value instanceof Date ? value.getTime() : value;
      if (!Number.isFinite(epochMilliseconds)) {
        throw new Error(`Terminal dateTime requires a finite instant, received ${String(value)}.`);
      }
      return dateTime.format(epochMilliseconds);
    },
    duration(milliseconds: number): string {
      assertFiniteNonNegative(milliseconds, 'duration');
      const rounded = Math.round(milliseconds);
      const hours = Math.floor(rounded / MILLISECONDS_PER_HOUR);
      const minutes = Math.floor((rounded % MILLISECONDS_PER_HOUR) / MILLISECONDS_PER_MINUTE);
      const seconds = Math.floor((rounded % MILLISECONDS_PER_MINUTE) / MILLISECONDS_PER_SECOND);
      const remainder = rounded % MILLISECONDS_PER_SECOND;
      const parts: string[] = [];
      if (hours > 0) parts.push(`${integer.format(hours)}h`);
      if (minutes > 0) parts.push(`${integer.format(minutes)}m`);
      if (seconds > 0) parts.push(`${integer.format(seconds)}s`);
      if (remainder > 0 || parts.length === 0) parts.push(`${integer.format(remainder)}ms`);
      return parts.join(' ');
    },
    bytes(value: number): string {
      assertFiniteNonNegative(value, 'bytes');
      let unitIndex = 0;
      let scaled = value;
      while (scaled >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
        scaled /= 1024;
        unitIndex += 1;
      }
      const unit = BYTE_UNITS[unitIndex];
      if (!unit) {
        throw new Error(`Missing byte unit at index ${unitIndex}.`);
      }
      return `${unitIndex === 0 ? integer.format(Math.round(scaled)) : decimal.format(scaled)} ${unit}`;
    },
  });
}

function assertFiniteNonNegative(value: number, formatter: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `Terminal ${formatter} requires a finite non-negative number, received ${String(value)}.`,
    );
  }
}
