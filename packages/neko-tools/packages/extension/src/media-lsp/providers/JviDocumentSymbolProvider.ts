/**
 * JVI Document Symbol Provider — Outline view for .nkv files.
 *
 * Provides a hierarchical symbol tree:
 *   Project (Module icon) — name, resolution @ fps
 *     Track (Class icon) — name, trackType (N elements)
 *       Element (per-type icon) — name, startTime-endTime, src as detail
 */

import * as vscode from 'vscode';
import { parseJviDocument } from '../services/JviParser';
import type { JviParsedElement, JviRange } from '../types';

export class JviDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken,
  ): vscode.DocumentSymbol[] {
    const text = document.getText();
    const project = parseJviDocument(text);

    if (project.parseError) return [];

    const projectRange = toRange(project.range);
    const projectSymbol = new vscode.DocumentSymbol(
      project.name || 'Untitled Project',
      `${project.resolution.width}x${project.resolution.height} @ ${project.fps}fps`,
      vscode.SymbolKind.Module,
      projectRange,
      projectRange,
    );

    for (const track of project.tracks) {
      const trackRange = toRange(track.range);
      const trackSymbol = new vscode.DocumentSymbol(
        track.name || 'Unnamed Track',
        `${track.trackType || 'unknown'} (${track.elements.length} elements)`,
        vscode.SymbolKind.Class,
        trackRange,
        toRange(track.nameRange),
      );

      for (const el of track.elements) {
        const elRange = toRange(el.range);
        const endTime = el.startTime + el.duration;
        const timeRange =
          el.duration > 0 ? `${el.startTime.toFixed(1)}s - ${endTime.toFixed(1)}s` : '';
        const elSymbol = new vscode.DocumentSymbol(
          el.name || el.id || 'Unnamed',
          [timeRange, el.src].filter(Boolean).join(' '),
          elementTypeToSymbolKind(el.type),
          elRange,
          toRange(el.idRange),
        );
        trackSymbol.children.push(elSymbol);
      }

      projectSymbol.children.push(trackSymbol);
    }

    return [projectSymbol];
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function toRange(r: JviRange): vscode.Range {
  return new vscode.Range(
    new vscode.Position(r.startLine, r.startChar),
    new vscode.Position(r.endLine, r.endChar),
  );
}

function elementTypeToSymbolKind(type: JviParsedElement['type']): vscode.SymbolKind {
  switch (type) {
    case 'media':
      return vscode.SymbolKind.File;
    case 'audio':
      return vscode.SymbolKind.Event;
    case 'text':
      return vscode.SymbolKind.String;
    case 'shape':
      return vscode.SymbolKind.Object;
    case 'subtitle':
      return vscode.SymbolKind.String;
    default:
      return vscode.SymbolKind.Variable;
  }
}
