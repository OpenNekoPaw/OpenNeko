#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

const RELEASE_TAG = /^v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/u;

export function assertMacOSReleaseMetadata({ tag }) {
  const match = typeof tag === 'string' ? RELEASE_TAG.exec(tag) : null;
  if (!match) {
    throw new Error(`OpenNeko macOS release tag is invalid: ${String(tag)}.`);
  }
  const version = match[1];
  return Object.freeze({ tag, version });
}

function readArgument(name) {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (!value) throw new Error(`Missing required argument ${name}.`);
  return value;
}

function main() {
  const result = assertMacOSReleaseMetadata({
    tag: readArgument('--tag'),
  });
  process.stdout.write(
    `OpenNeko macOS release metadata verified for ${result.tag} (${result.version}).\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
