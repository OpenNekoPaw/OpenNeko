#!/usr/bin/env -S pnpm exec tsx

import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadNkc, saveNkc } from '@neko/canvas-domain';
import { parseCharacterProject } from '@neko/chara/contracts';
import {
  serializeContentReferenceTarget,
  validateContentLocator,
  type DocumentEntryContentLocator,
  type MediaLibraryContentLocator,
} from '@neko/content';
import { parseOtio, serializeOtio, type OtioTimeline } from '@neko/cut-domain';
import {
  assertProjectEntityDocument,
  encodeProjectEntityDocument,
  PROJECT_ENTITY_DOCUMENT_WORKSPACE_PATH,
} from '@neko/entity-domain';
import { parseWorkspaceIdentityJson } from '@neko/local-metadata';
import {
  projectEntityCharacterAssociationRelativePath,
  parseProjectEntityCharacterAssociationJson,
  serializeProjectEntityCharacterAssociationFact,
} from '@neko/project/contracts';
import { parseWorldProject } from '@neko/world/contracts';
import { createProjectMediaLibraryBindingFingerprint } from '../../packages/assets/node/src/project-media-library-binding-repository';
import {
  parseProjectMediaLibraryBindingJson,
  serializeProjectMediaLibraryBinding,
} from '@neko/assets-domain/contracts';

const RETIRED_COMPOSITION_PATH = 'neko/project-composition.json';
const RETIRED_MEDIA_ROOT = 'neko/assets';
const MAX_DOCUMENT_BYTES = 32 * 1024 * 1024;
const MAX_DOCUMENTS = 10_000;

export const RETIRED_PROJECT_CONVERSION_CONFIRMATION_PREFIX = 'convert-retired-project:';

export interface RetiredProjectConversionInspection {
  readonly target: string;
  readonly projectId?: string;
  readonly fingerprint: string;
  readonly ready: boolean;
  readonly composition: 'recognized' | 'absent' | 'invalid';
  readonly associations: number;
  readonly mediaLibraries: readonly {
    readonly libraryName: string;
    readonly linkedTarget: string;
    readonly connectionId?: string;
  }[];
  readonly linkedMediaReferences: readonly {
    readonly ownerKind: 'canvas' | 'cut' | 'entity-representation';
    readonly ownerId: string;
    readonly referenceCount: number;
  }[];
  readonly diagnostics: readonly string[];
}

export interface RetiredProjectConversionResult {
  readonly target: string;
  readonly backup: string;
  readonly projectId: string;
  readonly associationCount: number;
  readonly mediaLibraryCount: number;
  readonly rewrittenReferenceCount: number;
}

interface RetiredComposition {
  readonly contentProjectId: string;
  readonly localTargets: readonly (
    | { readonly kind: 'character-project'; readonly characterProjectId: string }
    | { readonly kind: 'world-project'; readonly worldProjectId: string }
  )[];
  readonly dependencies: readonly unknown[];
  readonly entityCharacterAssociations: readonly {
    readonly entityId: string;
    readonly characterProjectId: string;
  }[];
}

interface RecognizedInspection {
  readonly publicInspection: RetiredProjectConversionInspection;
  readonly composition: RetiredComposition;
  readonly libraryConnections: ReadonlyMap<string, string>;
}

export async function inspectRetiredProjectLayout(input: {
  readonly target: string;
  readonly globalMediaLibraryRoot: string;
}): Promise<RetiredProjectConversionInspection> {
  return (await inspectRecognized(input)).publicInspection;
}

