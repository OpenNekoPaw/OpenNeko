export interface CanvasPreviewDelegateRequest {
  readonly target: 'preview' | 'external';
  readonly assetPath: string;
  readonly mediaType?: string;
}

export function parseCanvasPreviewDelegateRequest(
  message: Readonly<Record<string, unknown>>,
): CanvasPreviewDelegateRequest {
  const action = readRecord(message['action']);
  if (!action || (action['target'] !== 'preview' && action['target'] !== 'external')) {
    throw new Error('preview:delegateAction requires target "preview" or "external".');
  }

  const asset = readRecord(message['asset']);
  if (!asset || asset['kind'] !== 'asset-identity') {
    throw new Error('preview:delegateAction requires an asset identity.');
  }
  const assetPath = readNonEmptyString(asset['path']) ?? readNonEmptyString(asset['uri']);
  if (!assetPath) {
    throw new Error('preview:delegateAction requires an asset path or URI.');
  }
  const mediaType = readNonEmptyString(asset['mediaType']);

  return {
    target: action['target'],
    assetPath,
    ...(mediaType ? { mediaType } : {}),
  };
}

function readRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}
