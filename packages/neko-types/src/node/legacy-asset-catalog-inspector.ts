import { createHash } from 'node:crypto';
import {
  LEGACY_ASSET_MIGRATION_CONTRACT_VERSION,
  createSafeLegacyAssetMigrationDiagnostic,
  isLegacyAssetCatalogInspection,
  type LegacyAssetCatalogInspection,
  type LegacyAssetInspectionFileRole,
  type LegacyAssetInspectionSource,
  type LegacyAssetMigrationDiagnostic,
} from '../types/legacy-asset-catalog-migration';
import { normalizeWorkspaceContentPath } from '../types/content-locator';

export const DEFAULT_LEGACY_ASSET_INSPECTION_FILES = [
  {
    sourceId: 'asset-catalog',
    role: 'asset-catalog',
    workspacePath: 'neko/assets/library.json',
    required: false,
  },
  {
    sourceId: 'entity-bindings',
    role: 'entity-bindings',
    workspacePath: 'neko/entity-bindings.json',
    required: false,
  },
] as const satisfies readonly LegacyAssetInspectionFileInput[];

export interface LegacyAssetInspectionFileInput {
  readonly sourceId: string;
  readonly role: LegacyAssetInspectionFileRole;
  readonly workspacePath: string;
  readonly required?: boolean;
}

export interface LegacyAssetSearchProjectionInput {
  readonly sourceId: string;
  readonly revision: string;
  readonly records: readonly unknown[];
}

export interface LegacyAssetInspectionReader {
  readWorkspaceFile(workspacePath: string): Promise<Uint8Array | undefined>;
}

export type LegacyAssetInspectionFindingKind =
  | 'asset-entity-record'
  | 'asset-variant-record'
  | 'asset-file-record'
  | 'entity-asset-binding'
  | 'project-asset-reference'
  | 'asset-search-record';

export interface LegacyAssetInspectionFinding {
  readonly findingId: string;
  readonly sourceId: string;
  readonly kind: LegacyAssetInspectionFindingKind;
  readonly fieldPath: readonly (string | number)[];
  readonly valueDigest: string;
}

export type LegacyAssetArchiveInput =
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

export interface LegacyAssetCatalogInspectionSession {
  readonly inspection: LegacyAssetCatalogInspection;
  readonly findings: readonly LegacyAssetInspectionFinding[];
  readonly archiveInputs: readonly LegacyAssetArchiveInput[];
}

