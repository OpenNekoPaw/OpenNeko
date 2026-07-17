import { createHash } from 'node:crypto';
import { execFile as nodeExecFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { SUPPORTED_FILE_VALIDATOR_IDS } from '../schemas/artifact-validator-policy.mjs';

export { assertSupportedArtifactValidators } from '../schemas/artifact-validator-policy.mjs';

const execFile = promisify(nodeExecFile);
const AGENT_EVAL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE_VALIDATOR_CLI = resolve(AGENT_EVAL_ROOT, 'validators/file-validator-cli.mjs');
const CANVAS_VALIDATOR_CLI = resolve(AGENT_EVAL_ROOT, 'canvas-json-check.mjs');
const VALIDATOR_TIMEOUT_MS = 30_000;

export async function evaluateArtifactChecks(checks, input) {
  const results = [];
  for (const check of checks) {
    try {
      const details =
        check.kind === 'file'
          ? await evaluateFileCheck(check, input)
          : check.kind === 'file-absent'
            ? await evaluateFileAbsentCheck(check, input)
            : check.kind === 'directory-files'
              ? await evaluateDirectoryFilesCheck(check, input)
              : evaluateStableArtifactCheck(check, input.facts);
      results.push({
        id: check.id,
        kind: check.kind,
        status: 'pass',
        evidenceRefs: [check.evidenceRef],
        details,
      });
    } catch (error) {
      if (!(error instanceof ArtifactCheckFailure)) throw error;
      results.push({
        id: check.id,
        kind: check.kind,
        status: 'fail',
        evidenceRefs: [check.evidenceRef],
        message: error.message,
      });
    }
  }
  return results;
}

export async function resolveContainedArtifactFile(workspace, relativePath) {
  assertSafeRelativePath(relativePath);
  const root = await fs.realpath(workspace);
  const target = resolve(root, relativePath);
  assertContained(root, target, relativePath);
  const segments = relative(root, target).split(sep).filter(Boolean);
  let current = root;
  for (const segment of segments) {
    current = resolve(current, segment);
    let stat;
    try {
      stat = await fs.lstat(current);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        throw new ArtifactCheckFailure(`artifact file does not exist: ${relativePath}`);
      }
      throw error;
    }
    if (stat.isSymbolicLink()) {
      throw new ArtifactCheckFailure(`artifact path crosses a symlink: ${relativePath}`);
    }
  }
  const stat = await fs.lstat(target);
  if (!stat.isFile())
    throw new ArtifactCheckFailure(`artifact is not a regular file: ${relativePath}`);
  return target;
}

async function evaluateFileCheck(check, input) {
  const file = await resolveContainedArtifactFile(input.workspace, check.path);
  const bytes = await fs.readFile(file);
  assertNoSecretBearingContent(bytes, check.path);
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  if (digest !== check.digest) {
    throw new ArtifactCheckFailure(
      `artifact digest mismatch for ${check.path}: expected ${check.digest}, observed ${digest}`,
    );
  }
  await runPublicValidator(check.validatorId, file, input.runValidator);
  return {
    ref: check.path,
    kind: 'file',
    path: check.path,
    digest,
    provenance: 'fixture-workspace',
    deliveryStatus: 'delivered',
    validatorId: check.validatorId,
    validatorStatus: 'valid',
  };
}

async function evaluateFileAbsentCheck(check, input) {
  assertSafeRelativePath(check.path);
  const root = await fs.realpath(input.workspace);
  const target = resolve(root, check.path);
  assertContained(root, target, check.path);
  const segments = relative(root, target).split(sep).filter(Boolean);
  let current = root;
  for (const segment of segments) {
    current = resolve(current, segment);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) {
        throw new ArtifactCheckFailure(`artifact absence path crosses a symlink: ${check.path}`);
      }
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return { ref: check.path, kind: 'file-absent', path: check.path };
      }
      throw error;
    }
  }
  throw new ArtifactCheckFailure(`forbidden artifact path exists: ${check.path}`);
}

async function evaluateDirectoryFilesCheck(check, input) {
  assertSafeRelativePath(check.path);
  const root = await fs.realpath(input.workspace);
  const target = resolve(root, check.path);
  assertContained(root, target, check.path);
  const segments = relative(root, target).split(sep).filter(Boolean);
  let current = root;
  for (const segment of segments) {
    current = resolve(current, segment);
    let stat;
    try {
      stat = await fs.lstat(current);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        throw new ArtifactCheckFailure(`artifact directory does not exist: ${check.path}`);
      }
      throw error;
    }
    if (stat.isSymbolicLink()) {
      throw new ArtifactCheckFailure(`artifact directory path crosses a symlink: ${check.path}`);
    }
  }
  const directory = await fs.lstat(target);
  if (!directory.isDirectory()) {
    throw new ArtifactCheckFailure(`artifact path is not a directory: ${check.path}`);
  }
  const entries = await fs.readdir(target, { withFileTypes: true });
  if (entries.some((entry) => entry.isSymbolicLink())) {
    throw new ArtifactCheckFailure(`artifact directory contains a symlink: ${check.path}`);
  }
  const fileCount = entries.filter((entry) => entry.isFile()).length;
  if (fileCount < check.minFiles) {
    throw new ArtifactCheckFailure(
      `artifact directory ${check.path} has ${fileCount} regular file(s); expected at least ${check.minFiles}`,
    );
  }
  return {
    ref: check.path,
    kind: 'directory-files',
    path: check.path,
    fileCount,
    deliveryStatus: 'delivered',
    validatorId: 'contained-regular-files',
    validatorStatus: 'valid',
  };
}

