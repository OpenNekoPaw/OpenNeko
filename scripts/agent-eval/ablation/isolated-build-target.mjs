import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { validateIsolatedBuildTarget } from '../schemas/ablation-contracts.mjs';

const OUTPUT_LIMIT = 64 * 1024;

export async function prepareIsolatedBuildTarget(targetInput, options = {}) {
  const target = validateIsolatedBuildTarget(targetInput);
  const repositoryRoot = resolve(options.repositoryRoot ?? process.cwd());
  const workspaceParent = resolve(options.workspaceParent ?? os.tmpdir());
  await fs.mkdir(workspaceParent, { recursive: true });
  const runRoot = await fs.mkdtemp(join(workspaceParent, 'neko-agent-eval-build-'));
  const worktree = resolve(runRoot, 'worktree');
  const runCommand = options.runCommand ?? runProcess;
  let worktreeRegistered = false;
  let cleaned = false;

  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    const diagnostics = [];
    if (worktreeRegistered) {
      const removal = await runCommand('git', ['worktree', 'remove', '--force', worktree], {
        cwd: repositoryRoot,
        timeoutMs: options.cleanupTimeoutMs ?? 60_000,
        allowFailure: true,
      });
      if (removal.code !== 0) diagnostics.push(`git worktree remove exited ${removal.code}`);
    }
    await fs.rm(runRoot, { recursive: true, force: true });
    const prune = await runCommand('git', ['worktree', 'prune'], {
      cwd: repositoryRoot,
      timeoutMs: options.cleanupTimeoutMs ?? 60_000,
      allowFailure: true,
    });
    if (prune.code !== 0) diagnostics.push(`git worktree prune exited ${prune.code}`);
    if (diagnostics.length > 0) {
      throw Object.assign(
        new Error(`isolated worktree cleanup failed: ${diagnostics.join('; ')}`),
        {
          code: 'implementation-cleanup-failed',
        },
      );
    }
  };

  try {
    const revision = (
      await runCommand('git', ['rev-parse', '--verify', `${target.sourceRevision}^{commit}`], {
        cwd: repositoryRoot,
        timeoutMs: 30_000,
      })
    ).stdout.trim();
    if (fingerprintGitRevision(revision) !== target.sourceFingerprint) {
      throw buildError('isolated source revision fingerprint does not match the plan');
    }
    if (fingerprintBuildRecipe(target) !== target.buildRecipeFingerprint) {
      throw buildError('isolated build recipe fingerprint does not match the plan');
    }
    await runCommand('git', ['worktree', 'add', '--detach', worktree, revision], {
      cwd: repositoryRoot,
      timeoutMs: options.worktreeTimeoutMs ?? 120_000,
    });
    worktreeRegistered = true;

    if (target.patchFile) {
      const patchFile = resolveContained(repositoryRoot, target.patchFile, 'patch file');
      if ((await hashFile(patchFile)) !== target.patchFingerprint) {
        throw buildError('isolated patch fingerprint does not match the plan');
      }
      await runCommand('git', ['apply', '--check', patchFile], {
        cwd: worktree,
        timeoutMs: 30_000,
      });
      await runCommand('git', ['apply', patchFile], {
        cwd: worktree,
        timeoutMs: 30_000,
      });
    }

    for (const command of target.buildCommands) {
      await runCommand(command.command, command.args, {
        cwd: worktree,
        timeoutMs: command.timeoutMs,
        env: options.env,
      });
    }

    const executablePath = resolveContained(worktree, target.executablePath, 'built executable');
    const executableStat = await fs.stat(executablePath).catch((error) => {
      throw buildError(
        `isolated build did not produce ${target.executablePath}: ${formatError(error)}`,
      );
    });
    if (!executableStat.isFile()) {
      throw buildError(`isolated build output is not a file: ${target.executablePath}`);
    }
    const executableFingerprint = await hashFile(executablePath);
    const launch = {
      command: target.launchCommand.command,
      args: target.launchCommand.args.map((arg) => (arg === '{executable}' ? executablePath : arg)),
    };
    return {
      workspace: worktree,
      revision,
      sourceFingerprint: target.sourceFingerprint,
      buildRecipeFingerprint: target.buildRecipeFingerprint,
      executablePath,
      executableFingerprint,
      launch,
      cleanup,
    };
  } catch (error) {
    try {
      await cleanup();
    } catch (cleanupError) {
      throw Object.assign(new Error(`${formatError(error)}; ${formatError(cleanupError)}`), {
        code: 'implementation-cleanup-failed',
        cause: error,
      });
    }
    throw error;
  }
}

export function fingerprintGitRevision(revision) {
  return hashText(`git-revision:${revision}`);
}

export function fingerprintBuildRecipe(target) {
  return hashJson({
    buildCommands: target.buildCommands,
    executablePath: target.executablePath,
    launchCommand: target.launchCommand,
    ...(target.patchFingerprint ? { patchFingerprint: target.patchFingerprint } : {}),
  });
}

export async function hashFile(file) {
  return `sha256:${createHash('sha256')
    .update(await fs.readFile(file))
    .digest('hex')}`;
}

async function runProcess(command, args, options) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, options.timeoutMs);
    child.stdout.on('data', (chunk) => {
      stdout = appendBounded(stdout, chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr = appendBounded(stderr, chunk);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      rejectPromise(buildError(`failed to start ${command}: ${formatError(error)}`));
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const result = { code: code ?? -1, signal, stdout, stderr };
      if (timedOut) {
        rejectPromise(buildError(`${command} timed out after ${options.timeoutMs}ms`));
        return;
      }
      if (code !== 0 && !options.allowFailure) {
        rejectPromise(
          buildError(
            `${command} failed with exit code ${code ?? 'unknown'}: ${stderr.trim() || stdout.trim() || signal || 'no diagnostic'}`,
          ),
        );
        return;
      }
      resolvePromise(result);
    });
  });
}

function appendBounded(current, chunk) {
  const next = `${current}${String(chunk)}`;
  return next.length <= OUTPUT_LIMIT ? next : next.slice(next.length - OUTPUT_LIMIT);
}

function resolveContained(root, path, label) {
  const target = resolve(root, path);
  const relation = relative(root, target);
  if (relation === '..' || relation.startsWith(`..${sep}`) || relation.startsWith(sep)) {
    throw buildError(`${label} escapes its owning root`);
  }
  return target;
}

function hashJson(value) {
  return hashText(stableStringify(value));
}

function hashText(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function buildError(message) {
  return Object.assign(new Error(message), { code: 'implementation-build-failed' });
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
