import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
  createGeneratedAssetRevisionRef,
  type GeneratedAsset,
  type GeneratedAssetMediaKind,
} from '@neko/shared';
import {
  buildGeneratedMediaAssets,
  toStableGeneratedAssetUri,
  type GeneratedMediaTaskType,
} from './media-generated-asset';

export interface GeneratedOutputAdoptionIndex {
  list(): GeneratedAsset[];
  add(asset: GeneratedAsset): Promise<void>;
}

export interface LegacyGeneratedOutputRetentionIndex {
  get(id: string): GeneratedAsset | undefined;
  add(asset: GeneratedAsset): Promise<void>;
}

export interface GeneratedOutputAdoptionDiagnostic {
  readonly code: 'generated-output-missing' | 'generated-output-unreadable';
  readonly path: string;
  readonly message: string;
}

export interface GeneratedOutputAdoptionReport {
  readonly adoptedCount: number;
  readonly retainedCount: number;
  readonly diagnostics: readonly GeneratedOutputAdoptionDiagnostic[];
}

export interface LegacyGeneratedOutputRetentionDiagnostic {
  readonly code:
    | 'legacy-generated-output-not-found'
    | 'legacy-generated-output-source-missing'
    | 'legacy-generated-output-source-unreadable'
    | 'legacy-generated-output-content-changed'
    | 'legacy-generated-output-kind-unsupported';
  readonly assetId: string;
  readonly message: string;
  readonly sourcePath?: string;
}

export type LegacyGeneratedOutputRetentionResult =
  | {
      readonly status: 'retained';
      readonly asset: GeneratedAsset;
      readonly sourceDisposition: 'retained-in-place' | 'copied-to-generated-output';
      readonly runtimeLayout: 'not-migrated';
      readonly diagnostics: readonly [];
    }
  | {
      readonly status: 'unavailable';
      readonly assetId: string;
      readonly runtimeLayout: 'not-migrated';
      readonly diagnostics: readonly [LegacyGeneratedOutputRetentionDiagnostic];
    };

const ADOPTABLE_KINDS: readonly GeneratedMediaTaskType[] = ['image', 'video', 'audio'];

export async function adoptWorkspaceGeneratedOutputs(options: {
  readonly workspaceRoot: string;
  readonly index: GeneratedOutputAdoptionIndex;
}): Promise<GeneratedOutputAdoptionReport> {
  const generatedRoot = path.join(options.workspaceRoot, 'neko', 'generated');
  const existingAssets = options.index.list();
  const indexedPaths = new Set(existingAssets.map((asset) => path.resolve(asset.path)));
  const diagnostics: GeneratedOutputAdoptionDiagnostic[] = [];

  for (const asset of existingAssets) {
    try {
      await fs.access(asset.path);
    } catch (error) {
      diagnostics.push({
        code: 'generated-output-missing',
        path: asset.path,
        message: toErrorMessage(error),
      });
    }
  }

  let adoptedCount = 0;
  let retainedCount = 0;
  for (const kind of ADOPTABLE_KINDS) {
    const kindRoot = path.join(generatedRoot, kind);
    const files = await listRegularFiles(kindRoot, diagnostics);
    for (const { filePath, mtimeMs } of files) {
      const resolvedPath = path.resolve(filePath);
      if (indexedPaths.has(resolvedPath)) {
        retainedCount += 1;
        continue;
      }
      try {
        const contentDigest = await computeDigest(filePath);
        const relativePath = path.relative(options.workspaceRoot, filePath).replace(/\\/gu, '/');
        const [asset] = buildGeneratedMediaAssets({
          hostOutputPaths: [filePath],
          outputs: [{ type: kind, url: filePath }],
          contentDigests: [contentDigest],
          taskId: `legacy-adoption:${relativePath}`,
          taskType: kind,
          request: { operation: 'legacy-adoption' },
          now: () => new Date(mtimeMs).toISOString(),
        });
        if (!asset)
          throw new Error(`Unable to create generated output record for ${relativePath}.`);
        await options.index.add(asset);
        indexedPaths.add(resolvedPath);
        adoptedCount += 1;
      } catch (error) {
        diagnostics.push({
          code: 'generated-output-unreadable',
          path: filePath,
          message: toErrorMessage(error),
        });
      }
    }
  }

  return { adoptedCount, retainedCount, diagnostics };
}

