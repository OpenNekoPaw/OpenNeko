import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const AGENT_EVAL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_WORKSPACE_ROOT = resolve(AGENT_EVAL_ROOT, '../../reports/agent-eval/.workspaces');

export async function prepareWorkspaceFixture(fixture, options = {}) {
  const sourceRoot = resolve(options.agentEvalRoot ?? AGENT_EVAL_ROOT, fixture.root);
  assertContained(resolve(options.agentEvalRoot ?? AGENT_EVAL_ROOT), sourceRoot, 'fixture root');
  const digest = await computeFixtureDigest(sourceRoot);
  if (digest !== fixture.digest) {
    throw new Error(
      `fixture ${fixture.id} digest mismatch: declared ${fixture.digest}, observed ${digest}`,
    );
  }
  const temporaryRoot =
    options.temporaryRoot ?? (options.agentEvalRoot ? os.tmpdir() : DEFAULT_WORKSPACE_ROOT);
  await fs.mkdir(temporaryRoot, { recursive: true });
  const workspace = await fs.mkdtemp(join(temporaryRoot, `neko-agent-eval-${fixture.id}-`));
  try {
    await copyFixtureTree(sourceRoot, workspace);
  } catch (error) {
    await fs.rm(workspace, { recursive: true, force: true });
    throw error;
  }
  return {
    fixtureId: fixture.id,
    digest,
    workspace,
    async cleanup() {
      await fs.rm(workspace, { recursive: true, force: true });
    },
  };
}

export async function computeFixtureDigest(root) {
  const absoluteRoot = resolve(root);
  const files = await listFixtureFiles(absoluteRoot);
  const hash = createHash('sha256');
  for (const file of files) {
    const path = relative(absoluteRoot, file).split(sep).join('/');
    hash.update(path);
    hash.update('\0');
    hash.update(await fs.readFile(file));
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

async function listFixtureFiles(root) {
  const files = [];
  await visit(root);
  return files.sort((left, right) => left.localeCompare(right));

  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`fixture contains a symlink: ${path}`);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push(path);
      else throw new Error(`fixture contains an unsupported filesystem entry: ${path}`);
    }
  }
}

async function copyFixtureTree(sourceRoot, targetRoot) {
  const files = await listFixtureFiles(sourceRoot);
  for (const source of files) {
    const path = relative(sourceRoot, source);
    const target = resolve(targetRoot, path);
    assertContained(targetRoot, target, 'fixture copy path');
    await fs.mkdir(dirname(target), { recursive: true });
    await fs.copyFile(source, target);
  }
}

function assertContained(root, target, label) {
  const relation = relative(root, target);
  if (relation === '..' || relation.startsWith(`..${sep}`) || relation.startsWith(sep)) {
    throw new Error(`${label} escapes its owning directory`);
  }
}
