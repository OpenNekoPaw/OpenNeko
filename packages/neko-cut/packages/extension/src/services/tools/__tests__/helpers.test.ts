import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import * as vscode from 'vscode';
import type {
  ProjectData,
  TimelineElement,
  TimelineTrack,
  MediaElement,
  TextElement,
} from '@neko/shared';
import {
  toRelativeIfAbsolute,
  normalizePathsForSave,
  resolveMediaPath,
  findElement,
  updateElementAt,
  removeElementAt,
  normalizePercent,
} from '../helpers';

const cleanupDirectories: string[] = [];

vi.mock('vscode', () => ({
  Uri: {
    file: (filePath: string) => ({
      scheme: 'file',
      fsPath: filePath,
      path: filePath,
      toString: () => `file://${filePath}`,
    }),
  },
  workspace: {
    workspaceFolders: [
      { uri: { fsPath: '/workspace/a' }, name: 'a', index: 0 },
      { uri: { fsPath: '/workspace/b' }, name: 'b', index: 1 },
    ],
  },
  commands: {
    executeCommand: vi.fn(async () => null),
  },
  extensions: {
    getExtension: vi.fn(() => undefined),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(vscode.extensions.getExtension).mockReturnValue(undefined);
});

afterEach(() => {
  for (const directory of cleanupDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeElement(overrides: Partial<MediaElement> & { id: string }): MediaElement {
  return {
    type: 'media',
    name: 'clip',
    duration: 5,
    startTime: 0,
    trimStart: 0,
    trimEnd: 0,
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5 },
    opacity: 1,
    blendMode: 'normal',
    effects: [],
    muted: false,
    hidden: false,
    locked: false,
    src: 'video.mp4',
    ...overrides,
  } as MediaElement;
}

function makeTextElement(overrides: Partial<TextElement> & { id: string }): TextElement {
  return {
    type: 'text',
    name: 'text',
    duration: 3,
    startTime: 0,
    trimStart: 0,
    trimEnd: 0,
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    opacity: 1,
    blendMode: 'normal',
    effects: [],
    muted: false,
    hidden: false,
    locked: false,
    content: 'Hello',
    fontSize: 48,
    fontFamily: 'Arial',
    color: '#ffffff',
    backgroundColor: 'transparent',
    textAlign: 'center',
    fontWeight: 'normal',
    fontStyle: 'normal',
    ...overrides,
  } as TextElement;
}

function makeTrack(
  elements: TimelineElement[],
  overrides: Partial<TimelineTrack> = {},
): TimelineTrack {
  return {
    id: 'track-1',
    name: 'Track 1',
    type: 'video',
    elements,
    muted: false,
    locked: false,
    hidden: false,
    isMain: false,
    ...overrides,
  } as TimelineTrack;
}

function makeProject(tracks: TimelineTrack[], overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    version: '1.0',
    name: 'Test Project',
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    tracks,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// toRelativeIfAbsolute
// ---------------------------------------------------------------------------

describe('toRelativeIfAbsolute', () => {
  it('converts an absolute path to a relative path', () => {
    const result = toRelativeIfAbsolute(
      '/home/user/project/assets/video.mp4',
      '/home/user/project',
    );
    expect(result).toBe('assets/video.mp4');
  });

  it('returns a relative path unchanged', () => {
    const result = toRelativeIfAbsolute('assets/video.mp4', '/home/user/project');
    expect(result).toBe('assets/video.mp4');
  });

  it('returns dot-prefixed relative path unchanged', () => {
    const result = toRelativeIfAbsolute('./video.mp4', '/home/user/project');
    expect(result).toBe('./video.mp4');
  });

  it('produces ../ segments when file is outside baseDir', () => {
    const result = toRelativeIfAbsolute('/home/user/other/video.mp4', '/home/user/project');
    expect(result).toBe('../other/video.mp4');
  });

  it('produces just a filename when file is directly in baseDir', () => {
    const result = toRelativeIfAbsolute('/home/user/project/video.mp4', '/home/user/project');
    expect(result).toBe('video.mp4');
  });

  it('handles baseDir equal to the file path directory', () => {
    const result = toRelativeIfAbsolute('/a/b/c.txt', '/a/b');
    expect(result).toBe('c.txt');
  });

  it('returns empty-ish relative for same path', () => {
    // path.relative('/a/b', '/a/b') => ''
    const result = toRelativeIfAbsolute('/a/b', '/a/b');
    expect(result).toBe('');
  });
});

// ---------------------------------------------------------------------------
// normalizePathsForSave
// ---------------------------------------------------------------------------

describe('normalizePathsForSave', () => {
  it('returns project unchanged when projectFilePath is undefined', async () => {
    const project = makeProject([]);
    const result = await normalizePathsForSave(project);
    expect(result).toBe(project); // same reference
  });

  it('converts absolute src paths to relative', async () => {
    const el = makeElement({ id: 'e1', src: '/home/user/project/assets/clip.mp4' });
    const project = makeProject([makeTrack([el])]);
    const result = await normalizePathsForSave(project, '/home/user/project/project.neko', {
      owningWorkspaceRoot: '/home/user/project',
      workspaceRoots: ['/home/user/project'],
    });
    const resultEl = result.tracks[0]!.elements[0]! as unknown as { src: string };
    expect(resultEl.src).toBe('assets/clip.mp4');
  });

  it('contracts absolute workspace media to owning workspace relative paths', async () => {
    const el = makeElement({ id: 'e1', src: '/workspace/b/cases/clip.mp4' });
    const project = makeProject([makeTrack([el])]);
    const result = await normalizePathsForSave(project, '/workspace/b/projects/cut/project.nkv');
    const resultEl = result.tracks[0]!.elements[0]! as unknown as { src: string };

    expect(resultEl.src).toBe('cases/clip.mp4');
  });

  it('leaves already-relative src paths unchanged', async () => {
    const el = makeElement({ id: 'e1', src: 'assets/clip.mp4' });
    const project = makeProject([makeTrack([el])]);
    const result = await normalizePathsForSave(project, '/home/user/project/project.neko');
    const resultEl = result.tracks[0]!.elements[0]! as unknown as { src: string };
    expect(resultEl.src).toBe('assets/clip.mp4');
  });

  it('leaves elements without src unchanged (text element)', async () => {
    const textEl = makeTextElement({ id: 'e1' });
    const project = makeProject([makeTrack([textEl])]);
    const result = await normalizePathsForSave(project, '/home/user/project/project.neko');
    const resultEl = result.tracks[0]!.elements[0]! as TextElement;
    expect(resultEl.type).toBe('text');
    // Text element should be returned as-is (no src mutation)
    expect((resultEl as unknown as { src?: string }).src).toBeUndefined();
  });

  it('does not mutate the original project', async () => {
    const el = makeElement({ id: 'e1', src: '/home/user/project/assets/clip.mp4' });
    const project = makeProject([makeTrack([el])]);
    const originalSrc = (project.tracks[0]!.elements[0]! as MediaElement).src;
    await normalizePathsForSave(project, '/home/user/project/project.neko', {
      owningWorkspaceRoot: '/home/user/project',
      workspaceRoots: ['/home/user/project'],
    });
    expect((project.tracks[0]!.elements[0]! as MediaElement).src).toBe(originalSrc);
  });

  it('handles multiple tracks and elements', async () => {
    const e1 = makeElement({ id: 'e1', src: '/home/user/project/a.mp4' });
    const e2 = makeElement({ id: 'e2', src: '/home/user/project/sub/b.mp4' });
    const e3 = makeTextElement({ id: 'e3' });
    const project = makeProject([
      makeTrack([e1], { id: 'track-1' }),
      makeTrack([e2, e3], { id: 'track-2' }),
    ]);
    const result = await normalizePathsForSave(project, '/home/user/project/project.neko', {
      owningWorkspaceRoot: '/home/user/project',
      workspaceRoots: ['/home/user/project'],
    });
    expect((result.tracks[0]!.elements[0]! as unknown as { src: string }).src).toBe('a.mp4');
    expect((result.tracks[1]!.elements[0]! as unknown as { src: string }).src).toBe('sub/b.mp4');
  });

  it('handles empty tracks array', async () => {
    const project = makeProject([]);
    const result = await normalizePathsForSave(project, '/home/user/project/project.neko');
    expect(result.tracks).toEqual([]);
  });

  it('rejects non-portable absolute media paths instead of saving ../ references', async () => {
    const el = makeElement({ id: 'e1', src: '/outside/media/clip.mp4' });
    const project = makeProject([makeTrack([el])]);
    await expect(
      normalizePathsForSave(project, '/home/user/project/project.neko', {
        owningWorkspaceRoot: '/home/user/project',
        workspaceRoots: ['/home/user/project'],
      }),
    ).rejects.toThrow('requires explicit migration');
  });

  it('keeps canonical workspace-linked media paths unchanged for save', async () => {
    const el = makeElement({ id: 'e1', src: 'neko/assets/Books/clip.mp4' });
    const project = makeProject([makeTrack([el])]);

    const result = await normalizePathsForSave(project, '/workspace/b/projects/cut/project.nkv');
    const resultEl = result.tracks[0]!.elements[0]! as unknown as { src: string };

    expect(resultEl.src).toBe('neko/assets/Books/clip.mp4');
    expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
      'neko.assets.contractPath',
      expect.anything(),
      expect.anything(),
    );
  });
});

// ---------------------------------------------------------------------------
// resolveMediaPath
// ---------------------------------------------------------------------------

describe('resolveMediaPath', () => {
  it('resolves project media from the owning workspace root', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-cut-workspace-media-'));
    cleanupDirectories.push(workspaceRoot);
    const projectDir = path.join(workspaceRoot, 'projects', 'cut');
    const mediaPath = path.join(workspaceRoot, 'cases', 'clip.mp4');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(path.dirname(mediaPath), { recursive: true });
    fs.writeFileSync(mediaPath, 'video');

    const result = await resolveMediaPath('cases/clip.mp4', projectDir, {
      projectFilePath: path.join(projectDir, 'project.nkv'),
      owningWorkspaceRoot: workspaceRoot,
      workspaceRoots: [workspaceRoot],
      fileExists: (filePath) => filePath === mediaPath,
    });

    expect(result).toBe(mediaPath);
  });

  it('rejects document-relative project media when no workspace candidate exists', async () => {
    await expect(
      resolveMediaPath('../cases/clip.mp4', '/workspace/b/projects/cut', {
        projectFilePath: '/workspace/b/projects/cut/project.nkv',
        fileExists: (filePath) => filePath === '/workspace/b/projects/cases/clip.mp4',
      }),
    ).rejects.toThrow('No existing local file matched the media path candidates.');
  });

  it('resolves workspace-linked media through the shared host content path', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-cut-linked-media-'));
    cleanupDirectories.push(root);
    const workspaceRoot = path.join(root, 'workspace');
    const target = path.join(root, 'target');
    const projectDir = path.join(workspaceRoot, 'projects', 'cut');
    const linkPath = path.join(workspaceRoot, 'neko', 'assets', 'Books');
    const linkedFile = path.join(linkPath, 'clip.mp4');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, 'clip.mp4'), 'video');
    fs.mkdirSync(path.dirname(linkPath), { recursive: true });
    fs.symlinkSync(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir');

    const result = await resolveMediaPath('neko/assets/Books/clip.mp4', projectDir, {
      owningWorkspaceRoot: workspaceRoot,
      workspaceRoots: [workspaceRoot],
      fileExists: (filePath) => filePath === linkedFile,
    });

    expect(result).toBe(linkedFile);
    expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
      'neko.assets.resolvePath',
      expect.anything(),
      expect.anything(),
    );
  });
});

