import {
  parseProjectGlobalReference,
  parseProjectLocalTargetRef,
  projectGlobalReferenceKey,
  projectLocalTargetKey,
  type ProjectGlobalReference,
  type ProjectLocalTargetRef,
} from './project-target';
import type { ProjectLocalCharacterEntitySelection } from './project-local-authoring';

export interface ProjectContentDocumentTargetRef {
  readonly kind: 'content-document';
  readonly documentId: string;
}

export type ProjectWorkspaceTargetRef = ProjectContentDocumentTargetRef | ProjectLocalTargetRef;

export interface ProjectMixedDomainTargetItem {
  readonly target: ProjectWorkspaceTargetRef;
  readonly identity: string;
  readonly label: string;
  readonly summary?: string;
  readonly updatedAt?: string;
  readonly diagnostic?: string;
  readonly synchronization?: ProjectWorkspaceSynchronization;
}

export type ProjectWorkspaceSynchronization =
  | {
      readonly kind: 'character';
      readonly globalObjectId: string;
      readonly lastSyncedVersionId: string;
      readonly currentVersionId: string;
    }
  | {
      readonly kind: 'world';
      readonly globalObjectId: string;
      readonly lastSyncedVersionId: string;
      readonly currentVersionId: string;
    };

export interface ProjectGlobalReferenceItem {
  readonly reference: ProjectGlobalReference;
  readonly identity: string;
  readonly label: string;
  readonly versionLabel: string;
  readonly summary?: string;
  readonly updatedAt?: string;
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

export type ProjectWorkspaceObjectMutation =
  | {
      readonly kind: 'copy-character-reference';
      readonly reference: Extract<ProjectGlobalReference, { readonly kind: 'character-version' }>;
      readonly characterProjectId: string;
      readonly entity: ProjectLocalCharacterEntitySelection;
    }
  | {
      readonly kind: 'copy-world-reference';
      readonly reference: Extract<ProjectGlobalReference, { readonly kind: 'world-version' }>;
      readonly worldProjectId: string;
    }
  | {
      readonly kind: 'synchronize-character';
      readonly characterProjectId: string;
      readonly globalCharacterId: string;
      readonly characterVersionId: string;
      readonly label: string;
      readonly lastSyncedCharacterVersionId?: string;
      readonly conflictChoice?: 'base-on-current' | 'save-as-new';
    }
  | {
      readonly kind: 'synchronize-world';
      readonly worldProjectId: string;
      readonly globalWorldId: string;
      readonly worldVersionId: string;
      readonly label: string;
      readonly lastSyncedWorldVersionId?: string;
      readonly conflictChoice?: 'base-on-current' | 'save-as-new';
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

export function parseProjectWorkspaceObjectMutation(
  value: unknown,
): ProjectWorkspaceObjectMutation {
  const record = exactRecord(value, 'Project Workspace object mutation');
  if (record['kind'] === 'copy-character-reference') {
    exactKeys(record, ['kind', 'reference', 'characterProjectId', 'entity']);
    const reference = parseProjectGlobalReference(record['reference']);
    if (reference.kind !== 'character-version') {
      throw new Error('Character copy requires an exact CharacterVersion reference.');
    }
    return {
      kind: 'copy-character-reference',
      reference,
      characterProjectId: identity(record['characterProjectId'], 'CharacterProject'),
      entity: parseCharacterEntitySelection(record['entity']),
    };
  }
  if (record['kind'] === 'copy-world-reference') {
    exactKeys(record, ['kind', 'reference', 'worldProjectId']);
    const reference = parseProjectGlobalReference(record['reference']);
    if (reference.kind !== 'world-version') {
      throw new Error('World copy requires an exact WorldVersion reference.');
    }
    return {
      kind: 'copy-world-reference',
      reference,
      worldProjectId: identity(record['worldProjectId'], 'WorldProject'),
    };
  }
  if (record['kind'] === 'synchronize-character') {
    exactKeys(
      record,
      [
        'kind',
        'characterProjectId',
        'globalCharacterId',
        'characterVersionId',
        'label',
        'lastSyncedCharacterVersionId',
        'conflictChoice',
      ],
      ['lastSyncedCharacterVersionId', 'conflictChoice'],
    );
    return {
      kind: 'synchronize-character',
      characterProjectId: identity(record['characterProjectId'], 'CharacterProject'),
      globalCharacterId: identity(record['globalCharacterId'], 'GlobalCharacter'),
      characterVersionId: identity(record['characterVersionId'], 'CharacterVersion'),
      label: identity(record['label'], 'CharacterVersion label'),
      ...optionalIdentity(
        record,
        'lastSyncedCharacterVersionId',
        'Last synchronized CharacterVersion',
      ),
      ...optionalConflictChoice(record),
    } as ProjectWorkspaceObjectMutation;
  }
  if (record['kind'] === 'synchronize-world') {
    exactKeys(
      record,
      [
        'kind',
        'worldProjectId',
        'globalWorldId',
        'worldVersionId',
        'label',
        'lastSyncedWorldVersionId',
        'conflictChoice',
      ],
      ['lastSyncedWorldVersionId', 'conflictChoice'],
    );
    return {
      kind: 'synchronize-world',
      worldProjectId: identity(record['worldProjectId'], 'WorldProject'),
      globalWorldId: identity(record['globalWorldId'], 'GlobalWorld'),
      worldVersionId: identity(record['worldVersionId'], 'WorldVersion'),
      label: identity(record['label'], 'WorldVersion label'),
      ...optionalIdentity(record, 'lastSyncedWorldVersionId', 'Last synchronized WorldVersion'),
      ...optionalConflictChoice(record),
    } as ProjectWorkspaceObjectMutation;
  }
  throw new Error(`Unknown Project Workspace object mutation: ${String(record['kind'])}`);
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
  exactKeys(
    record,
    ['target', 'identity', 'label', 'summary', 'updatedAt', 'diagnostic', 'synchronization'],
    ['summary', 'updatedAt', 'diagnostic', 'synchronization'],
  );
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
    ...optionalIdentity(record, 'summary', 'Project target summary'),
    ...optionalIsoDate(record, 'updatedAt', 'Project target updatedAt'),
    ...optionalIdentity(record, 'diagnostic', 'Project target diagnostic'),
    ...(record['synchronization'] === undefined
      ? {}
      : { synchronization: parseWorkspaceSynchronization(record['synchronization']) }),
  };
}

function parseWorkspaceSynchronization(value: unknown): ProjectWorkspaceSynchronization {
  const record = exactRecord(value, 'Project Workspace synchronization');
  exactKeys(record, ['kind', 'globalObjectId', 'lastSyncedVersionId', 'currentVersionId']);
  if (record['kind'] !== 'character' && record['kind'] !== 'world') {
    throw new Error(`Unknown Project Workspace synchronization kind: ${String(record['kind'])}`);
  }
  return {
    kind: record['kind'],
    globalObjectId: identity(record['globalObjectId'], 'Global object'),
    lastSyncedVersionId: identity(record['lastSyncedVersionId'], 'Last synchronized version'),
    currentVersionId: identity(record['currentVersionId'], 'Current global version'),
  };
}

function parseCharacterEntitySelection(value: unknown): ProjectLocalCharacterEntitySelection {
  const record = exactRecord(value, 'Project Character Entity selection');
  if (record['kind'] === 'create') {
    exactKeys(record, ['kind', 'entityId', 'name']);
    return {
      kind: 'create',
      entityId: identity(record['entityId'], 'Project Entity'),
      name: identity(record['name'], 'Project Entity name'),
    };
  }
  if (record['kind'] === 'existing') {
    exactKeys(record, ['kind', 'entityId']);
    return { kind: 'existing', entityId: identity(record['entityId'], 'Project Entity') };
  }
  throw new Error(`Unknown Project Character Entity selection: ${String(record['kind'])}`);
}

function optionalConflictChoice(record: Readonly<Record<string, unknown>>): {
  readonly conflictChoice?: 'base-on-current' | 'save-as-new';
} {
  const choice = record['conflictChoice'];
  if (choice === undefined) return {};
  if (choice !== 'base-on-current' && choice !== 'save-as-new') {
    throw new Error(`Unknown synchronization conflict choice: ${String(choice)}`);
  }
  return { conflictChoice: choice };
}

function parseGlobalReferenceItem<K extends ProjectGlobalReference['kind']>(
  value: unknown,
  expectedKind: K,
): ProjectGlobalReferenceItem & {
  readonly reference: Extract<ProjectGlobalReference, { readonly kind: K }>;
} {
  const record = exactRecord(value, 'Project global reference item');
  exactKeys(
    record,
    ['reference', 'identity', 'label', 'versionLabel', 'summary', 'updatedAt', 'diagnostic'],
    ['summary', 'updatedAt', 'diagnostic'],
  );
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
    versionLabel: identity(record['versionLabel'], 'Project global reference version label'),
    ...optionalIdentity(record, 'summary', 'Project global reference summary'),
    ...optionalIsoDate(record, 'updatedAt', 'Project global reference updatedAt'),
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

function optionalIsoDate(
  record: Readonly<Record<string, unknown>>,
  key: string,
  label: string,
): Readonly<Record<string, string>> {
  if (record[key] === undefined) return {};
  const value = identity(record[key], label);
  if (Number.isNaN(Date.parse(value))) throw new Error(`${label} must be an ISO timestamp.`);
  return { [key]: value };
}

function array<T>(value: unknown, parser: (item: unknown) => T): readonly T[] {
  if (!Array.isArray(value)) throw new Error('Project composition collection must be an array.');
  return value.map(parser);
}

function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique.`);
}
