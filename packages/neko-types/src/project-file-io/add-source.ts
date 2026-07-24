import type { AuthorizedWorkspaceWriter } from '../types/content-io';
import { contractWorkspaceMediaPath, type WorkspaceMediaPathContext } from '../path';
import { createProjectFileDiagnostic } from './diagnostics';
import type { ProjectSourceAddRequest, ProjectSourceStorageResult } from './ingest';

export interface ProjectSourceAssetFileOps {
  createDirectory(dirPath: string): Promise<void>;
}

export interface ProjectSourceAssetOptions {
  readonly documentPath: string;
  readonly assetDirectory?: string;
  readonly workspaceContext: WorkspaceMediaPathContext;
  readonly fileOps: ProjectSourceAssetFileOps;
  readonly writer: AuthorizedWorkspaceWriter;
  readonly contractPath?: (
    absolutePath: string,
  ) => Promise<string | undefined> | string | undefined;
  readonly defaultFileName?: string;
  readonly maxNameAttempts?: number;
  readonly unmanagedSourceMessage?: string;
}

export async function storeProjectSourceAddRequest(
  request: ProjectSourceAddRequest,
  options: ProjectSourceAssetOptions,
): Promise<ProjectSourceStorageResult> {
  const baseDir = dirnamePath(options.documentPath);
  const sourcePath = request.sourcePath;
  if (!sourcePath && !request.bytes) {
    return {
      status: 'unavailable',
      diagnostic: createProjectFileDiagnostic({
        code: 'missing-source',
        message: request.browserFile?.name
          ? `Dropped file ${request.browserFile.name} does not expose a durable source path.`
          : 'No source path was provided.',
        recoverability: 'create-asset',
      }),
    };
  }

  if (sourcePath) {
    const contracted = await contractDurableSourcePath(sourcePath, {
      context: options.workspaceContext,
      contractPath: options.contractPath,
    });
    if (contracted) {
      return {
        status: 'ready',
        storage: 'referenced',
        durablePath: contracted,
        ...(request.metadata ? { metadata: request.metadata } : {}),
      };
    }

    if (!request.bytes) {
      return {
        status: 'unavailable',
        diagnostic: createProjectFileDiagnostic({
          code: 'non-portable-path',
          message:
            options.unmanagedSourceMessage ??
            'External source must be moved into the project or a configured media root before saving.',
          recoverability: 'create-asset',
        }),
      };
    }
  }

  if (!request.bytes) {
    return {
      status: 'unavailable',
      diagnostic: createProjectFileDiagnostic({
        code: 'non-portable-path',
        message:
          'Creating a project source requires file bytes. Move this file into the project or a configured media root before adding it.',
        recoverability: 'create-asset',
      }),
    };
  }

  const createdAssetPath = await createProjectSourceAsset(request, options, baseDir);
  if (!createdAssetPath) {
    return {
      status: 'unavailable',
      diagnostic: createProjectFileDiagnostic({
        code: 'write-failed',
        message: 'Failed to allocate a writable project asset path.',
        recoverability: 'retry',
      }),
    };
  }
  return {
    status: 'ready',
    storage: 'copied',
    durablePath: createdAssetPath,
    ...(request.metadata ? { metadata: request.metadata } : {}),
  };
}

export async function contractDurableSourcePath(
  sourcePath: string,
  contextOrOptions:
    | WorkspaceMediaPathContext
    | {
        readonly context: WorkspaceMediaPathContext;
        readonly contractPath?: (
          absolutePath: string,
        ) => Promise<string | undefined> | string | undefined;
      },
): Promise<string | undefined> {
  const context = 'context' in contextOrOptions ? contextOrOptions.context : contextOrOptions;
  if (!isAbsolutePath(sourcePath)) return validateDurableStoredPath(sourcePath, context);

  const contracted = contractWorkspaceMediaPath(sourcePath, context);
  if (contracted.format === 'workspace-relative' || contracted.format === 'variable') {
    return validateDurableStoredPath(contracted.path, context);
  }
  if ('context' in contextOrOptions && contextOrOptions.contractPath) {
    const injected = await contractDurableSourcePathWithInjectedContractor(
      sourcePath,
      contextOrOptions.contractPath,
    );
    return injected ? validateDurableStoredPath(injected, context) : undefined;
  }
  return undefined;
}

