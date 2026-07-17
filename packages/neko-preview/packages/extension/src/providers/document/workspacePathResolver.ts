import * as fsSync from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as vscode from 'vscode';
import { resolveWorkspaceMediaPath, type WorkspaceMediaPathContext } from '@neko/shared';
import {
  createHostContentMediaPathContext,
  resolveHostContentMediaPath,
} from '@neko/shared/vscode/extension';
import { getLogger } from '../../utils/logger';

export interface PreviewPathResolutionOptions {
  readonly sourceDocumentUri?: vscode.Uri;
  readonly allowedRoots?: readonly string[];
}

const logger = getLogger('WorkspacePathResolver');
const PATH_VARIABLE_RE = /\/?\$\{([^}]+)\}/;
const URI_SCHEME_RE = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const WINDOWS_DRIVE_RE = /^[A-Za-z]:[\\/]/;
const WINDOWS_UNC_RE = /^\\\\/;

export function hasPathVariable(filePath: string): boolean {
  return PATH_VARIABLE_RE.test(filePath);
}

function toLocalFilesystemPath(filePath: string): string | null {
  const trimmed = filePath.trim();
  if (!trimmed) return null;

  if (WINDOWS_DRIVE_RE.test(trimmed) || WINDOWS_UNC_RE.test(trimmed)) {
    return trimmed;
  }

  if (URI_SCHEME_RE.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (url.protocol !== 'file:') {
        logger.warn(`Skipping non-local media library root: ${trimmed}`);
        return null;
      }
      return fileURLToPath(url);
    } catch (error) {
      logger.warn(`Skipping invalid media library root URI: ${trimmed}`, error);
      return null;
    }
  }

  return trimmed;
}

async function createPreviewWorkspaceMediaPathContext(
  options?: PreviewPathResolutionOptions,
): Promise<WorkspaceMediaPathContext> {
  return createHostContentMediaPathContext({
    documentUri: options?.sourceDocumentUri,
    workspaceFolders: vscode.workspace.workspaceFolders ?? [],
    allowedRoots: options?.allowedRoots,
    getExtension: vscode.extensions.getExtension,
    logger,
  });
}

async function resolveWorkspacePath(
  filePath: string,
  options?: PreviewPathResolutionOptions,
): Promise<string> {
  if (options?.sourceDocumentUri) {
    const context = await createPreviewWorkspaceMediaPathContext(options);
    const resolved = resolveWorkspaceMediaPath({
      source: filePath,
      context,
      fileExists: (candidate) => fileExists(candidate),
      isPathAuthorized: (candidate) => isPathAuthorized(candidate, context.allowedRoots),
    });
    if (resolved.status === 'resolved-local') return resolved.path;
    if (resolved.status === 'remote') return resolved.url;
    return filePath;
  }

  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  if (workspaceFolders.length === 0) {
    return filePath;
  }

  const localPath = toLocalFilesystemPath(filePath);
  if (!localPath) return filePath;
  if (path.isAbsolute(localPath)) {
    return path.normalize(localPath);
  }
  return path.resolve(workspaceFolders[0]!.uri.fsPath, localPath);
}

export async function resolvePreviewPath(
  filePath: string,
  options?: PreviewPathResolutionOptions,
): Promise<string> {
  if (options?.sourceDocumentUri) {
    const resolved = await resolveWorkspacePath(filePath, options);
    if (resolved !== filePath || !hasPathVariable(filePath)) {
      return resolved;
    }
  }

  if (hasPathVariable(filePath)) {
    try {
      const resolved = await resolveHostContentMediaPath(filePath, {
        documentUri: options?.sourceDocumentUri,
        workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
        workspaceFolders: vscode.workspace.workspaceFolders ?? [],
        allowedRoots: options?.allowedRoots,
        getExtension: vscode.extensions.getExtension,
        fileExists,
        logger,
      });
      if (resolved && !hasPathVariable(resolved)) {
        return resolved;
      }
    } catch (error) {
      logger.warn(
        `Unable to resolve preview path through shared content policy: ${filePath}`,
        error,
      );
    }
  }

  return resolveWorkspacePath(filePath, options);
}

function fileExists(filePath: string): boolean {
  try {
    return fsSync.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function isPathAuthorized(filePath: string, allowedRoots: readonly string[] | undefined): boolean {
  if (!allowedRoots || allowedRoots.length === 0) return true;
  return allowedRoots.some((root) => isPathInsideOrEqual(filePath, root));
}

function isPathInsideOrEqual(candidatePath: string, rootPath: string): boolean {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}
