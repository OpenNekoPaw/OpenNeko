#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const allowedArtifact =
  /^[^/]+\/(?:\.openspec\.yaml|proposal\.md|design\.md|tasks\.md|specs\/[^/]+\/spec\.md)$/u;

export function inspectOpenSpecPolicy(root) {
  const findings = [];
  const changesRoot = join(root, 'openspec/changes');
  for (const entry of readdirSync(changesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'archive') {
      findings.push({
        path: 'openspec/changes/archive',
        reason: 'Completed proposal archives must not be retained.',
      });
      continue;
    }
    for (const file of collectFiles(join(changesRoot, entry.name))) {
      const path = relative(changesRoot, file).replaceAll('\\', '/');
      if (!allowedArtifact.test(path)) {
        findings.push({
          path,
          reason:
            'Active changes contain only product proposals, designs, milestones, and specifications.',
        });
      }
      if (path.endsWith('/tasks.md')) {
        const tasks = readFileSync(file, 'utf8').match(/^- \[[ xX]\] .+$/gmu) ?? [];
        if (tasks.length > 0 && tasks.every((task) => /^- \[[xX]\]/u.test(task))) {
          findings.push({
            path,
            reason: 'Completed proposals must be removed from the active area.',
          });
        }
      }
    }
  }
  for (const path of ['docs/research', 'docs/status']) {
    if (existsSync(join(root, path))) {
      findings.push({
        path,
        reason: 'One-off research and status reports are not repository documentation.',
      });
    }
  }
  return findings;
}

function collectFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? collectFiles(path) : [path];
  });
}

function main() {
  const command = process.platform === 'win32' ? 'openspec.cmd' : 'openspec';
  const result = spawnSync(command, ['validate', '--all', '--strict', '--no-interactive'], {
    stdio: 'inherit',
    env: { ...process.env, OPENSPEC_CONCURRENCY: process.env.OPENSPEC_CONCURRENCY ?? '2' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    return;
  }
  const findings = inspectOpenSpecPolicy(process.cwd());
  process.stdout.write(
    `${JSON.stringify({ status: findings.length === 0 ? 'passed' : 'failed', findings }, null, 2)}\n`,
  );
  process.exitCode = findings.length === 0 ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
