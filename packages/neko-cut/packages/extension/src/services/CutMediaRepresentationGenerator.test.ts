import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EngineClient } from '@neko/neko-client';
import {
  CutMediaRepresentationGenerator,
  createCutRepresentationSource,
} from './CutMediaRepresentationGenerator';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('CutMediaRepresentationGenerator', () => {
  it('serializes waveform Engine output as storage-neutral bytes', async () => {
    const root = await createSource();
    const waveform = vi.fn(async () => ({
      peaks: [0.1, 0.2],
      channelPeaks: [[0.1, 0.2]],
      sampleRate: 48_000,
      channels: 1,
      duration: 2,
      peaksPerSecond: 1,
    }));
    const generator = new CutMediaRepresentationGenerator(root, {
      waveform,
    } as unknown as EngineClient);

    const result = await generator.generate({
      source: await createCutRepresentationSource(root, path.join(root, 'audio.wav')),
      spec: { kind: 'waveform' },
    });

    expect(waveform).toHaveBeenCalledWith(path.join(root, 'audio.wav'));
    expect(JSON.parse(new TextDecoder().decode(result.bytes))).toMatchObject({
      sampleRate: 48_000,
      channelPeaks: [[0.1, 0.2]],
    });
    expect(result).not.toHaveProperty('path');
  });
});

async function createSource(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-cut-representation-test-'));
  roots.push(root);
  await fs.writeFile(path.join(root, 'audio.wav'), new Uint8Array([1]));
  return root;
}
