import * as vscode from 'vscode';
import type {
  PanoramaCoverageAngle,
  PanoramaViewState,
  PreviewManifest,
  PreviewProjectionType,
  PreviewVariantRequest,
  UpdatePreviewAssetMetadataRequest,
} from '@neko/shared';
import { normalizeCoverageAngle, normalizePanoramaViewModeForProjection } from '@neko/shared';
import { PreviewService } from '../services/PreviewService';
import type { StatusBarManager } from '../ui/StatusBarManager';
import { getLogger } from '../utils/logger';
import { PANORAMIC_IMAGE_VIEW_TYPE } from '../types/panoramic-api';
import {
  createReadonlyPreviewDocument,
  getPreviewErrorHtml,
  getPreviewFileName,
  setupPreviewWebviewPanel,
} from './previewProviderHelper';
import { requirePanoramicImageSourceFormat } from './panoramicSourceAuthorization';

const logger = getLogger('PanoramicImagePreview');

export class PanoramicImagePreviewProvider implements vscode.CustomReadonlyEditorProvider {
  static readonly viewType = PANORAMIC_IMAGE_VIEW_TYPE;

  private _previewService: PreviewService | null = null;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _statusBar: StatusBarManager,
    private readonly _resolvePreviewService: () => Promise<PreviewService | null> = () =>
      PreviewService.tryCreate(),
  ) {}

  setPreviewService(service: PreviewService): void {
    this._previewService = service;
  }

  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken,
  ): Promise<vscode.CustomDocument> {
    return createReadonlyPreviewDocument(uri);
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    const filePath = document.uri.fsPath;
    const fileName = getPreviewFileName(filePath);
    this._statusBar.show({ fileName, duration: 0 });

    await setupPreviewWebviewPanel({
      webviewPanel,
      extensionUri: this._extensionUri,
      entry: 'panorama-image',
    });

    const manifestPromise = this.registerManifest(filePath, webviewPanel, fileName);
    let activeManifest: PreviewManifest | null = null;

    const messageDisposable = webviewPanel.webview.onDidReceiveMessage(
      async (message: Record<string, unknown>) => {
        switch (message.type) {
          case 'ready': {
            const manifest = await manifestPromise;
            if (!manifest) return;
            activeManifest = manifest;
            await webviewPanel.webview.postMessage({
              type: 'panorama:init',
              payload: {
                manifest,
                engineBaseUrl: this._previewService?.getPreviewBaseUrl() ?? null,
              },
            });
            break;
          }
          case 'panorama:confirmProjection': {
            const manifest = activeManifest ?? (await manifestPromise);
            if (!manifest) return;
            const projectionType = parseProjectionType(message.projectionType);
            if (!projectionType) return;
            const updated = await this.persistAssetMetadata(webviewPanel, manifest.assetId, {
              projectionType,
            });
            if (updated) activeManifest = updated;
            break;
          }
          case 'panorama:saveDefaultView': {
            const manifest = activeManifest ?? (await manifestPromise);
            if (!manifest) return;
            const viewState = parsePanoramaViewState(message.viewState);
            if (!viewState) return;
            const updated = await this.persistAssetMetadata(webviewPanel, manifest.assetId, {
              defaultViewState: normalizeViewStateForProjection(
                manifest.projection.type,
                viewState,
              ),
            });
            if (updated) activeManifest = updated;
            break;
          }
          case 'panorama:updateAsset': {
            const manifest = activeManifest ?? (await manifestPromise);
            if (!manifest) return;
            let projectionType: PreviewProjectionType | undefined;
            if (message.projectionType !== undefined) {
              const parsedProjectionType = parseProjectionType(message.projectionType);
              if (!parsedProjectionType) return;
              projectionType = parsedProjectionType;
            }
            const defaultViewState =
              message.defaultViewState === undefined
                ? undefined
                : parsePanoramaViewState(message.defaultViewState);
            if (message.defaultViewState !== undefined && !defaultViewState) return;
            const effectiveProjectionType = projectionType ?? manifest.projection.type;
            let coverageAngle: PanoramaCoverageAngle | undefined;
            if (message.coverageAngle !== undefined) {
              const parsedCoverageAngle = parseCoverageAngle(message.coverageAngle);
              if (!parsedCoverageAngle) return;
              coverageAngle = parsedCoverageAngle;
            }
            const updated = await this.persistAssetMetadata(
              webviewPanel,
              manifest.assetId,
              buildMetadataUpdate(
                projectionType,
                coverageAngle,
                defaultViewState
                  ? normalizeViewStateForProjection(effectiveProjectionType, defaultViewState)
                  : undefined,
              ),
            );
            if (updated) activeManifest = updated;
            break;
          }
          case 'panorama:requestVariant': {
            const manifest = activeManifest ?? (await manifestPromise);
            if (!manifest) return;
            const request = parseVariantRequest(message.request);
            if (!request) return;
            await this.requestVariant(webviewPanel, manifest.assetId, request);
            break;
          }
        }
      },
    );

    const disposePanelResources = async () => {
      messageDisposable.dispose();
      const manifest = activeManifest ?? (await manifestPromise.catch(() => null));
      if (manifest) {
        await this._previewService?.unregisterPreviewAsset(manifest.assetId);
      }
      this._statusBar.hide();
    };

    webviewPanel.onDidDispose(() => {
      void disposePanelResources().catch((error) => {
        logger.error('Failed to dispose panoramic image preview resources:', error);
      });
    });
  }

  private async persistAssetMetadata(
    webviewPanel: vscode.WebviewPanel,
    assetId: string,
    request: UpdatePreviewAssetMetadataRequest,
  ): Promise<PreviewManifest | null> {
    try {
      const manifest = await this._previewService?.updatePreviewAssetMetadata(assetId, request);
      if (!manifest) return null;
      await webviewPanel.webview.postMessage({
        type: 'panorama:init',
        payload: {
          manifest,
          engineBaseUrl: this._previewService?.getPreviewBaseUrl() ?? null,
        },
      });
      return manifest;
    } catch (error) {
      await webviewPanel.webview.postMessage({
        type: 'panorama:error',
        payload: { message: error instanceof Error ? error.message : String(error) },
      });
      return null;
    }
  }

  private async requestVariant(
    webviewPanel: vscode.WebviewPanel,
    assetId: string,
    request: PreviewVariantRequest,
  ): Promise<void> {
    try {
      const variant = await this._previewService?.requestPreviewVariant(assetId, request);
      if (!variant) return;
      await webviewPanel.webview.postMessage({
        type: 'panorama:variantReady',
        payload: { variant },
      });
    } catch (error) {
      await webviewPanel.webview.postMessage({
        type: 'panorama:error',
        payload: { message: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  dispose(): void {}

  private async registerManifest(
    filePath: string,
    webviewPanel: vscode.WebviewPanel,
    fileName: string,
  ): Promise<PreviewManifest | null> {
    try {
      requirePanoramicImageSourceFormat(filePath);
    } catch (error) {
      webviewPanel.webview.html = getPreviewErrorHtml(
        error instanceof Error ? error.message : String(error),
        'Panoramic Preview Error',
      );
      this._statusBar.hide();
      return null;
    }
    if (!this._previewService) {
      this._previewService = await this._resolvePreviewService();
    }
    if (!this._previewService?.isAvailable) {
      webviewPanel.webview.html = getPreviewErrorHtml(
        'Failed to initialize media engine. Please ensure neko-engine is installed.',
        'Panoramic Preview Error',
      );
      this._statusBar.hide();
      return null;
    }

    try {
      const manifest = await this._previewService.registerPreviewAsset({
        source: filePath,
        kind: 'image',
        explicitOpen: true,
      });
      this._statusBar.show({
        fileName,
        width: manifest.media.dimensions?.width,
        height: manifest.media.dimensions?.height,
        codec: manifest.media.codec?.imageFormat,
        duration: 0,
      });
      return manifest;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Failed to register panoramic image manifest:', error);
      webviewPanel.webview.html = getPreviewErrorHtml(
        `Failed to register preview asset: ${message}`,
        'Panoramic Preview Error',
      );
      this._statusBar.hide();
      return null;
    }
  }
}

function parseProjectionType(value: unknown): PreviewProjectionType | null {
  return value === 'equirectangular' ||
    value === 'cylindrical' ||
    value === 'flat' ||
    value === 'cubemap' ||
    value === 'fisheye' ||
    value === 'unknown'
    ? value
    : null;
}

function parsePanoramaViewState(value: unknown): PanoramaViewState | null {
  if (!isRecord(value)) return null;
  if (
    value.mode !== 'sphere' &&
    value.mode !== 'flat' &&
    value.mode !== 'little-planet' &&
    value.mode !== 'cylindrical'
  ) {
    return null;
  }
  const yawDeg = finiteNumber(value.yawDeg);
  const pitchDeg = finiteNumber(value.pitchDeg);
  const rollDeg = finiteNumber(value.rollDeg);
  const fovDeg = finiteNumber(value.fovDeg);
  const exposure = finiteNumber(value.exposure);
  if (
    yawDeg === null ||
    pitchDeg === null ||
    rollDeg === null ||
    fovDeg === null ||
    exposure === null
  ) {
    return null;
  }
  const toneMapping =
    value.toneMapping === 'none' ||
    value.toneMapping === 'aces' ||
    value.toneMapping === 'reinhard' ||
    value.toneMapping === 'filmic'
      ? value.toneMapping
      : null;
  if (!toneMapping) return null;
  return { mode: value.mode, yawDeg, pitchDeg, rollDeg, fovDeg, exposure, toneMapping };
}

function parseVariantRequest(value: unknown): PreviewVariantRequest | null {
  if (!isRecord(value) || typeof value.role !== 'string') return null;
  const role = value.role;
  if (
    role !== 'thumbnail' &&
    role !== 'fov-crop' &&
    role !== 'screenshot' &&
    role !== 'proxy' &&
    role !== 'tile'
  ) {
    return null;
  }
  const viewState = parsePanoramaViewState(value.viewState);
  const projectionType =
    value.projectionType === undefined ? undefined : parseProjectionType(value.projectionType);
  if (value.projectionType !== undefined && !projectionType) return null;
  const coverageAngle =
    value.coverageAngle === undefined ? undefined : parseCoverageAngle(value.coverageAngle);
  if (value.coverageAngle !== undefined && !coverageAngle) return null;
  const width = finiteNumber(value.width);
  const height = finiteNumber(value.height);
  const quality = finiteNumber(value.quality);

  const request: {
    role: PreviewVariantRequest['role'];
    viewState?: PanoramaViewState;
    projectionType?: PreviewProjectionType;
    coverageAngle?: PanoramaCoverageAngle;
    width?: number;
    height?: number;
    quality?: number;
    format?: PreviewVariantRequest['format'];
  } = { role };
  if (viewState) {
    request.viewState = projectionType
      ? normalizeViewStateForProjection(projectionType, viewState)
      : viewState;
  }
  if (projectionType) request.projectionType = projectionType;
  if (coverageAngle) request.coverageAngle = coverageAngle;
  if (width !== null) request.width = width;
  if (height !== null) request.height = height;
  if (quality !== null) request.quality = quality;
  if (value.format === 'jpeg' || value.format === 'png' || value.format === 'webp') {
    request.format = value.format;
  }
  return request;
}

function parseCoverageAngle(value: unknown): PanoramaCoverageAngle | null {
  if (!isRecord(value)) return null;
  const horizontalDeg = finiteNumber(value.horizontalDeg);
  const verticalDeg = finiteNumber(value.verticalDeg);
  if (horizontalDeg === null || verticalDeg === null) return null;
  return normalizeCoverageAngle({ horizontalDeg, verticalDeg });
}

function normalizeViewStateForProjection(
  projectionType: PreviewProjectionType,
  viewState: PanoramaViewState,
): PanoramaViewState {
  return {
    ...viewState,
    mode: normalizePanoramaViewModeForProjection(projectionType, viewState.mode),
  };
}

function buildMetadataUpdate(
  projectionType: PreviewProjectionType | undefined,
  coverageAngle: PanoramaCoverageAngle | undefined,
  defaultViewState: PanoramaViewState | undefined,
): UpdatePreviewAssetMetadataRequest {
  const update: {
    projectionType?: PreviewProjectionType;
    coverageAngle?: PanoramaCoverageAngle;
    defaultViewState?: PanoramaViewState;
  } = {};
  if (projectionType !== undefined) {
    update.projectionType = projectionType;
  }
  if (coverageAngle !== undefined) {
    update.coverageAngle = coverageAngle;
  }
  if (defaultViewState !== undefined) {
    update.defaultViewState = defaultViewState;
  }
  return update;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
