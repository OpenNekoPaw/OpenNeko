import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type * as vscode from 'vscode';
import {
  createResourceFingerprint,
  createResourceRef,
  type PathResolver,
  type ResourceRef,
} from '@neko/shared';
import type { LocalResourceAccessService } from '@neko/shared/vscode/extension';

const MAX_PANORAMIC_IMAGE_BYTES = 64 * 1024 * 1024;

export type PanoramicImageMediaType =
  'image/jpeg' | 'image/png' | 'image/webp' | 'image/vnd.radiance' | 'image/x-exr';

export type PanoramicSourceAuthorizationErrorCode =
  | 'source-missing'
  | 'source-unauthorized'
  | 'source-unsupported'
  | 'source-too-large'
  | 'mime-mismatch';

export class PanoramicSourceAuthorizationError extends Error {
  constructor(
    readonly code: PanoramicSourceAuthorizationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PanoramicSourceAuthorizationError';
  }
}

export interface PanoramicSourceFileSystem {
  stat(
    filePath: string,
    signal?: AbortSignal,
  ): Promise<{
    readonly size: number;
    readonly mtimeMs: number;
    readonly isFile: boolean;
  }>;
  readHeader(filePath: string, signal?: AbortSignal): Promise<Uint8Array>;
}

export interface AuthorizedPanoramicImageSource {
  readonly sourceRef: ResourceRef;
  readonly fingerprint: string;
  readonly mediaType: PanoramicImageMediaType;
  readonly sizeBytes: number;
  readonly webviewUri: string;
}

export interface AuthorizePanoramicImageSourceInput {
  readonly sourcePath: string;
  readonly webview: vscode.Webview;
  readonly authorization: Pick<LocalResourceAccessService, 'isAuthorizedPath' | 'toWebviewUri'>;
  readonly authorizedRoots: readonly string[];
  readonly workspaceRoot?: string;
  readonly pathResolver?: PathResolver;
  readonly fileSystem?: PanoramicSourceFileSystem;
  readonly signal?: AbortSignal;
}

export async function authorizePanoramicImageSource(
  input: AuthorizePanoramicImageSourceInput,
): Promise<AuthorizedPanoramicImageSource> {
  const sourcePath = path.resolve(input.sourcePath);
  input.signal?.throwIfAborted();
  if (
    !isInsideAnyRoot(sourcePath, input.authorizedRoots) ||
    !(await input.authorization.isAuthorizedPath(sourcePath))
  ) {
    throw new PanoramicSourceAuthorizationError(
      'source-unauthorized',
      'Panoramic source is outside authorized roots.',
    );
  }

  const mediaType = requirePanoramicImageSourceFormat(sourcePath);
  const fileSystem = input.fileSystem ?? NODE_PANORAMIC_FILE_SYSTEM;
  let stat: Awaited<ReturnType<PanoramicSourceFileSystem['stat']>>;
  try {
    stat = await fileSystem.stat(sourcePath, input.signal);
  } catch (error) {
    throw new PanoramicSourceAuthorizationError(
      'source-missing',
      error instanceof Error ? error.message : 'Panoramic source is missing.',
    );
  }
  if (!stat.isFile) {
    throw new PanoramicSourceAuthorizationError(
      'source-missing',
      'Panoramic source is not a file.',
    );
  }
  if (stat.size <= 0 || stat.size > MAX_PANORAMIC_IMAGE_BYTES) {
    throw new PanoramicSourceAuthorizationError(
      'source-too-large',
      'Panoramic source is empty or exceeds 64 MiB.',
    );
  }
  const header = await fileSystem.readHeader(sourcePath, input.signal);
  if (!headerMatchesMediaType(header, mediaType)) {
    throw new PanoramicSourceAuthorizationError(
      'mime-mismatch',
      'Panoramic source bytes do not match the declared image format.',
    );
  }

  const portablePath = createPortablePath(input, sourcePath);
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ portablePath, size: stat.size, mtimeMs: stat.mtimeMs, mediaType }))
    .digest('hex');
  const projection = await input.authorization.toWebviewUri(input.webview, sourcePath, {
    caller: '3d-reference-panorama',
  });
  if (!projection.ok || projection.kind !== 'local') {
    throw new PanoramicSourceAuthorizationError(
      'source-unauthorized',
      'Panoramic source could not be projected to the Webview.',
    );
  }
  const sourceRef = createResourceRef({
    scope:
      input.workspaceRoot && isInsideRoot(sourcePath, input.workspaceRoot) ? 'project' : 'global',
    provider: 'panoramic-preview-source',
    kind: 'media',
    source: {
      kind: 'file',
      ...(portablePath.startsWith('${WORKSPACE}/')
        ? { projectRelativePath: portablePath.slice('${WORKSPACE}/'.length) }
        : {}),
      uri: portablePath,
      identity: { sizeBytes: stat.size, mtimeMs: stat.mtimeMs, hash: fingerprint },
      metadata: { mediaType, projection: 'equirectangular' },
    },
    locator: { kind: 'file', uri: portablePath },
    fingerprint: createResourceFingerprint({ strategy: 'mtime-size', value: fingerprint }),
  });
  return {
    sourceRef,
    fingerprint,
    mediaType,
    sizeBytes: stat.size,
    webviewUri: projection.uri,
  };
}

