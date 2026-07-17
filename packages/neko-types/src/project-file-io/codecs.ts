import { loadNka, saveNka, CURRENT_NKA_VERSION } from '../nka/codec';
import { loadNkc, saveNkc } from '../nkc/codec';
import { CURRENT_NKC_VERSION } from '../nkc/migrator';
import { migrateNks } from '../nks/migrator';
import { loadNkv, saveNkv } from '../nkv/codec';
import { CURRENT_NKV_VERSION } from '../nkv/types';
import type { AudioProjectData } from '../types/audioProject';
import type { CanvasData } from '../types/canvas';
import {
  createDefaultNkmProject,
  NKM_VERSION,
  type NkmProjectData,
  type NkmSceneProfile,
} from '../types/model-project';
import type { ProjectData } from '../types/project';
import {
  diagnoseNkpSceneAuthoringFields,
  isNkpProjectData,
  type NkpProjectData,
} from '../types/puppet';
import { CURRENT_NKS_VERSION, type NksDocument } from '../types/sketch';
import { createProjectFileDiagnostic, type ProjectFileDiagnostic } from './diagnostics';
import {
  ProjectFormatCodecRegistry,
  type ProjectFormatCodec,
  type ProjectFormatCompatibility,
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

export const nkaProjectFormatCodec: ProjectFormatCodec<AudioProjectData> = {
  formatId: 'nka',
  fileExtensions: ['.nka'],
  currentVersion: CURRENT_NKA_VERSION,
  load(json) {
    const result = loadNka(json);
    const diagnostics = validationToDiagnostics(
      result.validation.errors,
      result.validation.warnings,
    );
    return {
      document: result.data,
      diagnostics: [...diagnostics, ...futureCompatibilityDiagnostics(result.compatibility)],
      compatibility: {
        loadedVersion: result.compatibility.loadedVersion,
        currentVersion: result.compatibility.currentVersion,
        mode: result.compatibility.mode,
        readOnly: result.compatibility.readOnly,
        warnings: result.compatibility.warnings,
      },
    };
  },
  save(document, context) {
    return { content: saveNka(document, { indent: context.indent }), diagnostics: [] };
  },
};

export const nksProjectFormatCodec: ProjectFormatCodec<NksDocument> = {
  formatId: 'nks',
  fileExtensions: ['.nks'],
  currentVersion: CURRENT_NKS_VERSION,
  load(json) {
    const parsed = parseJson(json);
    if (!parsed.ok) {
      return {
        document: createDefaultNksDocument(),
        diagnostics: [parsed.diagnostic],
        compatibility: {
          currentVersion: CURRENT_NKS_VERSION,
          mode: 'invalid',
          readOnly: true,
          warnings: [],
        },
      };
    }

    const migration = migrateNks(parsed.value);
    return {
      document: migration.data,
      diagnostics: [],
      migration:
        migration.appliedMigrations.length > 0
          ? {
              fromVersion: migration.fromVersion,
              toVersion: migration.toVersion,
              appliedMigrations: migration.appliedMigrations,
              warnings: migration.warnings,
            }
          : undefined,
      compatibility: {
        loadedVersion: migration.fromVersion,
        currentVersion: CURRENT_NKS_VERSION,
        mode: migration.appliedMigrations.length > 0 ? 'migrated' : 'current',
        readOnly: false,
        warnings: migration.warnings,
      },
    };
  },
  save(document, context) {
    return { content: JSON.stringify(document, null, context.indent ?? 2), diagnostics: [] };
  },
};

export const nkpProjectFormatCodec: ProjectFormatCodec<NkpProjectData> = {
  formatId: 'nkp',
  fileExtensions: ['.nkp'],
  currentVersion: '2.0',
  load(json) {
    const parsed = parseJson(json);
    if (!parsed.ok) {
      return {
        document: createDefaultNkpProject(),
        diagnostics: [parsed.diagnostic],
        compatibility: {
          currentVersion: '2.0',
          mode: 'invalid',
          readOnly: true,
          warnings: [],
        },
      };
    }
    if (!isNkpProjectData(parsed.value)) {
      return {
        document: createDefaultNkpProject(),
        diagnostics: [
          createProjectFileDiagnostic({
            code: 'invalid-document',
            message: 'Invalid NKP project data.',
          }),
        ],
        compatibility: {
          currentVersion: '2.0',
          mode: 'invalid',
          readOnly: true,
          warnings: [],
        },
      };
    }
    const wrongDomainDiagnostics = diagnoseNkpSceneAuthoringFields(parsed.value).map((diagnostic) =>
      createProjectFileDiagnostic({
        code: diagnostic.code,
        severity: diagnostic.severity,
        message: diagnostic.message,
        path: diagnostic.path,
        recoverability: 'manual',
      }),
    );
    return {
      document: parsed.value,
      diagnostics: wrongDomainDiagnostics,
      compatibility: {
        loadedVersion: parsed.value.version,
        currentVersion: '2.0',
        mode: 'current',
        readOnly: false,
        warnings: [],
      },
    };
  },
  save(document, context) {
    if (!isNkpProjectData(document)) {
      return {
        content: '',
        diagnostics: [
          createProjectFileDiagnostic({
            code: 'invalid-document',
            message: 'Invalid NKP project data.',
          }),
        ],
      };
    }
    return { content: JSON.stringify(document, null, context.indent ?? 2), diagnostics: [] };
  },
};

export const nkmProjectFormatCodec: ProjectFormatCodec<NkmProjectData> = {
  formatId: 'nkm',
  fileExtensions: ['.nkm'],
  currentVersion: String(NKM_VERSION),
  load(json) {
    const parsed = parseJson(json);
    if (!parsed.ok) {
      return {
        document: createDefaultNkmProject('Untitled Model'),
        diagnostics: [parsed.diagnostic],
        compatibility: {
          currentVersion: String(NKM_VERSION),
          mode: 'invalid',
          readOnly: true,
          warnings: [],
        },
      };
    }
    if (!isNkmProjectData(parsed.value)) {
      return {
        document: createDefaultNkmProject('Untitled Model'),
        diagnostics: [
          createProjectFileDiagnostic({
            code: 'invalid-document',
            message: 'Invalid NKM project data.',
          }),
        ],
        compatibility: {
          currentVersion: String(NKM_VERSION),
          mode: 'invalid',
          readOnly: true,
          warnings: [],
        },
      };
    }
    const readOnly = parsed.value.version > NKM_VERSION;
    return {
      document: parsed.value,
      diagnostics: readOnly
        ? [
            createProjectFileDiagnostic({
              code: 'unsupported-version',
              message: `Project file version ${parsed.value.version} is newer than supported version ${NKM_VERSION}.`,
              recoverability: 'readonly',
            }),
          ]
        : [],
      compatibility: {
        loadedVersion: String(parsed.value.version),
        currentVersion: String(NKM_VERSION),
        mode: readOnly ? 'future' : 'current',
        readOnly,
        warnings: [],
      },
    };
  },
  save(document, context) {
    if (!isNkmProjectData(document)) {
      return {
        content: '',
        diagnostics: [
          createProjectFileDiagnostic({
            code: 'invalid-document',
            message: 'Invalid NKM project data.',
          }),
        ],
      };
    }
    return { content: JSON.stringify(document, null, context.indent ?? 2), diagnostics: [] };
  },
};

export function createDefaultProjectFormatCodecRegistry(): ProjectFormatCodecRegistry {
  const registry = new ProjectFormatCodecRegistry();
  registry.register(nkvProjectFormatCodec);
  registry.register(nkcProjectFormatCodec);
  registry.register(nkaProjectFormatCodec);
  registry.register(nksProjectFormatCodec);
  registry.register(nkpProjectFormatCodec);
  registry.register(nkmProjectFormatCodec);
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

function futureCompatibilityDiagnostics(
  compatibility: ProjectFormatCompatibility,
): ProjectFileDiagnostic[] {
  if (compatibility.mode !== 'future') return [];
  return [
    createProjectFileDiagnostic({
      code: 'unsupported-version',
      message: `Project file version ${compatibility.loadedVersion ?? 'unknown'} is newer than supported version ${compatibility.currentVersion}.`,
      recoverability: 'readonly',
    }),
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

function parseJson(
  json: string,
):
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly diagnostic: ProjectFileDiagnostic } {
  try {
    return { ok: true, value: JSON.parse(json) as unknown };
  } catch (error) {
    return {
      ok: false,
      diagnostic: createProjectFileDiagnostic({
        code: 'invalid-json',
        message: `JSON parse error: ${error instanceof Error ? error.message : String(error)}`,
      }),
    };
  }
}

export function createDefaultNksDocument(): NksDocument {
  return {
    version: CURRENT_NKS_VERSION,
    canvas: {
      width: 1920,
      height: 1080,
      dpi: 72,
      backgroundColor: '#ffffff',
    },
    layers: [],
    brushPresets: [],
    palette: [],
    viewport: {
      panX: 0,
      panY: 0,
      zoom: 1,
      rotation: 0,
    },
  };
}

function createDefaultNkpProject(): NkpProjectData {
  return {
    version: '2.0',
    name: 'Untitled Puppet',
    puppet: {
      src: null,
    },
    parameters: {},
    viewport: {
      zoom: 1,
    },
  };
}

function isNkmProjectData(value: unknown): value is NkmProjectData {
  if (!isRecord(value)) return false;
  const model = value['model'];
  const viewport = value['viewport'];
  return (
    typeof value['version'] === 'number' &&
    typeof value['name'] === 'string' &&
    (value['profile'] === undefined || isNkmSceneProfile(value['profile'])) &&
    isRecord(model) &&
    (typeof model['src'] === 'string' || model['src'] === null) &&
    (value['scene2d'] === undefined || isNkmScene2DState(value['scene2d'])) &&
    (value['live'] === undefined || isNkmLiveStageState(value['live'])) &&
    isRecord(value['faceParams']) &&
    Array.isArray(value['customClips']) &&
    (value['camera'] === null || isRecord(value['camera'])) &&
    isRecord(viewport) &&
    typeof viewport['zoom'] === 'number' &&
    isRecord(value['editorState'])
  );
}

function isNkmSceneProfile(value: unknown): value is NkmSceneProfile {
  return value === '2d' || value === '3d' || value === 'live';
}

function isNkmScene2DState(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    (value['sprites'] === undefined || Array.isArray(value['sprites'])) &&
    (value['tilemaps'] === undefined || Array.isArray(value['tilemaps'])) &&
    (value['lights'] === undefined || Array.isArray(value['lights'])) &&
    (value['parallaxLayers'] === undefined || Array.isArray(value['parallaxLayers'])) &&
    (value['particles'] === undefined || Array.isArray(value['particles'])) &&
    (value['camera'] === undefined || value['camera'] === null || isRecord(value['camera']))
  );
}

function isNkmLiveStageState(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    (value['actors'] === undefined ||
      (Array.isArray(value['actors']) && value['actors'].every(isNkmLiveActorRef))) &&
    (value['routes'] === undefined ||
      (Array.isArray(value['routes']) && value['routes'].every(isNkmLiveRoute)))
  );
}

function isNkmLiveActorRef(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    typeof value['ref'] === 'string' &&
    (value['role'] === undefined || typeof value['role'] === 'string') &&
    value['parameters'] === undefined &&
    value['motions'] === undefined &&
    value['expressions'] === undefined &&
    value['physics'] === undefined
  );
}

function isNkmLiveRoute(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    typeof value['source'] === 'string' &&
    typeof value['target'] === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
