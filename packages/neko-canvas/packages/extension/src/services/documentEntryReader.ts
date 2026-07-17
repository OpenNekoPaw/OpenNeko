import * as vscode from 'vscode';
import { createNodeDocumentLowLevelAccess } from '@neko/content/document/node';
import {
  createHostContentPathResolver,
  type DocumentEntryReader,
} from '@neko/shared/vscode/extension';

export function createCanvasDocumentEntryReader(): DocumentEntryReader {
  const access = createNodeDocumentLowLevelAccess();
  return {
    async readEntry(source, entryPath) {
      const filePath = await resolveCanvasDocumentSourcePath(source.filePath);
      return access.readEntry(filePath, entryPath);
    },
  };
}

async function resolveCanvasDocumentSourcePath(filePath: string): Promise<string> {
  const resolver = await createHostContentPathResolver({
    workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    getExtension: vscode.extensions.getExtension,
  });
  const resolved = resolver.resolve(filePath);
  if (resolver.hasVariable(resolved)) {
    throw new Error(`Canvas document source path uses an unknown path variable: ${filePath}`);
  }
  return resolved;
}
