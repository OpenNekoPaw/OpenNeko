#!/usr/bin/env -S pnpm exec tsx

import { randomUUID } from 'node:crypto';
import { lstat, open, readFile, rename, rm } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodeProjectEntityDocument } from '@neko/entity-domain';

export const PROJECT_ENTITY_REPAIR_CONFIRMATION_PREFIX = 'remove-project-entity:';

export interface ProjectEntityRecordRepairInput {
  readonly target: string;
  readonly entityId: string;
  readonly confirmation: string;
  readonly now?: () => Date;
  readonly createId?: () => string;
}

export interface ProjectEntityRecordRepairResult {
  readonly target: string;
  readonly backup: string;
  readonly entityId: string;
  readonly remainingEntityCount: number;
}

export async function repairProjectEntityRecord(
  input: ProjectEntityRecordRepairInput,
): Promise<ProjectEntityRecordRepairResult> {
  if (!isAbsolute(input.target)) {
    throw new Error('Offline repair requires an absolute --target path.');
  }
  if (!isStableIdentity(input.entityId)) {
    throw new Error('Offline repair requires one stable --entity-id.');
  }
  const expectedConfirmation = `${PROJECT_ENTITY_REPAIR_CONFIRMATION_PREFIX}${input.entityId}`;
  if (input.confirmation !== expectedConfirmation) {
    throw new Error(`Offline repair requires --confirm ${expectedConfirmation}.`);
  }

  const target = resolve(input.target);
  const targetStat = await lstat(target);
  if (!targetStat.isFile() || targetStat.isSymbolicLink()) {
    throw new Error('Offline repair target must be one regular file and must not be a symlink.');
  }
  const original = await readFile(target);
  const parsed = parseJsonObject(original.toString('utf8'));
  if (!hasCanonicalDocumentContainer(parsed)) {
    throw new Error(
      'Offline repair only accepts the current Project Entity document container shape.',
    );
  }

  const matchingIndexes = parsed.entities.flatMap((candidate, index) =>
    readEntityId(candidate) === input.entityId ? [index] : [],
  );
  if (matchingIndexes.length !== 1) {
    throw new Error(
      `Offline repair expected one Entity '${input.entityId}', found ${String(matchingIndexes.length)}.`,
    );
  }
  const targetIndex = matchingIndexes[0];
  if (targetIndex === undefined) {
    throw new Error(`Offline repair could not resolve Entity '${input.entityId}'.`);
  }
  const repaired = {
    projectId: parsed.projectId,
    entities: parsed.entities.filter((_candidate, index) => index !== targetIndex),
  };
  const decoded = decodeProjectEntityDocument(repaired);
  if (!decoded.ok || decoded.diagnostics.length > 0) {
    const detail = decoded.diagnostics.map((diagnostic) => diagnostic.message).join(' ');
    throw new Error(`Offline repair result is still invalid: ${detail}`);
  }

  const createId = input.createId ?? randomUUID;
  const now = input.now ?? (() => new Date());
  const timestamp = now().toISOString().replaceAll(':', '-');
  const backup = `${target}.backup-${timestamp}-${createId()}`;
  const temporary = `${target}.repair-${createId()}.tmp`;
  let published = false;
  try {
    await writeExclusiveFile(backup, original, targetStat.mode);
    await writeExclusiveFile(
      temporary,
      Buffer.from(`${JSON.stringify(repaired, null, 2)}\n`, 'utf8'),
      targetStat.mode,
    );
    await rename(temporary, target);
    published = true;
    const persisted = parseJsonObject(await readFile(target, 'utf8'));
    if (JSON.stringify(persisted) !== JSON.stringify(repaired)) {
      throw new Error('Offline repair validation detected an unexpected persisted result.');
    }
    const persistedDecoded = decodeProjectEntityDocument(persisted);
    if (!persistedDecoded.ok || persistedDecoded.diagnostics.length > 0) {
      throw new Error('Offline repair validation rejected the persisted Project Entity document.');
    }
  } finally {
    if (!published) await rm(temporary, { force: true });
  }

  return {
    target,
    backup,
    entityId: input.entityId,
    remainingEntityCount: repaired.entities.length,
  };
}

function parseArguments(arguments_: readonly string[]): ProjectEntityRecordRepairInput {
  const values = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index];
    const value = arguments_[index + 1];
    if (!key || !value || !['--target', '--entity-id', '--confirm'].includes(key)) {
      throw new Error(
        'Usage: project-entity-record.ts --target <absolute-file> --entity-id <id> --confirm remove-project-entity:<id>',
      );
    }
    if (values.has(key)) throw new Error(`Offline repair argument '${key}' is duplicated.`);
    values.set(key, value);
  }
  const target = values.get('--target');
  const entityId = values.get('--entity-id');
  const confirmation = values.get('--confirm');
  if (!target || !entityId || !confirmation || values.size !== 3) {
    throw new Error(
      'Usage: project-entity-record.ts --target <absolute-file> --entity-id <id> --confirm remove-project-entity:<id>',
    );
  }
  return { target, entityId, confirmation };
}

async function writeExclusiveFile(path: string, content: Buffer, mode: number): Promise<void> {
  const handle = await open(path, 'wx', mode);
  try {
    await handle.writeFile(content);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function parseJsonObject(source: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(source);
  if (!isRecord(parsed)) {
    throw new Error('Offline repair target is not a JSON object.');
  }
  return parsed;
}

function hasCanonicalDocumentContainer(
  value: Record<string, unknown>,
): value is { readonly projectId: string; readonly entities: readonly unknown[] } {
  return (
    Object.keys(value).length === 2 &&
    Object.hasOwn(value, 'projectId') &&
    Object.hasOwn(value, 'entities') &&
    isStableIdentity(value.projectId) &&
    Array.isArray(value.entities)
  );
}

function readEntityId(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const entityId = value.entityId;
  return isStableIdentity(entityId) ? entityId : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStableIdentity(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= 256 &&
    !/[\\/\0]/u.test(value)
  );
}

async function main(): Promise<void> {
  const result = await repairProjectEntityRecord(parseArguments(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
