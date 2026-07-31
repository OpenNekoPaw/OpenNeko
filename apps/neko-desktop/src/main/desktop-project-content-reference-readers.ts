import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parseOtio, serializeOtio, type OtioTimeline } from '@neko-cut/domain';
import {
  ENTITY_REPRESENTATION_BINDING_WORKSPACE_PATH,
  aggregateWorkspaceMediaLibraryRequirements,
  assertEntityRepresentationBindingFile,
  encodeEntityRepresentationBindingFile,
  loadNkc,
  normalizeWorkspaceContentPath,
  saveNkc,
  validateContentLocator,
  type ContentLocator,
  type ProjectContentReferenceOwnerSnapshot,
  type WorkspaceMediaLibraryRequirementSnapshot,
} from '@neko/shared';

const PROJECT_DOCUMENT_EXTENSIONS = new Set(['.nkc', '.otio']);
const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.neko',
  '.turbo',
  '.vite',
  'coverage',
  'dist',
  'node_modules',
  'out',
]);

export interface DesktopProjectContentReferenceSnapshot {
  readonly owners: readonly ProjectContentReferenceOwnerSnapshot[];
  readonly requirements: WorkspaceMediaLibraryRequirementSnapshot;
}

export async function readDesktopProjectContentReferences(
  workspacePath: string,
): Promise<DesktopProjectContentReferenceSnapshot> {
  const projectDocuments = await listProjectDocuments(workspacePath);
  const owners: ProjectContentReferenceOwnerSnapshot[] = [];
  for (const documentPath of projectDocuments) {
    const extension = path.extname(documentPath).toLocaleLowerCase('en-US');
    if (extension === '.nkc') {
      owners.push(await readCanvasReferences(workspacePath, documentPath));
    } else if (extension === '.otio') {
      owners.push(await readCutReferences(workspacePath, documentPath));
    }
  }
  owners.push(await readEntityRepresentationReferences(workspacePath));
  const coverage = {
    expectedOwnerKinds: ['canvas', 'cut', 'entity-representation'] as const,
    coveredOwnerKinds: ['canvas', 'cut', 'entity-representation'] as const,
  };
  return {
    owners,
    requirements: aggregateWorkspaceMediaLibraryRequirements({ owners, coverage }),
  };
}

export async function rewriteDesktopProjectContentReferences(input: {
  readonly stagedWorkspacePath: string;
  readonly replacements: ReadonlyMap<string, string>;
}): Promise<DesktopProjectContentReferenceSnapshot> {
  const projectDocuments = await listProjectDocuments(input.stagedWorkspacePath);
  for (const documentPath of projectDocuments) {
    const extension = path.extname(documentPath).toLocaleLowerCase('en-US');
    if (extension === '.nkc') {
      await rewriteCanvasReferences(input.stagedWorkspacePath, documentPath, input.replacements);
    } else if (extension === '.otio') {
      await rewriteCutReferences(input.stagedWorkspacePath, documentPath, input.replacements);
    }
  }
  await rewriteEntityRepresentationReferences(input.stagedWorkspacePath, input.replacements);
  return readDesktopProjectContentReferences(input.stagedWorkspacePath);
}

async function readCanvasReferences(
  workspacePath: string,
  documentPath: string,
): Promise<ProjectContentReferenceOwnerSnapshot> {
  const bytes = await fs.readFile(documentPath);
  const loaded = loadNkc(bytes.toString('utf8'));
  if (!loaded.validation.valid) {
    throw new Error(
      `Canvas project document '${workspaceRelativePath(workspacePath, documentPath)}' is invalid.`,
    );
  }
  return {
    ownerKind: 'canvas',
    ownerId: workspaceRelativePath(workspacePath, documentPath),
    revision: fingerprint(bytes),
    references: collectNamedContentLocators(loaded.data),
  };
}

