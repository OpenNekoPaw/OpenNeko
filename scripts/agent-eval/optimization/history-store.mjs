import * as fs from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OPTIMIZATION_SCHEMAS,
  hostIdentityKey,
  validateDevelopmentCheckpoint,
  validateDevelopmentHistory,
  validateRenameLineage,
} from '../schemas/optimization-contracts.mjs';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DEFAULT_SKILL_HISTORY_FILE = resolve(
  REPOSITORY_ROOT,
  'quality/skill-development-history/history.json',
);

export function createEmptyDevelopmentHistory() {
  return {
    schema: OPTIMIZATION_SCHEMAS.history,
    entries: [],
    renameLineage: [],
  };
}

export async function loadDevelopmentHistory(file = DEFAULT_SKILL_HISTORY_FILE, options = {}) {
  const io = options.fs ?? fs;
  let text;
  try {
    text = await io.readFile(resolve(file), 'utf8');
  } catch (error) {
    if (readErrorCode(error) === 'ENOENT') return createEmptyDevelopmentHistory();
    throw error;
  }
  return validateStoredDevelopmentHistory(validateDevelopmentHistory(JSON.parse(text)));
}

export async function appendDevelopmentCheckpoint(checkpointInput, options = {}) {
  const result = await appendDevelopmentCheckpoints([checkpointInput], options);
  return { history: result.history, checkpoint: result.checkpoints[0] };
}

export async function appendDevelopmentCheckpoints(checkpointInputs, options = {}) {
  if (!Array.isArray(checkpointInputs) || checkpointInputs.length === 0) {
    throw historyError('history-batch-empty', 'Development checkpoint batch must be non-empty');
  }
  const checkpoints = checkpointInputs.map(validateDevelopmentCheckpoint);
  const file = resolve(options.file ?? DEFAULT_SKILL_HISTORY_FILE);
  const history = await loadDevelopmentHistory(file, options);
  if (
    options.expectedEntryCount !== undefined &&
    history.entries.length !== options.expectedEntryCount
  ) {
    throw historyError(
      'history-concurrent-update',
      `Development history changed before append: expected ${options.expectedEntryCount} entries, found ${history.entries.length}`,
    );
  }
  let next = history;
  for (const checkpoint of checkpoints) {
    if (next.entries.some((entry) => entry.id === checkpoint.id)) {
      throw historyError(
        'history-entry-exists',
        `Development checkpoint already exists: ${checkpoint.id}`,
      );
    }
    validateCheckpointLineage(next, checkpoint);
    next = validateDevelopmentHistory({
      ...next,
      entries: [...next.entries, checkpoint],
    });
  }
  await writeHistory(file, next, options);
  return { history: next, checkpoints };
}

export async function appendRenameLineage(lineageInput, options = {}) {
  const lineage = validateRenameLineage(lineageInput);
  const file = resolve(options.file ?? DEFAULT_SKILL_HISTORY_FILE);
  const history = await loadDevelopmentHistory(file, options);
  if (history.renameLineage.some((entry) => entry.id === lineage.id)) {
    throw historyError('rename-lineage-exists', `Rename lineage already exists: ${lineage.id}`);
  }
  const sourceExists = history.entries.some(
    (entry) =>
      hostIdentityKey(entry.identity) === hostIdentityKey(lineage.fromIdentity) &&
      entry.fingerprint === lineage.fromIdentity.fingerprint,
  );
  if (!sourceExists) {
    throw historyError(
      'rename-lineage-source-missing',
      `Rename lineage source checkpoint is missing: ${lineage.id}`,
    );
  }
  const next = validateDevelopmentHistory({
    ...history,
    renameLineage: [...history.renameLineage, lineage],
  });
  assertNoLineageAmbiguity(next, hostIdentityKey(lineage.fromIdentity));
  await writeHistory(file, next, options);
  return { history: next, lineage };
}

export function findSkillDevelopmentHistory(historyInput, identity) {
  const history = validateDevelopmentHistory(historyInput);
  const key = hostIdentityKey(identity);
  return history.entries.filter((entry) => hostIdentityKey(entry.identity) === key);
}

export function resolveSkillDevelopmentLineage(historyInput, identity) {
  const history = validateDevelopmentHistory(historyInput);
  const chain = [];
  let key = hostIdentityKey(identity);
  const visited = new Set();
  while (!visited.has(key)) {
    visited.add(key);
    chain.push(...history.entries.filter((entry) => hostIdentityKey(entry.identity) === key));
    const outgoing = history.renameLineage.filter(
      (lineage) => hostIdentityKey(lineage.fromIdentity) === key,
    );
    if (outgoing.length > 1) {
      throw historyError(
        'rename-lineage-ambiguous',
        `Multiple rename/move records leave Host identity ${key}`,
      );
    }
    if (outgoing.length === 0) break;
    key = hostIdentityKey(outgoing[0].toIdentity);
  }
  if (
    visited.has(key) &&
    history.renameLineage.some((lineage) => hostIdentityKey(lineage.fromIdentity) === key)
  ) {
    throw historyError('rename-lineage-cycle', `Rename/move lineage contains a cycle at ${key}`);
  }
  return chain;
}

export function observeCurrentHostFingerprint(identity) {
  hostIdentityKey(identity);
  return { identity, fingerprint: identity.fingerprint };
}