export async function convertRetiredProjectLayout(input: {
  readonly target: string;
  readonly globalMediaLibraryRoot: string;
  readonly expectedFingerprint: string;
  readonly confirmation: string;
  readonly now?: () => Date;
  readonly createId?: () => string;
}): Promise<RetiredProjectConversionResult> {
  const inspected = await inspectRecognized(input);
  const plan = inspected.publicInspection;
  if (!plan.ready || !plan.projectId) {
    throw new Error(`Retired Project conversion is not ready: ${plan.diagnostics.join(' ')}`);
  }
  if (plan.fingerprint !== input.expectedFingerprint) {
    throw new Error('Offline conversion inspection is stale.');
  }
  const expectedConfirmation = `${RETIRED_PROJECT_CONVERSION_CONFIRMATION_PREFIX}${plan.projectId}`;
  if (input.confirmation !== expectedConfirmation) {
    throw new Error(`Offline conversion requires --confirm ${expectedConfirmation}.`);
  }

  const createId = input.createId ?? randomUUID;
  const now = input.now ?? (() => new Date());
  const parent = path.dirname(plan.target);
  const base = path.basename(plan.target);
  const staging = path.join(parent, `.${base}.${createId()}.conversion-staging`);
  const backup = path.join(
    parent,
    `${base}.retired-backup-${now().toISOString().replaceAll(':', '-')}-${createId()}`,
  );
  let sourceMoved = false;
  let published = false;
  try {
    await fs.cp(plan.target, staging, {
      recursive: true,
      errorOnExist: true,
      force: false,
      verbatimSymlinks: true,
    });
    const rewrittenReferenceCount = await convertStagedProject({
      staging,
      composition: inspected.composition,
      libraryConnections: inspected.libraryConnections,
    });
    await validateCanonicalStaging(staging, inspected.composition, inspected.libraryConnections);
    const fresh = await inspectRecognized(input);
    if (fresh.publicInspection.fingerprint !== plan.fingerprint) {
      throw new Error('Offline conversion source changed before commit.');
    }
    await fs.rename(plan.target, backup);
    sourceMoved = true;
    try {
      await fs.rename(staging, plan.target);
      published = true;
    } catch (error) {
      await fs.rename(backup, plan.target);
      sourceMoved = false;
      throw error;
    }
    return {
      target: plan.target,
      backup,
      projectId: plan.projectId,
      associationCount: inspected.composition.entityCharacterAssociations.length,
      mediaLibraryCount: inspected.libraryConnections.size,
      rewrittenReferenceCount,
    };
  } finally {
    if (!published) await fs.rm(staging, { recursive: true, force: true });
    if (sourceMoved && !published) await fs.rename(backup, plan.target).catch(() => undefined);
  }
}

