#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

import { readPackageGroup } from './read-package-group.mjs';

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const prebuilds = [['--filter', '@neko/webview', 'run', 'build']];

const extensionPackages = readPackageGroup('packages.tsExtensions');

function run(args) {
  console.log(`\n$ pnpm ${args.join(' ')}`);
  const result = spawnSync(pnpm, args, {
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

for (const args of prebuilds) {
  run(args);
}

for (const packageName of extensionPackages) {
  run(['--dir', `packages/${packageName}`, 'run', 'compile']);
}
