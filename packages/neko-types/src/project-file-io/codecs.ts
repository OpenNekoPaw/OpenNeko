import { loadNkc, saveNkc } from '../nkc/codec';
import { CURRENT_NKC_VERSION } from '../nkc/migrator';
import { loadNkv, saveNkv } from '../nkv/codec';
import { CURRENT_NKV_VERSION } from '../nkv/types';
import type { CanvasData } from '../types/canvas';
import type { ProjectData } from '../types/project';
import { createProjectFileDiagnostic, type ProjectFileDiagnostic } from './diagnostics';
import {
  ProjectFormatCodecRegistry,
  type ProjectFormatCodec,
  type ProjectFormatMigrationMetadata,
} from './codec';

export const nkvProjectFormatCodec: ProjectFormatCodec<ProjectData> = {
  formatId: 'nkv',
  fileExtensions: ['.nkv'],
  currentVersion: CURRENT_NKV_VERSION,
  load(json) {
    const result = loadNkv(json);
    const diagnostics = validationToDiagnostics(
      result.validation.errors,
      result.validation.warnings,
    );
    const migration: ProjectFormatMigrationMetadata | undefined = result.migration
      ? {
          fromVersion: result.migration.fromVersion,
          toVersion: result.migration.toVersion,
          appliedMigrations: result.migration.appliedMigrations,
          warnings: result.migration.warnings,
        }
      : undefined;
    return {
      document: result.project,
      diagnostics,
      ...(migration ? { migration } : {}),
      compatibility: {
        loadedVersion: result.migration?.fromVersion ?? result.project.version,
        currentVersion: CURRENT_NKV_VERSION,
        mode: result.migration ? 'migrated' : diagnostics.length > 0 ? 'invalid' : 'current',
        readOnly: false,
        warnings: result.migration?.warnings ?? [],
      },
    };
  },
  save(document, context) {
    return { content: saveNkv(document, { indent: context.indent }), diagnostics: [] };
  },
};

export const nkcProjectFormatCodec: ProjectFormatCodec<CanvasData> = {
  formatId: 'nkc',
  fileExtensions: ['.nkc'],
  currentVersion: CURRENT_NKC_VERSION,
  load(json) {
    const result = loadNkc(json);
    const diagnostics = validationToDiagnostics(
      result.validation.errors,
      result.validation.warnings,
    );
    const migration: ProjectFormatMigrationMetadata | undefined = result.migration?.migrated
      ? {
          fromVersion: result.migration.fromVersion,
          toVersion: result.migration.toVersion,
          appliedMigrations: result.migration.steps.map((step) => step.description),
          warnings: result.migration.warnings,
        }
      : undefined;
    return {
      document: result.data,
      diagnostics,
      ...(migration ? { migration } : {}),
      compatibility: {
        loadedVersion: migration?.fromVersion ?? result.data.version,
        currentVersion: CURRENT_NKC_VERSION,
        mode: migration ? 'migrated' : diagnostics.length > 0 ? 'invalid' : 'current',
        readOnly: false,
        warnings: migration?.warnings ?? [],
      },
    };
  },
  save(document, context) {
    return { content: saveNkc(document, { indent: context.indent }), diagnostics: [] };
  },
};

export function createDefaultProjectFormatCodecRegistry(): ProjectFormatCodecRegistry {
  const registry = new ProjectFormatCodecRegistry();
  registry.register(nkvProjectFormatCodec);
  registry.register(nkcProjectFormatCodec);
  return registry;
}

function validationToDiagnostics(
  errors: readonly {
    readonly field: string;
    readonly message: string;
    readonly severity?: string;
  }[],
  warnings: readonly {
    readonly field: string;
    readonly message: string;
    readonly severity?: string;
  }[] = [],
): ProjectFileDiagnostic[] {
  return [
    ...errors.map((error) =>
      createProjectFileDiagnostic({
        code: error.message.toLowerCase().includes('json parse')
          ? 'invalid-json'
          : 'invalid-document',
        severity: 'error',
        message: error.field ? `${error.field}: ${error.message}` : error.message,
        path: error.field ? fieldToPath(error.field) : undefined,
      }),
    ),
    ...warnings.map((warning) =>
      createProjectFileDiagnostic({
        code: 'invalid-document',
        severity: 'warning',
        message: warning.field ? `${warning.field}: ${warning.message}` : warning.message,
        path: warning.field ? fieldToPath(warning.field) : undefined,
      }),
    ),
  ];
}

function fieldToPath(field: string): readonly (string | number)[] {
  if (!field) return [];
  return field
    .split('.')
    .filter(Boolean)
    .map((part) => {
      const index = Number(part);
      return Number.isInteger(index) && String(index) === part ? index : part;
    });
}
