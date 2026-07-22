import { createHash } from 'node:crypto';
import { normalizeWorkspaceContentPath } from '../types/content-locator';
import {
  createSafeLegacyAssetMigrationDiagnostic,
  isLegacyAssetCatalogMigrationPlan,
  type LegacyAssetCatalogMigrationPlan,
  type LegacyAssetMigrationArchive,
  type LegacyAssetMigrationDiagnosticCode,
  type LegacyAssetMigrationOutput,
  type LegacyAssetRebuildableProjection,
} from '../types/legacy-asset-catalog-migration';
import type { LegacyAssetClassificationResult } from './legacy-asset-catalog-classifier';
import type { LegacyAssetCatalogInspectionSession } from './legacy-asset-catalog-inspector';
import {
  createLegacyAssetMigrationArchive,
  planLegacyAssetMigrationArchive,
  type LegacyAssetMigrationArchiveHost,
  type LegacyAssetProjectionSnapshot,
} from './legacy-asset-migration-archive';

export type LegacyAssetPreparedMigrationOutput =
  | {
      readonly kind: 'write-project-file';
      readonly workspacePath: string;
      readonly expectedCurrentDigest: string | null;
      readonly bytes: Uint8Array;
    }
  | {
      readonly kind: 'remove-legacy-file';
      readonly workspacePath: string;
      readonly expectedDigest: string;
    }
  | {
      readonly kind: 'rebuild-projection';
      readonly projection: LegacyAssetRebuildableProjection;
    };

export interface LegacyAssetMigrationApproval {
  readonly planId: string;
  readonly archiveDigest: string;
  readonly confirmedAt: string;
  readonly confirmationIds: readonly string[];
}

export interface LegacyAssetMigrationApplyResult {
  readonly planId: string;
  readonly archive: LegacyAssetMigrationArchive & { readonly status: 'verified' };
  readonly appliedAt: string;
  readonly projectRevision: string;
}

export interface LegacyAssetMigrationRecoveryResult {
  readonly planId: string;
  readonly archiveDigest: string;
  readonly recoveredAt: string;
}

export interface LegacyAssetMigrationExecutionHost extends LegacyAssetMigrationArchiveHost {
  runExclusive<T>(operation: () => Promise<T>): Promise<T>;
  writeWorkspaceFileAtomic(workspacePath: string, bytes: Uint8Array): Promise<void>;
  removeWorkspaceFileAtomic(workspacePath: string): Promise<void>;
  captureProjection(projection: LegacyAssetRebuildableProjection): Promise<unknown>;
  rebuildProjection(projection: LegacyAssetRebuildableProjection): Promise<void>;
  clearProjection(projection: LegacyAssetRebuildableProjection): Promise<void>;
  restoreProjection(projection: LegacyAssetRebuildableProjection, snapshot: unknown): Promise<void>;
  writeLocalProjection(sourceId: string, snapshot: LegacyAssetProjectionSnapshot): Promise<void>;
  removeLocalProjection(sourceId: string): Promise<void>;
}

export class LegacyAssetMigrationExecutionError extends Error {
  readonly code: Extract<
    LegacyAssetMigrationDiagnosticCode,
    | 'migration-approval-required'
    | 'migration-precondition-failed'
    | 'migration-apply-failed'
    | 'migration-rollback-failed'
    | 'migration-recovery-failed'
  >;

  constructor(code: LegacyAssetMigrationExecutionError['code']) {
    super(createSafeLegacyAssetMigrationDiagnostic(code).message);
    this.name = 'LegacyAssetMigrationExecutionError';
    this.code = code;
  }
}

