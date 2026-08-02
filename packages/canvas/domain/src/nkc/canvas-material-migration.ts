import type {
  CanvasData,
  CanvasMaterialGenerationContext,
  CanvasNode,
  FileCanvasNode,
  MediaCanvasNode,
} from '../types/canvas';
import { isCanvasMaterialGenerationContext } from '../types/canvas';
import {
  isCanvasGenerationEvidence,
  validateCanvasMaterialNodePersistence,
  type CanvasGenerationEvidence,
} from '../types/canvas-material-contracts';
import { validateContentLocator, type ContentLocator } from '@neko/content';

export const CANVAS_MATERIAL_LEGACY_EVIDENCE_KINDS = [
  'generated-path',
  'generated-resource-ref',
  'generated-provenance',
  'legacy-generation-context',
  'job-output-ref',
] as const;

export type CanvasMaterialLegacyEvidenceKind =
  (typeof CANVAS_MATERIAL_LEGACY_EVIDENCE_KINDS)[number];

export type CanvasMaterialLegacyInspectionStatus =
  | 'canonical-referenced'
  | 'canonical-generated'
  | 'migratable-generated'
  | 'migration-required'
  | 'invalid';

export interface CanvasMaterialLegacyInspection {
  readonly nodeId: string;
  readonly status: CanvasMaterialLegacyInspectionStatus;
  readonly evidence: readonly CanvasMaterialLegacyEvidenceKind[];
  readonly diagnostics: readonly string[];
  readonly locator?: ContentLocator;
  readonly generation?: CanvasGenerationEvidence;
}

export type CanvasMaterialDocumentMigrationResult =
  | {
      readonly status: 'unchanged' | 'migrated';
      readonly data: CanvasData;
      readonly inspections: readonly CanvasMaterialLegacyInspection[];
      readonly migratedNodeIds: readonly string[];
      readonly diagnostics: readonly string[];
    }
  | {
      readonly status: 'migration-required' | 'invalid';
      /** The original document is returned unchanged when migration is blocked. */
      readonly data: CanvasData;
      readonly inspections: readonly CanvasMaterialLegacyInspection[];
      readonly migratedNodeIds: readonly [];
      readonly diagnostics: readonly string[];
    };

interface CanvasMaterialInspectionContext {
  readonly generationJobIdsByOutputNodeId: ReadonlyMap<string, readonly string[]>;
}

/**
 * Explicit inspection entry for legacy material evidence.
 *
 * Normal Canvas authoring and presentation must derive origin only from a
 * validated ContentLocator and must not call this function.
 */
export function inspectLegacyCanvasMaterialNodes(
  data: CanvasData,
): readonly CanvasMaterialLegacyInspection[] {
  const context: CanvasMaterialInspectionContext = {
    generationJobIdsByOutputNodeId: indexGenerationJobsByOutputNodeId(data.nodes),
  };
  return data.nodes.flatMap((node) => {
    if (node.type !== 'media' && node.type !== 'file') return [];
    return [inspectMaterialNode(node, context)];
  });
}

/**
 * Pure, bounded migration for canonical material nodes.
 *
 * This function never reads, moves, deletes, or overwrites user files. It
 * migrates only generated nodes that already carry a valid generated-output
 * locator, a valid legacy summary, and one unambiguous Job projection that
 * names the node as an output.
 */
export function migrateCanvasMaterialNodes(
  data: CanvasData,
): CanvasMaterialDocumentMigrationResult {
  const inspections = inspectLegacyCanvasMaterialNodes(data);
  const invalid = inspections.filter((inspection) => inspection.status === 'invalid');
  if (invalid.length > 0) {
    return blockedMigrationResult('invalid', data, inspections, invalid);
  }

  const migrationRequired = inspections.filter(
    (inspection) => inspection.status === 'migration-required',
  );
  if (migrationRequired.length > 0) {
    return blockedMigrationResult('migration-required', data, inspections, migrationRequired);
  }

  const migrations = new Map(
    inspections
      .filter(
        (
          inspection,
        ): inspection is CanvasMaterialLegacyInspection & {
          readonly status: 'migratable-generated';
          readonly generation: CanvasGenerationEvidence;
        } => inspection.status === 'migratable-generated' && inspection.generation !== undefined,
      )
      .map((inspection) => [inspection.nodeId, inspection.generation]),
  );
  if (migrations.size === 0) {
    return {
      status: 'unchanged',
      data,
      inspections,
      migratedNodeIds: [],
      diagnostics: [],
    };
  }

  const nodes = data.nodes.map((node) => {
    const generation = migrations.get(node.id);
    if (!generation) return node;
    return migrateMaterialNode(node, generation);
  });
  return {
    status: 'migrated',
    data: { ...data, nodes },
    inspections,
    migratedNodeIds: [...migrations.keys()],
    diagnostics: [],
  };
}

