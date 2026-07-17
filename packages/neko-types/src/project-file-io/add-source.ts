import type { ContentIngestRequest, ContentIngestResult } from '../types/content-access';
import { contractWorkspaceMediaPath, type WorkspaceMediaPathContext } from '../path';

export interface ProjectSourceAssetFileOps {
  createDirectory(dirPath: string): Promise<void>;
  fileExists(filePath: string): Promise<boolean>;
  writeFile(filePath: string, bytes: Uint8Array): Promise<void>;
}

export interface ProjectSourceAssetOptions {
  readonly documentPath: string;
  readonly assetDirectory?: string;
  readonly workspaceContext: WorkspaceMediaPathContext;
  readonly fileOps: ProjectSourceAssetFileOps;
  readonly contractPath?: (
    absolutePath: string,
  ) => Promise<string | undefined> | string | undefined;
  readonly defaultFileName?: string;
  readonly maxNameAttempts?: number;
  readonly unmanagedSourceMessage?: string;
}

export async function ingestProjectSourceAddRequest(
  request: ContentIngestRequest,
  options: ProjectSourceAssetOptions,
): Promise<ContentIngestResult> {
  const baseDir = dirnamePath(options.documentPath);
  const sourcePath = request.sourcePath;
  if (!sourcePath && !request.bytes) {
    return {
      status: 'missing-source',
      request,
      error: request.fileName
        ? `Dropped file ${request.fileName} does not expose a durable source path.`
        : 'No source path was provided.',
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
        request,
        source: { kind: 'file', path: contracted },
        contractedPath: contracted,
      };
    }

    if (request.mode === 'link' || request.mode === 'register-existing-source') {
      return {
        status: 'non-portable',
        request,
        error:
          options.unmanagedSourceMessage ??
          'External source must be moved into the project, asset library, or a configured media root before saving.',
      };
    }
  }

  if (request.mode !== 'create-asset' && request.mode !== 'generated-output') {
    return {
      status: 'non-portable',
      request,
      error:
        'Only byte-backed Webview files or generated outputs can create a new project asset from this flow.',
    };
  }

  if (!request.bytes) {
    return {
      status: 'non-portable',
      request,
      error:
        'Create Asset requires file bytes. Move this file into the project, asset library, or a configured media root before adding it.',
    };
  }

  const createdAssetPath = await createProjectSourceAsset(request, options, baseDir);
  return {
    status: 'ready',
    request,
    source: { kind: 'file', path: createdAssetPath },
    outputPath: joinPath(baseDir, createdAssetPath),
    contractedPath: createdAssetPath,
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
  if (!isAbsolutePath(sourcePath)) return sourcePath;

  const context = 'context' in contextOrOptions ? contextOrOptions.context : contextOrOptions;
  const contracted = contractWorkspaceMediaPath(sourcePath, context);
  if (contracted.format === 'workspace-relative' || contracted.format === 'variable') {
    return contracted.path;
  }
  if ('context' in contextOrOptions && contextOrOptions.contractPath) {
    return await contractDurableSourcePathWithInjectedContractor(
      sourcePath,
      contextOrOptions.contractPath,
    );
  }
  return undefined;
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
  request: ContentIngestRequest,
  options: ProjectSourceAssetOptions,
  baseDir: string,
): Promise<string> {
  const fileName = sanitizeProjectSourceFileName(
    request.fileName ??
      (request.sourcePath
        ? basenamePath(request.sourcePath)
        : (options.defaultFileName ?? 'asset.bin')),
  );
  const assetDir = joinPath(baseDir, options.assetDirectory ?? 'assets');
  await options.fileOps.createDirectory(assetDir);

  const targetPath = await resolveAvailableAssetPath(
    assetDir,
    fileName,
    options.fileOps,
    options.maxNameAttempts,
  );
  await options.fileOps.writeFile(targetPath, request.bytes!);

  return relativePath(baseDir, targetPath);
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

async function resolveAvailableAssetPath(
  assetDir: string,
  fileName: string,
  fileOps: ProjectSourceAssetFileOps,
  maxAttempts = 1000,
): Promise<string> {
  const parsed = parsePath(fileName);
  const stem = parsed.name || 'asset';
  const ext = parsed.ext;

  for (let index = 0; index < maxAttempts; index += 1) {
    const candidateName = index === 0 ? `${stem}${ext}` : `${stem}-${index}${ext}`;
    const candidatePath = joinPath(assetDir, candidateName);
    if (!(await fileOps.fileExists(candidatePath))) {
      return candidatePath;
    }
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

function relativePath(fromPath: string, toPath: string): string {
  const from = splitPath(stripTrailingSlash(fromPath));
  const to = splitPath(stripTrailingSlash(toPath));
  let index = 0;
  while (index < from.parts.length && from.parts[index] === to.parts[index]) {
    index += 1;
  }
  const up = from.parts.slice(index).map(() => '..');
  const down = to.parts.slice(index);
  const result = [...up, ...down].join('/');
  return result || '.';
}

function splitPath(value: string): { readonly root: string; readonly parts: readonly string[] } {
  const normalized = normalizeSlashes(value);
  const driveMatch = normalized.match(/^([A-Za-z]:)(?:\/|$)(.*)$/);
  if (driveMatch) {
    return {
      root: driveMatch[1]!,
      parts: (driveMatch[2] ?? '').split('/').filter(Boolean),
    };
  }
  const root = normalized.startsWith('/') ? '/' : '';
  return {
    root,
    parts: normalized.replace(/^\/+/, '').split('/').filter(Boolean),
  };
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