export function createLegacyAssetMigrationDryRun(input: {
  readonly session: LegacyAssetCatalogInspectionSession;
  readonly classification: LegacyAssetClassificationResult;
  readonly outputs: readonly LegacyAssetPreparedMigrationOutput[];
  readonly createdAt: string;
}): LegacyAssetCatalogMigrationPlan {
  const archive = planLegacyAssetMigrationArchive(input.session);
  const outputs = input.outputs.map(projectPreparedOutput);
  assertUniqueOutputs(outputs);
  const hasError = input.classification.diagnostics.some(
    (diagnostic) => diagnostic.severity === 'error',
  );
  const plan: LegacyAssetCatalogMigrationPlan = {
    version: 1,
    planId: `plan-${hashValue({
      inspectionId: input.session.inspection.inspectionId,
      archive: archive.digest,
      outputs,
    }).slice('sha256:'.length, 26)}`,
    inspectionId: input.session.inspection.inspectionId,
    createdAt: input.createdAt,
    status: hasError
      ? 'blocked'
      : input.classification.confirmationIds.length > 0
        ? 'confirmation-required'
        : 'ready',
    precondition: input.session.inspection.precondition,
    archive,
    classifications: input.classification.classifications,
    unresolvedFields: input.classification.unresolvedFields,
    outputs,
    confirmationIds: input.classification.confirmationIds,
    diagnostics: input.classification.diagnostics,
  };
  if (!isLegacyAssetCatalogMigrationPlan(plan)) {
    throw new Error('Legacy Asset dry run produced an invalid migration plan.');
  }
  return plan;
}

export function approveLegacyAssetMigration(input: {
  readonly plan: LegacyAssetCatalogMigrationPlan;
  readonly confirmationIds: readonly string[];
  readonly confirmedAt: string;
}): LegacyAssetMigrationApproval {
  if (
    input.plan.status === 'blocked' ||
    !sameStringSet(input.confirmationIds, input.plan.confirmationIds) ||
    !isTimestamp(input.confirmedAt)
  ) {
    throw new LegacyAssetMigrationExecutionError('migration-approval-required');
  }
  return {
    planId: input.plan.planId,
    archiveDigest: input.plan.archive.digest,
    confirmedAt: input.confirmedAt,
    confirmationIds: [...input.confirmationIds].sort(),
  };
}

export async function applyLegacyAssetMigration(input: {
  readonly session: LegacyAssetCatalogInspectionSession;
  readonly plan: LegacyAssetCatalogMigrationPlan;
  readonly approval: LegacyAssetMigrationApproval;
  readonly outputs: readonly LegacyAssetPreparedMigrationOutput[];
  readonly host: LegacyAssetMigrationExecutionHost;
  readonly appliedAt: string;
}): Promise<LegacyAssetMigrationApplyResult> {
  assertApplyInputs(input);
  return input.host.runExclusive(async () => {
    const archive = await createLegacyAssetMigrationArchive({
      session: input.session,
      host: input.host,
      verifiedAt: input.approval.confirmedAt,
    });
    if (
      archive.digest !== input.plan.archive.digest ||
      archive.workspacePath !== input.plan.archive.workspacePath
    ) {
      throw new LegacyAssetMigrationExecutionError('migration-precondition-failed');
    }
    await assertOutputPreconditions(input.outputs, input.host);

    const fileSnapshots = await captureFileSnapshots(input.outputs, input.host);
    const projectionSnapshots = await captureProjectionSnapshots(input.outputs, input.host);
    let mutationStarted = false;
    try {
      mutationStarted = true;
      await applyPreparedOutputs(input.outputs, input.host);
      return {
        planId: input.plan.planId,
        archive,
        appliedAt: input.appliedAt,
        projectRevision: await input.host.readProjectRevision(),
      };
    } catch {
      if (!mutationStarted) {
        throw new LegacyAssetMigrationExecutionError('migration-apply-failed');
      }
      try {
        await rollbackProjections(projectionSnapshots, input.host);
        await rollbackFiles(fileSnapshots, input.host);
      } catch {
        throw new LegacyAssetMigrationExecutionError('migration-rollback-failed');
      }
      throw new LegacyAssetMigrationExecutionError('migration-apply-failed');
    }
  });
}

