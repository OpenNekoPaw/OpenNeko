import type { NksDocument, NksDocumentVersion } from '../types/sketch';
import { CURRENT_NKS_VERSION } from '../types/sketch';

export interface NksMigrationResult {
  readonly data: NksDocument;
  readonly fromVersion: NksDocumentVersion;
  readonly toVersion: NksDocumentVersion;
  readonly appliedMigrations: readonly string[];
  readonly warnings: readonly string[];
}

interface MigrationStep {
  readonly from: NksDocumentVersion;
  readonly to: NksDocumentVersion;
  readonly description: string;
  apply(input: unknown): { readonly data: unknown; readonly warnings: readonly string[] };
}

const MIGRATIONS: readonly MigrationStep[] = [
  {
    from: '1.0',
    to: '1.1',
    description: 'nks-1.0-to-1.1',
    apply: withVersion('1.1'),
  },
  {
    from: '1.1',
    to: '1.2',
    description: 'nks-1.1-to-1.2',
    apply: withVersion('1.2'),
  },
];

export function detectNksVersion(data: unknown): NksDocumentVersion | null {
  if (!isRecord(data)) {
    return null;
  }
  const version = data['version'];
  return isNksDocumentVersion(version) ? version : null;
}

export function migrateNks(data: unknown): NksMigrationResult {
  const detected = detectNksVersion(data) ?? '1.0';
  const warnings: string[] = [];
  const appliedMigrations: string[] = [];
  let current: unknown = data;
  let currentVersion = detected;

  while (currentVersion !== CURRENT_NKS_VERSION) {
    const step = MIGRATIONS.find((candidate) => candidate.from === currentVersion);
    if (!step) {
      warnings.push(`No migration path from ${currentVersion} to ${CURRENT_NKS_VERSION}`);
      break;
    }
    const result = step.apply(current);
    current = result.data;
    warnings.push(...result.warnings);
    appliedMigrations.push(step.description);
    currentVersion = step.to;
  }

  return {
    data: ensureNksDocument(current),
    fromVersion: detected,
    toVersion: CURRENT_NKS_VERSION,
    appliedMigrations,
    warnings,
  };
}

function withVersion(version: NksDocumentVersion): MigrationStep['apply'] {
  return (input) => ({
    data: isRecord(input) ? { ...input, version } : { version },
    warnings: [],
  });
}

function ensureNksDocument(data: unknown): NksDocument {
  const base = isRecord(data) ? data : {};
  return {
    ...base,
    version: CURRENT_NKS_VERSION,
    canvas: readCanvas(base['canvas']),
    layers: Array.isArray(base['layers']) ? (base['layers'] as NksDocument['layers']) : [],
    brushPresets: Array.isArray(base['brushPresets'])
      ? (base['brushPresets'] as NksDocument['brushPresets'])
      : [],
    palette: Array.isArray(base['palette']) ? (base['palette'] as string[]) : [],
    viewport: readViewport(base['viewport']),
  };
}

function readCanvas(value: unknown): NksDocument['canvas'] {
  const canvas = isRecord(value) ? value : {};
  return {
    width: readNumber(canvas['width'], 1920),
    height: readNumber(canvas['height'], 1080),
    dpi: readNumber(canvas['dpi'], 72),
    backgroundColor:
      typeof canvas['backgroundColor'] === 'string' ? canvas['backgroundColor'] : '#ffffff',
  };
}

function readViewport(value: unknown): NksDocument['viewport'] {
  const viewport = isRecord(value) ? value : {};
  return {
    panX: readNumber(viewport['panX'], 0),
    panY: readNumber(viewport['panY'], 0),
    zoom: readNumber(viewport['zoom'], 1),
    rotation: readNumber(viewport['rotation'], 0),
  };
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isNksDocumentVersion(value: unknown): value is NksDocumentVersion {
  return value === '1.0' || value === '1.1' || value === '1.2';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
