/**
 * EpubSymbolProvider — populates VSCode's Outline panel with EPUB table of contents.
 *
 * Registered as a DocumentSymbolProvider for *.epub files. Results are cached
 * per (filePath, mtime) so repeated outline refreshes are fast.
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { readEpubTocFromEntries, type TocEntry } from './EpubParser';
import { previewFileServer } from '../providers/document/PreviewFileServer';
import { resolvePreviewPath } from '../providers/document/workspacePathResolver';

interface CacheEntry {
  mtime: number;
  symbols: vscode.DocumentSymbol[];
}

export class EpubSymbolProvider implements vscode.DocumentSymbolProvider {
  private readonly cache = new Map<string, CacheEntry>();

  private async resolveFilePath(filePath: string, documentUri?: vscode.Uri): Promise<string> {
    return resolvePreviewPath(filePath, {
      sourceDocumentUri: documentUri,
    });
  }

  async provideDocumentSymbols(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): Promise<vscode.DocumentSymbol[]> {
    const sourcePath = document.uri.fsPath;
    const path = await this.resolveFilePath(sourcePath, document.uri);

    // Check cache validity
    const stat = await fs.stat(path).catch(() => null);
    if (!stat) return [];
    const mtime = stat.mtimeMs;

    const cached = this.cache.get(sourcePath);
    if (cached && cached.mtime === mtime) return cached.symbols;

    if (token.isCancellationRequested) return [];

    const toc = await readEpubToc(path);
    if (token.isCancellationRequested) return [];

    const symbols = buildSymbolTree(toc);
    this.cache.set(sourcePath, { mtime, symbols });
    return symbols;
  }

  /** Retrieve cached TOC entries for a given file path (used by goToChapter command). */
  async getToc(filePath: string): Promise<TocEntry[]> {
    return readEpubToc(await this.resolveFilePath(filePath));
  }

  clearCache(filePath: string): void {
    this.cache.delete(filePath);
  }
}

// =============================================================================
// Helpers
// =============================================================================

function readEpubToc(filePath: string, documentUri?: vscode.Uri): Promise<TocEntry[]> {
  return previewFileServer.withEpubEntryReader(
    filePath,
    readEpubTocFromEntries,
    documentUri ? { sourceDocumentUri: documentUri } : undefined,
  );
}

function buildSymbolTree(entries: TocEntry[]): vscode.DocumentSymbol[] {
  const roots: vscode.DocumentSymbol[] = [];
  const stack: Array<{ depth: number; node: vscode.DocumentSymbol }> = [];

  entries.forEach((entry, index) => {
    const range = new vscode.Range(index, 0, index, 0);
    const sym = new vscode.DocumentSymbol(
      entry.label || `Section ${index + 1}`,
      entry.href,
      vscode.SymbolKind.Module,
      range,
      range,
    );

    // Pop stack until we find a parent at shallower depth
    while (stack.length > 0 && stack[stack.length - 1]!.depth >= entry.depth) {
      stack.pop();
    }

    if (stack.length === 0) {
      roots.push(sym);
    } else {
      stack[stack.length - 1]!.node.children.push(sym);
    }

    stack.push({ depth: entry.depth, node: sym });
  });

  return roots;
}