export async function recoverLegacyAssetMigration(input: {
  readonly plan: LegacyAssetCatalogMigrationPlan;
  readonly applyResult: LegacyAssetMigrationApplyResult;
  readonly host: LegacyAssetMigrationExecutionHost;
  readonly recoveredAt: string;
}): Promise<LegacyAssetMigrationRecoveryResult> {
  const archive = input.applyResult.archive;
  if (
    input.applyResult.planId !== input.plan.planId ||
    archive.digest !== input.plan.archive.digest ||
    archive.workspacePath !== input.plan.archive.workspacePath ||
    !isTimestamp(input.recoveredAt)
  ) {
    throw new LegacyAssetMigrationExecutionError('migration-recovery-failed');
  }
  return input.host.runExclusive(async () => {
    if ((await input.host.readProjectRevision()) !== input.applyResult.projectRevision) {
      throw new LegacyAssetMigrationExecutionError('migration-recovery-failed');
    }
    await assertRecoveryOutputPreconditions(input.plan, input.host);
    const bytes = await input.host.readWorkspaceFile(archive.workspacePath);
    if (!bytes || hashBytes(bytes) !== archive.digest) {
      throw new LegacyAssetMigrationExecutionError('migration-recovery-failed');
    }
    const payload = parseArchivePayload(bytes);
    if (
      !payload ||
      payload.inspectionId !== input.plan.inspectionId ||
      payload.projectRevision !== input.plan.precondition.projectRevision
    ) {
      throw new LegacyAssetMigrationExecutionError('migration-recovery-failed');
    }

    const archivedFilePaths = new Set(
      payload.sources
        .filter((source) => source.kind === 'project-file')
        .map((source) => source.workspacePath),
    );
    const recoveryPaths = new Set(archivedFilePaths);
    for (const output of input.plan.outputs) {
      if (output.kind !== 'rebuild-projection') recoveryPaths.add(output.workspacePath);
    }
    const fileSnapshots = await capturePaths([...recoveryPaths], input.host);
    const localSnapshots = await captureLocalProjectionSnapshots(payload, input.host);
    const projectionSnapshots = await capturePlanProjectionSnapshots(input.plan, input.host);
    try {
      for (const source of payload.sources) {
        if (source.kind === 'project-file') {
          await input.host.writeWorkspaceFileAtomic(source.workspacePath, source.bytes);
        } else {
          await input.host.writeLocalProjection(source.sourceId, {
            revision: source.revision,
            records: source.records,
          });
        }
      }
      for (const output of input.plan.outputs) {
        if (output.kind === 'write-project-file' && !archivedFilePaths.has(output.workspacePath)) {
          await input.host.removeWorkspaceFileAtomic(output.workspacePath);
        } else if (output.kind === 'rebuild-projection') {
          await input.host.clearProjection(output.projection);
        }
      }
      return {
        planId: input.plan.planId,
        archiveDigest: archive.digest,
        recoveredAt: input.recoveredAt,
      };
    } catch {
      try {
        await rollbackProjections(projectionSnapshots, input.host);
        await rollbackLocalProjections(localSnapshots, input.host);
        await rollbackFiles(fileSnapshots, input.host);
      } catch {
        throw new LegacyAssetMigrationExecutionError('migration-rollback-failed');
      }
      throw new LegacyAssetMigrationExecutionError('migration-recovery-failed');
    }
  });
}

async function assertRecoveryOutputPreconditions(
  plan: LegacyAssetCatalogMigrationPlan,
  host: LegacyAssetMigrationExecutionHost,
): Promise<void> {
  for (const output of plan.outputs) {
    if (output.kind === 'rebuild-projection') continue;
    const current = await host.readWorkspaceFile(output.workspacePath);
    if (output.kind === 'write-project-file') {
      if (!current || hashBytes(current) !== output.digest) {
        throw new LegacyAssetMigrationExecutionError('migration-recovery-failed');
      }
    } else if (current) {
      throw new LegacyAssetMigrationExecutionError('migration-recovery-failed');
    }
  }
}

function assertApplyInputs(input: {
  readonly session: LegacyAssetCatalogInspectionSession;
  readonly plan: LegacyAssetCatalogMigrationPlan;
  readonly approval: LegacyAssetMigrationApproval;
  readonly outputs: readonly LegacyAssetPreparedMigrationOutput[];
  readonly appliedAt: string;
}): void {
  if (
    !isLegacyAssetCatalogMigrationPlan(input.plan) ||
    input.plan.status === 'blocked' ||
    input.plan.inspectionId !== input.session.inspection.inspectionId ||
    input.approval.planId !== input.plan.planId ||
    input.approval.archiveDigest !== input.plan.archive.digest ||
    !sameStringSet(input.approval.confirmationIds, input.plan.confirmationIds) ||
    !isTimestamp(input.approval.confirmedAt) ||
    !isTimestamp(input.appliedAt)
  ) {
    throw new LegacyAssetMigrationExecutionError('migration-approval-required');
  }
  const projected = input.outputs.map(projectPreparedOutput);
  if (JSON.stringify(projected) !== JSON.stringify(input.plan.outputs)) {
    throw new LegacyAssetMigrationExecutionError('migration-precondition-failed');
  }
}

