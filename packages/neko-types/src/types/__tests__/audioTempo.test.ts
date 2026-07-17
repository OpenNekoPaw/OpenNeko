import { describe, expect, it } from 'vitest';
import {
  barBeatToTicks,
  createDefaultTempoMap,
  DEFAULT_TEMPO_MAP_PPQ,
  secondsToTicks,
  ticksToBarBeat,
  ticksToSeconds,
  type TempoMap,
} from '../audioTempo';

describe('audioTempo', () => {
  it('converts 4/4 ticks and seconds at 120 BPM', () => {
    const tempoMap = createDefaultTempoMap(120);

    expect(DEFAULT_TEMPO_MAP_PPQ).toBe(480);
    expect(ticksToSeconds(480, tempoMap)).toBeCloseTo(0.5);
    expect(ticksToSeconds(960, tempoMap)).toBeCloseTo(1);
    expect(secondsToTicks(1, tempoMap)).toBe(960);
    expect(barBeatToTicks({ bar: 2, beat: 1, tick: 0 }, tempoMap)).toBe(1920);
    expect(ticksToBarBeat(1920, tempoMap)).toEqual({ bar: 2, beat: 1, tick: 0 });
  });

  it('uses eighth-note beat residuals for 6/8', () => {
    const tempoMap: TempoMap = {
      ppq: 480,
      tempoEvents: [{ ticks: 0, bpm: 120 }],
      timeSignatureEvents: [{ ticks: 0, numerator: 6, denominator: 8 }],
    };

    expect(ticksToBarBeat(239, tempoMap)).toEqual({ bar: 1, beat: 1, tick: 239 });
    expect(ticksToBarBeat(240, tempoMap)).toEqual({ bar: 1, beat: 2, tick: 0 });
    expect(barBeatToTicks({ bar: 1, beat: 6, tick: 239 }, tempoMap)).toBe(1439);
    expect(ticksToBarBeat(1440, tempoMap)).toEqual({ bar: 2, beat: 1, tick: 0 });
  });

  it('uses half-note beats for 3/2', () => {
    const tempoMap: TempoMap = {
      ppq: 480,
      tempoEvents: [{ ticks: 0, bpm: 120 }],
      timeSignatureEvents: [{ ticks: 0, numerator: 3, denominator: 2 }],
    };

    expect(ticksToBarBeat(959, tempoMap)).toEqual({ bar: 1, beat: 1, tick: 959 });
    expect(ticksToBarBeat(960, tempoMap)).toEqual({ bar: 1, beat: 2, tick: 0 });
    expect(barBeatToTicks({ bar: 2, beat: 1, tick: 0 }, tempoMap)).toBe(2880);
  });

  it('integrates tempo changes in tick-to-second conversion', () => {
    const tempoMap: TempoMap = {
      ppq: 480,
      tempoEvents: [
        { ticks: 0, bpm: 120 },
        { ticks: 960, bpm: 60 },
      ],
      timeSignatureEvents: [{ ticks: 0, numerator: 4, denominator: 4 }],
    };

    expect(ticksToSeconds(960, tempoMap)).toBeCloseTo(1);
    expect(ticksToSeconds(1440, tempoMap)).toBeCloseTo(2);
    expect(secondsToTicks(2, tempoMap)).toBe(1440);
  });

  it('rounds seconds to the nearest tick', () => {
    const tempoMap = createDefaultTempoMap(120);
    const halfTickSeconds = ticksToSeconds(0.5, tempoMap);

    expect(secondsToTicks(halfTickSeconds * 0.9, tempoMap)).toBe(0);
    expect(secondsToTicks(halfTickSeconds * 1.1, tempoMap)).toBe(1);
  });
});
