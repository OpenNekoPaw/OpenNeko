// =============================================================================
// Audio Tempo Types — shared beat-grid contracts
// =============================================================================

export const DEFAULT_TEMPO_MAP_PPQ = 480;
export const DEFAULT_TEMPO_BPM = 120;
export const DEFAULT_TIME_SIGNATURE_NUMERATOR = 4;
export const DEFAULT_TIME_SIGNATURE_DENOMINATOR = 4;

/** Tempo event position and BPM in PPQ ticks. */
export interface TempoEvent {
  ticks: number;
  bpm: number;
}

/** Time signature event position and meter in PPQ ticks. */
export interface TimeSignatureEvent {
  ticks: number;
  numerator: number;
  denominator: number;
}

/** Serialized musical time map for retained timeline and audio processing state. */
export interface TempoMap {
  ppq: number;
  tempoEvents: TempoEvent[];
  timeSignatureEvents: TimeSignatureEvent[];
}

/** 1-based bar/beat plus 0-based residual tick inside the active beat. */
export interface BarBeatPosition {
  bar: number;
  beat: number;
  tick: number;
}

export function createDefaultTempoMap(
  bpm = DEFAULT_TEMPO_BPM,
  ppq = DEFAULT_TEMPO_MAP_PPQ,
): TempoMap {
  return {
    ppq,
    tempoEvents: [{ ticks: 0, bpm }],
    timeSignatureEvents: [
      {
        ticks: 0,
        numerator: DEFAULT_TIME_SIGNATURE_NUMERATOR,
        denominator: DEFAULT_TIME_SIGNATURE_DENOMINATOR,
      },
    ],
  };
}

export function getTempoMapBpm(
  tempoMap: TempoMap | undefined,
  fallbackBpm = DEFAULT_TEMPO_BPM,
): number {
  const firstEvent = tempoMap?.tempoEvents[0];
  return firstEvent ? firstEvent.bpm : fallbackBpm;
}

export function ticksPerBeat(ppq: number, denominator: number): number {
  assertPositiveFiniteNumber(ppq, 'ppq');
  assertPositiveFiniteNumber(denominator, 'denominator');
  return (ppq * 4) / denominator;
}

export function ticksPerBar(
  ppq: number,
  timeSignature: Pick<TimeSignatureEvent, 'numerator' | 'denominator'>,
): number {
  assertPositiveFiniteNumber(timeSignature.numerator, 'numerator');
  return ticksPerBeat(ppq, timeSignature.denominator) * timeSignature.numerator;
}

export function ticksToSeconds(ticks: number, tempoMap: TempoMap): number {
  assertNonNegativeFiniteNumber(ticks, 'ticks');
  const ppq = getValidPpq(tempoMap);
  const events = getSortedTempoEvents(tempoMap);

  let previousEvent = firstTempoEvent(events);
  let previousTick = previousEvent.ticks;
  let seconds = 0;

  for (let index = 1; index < events.length; index += 1) {
    const event = events[index];
    if (!event || event.ticks >= ticks) {
      break;
    }

    seconds += ticksDeltaToSeconds(event.ticks - previousTick, previousEvent.bpm, ppq);
    previousEvent = event;
    previousTick = event.ticks;
  }

  seconds += ticksDeltaToSeconds(ticks - previousTick, previousEvent.bpm, ppq);
  return seconds;
}

export function secondsToTicks(seconds: number, tempoMap: TempoMap): number {
  assertNonNegativeFiniteNumber(seconds, 'seconds');
  const ppq = getValidPpq(tempoMap);
  const events = getSortedTempoEvents(tempoMap);

  let previousEvent = firstTempoEvent(events);
  let previousTick = previousEvent.ticks;
  let remainingSeconds = seconds;

  for (let index = 1; index < events.length; index += 1) {
    const event = events[index];
    if (!event) {
      break;
    }

    const segmentTicks = event.ticks - previousTick;
    const segmentSeconds = ticksDeltaToSeconds(segmentTicks, previousEvent.bpm, ppq);
    if (remainingSeconds < segmentSeconds) {
      return Math.round(
        previousTick + secondsDeltaToTicks(remainingSeconds, previousEvent.bpm, ppq),
      );
    }

    remainingSeconds -= segmentSeconds;
    previousEvent = event;
    previousTick = event.ticks;
  }

  return Math.round(previousTick + secondsDeltaToTicks(remainingSeconds, previousEvent.bpm, ppq));
}