// ---------------------------------------------------------------------------
// findElement
// ---------------------------------------------------------------------------

describe('findElement', () => {
  it('finds element in the first track', () => {
    const el = makeElement({ id: 'target' });
    const project = makeProject([makeTrack([el])]);
    const result = findElement(project, 'target');
    expect(result).not.toBeNull();
    expect(result!.trackIndex).toBe(0);
    expect(result!.elementIndex).toBe(0);
    expect(result!.element.id).toBe('target');
    expect(result!.track).toBe(project.tracks[0]);
  });

  it('finds element in a later track', () => {
    const e1 = makeElement({ id: 'e1' });
    const e2 = makeElement({ id: 'e2' });
    const e3 = makeElement({ id: 'target' });
    const project = makeProject([
      makeTrack([e1, e2], { id: 'track-1' }),
      makeTrack([e3], { id: 'track-2' }),
    ]);
    const result = findElement(project, 'target');
    expect(result).not.toBeNull();
    expect(result!.trackIndex).toBe(1);
    expect(result!.elementIndex).toBe(0);
  });

  it('finds an element that is not the first in a track', () => {
    const e1 = makeElement({ id: 'e1' });
    const e2 = makeElement({ id: 'target' });
    const project = makeProject([makeTrack([e1, e2])]);
    const result = findElement(project, 'target');
    expect(result!.elementIndex).toBe(1);
  });

  it('returns null when element is not found', () => {
    const project = makeProject([makeTrack([makeElement({ id: 'e1' })])]);
    expect(findElement(project, 'nonexistent')).toBeNull();
  });

  it('returns null for empty project', () => {
    const project = makeProject([]);
    expect(findElement(project, 'any')).toBeNull();
  });

  it('returns null for project with empty tracks', () => {
    const project = makeProject([makeTrack([])]);
    expect(findElement(project, 'any')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// updateElementAt
// ---------------------------------------------------------------------------

describe('updateElementAt', () => {
  it('updates the element at given indices', () => {
    const original = makeElement({ id: 'e1', name: 'original' });
    const updated = makeElement({ id: 'e1', name: 'updated' });
    const project = makeProject([makeTrack([original])]);

    const result = updateElementAt(project, 0, 0, updated);
    expect(result.tracks[0]!.elements[0]!.name).toBe('updated');
  });

  it('does not mutate the original project', () => {
    const original = makeElement({ id: 'e1', name: 'original' });
    const updated = makeElement({ id: 'e1', name: 'updated' });
    const project = makeProject([makeTrack([original])]);

    updateElementAt(project, 0, 0, updated);
    expect(project.tracks[0]!.elements[0]!.name).toBe('original');
  });

  it('does not mutate original tracks array', () => {
    const e1 = makeElement({ id: 'e1' });
    const e2 = makeElement({ id: 'e2' });
    const project = makeProject([makeTrack([e1]), makeTrack([e2], { id: 'track-2' })]);
    const updated = makeElement({ id: 'e1', name: 'new' });

    const result = updateElementAt(project, 0, 0, updated);
    expect(result.tracks).not.toBe(project.tracks);
    // The other track is a different reference at the track level
    // but the second track object reference may differ since tracks array is spread
  });

  it('preserves other elements in the same track', () => {
    const e1 = makeElement({ id: 'e1' });
    const e2 = makeElement({ id: 'e2' });
    const project = makeProject([makeTrack([e1, e2])]);
    const updated = makeElement({ id: 'e1', name: 'updated' });

    const result = updateElementAt(project, 0, 0, updated);
    expect(result.tracks[0]!.elements[1]!.id).toBe('e2');
  });

  it('throws for out-of-bounds track index', () => {
    const project = makeProject([makeTrack([makeElement({ id: 'e1' })])]);
    expect(() => updateElementAt(project, 5, 0, makeElement({ id: 'e1' }))).toThrow(
      'Track index out of bounds: 5',
    );
  });

  it('throws for negative track index', () => {
    const project = makeProject([makeTrack([makeElement({ id: 'e1' })])]);
    expect(() => updateElementAt(project, -1, 0, makeElement({ id: 'e1' }))).toThrow(
      'Track index out of bounds: -1',
    );
  });

  it('preserves project-level fields', () => {
    const project = makeProject([makeTrack([makeElement({ id: 'e1' })])], {
      name: 'My Project',
      fps: 60,
    });
    const result = updateElementAt(project, 0, 0, makeElement({ id: 'e1', name: 'new' }));
    expect(result.name).toBe('My Project');
    expect(result.fps).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// removeElementAt
// ---------------------------------------------------------------------------

describe('removeElementAt', () => {
  it('removes the element at given indices', () => {
    const e1 = makeElement({ id: 'e1' });
    const e2 = makeElement({ id: 'e2' });
    const project = makeProject([makeTrack([e1, e2])]);

    const result = removeElementAt(project, 0, 0);
    expect(result.tracks[0]!.elements).toHaveLength(1);
    expect(result.tracks[0]!.elements[0]!.id).toBe('e2');
  });

  it('removes the last element, leaving an empty track', () => {
    const project = makeProject([makeTrack([makeElement({ id: 'e1' })])]);
    const result = removeElementAt(project, 0, 0);
    expect(result.tracks[0]!.elements).toHaveLength(0);
  });

  it('does not mutate the original project', () => {
    const e1 = makeElement({ id: 'e1' });
    const e2 = makeElement({ id: 'e2' });
    const project = makeProject([makeTrack([e1, e2])]);

    removeElementAt(project, 0, 0);
    expect(project.tracks[0]!.elements).toHaveLength(2);
  });

  it('throws for out-of-bounds track index', () => {
    const project = makeProject([makeTrack([makeElement({ id: 'e1' })])]);
    expect(() => removeElementAt(project, 3, 0)).toThrow('Track index out of bounds: 3');
  });

  it('throws for negative track index', () => {
    const project = makeProject([makeTrack([makeElement({ id: 'e1' })])]);
    expect(() => removeElementAt(project, -1, 0)).toThrow('Track index out of bounds: -1');
  });

  it('removes an element from the middle of a list', () => {
    const e1 = makeElement({ id: 'e1' });
    const e2 = makeElement({ id: 'e2' });
    const e3 = makeElement({ id: 'e3' });
    const project = makeProject([makeTrack([e1, e2, e3])]);

    const result = removeElementAt(project, 0, 1);
    expect(result.tracks[0]!.elements).toHaveLength(2);
    expect(result.tracks[0]!.elements[0]!.id).toBe('e1');
    expect(result.tracks[0]!.elements[1]!.id).toBe('e3');
  });

  it('preserves other tracks', () => {
    const project = makeProject([
      makeTrack([makeElement({ id: 'e1' })], { id: 'track-1' }),
      makeTrack([makeElement({ id: 'e2' })], { id: 'track-2' }),
    ]);
    const result = removeElementAt(project, 0, 0);
    expect(result.tracks).toHaveLength(2);
    expect(result.tracks[1]!.elements).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// normalizePercent
// ---------------------------------------------------------------------------

describe('normalizePercent', () => {
  // Happy path: value in 0-1 range -> multiply by 100
  it('converts 0 to 0', () => {
    expect(normalizePercent(0, 50)).toBe(0);
  });

  it('converts 1 to 100', () => {
    expect(normalizePercent(1, 50)).toBe(100);
  });

  it('converts 0.5 to 50', () => {
    expect(normalizePercent(0.5, 50)).toBe(50);
  });

  it('converts 0.01 to 1', () => {
    expect(normalizePercent(0.01, 50)).toBe(1);
  });

  it('converts 0.99 to 99', () => {
    expect(normalizePercent(0.99, 50)).toBe(99);
  });

  // Values already in percentage range (> 1)
  it('returns value as-is when > 1', () => {
    expect(normalizePercent(50, 0)).toBe(50);
  });

  it('returns value as-is when equal to 100', () => {
    expect(normalizePercent(100, 0)).toBe(100);
  });

  it('returns value as-is for large numbers', () => {
    expect(normalizePercent(200, 0)).toBe(200);
  });

  // Negative values (outside 0-1 range)
  it('returns negative values as-is', () => {
    expect(normalizePercent(-5, 0)).toBe(-5);
  });

  // Fallback cases
  it('returns fallback when value is undefined', () => {
    expect(normalizePercent(undefined, 75)).toBe(75);
  });

  it('returns fallback when value is NaN', () => {
    expect(normalizePercent(NaN, 75)).toBe(75);
  });

  // Boundary: exactly at 0 and 1 (inclusive)
  it('boundary: 0 is within 0-1 range and gets multiplied', () => {
    expect(normalizePercent(0, 50)).toBe(0);
  });

  it('boundary: 1 is within 0-1 range and gets multiplied', () => {
    expect(normalizePercent(1, 50)).toBe(100);
  });

  // Just outside boundary
  it('value just above 1 is returned as-is', () => {
    expect(normalizePercent(1.01, 50)).toBe(1.01);
  });

  it('value just below 0 is returned as-is', () => {
    expect(normalizePercent(-0.01, 50)).toBe(-0.01);
  });

  // Fallback value is 0
  it('returns 0 fallback for undefined value', () => {
    expect(normalizePercent(undefined, 0)).toBe(0);
  });
});
