import { randomUUID } from 'node:crypto';
import { open, realpath } from 'node:fs/promises';
import * as path from 'node:path';
import {
  CanvasHostVisibleEffectError,
  projectDerivedCanvasMaterialToCanvas,
  projectResolvedCanvasMaterialToCanvas,
  readCanvasImageDimensions,
  replaceCanvasEntityRepresentationOnCanvas,
  type CanvasHostRuntimeIdentity,
  type ResolvedCanvasMaterialDescriptor,
} from '@neko/canvas-domain';
import type { NekoHostPorts } from '@neko/host/ports';
import {
  normalizeWorkspaceContentPath,
  isPackageResourceContentLocator,
  isWorkspaceFileContentLocator,
  validateContentLocator,
  probeImageMetadata,
  type ContentLocator,
  type PackageResourceContentLocator,
  type WorkspaceFileContentLocator,
} from '@neko/content';
import {
  type CanvasData,
  type CanvasMaterialAuthoringRequest,
  type CanvasMaterialMediaKind,
} from '@neko/canvas-domain';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import {
  resolveProjectWorkspaceContentLocator,
  resolveWorkspaceContentLocator,
} from '@neko/assets-node';
import { resolveGlobalMediaLibraryTarget } from '@neko/assets-node';

const DEFAULT_MAX_IMPORT_BYTES = 512 * 1024 * 1024;

export interface CanvasExternalSource {
  readonly absolutePath: string;
  readonly sourceName: string;
}

export interface CanvasMaterialAuthoringOptions {
  readonly host: NekoHostPorts;
  readonly globalMediaLibraryRoot: string;
  readonly maxImportBytes?: number;
  readonly authorizePackageResource?: (
    locator: PackageResourceContentLocator,
    workspace: AssetWorkspaceResolution,
  ) => Promise<void>;
}

interface RegisteredExternalSource extends CanvasExternalSource {
  readonly workspaceId: string;
}

interface ImportedCanvasFile {
  readonly locator: WorkspaceFileContentLocator;
  readonly intrinsicDimensions?: { readonly width: number; readonly height: number };
}

/**
 * Node authoring transaction. Canvas receives only a portable descriptor after all
 * authorization, linking or copying has completed.
 */
export class CanvasMaterialAuthoringService {
  private readonly externalSources = new Map<string, RegisteredExternalSource>();
  private readonly maxImportBytes: number;
  private disposed = false;

  constructor(private readonly options: CanvasMaterialAuthoringOptions) {
    this.maxImportBytes = options.maxImportBytes ?? DEFAULT_MAX_IMPORT_BYTES;
    if (!Number.isSafeInteger(this.maxImportBytes) || this.maxImportBytes < 1) {
      throw new Error('Canvas import byte limit must be a positive safe integer.');
    }
  }

  registerExternalSource(
    workspace: AssetWorkspaceResolution,
    source: CanvasExternalSource,
  ): string {
    this.requireActive();
    if (
      !path.isAbsolute(source.absolutePath) ||
      path.basename(source.sourceName) !== source.sourceName
    ) {
      throw visible('The selected source is invalid.');
    }
    const token = `canvas-source-${randomUUID()}`;
    this.externalSources.set(token, { ...source, workspaceId: workspace.workspaceId });
    return token;
  }

  async author(input: {
    readonly canvas: CanvasData;
    readonly identity: CanvasHostRuntimeIdentity;
    readonly workspace: AssetWorkspaceResolution;
    readonly request: CanvasMaterialAuthoringRequest;
  }): Promise<CanvasData> {
    this.requireActive();
    assertCanvasIdentity(input.identity, input.request);
    if (input.request.kind === 'derived-output-commit') {
      const material = await this.resolveDerivedOutput(input.workspace, input.request);
      return projectDerivedCanvasMaterialToCanvas({
        canvas: input.canvas,
        material,
        sourceNodeIds: input.request.sourceNodeIds,
      });
    }
    if (input.request.kind === 'entity-representation-replace') {
      await this.authorizeReferencedLocator(
        input.workspace,
        input.identity.projectId,
        input.request.locator,
      );
      return replaceCanvasEntityRepresentationOnCanvas({
        canvas: input.canvas,
        nodeId: input.request.nodeId,
        expectedEntity: input.request.expectedEntity,
        material: {
          locator: input.request.locator,
          title: input.request.title,
          mediaKind: input.request.mediaKind,
          entity: input.request.entity,
        },
      });
    }
    const material = await this.resolveRequest(
      input.workspace,
      input.identity.projectId,
      input.request,
    );
    if (!material) return input.canvas;
    return projectResolvedCanvasMaterialToCanvas({ canvas: input.canvas, material });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.externalSources.clear();
  }

