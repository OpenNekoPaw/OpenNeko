export const PROJECT_LOCAL_ROOT_RELATIVE_PATH = '.neko';

export type ProjectLocalRecordKind = 'binding' | 'presentation' | 'cache';

export interface ProjectLocalRecordCodec<T> {
  /** The package or domain that exclusively owns this record. */
  readonly owner: string;
  readonly kind: ProjectLocalRecordKind;
  /** Canonical project-relative path below the matching `.neko` owner root. */
  readonly relativePath: string;
  createDefault(): T;
  parse(value: unknown): T;
}

export interface ProjectLocalRecordDiagnostic {
  readonly code: 'project-local-record-invalid';
  readonly owner: string;
  readonly kind: ProjectLocalRecordKind;
  readonly relativePath: string;
  readonly message: string;
}

export type ProjectLocalRecordReadResult<T> =
  | {
      readonly status: 'available';
      readonly value: T;
      readonly diagnostic: null;
    }
  | {
      /** Missing disposable state is the canonical fresh-project state. */
      readonly status: 'initialized';
      readonly value: T;
      readonly diagnostic: null;
    }
  | {
      /** The owner may continue from its canonical default without rewriting the invalid bytes. */
      readonly status: 'invalid';
      readonly value: T;
      readonly diagnostic: ProjectLocalRecordDiagnostic;
    };

const RECORD_ROOTS: Readonly<Record<ProjectLocalRecordKind, string>> = {
  binding: '.neko/media-libraries',
  presentation: '.neko/presentation',
  cache: '.neko/cache',
};

function assertProjectLocalRecordAddress(codec: ProjectLocalRecordCodec<unknown>): void {
  if (!codec.owner.trim()) {
    throw new TypeError('Project-local record owner must be explicit.');
  }

  const path = codec.relativePath;
  if (
    !path ||
    path.startsWith('/') ||
    /^[A-Za-z]:[\\/]/.test(path) ||
    path.startsWith('\\\\') ||
    path.includes('\\')
  ) {
    throw new TypeError(`Project-local record path must be canonical and relative: ${path}`);
  }

  const segments = path.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new TypeError(`Project-local record path contains an invalid segment: ${path}`);
  }

  const root = RECORD_ROOTS[codec.kind];
  if (!path.startsWith(`${root}/`) || path === '.neko/workspace.json') {
    throw new TypeError(`Project-local ${codec.kind} record must be owned below ${root}/: ${path}`);
  }
}

/**
 * Decodes one package-owned disposable JSON record. This function never writes files, enumerates
 * sibling records, or reads synchronized project facts. Missing/invalid local state therefore cannot
 * create or mutate facts below `neko/`.
 */
export function readProjectLocalJsonRecord<T>(
  serialized: string | null,
  codec: ProjectLocalRecordCodec<T>,
): ProjectLocalRecordReadResult<T> {
  assertProjectLocalRecordAddress(codec);

  if (serialized === null) {
    return {
      status: 'initialized',
      value: codec.createDefault(),
      diagnostic: null,
    };
  }

  try {
    return {
      status: 'available',
      value: codec.parse(JSON.parse(serialized) as unknown),
      diagnostic: null,
    };
  } catch (error) {
    return {
      status: 'invalid',
      value: codec.createDefault(),
      diagnostic: {
        code: 'project-local-record-invalid',
        owner: codec.owner,
        kind: codec.kind,
        relativePath: codec.relativePath,
        message: `Invalid project-local ${codec.kind} record at ${codec.relativePath}: ${String(error)}`,
      },
    };
  }
}