function inspectMaterialNode(
  node: MediaCanvasNode | FileCanvasNode,
  context: CanvasMaterialInspectionContext,
): CanvasMaterialLegacyInspection {
  const data = node.data;
  const evidence = collectLegacyEvidence(node, context);
  const locator = validateContentLocator(data.contentLocator);
  const persistenceDiagnostics = validateCanvasMaterialNodePersistence(
    node.type,
    data,
    `node:${node.id}.data`,
  );
  const fatalPersistenceDiagnostics = persistenceDiagnostics.filter(
    (diagnostic) =>
      diagnostic.code !== 'canvas-material-content-locator-required' &&
      diagnostic.code !== 'canvas-material-generation-evidence-required' &&
      diagnostic.code !== 'canvas-material-legacy-generation-evidence',
  );
  if (hasInvalidRuntimeIdentity(node) || fatalPersistenceDiagnostics.length > 0) {
    return {
      nodeId: node.id,
      status: 'invalid',
      evidence,
      diagnostics: [
        ...(hasInvalidRuntimeIdentity(node)
          ? ['Canvas material contains an absolute, runtime, temporary, or cache path.']
          : []),
        ...fatalPersistenceDiagnostics.map((diagnostic) => diagnostic.message),
      ],
      ...(locator.ok ? { locator: locator.locator } : {}),
    };
  }

  if (!locator.ok) {
    const legacyMessage =
      evidence.length > 0
        ? 'Legacy evidence cannot establish generated material identity without a valid ContentLocator.'
        : 'Canvas material requires an explicit ContentLocator before it can be migrated.';
    return {
      nodeId: node.id,
      status: data.contentLocator === undefined ? 'migration-required' : 'invalid',
      evidence,
      diagnostics: [legacyMessage],
    };
  }

  if (locator.locator.kind !== 'generated-output') {
    if (data.generation !== undefined || evidence.length > 0) {
      return {
        nodeId: node.id,
        status: 'migration-required',
        evidence,
        diagnostics: [
          'Referenced ContentLocator conflicts with legacy generated evidence; origin was not reclassified.',
        ],
        locator: locator.locator,
      };
    }
    return {
      nodeId: node.id,
      status: 'canonical-referenced',
      evidence: [],
      diagnostics: [],
      locator: locator.locator,
    };
  }

  if (isCanvasGenerationEvidence(data.generation)) {
    if (hasLegacyGenerationContext(data)) {
      return {
        nodeId: node.id,
        status: 'migration-required',
        evidence,
        diagnostics: [
          'Generated node contains both canonical and legacy generation evidence; manual inspection is required.',
        ],
        locator: locator.locator,
        generation: data.generation,
      };
    }
    return {
      nodeId: node.id,
      status: 'canonical-generated',
      evidence,
      diagnostics: [],
      locator: locator.locator,
      generation: data.generation,
    };
  }

  const summary = readLegacyGenerationContext(data);
  const jobIds = context.generationJobIdsByOutputNodeId.get(node.id) ?? [];
  const jobId = jobIds.length === 1 ? jobIds[0] : undefined;
  if (summary && jobId) {
    return {
      nodeId: node.id,
      status: 'migratable-generated',
      evidence,
      diagnostics: [],
      locator: locator.locator,
      generation: {
        jobRef: { kind: 'generation', jobId },
        summary,
      },
    };
  }

  return {
    nodeId: node.id,
    status: 'migration-required',
    evidence,
    diagnostics: [
      jobIds.length > 1
        ? 'Generated node is named by multiple Job outputs and cannot be migrated automatically.'
        : 'Generated node lacks one stable Generation Job output reference and a valid historical summary.',
    ],
    locator: locator.locator,
  };
}

