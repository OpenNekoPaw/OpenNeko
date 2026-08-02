#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { assertMacOSReleaseMetadata } from './assert-macos-release-metadata.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export { assertMacOSReleaseMetadata };

export function resolveMacOSReleaseDmg({ repositoryRoot: root = repositoryRoot, version }) {
  return resolve(
    root,
    `apps/neko-desktop/out/make/OpenNeko-${version}-arm64.dmg`,
  );
}

export function prepareMacOSReleaseArtifacts({
  repositoryRoot: root = repositoryRoot,
  tag,
} = {}) {
  const { version } = assertMacOSReleaseMetadata({ tag });
  const dmgPath = resolveMacOSReleaseDmg({ repositoryRoot: root, version });
  let dmgStat;
  try {
    dmgStat = statSync(dmgPath);
  } catch (error) {
    throw new Error(`OpenNeko macOS release DMG is missing: ${dmgPath}.`, { cause: error });
  }
  if (!dmgStat.isFile()) throw new Error(`OpenNeko macOS release DMG is not a file: ${dmgPath}.`);

  const dmgDirectory = dirname(dmgPath);
  const candidates = readdirSync(dmgDirectory).filter((name) =>
    /^OpenNeko-.*-arm64\.dmg$/u.test(name),
  );
  if (candidates.length !== 1 || candidates[0] !== basename(dmgPath)) {
    throw new Error(
      `OpenNeko macOS release DMG set is ambiguous: expected only ${basename(dmgPath)}, received ${candidates.join(', ') || 'none'}.`,
    );
  }

  const sha256 = createHash('sha256').update(readFileSync(dmgPath)).digest('hex');
  const releaseRoot = resolve(root, 'apps/neko-desktop/out/release');
  mkdirSync(releaseRoot, { recursive: true });
  const checksumPath = join(releaseRoot, 'SHASUMS256.txt');
  writeFileSync(checksumPath, `${sha256}  ${basename(dmgPath)}\n`, 'utf8');
  return Object.freeze({ checksumPath, dmgPath, sha256 });
}

function main() {
  const result = prepareMacOSReleaseArtifacts({ tag: readArgument('--tag') });
  process.stdout.write(
    `OpenNeko macOS release artifacts verified: ${result.dmgPath}; checksum: ${result.checksumPath}.\n`,
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