async function inspectRecognized(input: {
  readonly target: string;
  readonly globalMediaLibraryRoot: string;
}): Promise<RecognizedInspection> {
  const target = await requireExactDirectory(input.target, 'Workspace');
  const globalRoot = await requireExactDirectory(
    input.globalMediaLibraryRoot,
    'global Media Library',
  );
  const diagnostics: string[] = [];
  let composition: RetiredComposition | undefined;
  let compositionState: RetiredProjectConversionInspection['composition'] = 'absent';
  const sourceParts: unknown[] = [];
  try {
    const bytes = await readBoundedFile(target, RETIRED_COMPOSITION_PATH);
    sourceParts.push([RETIRED_COMPOSITION_PATH, digest(bytes)]);
    composition = parseRetiredComposition(JSON.parse(bytes.toString('utf8')) as unknown);
    compositionState = 'recognized';
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) {
      diagnostics.push('Retired project composition is absent.');
    } else {
      compositionState = 'invalid';
      diagnostics.push(`Retired project composition is invalid: ${message(error)}`);
    }
  }

  let projectId: string | undefined;
  try {
    const identityBytes = await readBoundedFile(target, 'neko/project.json');
    sourceParts.push(['neko/project.json', digest(identityBytes)]);
    const identity = parseWorkspaceIdentityJson(identityBytes.toString('utf8'));
    projectId = `content:${identity.workspaceId}`;
    if (composition && composition.contentProjectId !== projectId) {
      diagnostics.push('Retired composition Project identity does not match neko/project.json.');
    }
  } catch (error) {
    diagnostics.push(`Canonical Project identity is unavailable: ${message(error)}`);
  }

  if (composition?.dependencies.length) {
    diagnostics.push(
      'Retired composition contains explicit dependencies that cannot be assigned to an authoritative consumer.',
    );
  }
  if (composition) {
    await validateLocalTargets(target, composition, diagnostics, sourceParts);
  }

  const mediaLibraries: Array<{
    libraryName: string;
    linkedTarget: string;
    connectionId?: string;
  }> = [];
  const libraryConnections = new Map<string, string>();
  try {
    const links = await listRetiredMediaLinks(target);
    const globalConnections = await listExactGlobalConnections(globalRoot);
    for (const link of links) {
      const candidates = globalConnections.filter(
        (connection) =>
          connection.libraryName === link.libraryName && connection.target === link.target,
      );
      const connectionId = candidates.length === 1 ? candidates[0]?.connectionId : undefined;
      if (!connectionId) {
        diagnostics.push(
          `Retired Media Library '${link.libraryName}' does not match exactly one authorized global connection.`,
        );
      } else {
        libraryConnections.set(link.libraryName, connectionId);
      }
      mediaLibraries.push({
        libraryName: link.libraryName,
        linkedTarget: link.linkedTarget,
        ...(connectionId ? { connectionId } : {}),
      });
      sourceParts.push([`${RETIRED_MEDIA_ROOT}/${link.libraryName}`, link.target, connectionId]);
    }
  } catch (error) {
    diagnostics.push(`Retired Media Library links are invalid: ${message(error)}`);
  }

  const referenceOwners: Array<{
    ownerKind: 'canvas' | 'cut' | 'entity-representation';
    ownerId: string;
    referenceCount: number;
  }> = [];
  try {
    const documents = await listConversionDocuments(target);
    for (const document of documents) {
      const bytes = await readBoundedAbsoluteFile(document.absolutePath);
      sourceParts.push([document.relativePath, digest(bytes)]);
      const count = inspectRetiredReferences(
        document,
        bytes,
        new Set(mediaLibraries.map((item) => item.libraryName)),
      );
      if (count > 0) {
        referenceOwners.push({
          ownerKind: document.kind,
          ownerId: document.relativePath,
          referenceCount: count,
        });
      }
    }
  } catch (error) {
    diagnostics.push(`Retired linked-media references are invalid: ${message(error)}`);
  }

  const publicInspection: RetiredProjectConversionInspection = Object.freeze({
    target,
    ...(projectId ? { projectId } : {}),
    fingerprint: `sha256:${createHash('sha256').update(JSON.stringify(sourceParts)).digest('hex')}`,
    ready:
      diagnostics.length === 0 &&
      composition !== undefined &&
      projectId === composition.contentProjectId,
    composition: compositionState,
    associations: composition?.entityCharacterAssociations.length ?? 0,
    mediaLibraries,
    linkedMediaReferences: referenceOwners,
    diagnostics,
  });
  return {
    publicInspection,
    composition: composition ?? emptyRetiredComposition(projectId ?? 'unavailable'),
    libraryConnections,
  };
}

