import { execFile } from 'node:child_process';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  assertWorkspaceLinkedMediaLibraryName,
  workspaceLinkedMediaLibraryPath,
} from '@neko-assets/domain/contracts';

export async function ensureWorkspaceLinkedMediaLibraryGitExclude(options: {
  readonly workDir: string;
  readonly libraryName: string;
}): Promise<void> {
  assertWorkspaceLinkedMediaLibraryName(options.libraryName);
  const relativePath = workspaceLinkedMediaLibraryPath(options.libraryName);
  const exactRule = `/${relativePath}`;
  const excludePath = await resolveGitExcludePath(options.workDir);
  if (!excludePath) return;
  const existing = await readFileIfExists(excludePath);
  if (existing.split(/\r?\n/u).includes(exactRule)) return;
  await mkdir(dirname(excludePath), { recursive: true });
  const separator = existing.length === 0 ? '' : existing.endsWith('\n') ? '' : '\n';
  await appendFile(excludePath, `${separator}${exactRule}\n`, 'utf8');
  const match = await checkIgnore(options.workDir, relativePath);
  if (!match.ignored || match.matchedRule !== exactRule) {
    throw new Error('Git did not apply the exact workspace media library exclude rule.');
  }
}

async function resolveGitExcludePath(workDir: string): Promise<string | undefined> {
  const gitDir = await executeGit(workDir, ['rev-parse', '--git-dir']);
  if (!gitDir.ok) return undefined;
  const raw = gitDir.stdout.trim();
  return raw ? join(workDir, raw, 'info', 'exclude') : undefined;
}

async function readFileIfExists(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return '';
    throw error;
  }
}

async function checkIgnore(
  workDir: string,
  relativePath: string,
): Promise<{ readonly ignored: boolean; readonly matchedRule: string | null }> {
  const result = await executeGit(workDir, [
    'check-ignore',
    '--no-index',
    '--verbose',
    '--',
    relativePath,
  ]);
  if (!result.ok) return { ignored: false, matchedRule: null };
  const match = /^.+?:\d+:(.*)\t[^\n]+\n?$/u.exec(result.stdout);
  const matchedRule = match?.[1]?.trim();
  if (!matchedRule) {
    throw new Error(`Git returned an invalid check-ignore result for ${relativePath}.`);
  }
  return { ignored: true, matchedRule };
}

function executeGit(
  workDir: string,
  args: readonly string[],
): Promise<{ readonly ok: boolean; readonly stdout: string }> {
  return new Promise((resolve, reject) => {
    execFile('git', ['-C', workDir, ...args], { encoding: 'utf8' }, (error, stdout, stderr) => {
      if (!error) return resolve({ ok: true, stdout });
      if (error.code === 1 || error.code === 128) return resolve({ ok: false, stdout: '' });
      reject(new Error(stderr || error.message));
    });
  });
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
