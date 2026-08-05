import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parseOtio, serializeOtio, type OtioTimeline } from '@neko/cut-domain';
import { PROJECT_ENTITY_DOCUMENT_WORKSPACE_PATH } from '@neko/entity-domain';
import { NodeProjectEntityRepresentationReferenceService } from '@neko/entity-node';
import {
  normalizeWorkspaceContentPath,
  validateContentLocator,
  type ContentLocator,
} from '@neko/content';
import {
  aggregateWorkspaceMediaLibraryRequirements,
  type ProjectContentReferenceOwnerSnapshot,
  type WorkspaceMediaLibraryRequirementSnapshot,
} from '@neko/assets-domain/contracts';
import { loadNkc, saveNkc } from '@neko/canvas-domain';

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

export interface ProjectContentReferenceSnapshot {
  readonly owners: readonly ProjectContentReferenceOwnerSnapshot[];
  readonly diagnostics: readonly ProjectContentReferenceDiagnostic[];
  readonly requirements: WorkspaceMediaLibraryRequirementSnapshot;
}

export interface ProjectContentReferenceDiagnostic {
  readonly code: 'invalid-project-document';
  readonly ownerKind: ProjectContentReferenceOwnerSnapshot['ownerKind'];
  readonly ownerId: string;
}

export async function readProjectContentReferences(input: {
  readonly workspacePath: string;
  readonly projectId: string;
}): Promise<ProjectContentReferenceSnapshot> {
  const projectDocuments = await listProjectDocuments(input.workspacePath);
  const owners: ProjectContentReferenceOwnerSnapshot[] = [];
  const diagnostics: ProjectContentReferenceDiagnostic[] = [];
  const incompleteOwnerKinds = new Set<ProjectContentReferenceOwnerSnapshot['ownerKind']>();
  for (const documentPath of projectDocuments) {
    const extension = path.extname(documentPath).toLocaleLowerCase('en-US');
    try {
      if (extension === '.nkc') {
        owners.push(await readCanvasReferences(input.workspacePath, documentPath));
      } else if (extension === '.otio') {
        owners.push(await readCutReferences(input.workspacePath, documentPath));
      }
    } catch (error: unknown) {
      if (!(error instanceof InvalidProjectDocumentError)) throw error;
      diagnostics.push(error.diagnostic);
      incompleteOwnerKinds.add(error.diagnostic.ownerKind);
    }
  }
  try {
    owners.push(await readEntityRepresentationReferences(input));
  } catch (error: unknown) {
    if (!(error instanceof InvalidProjectDocumentError)) throw error;
    diagnostics.push(error.diagnostic);
    incompleteOwnerKinds.add(error.diagnostic.ownerKind);
  }
  const expectedOwnerKinds = ['canvas', 'cut', 'entity-representation'] as const;
  const coverage = {
    expectedOwnerKinds,
    coveredOwnerKinds: expectedOwnerKinds.filter((kind) => !incompleteOwnerKinds.has(kind)),
  };
  return {
    owners,
    diagnostics,
    requirements: aggregateWorkspaceMediaLibraryRequirements({ owners, coverage }),
  };
}

export async function rewriteProjectContentReferences(input: {
  readonly stagedWorkspacePath: string;
  readonly projectId: string;
  readonly replacements: ReadonlyMap<string, string>;
}): Promise<ProjectContentReferenceSnapshot> {
  const projectDocuments = await listProjectDocuments(input.stagedWorkspacePath);
  for (const documentPath of projectDocuments) {
    const extension = path.extname(documentPath).toLocaleLowerCase('en-US');
    if (extension === '.nkc') {
      await rewriteCanvasReferences(input.stagedWorkspacePath, documentPath, input.replacements);
    } else if (extension === '.otio') {
      await rewriteCutReferences(input.stagedWorkspacePath, documentPath, input.replacements);
    }
  }
  await rewriteEntityRepresentationReferences(
    input.stagedWorkspacePath,
    input.projectId,
    input.replacements,
  );
  return readProjectContentReferences({
    workspacePath: input.stagedWorkspacePath,
    projectId: input.projectId,
  });
}