async function convertStagedProject(input: {
  readonly staging: string;
  readonly composition: RetiredComposition;
  readonly libraryConnections: ReadonlyMap<string, string>;
}): Promise<number> {
  for (const association of input.composition.entityCharacterAssociations) {
    const relativePath = projectEntityCharacterAssociationRelativePath(association.entityId);
    const target = path.join(input.staging, ...relativePath.split('/'));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(
      target,
      serializeProjectEntityCharacterAssociationFact({
        projectId: input.composition.contentProjectId,
        ...association,
      }),
      { flag: 'wx' },
    );
  }
  for (const [libraryName, connectionId] of input.libraryConnections) {
    const bindingFingerprint = createProjectMediaLibraryBindingFingerprint({
      projectId: input.composition.contentProjectId,
      libraryName,
      connectionId,
    });
    const target = path.join(input.staging, '.neko', 'media-libraries', `${libraryName}.json`);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(
      target,
      serializeProjectMediaLibraryBinding({
        projectId: input.composition.contentProjectId,
        libraryName,
        connectionId,
        bindingFingerprint,
      }),
      { flag: 'wx' },
    );
  }
  let rewritten = 0;
  for (const document of await listConversionDocuments(input.staging)) {
    const bytes = await readBoundedAbsoluteFile(document.absolutePath);
    if (document.kind === 'canvas') {
      const value = parseJsonObject(bytes);
      rewritten += rewriteNamedRetiredLocators(value);
      const loaded = loadNkc(JSON.stringify(value));
      if (!loaded.validation.valid)
        throw new Error(`Converted Canvas '${document.relativePath}' is invalid.`);
      await fs.writeFile(document.absolutePath, saveNkc(loaded.data));
    } else if (document.kind === 'entity-representation') {
      const value = parseJsonObject(bytes);
      rewritten += rewriteNamedRetiredLocators(value);
      await fs.writeFile(
        document.absolutePath,
        encodeProjectEntityDocument(assertProjectEntityDocument(value)),
      );
    } else {
      const parsed = parseOtio(bytes);
      if (!parsed.ok) throw new Error(`Retired Cut '${document.relativePath}' is invalid.`);
      const result = rewriteRetiredCut(document.relativePath, parsed.document);
      rewritten += result.count;
      await fs.writeFile(document.absolutePath, serializeOtio(result.document));
    }
  }
  await fs.rm(path.join(input.staging, RETIRED_COMPOSITION_PATH));
  await fs.rm(path.join(input.staging, RETIRED_MEDIA_ROOT), { recursive: true });
  return rewritten;
}

async function validateCanonicalStaging(
  staging: string,
  composition: RetiredComposition,
  libraryConnections: ReadonlyMap<string, string>,
): Promise<void> {
  await expectAbsent(path.join(staging, RETIRED_COMPOSITION_PATH));
  await expectAbsent(path.join(staging, RETIRED_MEDIA_ROOT));
  for (const association of composition.entityCharacterAssociations) {
    const source = await fs.readFile(
      path.join(
        staging,
        ...projectEntityCharacterAssociationRelativePath(association.entityId).split('/'),
      ),
      'utf8',
    );
    const converted = parseProjectEntityCharacterAssociationJson(source);
    if (
      converted.projectId !== composition.contentProjectId ||
      converted.entityId !== association.entityId ||
      converted.characterProjectId !== association.characterProjectId
    ) {
      throw new Error('Converted association does not belong to the exact Project.');
    }
  }
  for (const libraryName of libraryConnections.keys()) {
    const binding = parseProjectMediaLibraryBindingJson(
      await fs.readFile(
        path.join(staging, '.neko', 'media-libraries', `${libraryName}.json`),
        'utf8',
      ),
    );
    if (binding.projectId !== composition.contentProjectId || binding.libraryName !== libraryName) {
      throw new Error('Converted Media Library binding identity is invalid.');
    }
  }
  for (const document of await listConversionDocuments(staging)) {
    const bytes = await readBoundedAbsoluteFile(document.absolutePath);
    if (inspectRetiredReferences(document, bytes, new Set()) !== 0) {
      throw new Error(
        `Converted owner '${document.relativePath}' still contains a retired locator.`,
      );
    }
  }
}

function inspectRetiredReferences(
  document: ConversionDocument,
  bytes: Buffer,
  libraries: ReadonlySet<string>,
): number {
  if (document.kind === 'cut') {
    const parsed = parseOtio(bytes);
    if (!parsed.ok) throw new Error(`Cut '${document.relativePath}' is not recognized.`);
    let count = 0;
    for (const track of parsed.document.tracks.children) {
      for (const item of track.children) {
        if (item.OTIO_SCHEMA !== 'Clip.2') continue;
        const locator = retiredCutLocator(document.relativePath, item.media_reference.target_url);
        if (!locator) continue;
        requireRetiredLibrary(locator, libraries);
        count += 1;
      }
    }
    return count;
  }
  const value = parseJsonObject(bytes);
  let count = 0;
  visitNamedLocators(value, (candidate) => {
    const locator = parseRetiredContentLocator(candidate);
    if (!locator) return;
    requireRetiredLibrary(locator, libraries);
    count += 1;
  });
  rewriteNamedRetiredLocators(value);
  if (document.kind === 'canvas') {
    const loaded = loadNkc(JSON.stringify(value));
    if (!loaded.validation.valid) {
      throw new Error(`Canvas '${document.relativePath}' cannot be converted completely.`);
    }
  } else {
    assertProjectEntityDocument(value);
  }
  return count;
}

