/**
 * Thumbnail Tooltip Builder
 *
 * Creates MarkdownString tooltips with embedded thumbnail images
 * for VSCode native TreeView items.
 *
 * Constraint: TreeItem tooltip rendering is synchronous —
 * the thumbnail file must already exist on disk (via cache preheat).
 */

import * as vscode from 'vscode';
import * as fs from 'fs';

/**
 * Build a tooltip with optional thumbnail image.
 *
 * - If thumbnailPath is provided and the file exists → MarkdownString with `<img>` + metadata
 * - Otherwise → plain text metadata string
 *
 * Uses synchronous fs.accessSync (microsecond cost for local cache files).
 */
export function createThumbnailTooltip(
  thumbnailPath: string | null | undefined,
  metadataLines: string[],
): vscode.MarkdownString | string {
  const text = metadataLines.filter(Boolean).join('\n');

  if (!thumbnailPath) {
    return text;
  }

  // Synchronous check — tooltip rendering is sync, and local cache file access is ~μs
  try {
    fs.accessSync(thumbnailPath);
  } catch {
    return text;
  }

  const md = new vscode.MarkdownString(undefined, true);
  md.isTrusted = true;
  md.supportHtml = true;
  md.appendMarkdown(`<img src="${vscode.Uri.file(thumbnailPath).toString()}" width="200" />\n\n`);
  if (text) {
    md.appendText(text);
  }
  return md;
}
