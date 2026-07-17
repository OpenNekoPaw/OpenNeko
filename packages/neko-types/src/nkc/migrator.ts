// =============================================================================
// NKC Format SDK — Migrator
//
// Conservative, loss-preserving migrations for .nkc Canvas files.
// =============================================================================

import type { CanvasData } from '../types/canvas';

export type NkcVersion = '1.0' | '2.0' | '2.1';

export const CURRENT_NKC_VERSION: NkcVersion = '2.1';

export interface NkcMigrationStep {
  from: string;
  to: string;
  description: string;
}

export interface NkcMigrationResult {
  data: CanvasData;
  fromVersion: string;
  toVersion: NkcVersion;
  migrated: boolean;
  steps: NkcMigrationStep[];
  warnings: string[];
}

export function detectNkcVersion(data: unknown): string | undefined {
  if (isRecord(data) && typeof data['version'] === 'string') {
    return data['version'];
  }

  return undefined;
}

export function migrateNkc(data: CanvasData): NkcMigrationResult {
  const fromVersion = detectNkcVersion(data) ?? '1.0';

  if (fromVersion === CURRENT_NKC_VERSION) {
    return {
      data,
      fromVersion,
      toVersion: CURRENT_NKC_VERSION,
      migrated: false,
      steps: [],
      warnings: [],
    };
  }

  const steps: NkcMigrationStep[] = [];
  let migrated: CanvasData = data;

  if (fromVersion === '2.0') {
    migrated = migrateNkcV2ToV2_1(migrated);
    steps.push({
      from: '2.0',
      to: '2.1',
      description: 'Normalized NKC v2.0 Canvas data to the v2.1 optional extension version.',
    });
  } else {
    migrated = migrateNkcV1ToV2(migrated);
    steps.push({
      from: fromVersion,
      to: '2.0',
      description: 'Normalized prelaunch NKC Canvas data to the v2.0 version marker.',
    });

    migrated = migrateNkcV2ToV2_1(migrated);
    steps.push({
      from: '2.0',
      to: '2.1',
      description: 'Normalized NKC v2.0 Canvas data to the v2.1 optional extension version.',
    });
  }

  return {
    data: migrated,
    fromVersion,
    toVersion: CURRENT_NKC_VERSION,
    migrated: true,
    steps,
    warnings:
      fromVersion === '1.0' || fromVersion === '2.0'
        ? []
        : [
            `Unknown NKC version "${fromVersion}" migrated through the canonical version normalizer.`,
          ],
  };
}

export function migrateNkcV1ToV2(data: CanvasData): CanvasData {
  return {
    ...data,
    version: '2.0',
    nodes: data.nodes.map((node) => ({ ...node })),
    connections: data.connections.map((connection) => ({ ...connection })),
  };
}

export function migrateNkcV2ToV2_1(data: CanvasData): CanvasData {
  return {
    ...data,
    version: CURRENT_NKC_VERSION,
    nodes: data.nodes.map((node) => ({ ...node })),
    connections: data.connections.map((connection) => ({ ...connection })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
