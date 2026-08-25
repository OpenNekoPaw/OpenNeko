import {
  parseProjectAuthoringTargetRef,
  parseProjectGlobalReference,
  projectAuthoringTargetKey,
  projectGlobalObjectKey,
  type ProjectAuthoringTargetRef,
  type ProjectGlobalReference,
} from './project-target';

export const PROJECT_TARGET_MEMBERSHIP_DIRECTORY = 'neko/project-membership/targets' as const;
export const PROJECT_GLOBAL_REFERENCE_DIRECTORY =
  'neko/project-membership/global-references' as const;

export interface ProjectTargetMembershipFact {
  readonly projectId: string;
  readonly target: ProjectAuthoringTargetRef;
}

export interface ProjectGlobalReferenceFact {
  readonly projectId: string;
  readonly reference: ProjectGlobalReference;
}

export interface ProjectPersistenceDiagnostic {
  readonly code: 'invalid-project-target-membership' | 'invalid-project-global-reference';
  readonly projectId: string;
  readonly recordName: string;
  readonly message: string;
}

export function parseProjectTargetMembershipFact(value: unknown): ProjectTargetMembershipFact {
  const record = exactRecord(value, ['projectId', 'target'], 'Project target membership');
  return {
    projectId: identity(record['projectId'], 'Project'),
    target: parseProjectAuthoringTargetRef(record['target']),
  };
}

export function parseProjectGlobalReferenceFact(value: unknown): ProjectGlobalReferenceFact {
  const record = exactRecord(value, ['projectId', 'reference'], 'Project global reference');
  return {
    projectId: identity(record['projectId'], 'Project'),
    reference: parseProjectGlobalReference(record['reference']),
  };
}

export function parseProjectTargetMembershipJson(json: string): ProjectTargetMembershipFact {
  return parseJson(json, parseProjectTargetMembershipFact, 'Project target membership');
}

export function parseProjectGlobalReferenceJson(json: string): ProjectGlobalReferenceFact {
  return parseJson(json, parseProjectGlobalReferenceFact, 'Project global reference');
}

export function serializeProjectTargetMembershipFact(value: ProjectTargetMembershipFact): string {
  return `${JSON.stringify(parseProjectTargetMembershipFact(value), null, 2)}\n`;
}

export function serializeProjectGlobalReferenceFact(value: ProjectGlobalReferenceFact): string {
  return `${JSON.stringify(parseProjectGlobalReferenceFact(value), null, 2)}\n`;
}

export function projectTargetMembershipRelativePath(target: ProjectAuthoringTargetRef): string {
  return `${PROJECT_TARGET_MEMBERSHIP_DIRECTORY}/${encodeProjectRecordName(projectAuthoringTargetKey(target))}.json`;
}

export function projectGlobalReferenceRelativePath(reference: ProjectGlobalReference): string {
  return `${PROJECT_GLOBAL_REFERENCE_DIRECTORY}/${encodeProjectRecordName(projectGlobalObjectKey(reference))}.json`;
}

export function encodeProjectRecordName(identity: string): string {
  return `u${[...requireRecordIdentity(identity)]
    .map((character) => character.codePointAt(0)!.toString(16))
    .join('-')}`;
}

export function decodeProjectRecordName(recordName: string): string {
  if (!/^u[0-9a-f]+(?:-[0-9a-f]+)*$/u.test(recordName)) {
    throw new Error('Project record name is invalid.');
  }
  let value: string;
  try {
    value = recordName
      .slice(1)
      .split('-')
      .map((item) => String.fromCodePoint(Number.parseInt(item, 16)))
      .join('');
  } catch {
    throw new Error('Project record name is invalid.');
  }
  if (encodeProjectRecordName(value) !== recordName) {
    throw new Error('Project record name is not canonical.');
  }
  return value;
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const record = value as Readonly<Record<string, unknown>>;
  const expected = new Set(keys);
  if (
    Object.keys(record).length !== keys.length ||
    Object.keys(record).some((key) => !expected.has(key))
  ) {
    throw new Error(`${label} has unknown or missing fields.`);
  }
  return record;
}

function identity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.includes('\0')) {
    throw new Error(`${label} identity is required.`);
  }
  return value;
}

function requireRecordIdentity(value: string): string {
  const result = identity(value, 'Project record');
  if ([...result].length > 320 || result !== result.normalize('NFC') || result.includes('${')) {
    throw new Error('Project record identity is invalid.');
  }
  return result;
}

function parseJson<T>(json: string, parser: (value: unknown) => T, label: string): T {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${String(error)}`);
  }
  return parser(value);
}
