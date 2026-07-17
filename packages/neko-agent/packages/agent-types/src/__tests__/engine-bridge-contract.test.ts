import { describe, expect, it } from 'vitest';
import {
  NEKO_ENGINE_CLIENT_TIMEOUT_MS,
  NEKO_ENGINE_ENSURE_FRAME_SERVER_COMMAND,
  NEKO_ENGINE_EXTENSION_ID,
  isNekoEngineFrameServerResult,
} from '../engine-bridge-contract';

describe('engine bridge contract', () => {
  it('exposes stable neko-engine bridge identifiers', () => {
    expect(NEKO_ENGINE_EXTENSION_ID).toBe('neko.neko-engine');
    expect(NEKO_ENGINE_ENSURE_FRAME_SERVER_COMMAND).toBe('neko.engine.ensureFrameServer');
    expect(NEKO_ENGINE_CLIENT_TIMEOUT_MS).toBe(300_000);
  });

  it('validates frame server command results', () => {
    expect(isNekoEngineFrameServerResult({ port: 3000 })).toBe(true);
    expect(isNekoEngineFrameServerResult({ port: 0 })).toBe(false);
    expect(isNekoEngineFrameServerResult({ port: 1.5 })).toBe(false);
    expect(isNekoEngineFrameServerResult({ port: '3000' })).toBe(false);
    expect(isNekoEngineFrameServerResult(null)).toBe(false);
  });
});
