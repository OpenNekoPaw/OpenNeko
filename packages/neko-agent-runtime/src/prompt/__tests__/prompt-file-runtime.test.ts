import { describe, expect, it, vi } from 'vitest';
import type { PromptPresetConfig } from '@neko/shared';
import {
  DEFAULT_AGENTS_FILE_CONTENT,
  createPromptFileRuntime,
  type PromptFileRuntimeFs,
} from '../index';

const pathAdapter = {
  join: (...parts: string[]) => parts.join('/').replace(/\/+/g, '/'),
  dirname: (filePath: string) => filePath.slice(0, filePath.lastIndexOf('/')) || '/',
};

describe('PromptFileRuntime', () => {
  it('resolves prompt and AGENTS paths from injected roots', () => {
    const runtime = createPromptFileRuntime({
      fs: createFs({}),
      path: pathAdapter,
      homeDir: '/home/neko',
      getWorkspaceRoot: () => '/repo',
    });

    expect(runtime.getUserPromptDir()).toBe('/home/neko/.neko/prompts');
    expect(runtime.getWorkspacePromptDir()).toBe('/repo/.neko/prompts');
    expect(runtime.getUserAgentsFilePath()).toBe('/home/neko/.neko/AGENTS.md');
    expect(runtime.getWorkspaceAgentsFilePath()).toBe('/repo/.neko/AGENTS.md');
    expect(runtime.getPromptWatchDirs()).toEqual([
      '/home/neko/.neko/prompts',
      '/repo/.neko/prompts',
    ]);
    expect(runtime.getPromptFilePath('project', 'story')).toBe('/repo/.neko/prompts/story.md');
    expect(runtime.getPromptFilePath('builtin', 'story')).toBeNull();
  });

  it('scans personal and project prompt markdown files', async () => {
    const runtime = createPromptFileRuntime({
      fs: createFs({
        '/home/neko/.neko/prompts/personal.md': '# Personal Prompt\nbody',
        '/home/neko/.neko/prompts/ignore.txt': 'ignored',
        '/repo/.neko/prompts/project.md': 'No heading',
      }),
      path: pathAdapter,
      homeDir: '/home/neko',
      getWorkspaceRoot: () => '/repo',
    });

    const result = await runtime.scanPromptFiles();

    expect(result.personal.map((prompt) => [prompt.id, prompt.name])).toEqual([
      ['personal-prompt-personal', 'Personal Prompt'],
    ]);
    expect(result.project.map((prompt) => [prompt.id, prompt.name])).toEqual([
      ['project-prompt-project', 'project'],
    ]);
  });

  it('saves, creates, reads, and deletes prompt files', async () => {
    const fs = createFs({});
    const runtime = createPromptFileRuntime({
      fs,
      path: pathAdapter,
      homeDir: '/home/neko',
      getWorkspaceRoot: () => null,
    });

    const saved = await runtime.savePromptFile({
      source: 'personal',
      name: 'Story Prompt',
      content: '# Story Prompt\nbody',
    });
    const created = await runtime.createPromptFile('personal', 'Review Prompt');

    expect(saved).toEqual({
      filePath: '/home/neko/.neko/prompts/story-prompt.md',
      id: 'personal-prompt-story-prompt',
    });
    expect(await runtime.readPromptFile(saved.filePath)).toBe('# Story Prompt\nbody');
    expect(fs.readText(created.filePath)).toContain('# Review Prompt');
    expect(await runtime.deletePromptFile(saved.filePath)).toBe(true);
    expect(await runtime.readPromptFile(saved.filePath)).toBeNull();
  });

  it('loads AGENTS.md with project priority and creates missing files on ensure', async () => {
    const fs = createFs({
      '/home/neko/.neko/AGENTS.md': 'personal agents',
      '/repo/.neko/AGENTS.md': 'project agents',
    });
    const runtime = createPromptFileRuntime({
      fs,
      path: pathAdapter,
      homeDir: '/home/neko',
      getWorkspaceRoot: () => '/repo',
    });

    expect(await runtime.loadAgentsFile()).toEqual({
      content: 'project agents',
      source: 'project',
    });
    expect(await runtime.agentsFileExists('personal')).toBe(true);

    await runtime.deletePromptFile('/repo/.neko/AGENTS.md');
    const ensuredPath = await runtime.ensureAgentsFile('project');

    expect(ensuredPath).toBe('/repo/.neko/AGENTS.md');
    expect(fs.readText(ensuredPath)).toBe(DEFAULT_AGENTS_FILE_CONTENT);
  });

  it('delegates prompt file config projection and sync policy', async () => {
    const runtime = createPromptFileRuntime({
      fs: createFs({}),
      path: pathAdapter,
      homeDir: '/home/neko',
      getWorkspaceRoot: () => null,
    });
    const existing: PromptPresetConfig[] = [
      {
        id: 'personal-prompt-old',
        name: 'old',
        type: 'custom',
        description: '',
        systemPrompt: '',
        source: 'personal',
        filePath: '/home/neko/.neko/prompts/old.md',
        builtin: false,
        enabled: true,
      },
    ];

    const synced = await runtime.syncWithConfig(
      {
        personal: [
          {
            id: 'personal-prompt-old',
            name: 'old',
            filePath: '/home/neko/.neko/prompts/old.md',
            source: 'personal',
            content: '# old',
          },
          {
            id: 'personal-prompt-new',
            name: 'new',
            filePath: '/home/neko/.neko/prompts/new.md',
            source: 'personal',
            content: '# new',
          },
        ],
        project: [],
      },
      existing,
    );

    expect(synced.map((prompt) => prompt.id)).toEqual(['personal-prompt-new']);
    expect(
      runtime.fileInfoToConfig({
        id: 'personal-prompt-new',
        name: 'new',
        filePath: '/home/neko/.neko/prompts/new.md',
        source: 'personal',
        content: '# new',
      }).systemPrompt,
    ).toBe('# new');
  });
});