/**
 * Explicitly retains one legacy generated-output record. Runtime Canvas layout
 * is intentionally not accepted or reconstructed by this migration entry.
 */
export async function retainLegacyGeneratedOutput(options: {
  readonly workspaceRoot: string;
  readonly assetId: string;
  readonly index: LegacyGeneratedOutputRetentionIndex;
}): Promise<LegacyGeneratedOutputRetentionResult> {
  const asset = options.index.get(options.assetId);
  if (!asset) {
    return unavailable(options.assetId, {
      code: 'legacy-generated-output-not-found',
      assetId: options.assetId,
      message: `Generated output ${options.assetId} is no longer indexed. Relink a source file or generate it again before projecting it.`,
    });
  }

  const mediaKind = toRetainableMediaKind(asset);
  if (!mediaKind) {
    return unavailable(asset.id, {
      code: 'legacy-generated-output-kind-unsupported',
      assetId: asset.id,
      sourcePath: asset.path,
      message: `Generated output ${asset.id} uses a legacy composite kind that cannot be retained by the media migration action. Import its individual sources explicitly.`,
    });
  }

  let contentDigest: string;
  try {
    const stat = await fs.stat(asset.path);
    if (!stat.isFile()) throw new Error('The recorded source is not a regular file.');
    contentDigest = await computeDigest(asset.path);
  } catch (error) {
    return unavailable(asset.id, {
      code: hasNodeErrorCode(error, 'ENOENT')
        ? 'legacy-generated-output-source-missing'
        : 'legacy-generated-output-source-unreadable',
      assetId: asset.id,
      sourcePath: asset.path,
      message: hasNodeErrorCode(error, 'ENOENT')
        ? `Generated output ${asset.id} cannot be retained because its recorded source is missing. Relink the original file or generate it again; no cache or same-name fallback was used.`
        : `Generated output ${asset.id} cannot be retained because its recorded source is unreadable: ${toErrorMessage(error)}`,
    });
  }

  if (asset.lifecycle && asset.lifecycle.contentDigest !== contentDigest) {
    return unavailable(asset.id, {
      code: 'legacy-generated-output-content-changed',
      assetId: asset.id,
      sourcePath: asset.path,
      message: `Generated output ${asset.id} no longer matches its recorded content digest. Relink the original revision or import the changed file as a new output.`,
    });
  }

  const canonicalPath = await retainCanonicalSource({
    workspaceRoot: options.workspaceRoot,
    asset,
    mediaKind,
    contentDigest,
  });
  const lifecycle =
    asset.lifecycle ??
    createGeneratedAssetRevisionRef({
      assetId: asset.id,
      contentDigest,
      mediaKind,
      mimeType: asset.mimeType,
      generation: { taskId: `legacy-retain:${asset.id}` },
    });
  const retainedAsset: GeneratedAsset = {
    ...asset,
    path: canonicalPath,
    assetRef: {
      assetId: asset.id,
      uri: toStableGeneratedAssetUri(canonicalPath, asset.id),
      mimeType: asset.mimeType,
    },
    lifecycle,
  };
  await options.index.add(retainedAsset);
  return {
    status: 'retained',
    asset: retainedAsset,
    sourceDisposition:
      path.resolve(canonicalPath) === path.resolve(asset.path)
        ? 'retained-in-place'
        : 'copied-to-generated-output',
    runtimeLayout: 'not-migrated',
    diagnostics: [],
  };
}

