import * as path from 'path';
import * as vscode from 'vscode';
import { createDefaultLocalResourceAccessService } from '@neko/shared/vscode/extension';
import type { PreviewEntry } from '../utils/html';
import { getWebviewHtml } from '../utils/html';

export function createReadonlyPreviewDocument(uri: vscode.Uri): vscode.CustomDocument {
  return { uri, dispose: () => {} };
}

export async function setupPreviewWebviewPanel({
  webviewPanel,
  extensionUri,
  entry,
  context,
  pinEditor = false,
}: {
  readonly webviewPanel: vscode.WebviewPanel;
  readonly extensionUri: vscode.Uri;
  readonly entry: PreviewEntry;
  readonly context?: vscode.ExtensionContext;
  readonly pinEditor?: boolean;
}): Promise<void> {
  const localResourceAccess = createDefaultLocalResourceAccessService({
    extensionUri,
    ...(context ? { context } : {}),
    includeExtensionCache: false,
  });
  await localResourceAccess.configureWebview(webviewPanel.webview, {
    enableScripts: true,
  });

  if (pinEditor) {
    await vscode.commands.executeCommand('workbench.action.pinEditor');
  }

  webviewPanel.webview.html = getWebviewHtml({
    webview: webviewPanel.webview,
    extensionUri,
    entry,
  });
}

export function getPreviewFileName(filePath: string): string {
  return path.basename(filePath.replaceAll('\\', path.sep));
}

export function getPreviewErrorHtml(message: string, title?: string): string {
  const heading = title ? `<h2>${escapeHtml(title)}</h2>` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<style>
		body {
			display: flex;
			align-items: center;
			justify-content: center;
			height: 100vh;
			margin: 0;
			background: var(--vscode-editor-background);
			color: var(--vscode-errorForeground, #f44);
			font-family: var(--vscode-font-family);
			font-size: 14px;
			text-align: center;
			padding: 20px;
		}
		h2 {
			margin: 0 0 8px;
			font-size: 16px;
		}
	</style>
</head>
<body>
	<div>
		${heading}
		<p>&#9888; ${escapeHtml(message)}</p>
	</div>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
