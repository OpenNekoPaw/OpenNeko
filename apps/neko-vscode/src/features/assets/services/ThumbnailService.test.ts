import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContentRepresentationService } from '@neko/shared';
import { ThumbnailService } from './ThumbnailService';

vi.mock('vscode', () => ({
  Uri: { parse: (value: string) => ({ toString: () => value }) },
  EventEmitter: class<T> {
    readonly event = vi.fn(() => ({ dispose: vi.fn() }));
    fire(_value: T) {}
    dispose() {}
  },
}));

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('ThumbnailService representation path', () => {
  it('requests and reads semantic thumbnail bytes without exposing a cache path', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-assets-thumbnail-test-'));
    roots.push(root);
    const sourcePath = path.join(root, 'media', 'shot.mp4');
    await fs.mkdir(path.dirname(sourcePath), { recursive: true });
    await fs.writeFile(sourcePath, new Uint8Array([1, 2, 3]));
    const locator = {
      kind: 'content-representation' as const,
      id: 'thumbnail-1',
      representationKind: 'thumbnail' as const,
      source: { kind: 'workspace-file' as const, path: 'media/shot.mp4' },
      spec: { kind: 'thumbnail' as const },
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
        bytes: new Uint8Array([4, 5, 6]),
        offset: 0,
        totalByteLength: 3,
        metadata: { width: 120, height: 80, mimeType: 'image/jpeg' },
      })),
    } satisfies ContentRepresentationService;

    const result = await new ThumbnailService(root, representations).generate(sourcePath, {
      maxWidth: 120,
      maxHeight: 80,
    });

    expect(representations.getRepresentation).toHaveBeenCalledWith({
      source: expect.objectContaining({ kind: 'workspace-file', path: 'media/shot.mp4' }),
      spec: { kind: 'thumbnail', maxWidth: 120, maxHeight: 80, format: 'jpeg' },
    });
    expect(representations.readRepresentation).toHaveBeenCalledWith(locator, {
      maxBytes: 16 * 1024 * 1024,
    });
    expect(result).toMatchObject({ width: 120, height: 80, mimeType: 'image/jpeg' });
    expect(result?.uri.toString()).toBe('data:image/jpeg;base64,BAUG');
    expect(result).not.toHaveProperty('path');
  });
});