export async function inspectLegacyAssetCatalog(input: {
  readonly projectRevision: string;
  readonly inspectedAt: string;
  readonly reader: LegacyAssetInspectionReader;
  readonly files?: readonly LegacyAssetInspectionFileInput[];
  readonly searchProjection?: LegacyAssetSearchProjectionInput;
}): Promise<LegacyAssetCatalogInspectionSession> {
  const files = input.files ?? DEFAULT_LEGACY_ASSET_INSPECTION_FILES;
  assertUniqueSourceIds(files, input.searchProjection);

  const sources: LegacyAssetInspectionSource[] = [];
  const findings: LegacyAssetInspectionFinding[] = [];
  const archiveInputs: LegacyAssetArchiveInput[] = [];
  const diagnostics: LegacyAssetMigrationDiagnostic[] = [];

  for (const file of files) {
    assertFileInput(file);
    const bytes = await input.reader.readWorkspaceFile(file.workspacePath);
    if (!bytes) {
      if (file.required) {
        diagnostics.push(
          createSafeLegacyAssetMigrationDiagnostic('source-missing', {
            sourceId: file.sourceId,
          }),
        );
      }
      continue;
    }

    const parsed = parseJson(bytes);
    const digest = hashBytes(bytes);
    const source: LegacyAssetInspectionSource = {
      kind: 'project-file',
      sourceId: file.sourceId,
      role: file.role,
      workspacePath: file.workspacePath,
      digest,
      byteLength: bytes.byteLength,
      ...(readSchemaVersion(parsed) ? { schemaVersion: readSchemaVersion(parsed) } : {}),
    };
    sources.push(source);
    archiveInputs.push({
      kind: 'project-file',
      sourceId: file.sourceId,
      workspacePath: file.workspacePath,
      bytes: bytes.slice(),
    });

    if (!parsed.ok) {
      diagnostics.push(
        createSafeLegacyAssetMigrationDiagnostic('invalid-record', {
          sourceId: file.sourceId,
        }),
      );
      continue;
    }
    inspectParsedFile(file, parsed.value, findings, diagnostics);
  }

  if (input.searchProjection) {
    const search = input.searchProjection;
    assertSafeSourceId(search.sourceId);
    const projectionBytes = new TextEncoder().encode(JSON.stringify(search.records));
    sources.push({
      kind: 'local-projection',
      sourceId: search.sourceId,
      partition: 'asset-library',
      revision: search.revision,
      digest: hashBytes(projectionBytes),
      recordCount: search.records.length,
    });
    archiveInputs.push({
      kind: 'local-projection',
      sourceId: search.sourceId,
      revision: search.revision,
      records: structuredClone(search.records),
    });
    search.records.forEach((record, index) => {
      addFinding(findings, search.sourceId, 'asset-search-record', ['records', index], record);
      inspectProjectAssetReferences(record, search.sourceId, ['records', index], findings);
    });
  }

  const preconditionSources = sources.map((source) => ({
    sourceId: source.sourceId,
    digest: source.digest,
  }));
  const inspectionDigest = hashText(
    JSON.stringify({ projectRevision: input.projectRevision, sources: preconditionSources }),
  );
  const inspection: LegacyAssetCatalogInspection = {
    version: LEGACY_ASSET_MIGRATION_CONTRACT_VERSION,
    inspectionId: `inspection-${inspectionDigest.slice('sha256:'.length, 26)}`,
    inspectedAt: input.inspectedAt,
    status: diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 'blocked' : 'ready',
    precondition: {
      projectRevision: input.projectRevision,
      sources: preconditionSources,
    },
    sources,
    legacyRecordCount: findings.length,
    diagnostics,
  };
  if (!isLegacyAssetCatalogInspection(inspection)) {
    throw new Error('Legacy Asset inspection produced an invalid safe contract.');
  }
  return { inspection, findings, archiveInputs };
}

function inspectParsedFile(
  file: LegacyAssetInspectionFileInput,
  value: unknown,
  findings: LegacyAssetInspectionFinding[],
  diagnostics: LegacyAssetMigrationDiagnostic[],
): void {
  if (file.role === 'asset-catalog') {
    inspectAssetCatalog(file.sourceId, value, findings, diagnostics);
  } else if (file.role === 'entity-bindings') {
    inspectEntityBindings(file.sourceId, value, findings, diagnostics);
  }
  inspectProjectAssetReferences(value, file.sourceId, [], findings);
}

function inspectAssetCatalog(
  sourceId: string,
  value: unknown,
  findings: LegacyAssetInspectionFinding[],
  diagnostics: LegacyAssetMigrationDiagnostic[],
): void {
  if (!isRecord(value) || value['version'] !== 1) {
    diagnostics.push(createSafeLegacyAssetMigrationDiagnostic('unsupported-version', { sourceId }));
    return;
  }
  if (!Array.isArray(value['entities'])) {
    diagnostics.push(createSafeLegacyAssetMigrationDiagnostic('invalid-record', { sourceId }));
    return;
  }
  value['entities'].forEach((entity, entityIndex) => {
    const entityPath = ['entities', entityIndex] as const;
    addFinding(findings, sourceId, 'asset-entity-record', entityPath, entity);
    if (!isRecord(entity) || !Array.isArray(entity['variants'])) return;
    entity['variants'].forEach((variant, variantIndex) => {
      const variantPath = [...entityPath, 'variants', variantIndex] as const;
      addFinding(findings, sourceId, 'asset-variant-record', variantPath, variant);
      if (!isRecord(variant) || !Array.isArray(variant['files'])) return;
      variant['files'].forEach((file, fileIndex) => {
        addFinding(
          findings,
          sourceId,
          'asset-file-record',
          [...variantPath, 'files', fileIndex],
          file,
        );
      });
    });
  });
}

