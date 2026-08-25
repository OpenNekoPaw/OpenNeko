import { loadNkc, saveNkc } from '../nkc/codec';
import type { CanvasData } from '../types/canvas';
import {
  createProjectFileDiagnostic,
  type ProjectFileDiagnostic,
} from '@neko/content-domain/project-file-io';
import {
  ProjectFormatCodecRegistry,
  type ProjectFormatCodec,
} from '@neko/content-domain/project-file-io';

export const nkcProjectFormatCodec: ProjectFormatCodec<CanvasData> = {
  formatId: 'nkc',
  fileExtensions: ['.nkc'],
  load(json) {
    const result = loadNkc(json);
    const diagnostics = validationToDiagnostics(
      result.validation.errors,
      result.validation.warnings,
    );
    return {
      document: result.data,
      diagnostics,
    };
  },
  save(document, context) {
    return { content: saveNkc(document, { indent: context.indent }), diagnostics: [] };
  },
};

export function createNkcProjectFormatCodecRegistry(): ProjectFormatCodecRegistry {
  const registry = new ProjectFormatCodecRegistry();
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