async function rewriteCanvasReferences(
  workspacePath: string,
  documentPath: string,
  replacements: ReadonlyMap<string, string>,
): Promise<void> {
  const bytes = await fs.readFile(documentPath);
  const loaded = loadNkc(bytes.toString('utf8'));
  if (!loaded.validation.valid) {
    throw new Error(
      `Canvas project document '${workspaceRelativePath(workspacePath, documentPath)}' is invalid.`,
    );
  }
  const data = structuredClone(loaded.data);
  const rewrittenCount = rewriteNamedContentLocators(data, replacements);
  if (rewrittenCount > 0) {
    await fs.writeFile(documentPath, saveNkc(data));
  }
}

async function readCutReferences(
  workspacePath: string,
  documentPath: string,
): Promise<ProjectContentReferenceOwnerSnapshot> {
  const bytes = await fs.readFile(documentPath);
  const parsed = parseOtio(bytes);
  if (!parsed.ok) {
    throw new Error(
      `Cut project document '${workspaceRelativePath(workspacePath, documentPath)}' is invalid.`,
    );
  }
  const ownerId = workspaceRelativePath(workspacePath, documentPath);
  const documentDirectory = path.posix.dirname(ownerId);
  const references: ContentLocator[] = [];
  for (const track of parsed.document.tracks.children) {
    for (const item of track.children) {
      if (item.OTIO_SCHEMA !== 'Clip.2') continue;
      const targetPath = normalizeWorkspaceContentPath(
        path.posix.normalize(path.posix.join(documentDirectory, item.media_reference.target_url)),
      );
      if (!targetPath) {
        throw new Error(`Cut project document '${ownerId}' contains an invalid media target.`);
      }
      references.push({ kind: 'workspace-file', path: targetPath });
    }
  }
  return {
    ownerKind: 'cut',
    ownerId,
    revision: fingerprint(bytes),
    references,
  };
}

async function rewriteCutReferences(
  workspacePath: string,
  documentPath: string,
  replacements: ReadonlyMap<string, string>,
): Promise<void> {
  const bytes = await fs.readFile(documentPath);
  const parsed = parseOtio(bytes);
  if (!parsed.ok) {
    throw new Error(
      `Cut project document '${workspaceRelativePath(workspacePath, documentPath)}' is invalid.`,
    );
  }
  const ownerId = workspaceRelativePath(workspacePath, documentPath);
  const documentDirectory = path.posix.dirname(ownerId);
  let rewrittenCount = 0;
  const document: OtioTimeline = {
    ...parsed.document,
    tracks: {
      ...parsed.document.tracks,
      children: parsed.document.tracks.children.map((track) => ({
        ...track,
        children: track.children.map((item) => {
          if (item.OTIO_SCHEMA !== 'Clip.2') return item;
          const sourcePath = normalizeWorkspaceContentPath(
            path.posix.normalize(
              path.posix.join(documentDirectory, item.media_reference.target_url),
            ),
          );
          if (!sourcePath) {
            throw new Error(`Cut project document '${ownerId}' contains an invalid media target.`);
          }
          const replacement = replacements.get(sourcePath);
          if (!replacement) return item;
          rewrittenCount += 1;
          return {
            ...item,
            media_reference: {
              ...item.media_reference,
              target_url: path.posix.relative(documentDirectory, replacement),
            },
          };
        }),
      })),
    },
  };
  if (rewrittenCount > 0) {
    await fs.writeFile(documentPath, serializeOtio(document));
  }
}

async function readEntityRepresentationReferences(
  workspacePath: string,
): Promise<ProjectContentReferenceOwnerSnapshot> {
  const documentPath = path.join(
    workspacePath,
    ...ENTITY_REPRESENTATION_BINDING_WORKSPACE_PATH.split('/'),
  );
  let bytes: Buffer;
  try {
    bytes = await fs.readFile(documentPath);
  } catch (error: unknown) {
    if (!isNodeError(error, 'ENOENT')) throw error;
    return {
      ownerKind: 'entity-representation',
      ownerId: ENTITY_REPRESENTATION_BINDING_WORKSPACE_PATH,
      revision: 'absent',
      references: [],
    };
  }
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString('utf8')) as unknown;
  } catch {
    throw new Error('Entity representation binding project document is malformed.');
  }
  const file = assertEntityRepresentationBindingFile(value);
  return {
    ownerKind: 'entity-representation',
    ownerId: ENTITY_REPRESENTATION_BINDING_WORKSPACE_PATH,
    revision: fingerprint(bytes),
    references: file.bindings
      .filter((binding) => binding.status === 'confirmed' && binding.availability === 'active')
      .map((binding) => binding.representation),
  };
}