function inspectEntityBindings(
  sourceId: string,
  value: unknown,
  findings: LegacyAssetInspectionFinding[],
  diagnostics: LegacyAssetMigrationDiagnostic[],
): void {
  if (!isRecord(value) || value['version'] !== 1) {
    diagnostics.push(createSafeLegacyAssetMigrationDiagnostic('unsupported-version', { sourceId }));
    return;
  }
  if (!Array.isArray(value['bindings'])) {
    diagnostics.push(createSafeLegacyAssetMigrationDiagnostic('invalid-record', { sourceId }));
    return;
  }
  value['bindings'].forEach((binding, index) => {
    const path = ['bindings', index] as const;
    if (!isRecord(binding) || typeof binding['assetRef'] !== 'string') {
      diagnostics.push(
        createSafeLegacyAssetMigrationDiagnostic('invalid-record', {
          sourceId,
          fieldPath: path,
        }),
      );
      return;
    }
    addFinding(findings, sourceId, 'entity-asset-binding', path, binding);
  });
}

function inspectProjectAssetReferences(
  value: unknown,
  sourceId: string,
  path: readonly (string | number)[],
  findings: LegacyAssetInspectionFinding[],
): void {
  if (typeof value === 'string') {
    if (value.startsWith('project://assets/')) {
      addFinding(findings, sourceId, 'project-asset-reference', safeFieldPath(path), value);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      inspectProjectAssetReferences(item, sourceId, [...path, index], findings),
    );
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    inspectProjectAssetReferences(child, sourceId, [...path, safeFieldSegment(key)], findings);
  }
}

function addFinding(
  findings: LegacyAssetInspectionFinding[],
  sourceId: string,
  kind: LegacyAssetInspectionFindingKind,
  fieldPath: readonly (string | number)[],
  value: unknown,
): void {
  const valueDigest = hashText(JSON.stringify(value));
  findings.push({
    findingId: `finding-${hashText(`${sourceId}:${kind}:${JSON.stringify(fieldPath)}:${valueDigest}`).slice('sha256:'.length, 26)}`,
    sourceId,
    kind,
    fieldPath: safeFieldPath(fieldPath),
    valueDigest,
  });
}

function parseJson(
  bytes: Uint8Array,
): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } catch {
    return { ok: false };
  }
}

function readSchemaVersion(parsed: ReturnType<typeof parseJson>): string | undefined {
  if (!parsed.ok || !isRecord(parsed.value)) return undefined;
  const version = parsed.value['version'];
  return typeof version === 'string' || typeof version === 'number' ? String(version) : undefined;
}

function safeFieldPath(path: readonly (string | number)[]): readonly (string | number)[] {
  return path.length > 0
    ? path.map((segment) => (typeof segment === 'string' ? safeFieldSegment(segment) : segment))
    : ['root'];
}

function safeFieldSegment(value: string): string {
  return /^[\p{L}_][\p{L}\p{N}_-]*$/u.test(value)
    ? value
    : `field_${hashText(value).slice('sha256:'.length, 18)}`;
}

function assertFileInput(input: LegacyAssetInspectionFileInput): void {
  assertSafeSourceId(input.sourceId);
  if (normalizeWorkspaceContentPath(input.workspacePath) !== input.workspacePath) {
    throw new Error('Legacy Asset inspection file must use a normalized workspace-relative path.');
  }
}

function assertUniqueSourceIds(
  files: readonly LegacyAssetInspectionFileInput[],
  search: LegacyAssetSearchProjectionInput | undefined,
): void {
  const sourceIds = [...files.map((file) => file.sourceId), ...(search ? [search.sourceId] : [])];
  if (new Set(sourceIds).size !== sourceIds.length) {
    throw new Error('Legacy Asset inspection source IDs must be unique.');
  }
}

function assertSafeSourceId(value: string): void {
  if (!value || /[\\/:]/u.test(value) || value.includes('${')) {
    throw new Error('Legacy Asset inspection source ID is invalid.');
  }
}

function hashBytes(value: Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function hashText(value: string): string {
  return hashBytes(new TextEncoder().encode(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