async function listRegularFiles(
  directory: string,
  diagnostics: GeneratedOutputAdoptionDiagnostic[],
): Promise<Array<{ readonly filePath: string; readonly mtimeMs: number }>> {
  let entries: Awaited<ReturnType<typeof fs.readdir>>;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) return [];
    diagnostics.push({
      code: 'generated-output-unreadable',
      path: directory,
      message: toErrorMessage(error),
    });
    return [];
  }

  const files: Array<{ readonly filePath: string; readonly mtimeMs: number }> = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listRegularFiles(entryPath, diagnostics)));
    } else if (entry.isFile()) {
      try {
        const stat = await fs.stat(entryPath);
        files.push({ filePath: entryPath, mtimeMs: stat.mtimeMs });
      } catch (error) {
        diagnostics.push({
          code: 'generated-output-unreadable',
          path: entryPath,
          message: toErrorMessage(error),
        });
      }
    }
  }
  return files;
}

async function computeDigest(filePath: string): Promise<string> {
  const bytes = await fs.readFile(filePath);
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

async function retainCanonicalSource(input: {
  readonly workspaceRoot: string;
  readonly asset: GeneratedAsset;
  readonly mediaKind: GeneratedMediaTaskType;
  readonly contentDigest: string;
}): Promise<string> {
  const kindRoot = path.resolve(input.workspaceRoot, 'neko', 'generated', input.mediaKind);
  const sourcePath = path.resolve(input.asset.path);
  if (isInsideDirectory(kindRoot, sourcePath)) return sourcePath;

  await fs.mkdir(kindRoot, { recursive: true });
  const extension = path.extname(sourcePath) || extensionForMimeType(input.asset.mimeType);
  const digestSuffix = input.contentDigest.replace(/^sha256:/u, '').slice(0, 12);
  const safeId = input.asset.id.replace(/[^0-9A-Za-z._-]/gu, '-');
  const targetPath = path.join(kindRoot, `${safeId}-${digestSuffix}${extension}`);
  try {
    const existingDigest = await computeDigest(targetPath);
    if (existingDigest !== input.contentDigest) {
      throw new Error(`Canonical generated output collision at ${targetPath}.`);
    }
    return targetPath;
  } catch (error) {
    if (!hasNodeErrorCode(error, 'ENOENT')) throw error;
  }

  const temporaryPath = `${targetPath}.part-${randomUUID()}`;
  try {
    await fs.copyFile(sourcePath, temporaryPath);
    await fs.link(temporaryPath, targetPath).catch(async (error: unknown) => {
      if (!hasNodeErrorCode(error, 'EEXIST')) throw error;
      if ((await computeDigest(targetPath)) !== input.contentDigest) throw error;
    });
  } finally {
    await fs.unlink(temporaryPath).catch(() => undefined);
  }
  return targetPath;
}

function toRetainableMediaKind(asset: GeneratedAsset): GeneratedMediaTaskType | undefined {
  const kind: GeneratedAssetMediaKind =
    asset.type === 'generated-image'
      ? 'image'
      : asset.type === 'generated-video'
        ? 'video'
        : asset.type === 'generated-audio'
          ? 'audio'
          : 'storyboard';
  return kind === 'storyboard' || kind === 'file' ? undefined : kind;
}

function isInsideDirectory(directory: string, filePath: string): boolean {
  const relative = path.relative(directory, filePath);
  return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function extensionForMimeType(mimeType: string): string {
  const extensionByMimeType: Readonly<Record<string, string>> = {
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
  };
  return extensionByMimeType[mimeType] ?? '.bin';
}

function unavailable(
  assetId: string,
  diagnostic: LegacyGeneratedOutputRetentionDiagnostic,
): LegacyGeneratedOutputRetentionResult {
  return {
    status: 'unavailable',
    assetId,
    runtimeLayout: 'not-migrated',
    diagnostics: [diagnostic],
  };
}

function hasNodeErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && Reflect.get(error, 'code') === code;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
