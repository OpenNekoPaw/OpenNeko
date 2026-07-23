#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  inspectPublishableManifests,
  parseReleaseTag,
  resolvePublishablePackagePaths,
} from './release-version-contract.mjs';

export function resolveReleaseCommit({ tag, resolveRef }) {
  const releaseSha = resolveRef(tag).trim();
  if (releaseSha.length === 0) {
    throw new Error(`Unable to resolve release tag ${tag} to a commit.`);
  }
  return releaseSha;
}

export function assertReleaseCommitOnMain({ releaseSha, mainRef = 'origin/main', isAncestor }) {
  if (typeof releaseSha !== 'string' || releaseSha.length === 0) {
    throw new Error('Release commit SHA is required.');
  }
  if (!isAncestor(releaseSha, mainRef)) {
    throw new Error(`Release commit ${releaseSha} is not reachable from ${mainRef}.`);
  }
  return Object.freeze({ releaseSha, mainRef });
}

function isGitAncestor(candidate, mainRef) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', candidate, mainRef], {
      stdio: 'ignore',
    });
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && error.status === 1) {
      return false;
    }
    throw error;
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

function main() {
  const tag = process.env.GITHUB_REF_NAME ?? '';
  const release = parseReleaseTag(tag);
  const releaseSha = resolveReleaseCommit({
    tag,
    resolveRef: (ref) =>
      execFileSync('git', ['rev-list', '-n', '1', ref], {
        encoding: 'utf8',
      }),
  });
  const packageGroups = readJson('scripts/package-groups.json');
  const packagePaths = resolvePublishablePackagePaths(packageGroups);

  assertReleaseCommitOnMain({ releaseSha, isAncestor: isGitAncestor });
  const source = inspectPublishableManifests({
    packagePaths,
    readManifest: (packagePath) => readJson(`${packagePath}/package.json`),
  });

  process.stdout.write(
    `Release source validated: ${tag} at ${releaseSha}; ${source.packageCount} manifests will project ${source.sourceVersion} to ${release.manifestVersion}.\n`,
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