async function readCanvasReferences(
  workspacePath: string,
  documentPath: string,
): Promise<ProjectContentReferenceOwnerSnapshot> {
  const bytes = await fs.readFile(documentPath);
  const ownerId = workspaceRelativePath(workspacePath, documentPath);
  const loaded = loadNkc(bytes.toString('utf8'));
  if (!loaded.validation.valid) {
    throw invalidProjectDocument('canvas', ownerId);
  }
  let references: readonly ContentLocator[];
  try {
    references = collectNamedContentLocators(loaded.data);
  } catch (error: unknown) {
    if (!(error instanceof InvalidProjectDocumentContentError)) throw error;
    throw invalidProjectDocument('canvas', ownerId);
  }
  return {
    ownerKind: 'canvas',
    ownerId,
    revision: fingerprint(bytes),
    references,
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
    throw invalidProjectDocument('canvas', workspaceRelativePath(workspacePath, documentPath));
  }
  const data = structuredClone(loaded.data);
  let rewrittenCount: number;
  try {
    rewrittenCount = rewriteNamedContentLocators(data, replacements);
  } catch (error: unknown) {
    if (!(error instanceof InvalidProjectDocumentContentError)) throw error;
    throw invalidProjectDocument('canvas', workspaceRelativePath(workspacePath, documentPath));
  }
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
  const ownerId = workspaceRelativePath(workspacePath, documentPath);
  if (!parsed.ok) {
    throw invalidProjectDocument('cut', ownerId);
  }
  const documentDirectory = path.posix.dirname(ownerId);
  const references: ContentLocator[] = [];
  for (const track of parsed.document.tracks.children) {
    for (const item of track.children) {
      if (item.OTIO_SCHEMA !== 'Clip.2') continue;
      const targetPath = normalizeWorkspaceContentPath(
        path.posix.normalize(path.posix.join(documentDirectory, item.media_reference.target_url)),
      );
      if (!targetPath) {
        throw invalidProjectDocument('cut', ownerId);
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
  const ownerId = workspaceRelativePath(workspacePath, documentPath);
  if (!parsed.ok) {
    throw invalidProjectDocument('cut', ownerId);
  }
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
            throw invalidProjectDocument('cut', ownerId);
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

async function readEntityRepresentationReferences(input: {
  readonly workspacePath: string;
  readonly projectId: string;
}): Promise<ProjectContentReferenceOwnerSnapshot> {
  let snapshot: Awaited<ReturnType<NodeProjectEntityRepresentationReferenceService['inspect']>>;
  try {
    snapshot = await new NodeProjectEntityRepresentationReferenceService(input).inspect();
  } catch {
    throw invalidProjectDocument('entity-representation', PROJECT_ENTITY_DOCUMENT_WORKSPACE_PATH);
  }
  return {
    ownerKind: 'entity-representation',
    ownerId: PROJECT_ENTITY_DOCUMENT_WORKSPACE_PATH,
    revision: snapshot.fingerprint,
    references: snapshot.references,
  };
}

async function rewriteEntityRepresentationReferences(
  workspacePath: string,
  projectId: string,
  replacements: ReadonlyMap<string, string>,
): Promise<void> {
  const service = new NodeProjectEntityRepresentationReferenceService({
    workspacePath,
    projectId,
  });
  await service.rewriteWorkspacePaths({
    replacements,
  });
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
          throw new InvalidProjectDocumentContentError();
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
          throw new InvalidProjectDocumentContentError();
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

class InvalidProjectDocumentError extends Error {
  constructor(readonly diagnostic: ProjectContentReferenceDiagnostic) {
    super(`Project document '${diagnostic.ownerId}' is invalid.`);
    this.name = 'InvalidProjectDocumentError';
  }
}

class InvalidProjectDocumentContentError extends Error {}

function invalidProjectDocument(
  ownerKind: ProjectContentReferenceDiagnostic['ownerKind'],
  ownerId: string,
): InvalidProjectDocumentError {
  return new InvalidProjectDocumentError({
    code: 'invalid-project-document',
    ownerKind,
    ownerId,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