function validateCheckpointLineage(history, checkpoint) {
  const sameIdentity = history.entries.filter(
    (entry) => hostIdentityKey(entry.identity) === hostIdentityKey(checkpoint.identity),
  );
  if (!checkpoint.parent) {
    if (sameIdentity.length > 0) {
      throw historyError(
        'history-parent-required',
        `Existing Skill history requires an explicit parent: ${checkpoint.id}`,
      );
    }
    return;
  }
  const parent = history.entries.find((entry) => entry.id === checkpoint.parent.entryId);
  if (!parent) {
    throw historyError(
      'history-parent-missing',
      `Development checkpoint parent is missing: ${checkpoint.parent.entryId}`,
    );
  }
  if (parent.fingerprint !== checkpoint.parent.fingerprint) {
    throw historyError(
      'history-parent-stale',
      `Development checkpoint parent fingerprint is stale: ${checkpoint.parent.entryId}`,
    );
  }
  const parentKey = hostIdentityKey(parent.identity);
  const checkpointKey = hostIdentityKey(checkpoint.identity);
  if (
    parentKey !== checkpointKey &&
    !hasExplicitLineage(history, parent.identity, checkpoint.identity)
  ) {
    throw historyError(
      'history-identity-lineage-missing',
      `Changed Host identity requires explicit rename/move lineage: ${checkpoint.id}`,
    );
  }
  assertAllowedTransition(parent, checkpoint);
}

function assertAllowedTransition(parent, checkpoint) {
  const allowed = {
    baseline: new Set(['candidate', 'superseded']),
    candidate: new Set(['evaluated']),
    evaluated: new Set(['accepted', 'rejected']),
    accepted: new Set(['baseline', 'candidate', 'superseded']),
    rejected: new Set(['baseline', 'candidate']),
    superseded: new Set(),
  }[parent.state];
  if (!allowed.has(checkpoint.state)) {
    throw historyError(
      'history-transition-invalid',
      `Invalid development checkpoint transition: ${parent.state} -> ${checkpoint.state}`,
    );
  }
  if (checkpoint.state === 'candidate' && checkpoint.fingerprint === parent.fingerprint) {
    throw historyError(
      'history-candidate-unchanged',
      'Candidate checkpoint requires a new Host fingerprint',
    );
  }
  if (
    ['baseline', 'evaluated', 'accepted', 'rejected', 'superseded'].includes(checkpoint.state) &&
    checkpoint.fingerprint !== parent.fingerprint
  ) {
    throw historyError(
      'history-fingerprint-drift',
      `${checkpoint.state} checkpoint must retain its parent Host fingerprint`,
    );
  }
}

function hasExplicitLineage(history, fromIdentity, toIdentity) {
  return history.renameLineage.some(
    (lineage) =>
      hostIdentityKey(lineage.fromIdentity) === hostIdentityKey(fromIdentity) &&
      hostIdentityKey(lineage.toIdentity) === hostIdentityKey(toIdentity),
  );
}

function assertNoLineageAmbiguity(history, key) {
  const outgoing = history.renameLineage.filter(
    (lineage) => hostIdentityKey(lineage.fromIdentity) === key,
  );
  if (outgoing.length > 1) {
    throw historyError(
      'rename-lineage-ambiguous',
      `Multiple rename/move records leave Host identity ${key}`,
    );
  }
}

function validateStoredDevelopmentHistory(history) {
  let prior = { ...history, entries: [] };
  for (const checkpoint of history.entries) {
    validateCheckpointLineage(prior, checkpoint);
    prior = { ...prior, entries: [...prior.entries, checkpoint] };
  }
  const sourceKeys = new Set(
    history.entries.map((entry) => `${hostIdentityKey(entry.identity)}:${entry.fingerprint}`),
  );
  for (const lineage of history.renameLineage) {
    const source = `${hostIdentityKey(lineage.fromIdentity)}:${lineage.fromIdentity.fingerprint}`;
    if (!sourceKeys.has(source)) {
      throw historyError(
        'rename-lineage-source-missing',
        `Rename lineage source checkpoint is missing: ${lineage.id}`,
      );
    }
    assertNoLineageAmbiguity(history, hostIdentityKey(lineage.fromIdentity));
  }
  assertNoLineageCycles(history);
  return history;
}

function assertNoLineageCycles(history) {
  const nextByIdentity = new Map(
    history.renameLineage.map((lineage) => [
      hostIdentityKey(lineage.fromIdentity),
      hostIdentityKey(lineage.toIdentity),
    ]),
  );
  for (const start of nextByIdentity.keys()) {
    const visited = new Set();
    let current = start;
    while (nextByIdentity.has(current)) {
      if (visited.has(current)) {
        throw historyError(
          'rename-lineage-cycle',
          `Rename/move lineage contains a cycle at ${current}`,
        );
      }
      visited.add(current);
      current = nextByIdentity.get(current);
    }
  }
}

async function writeHistory(file, history, options) {
  const io = options.fs ?? fs;
  await io.mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${Date.now().toString(36)}`;
  try {
    await io.writeFile(temporary, `${JSON.stringify(history, null, 2)}\n`, 'utf8');
    await io.rename(temporary, file);
  } catch (error) {
    await io.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

function readErrorCode(error) {
  return typeof error === 'object' && error && typeof error.code === 'string'
    ? error.code
    : undefined;
}

function historyError(code, message) {
  return Object.assign(new Error(message), { code });
}
