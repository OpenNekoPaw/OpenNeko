const RELEASE_TAG_PATTERN =
  /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const MANIFEST_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;

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

export function resolvePublishablePackagePaths(packageGroups) {
  const productApplication = packageGroups?.productApplication;
  const buildRelease = packageGroups?.packages?.buildRelease;
  if (typeof productApplication !== 'string' || productApplication.length === 0) {
    throw new Error('package-groups.json must define productApplication.');
  }
  if (!Array.isArray(buildRelease) || buildRelease.length === 0) {
    throw new Error('package-groups.json must define a non-empty packages.buildRelease array.');
  }

  const paths = new Set([productApplication]);
  for (const entry of buildRelease) {
    if (typeof entry !== 'string' || entry.length === 0) {
      throw new Error('packages.buildRelease entries must be non-empty strings.');
    }
    paths.add(entry.includes('/') ? entry : `packages/${entry}`);
  }
  return [...paths];
}

export function inspectPublishableManifests({ packagePaths, readManifest }) {
  if (!Array.isArray(packagePaths) || packagePaths.length === 0) {
    throw new Error('At least one publishable package path is required.');
  }

  const entries = packagePaths.map((packagePath) => {
    const manifest = readManifest(packagePath);
    if (!isRecord(manifest)) {
      throw new Error(`${packagePath}/package.json is missing or invalid.`);
    }
    if (typeof manifest.version !== 'string' || !MANIFEST_VERSION_PATTERN.test(manifest.version)) {
      throw new Error(
        `${packagePath}/package.json declares an invalid numeric version: ${String(manifest.version)}.`,
      );
    }
    return Object.freeze({ packagePath, manifest });
  });

  const sourceVersions = [...new Set(entries.map(({ manifest }) => manifest.version))];
  if (sourceVersions.length !== 1) {
    throw new Error(
      `Publishable source manifest versions are inconsistent: ${entries
        .map(({ packagePath, manifest }) => `${packagePath}=${manifest.version}`)
        .join(', ')}.`,
    );
  }

  return Object.freeze({
    entries: Object.freeze(entries),
    packageCount: entries.length,
    sourceVersion: sourceVersions[0],
  });
}

export function projectReleaseManifestVersions({ tag, packagePaths, readManifest, writeManifest }) {
  const release = parseReleaseTag(tag);
  const source = inspectPublishableManifests({ packagePaths, readManifest });
  const projections = source.entries.map(({ packagePath, manifest }) =>
    Object.freeze({
      packagePath,
      manifest: { ...manifest, version: release.manifestVersion },
    }),
  );

  for (const projection of projections) {
    writeManifest(projection.packagePath, projection.manifest);
  }

  return Object.freeze({
    manifestVersion: release.manifestVersion,
    packageCount: source.packageCount,
    prerelease: release.prerelease,
    sourceVersion: source.sourceVersion,
  });
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
