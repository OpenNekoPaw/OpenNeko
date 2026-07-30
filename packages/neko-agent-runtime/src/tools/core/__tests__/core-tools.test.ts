import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IProjectMemoryManager, Tool } from '@neko/shared';
import { createCoreTools } from '../core-tools';

describe('createCoreTools', () => {
  const fixtureRoot = path.resolve(
    process.cwd(),
    '.test-workspaces',
    `core-tools-policy-${process.pid}`,
  );
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const outsideRoot = path.join(fixtureRoot, 'outside');

  beforeEach(async () => {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
    await fs.mkdir(path.join(workspaceRoot, 'src'), { recursive: true });
    await fs.mkdir(path.join(workspaceRoot, '.neko', '.cache', 'resources'), { recursive: true });
    await fs.mkdir(path.join(workspaceRoot, '.neko', 'logs'), { recursive: true });
    await fs.mkdir(path.join(workspaceRoot, '.neko', 'tmp'), { recursive: true });
    await fs.mkdir(path.join(workspaceRoot, '.neko', 'entities'), { recursive: true });
    await fs.mkdir(path.join(workspaceRoot, '.neko', 'search'), { recursive: true });
    await fs.mkdir(path.join(workspaceRoot, 'ignored'), { recursive: true });
    await fs.mkdir(outsideRoot, { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, 'src', 'story.txt'), 'hello neko\n', 'utf-8');
    await fs.writeFile(path.join(workspaceRoot, '.neko', 'memory.md'), '# Memory\n', 'utf-8');
    await fs.writeFile(
      path.join(workspaceRoot, '.neko', '.cache', 'resources', 'page.txt'),
      'cache\n',
      'utf-8',
    );
    await fs.writeFile(path.join(workspaceRoot, '.neko', 'logs', 'events.jsonl'), '{}\n', 'utf-8');
    await fs.writeFile(path.join(workspaceRoot, '.neko', 'tmp', 'scratch.txt'), 'tmp\n', 'utf-8');
    await fs.writeFile(
      path.join(workspaceRoot, '.neko', 'entities', 'store.json'),
      '{}\n',
      'utf-8',
    );
    await fs.writeFile(path.join(workspaceRoot, '.neko', 'search', 'index.json'), '{}\n', 'utf-8');
    await fs.writeFile(path.join(workspaceRoot, 'ignored', 'secret.txt'), 'ignored\n', 'utf-8');
    await fs.writeFile(path.join(outsideRoot, 'secret.txt'), 'outside\n', 'utf-8');
  });

  afterEach(async () => {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  });

  it('does not include arbitrary shell execution by default', () => {
    const tools = createCoreTools();

    expect(tools.map((tool) => tool.name)).toEqual(['Read', 'Write', 'ListDirectory', 'Grep']);
  });

  it('keeps Bash opt-in for explicit Developer Mode or migration callers', () => {
    const tools = createCoreTools({ includeShell: true });

    expect(tools.map((tool) => tool.name)).toContain('Bash');
  });

  it('fails closed for file tools when no workspace root is available', async () => {
    const tools = createCoreTools();
    const read = getTool(tools, 'Read');

    await expect(
      read.execute({ file_path: path.join(workspaceRoot, 'src', 'story.txt') }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('no authorized workspace root'),
    });
  });

  it('allows workspace-relative file reads through the shared file access policy', async () => {
    const read = getTool(createCoreTools({ defaultCwd: workspaceRoot }), 'Read');

    await expect(read.execute({ file_path: 'src/story.txt' })).resolves.toMatchObject({
      success: true,
      data: expect.objectContaining({
        content: expect.stringContaining('hello neko'),
      }),
    });
  });

  it('keeps creator-review and plan documents as ordinary authorized Markdown', async () => {
    const briefPath = path.join(workspaceRoot, 'brief.md');
    const planPath = path.join(workspaceRoot, 'plan.md');
    await fs.writeFile(briefPath, '# Existing brief\nKeep this decision.\n', 'utf-8');
    await fs.writeFile(planPath, '# Existing plan\n- pending: review source\n', 'utf-8');
    const tools = createCoreTools({ defaultCwd: workspaceRoot });
    const read = getTool(tools, 'Read');
    const write = getTool(tools, 'Write');

    await expect(read.execute({ file_path: 'brief.md' })).resolves.toMatchObject({
      success: true,
      data: expect.objectContaining({ content: expect.stringContaining('Keep this decision') }),
    });
    await expect(
      write.execute({
        file_path: 'plan.md',
        content: '# Existing plan\n- in_progress: review source\n',
      }),
    ).resolves.toMatchObject({ success: true });

    expect(await fs.readFile(briefPath, 'utf-8')).toContain('Keep this decision');
    expect(await fs.readFile(planPath, 'utf-8')).toContain('in_progress');
  });

  it('blocks reads, listings, and searches outside the workspace root', async () => {
    const tools = createCoreTools({ defaultCwd: workspaceRoot });
    const outsideFile = path.join(outsideRoot, 'secret.txt');
    const outsideDir = outsideRoot;

    await expect(getTool(tools, 'Read').execute({ file_path: outsideFile })).resolves.toMatchObject(
      {
        success: false,
        error: expect.stringContaining('outside authorized read roots'),
      },
    );
    await expect(
      getTool(tools, 'ListDirectory').execute({ path: outsideDir }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('outside authorized read roots'),
    });
    await expect(
      getTool(tools, 'Grep').execute({ pattern: 'outside', path: outsideDir }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('outside authorized read roots'),
    });
  });

  it('allows reads, listings, and searches from additional authorized read roots', async () => {
    const tools = createCoreTools({
      defaultCwd: workspaceRoot,
      authorizedReadRoots: [outsideRoot],
    });
    const outsideFile = path.join(outsideRoot, 'secret.txt');

    await expect(getTool(tools, 'Read').execute({ file_path: outsideFile })).resolves.toMatchObject(
      {
        success: true,
        data: expect.objectContaining({
          content: expect.stringContaining('outside'),
        }),
      },
    );
    await expect(
      getTool(tools, 'ListDirectory').execute({ path: outsideRoot }),
    ).resolves.toMatchObject({
      success: true,
      data: expect.objectContaining({
        content: expect.stringContaining('secret.txt'),
      }),
    });
    await expect(
      getTool(tools, 'Grep').execute({ pattern: 'outside', path: outsideRoot }),
    ).resolves.toMatchObject({
      success: true,
      data: expect.objectContaining({
        content: expect.stringContaining('secret.txt'),
      }),
    });
  });

  it('blocks writes outside workspace and rejects system temp paths', async () => {
    const write = getTool(createCoreTools({ defaultCwd: workspaceRoot }), 'Write');

    await expect(
      write.execute({ file_path: path.join(outsideRoot, 'new.txt'), content: 'nope' }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('outside authorized write roots'),
    });
    await expect(
      write.execute({ file_path: '/tmp/neko-agent-denied.txt', content: 'nope' }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('system temp'),
    });
  });

  it('keeps additional authorized read roots read-only', async () => {
    const write = getTool(
      createCoreTools({ defaultCwd: workspaceRoot, authorizedReadRoots: [outsideRoot] }),
      'Write',
    );

    await expect(
      write.execute({ file_path: path.join(outsideRoot, 'new.txt'), content: 'nope' }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('outside authorized write roots'),
    });
  });

  it('blocks generic file tools from managed workspace runtime and cache directories', async () => {
    const tools = createCoreTools({ defaultCwd: workspaceRoot });

    await expect(
      getTool(tools, 'Read').execute({ file_path: '.neko/.cache/resources/page.txt' }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('managed workspace runtime or cache directory'),
    });
    await expect(
      getTool(tools, 'ListDirectory').execute({ path: '.neko/logs' }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('managed workspace runtime or cache directory'),
    });
    await expect(
      getTool(tools, 'Grep').execute({ pattern: 'cache', path: '.neko/.cache' }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('managed workspace runtime or cache directory'),
    });
    await expect(
      getTool(tools, 'Write').execute({ file_path: '.neko/logs/new.jsonl', content: '{}\n' }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('managed workspace runtime or cache directory'),
    });
    await expect(
      getTool(tools, 'Read').execute({ file_path: '.neko/tmp/scratch.txt' }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('managed workspace runtime or cache directory'),
    });
    await expect(
      getTool(tools, 'Read').execute({ file_path: '.neko/entities/store.json' }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('managed workspace runtime or cache directory'),
    });
    await expect(
      getTool(tools, 'Read').execute({ file_path: '.neko/search/index.json' }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('managed workspace runtime or cache directory'),
    });
  });

  it('does not reveal managed cache entries through recursive workspace listing or search', async () => {
    const tools = createCoreTools({ defaultCwd: workspaceRoot });

    const listing = await getTool(tools, 'ListDirectory').execute({
      path: '.',
      recursive: true,
    });
    expect(listing.success).toBe(true);
    expect(JSON.stringify(listing.data)).toContain('src/story.txt');
    expect(JSON.stringify(listing.data)).not.toContain('.neko/.cache');
    expect(JSON.stringify(listing.data)).not.toContain('page.txt');

    const grep = await getTool(tools, 'Grep').execute({
      pattern: 'cache',
      path: '.',
    });
    expect(grep.success).toBe(true);
    expect(JSON.stringify(grep.data)).not.toContain('.neko/.cache');
    expect(JSON.stringify(grep.data)).not.toContain('page.txt');
  });

  it('blocks generic Agent reads from project memory backing files', async () => {
    const read = getTool(createCoreTools({ defaultCwd: workspaceRoot }), 'Read');

    await expect(read.execute({ file_path: '.neko/memory.md' })).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('managed workspace runtime or cache directory'),
    });
  });

  it('exposes project memory updates as proposals instead of direct .neko writes', async () => {
    const projectMemoryManager = createMockProjectMemoryManager();
    const memoryWrite = getTool(
      createCoreTools({ defaultCwd: workspaceRoot, projectMemoryManager }),
      'MemoryWrite',
    );

    await expect(
      memoryWrite.execute({
        action: 'upsert',
        key: 'Recent Decisions',
        content: '- Keep host adapters at composition roots.',
      }),
    ).resolves.toMatchObject({
      success: true,
      data: {
        committed: false,
        proposal: {
          kind: 'project-memory-mutation',
          action: 'upsert',
          key: 'Recent Decisions',
          content: '- Keep host adapters at composition roots.',
        },
      },
    });
    expect(projectMemoryManager.upsertEntry).not.toHaveBeenCalled();
    expect(projectMemoryManager.removeEntry).not.toHaveBeenCalled();
  });

  it('blocks generic file tools from workspace .gitignore matches', async () => {
    const tools = createCoreTools({
      defaultCwd: workspaceRoot,
      workspaceIgnoreRules: {
        gitignoreRules: ['ignored/'],
      },
    });

    await expect(
      getTool(tools, 'Read').execute({ file_path: 'ignored/secret.txt' }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('.gitignore rule "ignored/"'),
    });
    await expect(
      getTool(tools, 'ListDirectory').execute({ path: 'ignored' }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('.gitignore rule "ignored/"'),
    });
  });
});

function getTool(tools: readonly Tool[], name: string): Tool {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) {
    throw new Error(`Missing tool: ${name}`);
  }
  return tool;
}

function createMockProjectMemoryManager(): IProjectMemoryManager & {
  readonly upsertEntry: ReturnType<typeof vi.fn>;
  readonly removeEntry: ReturnType<typeof vi.fn>;
} {
  return {
    load: vi.fn(async () => undefined),
    getContent: vi.fn(() => null),
    upsertEntry: vi.fn(async () => undefined),
    removeEntry: vi.fn(async () => undefined),
    on: vi.fn(),
    off: vi.fn(),
  };
}