function rewriteNamedRetiredLocators(value: Record<string, unknown>): number {
  let count = 0;
  visitNamedLocators(value, (candidate, owner, key) => {
    const locator = parseRetiredContentLocator(candidate);
    if (!locator) return;
    owner[key] = locator;
    if (
      locator.kind === 'media-library' &&
      key === 'contentLocator' &&
      typeof owner['assetPath'] === 'string' &&
      retiredMediaLocator(owner['assetPath'])
    ) {
      owner['assetPath'] = `${locator.libraryName}/${locator.relativePath}`;
    }
    count += 1;
  });
  return count;
}

function rewriteRetiredCut(
  ownerId: string,
  source: OtioTimeline,
): { document: OtioTimeline; count: number } {
  let count = 0;
  return {
    document: {
      ...source,
      tracks: {
        ...source.tracks,
        children: source.tracks.children.map((track) => ({
          ...track,
          children: track.children.map((item) => {
            if (item.OTIO_SCHEMA !== 'Clip.2') return item;
            const locator = retiredCutLocator(ownerId, item.media_reference.target_url);
            if (!locator) return item;
            count += 1;
            return {
              ...item,
              media_reference: {
                ...item.media_reference,
                target_url: serializeContentReferenceTarget(locator),
              },
            };
          }),
        })),
      },
    },
    get count() {
      return count;
    },
  };
}

function visitNamedLocators(
  value: unknown,
  visitor: (value: unknown, owner: Record<string, unknown>, key: string) => void,
): void {
  if (Array.isArray(value)) {
    value.forEach((item) => visitNamedLocators(item, visitor));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    if (key === 'contentLocator' || key === 'target') visitor(nested, value, key);
    visitNamedLocators(value[key], visitor);
  }
}

function parseRetiredContentLocator(
  value: unknown,
): MediaLibraryContentLocator | DocumentEntryContentLocator | undefined {
  if (isRecord(value) && value['kind'] === 'document-entry') {
    const keys = Object.keys(value);
    if (
      keys.some(
        (key) =>
          key !== 'kind' && key !== 'source' && key !== 'entryPath' && key !== 'fingerprint',
      )
    ) {
      throw new Error('Retired document-entry locator contains unsupported fields.');
    }
    const source = parseRetiredWorkspaceLocator(value['source']);
    if (!source) return undefined;
    const candidate = {
      kind: 'document-entry',
      source,
      entryPath: value['entryPath'],
      ...(value['fingerprint'] === undefined ? {} : { fingerprint: value['fingerprint'] }),
    };
    const validated = validateContentLocator(candidate);
    if (!validated.ok || validated.locator.kind !== 'document-entry') {
      throw new Error('Retired document-entry locator cannot be represented canonically.');
    }
    return validated.locator;
  }
  return parseRetiredWorkspaceLocator(value);
}

function parseRetiredWorkspaceLocator(value: unknown): MediaLibraryContentLocator | undefined {
  if (!isRecord(value) || value['kind'] !== 'workspace-file' || typeof value['path'] !== 'string') {
    return undefined;
  }
  const locator = retiredMediaLocator(value['path']);
  if (!locator) return undefined;
  const keys = Object.keys(value);
  if (keys.some((key) => key !== 'kind' && key !== 'path' && key !== 'fingerprint')) {
    throw new Error('Retired linked-media locator contains unsupported fields.');
  }
  const candidate = {
    ...locator,
    ...(value['fingerprint'] === undefined ? {} : { fingerprint: value['fingerprint'] }),
  };
  const validated = validateContentLocator(candidate);
  if (!validated.ok || validated.locator.kind !== 'media-library') {
    throw new Error('Retired linked-media locator cannot be represented canonically.');
  }
  return validated.locator;
}

