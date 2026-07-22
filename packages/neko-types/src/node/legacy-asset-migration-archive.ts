import { createHash, randomUUID } from 'node:crypto';
import { chmod, link, lstat, mkdir, open, readFile, rm } from 'node:fs/promises';
import * as path from 'node:path';
import {
  createSafeLegacyAssetMigrationDiagnostic,
  type LegacyAssetMigrationArchive,
  type LegacyAssetMigrationDiagnosticCode,
} from '../types/legacy-asset-catalog-migration';
import { normalizeWorkspaceContentPath } from '../types/content-locator';
import type {
  LegacyAssetArchiveInput,
  LegacyAssetCatalogInspectionSession,
  LegacyAssetInspectionReader,
} from './legacy-asset-catalog-inspector';

export interface LegacyAssetProjectionSnapshot {
  readonly revision: string;
  readonly records: readonly unknown[];
}

export interface LegacyAssetMigrationArchiveHost extends LegacyAssetInspectionReader {
  readProjectRevision(): Promise<string>;
  readLocalProjection(sourceId: string): Promise<LegacyAssetProjectionSnapshot | undefined>;
  writeImmutableWorkspaceFile(input: {
    readonly workspacePath: string;
    readonly bytes: Uint8Array;
    readonly digest: string;
  }): Promise<void>;
}

export class LegacyAssetMigrationArchiveError extends Error {
  readonly code: Extract<
    LegacyAssetMigrationDiagnosticCode,
    'source-changed' | 'archive-write-failed'
  >;

  constructor(code: LegacyAssetMigrationArchiveError['code']) {
    super(createSafeLegacyAssetMigrationDiagnostic(code).message);
    this.name = 'LegacyAssetMigrationArchiveError';
    this.code = code;
  }
}

export async function createLegacyAssetMigrationArchive(input: {
  readonly session: LegacyAssetCatalogInspectionSession;
  readonly host: LegacyAssetMigrationArchiveHost;
  readonly verifiedAt: string;
}): Promise<LegacyAssetMigrationArchive & { readonly status: 'verified' }> {
  if (input.session.inspection.status !== 'ready') {
    throw new LegacyAssetMigrationArchiveError('source-changed');
  }
  await verifyArchiveInputs(input.session, input.host);

  const payloadBytes = createArchivePayload(input.session);
  const digest = hashBytes(payloadBytes);
  const digestHex = digest.slice('sha256:'.length);
  const workspacePath = `neko/migrations/asset-catalog/${digestHex}.json`;
  try {
    await input.host.writeImmutableWorkspaceFile({ workspacePath, bytes: payloadBytes, digest });
    const written = await input.host.readWorkspaceFile(workspacePath);
    if (!written || hashBytes(written) !== digest) {
      throw new LegacyAssetMigrationArchiveError('archive-write-failed');
    }
  } catch (error) {
    if (error instanceof LegacyAssetMigrationArchiveError) throw error;
    throw new LegacyAssetMigrationArchiveError('archive-write-failed');
  }

  return {
    status: 'verified',
    archiveId: `archive-${digestHex.slice(0, 24)}`,
    digest,
    byteLength: payloadBytes.byteLength,
    workspacePath,
    sources: input.session.inspection.precondition.sources,
    verifiedAt: input.verifiedAt,
  };
}

export function planLegacyAssetMigrationArchive(
  session: LegacyAssetCatalogInspectionSession,
): LegacyAssetMigrationArchive {
  if (session.inspection.status !== 'ready') {
    throw new LegacyAssetMigrationArchiveError('source-changed');
  }
  const payloadBytes = createArchivePayload(session);
  const digest = hashBytes(payloadBytes);
  const digestHex = digest.slice('sha256:'.length);
  return {
    status: 'planned',
    archiveId: `archive-${digestHex.slice(0, 24)}`,
    digest,
    byteLength: payloadBytes.byteLength,
    workspacePath: `neko/migrations/asset-catalog/${digestHex}.json`,
    sources: session.inspection.precondition.sources,
  };
}

