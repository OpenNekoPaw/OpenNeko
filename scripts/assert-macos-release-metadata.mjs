#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;

export function assertMacOSReleaseMetadata({ tag, version }) {
  if (typeof version !== 'string' || !RELEASE_VERSION.test(version)) {
    throw new Error(`OpenNeko Desktop release version is invalid: ${String(version)}.`);
  }
  const expectedTag = `v${version}`;
  if (tag !== expectedTag) {
    throw new Error(`OpenNeko macOS release tag mismatch: expected ${expectedTag}, received ${tag}.`);
  }
  return Object.freeze({ tag, version });
}

export function readDesktopReleaseVersion(root = repositoryRoot) {
  const manifest = JSON.parse(
    readFileSync(resolve(root, 'apps/neko-desktop/package.json'), 'utf8'),
  );
  const version = manifest.version;
  if (typeof version !== 'string' || !RELEASE_VERSION.test(version)) {
    throw new Error(`OpenNeko Desktop release version is invalid: ${String(version)}.`);
  }
  return version;
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
    version: readDesktopReleaseVersion(),
  });
  process.stdout.write(`OpenNeko macOS release metadata verified for ${result.tag}.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
