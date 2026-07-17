import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  projectRawJsonlEvidenceAggregates,
  type RawJsonlEvidenceAggregate,
} from '../node-raw-jsonl-evidence-aggregate';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('Raw JSONL evidence aggregate projection', () => {
  it('rebuilds optional aggregates from independent Journal and log files without creating SQLite', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-raw-evidence-'));
    temporaryDirectories.push(homedir);
    const journalsRoot = join(homedir, '.neko', 'journals');
    const logsRoot = join(homedir, 'workspace', '.neko', 'logs');
    await mkdir(journalsRoot, { recursive: true });
    await mkdir(logsRoot, { recursive: true });
    const journalPath = join(journalsRoot, 'conversation-1.jsonl');
    const logPath = join(logsRoot, 'conversations', 'conversation-1', 'events.jsonl');
    await mkdir(join(logPath, '..'), { recursive: true });
    await writeFile(
      journalPath,
      [
        JSON.stringify({ seq: 1, ts: 100, type: 'event', event: { type: 'user_message' } }),
        JSON.stringify({ seq: 2, ts: 200, type: 'conversation_metadata' }),
        '',
      ].join('\n'),
      'utf8',
    );
    await writeFile(
      logPath,
      [
        JSON.stringify({ seq: 1, ts: 300, event: { type: 'tool.completed' } }),
        '{truncated',
        '',
      ].join('\n'),
      'utf8',
    );
    let projected: readonly RawJsonlEvidenceAggregate[] = [];
    const sink = {
      replace: async (aggregates: readonly RawJsonlEvidenceAggregate[]) => {
        projected = aggregates;
      },
    };

    const first = await projectRawJsonlEvidenceAggregates({
      sources: [
        { kind: 'journal', root: journalsRoot },
        { kind: 'log', root: logsRoot },
      ],
      sink,
    });

    expect(first).toEqual([
      expect.objectContaining({
        kind: 'journal',
        fileCount: 1,
        entryCount: 2,
        malformedLineCount: 0,
        firstTimestamp: 100,
        lastTimestamp: 200,
        categories: { 'event:user_message': 1, conversation_metadata: 1 },
      }),
      expect.objectContaining({
        kind: 'log',
        fileCount: 1,
        entryCount: 1,
        malformedLineCount: 1,
        firstTimestamp: 300,
        lastTimestamp: 300,
        categories: { 'event:tool.completed': 1 },
      }),
    ]);
    expect(projected).toEqual(first);
    await expect(access(journalPath)).resolves.toBeUndefined();
    await expect(access(logPath)).resolves.toBeUndefined();
    await expect(access(join(homedir, '.neko', 'neko.db'))).rejects.toMatchObject({
      code: 'ENOENT',
    });

    projected = [];
    const rebuilt = await projectRawJsonlEvidenceAggregates({
      sources: [
        { kind: 'journal', root: journalsRoot },
        { kind: 'log', root: logsRoot },
      ],
      sink,
    });
    expect(rebuilt).toEqual(first);
    expect(projected).toEqual(first);
  });
});
