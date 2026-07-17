import { describe, expect, it, vi } from 'vitest';
import type { ProjectData, ProjectFileOps } from '@neko/shared';
import { ProjectSessionService } from './ProjectSessionService';

describe('ProjectSessionService', () => {
  it('loads and saves file-backed NKV projects through shared project file store', async () => {
    const fileOps = createMemoryFileOps({
      '/project/edit.nkv': JSON.stringify(createProject('Loaded')),
    });
    const service = new ProjectSessionService(fileOps);

    await service.load('/project/edit.nkv');
    expect(service.getProjectData()?.name).toBe('Loaded');

    await service.updateProjectData(createProject('Saved', 'media/clip.mp4'));

    expect(fileOps.readText('/project/edit.nkv')).toContain('"name": "Saved"');
    expect(fileOps.readText('/project/edit.nkv')).toContain('"src": "media/clip.mp4"');
  });

  it('does not write memory-backed sessions until a file target exists', async () => {
    const fileOps = createMemoryFileOps();
    const service = new ProjectSessionService(fileOps);

    await service.create({ name: 'Memory' });
    await service.updateProjectData(createProject('Changed'));

    expect(fileOps.writeFile).not.toHaveBeenCalled();
    expect(service.getProjectData()?.name).toBe('Changed');
  });

  it('rejects non-portable absolute paths instead of writing broken project data', async () => {
    const fileOps = createMemoryFileOps({
      '/project/edit.nkv': JSON.stringify(createProject('Loaded')),
    });
    const service = new ProjectSessionService(fileOps);
    await service.load('/project/edit.nkv');

    await expect(
      service.updateProjectData(createProject('Broken', '/external/clip.mp4')),
    ).rejects.toThrow('absolute local path that cannot be made portable');

    expect(JSON.parse(fileOps.readText('/project/edit.nkv'))).toMatchObject({ name: 'Loaded' });
  });
});

function createProject(name: string, src?: string): ProjectData {
  return {
    version: '2.0',
    name,
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    tracks: src
      ? [
          {
            id: 'track-1',
            name: 'Main',
            type: 'media',
            muted: false,
            locked: false,
            hidden: false,
            isMain: true,
            elements: [
              {
                id: 'element-1',
                type: 'media',
                name: 'Clip',
                src,
                duration: 1,
                startTime: 0,
                trimStart: 0,
                trimEnd: 0,
                transform: {
                  x: 0,
                  y: 0,
                  scaleX: 1,
                  scaleY: 1,
                  rotation: 0,
                  anchorX: 0,
                  anchorY: 0,
                },
                opacity: 1,
                blendMode: 'normal',
                effects: [],
                muted: false,
                hidden: false,
                locked: false,
              },
            ],
          },
        ]
      : [],
  };
}

function createMemoryFileOps(initial: Record<string, string> = {}): ProjectFileOps & {
  readText(filePath: string): string;
  writeFile: ReturnType<typeof vi.fn>;
} {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const files = new Map(Object.entries(initial));
  const fileOps = {
    readFile: vi.fn(async (filePath: string) => {
      const content = files.get(filePath);
      if (content === undefined) throw new Error(`Missing file: ${filePath}`);
      return encoder.encode(content);
    }),
    writeFile: vi.fn(async (filePath: string, content: Uint8Array) => {
      files.set(filePath, decoder.decode(content));
    }),
    renameFile: vi.fn(async (fromPath: string, toPath: string) => {
      const content = files.get(fromPath);
      if (content === undefined) throw new Error(`Missing file: ${fromPath}`);
      files.set(toPath, content);
      files.delete(fromPath);
    }),
    deleteFile: vi.fn(async (filePath: string) => {
      files.delete(filePath);
    }),
    readText(filePath: string): string {
      return files.get(filePath) ?? '';
    },
  };
  return fileOps;
}
