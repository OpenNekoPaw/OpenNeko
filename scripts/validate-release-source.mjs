#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RELEASE_TAG_PATTERN =
  /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

export function parseReleaseTag(tag) {
  const match = RELEASE_TAG_PATTERN.exec(tag);
  const prereleaseIdentifiers = match?.[4]?.split('.') ?? [];
  const hasInvalidNumericPrerelease = prereleaseIdentifiers.some(
    (identifier) =>
      /^\d+$/u.test(identifier) && identifier.length > 1 && identifier.startsWith('0'),
  );
  if (!match || hasInvalidNumericPrerelease) {
    throw new Error(`Invalid release tag: ${tag}`);
  }

  const manifestVersion = `${match[1]}.${match[2]}.${match[3]}`;
  return Object.freeze({
    tag,
    version: tag.slice(1),
    manifestVersion,
    prerelease: match[4] !== undefined,
  });
}

export function resolveReleaseCommit({ tag, resolveRef }) {
  const releaseSha = resolveRef(tag).trim();
  if (releaseSha.length === 0) {
    throw new Error(`Unable to resolve release tag ${tag} to a commit.`);
  }
  return releaseSha;
}

export function resolvePublishablePackagePaths(packageGroups) {
  const extensionPack = packageGroups?.extensionPack;
  const buildRelease = packageGroups?.packages?.buildRelease;
  if (typeof extensionPack !== 'string' || extensionPack.length === 0) {
    throw new Error('package-groups.json must define extensionPack.');
  }
  if (!Array.isArray(buildRelease) || buildRelease.length === 0) {
    throw new Error('package-groups.json must define a non-empty packages.buildRelease array.');
  }

  const paths = new Set([extensionPack]);
  for (const entry of buildRelease) {
    if (typeof entry !== 'string' || entry.length === 0) {
      throw new Error('packages.buildRelease entries must be non-empty strings.');
    }
    paths.add(entry.includes('/') ? entry : `packages/${entry}`);
  }
  return [...paths];
}

export function validateManifestVersions({ tag, packagePaths, readManifest }) {
  const release = parseReleaseTag(tag);
  for (const packagePath of packagePaths) {
    const manifest = readManifest(packagePath);
    if (manifest === undefined || manifest === null || typeof manifest !== 'object') {
      throw new Error(`${packagePath}/package.json is missing or invalid.`);
    }
    if (manifest.version !== release.manifestVersion) {
      throw new Error(
        `${packagePath}/package.json declares ${String(manifest.version)}; expected ${release.manifestVersion}.`,
      );
    }
  }

  return Object.freeze({
    manifestVersion: release.manifestVersion,
    packageCount: packagePaths.length,
    prerelease: release.prerelease,
  });
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
  parseReleaseTag(tag);
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
  const result = validateManifestVersions({
    tag,
    packagePaths,
    readManifest: (packagePath) => readJson(`${packagePath}/package.json`),
  });

  process.stdout.write(
    `Release source validated: ${tag} at ${releaseSha}; ${result.packageCount} manifests use ${result.manifestVersion}.\n`,
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