async function assertOutputPreconditions(
  outputs: readonly LegacyAssetPreparedMigrationOutput[],
  host: LegacyAssetMigrationExecutionHost,
): Promise<void> {
  for (const output of outputs) {
    if (output.kind === 'rebuild-projection') continue;
    const current = await host.readWorkspaceFile(output.workspacePath);
    if (output.kind === 'write-project-file') {
      const currentDigest = current ? hashBytes(current) : null;
      if (currentDigest !== output.expectedCurrentDigest) {
        throw new LegacyAssetMigrationExecutionError('migration-precondition-failed');
      }
    } else if (!current || hashBytes(current) !== output.expectedDigest) {
      throw new LegacyAssetMigrationExecutionError('migration-precondition-failed');
    }
  }
}

async function applyPreparedOutputs(
  outputs: readonly LegacyAssetPreparedMigrationOutput[],
  host: LegacyAssetMigrationExecutionHost,
): Promise<void> {
  for (const output of outputs) {
    if (output.kind === 'write-project-file') {
      await host.writeWorkspaceFileAtomic(output.workspacePath, output.bytes);
    } else if (output.kind === 'remove-legacy-file') {
      await host.removeWorkspaceFileAtomic(output.workspacePath);
    } else {
      await host.rebuildProjection(output.projection);
    }
  }
}

interface FileSnapshot {
  readonly workspacePath: string;
  readonly bytes?: Uint8Array;
}

async function captureFileSnapshots(
  outputs: readonly LegacyAssetPreparedMigrationOutput[],
  host: LegacyAssetMigrationExecutionHost,
): Promise<readonly FileSnapshot[]> {
  return capturePaths(
    outputs.flatMap((output) =>
      output.kind === 'rebuild-projection' ? [] : [output.workspacePath],
    ),
    host,
  );
}

async function capturePaths(
  paths: readonly string[],
  host: LegacyAssetMigrationExecutionHost,
): Promise<readonly FileSnapshot[]> {
  const snapshots: FileSnapshot[] = [];
  for (const workspacePath of [...new Set(paths)]) {
    const bytes = await host.readWorkspaceFile(workspacePath);
    snapshots.push({ workspacePath, ...(bytes ? { bytes: bytes.slice() } : {}) });
  }
  return snapshots;
}

interface ProjectionSnapshot {
  readonly projection: LegacyAssetRebuildableProjection;
  readonly snapshot: unknown;
}

async function captureProjectionSnapshots(
  outputs: readonly LegacyAssetPreparedMigrationOutput[],
  host: LegacyAssetMigrationExecutionHost,
): Promise<readonly ProjectionSnapshot[]> {
  const projections = [
    ...new Set(
      outputs.flatMap((output) =>
        output.kind === 'rebuild-projection' ? [output.projection] : [],
      ),
    ),
  ];
  const snapshots: ProjectionSnapshot[] = [];
  for (const projection of projections) {
    snapshots.push({ projection, snapshot: await host.captureProjection(projection) });
  }
  return snapshots;
}

async function capturePlanProjectionSnapshots(
  plan: LegacyAssetCatalogMigrationPlan,
  host: LegacyAssetMigrationExecutionHost,
): Promise<readonly ProjectionSnapshot[]> {
  const outputs: LegacyAssetPreparedMigrationOutput[] = plan.outputs.flatMap((output) =>
    output.kind === 'rebuild-projection' ? [output] : [],
  );
  return captureProjectionSnapshots(outputs, host);
}

async function rollbackFiles(
  snapshots: readonly FileSnapshot[],
  host: LegacyAssetMigrationExecutionHost,
): Promise<void> {
  for (const snapshot of [...snapshots].reverse()) {
    if (snapshot.bytes) {
      await host.writeWorkspaceFileAtomic(snapshot.workspacePath, snapshot.bytes);
    } else {
      await host.removeWorkspaceFileAtomic(snapshot.workspacePath);
    }
  }
}

async function rollbackProjections(
  snapshots: readonly ProjectionSnapshot[],
  host: LegacyAssetMigrationExecutionHost,
): Promise<void> {
  for (const snapshot of [...snapshots].reverse()) {
    await host.restoreProjection(snapshot.projection, snapshot.snapshot);
  }
}

