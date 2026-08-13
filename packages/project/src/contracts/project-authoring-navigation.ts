import {
  parseProjectAuthoringTargetRef,
  parseProjectLocalTargetRef,
  parseProjectPublicationDependencyRef,
  type ProjectAuthoringTargetRef,
  type ProjectLocalTargetRef,
  type ProjectPublicationDependencyRef,
  projectAuthoringTargetKey,
} from './project-target';

export type ProjectSourceStudioTarget =
  | { readonly kind: 'character-studio'; readonly characterProjectId: string }
  | { readonly kind: 'world-studio'; readonly worldProjectId: string };

export interface ProjectAuthoringPresentationSnapshotRef {
  readonly owner: 'content' | 'character' | 'world';
  readonly targetIdentity: string;
  readonly snapshotId: string;
}

export type ProjectTargetTreeItem =
  | {
      readonly kind: 'local-target';
      readonly target: ProjectLocalTargetRef;
      readonly identity: string;
      readonly label?: string;
      readonly diagnostic?: string;
    }
  | {
      readonly kind: 'external-dependency';
      readonly dependency: ProjectPublicationDependencyRef;
      readonly identity: string;
      readonly label?: string;
      readonly diagnostic?: string;
      readonly readOnly: true;
      readonly sourceStudioTarget?: ProjectSourceStudioTarget;
    };

export type ProjectAuthoringNavigationItem =
  | {
      readonly kind: 'authoring-target';
      readonly target: ProjectAuthoringTargetRef;
      readonly identity: string;
      readonly label: string;
      readonly diagnostic?: string;
      readonly snapshot?: ProjectAuthoringPresentationSnapshotRef;
    }
  | ProjectTargetTreeItem;

export function parseProjectAuthoringNavigation(
  value: unknown,
): readonly ProjectAuthoringNavigationItem[] {
  if (!Array.isArray(value)) throw new Error('Project authoring navigation must be an array.');
  const items = value.map(parseNavigationItem);
  const identities = items.map((item) => item.identity);
  if (new Set(identities).size !== identities.length) {
    throw new Error('Project authoring navigation identities must be unique.');
  }
  return items;
}

function parseNavigationItem(value: unknown): ProjectAuthoringNavigationItem {
  const record = requireRecord(value, 'Project authoring navigation item');
  const kind = record['kind'];
  if (kind === 'authoring-target') {
    requireExactKeys(record, ['kind', 'target', 'identity', 'label', 'diagnostic', 'snapshot']);
    const target = parseProjectAuthoringTargetRef(record['target']);
    return {
      kind,
      target,
      identity: requireIdentity(record['identity'], 'Project navigation identity'),
      label: requireIdentity(record['label'], 'Project navigation label'),
      ...optionalString(record, 'diagnostic'),
      ...(record['snapshot'] === undefined
        ? {}
        : {
            snapshot: parseSnapshot(
              record['snapshot'],
              target,
              requireIdentity(record['identity'], 'Project navigation identity'),
            ),
          }),
    };
  }
  if (kind === 'local-target') {
    requireExactKeys(record, ['kind', 'target', 'identity', 'label', 'diagnostic']);
    return {
      kind,
      target: parseProjectLocalTargetRef(record['target']),
      identity: requireIdentity(record['identity'], 'Project navigation identity'),
      ...optionalString(record, 'label'),
      ...optionalString(record, 'diagnostic'),
    };
  }
  if (kind === 'external-dependency') {
    requireExactKeys(record, [
      'kind',
      'dependency',
      'identity',
      'label',
      'diagnostic',
      'readOnly',
      'sourceStudioTarget',
    ]);
    if (record['readOnly'] !== true) {
      throw new Error('Project external dependency must be read-only.');
    }
    return {
      kind,
      dependency: parseProjectPublicationDependencyRef(record['dependency']),
      identity: requireIdentity(record['identity'], 'Project navigation identity'),
      ...optionalString(record, 'label'),
      ...optionalString(record, 'diagnostic'),
      readOnly: true,
      ...(record['sourceStudioTarget'] === undefined
        ? {}
        : { sourceStudioTarget: parseSourceStudioTarget(record['sourceStudioTarget']) }),
    };
  }
  throw new Error(`Unknown Project authoring navigation kind: ${String(kind)}`);
}

function parseSnapshot(
  value: unknown,
  target: ProjectAuthoringTargetRef,
  targetIdentity: string,
): ProjectAuthoringPresentationSnapshotRef {
  const record = requireRecord(value, 'Project authoring presentation snapshot ref');
  requireExactKeys(record, ['owner', 'targetIdentity', 'snapshotId']);
  const owner = record['owner'];
  if (owner !== 'content' && owner !== 'character' && owner !== 'world') {
    throw new Error(`Unknown Project authoring snapshot owner: ${String(owner)}`);
  }
  const expectedOwner =
    target.kind === 'content-project'
      ? 'content'
      : target.kind === 'character-project'
        ? 'character'
        : 'world';
  if (owner !== expectedOwner) {
    throw new Error(`Project authoring snapshot owner '${owner}' does not match target owner.`);
  }
  if (projectAuthoringTargetKey(target) !== targetIdentity) {
    throw new Error('Project authoring target identity does not match its exact target ref.');
  }
  const snapshotTargetIdentity = requireIdentity(
    record['targetIdentity'],
    'Project snapshot target identity',
  );
  if (snapshotTargetIdentity !== targetIdentity) {
    throw new Error('Project presentation snapshot does not match its target identity.');
  }
  return {
    owner,
    targetIdentity: snapshotTargetIdentity,
    snapshotId: requireIdentity(record['snapshotId'], 'Project presentation snapshot identity'),
  };
}

function parseSourceStudioTarget(value: unknown): ProjectSourceStudioTarget {
  const record = requireRecord(value, 'Project source Studio target');
  if (record['kind'] === 'character-studio') {
    requireExactKeys(record, ['kind', 'characterProjectId']);
    return {
      kind: 'character-studio',
      characterProjectId: requireIdentity(record['characterProjectId'], 'CharacterProject'),
    };
  }
  if (record['kind'] === 'world-studio') {
    requireExactKeys(record, ['kind', 'worldProjectId']);
    return {
      kind: 'world-studio',
      worldProjectId: requireIdentity(record['worldProjectId'], 'WorldProject'),
    };
  }
  throw new Error(`Unknown Project source Studio target: ${String(record['kind'])}`);
}

function optionalString(
  record: Readonly<Record<string, unknown>>,
  key: string,
): Readonly<Record<string, string>> {
  return record[key] === undefined
    ? {}
    : { [key]: requireIdentity(record[key], `Project navigation ${key}`) };
}

function requireRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function requireExactKeys(
  record: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
): void {
  const present = Object.keys(record);
  if (present.some((key) => !allowed.includes(key))) {
    throw new Error('Project authoring navigation item has unknown fields.');
  }
  for (const key of allowed) {
    if (
      key === 'label' ||
      key === 'diagnostic' ||
      key === 'snapshot' ||
      key === 'sourceStudioTarget'
    ) {
      continue;
    }
    if (!(key in record)) throw new Error(`Project authoring navigation item is missing '${key}'.`);
  }
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}