  private async resolveRequest(
    workspace: AssetWorkspaceResolution,
    projectId: string,
    request: CanvasMaterialAuthoringRequest,
  ): Promise<ResolvedCanvasMaterialDescriptor | undefined> {
    switch (request.kind) {
      case 'direct-reference': {
        const authorizedPath = await this.authorizeReferencedLocator(
          workspace,
          projectId,
          request.locator,
        );
        const intrinsicDimensions = await this.resolveImageDimensions(
          request.mediaKind,
          authorizedPath,
        );
        return {
          locator: request.locator,
          title: request.title ?? titleForLocator(request.locator),
          mediaKind: request.mediaKind,
          ...(request.position ? { position: request.position } : {}),
          ...(request.entity ? { entity: request.entity } : {}),
          ...(intrinsicDimensions ? { intrinsicDimensions } : {}),
        };
      }
      case 'entity-representation-replace':
        throw new Error(
          'Entity representation replacement must use the explicit replacement transaction.',
        );
      case 'external-import': {
        const selected = this.consumeExternalSource(workspace, request.sourceToken);
        if (selected.sourceName !== request.sourceName) {
          throw visible('The selected source identity changed before import.');
        }
        const imported = await this.importOwnedFile({
          workspace,
          sourcePath: selected.absolutePath,
          sourceName: request.sourceName,
          mediaKind: request.mediaKind,
          conflictPolicy: request.conflictPolicy,
        });
        return {
          locator: imported.locator,
          title: request.sourceName,
          mediaKind: request.mediaKind,
          ...(request.position ? { position: request.position } : {}),
          ...(imported.intrinsicDimensions
            ? { intrinsicDimensions: imported.intrinsicDimensions }
            : {}),
        };
      }
      case 'global-library-link': {
        throw visible('Bind Media Libraries through the project Media owner before Canvas use.');
      }
      case 'global-library-copy': {
        const libraryRoot = await resolveGlobalMediaLibraryTarget({
          mediaLibraryRoot: this.options.globalMediaLibraryRoot,
          libraryId: request.globalLibraryId,
        });
        const entryPath = normalizeWorkspaceContentPath(request.entryId);
        if (!entryPath || entryPath !== request.entryId) {
          throw visible('The selected global Media Library entry is invalid.');
        }
        const resolvedLibraryRoot = await realpath(libraryRoot);
        const resolvedSource = await realpath(path.join(libraryRoot, ...entryPath.split('/')));
        if (!isInside(resolvedSource, resolvedLibraryRoot)) {
          throw visible('The selected global Media Library entry is outside its library.');
        }
        const imported = await this.importOwnedFile({
          workspace,
          sourcePath: resolvedSource,
          sourceName: path.posix.basename(entryPath),
          mediaKind: request.mediaKind,
          conflictPolicy: request.conflictPolicy,
        });
        return {
          locator: imported.locator,
          title: path.posix.basename(entryPath),
          mediaKind: request.mediaKind,
          ...(request.position ? { position: request.position } : {}),
          ...(imported.intrinsicDimensions
            ? { intrinsicDimensions: imported.intrinsicDimensions }
            : {}),
        };
      }
      case 'generated-output-commit': {
        const authorizedPath = await resolveWorkspaceContentLocator(workspace, request.locator);
        const intrinsicDimensions =
          dimensionsFromImageMetadata(request.generation.summary) ??
          (await this.resolveImageDimensions(request.mediaKind, authorizedPath));
        return {
          locator: request.locator,
          title: request.title,
          mediaKind: request.mediaKind,
          generation: request.generation,
          ...(request.position ? { position: request.position } : {}),
          ...(intrinsicDimensions ? { intrinsicDimensions } : {}),
        };
      }
      case 'derived-output-commit':
        throw new Error('Derived Canvas output must use the derivation transaction.');
    }
  }

