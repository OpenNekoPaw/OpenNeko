import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultProjectFormatCodecRegistry,
  ProjectFileStore,
  type ProjectData,
  type ProjectFileOps,
} from '@neko/shared';
import { prepareCutProjectFileSave, saveCutProjectFile } from './cutProjectFilePersistence';

const fileContents = vi.hoisted(() => new Map<string, Uint8Array>());

vi.mock('vscode', () => ({
  Uri: {
    file: (filePath: string) => ({
      fsPath: filePath,
      toString: () => `file://${filePath}`,
    }),
  },
  workspace: {
    workspaceFolders: [
      {
        uri: {
          fsPath: '/workspace/project',
        },
      },
    ],
    fs: {
      readFile: vi.fn(async (uri: { fsPath: string }) => {
        const content = fileContents.get(uri.fsPath);
        if (!content) throw new Error(`Missing file: ${uri.fsPath}`);
        return content;
      }),
      writeFile: vi.fn(async (uri: { fsPath: string }, content: Uint8Array) => {
        fileContents.set(uri.fsPath, content);
      }),
      delete: vi.fn(async (uri: { fsPath: string }) => {
        fileContents.delete(uri.fsPath);
      }),
      rename: vi.fn(async (fromUri: { fsPath: string }, toUri: { fsPath: string }) => {
        const content = fileContents.get(fromUri.fsPath);
        if (!content) throw new Error(`Missing file: ${fromUri.fsPath}`);
        fileContents.set(toUri.fsPath, content);
        fileContents.delete(fromUri.fsPath);
      }),
    },
  },
  commands: {
    executeCommand: vi.fn(),
  },
}));

vi.mock('../../services/tools/helpers', async () => {
  const actual = await vi.importActual<typeof import('../../services/tools/helpers')>(
    '../../services/tools/helpers',
  );
  return {
    ...actual,
    isExistingLocalFile: vi.fn(() => true),
    normalizePathsForSave: vi.fn(async (project: ProjectData) => ({
      ...project,
      tracks: project.tracks.map((track) => ({
        ...track,
        elements: track.elements.map((element) =>
          'src' in element && element.src === '/workspace/project/media/clip.mp4'
            ? { ...element, src: 'media/clip.mp4' }
            : element,
        ),
      })),
    })),
  };
});

describe('saveCutProjectFile', () => {
  beforeEach(() => {
    fileContents.clear();
  });

  it('writes normalized NKV content through the shared project file store', async () => {
    const result = await saveCutProjectFile(
      { fsPath: '/workspace/project/edit.nkv' } as never,
      createProject('/workspace/project/media/clip.mp4'),
      'manual',
      { fileOps: createMemoryFileOps() },
    );

    expect(result.ok).toBe(true);
    expect(result.document?.tracks[0]?.elements[0]).toMatchObject({
      src: 'media/clip.mp4',
    });
    const saved = readText('/workspace/project/edit.nkv');
    expect(saved).toContain('"src": "media/clip.mp4"');
    expect(saved).not.toContain('/workspace/project/media/clip.mp4');
  });

  it('prepares normalized NKV content without writing the file', async () => {
    const result = await prepareCutProjectFileSave(
      { fsPath: '/workspace/project/edit.nkv' } as never,
      createProject('/workspace/project/media/clip.mp4'),
    );

    expect(result.ok).toBe(true);
    expect(result.document?.tracks[0]?.elements[0]).toMatchObject({
      src: 'media/clip.mp4',
    });
    expect(result.content).toContain('"src": "media/clip.mp4"');
    expect(result.content).not.toContain('/workspace/project/media/clip.mp4');
    expect(readText('/workspace/project/edit.nkv')).toBe('');
  });

  it('reloads add-source saved clips from ProjectFileStore without Webview or cache state', async () => {
    const project = createProject('media/clip.mp4');
    await saveCutProjectFile(
      { fsPath: '/workspace/project/edit.nkv' } as never,
      project,
      'add-source',
      { fileOps: createMemoryFileOps() },
    );

    const store = new ProjectFileStore({
      registry: createDefaultProjectFormatCodecRegistry(),
      fileOps: {
        readFile: async (filePath) => {
          const content = fileContents.get(filePath);
          if (!content) throw new Error(`Missing file: ${filePath}`);
          return content;
        },
        writeFile: async (filePath, content) => {
          fileContents.set(filePath, content);
        },
      },
    });
    const loaded = await store.load<ProjectData>({ filePath: '/workspace/project/edit.nkv' });

    expect(loaded.ok).toBe(true);
    expect(loaded.document?.tracks[0]?.elements[0]).toMatchObject({
      type: 'media',
      src: 'media/clip.mp4',
    });
    expect(readText('/workspace/project/edit.nkv')).toContain('"src": "media/clip.mp4"');
    expect(readText('/workspace/project/edit.nkv')).not.toContain('.neko/.cache');
    expect(readText('/workspace/project/edit.nkv')).not.toContain('blob:');
  });
});

function createProject(src: string): ProjectData {
  return {
    version: '2.0',
    name: 'Save test',
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    tracks: [
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
    ],
  };
}

function readText(filePath: string): string {
  const content = fileContents.get(filePath);
  if (!content) return '';
  return new TextDecoder().decode(content);
}

function createMemoryFileOps(): ProjectFileOps {
  return {
    readFile: async (filePath) => {
      const content = fileContents.get(filePath);
      if (!content) throw new Error(`Missing file: ${filePath}`);
      return content;
    },
    writeFile: async (filePath, content) => {
      fileContents.set(filePath, content);
    },
    deleteFile: async (filePath) => {
      fileContents.delete(filePath);
    },
    renameFile: async (fromPath, toPath) => {
      const content = fileContents.get(fromPath);
      if (!content) throw new Error(`Missing file: ${fromPath}`);
      fileContents.set(toPath, content);
      fileContents.delete(fromPath);
    },
  };
}