function validateDurableStoredPath(
  sourcePath: string,
  context: WorkspaceMediaPathContext,
): string | undefined {
  const normalized = normalizeSlashes(sourcePath.trim());
  if (!normalized || /[\r\n\u0000]/u.test(normalized)) return undefined;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(normalized)) return undefined;
  const variableMatch = /^\/?\$\{([^}]+)\}(?:\/|$)/u.exec(normalized);
  if (variableMatch) {
    const variable = variableMatch[1];
    return variable && context.pathVariables?.has(variable)
      ? normalized.replace(/^\//u, '')
      : undefined;
  }
  if (isAbsolutePath(normalized)) return undefined;
  const segments = normalized.toLowerCase().split('/');
  if (
    segments.some((segment) => !segment || segment === '.' || segment === '..') ||
    segments.some(
      (segment) => segment === 'cache' || segment === 'proxy' || segment === 'thumbnail',
    ) ||
    segments.some((segment, index) => segment === '.neko' && segments[index + 1] === '.cache')
  ) {
    return undefined;
  }
  return normalized;
}

export function sanitizeProjectSourceFileName(fileName: string): string {
  const baseName = basenamePath(fileName)
    .replace(/[<>:"|?*\u0000-\u001f]/g, '_')
    .trim();
  if (!baseName || baseName === '.' || baseName === '..') {
    return 'asset.bin';
  }
  return baseName;
}

async function createProjectSourceAsset(
  request: ProjectSourceAddRequest,
  options: ProjectSourceAssetOptions,
  baseDir: string,
): Promise<string | undefined> {
  const fileName = sanitizeProjectSourceFileName(
    request.browserFile?.name ??
      (request.sourcePath
        ? basenamePath(request.sourcePath)
        : (options.defaultFileName ?? 'asset.bin')),
  );
  const assetDirectory = options.assetDirectory ?? request.assetDirectory;
  const assetDir = joinPath(baseDir, assetDirectory);
  await options.fileOps.createDirectory(assetDir);

  const targetPath = await writeAvailableAsset(
    assetDirectory,
    fileName,
    request.bytes!,
    options.writer,
    options.maxNameAttempts,
  );
  return targetPath;
}

async function contractDurableSourcePathWithInjectedContractor(
  sourcePath: string,
  contractPath: (absolutePath: string) => Promise<string | undefined> | string | undefined,
): Promise<string | undefined> {
  const contracted = await contractPath(sourcePath);
  if (!contracted) return undefined;
  if (isAbsolutePath(contracted)) return undefined;
  return contracted;
}

async function writeAvailableAsset(
  assetDirectory: string,
  fileName: string,
  bytes: Uint8Array,
  writer: AuthorizedWorkspaceWriter,
  maxAttempts = 1000,
): Promise<string | undefined> {
  const parsed = parsePath(fileName);
  const stem = parsed.name || 'asset';
  const ext = parsed.ext;

  for (let index = 0; index < maxAttempts; index += 1) {
    const candidateName = index === 0 ? `${stem}${ext}` : `${stem}-${index}${ext}`;
    const candidatePath = joinPath(assetDirectory, candidateName);
    const result = await writer.write({ kind: 'workspace-file', path: candidatePath }, bytes, {
      conflict: 'fail-if-exists',
    });
    if (result.status === 'written') return candidatePath;
    if (result.diagnostic.code !== 'content-conflict') return undefined;
  }

  throw new Error(`Unable to find an available asset file name for ${fileName}.`);
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

function stripTrailingSlash(value: string): string {
  const normalized = normalizeSlashes(value);
  if (normalized === '/') return normalized;
  return normalized.replace(/\/+$/, '');
}

function dirnamePath(value: string): string {
  const normalized = stripTrailingSlash(value);
  if (!normalized || normalized === '/') return normalized || '.';
  const index = normalized.lastIndexOf('/');
  if (index < 0) return '.';
  if (index === 0) return '/';
  return normalized.slice(0, index);
}

function basenamePath(value: string): string {
  const normalized = stripTrailingSlash(value);
  const index = normalized.lastIndexOf('/');
  return index < 0 ? normalized : normalized.slice(index + 1);
}

function joinPath(basePath: string, ...parts: readonly string[]): string {
  const segments = [basePath, ...parts]
    .filter((part) => part.length > 0)
    .map((part, index) => {
      const normalized = normalizeSlashes(part);
      if (index === 0) return normalized.replace(/\/+$/, '');
      return normalized.replace(/^\/+|\/+$/g, '');
    })
    .filter((part, index) => index === 0 || part.length > 0);
  if (segments.length === 0) return '.';
  const joined = segments.join('/');
  return joined === '' ? '/' : joined.replace(/([^:])\/{2,}/g, '$1/');
}

function isAbsolutePath(value: string): boolean {
  const normalized = normalizeSlashes(value);
  return (
    normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized) || normalized.startsWith('//')
  );
}

function parsePath(fileName: string): { readonly name: string; readonly ext: string } {
  const baseName = basenamePath(fileName);
  const dotIndex = baseName.lastIndexOf('.');
  if (dotIndex <= 0) return { name: baseName, ext: '' };
  return {
    name: baseName.slice(0, dotIndex),
    ext: baseName.slice(dotIndex),
  };
}
