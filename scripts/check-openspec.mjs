#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const command = process.platform === 'win32' ? 'openspec.cmd' : 'openspec';
const args = ['validate', '--all', '--strict', '--no-interactive'];

console.log(`[quality] ${command} ${args.join(' ')}`);

const result = spawnSync(command, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    OPENSPEC_CONCURRENCY: process.env.OPENSPEC_CONCURRENCY ?? '2',
  },
});

if (result.error) {
  if (result.error.code === 'ENOENT') {
    console.error(
      [
        '[quality] OpenSpec CLI was not found.',
        'Run `pnpm install` so the workspace-provided @fission-ai/openspec binary is available.',
      ].join('\n'),
    );
  } else {
    console.error(`[quality] Failed to launch OpenSpec: ${result.error.message}`);
  }
  process.exit(1);
}

if ((result.status ?? 1) !== 0) {
  process.exit(result.status ?? 1);
}

const dispositionArgs = ['scripts/check-openspec-successor-dispositions.mjs'];
console.log(`[quality] ${process.execPath} ${dispositionArgs.join(' ')}`);
const dispositionResult = spawnSync(process.execPath, dispositionArgs, {
  stdio: 'inherit',
  env: process.env,
});

if (dispositionResult.error) {
  console.error(
    `[quality] Failed to audit OpenSpec successor dispositions: ${dispositionResult.error.message}`,
  );
  process.exit(1);
}

process.exit(dispositionResult.status ?? 1);