function retiredCutLocator(
  ownerId: string,
  targetUrl: string,
): MediaLibraryContentLocator | undefined {
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(ownerId), targetUrl));
  return retiredMediaLocator(resolved);
}

function retiredMediaLocator(value: string): MediaLibraryContentLocator | undefined {
  if (!value.startsWith(`${RETIRED_MEDIA_ROOT}/`)) return undefined;
  const segments = value.split('/');
  const libraryName = segments[2];
  const relativePath = segments.slice(3).join('/');
  if (!libraryName || !relativePath) throw new Error('Retired linked-media path is incomplete.');
  const validated = validateContentLocator({ kind: 'media-library', libraryName, relativePath });
  if (!validated.ok || validated.locator.kind !== 'media-library') {
    throw new Error('Retired linked-media path is invalid.');
  }
  return validated.locator;
}

function requireRetiredLibrary(
  locator: MediaLibraryContentLocator | DocumentEntryContentLocator,
  libraries: ReadonlySet<string>,
): void {
  const source = locator.kind === 'document-entry' ? locator.source : locator;
  if (source.kind !== 'media-library') {
    throw new Error('Retired document entry did not resolve to a Media Library source.');
  }
  if (libraries.size > 0 && !libraries.has(source.libraryName)) {
    throw new Error(`Retired locator references unknown Media Library '${source.libraryName}'.`);
  }
}

interface ConversionDocument {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly kind: 'canvas' | 'cut' | 'entity-representation';
}

async function listConversionDocuments(workspace: string): Promise<readonly ConversionDocument[]> {
  const documents: ConversionDocument[] = [];
  await walk(workspace);
  const entityPath = path.join(workspace, ...PROJECT_ENTITY_DOCUMENT_WORKSPACE_PATH.split('/'));
  if (await exists(entityPath)) {
    documents.push({
      absolutePath: entityPath,
      relativePath: PROJECT_ENTITY_DOCUMENT_WORKSPACE_PATH,
      kind: 'entity-representation',
    });
  }
  if (documents.length > MAX_DOCUMENTS)
    throw new Error('Retired conversion document count is unbounded.');
  return documents.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath, 'en-US'),
  );

  async function walk(directory: string): Promise<void> {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist')
        continue;
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path.relative(workspace, absolutePath).split(path.sep).join('/');
      if (relativePath === PROJECT_ENTITY_DOCUMENT_WORKSPACE_PATH) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (relativePath === RETIRED_MEDIA_ROOT) continue;
        await walk(absolutePath);
      } else if (entry.isFile() && entry.name.endsWith('.nkc')) {
        documents.push({ absolutePath, relativePath, kind: 'canvas' });
      } else if (entry.isFile() && entry.name.endsWith('.otio')) {
        documents.push({ absolutePath, relativePath, kind: 'cut' });
      }
    }
  }
}

async function listRetiredMediaLinks(
  workspace: string,
): Promise<readonly { libraryName: string; linkedTarget: string; target: string }[]> {
  const root = path.join(workspace, RETIRED_MEDIA_ROOT);
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) return [];
    throw error;
  }
  const links = [];
  for (const entry of entries) {
    if (!entry.isSymbolicLink())
      throw new Error(`Retired media entry '${entry.name}' is not a direct link.`);
    const link = path.join(root, entry.name);
    links.push({
      libraryName: entry.name,
      linkedTarget: await fs.readlink(link),
      target: await fs.realpath(link),
    });
  }
  return links;
}

