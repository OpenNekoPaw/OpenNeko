/**
 * Media Workspace Index — Cross-file index for .nkv documents.
 *
 * Scans all *.nkv files in workspace, caches parsed projects, and maintains
 * derived indices for cross-file navigation (media references, element IDs, symbols).
 *
 * Follows the WorkspaceIndexService pattern from neko-story.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import type { IWorkspaceIO } from '../../contracts/IWorkspaceIO';
import { resolveMediaSrcPath } from './resolveMediaSrcPath';
import { parseJviDocument } from './JviParser';
import type {
  JviParsedProject,
  JviParsedElement,
  JviRange,
  MediaReference,
  MediaSymbolLocation,
} from '../types';
import type { IMediaWorkspaceIndex } from './types';

const JVI_GLOB = '**/*.nkv';

export class MediaWorkspaceIndex implements IMediaWorkspaceIndex, vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly fileCache = new Map<string, JviParsedProject>();

  // Derived indices
  private readonly mediaRefIndex = new Map<string, MediaReference[]>(); // absoluteMediaPath → refs
  private readonly elementIdIndex = new Map<
    string,
    { jviUri: string; element: JviParsedElement; range: JviRange }
  >(); // elementId → location

  private initPromise: Promise<void> | undefined;

  constructor(private readonly workspaceIO: IWorkspaceIO) {
    this.setupWatchers();
  }

  // ─── IMediaWorkspaceIndex ──────────────────────────────────────────────

  async ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.buildFullIndex();
    }
    return this.initPromise;
  }

  getDocument(uriStr: string): JviParsedProject | undefined {
    return this.fileCache.get(uriStr);
  }

  findMediaReferences(absoluteMediaPath: string): readonly MediaReference[] {
    return this.mediaRefIndex.get(absoluteMediaPath) ?? [];
  }

  findElementById(
    elementId: string,
  ): { jviUri: string; element: JviParsedElement; range: JviRange } | undefined {
    return this.elementIdIndex.get(elementId);
  }

  searchSymbols(query: string): readonly MediaSymbolLocation[] {
    if (!query) return [];
    const lowerQuery = query.toLowerCase();
    const results: MediaSymbolLocation[] = [];

    for (const [uriStr, project] of this.fileCache) {
      // Match project name
      if (project.name.toLowerCase().includes(lowerQuery)) {
        results.push({
          uri: uriStr,
          name: project.name,
          kind: 'project',
          range: project.range,
          detail: `${project.resolution.width}x${project.resolution.height} @ ${project.fps}fps`,
        });
      }

      // Match tracks and elements
      for (const track of project.tracks) {
        if (track.name.toLowerCase().includes(lowerQuery)) {
          results.push({
            uri: uriStr,
            name: track.name,
            kind: 'track',
            range: track.range,
            detail: `${track.trackType} (${track.elements.length} elements)`,
          });
        }

        for (const el of track.elements) {
          const elName = el.name || el.id;
          if (elName.toLowerCase().includes(lowerQuery)) {
            results.push({
              uri: uriStr,
              name: elName,
              kind: 'element',
              range: el.range,
              detail: el.src ?? el.type,
            });
          }
        }
      }
    }

    return results;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
    this.fileCache.clear();
    this.mediaRefIndex.clear();
    this.elementIdIndex.clear();
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  private setupWatchers(): void {
    const watcher = this.workspaceIO.createFileSystemWatcher(JVI_GLOB);

    watcher.onDidCreate((uri) => {
      void this.onFileChanged(uri);
    });
    watcher.onDidChange((uri) => {
      void this.onFileChanged(uri);
    });
    watcher.onDidDelete((uri) => {
      this.onFileDeleted(uri);
    });

    this.disposables.push(watcher);

    // Watch live editor changes (unsaved buffers)
    this.disposables.push(
      this.workspaceIO.onDidChangeTextDocument((e) => {
        if (this.isRelevantDocument(e.document)) {
          this.parseAndCache(e.document.uri, e.document.getText());
          void this.rebuildDerivedIndices();
        }
      }),
    );

    this.disposables.push(
      this.workspaceIO.onDidOpenTextDocument((doc) => {
        if (this.isRelevantDocument(doc)) {
          this.parseAndCache(doc.uri, doc.getText());
          void this.rebuildDerivedIndices();
        }
      }),
    );
  }

  private isRelevantDocument(doc: vscode.TextDocument): boolean {
    return doc.languageId === 'nekotools-jvi' || doc.uri.fsPath.endsWith('.nkv');
  }

  private async buildFullIndex(): Promise<void> {
    const uris = await this.workspaceIO.findFiles(JVI_GLOB);
    for (const uri of uris) {
      const content = await this.readFileContent(uri);
      if (content !== undefined) {
        this.parseAndCache(uri, content);
      }
    }
    await this.rebuildDerivedIndices();
  }

  private async onFileChanged(uri: vscode.Uri): Promise<void> {
    const content = await this.readFileContent(uri);
    if (content !== undefined) {
      this.parseAndCache(uri, content);
      await this.rebuildDerivedIndices();
    }
  }

  private onFileDeleted(uri: vscode.Uri): void {
    this.fileCache.delete(uri.toString());
    void this.rebuildDerivedIndices();
  }

  private async readFileContent(uri: vscode.Uri): Promise<string | undefined> {
    // Prefer open editor buffer (may have unsaved changes)
    const openDoc = this.workspaceIO
      .getTextDocuments()
      .find((document) => document.uri.toString() === uri.toString());
    if (openDoc) {
      return openDoc.getText();
    }
    try {
      const bytes = await this.workspaceIO.readFile(uri);
      return new TextDecoder('utf-8').decode(bytes);
    } catch {
      return undefined;
    }
  }

  private parseAndCache(uri: vscode.Uri, content: string): void {
    try {
      const project = parseJviDocument(content);
      if (!project.parseError) {
        this.fileCache.set(uri.toString(), project);
      }
    } catch {
      // Ignore parse errors — keep stale cache entry if any
    }
  }

  /**
   * Rebuilds all derived indices from the file cache.
   */
  private async rebuildDerivedIndices(): Promise<void> {
    this.mediaRefIndex.clear();
    this.elementIdIndex.clear();

    for (const [uriStr, project] of this.fileCache) {
      const jviDir = path.dirname(vscode.Uri.parse(uriStr).fsPath);

      for (const track of project.tracks) {
        for (const el of track.elements) {
          // Index element by ID
          if (el.id) {
            this.elementIdIndex.set(el.id, {
              jviUri: uriStr,
              element: el,
              range: el.idRange,
            });
          }

          // Index media references by absolute path
          if (el.src && el.srcRange) {
            const absolutePath = await resolveMediaSrcPath(jviDir, el.src);
            const ref: MediaReference = {
              absolutePath,
              relativeSrc: el.src,
              jviUri: uriStr,
              elementId: el.id,
              srcRange: el.srcRange,
            };
            let refs = this.mediaRefIndex.get(absolutePath);
            if (!refs) {
              refs = [];
              this.mediaRefIndex.set(absolutePath, refs);
            }
            refs.push(ref);
          }
        }
      }
    }
  }
}
