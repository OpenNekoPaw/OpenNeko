#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runDesktopForgeBuild } from './run-development.mjs';

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [forgeCommand, ...argv] = process.argv.slice(2);
  try {
    process.exitCode = await runDesktopForgeBuild({ forgeCommand, argv });
  } catch (error) {
    process.stderr.write(
      `Desktop Forge build failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
