import * as vscode from 'vscode';
import { createPreviewAssetResourceRef } from '@neko/shared/vscode/extension';
import type { ResourceRef } from '@neko/shared';
import type { PreviewService } from '../../services/PreviewService';
import type { ThreeReferenceCaptureRequest } from './ModelPreviewProvider';
import { decodePngDataUrl } from './threeReferenceCaptureEncoding';

export async function materializeThreeReferenceCapture(input: {
  readonly request: ThreeReferenceCaptureRequest;
  readonly storageUri: vscode.Uri;
  readonly resolvePreviewService: () => Promise<PreviewService | null>;
}): Promise<ResourceRef> {
  input.request.signal.throwIfAborted();
  const bytes = decodePngDataUrl(input.request.imageDataUrl);
  const directory = vscode.Uri.joinPath(input.storageUri, 'three-reference-captures');
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
  const previewService = await input.resolvePreviewService();
  if (!previewService?.isAvailable) {
    throw new Error('3D Reference capture materialization requires PreviewService.');
  }
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

function safeSegment(value: string): string {
  const sanitized = value.replaceAll(/[^a-zA-Z0-9._-]/g, '_');
  if (!sanitized) throw new Error('3D Reference capture identity is empty.');
  return sanitized;
}