export function requirePanoramicImageSourceFormat(filePath: string): PanoramicImageMediaType {
  switch (path.extname(filePath).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.hdr':
      return 'image/vnd.radiance';
    case '.exr':
      return 'image/x-exr';
    default:
      throw new PanoramicSourceAuthorizationError(
        'source-unsupported',
        'Unsupported panoramic image format.',
      );
  }
}

function createPortablePath(input: AuthorizePanoramicImageSourceInput, sourcePath: string): string {
  const contracted = input.pathResolver?.contract(sourcePath);
  if (contracted && contracted !== sourcePath) return contracted.replaceAll('\\', '/');
  if (input.workspaceRoot && isInsideRoot(sourcePath, input.workspaceRoot)) {
    return `\${WORKSPACE}/${path.relative(input.workspaceRoot, sourcePath).replaceAll('\\', '/')}`;
  }
  const root = input.authorizedRoots.find((candidate) => isInsideRoot(sourcePath, candidate));
  if (!root) {
    throw new PanoramicSourceAuthorizationError(
      'source-unauthorized',
      'Panoramic source is outside authorized roots.',
    );
  }
  const rootId = createHash('sha256').update(path.resolve(root)).digest('hex').slice(0, 16);
  return `panorama-preview://authorized/${rootId}/${encodeURI(path.relative(root, sourcePath).replaceAll('\\', '/'))}`;
}

function isInsideAnyRoot(filePath: string, roots: readonly string[]): boolean {
  return roots.some((root) => isInsideRoot(filePath, root));
}

function isInsideRoot(filePath: string, root: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(filePath));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function headerMatchesMediaType(header: Uint8Array, mediaType: PanoramicImageMediaType): boolean {
  switch (mediaType) {
    case 'image/jpeg':
      return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    case 'image/png':
      return header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47;
    case 'image/webp':
      return ascii(header, 0, 4) === 'RIFF' && ascii(header, 8, 12) === 'WEBP';
    case 'image/vnd.radiance':
      return ascii(header, 0, 10).startsWith('#?RADIANCE') || ascii(header, 0, 6) === '#?RGBE';
    case 'image/x-exr':
      return header[0] === 0x76 && header[1] === 0x2f && header[2] === 0x31 && header[3] === 0x01;
  }
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

const NODE_PANORAMIC_FILE_SYSTEM: PanoramicSourceFileSystem = {
  async stat(filePath) {
    const stat = await fs.stat(filePath);
    return { size: stat.size, mtimeMs: stat.mtimeMs, isFile: stat.isFile() };
  },
  async readHeader(filePath) {
    const handle = await fs.open(filePath, 'r');
    try {
      const buffer = new Uint8Array(16);
      const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, 0);
      return buffer.slice(0, bytesRead);
    } finally {
      await handle.close();
    }
  },
};
