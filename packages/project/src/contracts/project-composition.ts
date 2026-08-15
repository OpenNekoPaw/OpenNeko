import {
  parseProjectGlobalReference,
  parseProjectLocalTargetRef,
  projectGlobalReferenceKey,
  projectLocalTargetKey,
  type ProjectGlobalReference,
  type ProjectLocalTargetRef,
} from './project-target';

export interface ProjectContentDocumentTargetRef {
  readonly kind: 'content-document';
  readonly documentId: string;
}

export type ProjectWorkspaceTargetRef = ProjectContentDocumentTargetRef | ProjectLocalTargetRef;

export interface ProjectMixedDomainTargetItem {
  readonly target: ProjectWorkspaceTargetRef;
  readonly identity: string;
  readonly label: string;
  readonly diagnostic?: string;
}

export interface ProjectGlobalReferenceItem {
  readonly reference: ProjectGlobalReference;
  readonly identity: string;
  readonly label: string;
  readonly diagnostic?: string;
}

export interface ProjectMixedDomainTargetProjection {
  readonly projectId: string;
  readonly content: readonly (ProjectMixedDomainTargetItem & {
    readonly target: ProjectContentDocumentTargetRef;
  })[];
  readonly characters: readonly (ProjectMixedDomainTargetItem & {
    readonly target: Extract<ProjectLocalTargetRef, { readonly kind: 'character-project' }>;
  })[];
  readonly worlds: readonly (ProjectMixedDomainTargetItem & {
    readonly target: Extract<ProjectLocalTargetRef, { readonly kind: 'world-project' }>;
  })[];
  readonly globalCharacters: readonly (ProjectGlobalReferenceItem & {
    readonly reference: Extract<ProjectGlobalReference, { readonly kind: 'character-version' }>;
  })[];
  readonly globalWorlds: readonly (ProjectGlobalReferenceItem & {
    readonly reference: Extract<ProjectGlobalReference, { readonly kind: 'world-version' }>;
  })[];
  readonly availableGlobalCharacters: readonly (ProjectGlobalReferenceItem & {
    readonly reference: Extract<ProjectGlobalReference, { readonly kind: 'character-version' }>;
  })[];
  readonly availableGlobalWorlds: readonly (ProjectGlobalReferenceItem & {
    readonly reference: Extract<ProjectGlobalReference, { readonly kind: 'world-version' }>;
  })[];
  readonly diagnostics: readonly ProjectCompositionDiagnostic[];
}

export type ProjectGlobalReferenceMutation =
  | {
      readonly kind: 'add';
      readonly reference: ProjectGlobalReference;
    }
  | {
      readonly kind: 'update';
      readonly previousReference: ProjectGlobalReference;
      readonly reference: ProjectGlobalReference;
    }
  | {
      readonly kind: 'remove';
      readonly reference: ProjectGlobalReference;
    };

export type ProjectCompositionDiagnosticOwner =
  | { readonly kind: 'project'; readonly projectId: string }
  | ProjectWorkspaceTargetRef
  | { readonly kind: 'global-reference'; readonly reference: ProjectGlobalReference };

export interface ProjectCompositionDiagnostic {
  readonly owner: ProjectCompositionDiagnosticOwner;
  readonly severity: 'warning' | 'error';
  readonly code: string;
  readonly message: string;
}

export interface ProjectCreativeWorkspaceProjection {
  readonly composition: ProjectMixedDomainTargetProjection;
}

export function parseProjectMixedDomainTargetProjection(
  value: unknown,
): ProjectMixedDomainTargetProjection {
  const record = exactRecord(value, 'Project mixed-domain target projection');
  exactKeys(record, [
    'projectId',
    'content',
    'characters',
    'worlds',
    'globalCharacters',
    'globalWorlds',
    'availableGlobalCharacters',
    'availableGlobalWorlds',
    'diagnostics',
  ]);
  const content = array(record['content'], (item) => parseTargetItem(item, 'content-document'));
  const characters = array(record['characters'], (item) =>
    parseTargetItem(item, 'character-project'),
  );
  const worlds = array(record['worlds'], (item) => parseTargetItem(item, 'world-project'));
  unique(
    [...content, ...characters, ...worlds].map((item) => item.identity),
    'Project mixed-domain target identities',
  );
  const globalCharacters = array(record['globalCharacters'], (item) =>
    parseGlobalReferenceItem(item, 'character-version'),
  );
  const globalWorlds = array(record['globalWorlds'], (item) =>
    parseGlobalReferenceItem(item, 'world-version'),
  );
  unique(
    [...globalCharacters, ...globalWorlds].map((item) => item.identity),
    'Project global reference identities',
  );
  const availableGlobalCharacters = array(record['availableGlobalCharacters'], (item) =>
    parseGlobalReferenceItem(item, 'character-version'),
  );
  const availableGlobalWorlds = array(record['availableGlobalWorlds'], (item) =>
    parseGlobalReferenceItem(item, 'world-version'),
  );
  unique(
    [...availableGlobalCharacters, ...availableGlobalWorlds].map((item) => item.identity),
    'Project available global reference identities',
  );
  return {
    projectId: identity(record['projectId'], 'Project'),
    content,
    characters,
    worlds,
    globalCharacters,
    globalWorlds,
    availableGlobalCharacters,
    availableGlobalWorlds,
    diagnostics: array(record['diagnostics'], parseProjectCompositionDiagnostic),
  };
}