async function listExactGlobalConnections(
  root: string,
): Promise<readonly { libraryName: string; connectionId: string; target: string }[]> {
  const results = [];
  for (const locationKind of ['local', 'nas', 'cloud'] as const) {
    const group = path.join(root, locationKind);
    if (!(await exists(group))) continue;
    for (const entry of await fs.readdir(group, { withFileTypes: true })) {
      if (!entry.isSymbolicLink()) continue;
      results.push({
        libraryName: entry.name,
        connectionId: `media-library:${locationKind}:${entry.name}`,
        target: await fs.realpath(path.join(group, entry.name)),
      });
    }
  }
  return results;
}

async function validateLocalTargets(
  workspace: string,
  composition: RetiredComposition,
  diagnostics: string[],
  sourceParts: unknown[],
): Promise<void> {
  for (const target of composition.localTargets) {
    try {
      const relativePath =
        target.kind === 'character-project'
          ? `neko/characters/${target.characterProjectId}/project.json`
          : `neko/worlds/${target.worldProjectId}/project.json`;
      const bytes = await readBoundedFile(workspace, relativePath);
      sourceParts.push([relativePath, digest(bytes)]);
      if (target.kind === 'character-project') {
        const project = parseCharacterProject(JSON.parse(bytes.toString('utf8')) as unknown);
        if (project.characterProjectId !== target.characterProjectId)
          throw new Error('identity mismatch');
      } else {
        const project = parseWorldProject(JSON.parse(bytes.toString('utf8')) as unknown);
        if (project.worldProjectId !== target.worldProjectId) throw new Error('identity mismatch');
      }
    } catch (error) {
      diagnostics.push(
        `Retired local target '${JSON.stringify(target)}' is unavailable: ${message(error)}`,
      );
    }
  }
}

function parseRetiredComposition(value: unknown): RetiredComposition {
  const record = exactRecordWithOptional(
    value,
    ['contentProjectId', 'localTargets', 'dependencies'],
    ['entityCharacterAssociations'],
  );
  const associationRows = record['entityCharacterAssociations'] ?? [];
  if (
    !Array.isArray(record['localTargets']) ||
    !Array.isArray(record['dependencies']) ||
    !Array.isArray(associationRows)
  ) {
    throw new Error('Retired composition arrays are invalid.');
  }
  const localTargets = record['localTargets'].map((item) => {
    const target = isRecord(item) ? item : {};
    if (target['kind'] === 'character-project') {
      return {
        kind: 'character-project' as const,
        characterProjectId: identity(target['characterProjectId']),
      };
    }
    if (target['kind'] === 'world-project') {
      return { kind: 'world-project' as const, worldProjectId: identity(target['worldProjectId']) };
    }
    throw new Error('Retired local target is unknown.');
  });
  const entityCharacterAssociations = associationRows.map((item) => {
    const association = exactRecord(item, ['entityId', 'characterProjectId']);
    return {
      entityId: identity(association['entityId']),
      characterProjectId: identity(association['characterProjectId']),
    };
  });
  if (
    new Set(entityCharacterAssociations.map((item) => item.entityId)).size !==
    entityCharacterAssociations.length
  ) {
    throw new Error('Retired Entity association identities are duplicated.');
  }
  if (
    new Set(entityCharacterAssociations.map((item) => item.characterProjectId)).size !==
    entityCharacterAssociations.length
  ) {
    throw new Error('Retired Character Project association identities are duplicated.');
  }
  const targetKeys = localTargets.map((target) =>
    target.kind === 'character-project'
      ? `character:${target.characterProjectId}`
      : `world:${target.worldProjectId}`,
  );
  if (new Set(targetKeys).size !== targetKeys.length) {
    throw new Error('Retired local target identities are duplicated.');
  }
  const characterTargets = new Set(
    localTargets.flatMap((target) =>
      target.kind === 'character-project' ? [target.characterProjectId] : [],
    ),
  );
  if (
    entityCharacterAssociations.some(
      (association) => !characterTargets.has(association.characterProjectId),
    )
  ) {
    throw new Error(
      'Retired Entity association references an unavailable Character Project target.',
    );
  }
  return {
    contentProjectId: identity(record['contentProjectId']),
    localTargets,
    dependencies: record['dependencies'],
    entityCharacterAssociations,
  };
}

