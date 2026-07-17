import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { access, copyFile, readFile, readdir, rename } from 'node:fs/promises';
import * as path from 'node:path';
import type { PathResolver } from '../path';
import type { AssetMediaType } from '../types/asset/entity';
import {
  parseMediaSemanticIndexSidecar,
  type MediaSemanticIndex,
} from '../types/media-semantic-index';
import type { ProjectSemanticCoverageAnalysisKind } from '../types/project-cache-search';
import type { LocalMetadataPartition } from './model';
import type {
  SearchDocumentRecord,
  SearchDocumentRepository,
  SemanticProjectionRecord,
  SemanticProjectionRepository,
} from './repositories';

export interface MediaSearchIndexMigrationUnrecoverable {
  readonly sourcePath: string;
  readonly fields: readonly string[];
  readonly reason: string;
}

export interface MediaSearchIndexMigrationReport {
  readonly sourceStatus: 'absent' | 'migrated' | 'quarantined';
  readonly sourcePath: string;
  readonly backupPath: string | null;
  readonly archivedPath: string | null;
  readonly quarantinePath: string | null;
  readonly sourceDiagnostic: string | null;
  readonly importedCount: number;
  readonly preservedExistingCount: number;
  readonly verifiedCount: number;
  readonly unrecoverable: readonly MediaSearchIndexMigrationUnrecoverable[];
}

interface LegacyMediaSearchIndex {
  readonly version: 1;
  readonly updatedAt: string;
  readonly entries: readonly LegacyMediaSearchIndexEntry[];
}

interface LegacyMediaSearchIndexEntry {
  readonly filePath: string;
  readonly fileName: string;
  readonly libraryName: string;
  readonly mediaType: AssetMediaType;
}

export interface SemanticIndexSidecarMigrationDiagnostic {
  readonly sourcePath: string;
  readonly message: string;
}

export interface SemanticIndexSidecarMigrationReport {
  readonly sourceStatus: 'absent' | 'migrated' | 'partial' | 'quarantined';
  readonly sourceRoot: string;
  readonly discoveredCount: number;
  readonly importedSourceCount: number;
  readonly importedEvidenceCount: number;
  readonly preservedExistingSourceCount: number;
  readonly verifiedSourceCount: number;
  readonly quarantinedCount: number;
  readonly backupPaths: readonly string[];
  readonly archivedPaths: readonly string[];
  readonly quarantinePaths: readonly string[];
  readonly diagnostics: readonly SemanticIndexSidecarMigrationDiagnostic[];
}

export async function migrateLegacyMediaSearchIndex(options: {
  readonly indexPath: string;
  readonly partition: LocalMetadataPartition;
  readonly repository: SearchDocumentRepository;
  readonly pathResolver: PathResolver;
  readonly now?: () => number;
}): Promise<MediaSearchIndexMigrationReport> {
  if (!(await pathExists(options.indexPath))) return emptyReport(options.indexPath);
  const migratedAt = (options.now ?? (() => Date.now()))();
  const backupPath = `${options.indexPath}.backup-${migratedAt}`;
  try {
    await copyFile(options.indexPath, backupPath);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) return emptyReport(options.indexPath);
    throw error;
  }

  let legacy: LegacyMediaSearchIndex;
  try {
    const parsed: unknown = JSON.parse(await readFile(backupPath, 'utf8'));
    if (!isLegacyMediaSearchIndex(parsed)) {
      throw new Error('Legacy media search index must use the valid version 1 schema.');
    }
    legacy = parsed;
  } catch (error) {
    const quarantinePath = await quarantineSource(options.indexPath, migratedAt);
    return {
      ...emptyReport(options.indexPath),
      sourceStatus: 'quarantined',
      backupPath,
      quarantinePath,
      sourceDiagnostic: error instanceof Error ? error.message : String(error),
    };
  }

  const unrecoverable: MediaSearchIndexMigrationUnrecoverable[] = [];
  const documents = legacy.entries.flatMap((entry) => {
    const fileKey = contractPortablePath(entry.filePath, options.pathResolver);
    if (!fileKey) {
      unrecoverable.push({
        sourcePath: entry.filePath,
        fields: ['filePath'],
        reason: 'Media search source path cannot be contracted to a portable path.',
      });
      return [];
    }
    return [legacyEntryToSearchDocument(entry, fileKey, legacy.updatedAt)];
  });
  const importResult = await options.repository.insertMissingSearchPartition({
    partition: options.partition,
    searchPartition: 'media-library',
    documents,
    updatedAt: legacy.updatedAt,
  });
  const verified = (await options.repository.list(options.partition)).filter(
    (document) => document.partition === 'media-library',
  );
  const verifiedCount = assertIdentitiesPresent(documents, verified);

  const archivedPath = `${options.indexPath}.migrated-${migratedAt}`;
  let retiredPath: string | null = archivedPath;
  try {
    await rename(options.indexPath, archivedPath);
  } catch (error) {
    if (!hasNodeErrorCode(error, 'ENOENT')) throw error;
    retiredPath = null;
  }
  return {
    sourceStatus: 'migrated',
    sourcePath: options.indexPath,
    backupPath,
    archivedPath: retiredPath,
    quarantinePath: null,
    sourceDiagnostic: null,
    importedCount: importResult.insertedDocumentIds.length,
    preservedExistingCount: importResult.preservedDocumentIds.length,
    verifiedCount,
    unrecoverable,
  };
}

