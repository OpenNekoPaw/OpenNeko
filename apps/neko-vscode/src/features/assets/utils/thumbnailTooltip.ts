/**
 * Thumbnail Tooltip Builder
 *
 * Creates MarkdownString tooltips with embedded thumbnail images
 * for VSCode native TreeView items.
 *
 * Thumbnail bytes are projected as a data URI so no Host-private path is exposed.
 */

import * as vscode from 'vscode';
/**
 * Build a tooltip with optional thumbnail image.
 */
export function createThumbnailTooltip(
  thumbnailUri: vscode.Uri | null | undefined,
  metadataLines: string[],
): vscode.MarkdownString | string {
  const text = metadataLines.filter(Boolean).join('\n');

  if (!thumbnailUri) return text;

  const md = new vscode.MarkdownString(undefined, true);
  md.isTrusted = true;
  md.supportHtml = true;
  md.appendMarkdown(`<img src="${thumbnailUri.toString()}" width="200" />\n\n`);
  if (text) {
    md.appendText(text);
  }
  return md;
}
