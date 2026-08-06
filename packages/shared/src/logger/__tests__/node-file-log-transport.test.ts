import { mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConsoleLogger } from '../console-logger';
import { ManagedFileLogTransport, serializeManagedLogEntry } from '../node-file-log-transport';
import { LogLevel } from '../types';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('ManagedFileLogTransport', () => {
  it('writes redacted structured entries without secrets, prompts, or local paths', () => {
    const serialized = serializeManagedLogEntry({
      level: LogLevel.Error,
      timestamp: Date.parse('2026-08-06T00:00:00.000Z'),
      source: 'Agent:Provider',
      message: 'Request failed at /Users/private/project/file.ts with Bearer live-token',
      data: {
        apiKey: 'sk-secret-value',
        prompt: 'private user prompt',
        nested: { outputPath: '/home/user/render/output.png' },
      },
      error: new Error('token=private-token at C:\\Users\\private\\file.ts'),
    });

    expect(JSON.parse(serialized)).toMatchObject({
      timestamp: '2026-08-06T00:00:00.000Z',
      level: 'error',
      source: 'Agent:Provider',
      data: {
        apiKey: '<redacted>',
        prompt: '<redacted>',
        nested: { outputPath: '<local-path>' },
      },
    });
    expect(serialized).not.toContain('live-token');
    expect(serialized).not.toContain('private user prompt');
    expect(serialized).not.toContain('/Users/private');
    expect(serialized).not.toContain('C:\\Users\\private');
  });

  it('rotates by byte size, removes expired files, and clears only after confirmation', () => {
    const root = createRoot();
    const filePath = join(root, 'desktop.ndjson');
    writeFileSync(`${filePath}.1`, 'expired\n');
    utimesSync(`${filePath}.1`, new Date(0), new Date(0));
    const transport = new ManagedFileLogTransport({
      filePath,
      maxBytes: 180,
      maxFiles: 3,
      retentionMs: 1_000,
      now: () => 2_000,
    });
    const logger = new ConsoleLogger('Desktop', LogLevel.Info, [transport]);

    expect(readdirSync(root)).toEqual(['desktop.ndjson']);
    for (let index = 0; index < 8; index += 1) {
      logger.info(`entry-${index}-${'x'.repeat(80)}`);
    }
    const files = readdirSync(root).sort();
    expect(files).toContain('desktop.ndjson');
    expect(files.length).toBeLessThanOrEqual(3);
    expect(files.some((file) => file === 'desktop.ndjson.1')).toBe(true);
    expect(() => transport.clear(false)).toThrow('explicit confirmation');

    transport.clear(true);

    expect(readdirSync(root)).toEqual(['desktop.ndjson']);
    expect(readFileSync(filePath, 'utf8')).toBe('');
  });

  it('isolates one file owner failure without disabling another owner', () => {
    const firstRoot = createRoot();
    const secondRoot = createRoot();
    const onFailure = vi.fn();
    const first = new ManagedFileLogTransport({
      filePath: join(firstRoot, 'desktop.ndjson'),
      onFailure,
    });
    const secondPath = join(secondRoot, 'agent.ndjson');
    const second = new ManagedFileLogTransport({ filePath: secondPath });
    rmSync(firstRoot, { recursive: true, force: true });
    writeFileSync(firstRoot, 'not-a-directory');

    expect(() => first.write(entry('desktop'))).not.toThrow();
    second.write(entry('agent'));

    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(readFileSync(secondPath, 'utf8')).toContain('agent');
  });

  it('contains initialization failure to the affected owner', () => {
    const root = createRoot();
    const blockedParent = join(root, 'not-a-directory');
    writeFileSync(blockedParent, 'file');
    const onFailure = vi.fn();

    expect(
      () =>
        new ManagedFileLogTransport({
          filePath: join(blockedParent, 'desktop.ndjson'),
          onFailure,
        }),
    ).not.toThrow();
    expect(onFailure).toHaveBeenCalledTimes(1);
  });
});

function createRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'neko-managed-log-'));
  roots.push(root);
  return root;
}

function entry(message: string) {
  return {
    level: LogLevel.Info,
    timestamp: Date.parse('2026-08-06T00:00:00.000Z'),
    source: 'test',
    message,
  } as const;
}
