#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

export const SUPPORTED_DESKTOP_TARGETS = Object.freeze(['darwin-arm64']);

export function resolveSupportedDesktopTarget(platform = process.platform, arch = process.arch) {
  const target = `${platform}-${arch}`;
  if (SUPPORTED_DESKTOP_TARGETS.includes(target)) return target;
  throw new Error(
    `Unsupported OpenNeko Desktop build host: ${target}. Supported targets: ${SUPPORTED_DESKTOP_TARGETS.join(', ')}.`,
  );
}

function main() {
  const target = resolveSupportedDesktopTarget();
  process.stdout.write(`OpenNeko Desktop build host: ${target}.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
