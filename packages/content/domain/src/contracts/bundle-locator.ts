// =============================================================================
// Bundle Locator Contracts
// =============================================================================

/**
 * Logical reference to an entry inside an archive.
 *
 * This is metadata only. Runtime consumers must resolve it to bytes, parsed
 * JSON, ImageBitmap, a registered file token, or another concrete data channel.
 */
export interface BundleEntryLocator {
  /** Path to the archive itself, stored as relative path or ${VAR}/path. */
  readonly bundlePath: string;
  /** Normalized POSIX path inside the archive. */
  readonly entryPath: string;
  /** Display/search reference in `${bundlePath}#${entryPath}` form. */
  readonly fragmentRef: string;
}

/** Storage mode for assets whose runtime data is not always a plain file path. */
export type MediaAssetStorageMode = 'workspace' | 'disk' | 'bundle-memory' | 'market' | 'external';

/** Common metadata for archive-backed asset records. */
export interface BundleBackedAssetReference {
  readonly storageMode: 'bundle-memory';
  readonly locator: BundleEntryLocator;
  /** Hash of the containing bundle when available. */
  readonly bundleHash?: string;
}

export type BundleEntryPathValidationIssue =
  | 'empty'
  | 'absolute'
  | 'drive-letter'
  | 'parent-segment'
  | 'current-segment'
  | 'empty-segment'
  | 'invalid-separator';

export type BundleEntryPathValidationResult =
  | {
      readonly ok: true;
      readonly entryPath: string;
    }
  | {
      readonly ok: false;
      readonly issue: BundleEntryPathValidationIssue;
      readonly input: string;
    };

export interface BundleArchiveEntryMetadata {
  readonly entryPath: string;
  readonly uncompressedSize: number;
  readonly compressedSize?: number;
  readonly directory?: boolean;
}

export interface BundleArchiveValidationLimits {
  readonly maxEntryBytes: number;
  readonly maxTotalUncompressedBytes: number;
}

export type BundleArchiveValidationIssue =
  | {
      readonly code: 'unsafe-entry-path';
      readonly entryPath: string;
      readonly pathIssue: BundleEntryPathValidationIssue;
    }
  | {
      readonly code: 'duplicate-entry';
      readonly entryPath: string;
      readonly normalizedEntryPath: string;
    }
  | {
      readonly code: 'entry-too-large';
      readonly entryPath: string;
      readonly uncompressedSize: number;
      readonly maxEntryBytes: number;
    }
  | {
      readonly code: 'archive-too-large';
      readonly totalUncompressedSize: number;
      readonly maxTotalUncompressedBytes: number;
    };

export type BundleArchiveValidationResult =
  | {
      readonly ok: true;
      readonly normalizedEntries: readonly BundleArchiveEntryMetadata[];
      readonly totalUncompressedSize: number;
    }
  | {
      readonly ok: false;
      readonly issues: readonly BundleArchiveValidationIssue[];
      readonly totalUncompressedSize: number;
    };

export const DEFAULT_BUNDLE_ARCHIVE_VALIDATION_LIMITS: BundleArchiveValidationLimits = {
  maxEntryBytes: 64 * 1024 * 1024,
  maxTotalUncompressedBytes: 512 * 1024 * 1024,
};

export function createBundleEntryLocator(
  bundlePath: string,
  entryPath: string,
): BundleEntryPathValidationResult & { readonly locator?: BundleEntryLocator } {
  const normalized = normalizeBundleEntryPath(entryPath);
  if (!normalized.ok) return normalized;
  return {
    ok: true,
    entryPath: normalized.entryPath,
    locator: {
      bundlePath,
      entryPath: normalized.entryPath,
      fragmentRef: `${bundlePath}#${normalized.entryPath}`,
    },
  };
}

