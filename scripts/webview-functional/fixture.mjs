import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readdir, readFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';

export async function prepareFixture(repoRoot, fixture, options = {}) {
  const source = resolveWithin(repoRoot, fixture.copyFrom ?? fixture.workspace);
  const sourceRealPath = await realpath(source);
  const runBase = options.workspaceRoot
    ? join(await realpath(options.workspaceRoot), '.neko', '.functional')
    : tmpdir();
  await mkdir(runBase, { recursive: true });
  const runRoot = await mkdtemp(join(runBase, 'neko-webview-functional-'));
  const fixtureRoot = join(runRoot, basename(fixture.workspace) || 'workspace');
  await cp(sourceRealPath, fixtureRoot, { recursive: true, force: false, errorOnExist: true });
  const digest = await digestFixture(fixtureRoot, fixture.digestFiles);
  return { runRoot, fixtureRoot, digest };
}

async function digestFixture(fixtureRoot, configuredFiles) {
  const files = configuredFiles.length > 0 ? configuredFiles : await listFiles(fixtureRoot);
  const hash = createHash('sha256');
  for (const path of [...files].sort()) {
    const target = resolveWithin(fixtureRoot, path);
    hash.update(path);
    hash.update('\0');
    hash.update(await readFile(target));
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

async function listFiles(root, prefix = '') {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, path)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function resolveWithin(root, path) {
  const target = resolve(root, path);
  const relativePath = relative(root, target);
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`Fixture path escapes its owner root: ${path}`);
  }
  return target;
}
