#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { assertMacOSReleaseMetadata } from './assert-macos-release-metadata.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export { assertMacOSReleaseMetadata };

export function resolveMacOSReleaseZip({ repositoryRoot: root = repositoryRoot, version }) {
  return resolve(
    root,
    `apps/neko-desktop/out/make/zip/darwin/arm64/OpenNeko-darwin-arm64-${version}.zip`,
  );
}

export function prepareMacOSReleaseArtifacts({
  repositoryRoot: root = repositoryRoot,
  tag,
} = {}) {
  const { version } = assertMacOSReleaseMetadata({ tag });
  const zipPath = resolveMacOSReleaseZip({ repositoryRoot: root, version });
  let zipStat;
  try {
    zipStat = statSync(zipPath);
  } catch (error) {
    throw new Error(`OpenNeko macOS release ZIP is missing: ${zipPath}.`, { cause: error });
  }
  if (!zipStat.isFile()) throw new Error(`OpenNeko macOS release ZIP is not a file: ${zipPath}.`);

  const zipDirectory = dirname(zipPath);
  const candidates = readdirSync(zipDirectory).filter((name) =>
    /^OpenNeko-darwin-arm64-.*\.zip$/u.test(name),
  );
  if (candidates.length !== 1 || candidates[0] !== basename(zipPath)) {
    throw new Error(
      `OpenNeko macOS release ZIP set is ambiguous: expected only ${basename(zipPath)}, received ${candidates.join(', ') || 'none'}.`,
    );
  }

  const sha256 = createHash('sha256').update(readFileSync(zipPath)).digest('hex');
  const releaseRoot = resolve(root, 'apps/neko-desktop/out/release');
  mkdirSync(releaseRoot, { recursive: true });
  const checksumPath = join(releaseRoot, 'SHASUMS256.txt');
  writeFileSync(checksumPath, `${sha256}  ${basename(zipPath)}\n`, 'utf8');
  return Object.freeze({ checksumPath, sha256, zipPath });
}

function main() {
  const result = prepareMacOSReleaseArtifacts({ tag: readArgument('--tag') });
  process.stdout.write(
    `OpenNeko macOS release artifacts verified: ${result.zipPath}; checksum: ${result.checksumPath}.\n`,
  );
}

function readArgument(name) {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (!value) throw new Error(`Missing required argument ${name}.`);
  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
