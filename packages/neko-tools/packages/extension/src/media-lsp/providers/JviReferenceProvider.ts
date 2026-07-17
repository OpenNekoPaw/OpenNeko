/**
 * JVI Reference Provider — Find All References for .nkv files.
 *
 * When the cursor is on a `src` value, finds all .nkv elements across the
 * workspace that reference the same absolute media path.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { findSrcNodeAtOffset } from '../services/JviParser';
import type { IMediaWorkspaceIndex } from '../services/types';
import { resolveMediaSrcPath } from '../services/resolveMediaSrcPath';

export class JviReferenceProvider implements vscode.ReferenceProvider {
  constructor(private readonly workspaceIndex: IMediaWorkspaceIndex) {}

  async provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.ReferenceContext,
    _token: vscode.CancellationToken,
  ): Promise<vscode.Location[] | null> {
    await this.workspaceIndex.ensureInitialized();

    const text = document.getText();
    const offset = document.offsetAt(position);

    const srcNode = findSrcNodeAtOffset(text, offset);
    if (!srcNode) return null;

    const jviDir = path.dirname(document.uri.fsPath);
    const absolutePath = await resolveMediaSrcPath(jviDir, srcNode.value);

    const references = this.workspaceIndex.findMediaReferences(absolutePath);
    if (references.length === 0) return null;

    return references.map(
      (ref) =>
        new vscode.Location(
          vscode.Uri.parse(ref.jviUri),
          new vscode.Range(
            new vscode.Position(ref.srcRange.startLine, ref.srcRange.startChar),
            new vscode.Position(ref.srcRange.endLine, ref.srcRange.endChar),
          ),
        ),
    );
  }
}
