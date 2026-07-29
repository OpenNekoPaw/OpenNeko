import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContentRepresentationService } from '@neko/shared';
import type { PreviewService } from './PreviewService';
import {
  PreviewWaveformGenerator,
  PreviewWaveformRepresentationReader,
} from './PreviewWaveformRepresentation';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('Preview waveform representation path', () => {
  it('keeps Engine waveform generation behind generator bytes', async () => {
    const root = await createSource();
    const getWaveform = vi.fn(async () => ({ peaks: [0.2], duration: 1, sampleRate: 44_100 }));
    const result = await new PreviewWaveformGenerator(root, {
      getWaveform,
    } as unknown as PreviewService).generate({
      source: { kind: 'workspace-file', path: 'audio.mp3' },
      spec: { kind: 'waveform' },
    });

    expect(getWaveform).toHaveBeenCalledWith(path.join(root, 'audio.mp3'));
    expect(JSON.parse(new TextDecoder().decode(result.bytes))).toEqual({
      peaks: [0.2],
      duration: 1,
      sampleRate: 44_100,
    });
    expect(result).not.toHaveProperty('path');
  });

  it('requests and bounded-reads waveform representations', async () => {
    const root = await createSource();
    const locator = {
      kind: 'content-representation' as const,
      id: 'waveform-1',
      representationKind: 'waveform' as const,
      source: { kind: 'workspace-file' as const, path: 'audio.mp3' },
      spec: { kind: 'waveform' as const },
      generatorId: 'test',
      sourceFingerprint: 'source',
      specFingerprint: 'spec',
      revision: '1',
    };
    const representations = {
      getRepresentation: vi.fn(async () => ({ status: 'ready' as const, locator, metadata: {} })),
      readRepresentation: vi.fn(async () => ({
        status: 'ready' as const,
        locator,
        bytes: new TextEncoder().encode(
          JSON.stringify({ peaks: [0.5], duration: 2, sampleRate: 48_000 }),
        ),
        offset: 0,
        totalByteLength: 48,
        metadata: { mimeType: 'application/json' },
      })),
    } satisfies ContentRepresentationService;

    const result = await new PreviewWaveformRepresentationReader(root, representations).getWaveform(
      path.join(root, 'audio.mp3'),
    );

    expect(result).toEqual({ peaks: [0.5], duration: 2, sampleRate: 48_000 });
    expect(representations.readRepresentation).toHaveBeenCalledWith(locator, {
      maxBytes: 64 * 1024 * 1024,
    });
  });
});

async function createSource(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-preview-waveform-test-'));
  roots.push(root);
  await fs.writeFile(path.join(root, 'audio.mp3'), new Uint8Array([1]));
  return root;
}
