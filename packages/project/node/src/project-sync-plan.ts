import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { decideProjectTraversal, parseWorkspaceIdentityJson } from '@neko/local-metadata';
import { parseProjectSyncPlan, type ProjectSyncPlan } from '@neko/project-domain/contracts';

const EXCLUDED_TOOL_DIRECTORIES = new Set([
  '.git',
  '.turbo',
  '.vite',
  'coverage',
  'dist',
  'node_modules',
  'out',
]);

export async function createProjectSyncPlan(input: {
  readonly workspaceRoot: string;
  readonly projectId: string;
  readonly signal?: AbortSignal;
}): Promise<ProjectSyncPlan> {
  if (!path.isAbsolute(input.workspaceRoot)) {
    throw new Error('Project sync planning requires an absolute Workspace root.');
  }
  input.signal?.throwIfAborted();
  const identityPath = path.join(input.workspaceRoot, 'neko', 'project.json');
  const identity = parseWorkspaceIdentityJson(await fs.readFile(identityPath, 'utf8'));
  if (`content:${identity.workspaceId}` !== input.projectId) {
    throw new Error('Project sync identity does not match the synchronized Project fact.');
  }
  const entries: Array<{ readonly relativePath: string; readonly byteLength: number }> = [];
  await visit(input.workspaceRoot);
  entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath, 'en-US'));
  return parseProjectSyncPlan({
    projectId: input.projectId,
    entries,
    totalByteLength: entries.reduce((total, entry) => total + entry.byteLength, 0),
  });

  async function visit(directory: string): Promise<void> {
    input.signal?.throwIfAborted();
    const children = await fs.readdir(directory, { withFileTypes: true });
    for (const child of children) {
      input.signal?.throwIfAborted();
      const absolutePath = path.join(directory, child.name);
      const relativePath = path
        .relative(input.workspaceRoot, absolutePath)
        .split(path.sep)
        .join('/');
      const entryKind = child.isSymbolicLink()
        ? 'symbolic-link'
        : child.isDirectory()
          ? 'directory'
          : 'file';
      const decision = decideProjectTraversal(relativePath, entryKind, 'sync');
      if (decision.action === 'exclude-project-local') continue;
      if (child.name.startsWith('.')) continue;
      if (child.isSymbolicLink()) continue;
      if (child.isDirectory()) {
        if (EXCLUDED_TOOL_DIRECTORIES.has(child.name)) continue;
        await visit(absolutePath);
        continue;
      }
      if (!child.isFile()) continue;
      const stat = await fs.stat(absolutePath);
      entries.push({ relativePath: decision.relativePath, byteLength: stat.size });
    }
  }
}
