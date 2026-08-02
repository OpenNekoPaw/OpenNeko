#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { assertMacOSReleaseMetadata } from './assert-macos-release-metadata.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function projectMacOSReleaseVersion({
  repositoryRoot: root = repositoryRoot,
  tag,
}) {
  const release = assertMacOSReleaseMetadata({ tag });
  const manifestPath = resolve(root, 'apps/neko-desktop/package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error(`OpenNeko Desktop manifest must be a JSON object: ${manifestPath}.`);
  }
  const previousVersion = manifest.version;
  manifest.version = release.version;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return Object.freeze({
    manifestPath,
    previousVersion,
    tag: release.tag,
    version: release.version,
  });
}

function readArgument(name) {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (!value) throw new Error(`Missing required argument ${name}.`);
  return value;
}

function main() {
  const result = projectMacOSReleaseVersion({ tag: readArgument('--tag') });
  process.stdout.write(
    `OpenNeko macOS release version projected from ${String(result.previousVersion)} to ${result.version}.\n`,
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