interface LocalProjectionSnapshot {
  readonly sourceId: string;
  readonly snapshot?: LegacyAssetProjectionSnapshot;
}

async function captureLocalProjectionSnapshots(
  payload: ArchivePayload,
  host: LegacyAssetMigrationExecutionHost,
): Promise<readonly LocalProjectionSnapshot[]> {
  const snapshots: LocalProjectionSnapshot[] = [];
  for (const source of payload.sources) {
    if (source.kind !== 'local-projection') continue;
    const snapshot = await host.readLocalProjection(source.sourceId);
    snapshots.push({ sourceId: source.sourceId, ...(snapshot ? { snapshot } : {}) });
  }
  return snapshots;
}

async function rollbackLocalProjections(
  snapshots: readonly LocalProjectionSnapshot[],
  host: LegacyAssetMigrationExecutionHost,
): Promise<void> {
  for (const item of [...snapshots].reverse()) {
    if (item.snapshot) {
      await host.writeLocalProjection(item.sourceId, item.snapshot);
    } else {
      await host.removeLocalProjection(item.sourceId);
    }
  }
}

function projectPreparedOutput(
  output: LegacyAssetPreparedMigrationOutput,
): LegacyAssetMigrationOutput {
  if (output.kind === 'write-project-file') {
    return {
      kind: output.kind,
      workspacePath: output.workspacePath,
      expectedCurrentDigest: output.expectedCurrentDigest,
      digest: hashBytes(output.bytes),
    };
  }
  return output;
}

function assertUniqueOutputs(outputs: readonly LegacyAssetMigrationOutput[]): void {
  const keys = outputs.map((output) =>
    output.kind === 'rebuild-projection'
      ? `projection:${output.projection}`
      : `file:${output.workspacePath}`,
  );
  if (new Set(keys).size !== keys.length) {
    throw new Error('Legacy Asset migration outputs must be unique.');
  }
  for (const output of outputs) {
    if (
      output.kind !== 'rebuild-projection' &&
      normalizeWorkspaceContentPath(output.workspacePath) !== output.workspacePath
    ) {
      throw new Error('Legacy Asset migration output path must be workspace-relative.');
    }
  }
}

type ArchiveSource =
  | {
      readonly kind: 'project-file';
      readonly sourceId: string;
      readonly workspacePath: string;
      readonly bytes: Uint8Array;
    }
  | {
      readonly kind: 'local-projection';
      readonly sourceId: string;
      readonly revision: string;
      readonly records: readonly unknown[];
    };

interface ArchivePayload {
  readonly inspectionId: string;
  readonly projectRevision: string;
  readonly sources: readonly ArchiveSource[];
}

function parseArchivePayload(bytes: Uint8Array): ArchivePayload | undefined {
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (
      !isRecord(value) ||
      value['version'] !== 1 ||
      typeof value['inspectionId'] !== 'string' ||
      typeof value['projectRevision'] !== 'string' ||
      !Array.isArray(value['sources'])
    ) {
      return undefined;
    }
    const sources: ArchiveSource[] = [];
    for (const source of value['sources']) {
      if (!isRecord(source) || typeof source['sourceId'] !== 'string') return undefined;
      if (
        source['kind'] === 'project-file' &&
        typeof source['workspacePath'] === 'string' &&
        normalizeWorkspaceContentPath(source['workspacePath']) === source['workspacePath'] &&
        source['encoding'] === 'base64' &&
        typeof source['content'] === 'string'
      ) {
        sources.push({
          kind: 'project-file',
          sourceId: source['sourceId'],
          workspacePath: source['workspacePath'],
          bytes: Uint8Array.from(Buffer.from(source['content'], 'base64')),
        });
      } else if (
        source['kind'] === 'local-projection' &&
        typeof source['revision'] === 'string' &&
        Array.isArray(source['records'])
      ) {
        sources.push({
          kind: 'local-projection',
          sourceId: source['sourceId'],
          revision: source['revision'],
          records: source['records'],
        });
      } else {
        return undefined;
      }
    }
    return {
      inspectionId: value['inspectionId'],
      projectRevision: value['projectRevision'],
      sources,
    };
  } catch {
    return undefined;
  }
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    new Set(left).size === left.length &&
    left.every((value) => right.includes(value))
  );
}

function isTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function hashValue(value: unknown): string {
  return hashBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function hashBytes(value: Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