export function parseProjectGlobalReferenceMutation(
  value: unknown,
): ProjectGlobalReferenceMutation {
  const record = exactRecord(value, 'Project global reference mutation');
  if (record['kind'] === 'add' || record['kind'] === 'remove') {
    exactKeys(record, ['kind', 'reference']);
    return {
      kind: record['kind'],
      reference: parseProjectGlobalReference(record['reference']),
    };
  }
  if (record['kind'] === 'update') {
    exactKeys(record, ['kind', 'previousReference', 'reference']);
    return {
      kind: 'update',
      previousReference: parseProjectGlobalReference(record['previousReference']),
      reference: parseProjectGlobalReference(record['reference']),
    };
  }
  throw new Error(`Unknown Project global reference mutation: ${String(record['kind'])}`);
}

export function parseProjectCreativeWorkspaceProjection(
  value: unknown,
): ProjectCreativeWorkspaceProjection {
  const record = exactRecord(value, 'Project Creative Workspace projection');
  exactKeys(record, ['composition']);
  return { composition: parseProjectMixedDomainTargetProjection(record['composition']) };
}

function parseTargetItem<K extends ProjectWorkspaceTargetRef['kind']>(
  value: unknown,
  expectedKind: K,
): ProjectMixedDomainTargetItem & {
  readonly target: Extract<ProjectWorkspaceTargetRef, { readonly kind: K }>;
} {
  const record = exactRecord(value, 'Project mixed-domain target item');
  exactKeys(record, ['target', 'identity', 'label', 'diagnostic'], ['diagnostic']);
  const target = parseProjectWorkspaceTargetRef(record['target']);
  if (target.kind !== expectedKind) {
    throw new Error(`Project mixed-domain target requires '${expectedKind}'.`);
  }
  const targetIdentity = identity(record['identity'], 'Project target');
  if (targetIdentity !== projectWorkspaceTargetKey(target)) {
    throw new Error('Project mixed-domain target identity does not match its owner ref.');
  }
  return {
    target: target as Extract<ProjectWorkspaceTargetRef, { readonly kind: K }>,
    identity: targetIdentity,
    label: identity(record['label'], 'Project target label'),
    ...optionalIdentity(record, 'diagnostic', 'Project target diagnostic'),
  };
}

function parseGlobalReferenceItem<K extends ProjectGlobalReference['kind']>(
  value: unknown,
  expectedKind: K,
): ProjectGlobalReferenceItem & {
  readonly reference: Extract<ProjectGlobalReference, { readonly kind: K }>;
} {
  const record = exactRecord(value, 'Project global reference item');
  exactKeys(record, ['reference', 'identity', 'label', 'diagnostic'], ['diagnostic']);
  const reference = parseProjectGlobalReference(record['reference']);
  if (reference.kind !== expectedKind) {
    throw new Error(`Project global reference requires '${expectedKind}'.`);
  }
  const referenceIdentity = identity(record['identity'], 'Project global reference');
  if (referenceIdentity !== projectGlobalReferenceKey(reference)) {
    throw new Error('Project global reference identity does not match its owner ref.');
  }
  return {
    reference: reference as Extract<ProjectGlobalReference, { readonly kind: K }>,
    identity: referenceIdentity,
    label: identity(record['label'], 'Project global reference label'),
    ...optionalIdentity(record, 'diagnostic', 'Project global reference diagnostic'),
  };
}

function parseProjectCompositionDiagnostic(value: unknown): ProjectCompositionDiagnostic {
  const record = exactRecord(value, 'Project composition diagnostic');
  exactKeys(record, ['owner', 'severity', 'code', 'message']);
  const severity = record['severity'];
  if (severity !== 'warning' && severity !== 'error') {
    throw new Error(`Unknown Project diagnostic severity: ${String(severity)}`);
  }
  return {
    owner: parseDiagnosticOwner(record['owner']),
    severity,
    code: identity(record['code'], 'Project diagnostic code'),
    message: identity(record['message'], 'Project diagnostic message'),
  };
}

function parseDiagnosticOwner(value: unknown): ProjectCompositionDiagnosticOwner {
  const record = exactRecord(value, 'Project diagnostic owner');
  if (record['kind'] === 'project') {
    exactKeys(record, ['kind', 'projectId']);
    return { kind: 'project', projectId: identity(record['projectId'], 'Project') };
  }
  if (record['kind'] === 'global-reference') {
    exactKeys(record, ['kind', 'reference']);
    return {
      kind: 'global-reference',
      reference: parseProjectGlobalReference(record['reference']),
    };
  }
  return parseProjectWorkspaceTargetRef(record);
}

function parseProjectWorkspaceTargetRef(value: unknown): ProjectWorkspaceTargetRef {
  const record = exactRecord(value, 'Project Workspace target');
  if (record['kind'] === 'content-document') {
    exactKeys(record, ['kind', 'documentId']);
    return {
      kind: 'content-document',
      documentId: identity(record['documentId'], 'Content document'),
    };
  }
  return parseProjectLocalTargetRef(record);
}

function projectWorkspaceTargetKey(target: ProjectWorkspaceTargetRef): string {
  return target.kind === 'content-document'
    ? `content-document:${target.documentId}`
    : projectLocalTargetKey(target);
}

function exactRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function exactKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  optional: readonly string[] = [],
): void {
  const allowed = new Set(keys);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new Error('Project composition contract has unknown fields.');
  }
  for (const key of keys) {
    if (!optional.includes(key) && !(key in record)) {
      throw new Error(`Project composition contract is missing '${key}'.`);
    }
  }
}

function identity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.includes('\0')) {
    throw new Error(`${label} identity must be a non-empty string.`);
  }
  return value;
}

function optionalIdentity(
  record: Readonly<Record<string, unknown>>,
  key: string,
  label: string,
): Readonly<Record<string, string>> {
  return record[key] === undefined ? {} : { [key]: identity(record[key], label) };
}

function array<T>(value: unknown, parser: (item: unknown) => T): readonly T[] {
  if (!Array.isArray(value)) throw new Error('Project composition collection must be an array.');
  return value.map(parser);
}

function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique.`);
}
