import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolExecuteOptions } from '@neko/shared';
import { BashTool } from '../bash-tool';
import type { CoreFileAccessPolicy } from '../file-access-policy';
import { GrepTool } from '../grep-tool';
import { ListDirectoryTool } from '../list-directory-tool';
import { MemoryWriteTool } from '../memory-write-tool';
import { ReadTool } from '../read-tool';
import { WriteTool } from '../write-tool';

const EN_OPTIONS: ToolExecuteOptions = { metadata: { locale: 'en' } };
const ZH_CN_OPTIONS: ToolExecuteOptions = { metadata: { locale: 'zh-cn' } };

describe('core tool prompt-locale projection', () => {
  const fixtureRoot = path.resolve(
    process.cwd(),
    '.test-workspaces',
    `core-tool-localization-${process.pid}`,
  );

  beforeEach(async () => {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
    await fs.mkdir(fixtureRoot, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  });

  it('localizes Neko-owned invalid-input wrappers without invoking canonical operations', async () => {
    const authorize = vi.fn();
    const policy: CoreFileAccessPolicy = { authorize };

    await expect(
      new ReadTool({ fileAccessPolicy: policy }).execute({}, EN_OPTIONS),
    ).resolves.toEqual({
      success: false,
      error: 'Invalid Read arguments.',
    });
    await expect(
      new WriteTool({ fileAccessPolicy: policy }).execute({}, ZH_CN_OPTIONS),
    ).resolves.toEqual({
      success: false,
      error: 'Write 参数无效。',
    });
    await expect(
      new ListDirectoryTool({ fileAccessPolicy: policy }).execute({}, ZH_CN_OPTIONS),
    ).resolves.toEqual({
      success: false,
      error: 'ListDirectory 参数无效。',
    });
    await expect(new BashTool().execute({}, ZH_CN_OPTIONS)).resolves.toEqual({
      success: false,
      error: 'Bash 参数无效。',
    });
    expect(authorize).not.toHaveBeenCalled();
  });

  it('projects semantic access denial and never exposes obsolete policy prose', async () => {
    const legacyDecision = {
      allowed: false as const,
      path: '/external/原文.txt',
      reason: 'outside-authorized-roots' as const,
      message: 'POISON LEGACY PROSE',
    };
    const policy: CoreFileAccessPolicy = {
      authorize: vi.fn(() => legacyDecision),
    };
    const read = new ReadTool({ fileAccessPolicy: policy });

    await expect(read.execute({ file_path: '/external/原文.txt' }, EN_OPTIONS)).resolves.toEqual({
      success: false,
      error: 'Path is outside authorized read roots: /external/原文.txt',
    });
    await expect(read.execute({ file_path: '/external/原文.txt' }, ZH_CN_OPTIONS)).resolves.toEqual(
      {
        success: false,
        error: '路径不在读取授权根目录内：/external/原文.txt',
      },
    );
  });

  it('keeps regex, paths, and child-process output byte-stable inside localized results', async () => {
    const pattern = '[provider 原文: E42';
    const grep = new GrepTool({ defaultCwd: fixtureRoot });

    await expect(grep.execute({ pattern, path: '.' }, EN_OPTIONS)).resolves.toEqual({
      success: false,
      error: `Invalid regex pattern: ${pattern}`,
    });
    await expect(grep.execute({ pattern, path: '.' }, ZH_CN_OPTIONS)).resolves.toEqual({
      success: false,
      error: `正则表达式无效：${pattern}`,
    });

    const bash = new BashTool({ defaultCwd: fixtureRoot });
    const command = "printf 'provider 原文: E42'";
    const enResult = await bash.execute({ command }, EN_OPTIONS);
    const zhResult = await bash.execute({ command }, ZH_CN_OPTIONS);
    expect(enResult).toMatchObject({ success: true, data: { stdout: 'provider 原文: E42' } });
    expect(zhResult).toMatchObject({ success: true, data: { stdout: 'provider 原文: E42' } });
  });

  it('localizes file shape failures while preserving the original path', async () => {
    const policy: CoreFileAccessPolicy = {
      authorize: (filePath) => ({ allowed: true, path: filePath }),
    };
    const missingPath = path.join(fixtureRoot, '不存在');

    await expect(
      new ListDirectoryTool({ fileAccessPolicy: policy }).execute(
        { path: missingPath },
        ZH_CN_OPTIONS,
      ),
    ).resolves.toEqual({
      success: false,
      error: `未找到目录：${missingPath}`,
    });
    await expect(
      new ReadTool({ fileAccessPolicy: policy }).execute({ file_path: fixtureRoot }, ZH_CN_OPTIONS),
    ).resolves.toEqual({
      success: false,
      error: `路径是目录而不是文件：${fixtureRoot}`,
    });
  });

  it('returns semantic project-memory success data and localizes external failure wrappers', async () => {
    const legacySinkResult = {
      proposalId: 'proposal-原文',
      message: 'POISON LEGACY PROSE',
    };
    const successTool = new MemoryWriteTool({
      proposalSink: {
        proposeProjectMemoryMutation: vi.fn(async () => legacySinkResult),
      },
    });
    const success = await successTool.execute(
      { action: 'remove', key: '原文 section' },
      ZH_CN_OPTIONS,
    );

    expect(success).toEqual({
      success: true,
      data: {
        proposal: {
          kind: 'project-memory-mutation',
          action: 'remove',
          key: '原文 section',
        },
        committed: false,
        proposalId: 'proposal-原文',
      },
    });
    expect(JSON.stringify(success)).not.toContain('POISON LEGACY PROSE');

    const failureTool = new MemoryWriteTool({
      proposalSink: {
        proposeProjectMemoryMutation: vi.fn(async () => {
          throw new Error('provider 原文: E42');
        }),
      },
    });
    await expect(
      failureTool.execute(
        { action: 'upsert', key: '原文 section', content: '原文 content' },
        EN_OPTIONS,
      ),
    ).resolves.toEqual({
      success: false,
      error: 'Failed to propose project memory update: provider 原文: E42',
    });
    await expect(
      failureTool.execute(
        { action: 'upsert', key: '原文 section', content: '原文 content' },
        ZH_CN_OPTIONS,
      ),
    ).resolves.toEqual({
      success: false,
      error: '提交项目记忆更新提案失败：provider 原文: E42',
    });
  });
});
