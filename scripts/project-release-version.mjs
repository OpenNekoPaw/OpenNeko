#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  projectReleaseManifestVersions,
  resolvePublishablePackagePaths,
} from './release-version-contract.mjs';

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`);
}

function main() {
  const tag = process.env.GITHUB_REF_NAME ?? '';
  const packageGroups = readJson('scripts/package-groups.json');
  const packagePaths = resolvePublishablePackagePaths(packageGroups);
  const result = projectReleaseManifestVersions({
    tag,
    packagePaths,
    readManifest: (packagePath) => readJson(`${packagePath}/package.json`),
    writeManifest: (packagePath, manifest) => writeJson(`${packagePath}/package.json`, manifest),
  });

  process.stdout.write(
    `Projected ${tag} to manifest version ${result.manifestVersion} across ${result.packageCount} publishable packages (source ${result.sourceVersion}).\n`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
