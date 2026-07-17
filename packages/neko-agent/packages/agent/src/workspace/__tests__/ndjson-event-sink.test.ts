import { beforeEach, describe, expect, it } from 'vitest';
import { AGENT_RUNTIME_CHANNELS, createEventBus } from '../../events';
import { createNdjsonEventSink, type NdjsonFsOps } from '../ndjson-event-sink';

function memFs(): NdjsonFsOps & {
  files: Map<string, string>;
  dirs: string[];
  failNextAppend?: boolean;
} {
  const files = new Map<string, string>();
  const dirs: string[] = [];
  const fs = {
    files,
    dirs,
    failNextAppend: false as boolean | undefined,
    async mkdir(path: string): Promise<void> {
      dirs.push(path);
    },
    async appendFile(path: string, data: string): Promise<void> {
      if (fs.failNextAppend) {
        fs.failNextAppend = false;
        throw new Error('simulated write failure');
      }
      files.set(path, (files.get(path) ?? '') + data);
    },
  };
  return fs;
}

function parseLines(blob: string): Array<Record<string, unknown>> {
  return blob
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('NdjsonEventSink', () => {
  let now = 0;
  beforeEach(() => {
    now = 100;
  });

  it('writes ordinary Agent events with monotonic sequence and conversation partition', async () => {
    const fs = memFs();
    const path = '/r/.neko/logs/events.jsonl';
    const sink = createNdjsonEventSink({
      filePath: path,
      fsOps: fs,
      writerId: 'writer-events',
      now: () => now++,
      mapEvent: (event) => ({ ...event, conversationId: 'conv-1' }),
    });
    const bus = createEventBus();
    sink.attach(bus);
    bus.emit({
      channel: AGENT_RUNTIME_CHANNELS.APPROVAL_DECIDED,
      subject: 'tool:Write',
      decision: 'accept',
      at: 1,
    });
    bus.emit({
      channel: AGENT_RUNTIME_CHANNELS.STEP_COMPLETED,
      round: 0,
      thinkOnly: false,
      at: 2,
    });
    await sink.flush();

    const lines = parseLines(fs.files.get(path) ?? '');
    expect(lines.map((line) => line.seq)).toEqual([1, 2]);
    expect(lines.map((line) => line.partitionSeq)).toEqual([1, 2]);
    expect(lines.map((line) => line.partition)).toEqual([
      { conversationId: 'conv-1' },
      { conversationId: 'conv-1' },
    ]);
    expect(fs.dirs).toEqual(['/r/.neko/logs']);
  });

  it('filters channels, survives one write failure, and detaches on dispose', async () => {
    const fs = memFs();
    const path = '/r/.neko/logs/audits.jsonl';
    const sink = createNdjsonEventSink({
      filePath: path,
      fsOps: fs,
      filter: (event) => event.channel === AGENT_RUNTIME_CHANNELS.APPROVAL_DECIDED,
    });
    const bus = createEventBus();
    sink.attach(bus);
    fs.failNextAppend = true;
    bus.emit({
      channel: AGENT_RUNTIME_CHANNELS.APPROVAL_DECIDED,
      subject: 'tool:A',
      decision: 'accept',
      at: 1,
    });
    bus.emit({
      channel: AGENT_RUNTIME_CHANNELS.APPROVAL_DECIDED,
      subject: 'tool:B',
      decision: 'reject',
      at: 2,
    });
    bus.emit({
      channel: AGENT_RUNTIME_CHANNELS.STEP_COMPLETED,
      round: 0,
      thinkOnly: false,
      at: 3,
    });
    await sink.dispose();
    const before = fs.files.get(path);
    bus.emit({
      channel: AGENT_RUNTIME_CHANNELS.APPROVAL_DECIDED,
      subject: 'tool:C',
      decision: 'accept',
      at: 4,
    });
    await sink.flush();

    expect(parseLines(fs.files.get(path) ?? '')).toHaveLength(1);
    expect(fs.files.get(path)).toBe(before);
  });

  it('rejects an empty path', () => {
    expect(() => createNdjsonEventSink({ filePath: '', fsOps: memFs() })).toThrow(/filePath/);
  });
});
