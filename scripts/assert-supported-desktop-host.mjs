#!/usr/bin/env node

export const SUPPORTED_DESKTOP_TARGETS = Object.freeze(['darwin-arm64', 'win32-x64']);

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

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
