/**
 * JVI Definition Provider — Go to Definition for .nkv files.
 *
 * Two navigation paths:
 * 1. Cursor on `src` value → opens the referenced media file
 * 2. Cursor on `linked_audio_id`/`linked_video_id` → jumps to the target element's `id` in the same file
 */

import * as vscode from 'vscode';
import * as path from 'path';
import {
  findSrcNodeAtOffset,
  findLinkedIdAtOffset,
  findElementIdRange,
} from '../services/JviParser';
import type { IMediaWorkspaceIndex } from '../services/types';
import { resolveMediaSrcPath } from '../services/resolveMediaSrcPath';

export class JviDefinitionProvider implements vscode.DefinitionProvider {
  constructor(private readonly workspaceIndex: IMediaWorkspaceIndex) {}

  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
  ): Promise<vscode.Definition | null> {
    await this.workspaceIndex.ensureInitialized();

    const text = document.getText();
    const offset = document.offsetAt(position);

    // 1. Check if cursor is on a `src` value → open media file
    const srcNode = findSrcNodeAtOffset(text, offset);
    if (srcNode) {
      const jviDir = path.dirname(document.uri.fsPath);
      const absolutePath = await resolveMediaSrcPath(jviDir, srcNode.value);
      return new vscode.Location(vscode.Uri.file(absolutePath), new vscode.Position(0, 0));
    }

    // 2. Check if cursor is on a linked ID → jump to element definition
    const linkedId = findLinkedIdAtOffset(text, offset);
    if (linkedId) {
      // First try same file
      const targetRange = findElementIdRange(text, linkedId.value);
      if (targetRange) {
        return new vscode.Location(
          document.uri,
          new vscode.Range(
            new vscode.Position(targetRange.startLine, targetRange.startChar),
            new vscode.Position(targetRange.endLine, targetRange.endChar),
          ),
        );
      }

      // Fall back to workspace index (cross-file)
      const found = this.workspaceIndex.findElementById(linkedId.value);
      if (found) {
        return new vscode.Location(
          vscode.Uri.parse(found.jviUri),
          new vscode.Range(
            new vscode.Position(found.range.startLine, found.range.startChar),
            new vscode.Position(found.range.endLine, found.range.endChar),
          ),
        );
      }
    }

    return null;
  }
}
