import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tool } from '@neko/agent-contracts';
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
    await fs.mkdir(path.join(workspaceRoot, '.runtime', 'cache', 'resources'), { recursive: true });
    await fs.mkdir(path.join(workspaceRoot, '.runtime', 'logs'), { recursive: true });
    await fs.mkdir(path.join(workspaceRoot, '.runtime', 'tmp'), { recursive: true });
    await fs.mkdir(path.join(workspaceRoot, '.runtime', 'entities'), { recursive: true });
    await fs.mkdir(path.join(workspaceRoot, '.runtime', 'search'), { recursive: true });
    await fs.mkdir(path.join(workspaceRoot, 'ignored'), { recursive: true });
    await fs.mkdir(outsideRoot, { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, 'src', 'story.txt'), 'hello neko\n', 'utf-8');
    await fs.writeFile(
      path.join(workspaceRoot, '.runtime', 'cache', 'resources', 'page.txt'),
      'cache\n',
      'utf-8',
    );
    await fs.writeFile(
      path.join(workspaceRoot, '.runtime', 'logs', 'events.jsonl'),
      '{}\n',
      'utf-8',
    );
    await fs.writeFile(
      path.join(workspaceRoot, '.runtime', 'tmp', 'scratch.txt'),
      'tmp\n',
      'utf-8',
    );
    await fs.writeFile(
      path.join(workspaceRoot, '.runtime', 'entities', 'store.json'),
      '{}\n',
      'utf-8',
    );
    await fs.writeFile(
      path.join(workspaceRoot, '.runtime', 'search', 'index.json'),
      '{}\n',
      'utf-8',
    );
    await fs.writeFile(path.join(workspaceRoot, 'ignored', 'secret.txt'), 'ignored\n', 'utf-8');
    await fs.writeFile(path.join(workspaceRoot, 'story.nkc'), 'CANVAS_RAW_SECRET\n', 'utf-8');
    await fs.writeFile(path.join(workspaceRoot, 'edit.otio'), 'CUT_RAW_SECRET\n', 'utf-8');
    await fs.writeFile(path.join(outsideRoot, 'secret.txt'), 'outside\n', 'utf-8');
  });

  afterEach(async () => {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  });

  it('does not include arbitrary shell execution by default', () => {
    const tools = createCoreTools();

    expect(tools.map((tool) => tool.name)).toEqual(['Read', 'Write', 'ListDirectory', 'Grep']);
  });

  it('keeps Bash opt-in for explicit Developer Mode callers', () => {
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
        contentLocator: { file: { authority: 'workspace' as const, path: 'src/story.txt' } },
        content: expect.stringContaining('hello neko'),
      }),
    });
  });

  it('accepts an absolute Workspace path for the same file and canonicalizes the result', async () => {
    const read = getTool(createCoreTools({ defaultCwd: workspaceRoot }), 'Read');

    const result = await read.execute({
      file_path: path.join(workspaceRoot, 'src', 'story.txt'),
    });

    expect(result).toMatchObject({
      success: true,
      data: expect.objectContaining({
        contentLocator: { file: { authority: 'workspace' as const, path: 'src/story.txt' } },
        content: expect.stringContaining('hello neko'),
      }),
    });
    expect(JSON.stringify(result)).not.toContain(workspaceRoot);
  });

  it('reads and searches through a linked target while keeping writes denied', async () => {
    await fs.symlink(outsideRoot, path.join(workspaceRoot, 'linked-outside'), 'dir');
    await fs.symlink(outsideRoot, path.join(outsideRoot, 'loop'), 'dir');
    const tools = createCoreTools({ defaultCwd: workspaceRoot });

    const read = await getTool(tools, 'Read').execute({
      file_path: 'linked-outside/secret.txt',
    });
    expect(read).toMatchObject({
      success: true,
      data: expect.objectContaining({
        content: expect.stringContaining('outside'),
        contentLocator: {
          file: { authority: 'workspace' as const, path: 'linked-outside/secret.txt' },
        },
      }),
    });

    const listed = await getTool(tools, 'ListDirectory').execute({ path: 'linked-outside' });
    expect(listed).toMatchObject({
      success: true,
      data: expect.objectContaining({
        directoryPath: 'linked-outside',
        entries: expect.arrayContaining([
          expect.objectContaining({ name: 'secret.txt', type: 'file' }),
        ]),
      }),
    });

    const searched = await getTool(tools, 'Grep').execute({
      pattern: 'outside',
      path: 'linked-outside',
    });
    expect(searched).toMatchObject({ success: true });
    expect(JSON.stringify(searched)).toContain('linked-outside/secret.txt');

    const written = await getTool(tools, 'Write').execute({
      file_path: 'linked-outside/secret.txt',
      content: 'must remain outside',
    });
    expect(written).toMatchObject({
      success: false,
      error: expect.stringContaining('content-unauthorized'),
    });
    expect(JSON.stringify({ read, listed, searched, written })).not.toContain(outsideRoot);
    expect(await fs.readFile(path.join(outsideRoot, 'secret.txt'), 'utf8')).toBe('outside\n');
  });

  it('reports a broken linked directory locally and keeps sibling listing available', async () => {
    await fs.symlink(
      path.join(fixtureRoot, 'missing-directory'),
      path.join(workspaceRoot, 'broken-link'),
      'dir',
    );
    const list = getTool(createCoreTools({ defaultCwd: workspaceRoot }), 'ListDirectory');

    await expect(list.execute({ path: 'broken-link' })).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('Directory not found'),
    });
    await expect(list.execute({ path: 'src' })).resolves.toMatchObject({ success: true });
  });

  it('returns portable locators for Workspace writes without exposing the absolute root', async () => {
    const write = getTool(createCoreTools({ defaultCwd: workspaceRoot }), 'Write');

    const result = await write.execute({ file_path: 'docs/output.md', content: '# Output\n' });

    expect(result).toMatchObject({
      success: true,
      data: expect.objectContaining({
        contentLocator: { file: { authority: 'workspace' as const, path: 'docs/output.md' } },
      }),
    });
    expect(JSON.stringify(result)).not.toContain(workspaceRoot);
  });

  it.each([
    ['docs/authoring.md', '# Markdown\n'],
    ['scripts/authoring.fountain', '.INT. ROOM - DAY\n'],
    ['notes/authoring.txt', 'Plain text\n'],
  ])(
    'creates %s through the same native Workspace Write contract',
    async (relativePath, content) => {
      const write = getTool(createCoreTools({ defaultCwd: workspaceRoot }), 'Write');

      const result = await write.execute({ file_path: relativePath, content });

      expect(result).toMatchObject({
        success: true,
        data: {
          contentLocator: { file: { authority: 'workspace' as const, path: relativePath } },
          operation: 'create',
          byteLength: new TextEncoder().encode(content).byteLength,
          fingerprint: expect.objectContaining({ strategy: 'mtime-size' }),
        },
      });
      expect(await fs.readFile(path.join(workspaceRoot, relativePath), 'utf8')).toBe(content);
    },
  );

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
    const observed = await read.execute({ file_path: 'plan.md' });
    const freshness = requireFingerprint(observed);
    await expect(
      write.execute({
        file_path: 'plan.md',
        content: '# Existing plan\n- in_progress: review source\n',
        expected_fingerprint: freshness,
      }),
    ).resolves.toMatchObject({
      success: true,
      data: {
        contentLocator: { file: { authority: 'workspace' as const, path: 'plan.md' } },
        operation: 'replace',
        byteLength: expect.any(Number),
        fingerprint: expect.objectContaining({ strategy: 'mtime-size' }),
      },
    });

    expect(await fs.readFile(briefPath, 'utf-8')).toContain('Keep this decision');
    expect(await fs.readFile(planPath, 'utf-8')).toContain('in_progress');
  });

  it('creates nested content atomically and rejects stale replacement without partial bytes', async () => {
    const tools = createCoreTools({ defaultCwd: workspaceRoot });
    const read = getTool(tools, 'Read');
    const write = getTool(tools, 'Write');

    await expect(
      write.execute({ file_path: 'drafts/scene.fountain', content: '.INT. ROOM - DAY\n' }),
    ).resolves.toMatchObject({
      success: true,
      data: {
        contentLocator: {
          file: { authority: 'workspace' as const, path: 'drafts/scene.fountain' },
        },
        operation: 'create',
        fingerprint: expect.objectContaining({ strategy: 'mtime-size' }),
      },
    });
    expect(await fs.readFile(path.join(workspaceRoot, 'drafts/scene.fountain'), 'utf-8')).toBe(
      '.INT. ROOM - DAY\n',
    );

    const observed = await read.execute({ file_path: 'src/story.txt' });
    const staleFreshness = requireFingerprint(observed);
    await fs.writeFile(
      path.join(workspaceRoot, 'src/story.txt'),
      'changed outside Agent\n',
      'utf-8',
    );
    const rejected = await write.execute({
      file_path: 'src/story.txt',
      content: 'stale replacement\n',
      expected_fingerprint: staleFreshness,
    });
    expect(rejected).toMatchObject({
      success: false,
      error: expect.stringContaining('content-changed'),
    });
    expect(await fs.readFile(path.join(workspaceRoot, 'src/story.txt'), 'utf-8')).toBe(
      'changed outside Agent\n',
    );
  });

  it('denies protected project bytes across Read, Write and Grep but lists exact metadata', async () => {
    const tools = createCoreTools({ defaultCwd: workspaceRoot });

    await expect(getTool(tools, 'Read').execute({ file_path: 'story.nkc' })).resolves.toMatchObject(
      {
        success: false,
        error: expect.stringContaining('canvas domain capability'),
      },
    );
    await expect(
      getTool(tools, 'Write').execute({ file_path: 'edit.otio', content: 'raw overwrite' }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('cut domain capability'),
    });
    const searched = await getTool(tools, 'Grep').execute({ pattern: 'RAW_SECRET', path: '.' });
    expect(searched).toMatchObject({ success: true });
    expect(JSON.stringify(searched.data)).not.toContain('RAW_SECRET');

    const listed = await getTool(tools, 'ListDirectory').execute({ path: '.' });
    expect(listed).toMatchObject({ success: true });
    expect(JSON.stringify(listed.data)).toContain('story.nkc');
    expect(JSON.stringify(listed.data)).toContain('edit.otio');
  });

  it('rejects absolute outside-authority paths across Read, Write, ListDirectory and Grep', async () => {
    const tools = createCoreTools({ defaultCwd: workspaceRoot });
    const outsideFile = path.join(outsideRoot, 'secret.txt');
    const outsideDir = outsideRoot;

    const read = await getTool(tools, 'Read').execute({ file_path: outsideFile });
    expect(read).toMatchObject({
      success: false,
      error: expect.stringContaining('outside authorized'),
    });
    expect(JSON.stringify(read)).not.toContain(workspaceRoot);
    expect(JSON.stringify(read)).not.toContain(outsideRoot);

    const listed = await getTool(tools, 'ListDirectory').execute({ path: outsideDir });
    expect(listed).toMatchObject({
      success: false,
      error: expect.stringContaining('outside authorized'),
    });
    expect(JSON.stringify(listed)).not.toContain(workspaceRoot);
    expect(JSON.stringify(listed)).not.toContain(outsideRoot);

    const searched = await getTool(tools, 'Grep').execute({ pattern: 'outside', path: outsideDir });
    expect(searched).toMatchObject({
      success: false,
      error: expect.stringContaining('outside authorized'),
    });
    expect(JSON.stringify(searched)).not.toContain(workspaceRoot);
    expect(JSON.stringify(searched)).not.toContain(outsideRoot);

    const written = await getTool(tools, 'Write').execute({
      file_path: path.join(outsideRoot, 'new.txt'),
      content: 'nope',
    });
    expect(written).toMatchObject({
      success: false,
      error: expect.stringContaining('outside authorized'),
    });
    expect(JSON.stringify(written)).not.toContain(workspaceRoot);
    expect(JSON.stringify(written)).not.toContain(outsideRoot);
  });

  it('rejects traversal paths before resolution without exposing host roots', async () => {
    const tools = createCoreTools({ defaultCwd: workspaceRoot });

    const read = await getTool(tools, 'Read').execute({ file_path: '../outside/secret.txt' });
    expect(read).toMatchObject({
      success: false,
      error: expect.stringContaining('normalized Workspace-relative path'),
    });
    expect(JSON.stringify(read)).not.toContain(workspaceRoot);
    expect(JSON.stringify(read)).not.toContain(outsideRoot);

    const listed = await getTool(tools, 'ListDirectory').execute({ path: '../outside' });
    expect(listed).toMatchObject({
      success: false,
      error: expect.stringContaining('normalized Workspace-relative path'),
    });
    expect(JSON.stringify(listed)).not.toContain(workspaceRoot);
    expect(JSON.stringify(listed)).not.toContain(outsideRoot);
  });

  it('blocks generic file tools from managed workspace runtime and cache directories', async () => {
    const tools = createCoreTools({ defaultCwd: workspaceRoot });

    await expect(
      getTool(tools, 'Read').execute({ file_path: '.runtime/cache/resources/page.txt' }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('managed workspace runtime or cache directory'),
    });
    await expect(
      getTool(tools, 'ListDirectory').execute({ path: '.runtime/logs' }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('managed workspace runtime or cache directory'),
    });
    await expect(
      getTool(tools, 'Grep').execute({ pattern: 'cache', path: '.runtime/cache' }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('managed workspace runtime or cache directory'),
    });
    await expect(
      getTool(tools, 'Write').execute({ file_path: '.runtime/logs/new.jsonl', content: '{}\n' }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('managed workspace runtime or cache directory'),
    });
    await expect(
      getTool(tools, 'Read').execute({ file_path: '.runtime/tmp/scratch.txt' }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('managed workspace runtime or cache directory'),
    });
    await expect(
      getTool(tools, 'Read').execute({ file_path: '.runtime/entities/store.json' }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('managed workspace runtime or cache directory'),
    });
    await expect(
      getTool(tools, 'Read').execute({ file_path: '.runtime/search/index.json' }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('managed workspace runtime or cache directory'),
    });
  });

  it('lists one structured level and does not reveal managed cache entries', async () => {
    const tools = createCoreTools({ defaultCwd: workspaceRoot });

    const listing = await getTool(tools, 'ListDirectory').execute({ path: '.' });
    expect(listing).toMatchObject({
      success: true,
      data: expect.objectContaining({
        directoryPath: '.',
        entries: expect.arrayContaining([
          expect.objectContaining({
            name: 'src',
            type: 'directory',
            contentLocator: { file: { authority: 'workspace' as const, path: 'src' } },
          }),
        ]),
      }),
    });
    const nested = await getTool(tools, 'ListDirectory').execute({ path: 'src' });
    expect(nested).toMatchObject({
      success: true,
      data: expect.objectContaining({
        directoryPath: 'src',
        entries: [
          expect.objectContaining({
            name: 'story.txt',
            type: 'file',
            contentLocator: { file: { authority: 'workspace' as const, path: 'src/story.txt' } },
          }),
        ],
      }),
    });
    expect(JSON.stringify(listing.data)).not.toContain('.runtime/cache');
    expect(JSON.stringify(listing.data)).not.toContain('page.txt');

    await expect(
      getTool(tools, 'ListDirectory').execute({ path: '.', recursive: true }),
    ).resolves.toMatchObject({ success: false, error: expect.stringContaining('Invalid') });

    const grep = await getTool(tools, 'Grep').execute({
      pattern: 'cache',
      path: '.',
    });
    expect(grep.success).toBe(true);
    expect(JSON.stringify(grep.data)).not.toContain('.runtime/cache');
    expect(JSON.stringify(grep.data)).not.toContain('page.txt');
  });

  it('returns Workspace-relative Grep match paths and never echoes the absolute root', async () => {
    const grep = getTool(createCoreTools({ defaultCwd: workspaceRoot }), 'Grep');

    const found = await grep.execute({ pattern: 'hello', path: '.' });
    expect(found).toMatchObject({ success: true });
    expect(JSON.stringify(found)).toContain('src/story.txt');
    expect(JSON.stringify(found)).not.toContain(workspaceRoot);

    const foundAbsolute = await grep.execute({ pattern: 'hello', path: workspaceRoot });
    expect(foundAbsolute).toMatchObject({ success: true });
    expect(JSON.stringify(foundAbsolute)).toContain('src/story.txt');
    expect(JSON.stringify(foundAbsolute)).not.toContain(workspaceRoot);

    const missing = await grep.execute({ pattern: 'hello', path: 'missing-dir' });
    expect(missing).toMatchObject({
      success: false,
      error: expect.stringContaining('Path not found'),
    });
    expect(JSON.stringify(missing)).not.toContain(workspaceRoot);
  });

  it('lists an authorized absolute Workspace directory with canonical entries', async () => {
    const list = getTool(createCoreTools({ defaultCwd: workspaceRoot }), 'ListDirectory');

    const result = await list.execute({ path: workspaceRoot });
    expect(result).toMatchObject({
      success: true,
      data: expect.objectContaining({
        directoryPath: '.',
        entries: expect.arrayContaining([
          expect.objectContaining({
            name: 'src',
            type: 'directory',
            contentLocator: { file: { authority: 'workspace' as const, path: 'src' } },
          }),
        ]),
      }),
    });
    expect(JSON.stringify(result)).not.toContain(workspaceRoot);
  });

  it('writes through an authorized absolute Workspace target with a canonical locator', async () => {
    const write = getTool(createCoreTools({ defaultCwd: workspaceRoot }), 'Write');
    const absoluteTarget = path.join(workspaceRoot, 'docs', 'absolute.md');

    const result = await write.execute({
      file_path: absoluteTarget,
      content: '# Absolute\n',
    });
    expect(result).toMatchObject({
      success: true,
      data: {
        contentLocator: { file: { authority: 'workspace' as const, path: 'docs/absolute.md' } },
        operation: 'create',
      },
    });
    expect(JSON.stringify(result)).not.toContain(workspaceRoot);
    expect(await fs.readFile(absoluteTarget, 'utf8')).toBe('# Absolute\n');
  });

  it('paginates a stable single-level directory without returning physical paths', async () => {
    const directory = path.join(workspaceRoot, 'many');
    await fs.mkdir(directory);
    await Promise.all(
      Array.from({ length: 82 }, (_, index) =>
        fs.writeFile(path.join(directory, `entry-${String(index).padStart(3, '0')}.txt`), 'x\n'),
      ),
    );
    const list = getTool(createCoreTools({ defaultCwd: workspaceRoot }), 'ListDirectory');
    const first = await list.execute({ path: 'many' });
    expect(first).toMatchObject({
      success: true,
      data: expect.objectContaining({
        directoryPath: 'many',
        totalEntries: 82,
        truncated: true,
        nextCursor: { directoryPath: 'many', after: 'entry-079.txt' },
      }),
    });
    const firstData = requireData(first);
    expect(firstData['entries']).toHaveLength(80);
    expect(JSON.stringify(first)).not.toContain(workspaceRoot);

    await expect(list.execute({ path: 'many', after: 'entry-079.txt' })).resolves.toMatchObject({
      success: true,
      data: expect.objectContaining({
        entries: [
          expect.objectContaining({ name: 'entry-080.txt' }),
          expect.objectContaining({ name: 'entry-081.txt' }),
        ],
        truncated: false,
      }),
    });
  });

  it('lists directory paths that cross a symlink without leaking the target path', async () => {
    await fs.symlink(outsideRoot, path.join(workspaceRoot, 'linked-outside'), 'dir');
    await fs.writeFile(path.join(outsideRoot, 'secret.txt'), 'linked secret\n');
    const list = getTool(createCoreTools({ defaultCwd: workspaceRoot }), 'ListDirectory');

    await expect(list.execute({ path: 'linked-outside' })).resolves.toMatchObject({
      success: true,
      data: expect.objectContaining({
        directoryPath: 'linked-outside',
        entries: [expect.objectContaining({ name: 'secret.txt', type: 'file' })],
      }),
    });
    const root = await list.execute({ path: '.' });
    expect(root).toMatchObject({ success: true });
    expect(JSON.stringify(root)).not.toContain(outsideRoot);
  });

  it('keeps Read on bounded strict UTF-8 text and rejects known non-text classes', async () => {
    await fs.writeFile(
      path.join(workspaceRoot, 'book.epub'),
      new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
    );
    await fs.writeFile(
      path.join(workspaceRoot, 'cover.png'),
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    );
    await fs.writeFile(path.join(workspaceRoot, 'unknown.dat'), new Uint8Array([0xff, 0xfe]));
    await fs.writeFile(path.join(workspaceRoot, 'nul.custom'), 'before\u0000after');
    const read = getTool(createCoreTools({ defaultCwd: workspaceRoot }), 'Read');

    await expect(read.execute({ file_path: 'book.epub' })).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('document'),
    });
    await expect(read.execute({ file_path: 'cover.png' })).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('image'),
    });
    await expect(read.execute({ file_path: 'unknown.dat' })).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('not valid UTF-8'),
    });
    await expect(read.execute({ file_path: 'nul.custom' })).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('NUL'),
    });
  });

  it('rejects text files beyond the Read byte budget before returning content', async () => {
    await fs.writeFile(
      path.join(workspaceRoot, 'large.txt'),
      Buffer.alloc(4 * 1024 * 1024 + 1, 0x61),
    );
    const read = getTool(createCoreTools({ defaultCwd: workspaceRoot }), 'Read');

    await expect(read.execute({ file_path: 'large.txt' })).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('4 MiB'),
    });
  });

  it('sends memory proposals to the owning domain without committing a fact', async () => {
    const proposeProjectMemoryMutation = vi.fn(async () => ({ proposalId: 'proposal-1' }));
    const memoryWrite = getTool(
      createCoreTools({
        defaultCwd: workspaceRoot,
        projectMemoryProposalSink: { proposeProjectMemoryMutation },
      }),
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
        proposalId: 'proposal-1',
        proposal: {
          kind: 'project-memory-mutation',
          action: 'upsert',
          key: 'Recent Decisions',
          content: '- Keep host adapters at composition roots.',
        },
      },
    });
    expect(proposeProjectMemoryMutation).toHaveBeenCalledOnce();
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

function requireFingerprint(result: Awaited<ReturnType<Tool['execute']>>): unknown {
  if (!result.success || !isRecord(result.data))
    throw new Error('Expected a successful file read.');
  const fingerprint = result.data['fingerprint'];
  if (!isRecord(fingerprint)) throw new Error('Expected file freshness evidence.');
  return fingerprint;
}

function requireData(result: Awaited<ReturnType<Tool['execute']>>): Record<string, unknown> {
  if (!result.success || !isRecord(result.data)) throw new Error('Expected Tool result data.');
  return result.data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
