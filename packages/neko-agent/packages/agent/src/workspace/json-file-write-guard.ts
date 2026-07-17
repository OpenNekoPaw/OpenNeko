export interface JsonFileWriteMetadata {
  readonly ownerId: string;
  readonly revision: number;
  readonly updatedAt: number;
}

export interface StaleJsonFileWriteDetails {
  readonly filePath: string;
  readonly ownerId: string;
  readonly loadedRevision: number;
  readonly currentRevision: number;
  readonly currentOwnerId?: string;
}

export class StaleJsonFileWriteError extends Error {
  readonly code = 'stale-json-file-write';
  readonly details: StaleJsonFileWriteDetails;

  constructor(details: StaleJsonFileWriteDetails) {
    super(
      `Stale JSON file write rejected for ${details.filePath}: loaded revision ${details.loadedRevision}, current revision ${details.currentRevision}`,
    );
    this.name = 'StaleJsonFileWriteError';
    this.details = details;
  }
}

export interface JsonFileRevisionGuardFsOps {
  exists(path: string): Promise<boolean>;
  readFile(path: string): Promise<string>;
}

let writerOrdinal = 0;

export function createJsonFileWriterId(prefix: string): string {
  writerOrdinal += 1;
  return `${prefix}-${Date.now().toString(36)}-${writerOrdinal}`;
}

export function createJsonFileWriteMetadata(
  ownerId: string,
  previousRevision: number,
  now: () => number = () => Date.now(),
): JsonFileWriteMetadata {
  return {
    ownerId,
    revision: previousRevision + 1,
    updatedAt: now(),
  };
}

export async function assertJsonFileRevisionCurrent(input: {
  readonly filePath: string;
  readonly ownerId: string;
  readonly loadedRevision: number;
  readonly fsOps: JsonFileRevisionGuardFsOps;
}): Promise<void> {
  const current = await readJsonFileRevision(input.filePath, input.fsOps);
  if (current.revision === input.loadedRevision) {
    return;
  }

  throw new StaleJsonFileWriteError({
    filePath: input.filePath,
    ownerId: input.ownerId,
    loadedRevision: input.loadedRevision,
    currentRevision: current.revision,
    ...(current.ownerId ? { currentOwnerId: current.ownerId } : {}),
  });
}

export async function readJsonFileRevision(
  filePath: string,
  fsOps: JsonFileRevisionGuardFsOps,
): Promise<{ readonly revision: number; readonly ownerId?: string }> {
  if (!(await fsOps.exists(filePath))) {
    return { revision: 0 };
  }

  const raw = await fsOps.readFile(filePath);
  const parsed = JSON.parse(raw) as unknown;
  const metadata = parseJsonFileWriteMetadata(parsed);
  return metadata
    ? { revision: metadata.revision, ownerId: metadata.ownerId }
    : { revision: 0 };
}

export function parseJsonFileWriteMetadata(value: unknown): JsonFileWriteMetadata | null {
  if (!isRecord(value)) {
    return null;
  }

  const metadata = value['writeMetadata'];
  if (!isRecord(metadata)) {
    return null;
  }

  if (
    typeof metadata['ownerId'] !== 'string' ||
    metadata['ownerId'].trim().length === 0 ||
    typeof metadata['revision'] !== 'number' ||
    !Number.isInteger(metadata['revision']) ||
    metadata['revision'] < 0 ||
    typeof metadata['updatedAt'] !== 'number' ||
    !Number.isFinite(metadata['updatedAt'])
  ) {
    return null;
  }

  return {
    ownerId: metadata['ownerId'],
    revision: metadata['revision'],
    updatedAt: metadata['updatedAt'],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