export function createNodeLegacyAssetMigrationArchiveHost(input: {
  readonly workspaceRoot: string;
  readonly readProjectRevision: () => Promise<string>;
  readonly readLocalProjection?: (
    sourceId: string,
  ) => Promise<LegacyAssetProjectionSnapshot | undefined>;
}): LegacyAssetMigrationArchiveHost {
  const workspaceRoot = path.resolve(input.workspaceRoot);
  return {
    readProjectRevision: input.readProjectRevision,
    async readWorkspaceFile(workspacePath) {
      const absolutePath = resolveWorkspacePath(workspaceRoot, workspacePath);
      try {
        return await readFile(absolutePath);
      } catch (error) {
        if (isNodeError(error, 'ENOENT')) return undefined;
        throw error;
      }
    },
    async readLocalProjection(sourceId) {
      return input.readLocalProjection?.(sourceId);
    },
    async writeImmutableWorkspaceFile(request) {
      if (
        !request.workspacePath.startsWith('neko/migrations/asset-catalog/') ||
        !request.workspacePath.endsWith('.json') ||
        hashBytes(request.bytes) !== request.digest
      ) {
        throw new LegacyAssetMigrationArchiveError('archive-write-failed');
      }
      const absolutePath = resolveWorkspacePath(workspaceRoot, request.workspacePath);
      const archiveDirectory = path.dirname(absolutePath);
      await ensureArchiveDirectory(workspaceRoot, archiveDirectory);

      const existing = await readOptionalFile(absolutePath);
      if (existing) {
        if (hashBytes(existing) !== request.digest) {
          throw new LegacyAssetMigrationArchiveError('archive-write-failed');
        }
        return;
      }

      const temporaryPath = `${absolutePath}.tmp-${randomUUID()}`;
      try {
        const handle = await open(temporaryPath, 'wx', 0o400);
        try {
          await handle.writeFile(request.bytes);
          await handle.sync();
        } finally {
          await handle.close();
        }
        const temporaryBytes = await readFile(temporaryPath);
        if (hashBytes(temporaryBytes) !== request.digest) {
          throw new LegacyAssetMigrationArchiveError('archive-write-failed');
        }
        try {
          await link(temporaryPath, absolutePath);
        } catch (error) {
          if (!isNodeError(error, 'EEXIST')) throw error;
          const concurrent = await readFile(absolutePath);
          if (hashBytes(concurrent) !== request.digest) {
            throw new LegacyAssetMigrationArchiveError('archive-write-failed');
          }
        }
        await chmod(absolutePath, 0o400);
      } catch (error) {
        if (error instanceof LegacyAssetMigrationArchiveError) throw error;
        throw new LegacyAssetMigrationArchiveError('archive-write-failed');
      } finally {
        await rm(temporaryPath, { force: true });
      }
    },
  };
}

async function verifyArchiveInputs(
  session: LegacyAssetCatalogInspectionSession,
  host: LegacyAssetMigrationArchiveHost,
): Promise<void> {
  if ((await host.readProjectRevision()) !== session.inspection.precondition.projectRevision) {
    throw new LegacyAssetMigrationArchiveError('source-changed');
  }
  const expectedBySource = new Map(
    session.inspection.precondition.sources.map((source) => [source.sourceId, source.digest]),
  );
  for (const archiveInput of session.archiveInputs) {
    const expectedDigest = expectedBySource.get(archiveInput.sourceId);
    if (!expectedDigest) throw new LegacyAssetMigrationArchiveError('source-changed');
    if (archiveInput.kind === 'project-file') {
      const current = await host.readWorkspaceFile(archiveInput.workspacePath);
      if (!current || hashBytes(current) !== expectedDigest) {
        throw new LegacyAssetMigrationArchiveError('source-changed');
      }
      continue;
    }
    const current = await host.readLocalProjection(archiveInput.sourceId);
    if (
      !current ||
      current.revision !== archiveInput.revision ||
      hashProjection(current.records) !== expectedDigest
    ) {
      throw new LegacyAssetMigrationArchiveError('source-changed');
    }
  }
  if (expectedBySource.size !== session.archiveInputs.length) {
    throw new LegacyAssetMigrationArchiveError('source-changed');
  }
}

function createArchivePayload(session: LegacyAssetCatalogInspectionSession): Uint8Array {
  const sources = [...session.archiveInputs]
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId))
    .map(projectArchiveInput);
  return new TextEncoder().encode(
    `${JSON.stringify({
      version: 1,
      inspectionId: session.inspection.inspectionId,
      projectRevision: session.inspection.precondition.projectRevision,
      sources,
    })}\n`,
  );
}

function projectArchiveInput(input: LegacyAssetArchiveInput): Record<string, unknown> {
  return input.kind === 'project-file'
    ? {
        kind: input.kind,
        sourceId: input.sourceId,
        workspacePath: input.workspacePath,
        encoding: 'base64',
        content: Buffer.from(input.bytes).toString('base64'),
      }
    : {
        kind: input.kind,
        sourceId: input.sourceId,
        revision: input.revision,
        records: input.records,
      };
}

async function ensureArchiveDirectory(
  workspaceRoot: string,
  archiveDirectory: string,
): Promise<void> {
  const relative = path.relative(workspaceRoot, archiveDirectory);
  if (relative !== 'neko/migrations/asset-catalog') {
    throw new LegacyAssetMigrationArchiveError('archive-write-failed');
  }
  let current = workspaceRoot;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    await mkdir(current, { recursive: false }).catch((error: unknown) => {
      if (!isNodeError(error, 'EEXIST')) throw error;
    });
    const status = await lstat(current);
    if (!status.isDirectory() || status.isSymbolicLink()) {
      throw new LegacyAssetMigrationArchiveError('archive-write-failed');
    }
  }
}

function resolveWorkspacePath(workspaceRoot: string, workspacePath: string): string {
  if (normalizeWorkspaceContentPath(workspacePath) !== workspacePath) {
    throw new LegacyAssetMigrationArchiveError('archive-write-failed');
  }
  const resolved = path.resolve(workspaceRoot, ...workspacePath.split('/'));
  if (resolved !== workspaceRoot && !resolved.startsWith(`${workspaceRoot}${path.sep}`)) {
    throw new LegacyAssetMigrationArchiveError('archive-write-failed');
  }
  return resolved;
}

async function readOptionalFile(filePath: string): Promise<Uint8Array | undefined> {
  try {
    return await readFile(filePath);
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) return undefined;
    throw error;
  }
}

function hashProjection(records: readonly unknown[]): string {
  return hashBytes(new TextEncoder().encode(JSON.stringify(records)));
}

function hashBytes(value: Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === code;
}