function emptyRetiredComposition(projectId: string): RetiredComposition {
  return {
    contentProjectId: projectId,
    localTargets: [],
    dependencies: [],
    entityCharacterAssociations: [],
  };
}

async function requireExactDirectory(value: string, label: string): Promise<string> {
  if (!path.isAbsolute(value))
    throw new Error(`Offline conversion ${label} path must be absolute.`);
  const target = path.resolve(value);
  const stat = await fs.lstat(target);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error(`Offline conversion ${label} must be one exact directory.`);
  return target;
}

async function readBoundedFile(root: string, relativePath: string): Promise<Buffer> {
  return readBoundedAbsoluteFile(path.join(root, ...relativePath.split('/')));
}

async function readBoundedAbsoluteFile(target: string): Promise<Buffer> {
  const stat = await fs.lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_DOCUMENT_BYTES) {
    throw new Error('Offline conversion input must be one bounded regular file.');
  }
  return fs.readFile(target);
}

function parseJsonObject(bytes: Buffer): Record<string, unknown> {
  const value: unknown = JSON.parse(bytes.toString('utf8'));
  if (!isRecord(value)) throw new Error('Offline conversion JSON owner must be an object.');
  return value;
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('Retired record must be an object.');
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error('Retired record has unknown or missing fields.');
  }
  return value;
}

function exactRecordWithOptional(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('Retired record must be an object.');
  const actual = Object.keys(value);
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  if (
    requiredKeys.some((key) => !(key in value)) ||
    actual.some((key) => !allowed.has(key))
  ) {
    throw new Error('Retired record has unknown or missing fields.');
  }
  return value;
}

function identity(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.includes('/') ||
    value.includes('\\') ||
    value.includes('\0')
  ) {
    throw new Error('Retired identity is invalid.');
  }
  return value;
}

function digest(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.lstat(target);
    return true;
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) return false;
    throw error;
  }
}

async function expectAbsent(target: string): Promise<void> {
  if (await exists(target)) throw new Error(`Retired path '${target}' remains after conversion.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown, code: string): boolean {
  return isRecord(error) && error['code'] === code;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseArguments(args: readonly string[]): {
  target: string;
  globalMediaLibraryRoot: string;
  confirm?: string;
  expectedFingerprint?: string;
} {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (
      !key ||
      !value ||
      !['--target', '--global-media-root', '--confirm', '--fingerprint'].includes(key)
    ) {
      throw new Error(
        'Usage: retired-project-layout.ts --target <workspace> --global-media-root <root> [--fingerprint <sha256> --confirm <token>]',
      );
    }
    if (values.has(key)) throw new Error(`Offline conversion argument '${key}' is duplicated.`);
    values.set(key, value);
  }
  const target = values.get('--target');
  const globalMediaLibraryRoot = values.get('--global-media-root');
  if (!target || !globalMediaLibraryRoot)
    throw new Error('Offline conversion requires --target and --global-media-root.');
  return {
    target,
    globalMediaLibraryRoot,
    ...(values.get('--confirm') ? { confirm: values.get('--confirm') } : {}),
    ...(values.get('--fingerprint') ? { expectedFingerprint: values.get('--fingerprint') } : {}),
  };
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  if (!args.confirm && !args.expectedFingerprint) {
    process.stdout.write(`${JSON.stringify(await inspectRetiredProjectLayout(args), null, 2)}\n`);
    return;
  }
  if (!args.confirm || !args.expectedFingerprint) {
    throw new Error('Offline conversion execution requires both --fingerprint and --confirm.');
  }
  process.stdout.write(
    `${JSON.stringify(
      await convertRetiredProjectLayout({
        target: args.target,
        globalMediaLibraryRoot: args.globalMediaLibraryRoot,
        expectedFingerprint: args.expectedFingerprint,
        confirmation: args.confirm,
      }),
      null,
      2,
    )}\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${message(error)}\n`);
    process.exitCode = 1;
  });
}
