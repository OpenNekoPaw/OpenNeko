import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import type { ContentReadService } from '@neko/shared';
import { createSharpGeneratedImageRepresentationGenerator } from '../visionImageProcessor';

describe('Sharp generated image variants', () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map((directory) => fs.rm(directory, { recursive: true, force: true })),
    );
  });

  it('creates a bounded WebP thumbnail instead of returning source bytes', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-generated-thumbnail-'));
    temporaryDirectories.push(directory);
    const sourcePath = path.join(directory, 'source.png');
    const sourceBytes = await sharp({
      create: { width: 100, height: 50, channels: 4, background: '#ff0000' },
    })
      .png()
      .toBuffer();
    await fs.writeFile(sourcePath, sourceBytes);

    const contentRead: ContentReadService = {
      stat: async () => {
        throw new Error('stat was not expected');
      },
      read: async (locator) => ({
        status: 'ready',
        locator,
        bytes: sourceBytes,
        offset: 0,
        totalByteLength: sourceBytes.byteLength,
        fingerprint: { strategy: 'sha256', value: 'source-v1' },
      }),
    };
    const result = await createSharpGeneratedImageRepresentationGenerator(contentRead).generate({
      source: { kind: 'workspace-file', path: 'source.png' },
      spec: { kind: 'thumbnail', maxWidth: 20, maxHeight: 20, format: 'webp' },
    });

    expect(result).toMatchObject({
      metadata: { mimeType: 'image/webp', width: 20, height: 10 },
    });
    expect(result.bytes).not.toEqual(sourceBytes);
    await expect(sharp(result.bytes).metadata()).resolves.toMatchObject({
      format: 'webp',
      width: 20,
      height: 10,
    });
  });
});
