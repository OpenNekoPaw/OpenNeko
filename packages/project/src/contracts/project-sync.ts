export interface ProjectSyncEntry {
  readonly relativePath: string;
  readonly byteLength: number;
}

export interface ProjectSyncPlan {
  readonly projectId: string;
  readonly entries: readonly ProjectSyncEntry[];
  readonly totalByteLength: number;
}

export function parseProjectSyncPlan(value: unknown): ProjectSyncPlan {
  const record = exactRecord(value, ['projectId', 'entries', 'totalByteLength']);
  if (!Array.isArray(record['entries'])) throw new Error('Project sync entries must be an array.');
  const entries = record['entries'].map((entry) => {
    const item = exactRecord(entry, ['relativePath', 'byteLength']);
    return {
      relativePath: relativePath(item['relativePath']),
      byteLength: nonNegativeInteger(item['byteLength'], 'Project sync entry byte length'),
    };
  });
  if (new Set(entries.map((entry) => entry.relativePath)).size !== entries.length) {
    throw new Error('Project sync entry paths must be unique.');
  }
  const totalByteLength = nonNegativeInteger(
    record['totalByteLength'],
    'Project sync total byte length',
  );
  if (entries.reduce((total, entry) => total + entry.byteLength, 0) !== totalByteLength) {
    throw new Error('Project sync total byte length does not match its entries.');
  }
  return {
    projectId: identity(record['projectId'], 'Project'),
    entries,
    totalByteLength,
  };
}

function exactRecord(value: unknown, keys: readonly string[]): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Project sync value must be an object.');
  }
  const record = value as Readonly<Record<string, unknown>>;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error('Project sync value has unknown or missing fields.');
  }
  return record;
}

function identity(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} identity is invalid.`);
  return value;
}

function relativePath(value: unknown): string {
  const path = identity(value, 'Project sync path').replaceAll('\\', '/');
  if (
    path.startsWith('/') ||
    path.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error('Project sync path must be a normalized relative path.');
  }
  return path;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}