export function ticksToBarBeat(ticks: number, tempoMap: TempoMap): BarBeatPosition {
  assertNonNegativeFiniteNumber(ticks, 'ticks');
  const ppq = getValidPpq(tempoMap);
  const events = getSortedTimeSignatureEvents(tempoMap);

  let currentSignature = firstTimeSignatureEvent(events);
  let currentTick = currentSignature.ticks;
  let currentBar = 1;

  for (let index = 1; index < events.length; index += 1) {
    const event = events[index];
    if (!event || event.ticks > ticks) {
      break;
    }

    const barLength = ticksPerBar(ppq, currentSignature);
    currentBar += Math.floor((event.ticks - currentTick) / barLength);
    currentSignature = event;
    currentTick = event.ticks;
  }

  const localTicks = ticks - currentTick;
  const beatLength = ticksPerBeat(ppq, currentSignature.denominator);
  const barLength = beatLength * currentSignature.numerator;
  const barsFromSegmentStart = Math.floor(localTicks / barLength);
  const ticksWithinBar = localTicks - barsFromSegmentStart * barLength;
  const beatsFromBarStart = Math.floor(ticksWithinBar / beatLength);
  const residualTick = Math.round(ticksWithinBar - beatsFromBarStart * beatLength);

  return {
    bar: currentBar + barsFromSegmentStart,
    beat: beatsFromBarStart + 1,
    tick: residualTick,
  };
}

export function barBeatToTicks(position: BarBeatPosition, tempoMap: TempoMap): number {
  assertPositiveInteger(position.bar, 'bar');
  assertPositiveInteger(position.beat, 'beat');
  assertNonNegativeFiniteNumber(position.tick, 'tick');

  const ppq = getValidPpq(tempoMap);
  const events = getSortedTimeSignatureEvents(tempoMap);
  const requestedBar = position.bar;

  let currentSignature = firstTimeSignatureEvent(events);
  let currentTick = currentSignature.ticks;
  let currentBar = 1;

  for (let index = 1; index < events.length; index += 1) {
    const event = events[index];
    if (!event) {
      break;
    }

    const barLength = ticksPerBar(ppq, currentSignature);
    const barsInSegment = Math.floor((event.ticks - currentTick) / barLength);
    const nextBar = currentBar + barsInSegment;
    if (requestedBar < nextBar) {
      break;
    }

    currentSignature = event;
    currentTick = event.ticks;
    currentBar = nextBar;
  }

  if (position.beat > currentSignature.numerator) {
    throw new RangeError(
      `beat must be within the active time signature numerator (${currentSignature.numerator})`,
    );
  }

  const beatLength = ticksPerBeat(ppq, currentSignature.denominator);
  if (position.tick >= beatLength) {
    throw new RangeError(`tick must be less than the active beat length (${beatLength})`);
  }

  const barsOffset = requestedBar - currentBar;
  return Math.round(
    currentTick +
      barsOffset * beatLength * currentSignature.numerator +
      (position.beat - 1) * beatLength +
      position.tick,
  );
}

function ticksDeltaToSeconds(ticks: number, bpm: number, ppq: number): number {
  return (ticks * 60) / (bpm * ppq);
}

function secondsDeltaToTicks(seconds: number, bpm: number, ppq: number): number {
  return (seconds * bpm * ppq) / 60;
}

function getValidPpq(tempoMap: TempoMap): number {
  assertPositiveFiniteNumber(tempoMap.ppq, 'ppq');
  return tempoMap.ppq;
}

function getSortedTempoEvents(tempoMap: TempoMap): TempoEvent[] {
  const events = tempoMap.tempoEvents
    .map((event) => {
      assertNonNegativeFiniteNumber(event.ticks, 'tempo event ticks');
      assertPositiveFiniteNumber(event.bpm, 'tempo event bpm');
      return event;
    })
    .sort((left, right) => left.ticks - right.ticks);

  const firstEvent = events[0];
  if (!firstEvent || firstEvent.ticks !== 0) {
    throw new RangeError('tempoMap must include a tempo event at tick 0');
  }

  return events;
}

function firstTempoEvent(events: TempoEvent[]): TempoEvent {
  const firstEvent = events[0];
  if (!firstEvent) {
    throw new RangeError('tempoMap must include a tempo event at tick 0');
  }
  return firstEvent;
}

function getSortedTimeSignatureEvents(tempoMap: TempoMap): TimeSignatureEvent[] {
  const events = tempoMap.timeSignatureEvents
    .map((event) => {
      assertNonNegativeFiniteNumber(event.ticks, 'time signature event ticks');
      assertPositiveInteger(event.numerator, 'time signature numerator');
      assertPositiveInteger(event.denominator, 'time signature denominator');
      return event;
    })
    .sort((left, right) => left.ticks - right.ticks);

  const firstEvent = events[0];
  if (!firstEvent || firstEvent.ticks !== 0) {
    throw new RangeError('tempoMap must include a time signature event at tick 0');
  }

  return events;
}

function firstTimeSignatureEvent(events: TimeSignatureEvent[]): TimeSignatureEvent {
  const firstEvent = events[0];
  if (!firstEvent) {
    throw new RangeError('tempoMap must include a time signature event at tick 0');
  }
  return firstEvent;
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
}

function assertPositiveFiniteNumber(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number`);
  }
}

function assertNonNegativeFiniteNumber(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number`);
  }
}
