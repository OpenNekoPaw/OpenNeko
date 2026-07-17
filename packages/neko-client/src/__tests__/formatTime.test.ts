import { describe, it, expect } from 'vitest';
import {
  formatMediaTime,
  formatMediaTimeCentiseconds,
  formatMediaTimeFromMilliseconds,
  formatTime,
  formatTimePrecise,
} from '../formatTime';

describe('formatTime', () => {
  it('should format 0 seconds as "0:00"', () => {
    expect(formatTime(0)).toBe('0:00');
  });

  it('should format seconds less than a minute', () => {
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(30)).toBe('0:30');
    expect(formatTime(59)).toBe('0:59');
  });

  it('should format exactly 1 minute', () => {
    expect(formatTime(60)).toBe('1:00');
  });

  it('should pad seconds with leading zero', () => {
    expect(formatTime(61)).toBe('1:01');
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(123)).toBe('2:03');
  });

  it('should format with hours when >= 3600', () => {
    expect(formatTime(3600)).toBe('1:00:00');
    expect(formatTime(3661)).toBe('1:01:01');
    expect(formatTime(7200)).toBe('2:00:00');
    expect(formatTime(3723)).toBe('1:02:03');
  });

  it('should handle negative numbers as "0:00"', () => {
    expect(formatTime(-1)).toBe('0:00');
    expect(formatTime(-100)).toBe('0:00');
  });

  it('should handle NaN as "0:00"', () => {
    expect(formatTime(NaN)).toBe('0:00');
  });

  it('should handle Infinity as "0:00"', () => {
    expect(formatTime(Infinity)).toBe('0:00');
    expect(formatTime(-Infinity)).toBe('0:00');
  });
});

describe('formatTimePrecise', () => {
  it('should format with milliseconds', () => {
    expect(formatTimePrecise(65.123)).toBe('1:05.123');
  });

  it('should format zero as "0:00.000"', () => {
    expect(formatTimePrecise(0)).toBe('0:00.000');
  });

  it('should handle fractional seconds correctly', () => {
    expect(formatTimePrecise(1.5)).toBe('0:01.500');
    expect(formatTimePrecise(0.001)).toBe('0:00.001');
    expect(formatTimePrecise(59.999)).toBe('0:59.999');
    // Note: 90.05 % 1 = 0.04999... due to IEEE 754 float, so Math.floor gives 49
    expect(formatTimePrecise(90.05)).toBe('1:30.049');
  });

  it('should handle negative/NaN/Infinity', () => {
    expect(formatTimePrecise(-1)).toBe('0:00.000');
    expect(formatTimePrecise(NaN)).toBe('0:00.000');
    expect(formatTimePrecise(Infinity)).toBe('0:00.000');
    expect(formatTimePrecise(-Infinity)).toBe('0:00.000');
  });
});

describe('formatMediaTime', () => {
  it('formats generic media labels without fractional seconds by default', () => {
    expect(formatMediaTime(65.9)).toBe('1:05');
    expect(formatMediaTime(3601)).toBe('1:00:01');
  });

  it('formats centisecond media labels used by compact transport controls', () => {
    expect(formatMediaTimeCentiseconds(65.987)).toBe('1:05.98');
    expect(formatMediaTimeCentiseconds(65.987, { padMinutes: true })).toBe('01:05.98');
  });

  it('formats one-digit fractional media labels', () => {
    expect(formatMediaTime(125.49, { fractionalDigits: 1 })).toBe('2:05.4');
  });

  it('formats always-hour labels for timeline displays', () => {
    expect(formatMediaTime(65.123, { alwaysHours: true, fractionalDigits: 3 })).toBe(
      '00:01:05.123',
    );
  });

  it('formats compact timeline labels that roll hours into minutes', () => {
    expect(formatMediaTime(3600, { padMinutes: true, rollHoursIntoMinutes: true })).toBe('60:00');
  });

  it('formats millisecond inputs for elapsed runtime labels', () => {
    expect(formatMediaTimeFromMilliseconds(65_432)).toBe('1:05');
    expect(formatMediaTimeFromMilliseconds(65_432, { fractionalDigits: 1 })).toBe('1:05.4');
  });

  it('uses zero labels matching the selected generic variant', () => {
    expect(formatMediaTime(Number.NaN, { fractionalDigits: 2 })).toBe('0:00.00');
    expect(formatMediaTime(-1, { padMinutes: true })).toBe('00:00');
    expect(formatMediaTime(Infinity, { alwaysHours: true, fractionalDigits: 3 })).toBe(
      '00:00:00.000',
    );
  });
});
