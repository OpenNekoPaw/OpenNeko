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

process.exit(result.status ?? 1);
