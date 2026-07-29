import * as vscode from 'vscode';
import { createPreviewAssetResourceRef } from '@neko/shared/vscode/extension';
import { readResourceSourceLocalPath, type ResourceRef } from '@neko/shared';
import type { ThreeReferenceCaptureRequest } from './ModelPreviewProvider';
import { decodePngDataUrl } from './threeReferenceCaptureEncoding';

interface ThreeReferenceCapturePreviewService {
  readonly isAvailable: boolean;
  registerPreviewAsset(request: {
    readonly source: string;
    readonly kind: 'image';
  }): Promise<{ readonly assetId: string }>;
}

interface ThreeReferenceCaptureWorkspaceFolder {
  readonly uri: vscode.Uri;
}

export async function materializeThreeReferenceCapture(input: {
  readonly request: ThreeReferenceCaptureRequest;
  readonly workspaceUri: vscode.Uri;
  readonly resolvePreviewService: () => Promise<ThreeReferenceCapturePreviewService | null>;
}): Promise<ResourceRef> {
  input.request.signal.throwIfAborted();
  const previewService = await input.resolvePreviewService();
  if (!previewService?.isAvailable) {
    throw new Error('3D Reference capture materialization requires PreviewService.');
  }
  input.request.signal.throwIfAborted();
  const bytes = decodePngDataUrl(input.request.imageDataUrl);
  const directory = vscode.Uri.joinPath(
    input.workspaceUri,
    '.neko',
    '.cache',
    'resources',
    'three-reference-captures',
  );
  await vscode.workspace.fs.createDirectory(directory);
  const fileName = [
    safeSegment(input.request.identity.sessionId),
    String(input.request.identity.revision),
    safeSegment(input.request.purpose),
    safeSegment(input.request.requestId),
  ].join('-');
  const captureUri = vscode.Uri.joinPath(directory, `${fileName}.png`);
  await vscode.workspace.fs.writeFile(captureUri, bytes);
  input.request.signal.throwIfAborted();
  const manifest = await previewService.registerPreviewAsset({
    source: captureUri.fsPath,
    kind: 'image',
  });
  input.request.signal.throwIfAborted();
  return createPreviewAssetResourceRef({
    assetId: manifest.assetId,
    sourcePath: captureUri.fsPath,
    kind: 'image',
    identity: { sizeBytes: bytes.byteLength },
  });
}

export function resolveThreeReferenceCaptureWorkspaceUri(input: {
  readonly request: ThreeReferenceCaptureRequest;
  readonly workspaceFolders: readonly ThreeReferenceCaptureWorkspaceFolder[] | undefined;
  readonly getWorkspaceFolder: (
    sourceUri: vscode.Uri,
  ) => ThreeReferenceCaptureWorkspaceFolder | undefined;
}): vscode.Uri {
  for (const sourcePath of captureSourcePaths(input.request)) {
    const workspaceFolder = input.getWorkspaceFolder(vscode.Uri.file(sourcePath));
    if (workspaceFolder) return workspaceFolder.uri;
  }

  const workspaceFolders = input.workspaceFolders ?? [];
  if (workspaceFolders.length === 0) {
    throw new Error('3D Reference capture materialization requires an open workspace.');
  }
  if (workspaceFolders.length > 1) {
    throw new Error(
      '3D Reference capture materialization cannot choose between multiple workspace folders.',
    );
  }
  return workspaceFolders[0]!.uri;
}

function captureSourcePaths(request: ThreeReferenceCaptureRequest): readonly string[] {
  const sourcePaths: string[] = [];
  if (request.staging.subject.kind === 'source-model') {
    const subjectPath = readResourceSourceLocalPath(request.staging.subject.source.source);
    if (subjectPath) sourcePaths.push(subjectPath);
  }
  if (request.staging.environment) {
    const environmentPath = readResourceSourceLocalPath(request.staging.environment.source.source);
    if (environmentPath) sourcePaths.push(environmentPath);
  }
  return sourcePaths;
}

function safeSegment(value: string): string {
  const sanitized = value.replaceAll(/[^a-zA-Z0-9._-]/g, '_');
  if (!sanitized) throw new Error('3D Reference capture identity is empty.');
  return sanitized;
}
