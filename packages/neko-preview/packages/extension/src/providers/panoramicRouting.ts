import * as vscode from 'vscode';
import {
  getPanoramicFileExtension,
  getPanoramicPreviewRoute,
  isHighConfidencePanoramicImagePath,
  OPEN_PANORAMIC_IMAGE_COMMAND,
  OPEN_PANORAMIC_VIDEO_COMMAND,
  PANORAMIC_IMAGE_VIEW_TYPE,
  PANORAMIC_VIDEO_VIEW_TYPE,
} from '@neko/shared';
import { previewFileServer } from './document/PreviewFileServer';

const GPANO_METADATA_PREFIX_BYTES = 256 * 1024;

export interface PanoramicImageRoute {
  readonly command: typeof OPEN_PANORAMIC_IMAGE_COMMAND;
  readonly viewType: typeof PANORAMIC_IMAGE_VIEW_TYPE;
  readonly confidence: 'high' | 'explicit';
  readonly signal: 'extension' | 'gpano-metadata' | 'trusted-filename' | 'manual';
}

export interface PanoramicVideoRoute {
  readonly command: typeof OPEN_PANORAMIC_VIDEO_COMMAND;
  readonly viewType: typeof PANORAMIC_VIDEO_VIEW_TYPE;
  readonly confidence: 'high' | 'explicit';
  readonly signal: 'trusted-filename' | 'manual';
}

export function isHighConfidencePanoramicImageCandidate(filePath: string): boolean {
  return isHighConfidencePanoramicImagePath(filePath);
}

export function getPanoramicImageRoute(
  filePath: string,
  explicitOpen: boolean,
  metadataText?: string,
): PanoramicImageRoute | null {
  const route = getPanoramicPreviewRoute({
    filePath,
    explicitOpen,
    metadataText,
    mediaType: 'image',
  });
  if (!route || route.kind !== 'image') return null;
  return route;
}

export function getPanoramicVideoRoute(
  filePath: string,
  explicitOpen: boolean,
): PanoramicVideoRoute | null {
  const route = getPanoramicPreviewRoute({ filePath, explicitOpen, mediaType: 'video' });
  if (!route || route.kind !== 'video') return null;
  return route;
}

export async function getHighConfidencePanoramicImageRoute(
  uri: vscode.Uri,
): Promise<PanoramicImageRoute | null> {
  const staticRoute = getPanoramicImageRoute(uri.fsPath, false);
  if (staticRoute) return staticRoute;
  if (!shouldProbeImageMetadata(uri.fsPath)) return null;

  const metadataText = await readMetadataPrefix(uri);
  if (!metadataText) return null;
  return getPanoramicImageRoute(uri.fsPath, false, metadataText);
}

export async function openPanoramicImage(uri: vscode.Uri): Promise<void> {
  await vscode.commands.executeCommand('vscode.openWith', uri, PANORAMIC_IMAGE_VIEW_TYPE);
}

export async function openPanoramicVideo(uri: vscode.Uri): Promise<void> {
  await vscode.commands.executeCommand('vscode.openWith', uri, PANORAMIC_VIDEO_VIEW_TYPE);
}

export async function openBestPanoramicPreview(uri: vscode.Uri): Promise<boolean> {
  const imageRoute = await getHighConfidencePanoramicImageRoute(uri);
  if (imageRoute) {
    await openPanoramicImage(uri);
    return true;
  }

  const videoRoute = getPanoramicVideoRoute(uri.fsPath, false);
  if (videoRoute) {
    await openPanoramicVideo(uri);
    return true;
  }

  return false;
}

function shouldProbeImageMetadata(filePath: string): boolean {
  const extension = getPanoramicFileExtension(filePath);
  return extension === 'jpg' || extension === 'jpeg';
}

async function readMetadataPrefix(uri: vscode.Uri): Promise<string | undefined> {
  try {
    const bytes = await previewFileServer.readRange(
      uri.fsPath,
      0,
      GPANO_METADATA_PREFIX_BYTES - 1,
      { sourceDocumentUri: uri },
    );
    return Buffer.from(bytes).toString('utf8');
  } catch {
    return undefined;
  }
}