function blockedMigrationResult(
  status: 'migration-required' | 'invalid',
  data: CanvasData,
  inspections: readonly CanvasMaterialLegacyInspection[],
  blockers: readonly CanvasMaterialLegacyInspection[],
): CanvasMaterialDocumentMigrationResult {
  return {
    status,
    data,
    inspections,
    migratedNodeIds: [],
    diagnostics: blockers.flatMap((inspection) =>
      inspection.diagnostics.map(
        (diagnostic) => `Canvas material node "${inspection.nodeId}": ${diagnostic}`,
      ),
    ),
  };
}

function migrateMaterialNode(node: CanvasNode, generation: CanvasGenerationEvidence): CanvasNode {
  if (node.type === 'media') {
    const { generationContext: _legacyGenerationContext, ...data } = node.data;
    return {
      ...node,
      data: {
        ...data,
        generation,
      },
    };
  }
  if (node.type === 'file') {
    const { generationContext: _legacyGenerationContext, ...data } = node.data;
    return {
      ...node,
      data: {
        ...data,
        generation,
      },
    };
  }
  throw new Error(`Canvas material migration cannot migrate node type "${node.type}".`);
}

function indexGenerationJobsByOutputNodeId(
  nodes: readonly CanvasNode[],
): ReadonlyMap<string, readonly string[]> {
  const jobIdsByNodeId = new Map<string, string[]>();
  for (const node of nodes) {
    if (
      node.type !== 'job' ||
      node.data.jobRef.kind !== 'generation' ||
      !node.data.jobRef.jobId.trim()
    ) {
      continue;
    }
    for (const output of node.data.outputRefs) {
      if (output.kind !== 'canvas-node' || !output.nodeId.trim()) continue;
      const jobIds = jobIdsByNodeId.get(output.nodeId) ?? [];
      jobIds.push(node.data.jobRef.jobId);
      jobIdsByNodeId.set(output.nodeId, jobIds);
    }
  }
  return jobIdsByNodeId;
}

function collectLegacyEvidence(
  node: MediaCanvasNode | FileCanvasNode,
  context: CanvasMaterialInspectionContext,
): readonly CanvasMaterialLegacyEvidenceKind[] {
  const data = node.data;
  const evidence = new Set<CanvasMaterialLegacyEvidenceKind>();
  const path = node.type === 'media' ? node.data.assetPath : node.data.path;
  if (isLegacyGeneratedPath(path)) evidence.add('generated-path');
  if (hasLegacyGeneratedProvenance(data.provenance)) evidence.add('generated-provenance');
  if (hasLegacyGenerationContext(data)) evidence.add('legacy-generation-context');
  if ((context.generationJobIdsByOutputNodeId.get(node.id)?.length ?? 0) > 0) {
    evidence.add('job-output-ref');
  }
  return [...evidence];
}

function hasLegacyGenerationContext(
  data: MediaCanvasNode['data'] | FileCanvasNode['data'],
): boolean {
  return data.generationContext !== undefined;
}

function readLegacyGenerationContext(
  data: MediaCanvasNode['data'] | FileCanvasNode['data'],
): CanvasMaterialGenerationContext | undefined {
  return isCanvasMaterialGenerationContext(data.generationContext)
    ? data.generationContext
    : undefined;
}

function isLegacyGeneratedPath(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().replace(/\\/gu, '/').replace(/^\.\//u, '');
  return /^(?:\$\{[A-Z][A-Z0-9_]*\}\/)?neko\/generated\//u.test(normalized);
}

function hasLegacyGeneratedProvenance(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, entry]) => {
    if (typeof entry === 'string') {
      const normalized = entry.trim().toLowerCase();
      return (
        normalized.startsWith('generated-output:') ||
        (key.toLowerCase().includes('generation') && normalized.length > 0)
      );
    }
    if (Array.isArray(entry)) return entry.some(hasLegacyGeneratedProvenance);
    return hasLegacyGeneratedProvenance(entry);
  });
}

function hasInvalidRuntimeIdentity(node: MediaCanvasNode | FileCanvasNode): boolean {
  const candidates =
    node.type === 'media'
      ? [node.data.assetPath, node.data.runtimeAssetPath, node.data.thumbnailPath]
      : [node.data.path, node.data.runtimePath];
  return candidates.some(isInvalidPersistedPath);
}

function isInvalidPersistedPath(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0) return false;
  const normalized = value.replace(/\\/gu, '/');
  return (
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//u.test(normalized) ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(normalized) ||
    normalized.startsWith('.neko/.cache/') ||
    normalized.startsWith('neko/.cache/') ||
    normalized.includes('/.tmp/') ||
    normalized.includes('/tmp/')
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