  private async resolveDerivedOutput(
    workspace: AssetWorkspaceResolution,
    request: Extract<CanvasMaterialAuthoringRequest, { readonly kind: 'derived-output-commit' }>,
  ): Promise<ResolvedCanvasMaterialDescriptor> {
    const authorizedPath = await this.authorizeReferencedLocator(
      workspace,
      request.identity.projectId,
      request.locator,
    );
    const intrinsicDimensions =
      dimensionsFromImageMetadata(request.generation?.summary) ??
      (await this.resolveImageDimensions(request.mediaKind, authorizedPath));
    return {
      locator: request.locator,
      title: request.title,
      mediaKind: request.mediaKind,
      ...(request.generation ? { generation: request.generation } : {}),
      ...(request.position ? { position: request.position } : {}),
      ...(intrinsicDimensions ? { intrinsicDimensions } : {}),
    };
  }

  private async authorizeReferencedLocator(
    workspace: AssetWorkspaceResolution,
    projectId: string,
    locator: ContentLocator,
  ): Promise<string | undefined> {
    const result = validateContentLocator(locator);
    if (!result.ok) throw visible('Canvas requires a valid canonical ContentLocator.');
    const context = {
      projectId,
      workspaceRoot: workspace.workspacePath,
      globalMediaLibraryRoot: this.options.globalMediaLibraryRoot,
    };
    if (isWorkspaceFileContentLocator(result.locator)) {
      return resolveProjectWorkspaceContentLocator(context, result.locator);
    }
    if (isPackageResourceContentLocator(result.locator)) {
      const authorize = this.options.authorizePackageResource;
      if (!authorize) {
        throw visible('The package that owns this resource is unavailable.');
      }
      await authorize(result.locator, workspace);
      return undefined;
    }
    throw visible('Canvas requires a supported ContentLocator authority.');
  }

  private async resolveImageDimensions(
    mediaKind: CanvasMaterialMediaKind,
    authorizedPath: string | undefined,
  ): Promise<{ readonly width: number; readonly height: number } | undefined> {
    if (mediaKind !== 'image' || !authorizedPath) return undefined;
    return dimensionsFromImageMetadata(
      probeImageMetadata(await readBoundedFilePrefix(authorizedPath, 1024 * 1024)),
    );
  }

  private consumeExternalSource(
    workspace: AssetWorkspaceResolution,
    token: string,
  ): RegisteredExternalSource {
    const source = this.externalSources.get(token);
    this.externalSources.delete(token);
    if (!source || source.workspaceId !== workspace.workspaceId) {
      throw visible('The selected source authorization expired.');
    }
    return source;
  }

  private async importOwnedFile(input: {
    readonly workspace: AssetWorkspaceResolution;
    readonly sourcePath: string;
    readonly sourceName: string;
    readonly mediaKind: CanvasMaterialMediaKind;
    readonly conflictPolicy: 'reject' | 'rename' | 'replace';
  }): Promise<ImportedCanvasFile> {
    const sourceName = requireSafeSourceName(input.sourceName);
    const bytes = await readBoundedFile(input.sourcePath, this.maxImportBytes);
    const relativeDirectory = `neko/imports/${input.mediaKind}`;
    const absoluteDirectory = this.options.host.paths.join(
      input.workspace.workspacePath,
      ...relativeDirectory.split('/'),
    );
    await this.options.host.files.createDirectory(absoluteDirectory);
    const destinationName = await this.resolveDestinationName(
      absoluteDirectory,
      sourceName,
      input.conflictPolicy,
    );
    const destinationPath = this.options.host.paths.join(absoluteDirectory, destinationName);
    const temporaryPath = this.options.host.paths.join(
      absoluteDirectory,
      `.${destinationName}.${randomUUID()}.tmp`,
    );
    try {
      await this.options.host.files.writeBytes(temporaryPath, bytes);
      const temporaryStat = await this.options.host.files.stat(temporaryPath);
      if (temporaryStat.type !== 'file' || temporaryStat.sizeBytes !== bytes.byteLength) {
        throw visible('The imported source could not be written completely.');
      }
      await this.options.host.files.rename(temporaryPath, destinationPath);
    } catch (error: unknown) {
      await this.options.host.files
        .delete(temporaryPath, { idempotent: true })
        .catch(() => undefined);
      if (error instanceof CanvasHostVisibleEffectError) throw error;
      throw visible('The selected source could not be imported.');
    }
    const locator = {
      file: {
        authority: 'workspace' as const,
        path: `${relativeDirectory}/${destinationName}`,
      },
    };
    const intrinsicDimensions =
      input.mediaKind === 'image'
        ? dimensionsFromImageMetadata(probeImageMetadata(bytes))
        : undefined;
    return {
      locator,
      ...(intrinsicDimensions ? { intrinsicDimensions } : {}),
    };
  }