export async function migrateLegacySemanticIndexSidecars(options: {
  readonly semanticIndexRoot: string;
  readonly partition: LocalMetadataPartition;
  readonly repository: SemanticProjectionRepository;
  readonly now?: () => number;
}): Promise<SemanticIndexSidecarMigrationReport> {
  const files = await listSemanticSidecars(options.semanticIndexRoot);
  if (files.length === 0) return emptySemanticReport(options.semanticIndexRoot);
  const migratedAt = (options.now ?? (() => Date.now()))();
  const backupPaths: string[] = [];
  const quarantinePaths: string[] = [];
  const diagnostics: SemanticIndexSidecarMigrationDiagnostic[] = [];
  const prepared = new Map<
    string,
    { readonly sourcePath: string; readonly record: SemanticProjectionRecord }
  >();

  for (const sourcePath of files) {
    const backupPath = `${sourcePath}.backup-${migratedAt}`;
    try {
      await copyFile(sourcePath, backupPath);
      backupPaths.push(backupPath);
    } catch (error) {
      if (hasNodeErrorCode(error, 'ENOENT')) continue;
      throw error;
    }
    let record: SemanticProjectionRecord | undefined;
    try {
      const parsed = parseMediaSemanticIndexSidecar(await readFile(backupPath, 'utf8'), {
        warnOnUnrelatedRangeFields: true,
      });
      if (!parsed.record) {
        throw new Error(
          parsed.diagnostics.map((diagnostic) => diagnostic.message).join('; ') ||
            'Legacy semantic index is invalid.',
        );
      }
      record = semanticIndexToProjection(parsed.record.index, migratedAt);
      if (prepared.has(record.sourceId)) {
        throw new Error(`Duplicate semantic source identity: ${record.sourceId}`);
      }
    } catch (error) {
      const quarantinePath = await quarantineSource(sourcePath, migratedAt);
      if (quarantinePath) quarantinePaths.push(quarantinePath);
      diagnostics.push({
        sourcePath,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    prepared.set(record.sourceId, { sourcePath, record });
  }

  const imported = [...prepared.values()];
  const importResult =
    imported.length > 0
      ? await options.repository.insertMissing({
          partition: options.partition,
          sources: imported.map((item) => item.record),
          updatedAt: new Date(migratedAt).toISOString(),
        })
      : { insertedSourceIds: [], preservedSourceIds: [] };
  const insertedIds = new Set(importResult.insertedSourceIds);
  const verified = await options.repository.list(options.partition);
  const verifiedIds = new Set(verified.map((record) => record.sourceId));
  for (const item of imported) {
    if (!verifiedIds.has(item.record.sourceId)) {
      throw new Error(`Semantic migration identity verification failed: ${item.record.sourceId}`);
    }
  }

  const archivedPaths: string[] = [];
  for (const item of imported) {
    const archivedPath = `${item.sourcePath}.migrated-${migratedAt}`;
    try {
      await rename(item.sourcePath, archivedPath);
      archivedPaths.push(archivedPath);
    } catch (error) {
      if (!hasNodeErrorCode(error, 'ENOENT')) throw error;
    }
  }
  const quarantinedCount = quarantinePaths.length;
  return {
    sourceStatus:
      imported.length > 0 ? (quarantinedCount > 0 ? 'partial' : 'migrated') : 'quarantined',
    sourceRoot: options.semanticIndexRoot,
    discoveredCount: files.length,
    importedSourceCount: importResult.insertedSourceIds.length,
    importedEvidenceCount: imported.reduce(
      (count, item) =>
        count +
        (insertedIds.has(item.record.sourceId) ? countSemanticEvidence(item.record.index) : 0),
      0,
    ),
    preservedExistingSourceCount: importResult.preservedSourceIds.length,
    verifiedSourceCount: imported.filter((item) => verifiedIds.has(item.record.sourceId)).length,
    quarantinedCount,
    backupPaths,
    archivedPaths,
    quarantinePaths,
    diagnostics,
  };
}

function legacyEntryToSearchDocument(
  entry: LegacyMediaSearchIndexEntry,
  fileKey: string,
  updatedAt: string,
): SearchDocumentRecord {
  return {
    documentId: `media:${hashIdentity(fileKey)}`,
    partition: 'media-library',
    kind: 'media',
    label: entry.fileName,
    description: entry.libraryName,
    source: {
      partition: 'media-library',
      sourceId: fileKey,
      filePath: fileKey,
      metadata: { mediaType: entry.mediaType, libraryName: entry.libraryName },
    },
    fileKey,
    searchText: `${entry.fileName} ${entry.libraryName} ${entry.mediaType}`,
    freshness: 'fresh',
    metadata: { mediaType: entry.mediaType, libraryName: entry.libraryName },
    updatedAt,
  };
}

function semanticIndexToProjection(
  index: MediaSemanticIndex,
  migratedAt: number,
): SemanticProjectionRecord {
  const sourceFingerprint = `sha256:${createHash('sha256')
    .update(JSON.stringify(index.sourceRef))
    .digest('hex')}`;
  const firstProvider = index.textSegments?.[0]?.provenance;
  return {
    sourceId: index.indexId ?? `semantic:${index.assetId}`,
    sourceFingerprint,
    provider: {
      providerId: firstProvider?.providerId ?? 'legacy-semantic-sidecar',
      ...(firstProvider?.modelId ? { model: firstProvider.modelId } : {}),
      sourceIdentity: sourceFingerprint,
      indexVersion: 'semantic-index-v1',
      schemaVersion: '1',
    },
    coverage: semanticCoverageKinds(index),
    freshness: 'fresh',
    index,
    updatedAt: index.updatedAt ?? new Date(migratedAt).toISOString(),
  };
}

function semanticCoverageKinds(
  index: MediaSemanticIndex,
): readonly ProjectSemanticCoverageAnalysisKind[] {
  const coverage = new Set<ProjectSemanticCoverageAnalysisKind>();
  for (const segment of index.textSegments ?? []) {
    if (segment.kind === 'ocr' || segment.kind === 'asr' || segment.kind === 'subtitle') {
      coverage.add(segment.kind);
    }
    if (segment.kind === 'caption' || segment.kind === 'agent') coverage.add('vision');
    if ((segment.entityMentionIds?.length ?? 0) > 0) coverage.add('entity-mention');
    if (segment.kind === 'agent' && segment.metadata?.['artifactKind'] === 'storyboard') {
      coverage.add('storyboard');
    }
  }
  if ((index.semanticTags?.length ?? 0) > 0) coverage.add('vision');
  if ((index.entityMentions?.length ?? 0) > 0) coverage.add('entity-mention');
  const orderedKinds: readonly ProjectSemanticCoverageAnalysisKind[] = [
    'ocr',
    'asr',
    'subtitle',
    'vision',
    'entity-mention',
    'storyboard',
  ];
  return orderedKinds.filter((kind) => coverage.has(kind));
}

function countSemanticEvidence(index: MediaSemanticIndex): number {
  return (
    (index.textSegments?.length ?? 0) +
    (index.entityMentions?.length ?? 0) +
    (index.semanticTags?.length ?? 0) +
    (index.perceptionRefs?.length ?? 0)
  );
}

function contractPortablePath(filePath: string, pathResolver: PathResolver): string | null {
  const contracted = pathResolver.contract(filePath).replace(/\\/gu, '/');
  if (
    !contracted.trim() ||
    path.posix.isAbsolute(contracted) ||
    /^[A-Za-z]:\//u.test(contracted) ||
    contracted === '..' ||
    contracted.startsWith('../') ||
    contracted.includes('/../') ||
    contracted.includes('/.neko/.cache/') ||
    contracted.startsWith('.neko/.cache/')
  ) {
    return null;
  }
  return contracted;
}

function assertIdentitiesPresent(
  expected: readonly SearchDocumentRecord[],
  actual: readonly SearchDocumentRecord[],
): number {
  const actualIds = new Set(actual.map((document) => document.documentId));
  const verifiedCount = expected.filter((document) => actualIds.has(document.documentId)).length;
  if (verifiedCount !== expected.length) {
    throw new Error(
      `Media search migration identity verification failed: expected ${expected.length}, received ${verifiedCount}.`,
    );
  }
  return verifiedCount;
}

function isLegacyMediaSearchIndex(value: unknown): value is LegacyMediaSearchIndex {
  return (
    isRecord(value) &&
    value['version'] === 1 &&
    typeof value['updatedAt'] === 'string' &&
    Number.isFinite(Date.parse(value['updatedAt'])) &&
    Array.isArray(value['entries']) &&
    value['entries'].every(isLegacyMediaSearchIndexEntry)
  );
}

function isLegacyMediaSearchIndexEntry(value: unknown): value is LegacyMediaSearchIndexEntry {
  return (
    isRecord(value) &&
    typeof value['filePath'] === 'string' &&
    typeof value['fileName'] === 'string' &&
    typeof value['libraryName'] === 'string' &&
    isAssetMediaType(value['mediaType'])
  );
}

function isAssetMediaType(value: unknown): value is AssetMediaType {
  return (
    value === 'video' ||
    value === 'audio' ||
    value === 'image' ||
    value === 'sequence' ||
    value === 'text' ||
    value === 'document'
  );
}

function hashIdentity(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

async function listSemanticSidecars(root: string): Promise<readonly string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) return [];
    throw error;
  }
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(root, entry.name);
      if (entry.isDirectory()) return listSemanticSidecars(entryPath);
      if (
        entry.isFile() &&
        entry.name.endsWith('.json') &&
        !/\.(?:backup|migrated|quarantine)-\d+$/u.test(entry.name)
      ) {
        return [entryPath];
      }
      return [];
    }),
  );
  return nested.flat().sort();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function quarantineSource(sourcePath: string, migratedAt: number): Promise<string | null> {
  const quarantinePath = `${sourcePath}.quarantine-${migratedAt}`;
  try {
    await rename(sourcePath, quarantinePath);
    return quarantinePath;
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) return null;
    throw error;
  }
}

function hasNodeErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && Reflect.get(error, 'code') === code;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) return false;
    throw error;
  }
}

function emptyReport(sourcePath: string): MediaSearchIndexMigrationReport {
  return {
    sourceStatus: 'absent',
    sourcePath,
    backupPath: null,
    archivedPath: null,
    quarantinePath: null,
    sourceDiagnostic: null,
    importedCount: 0,
    preservedExistingCount: 0,
    verifiedCount: 0,
    unrecoverable: [],
  };
}

function emptySemanticReport(sourceRoot: string): SemanticIndexSidecarMigrationReport {
  return {
    sourceStatus: 'absent',
    sourceRoot,
    discoveredCount: 0,
    importedSourceCount: 0,
    importedEvidenceCount: 0,
    preservedExistingSourceCount: 0,
    verifiedSourceCount: 0,
    quarantinedCount: 0,
    backupPaths: [],
    archivedPaths: [],
    quarantinePaths: [],
    diagnostics: [],
  };
}
