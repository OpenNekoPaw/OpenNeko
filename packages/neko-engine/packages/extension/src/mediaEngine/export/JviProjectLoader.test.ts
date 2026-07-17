import { mkdtemp, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { JviProjectLoader } from './JviProjectLoader';

describe('JviProjectLoader', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it('keeps export aliases aligned with the loader implementation', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'neko-engine-jvi-'));
    tempDirs.push(dir);

    const projectPath = path.join(dir, 'demo.jvi');
    await writeFile(
      projectPath,
      JSON.stringify({
        version: '1.0',
        name: 'Demo',
        resolution: { width: 1920, height: 1080 },
        fps: 30,
        tracks: [
          {
            id: 'track-1',
            name: 'Video',
            type: 'media',
            muted: false,
            elements: [
              {
                id: 'clip-1',
                type: 'media',
                src: 'shot.png',
                startTime: 1,
                duration: 3,
              },
            ],
          },
        ],
      }),
      'utf8',
    );

    const loader = new JviProjectLoader(projectPath);
    await loader.load();

    const layers = loader.toLayers();

    expect(layers).toHaveLength(1);
    expect(layers[0]?.source).toBe(path.join(dir, 'shot.png'));
    expect(layers[0]?.type).toBe('image');
    expect(loader.calculateDuration()).toBe(4);
  });
});