async function rewriteEntityRepresentationReferences(
  workspacePath: string,
  replacements: ReadonlyMap<string, string>,
): Promise<void> {
  const documentPath = path.join(
    workspacePath,
    ...ENTITY_REPRESENTATION_BINDING_WORKSPACE_PATH.split('/'),
  );
  let bytes: Buffer;
  try {
    bytes = await fs.readFile(documentPath);
  } catch (error: unknown) {
    if (isNodeError(error, 'ENOENT')) return;
    throw error;
  }
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString('utf8')) as unknown;
  } catch {
    throw new Error('Entity representation binding project document is malformed.');
  }
  const file = assertEntityRepresentationBindingFile(value);
  let rewrittenCount = 0;
  const bindings = file.bindings.map((binding) => {
    const representation = replaceContentLocator(binding.representation, replacements);
    if (representation === binding.representation) return binding;
    rewrittenCount += 1;
    return { ...binding, representation };
  });
  if (rewrittenCount > 0) {
    await fs.writeFile(documentPath, encodeEntityRepresentationBindingFile({ ...file, bindings }));
  }
}

function collectNamedContentLocators(value: unknown): readonly ContentLocator[] {
  const references: ContentLocator[] = [];
  visit(value);
  return references;

  function visit(candidate: unknown): void {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (!isRecord(candidate)) return;
    for (const [key, nested] of Object.entries(candidate)) {
      if (key === 'contentLocator') {
        const locator = validateContentLocator(nested);
        if (!locator.ok) {
          throw new Error('Canvas project document contains an invalid ContentLocator.');
        }
        references.push(locator.locator);
        continue;
      }
      visit(nested);
    }
  }
}

function rewriteNamedContentLocators(
  value: unknown,
  replacements: ReadonlyMap<string, string>,
): number {
  let rewrittenCount = 0;
  visit(value);
  return rewrittenCount;

  function visit(candidate: unknown): void {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (!isRecord(candidate)) return;
    for (const [key, nested] of Object.entries(candidate)) {
      if (key === 'contentLocator') {
        const locator = validateContentLocator(nested);
        if (!locator.ok) {
          throw new Error('Canvas project document contains an invalid ContentLocator.');
        }
        const replacement = replaceContentLocator(locator.locator, replacements);
        if (replacement !== locator.locator) {
          candidate[key] = replacement;
          rewrittenCount += 1;
        }
        continue;
      }
      visit(nested);
    }
  }
}

function replaceContentLocator(
  locator: ContentLocator,
  replacements: ReadonlyMap<string, string>,
): ContentLocator {
  if (locator.kind === 'workspace-file') {
    const replacement = replacements.get(locator.path);
    return replacement ? { ...locator, path: replacement } : locator;
  }
  if (locator.kind === 'document-entry') {
    const replacement = replacements.get(locator.source.path);
    return replacement ? { ...locator, source: { ...locator.source, path: replacement } } : locator;
  }
  return locator;
}

async function listProjectDocuments(workspacePath: string): Promise<readonly string[]> {
  const documents: string[] = [];
  await walk(workspacePath);
  return documents.sort((left, right) => left.localeCompare(right, 'en-US'));

  async function walk(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORIES.has(entry.name)) await walk(entryPath);
        continue;
      }
      if (
        entry.isFile() &&
        PROJECT_DOCUMENT_EXTENSIONS.has(path.extname(entry.name).toLocaleLowerCase('en-US'))
      ) {
        documents.push(entryPath);
      }
    }
  }
}

function workspaceRelativePath(workspacePath: string, filePath: string): string {
  const relative = path.relative(workspacePath, filePath).split(path.sep).join('/');
  const normalized = normalizeWorkspaceContentPath(relative);
  if (!normalized) throw new Error('Project document path escapes the workspace.');
  return normalized;
}

function fingerprint(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
