import type { CanvasPreviewRole, PreviewVariantRole } from '@neko/shared';
import { getGlobalVSCodeApi } from '../utils/vscode';
import type { PreviewResolveRequest, PreviewResolver, RuntimePreviewVariant } from './types';

const SAFE_URL_RE = /^(data:|blob:|https?:)/;
const IMAGE_PREVIEW_SOURCE_RE = /\.(?:png|jpe?g|webp|gif|avif|bmp|svg)(?:[?#]|$)/i;
const NON_IMAGE_MEDIA_URL_RE =
  /\.(?:mp4|m4v|mov|webm|mkv|avi|wmv|mp3|m4a|wav|flac|aac|ogg|opus)(?:[?#]|$)/i;

export function isSafeWebviewUrl(url: string): boolean {
  return SAFE_URL_RE.test(url);
}

export function isImagePreviewUrl(url: string): boolean {
  if (!isSafeWebviewUrl(url)) {
    return false;
  }

  if (url.startsWith('data:')) {
    return url.startsWith('data:image/');
  }

  return !NON_IMAGE_MEDIA_URL_RE.test(readUrlPathname(url));
}

const ROLE_TO_ENGINE_ROLE: Partial<Record<CanvasPreviewRole, PreviewVariantRole>> = {
  image: 'thumbnail',
  'source-image': 'source',
  'document-cover': 'thumbnail',
  'video-poster': 'thumbnail',
  'video-proxy': 'proxy',
  'audio-waveform': 'thumbnail',
  'panorama-fov-crop': 'fov-crop',
  'model-screenshot': 'screenshot',
  'model-turntable': 'proxy',
  unavailable: 'thumbnail',
};

export class WebviewPreviewResolver implements PreviewResolver {
  private readonly pending = new Set<RuntimeVariantRequest>();

  async resolve(request: PreviewResolveRequest): Promise<RuntimePreviewVariant> {
    const role = request.role ?? request.source.role;
    const preferred = selectStableVariant(request);
    if (preferred?.sourcePath || preferred?.assetId) {
      return preferred;
    }

    const variantSourcePath = selectRuntimeVariantSourcePath(request, role);
    const sourcePath = variantSourcePath ?? request.source.asset?.path ?? request.source.asset?.uri;
    const mediaType = variantSourcePath ? 'image' : request.source.asset?.mediaType;
    const documentResourceRef = request.source.metadata?.['documentResourceRef'];
    const resourceRef = request.source.metadata?.['resourceRef'];
    const hasStructuredResourceRef = Boolean(documentResourceRef || resourceRef);
    if (!sourcePath && !documentResourceRef && !resourceRef) {
      return createUnavailableVariant(request, 'No preview source');
    }

    const runtimeUrl = await this.requestRuntimeVariant({
      sourceId: request.source.id,
      assetPath: hasStructuredResourceRef ? undefined : sourcePath,
      role,
      mediaType,
      documentResourceRef,
      resourceRef,
    });

    return {
      id: `${request.source.id}:runtime`,
      role,
      assetId: request.source.asset?.assetId,
      sourcePath,
      runtimeUrl,
      mimeType: mediaType,
    };
  }

  dispose(): void {
    for (const request of Array.from(this.pending)) {
      request.dispose();
    }
    this.pending.clear();
  }

  private requestRuntimeVariant(input: RuntimeVariantInput): Promise<string | undefined> {
    const request = createRuntimeVariantRequest(input, () => {
      this.pending.delete(request);
    });
    this.pending.add(request);
    return request.promise;
  }
}

function selectStableVariant(request: PreviewResolveRequest): RuntimePreviewVariant | undefined {
  const role = request.role ?? request.source.role;
  const variant = request.source.variants?.find((candidate) => candidate.role === role);
  if (!variant) {
    return undefined;
  }
  if (role === 'video-poster' && variant.sourcePath && !isImagePreviewUrl(variant.sourcePath)) {
    return undefined;
  }

  return {
    ...variant,
    runtimeUrl: variant.sourcePath,
  };
}

function selectRuntimeVariantSourcePath(
  request: PreviewResolveRequest,
  role: CanvasPreviewRole,
): string | undefined {
  const variant = request.source.variants?.find((candidate) => candidate.role === role);
  if (!variant?.sourcePath) {
    return undefined;
  }
  if (role === 'video-poster' && isImagePreviewSourcePath(variant.sourcePath)) {
    return variant.sourcePath;
  }
  return undefined;
}

function isImagePreviewSourcePath(sourcePath: string): boolean {
  if (isSafeWebviewUrl(sourcePath)) {
    return isImagePreviewUrl(sourcePath);
  }
  return IMAGE_PREVIEW_SOURCE_RE.test(readUrlPathname(sourcePath));
}

function readUrlPathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function createUnavailableVariant(
  request: PreviewResolveRequest,
  label: string,
): RuntimePreviewVariant {
  return {
    id: `${request.source.id}:unavailable`,
    role: 'unavailable',
    assetId: request.source.asset?.assetId,
    sourcePath: request.source.asset?.path,
    metadata: { label },
  };
}

interface RuntimeVariantInput {
  sourceId: string;
  assetPath?: string;
  role: CanvasPreviewRole;
  mediaType?: string;
  documentResourceRef?: unknown;
  resourceRef?: unknown;
}

interface RuntimeVariantRequest {
  promise: Promise<string | undefined>;
  dispose: () => void;
}

function createRuntimeVariantRequest(
  { sourceId, assetPath, role, mediaType, documentResourceRef, resourceRef }: RuntimeVariantInput,
  onSettled: () => void,
): RuntimeVariantRequest {
  const vscode = getGlobalVSCodeApi();
  const engineRole = ROLE_TO_ENGINE_ROLE[role] ?? 'thumbnail';

  if (!vscode) {
    return {
      promise: Promise.resolve(undefined as string | undefined).finally(onSettled),
      dispose: () => {},
    };
  }

  let settled = false;
  let resolvePromise: (value: string | undefined) => void = () => {};
  const requestId = `preview-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const settle = (value: string | undefined): void => {
    if (settled) {
      return;
    }
    settled = true;
    window.clearTimeout(timeout);
    window.removeEventListener('message', handleMessage);
    onSettled();
    resolvePromise(value);
  };

  const timeout = window.setTimeout(() => {
    settle(undefined);
  }, 5000);

  const handleMessage = (event: MessageEvent) => {
    const message = event.data as { type?: string; requestId?: string; url?: string };
    if (message.type !== 'preview:variantResolved' || message.requestId !== requestId) {
      return;
    }

    settle(message.url);
  };

  const promise = new Promise<string | undefined>((resolve) => {
    resolvePromise = resolve;
    window.addEventListener('message', handleMessage);
    try {
      vscode.postMessage({
        type: 'preview:resolveVariant',
        requestId,
        sourceId,
        role: engineRole,
        mediaType,
        ...(assetPath ? { assetPath } : {}),
        ...(documentResourceRef ? { documentResourceRef } : {}),
        ...(resourceRef ? { resourceRef } : {}),
      });
    } catch {
      settle(undefined);
    }
  });

  return {
    promise,
    dispose: () => settle(undefined),
  };
}