interface TestFs extends PromptFileRuntimeFs {
  readText(filePath: string): string;
}

function createFs(initialFiles: Record<string, string>): TestFs {
  const files = new Map(Object.entries(initialFiles));
  const dirs = new Set<string>();

  for (const filePath of files.keys()) {
    addParentDirs(dirs, filePath);
  }

  return {
    access: vi.fn(async (targetPath: string) => {
      if (!files.has(targetPath) && !dirs.has(targetPath)) {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      }
    }),
    readdir: vi.fn(async (dirPath: string) => {
      if (!dirs.has(dirPath)) {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      }
      const prefix = `${dirPath}/`;
      return [...files.keys()]
        .filter((filePath) => filePath.startsWith(prefix))
        .map((filePath) => filePath.slice(prefix.length))
        .filter((name) => !name.includes('/'));
    }),
    stat: vi.fn(async (filePath: string) => ({
      isFile: () => files.has(filePath),
    })),
    readFile: vi.fn(async (filePath: string) => {
      const content = files.get(filePath);
      if (content === undefined) {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      }
      return content;
    }),
    mkdir: vi.fn(async (dirPath: string) => {
      addDirRecursive(dirs, dirPath);
    }),
    writeFile: vi.fn(async (filePath: string, content: string) => {
      addParentDirs(dirs, filePath);
      files.set(filePath, content);
    }),
    unlink: vi.fn(async (filePath: string) => {
      if (!files.delete(filePath)) {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      }
    }),
    readText: (filePath: string) => {
      const content = files.get(filePath);
      if (content === undefined) {
        throw new Error(`Missing file: ${filePath}`);
      }
      return content;
    },
  };
}

function addParentDirs(dirs: Set<string>, filePath: string): void {
  const parent = filePath.slice(0, filePath.lastIndexOf('/'));
  addDirRecursive(dirs, parent);
}

function addDirRecursive(dirs: Set<string>, dirPath: string): void {
  if (!dirPath || dirPath === '/') {
    return;
  }
  const parts = dirPath.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current += `/${part}`;
    dirs.add(current);
  }
}
