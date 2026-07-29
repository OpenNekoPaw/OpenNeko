import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadMediaOutputs } from '../media-file-downloader';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe('downloadMediaOutputs', () => {
  it('atomically copies local outputs and reuses the same terminal file on replay', async () => {
    const root = await createTemporaryDirectory();
    const sourcePath = path.join(root, 'provider.png');
    const outputDir = path.join(root, 'neko', 'generated', 'image');
    await fs.writeFile(sourcePath, 'first revision');

    const first = await downloadMediaOutputs(
      'task-1',
      'text-to-image',
      [{ url: sourcePath, type: 'image' }],
      outputDir,
    );
    await fs.writeFile(sourcePath, 'changed provider source');
    const replay = await downloadMediaOutputs(
      'task-1',
      'text-to-image',
      [{ url: sourcePath, type: 'image' }],
      outputDir,
    );

    expect(replay).toEqual(first);
    expect(await fs.readFile(first[0]!, 'utf8')).toBe('first revision');
    expect(await fs.readdir(outputDir)).toEqual(['task-1_0.png']);
  });

  it('leaves no partial file when remote materialization fails', async () => {
    const root = await createTemporaryDirectory();
    const outputDir = path.join(root, 'neko', 'generated', 'image');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    await expect(
      downloadMediaOutputs(
        'task-1',
        'text-to-image',
        [{ url: 'https://provider.test/output.png', type: 'image' }],
        outputDir,
      ),
    ).rejects.toThrow('HTTP 503');
    expect(await fs.readdir(outputDir)).toEqual([]);
  });

  it('commits only the compatible terminal file after transcoding', async () => {
    const root = await createTemporaryDirectory();
    const sourcePath = path.join(root, 'provider.opus');
    const outputDir = path.join(root, 'neko', 'generated', 'audio');
    await fs.writeFile(sourcePath, 'opus bytes');

    const result = await downloadMediaOutputs(
      'task-1',
      'text-to-audio',
      [{ url: sourcePath, type: 'audio' }],
      outputDir,
      {
        transcodeFile: async (_input, output) => {
          await fs.writeFile(output, 'mp3 bytes');
          return true;
        },
      },
    );

    expect(result).toEqual([path.join(outputDir, 'task-1_0.mp3')]);
    expect(await fs.readdir(outputDir)).toEqual(['task-1_0.mp3']);
  });
});

async function createTemporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-generated-output-'));
  temporaryDirectories.push(directory);
  return directory;
}