export function normalizeBundleEntryPath(input: string): BundleEntryPathValidationResult {
  if (input.length === 0) {
    return { ok: false, issue: 'empty', input };
  }

  const normalized = input.replace(/\\/g, '/');
  if (normalized.length === 0) {
    return { ok: false, issue: 'empty', input };
  }
  if (/^[A-Za-z]:(?:\/|$)/.test(normalized)) {
    return { ok: false, issue: 'drive-letter', input };
  }
  if (normalized.startsWith('/')) {
    return { ok: false, issue: 'absolute', input };
  }

  const segments = normalized.split('/');
  for (const segment of segments) {
    if (segment.length === 0) {
      return { ok: false, issue: 'empty-segment', input };
    }
    if (segment === '.') {
      return { ok: false, issue: 'current-segment', input };
    }
    if (segment === '..') {
      return { ok: false, issue: 'parent-segment', input };
    }
  }

  return { ok: true, entryPath: segments.join('/') };
}

export function resolveBundleEntryPath(
  manifestEntryPath: string,
  referencedPath: string,
): BundleEntryPathValidationResult {
  const manifest = normalizeBundleEntryPath(manifestEntryPath);
  if (!manifest.ok) return manifest;

  const manifestSegments = manifest.entryPath.split('/');
  const baseSegments = manifestSegments.slice(0, -1);
  return normalizeBundleReferencePath(baseSegments, referencedPath);
}

export function validateBundleArchiveMetadata(
  entries: readonly BundleArchiveEntryMetadata[],
  limits: BundleArchiveValidationLimits = DEFAULT_BUNDLE_ARCHIVE_VALIDATION_LIMITS,
): BundleArchiveValidationResult {
  const issues: BundleArchiveValidationIssue[] = [];
  const normalizedEntries: BundleArchiveEntryMetadata[] = [];
  const seen = new Set<string>();
  let totalUncompressedSize = 0;

  for (const entry of entries) {
    const normalized = normalizeBundleEntryPath(entry.entryPath);
    if (!normalized.ok) {
      issues.push({
        code: 'unsafe-entry-path',
        entryPath: entry.entryPath,
        pathIssue: normalized.issue,
      });
      continue;
    }

    if (seen.has(normalized.entryPath)) {
      issues.push({
        code: 'duplicate-entry',
        entryPath: entry.entryPath,
        normalizedEntryPath: normalized.entryPath,
      });
      continue;
    }
    seen.add(normalized.entryPath);

    if (entry.uncompressedSize > limits.maxEntryBytes) {
      issues.push({
        code: 'entry-too-large',
        entryPath: entry.entryPath,
        uncompressedSize: entry.uncompressedSize,
        maxEntryBytes: limits.maxEntryBytes,
      });
    }

    totalUncompressedSize += Math.max(0, entry.uncompressedSize);
    normalizedEntries.push({
      ...entry,
      entryPath: normalized.entryPath,
    });
  }

  if (totalUncompressedSize > limits.maxTotalUncompressedBytes) {
    issues.push({
      code: 'archive-too-large',
      totalUncompressedSize,
      maxTotalUncompressedBytes: limits.maxTotalUncompressedBytes,
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues, totalUncompressedSize };
  }
  return { ok: true, normalizedEntries, totalUncompressedSize };
}

function normalizeBundleReferencePath(
  baseSegments: readonly string[],
  referencedPath: string,
): BundleEntryPathValidationResult {
  if (referencedPath.length === 0) {
    return { ok: false, issue: 'empty', input: referencedPath };
  }

  const normalized = referencedPath.replace(/\\/g, '/');
  if (/^[A-Za-z]:(?:\/|$)/.test(normalized)) {
    return { ok: false, issue: 'drive-letter', input: referencedPath };
  }
  if (normalized.startsWith('/')) {
    return { ok: false, issue: 'absolute', input: referencedPath };
  }

  const output = [...baseSegments];
  for (const segment of normalized.split('/')) {
    if (segment.length === 0) {
      return { ok: false, issue: 'empty-segment', input: referencedPath };
    }
    if (segment === '.') {
      continue;
    }
    if (segment === '..') {
      if (output.length === 0) {
        return { ok: false, issue: 'parent-segment', input: referencedPath };
      }
      output.pop();
      continue;
    }
    output.push(segment);
  }

  if (output.length === 0) {
    return { ok: false, issue: 'empty', input: referencedPath };
  }
  return { ok: true, entryPath: output.join('/') };
}