  private async resolveDestinationName(
    directory: string,
    sourceName: string,
    conflictPolicy: 'reject' | 'rename' | 'replace',
  ): Promise<string> {
    const exists = await pathExists(this.options.host.files, path.join(directory, sourceName));
    if (!exists || conflictPolicy === 'replace') return sourceName;
    if (conflictPolicy === 'reject') {
      throw visible(`A project import named '${sourceName}' already exists.`);
    }
    const extension = path.extname(sourceName);
    const stem = sourceName.slice(0, sourceName.length - extension.length);
    for (let suffix = 2; suffix <= 10_000; suffix += 1) {
      const candidate = `${stem} ${suffix}${extension}`;
      if (!(await pathExists(this.options.host.files, path.join(directory, candidate)))) {
        return candidate;
      }
    }
    throw visible('A unique project import name could not be allocated.');
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Canvas material authoring service is disposed.');
  }
}

async function readBoundedFile(filePath: string, maxBytes: number): Promise<Uint8Array> {
  const handle = await open(filePath, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw visible('The selected source is not a file.');
    if (stat.size > maxBytes) throw visible('The selected source exceeds the import size limit.');
    const bytes = new Uint8Array(stat.size);
    let offset = 0;
    while (offset < bytes.byteLength) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.byteLength - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset !== bytes.byteLength) {
      throw visible('The selected source changed while it was being imported.');
    }
    const finalStat = await handle.stat();
    if (finalStat.size !== stat.size) {
      throw visible('The selected source changed while it was being imported.');
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

async function readBoundedFilePrefix(filePath: string, maxBytes: number): Promise<Uint8Array> {
  const handle = await open(filePath, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw visible('The selected source is not a file.');
    const bytes = new Uint8Array(Math.min(stat.size, maxBytes));
    let offset = 0;
    while (offset < bytes.byteLength) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.byteLength - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    return offset === bytes.byteLength ? bytes : bytes.subarray(0, offset);
  } finally {
    await handle.close();
  }
}

function dimensionsFromImageMetadata(
  metadata: { readonly width?: number; readonly height?: number } | undefined | null,
): { readonly width: number; readonly height: number } | undefined {
  return readCanvasImageDimensions(metadata);
}

function assertCanvasIdentity(
  identity: CanvasHostRuntimeIdentity,
  request: CanvasMaterialAuthoringRequest,
): void {
  if (
    request.identity.projectId !== identity.projectId ||
    request.identity.canvasId !== identity.documentId ||
    request.identity.canvasSessionId !== identity.sessionId
  ) {
    throw visible('Canvas material authoring belongs to another Canvas session.');
  }
}

function titleForLocator(locator: ContentLocator): string {
  const portablePath =
    locator.selector?.kind === 'entry' ? locator.selector.path : locator.file.path;
  return path.posix.basename(portablePath);
}

function requireSafeSourceName(value: string): string {
  const normalized = value.normalize('NFC');
  if (
    normalized.length === 0 ||
    normalized !== value ||
    path.basename(normalized) !== normalized ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.includes('\0')
  ) {
    throw visible('The selected source filename is invalid.');
  }
  return normalized;
}

async function pathExists(files: NekoHostPorts['files'], filePath: string): Promise<boolean> {
  try {
    await files.stat(filePath);
    return true;
  } catch (error: unknown) {
    if (isRecord(error) && error['code'] === 'ENOENT') return false;
    throw error;
  }
}

function isInside(targetPath: string, rootPath: string): boolean {
  if (targetPath === rootPath) return true;
  const relativePath = path.relative(rootPath, targetPath);
  return (
    relativePath.length > 0 &&
    relativePath !== '..' &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  );
}

function visible(message: string): CanvasHostVisibleEffectError {
  return new CanvasHostVisibleEffectError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
