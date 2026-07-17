import { execFile } from 'node:child_process';
import { appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  WorkspaceGitHygieneDiagnostic,
  WorkspaceGitHygieneReport,
  WorkspaceGitIgnoreMatch,
} from '../types/storage';

const WORKSPACE_LOCAL_PROBE = '.neko/.neko-hygiene-probe';
const PROJECT_FACT_PROBE = 'neko/.neko-project-fact-probe';
const NEKO_GITIGNORE_BLOCK = '# Neko workspace-local state and cache\n.neko/\n';

export interface EnsureWorkspaceGitHygieneOptions {
  readonly workDir: string;
  readonly updateGitignore: boolean;
}

export async function ensureWorkspaceGitHygiene(
  options: EnsureWorkspaceGitHygieneOptions,
): Promise<WorkspaceGitHygieneReport> {
  const gitignorePath = join(options.workDir, '.gitignore');
  let workspaceLocal = await checkIgnore(options.workDir, WORKSPACE_LOCAL_PROBE);
  const projectFacts = await checkIgnore(options.workDir, PROJECT_FACT_PROBE);
  let updated = false;

  if (!workspaceLocal.ignored && options.updateGitignore) {
    await appendNekoIgnoreBlock(gitignorePath);
    workspaceLocal = await checkIgnore(options.workDir, WORKSPACE_LOCAL_PROBE);
    if (!workspaceLocal.ignored) {
      throw new Error('Git did not apply the appended .neko/ workspace ignore rule.');
    }
    updated = true;
  }

  return {
    gitignorePath,
    updated,
    workspaceLocal,
    projectFacts,
    diagnostics: createDiagnostics(workspaceLocal, projectFacts),
  };
}

async function checkIgnore(
  workDir: string,
  relativePath: string,
): Promise<WorkspaceGitIgnoreMatch> {
  const result = await executeGitCheckIgnore(workDir, relativePath);
  if (!result.ignored) return { ignored: false, matchedRule: null };
  const match = /^.+?:\d+:(.*)\t[^\n]+\n?$/u.exec(result.output);
  const matchedRule = match?.[1];
  if (!matchedRule?.trim()) {
    throw new Error(`Git returned an invalid check-ignore result for ${relativePath}.`);
  }
  return { ignored: true, matchedRule };
}

function executeGitCheckIgnore(
  workDir: string,
  relativePath: string,
): Promise<{ readonly ignored: boolean; readonly output: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['-C', workDir, 'check-ignore', '--no-index', '--verbose', '--', relativePath],
      { encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ ignored: true, output: stdout });
          return;
        }
        if (error.code === 1) {
          resolve({ ignored: false, output: '' });
          return;
        }
        reject(
          new Error(
            `Workspace Git hygiene inspection failed for ${relativePath}: ${stderr.trim() || error.message}`,
          ),
        );
      },
    );
  });
}

async function appendNekoIgnoreBlock(gitignorePath: string): Promise<void> {
  const existing = await readFileIfExists(gitignorePath);
  const separator = existing.length === 0 ? '' : existing.endsWith('\n') ? '\n' : '\n\n';
  await appendFile(gitignorePath, `${separator}${NEKO_GITIGNORE_BLOCK}`, 'utf8');
}

async function readFileIfExists(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (isErrorWithCode(error) && error.code === 'ENOENT') return '';
    throw error;
  }
}

function createDiagnostics(
  workspaceLocal: WorkspaceGitIgnoreMatch,
  projectFacts: WorkspaceGitIgnoreMatch,
): readonly WorkspaceGitHygieneDiagnostic[] {
  const diagnostics: WorkspaceGitHygieneDiagnostic[] = [];
  if (!workspaceLocal.ignored) {
    diagnostics.push({
      code: 'workspace-local-not-gitignored',
      severity: 'warning',
      matchedRule: null,
      message: 'Workspace .neko/ local state and cache are not ignored by Git.',
    });
  }
  if (projectFacts.ignored) {
    diagnostics.push({
      code: 'project-facts-gitignored',
      severity: 'error',
      matchedRule: projectFacts.matchedRule,
      message: `Project facts under neko/ are hidden by Git rule ${projectFacts.matchedRule ?? '<unknown>'}.`,
    });
  }
  return diagnostics;
}

function isErrorWithCode(value: unknown): value is { readonly code: string } {
  return (
    typeof value === 'object' && value !== null && 'code' in value && typeof value.code === 'string'
  );
}
