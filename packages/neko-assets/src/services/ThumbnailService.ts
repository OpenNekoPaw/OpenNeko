/**
 * Storage-neutral thumbnail generation and semantic representation consumption.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  detectMediaType,
  normalizeWorkspaceContentPath,
  type ContentRepresentationGenerator,
  type ContentRepresentationService,
  type WorkspaceFileContentLocator,
} from '@neko/shared';

export interface ThumbnailOptions {
  readonly maxWidth?: number;
  readonly maxHeight?: number;
}

export interface ThumbnailResult {
  readonly bytes: Uint8Array;
  readonly uri: vscode.Uri;
  readonly width: number;
  readonly height: number;
  readonly mimeType: 'image/jpeg';
}

export class AssetsThumbnailGenerator implements ContentRepresentationGenerator {
  readonly id = 'neko-assets-thumbnail';
  readonly revision = '2';
  readonly kinds = ['thumbnail'] as const;

  constructor(private readonly workspaceRoot: string) {}

  async generate(
    input: Parameters<ContentRepresentationGenerator['generate']>[0],
  ): Promise<Awaited<ReturnType<ContentRepresentationGenerator['generate']>>> {
    if (input.spec.kind !== 'thumbnail' || input.source.kind !== 'workspace-file') {
      throw new Error('Assets thumbnail generator requires a workspace-file thumbnail request.');
    }
    if (input.spec.format && input.spec.format !== 'jpeg') {
      throw new Error(`Assets thumbnail generator does not support ${input.spec.format}.`);
    }
    if (input.signal?.aborted) {
      throw input.signal.reason ?? new Error('Thumbnail generation was cancelled.');
    }

    const sourcePath = resolveWorkspaceFile(this.workspaceRoot, input.source.path);
    const width = input.spec.maxWidth ?? 256;
    const height = input.spec.maxHeight ?? 256;
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-thumbnail-'));
    const outputPath = path.join(tempRoot, 'thumbnail.jpg');
    try {
      const result = await vscode.commands.executeCommand<{
        readonly success: boolean;
        readonly path?: string;
        readonly width?: number;
        readonly height?: number;
      }>('neko.engine.extractThumbnail', sourcePath, outputPath, width, height, 1);
      if (!result?.success || result.path !== outputPath) {
        throw new Error('Engine thumbnail generation failed.');
      }
      const bytes = await fs.readFile(outputPath);
      return {
        bytes,
        metadata: {
          mimeType: 'image/jpeg',
          byteLength: bytes.byteLength,
          width: result.width ?? width,
          height: result.height ?? height,
        },
      };
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  }
}

export class ThumbnailService implements vscode.Disposable {
  private readonly _onDidGenerateThumbnail = new vscode.EventEmitter<string>();
  readonly onDidGenerateThumbnail: vscode.Event<string> = this._onDidGenerateThumbnail.event;
  private readonly preheatQueue: string[] = [];
  private preheatRunning = 0;
  private readonly preheatConcurrency = 2;

  constructor(
    private readonly workspaceRoot: string,
    private readonly representations: ContentRepresentationService,
  ) {}

  async generate(
    filePath: string,
    options: ThumbnailOptions = {},
  ): Promise<ThumbnailResult | null> {
    const mediaType = detectMediaType(filePath);
    if (mediaType !== 'video' && mediaType !== 'image') return null;

    const source = await createWorkspaceFileLocator(this.workspaceRoot, filePath);
    const width = options.maxWidth ?? 256;
    const height = options.maxHeight ?? 256;
    const representation = await this.representations.getRepresentation({
      source,
      spec: { kind: 'thumbnail', maxWidth: width, maxHeight: height, format: 'jpeg' },
    });
    if (representation.status !== 'ready') return null;
    const loaded = await this.representations.readRepresentation(representation.locator, {
      maxBytes: 16 * 1024 * 1024,
    });
    if (loaded.status !== 'ready') return null;

    const bytes = loaded.bytes;
    return {
      bytes,
      uri: vscode.Uri.parse(`data:image/jpeg;base64,${Buffer.from(bytes).toString('base64')}`),
      width: loaded.metadata.width ?? width,
      height: loaded.metadata.height ?? height,
      mimeType: 'image/jpeg',
    };
  }

  preheat(filePaths: string[]): void {
    for (const filePath of filePaths) {
      if (!this.preheatQueue.includes(filePath)) this.preheatQueue.push(filePath);
    }
    this.drainPreheatQueue();
  }

  private drainPreheatQueue(): void {
    while (this.preheatRunning < this.preheatConcurrency && this.preheatQueue.length > 0) {
      const filePath = this.preheatQueue.shift();
      if (!filePath) return;
      this.preheatRunning += 1;
      void this.generate(filePath)
        .then((result) => {
          if (result) this._onDidGenerateThumbnail.fire(filePath);
        })
        .catch(() => undefined)
        .finally(() => {
          this.preheatRunning -= 1;
          this.drainPreheatQueue();
        });
    }
  }

  dispose(): void {
    this._onDidGenerateThumbnail.dispose();
    this.preheatQueue.length = 0;
  }
}

async function createWorkspaceFileLocator(
  workspaceRoot: string,
  filePath: string,
): Promise<WorkspaceFileContentLocator> {
  const relativePath = path.relative(workspaceRoot, filePath).replace(/\\/gu, '/');
  const normalizedPath = normalizeWorkspaceContentPath(relativePath);
  if (!normalizedPath || normalizedPath !== relativePath) {
    throw new Error('Thumbnail source must be a canonical workspace file.');
  }
  const stat = await fs.stat(filePath);
  return {
    kind: 'workspace-file',
    path: normalizedPath,
    fingerprint: { strategy: 'mtime-size', value: `${stat.mtimeMs}:${stat.size}` },
  };
}

function resolveWorkspaceFile(workspaceRoot: string, relativePath: string): string {
  const resolved = path.resolve(workspaceRoot, relativePath);
  const relative = path.relative(workspaceRoot, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Thumbnail source escapes the workspace.');
  }
  return resolved;
}
