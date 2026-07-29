import * as path from 'node:path';
import * as vscode from 'vscode';
import { detectMediaType } from '@neko/shared';

const DOCUMENT_PREVIEW_VIEW_TYPES: Readonly<Record<string, string>> = {
  epub: 'neko.epubPreview',
  cbz: 'neko.cbzPreview',
  cbr: 'neko.cbzPreview',
  pdf: 'neko.pdfPreview',
  docx: 'neko.docxPreview',
  doc: 'neko.docxPreview',
};

export function getPreviewViewType(filePath: string): string | undefined {
  const mediaType = detectMediaType(filePath);

  if (mediaType === 'video') {
    return 'neko.videoPreview';
  }

  if (mediaType === 'audio') {
    return 'neko.audioPreview';
  }

  if (mediaType === 'document') {
    const ext = path.extname(filePath).slice(1).toLowerCase();
    return DOCUMENT_PREVIEW_VIEW_TYPES[ext];
  }

  return undefined;
}

export async function openAssetPreview(uri: vscode.Uri): Promise<void> {
  const viewType = getPreviewViewType(uri.fsPath);

  if (viewType) {
    await vscode.commands.executeCommand('vscode.openWith', uri, viewType);
    return;
  }

  await vscode.commands.executeCommand('vscode.open', uri);
}