function evaluateStableArtifactCheck(check, facts) {
  assertCompleteArtifactEvidence(facts);
  const artifact = (Array.isArray(facts?.artifacts) ? facts.artifacts : []).find(
    (candidate) => candidate?.ref === check.ref,
  );
  if (!artifact)
    throw new ArtifactCheckFailure(`stable artifact ref was not observed: ${check.ref}`);
  if (artifact.kind !== check.kind) {
    throw new ArtifactCheckFailure(
      `artifact ${check.ref} kind mismatch: expected ${check.kind}, observed ${artifact.kind}`,
    );
  }
  if (artifact.digest !== check.digest) {
    throw new ArtifactCheckFailure(`artifact ${check.ref} digest did not match`);
  }
  if (check.kind === 'project-revision' && artifact.revision !== check.revision) {
    throw new ArtifactCheckFailure(`artifact ${check.ref} revision did not match`);
  }
  if (
    artifact.deliveryStatus !== 'delivered' ||
    artifact.validator?.id !== check.validatorId ||
    artifact.validator?.status !== 'valid'
  ) {
    throw new ArtifactCheckFailure(
      `artifact ${check.ref} was not delivered through validator ${check.validatorId}`,
    );
  }
  return {
    ref: artifact.ref,
    kind: artifact.kind,
    stableRef: artifact.ref,
    digest: artifact.digest,
    ...(artifact.revision ? { revision: artifact.revision } : {}),
    provenance: artifact.provenance?.source ?? 'unavailable',
    deliveryStatus: artifact.deliveryStatus,
    validatorId: artifact.validator.id,
    validatorStatus: artifact.validator.status,
  };
}

async function runPublicValidator(validatorId, file, injectedRunner) {
  if (injectedRunner) {
    await injectedRunner({ validatorId, file });
    return;
  }
  const args =
    validatorId === 'canvas-json-v1'
      ? [CANVAS_VALIDATOR_CLI, '--file', file]
      : [FILE_VALIDATOR_CLI, validatorId, file];
  try {
    await execFile(process.execPath, args, {
      timeout: VALIDATOR_TIMEOUT_MS,
      maxBuffer: 64 * 1024,
      windowsHide: true,
    });
  } catch (error) {
    if (error?.killed || error?.code === 'ETIMEDOUT') {
      throw new Error(`public artifact validator ${validatorId} timed out`);
    }
    throw new ArtifactCheckFailure(`public artifact validator ${validatorId} rejected artifact`);
  }
}

function assertCompleteArtifactEvidence(facts) {
  const completeness = facts?.evidenceCompleteness?.artifacts;
  if (!completeness || !Number.isInteger(completeness.droppedCount)) {
    throw new ArtifactCheckFailure('artifact evidence completeness is unavailable');
  }
  if (completeness.droppedCount > 0) {
    throw new ArtifactCheckFailure(
      `artifact evidence is incomplete; dropped ${completeness.droppedCount} item(s)`,
    );
  }
}

function assertNoSecretBearingContent(bytes, relativePath) {
  const text = bytes.toString('utf8');
  const patterns = [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
    /\bBearer\s+\S+/iu,
    /\bsk-[a-z0-9_-]{8,}/iu,
    /\b(?:api[_-]?key|access[_-]?token|authorization|password|secret)\s*[:=]\s*\S+/iu,
  ];
  if (patterns.some((pattern) => pattern.test(text))) {
    throw new ArtifactCheckFailure(`artifact contains secret-bearing content: ${relativePath}`);
  }
}

function assertSafeRelativePath(value) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.includes('\0') ||
    isAbsolute(value) ||
    value.startsWith('~') ||
    value.split(/[\\/]/u).some((segment) => segment === '..' || segment.length === 0)
  ) {
    throw new ArtifactCheckFailure('artifact path must be a contained fixture-relative path');
  }
}

function assertContained(root, target, input) {
  const relation = relative(root, target);
  if (relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
    throw new ArtifactCheckFailure(`artifact path escapes fixture workspace: ${input}`);
  }
}

class ArtifactCheckFailure extends Error {
  constructor(message) {
    super(message);
    this.name = 'ArtifactCheckFailure';
  }
}
