/**
 * Document preview access owned by the Preview Extension Host.
 *
 * Local paths stay in Node. Webviews receive only opaque loopback URLs:
 * raw Range-capable URLs for PDF/DOCX/CBZ and a directory-style entry URL for EPUB.
 */

import * as path from 'node:path';
import * as vscode from 'vscode';
import { createNodeDocumentLowLevelAccess } from '@neko/content/document/node';
import { getLogger } from '../../utils/logger';
import {
  hasPathVariable,
  type PreviewPathResolutionOptions,
  resolvePreviewPath,
} from './workspacePathResolver';
import {
  NodeDocumentPreviewServer,
  type DocumentPreviewFormat,
  type DocumentPreviewRegistration,
} from './NodeDocumentPreviewServer';

const logger = getLogger('PreviewFileServer');

/** Error thrown when a media-library variable cannot be resolved on this machine. */
export class UnresolvedPathVariableError extends Error {
  constructor(
    public readonly variable: string,
    public readonly originalPath: string,
  ) {
    super(
      `Media library variable "\${${variable}}" is not configured.\n\n` +
        `The file "${originalPath}" references a media library that is not set up on this machine.\n\n` +
        `To fix:\n` +
        `1. Open neko-assets settings (neko/settings.json)\n` +
        `2. Add a media library with variable name "${variable}"\n` +
        `3. Or check that the neko-assets extension is activated`,
    );
    this.name = 'UnresolvedPathVariableError';
  }
}

class PreviewFileServer implements vscode.Disposable {
  private readonly documentAccess = createNodeDocumentLowLevelAccess();
  private readonly httpServer = new NodeDocumentPreviewServer({
    documentAccess: this.documentAccess,
  });

  /** Register a PDF, DOCX, or CBZ and return its Node-hosted raw file URL. */
  async registerFile(
    filePath: string,
    options?: PreviewPathResolutionOptions,
  ): Promise<DocumentPreviewRegistration> {
    const resolved = await this.resolvePath(filePath, options);
    const format = rawDocumentFormat(resolved);
    const registration = await this.httpServer.register(resolved, format);
    logger.info(`Registered Node document token=${registration.token} → ${filePath}`);
    return registration;
  }

  /** Register an EPUB and return a trailing-slash Node archive-entry URL. */
  async registerEpub(
    filePath: string,
    options?: PreviewPathResolutionOptions,
  ): Promise<DocumentPreviewRegistration> {
    const resolved = await this.resolvePath(filePath, options);
    const registration = await this.httpServer.register(resolved, 'epub');
    logger.info(`Registered Node EPUB token=${registration.token} → ${filePath}`);
    return registration;
  }

  /** Read a bounded byte range in the Extension Host. */
  async readRange(
    filePath: string,
    start: number,
    end: number,
    options?: PreviewPathResolutionOptions,
  ): Promise<ArrayBuffer> {
    const resolved = await this.resolvePath(filePath, options);
    const bytes = await this.documentAccess.readRange(resolved, start, end);
    return toArrayBuffer(bytes);
  }

  /** Run an Extension Host task with bounded access to entries in one EPUB. */
  async withEpubEntryReader<T>(
    filePath: string,
    task: (readEntry: (entryPath: string) => Promise<ArrayBuffer>) => Promise<T>,
    options?: PreviewPathResolutionOptions,
  ): Promise<T> {
    const resolved = await this.resolvePath(filePath, options);
    return task(async (entryPath) =>
      toArrayBuffer(await this.documentAccess.readEntry(resolved, entryPath)),
    );
  }

  /** Read one EPUB/ZIP entry in the Extension Host. */
  async readEpubEntry(
    filePath: string,
    entryPath: string,
    options?: PreviewPathResolutionOptions,
  ): Promise<ArrayBuffer> {
    return this.withEpubEntryReader(filePath, (readEntry) => readEntry(entryPath), options);
  }

  async unregisterFile(token: string): Promise<void> {
    await this.httpServer.unregister(token);
    logger.info(`Unregistered Node document token=${token}`);
  }

  async dispose(): Promise<void> {
    await this.httpServer.dispose();
  }

  private async resolvePath(
    filePath: string,
    options?: PreviewPathResolutionOptions,
  ): Promise<string> {
    const resolved = await resolvePreviewPath(filePath, options);
    if (!hasPathVariable(resolved)) {
      if (resolved !== filePath) {
        logger.info(`Resolved path: ${filePath} → ${resolved}`);
      }
      return resolved;
    }

    const match = filePath.match(/\/?\$\{([^}]+)\}/);
    const variableName = match?.[1];
    if (variableName) {
      throw new UnresolvedPathVariableError(variableName, filePath);
    }
    return filePath;
  }
}

/** Singleton shared across all document providers in this Extension Host. */
export const previewFileServer = new PreviewFileServer();

function rawDocumentFormat(filePath: string): Exclude<DocumentPreviewFormat, 'epub'> {
  switch (path.extname(filePath).toLowerCase()) {
    case '.pdf':
      return 'pdf';
    case '.docx':
      return 'docx';
    case '.cbz':
      return 'cbz';
    default:
      throw new Error(`Unsupported Node document preview format: ${path.extname(filePath)}`);
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
