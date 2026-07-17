export const NEKO_ENGINE_EXTENSION_ID = 'neko.neko-engine';
export const NEKO_ENGINE_ENSURE_FRAME_SERVER_COMMAND = 'neko.engine.ensureFrameServer';
export const NEKO_ENGINE_CLIENT_TIMEOUT_MS = 300_000;

export interface NekoEngineFrameServerResult {
  readonly port: number;
}

export function isNekoEngineFrameServerResult(
  value: unknown,
): value is NekoEngineFrameServerResult {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const port = (value as { port?: unknown }).port;
  return typeof port === 'number' && Number.isInteger(port) && port > 0;
}
