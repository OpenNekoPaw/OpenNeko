import type { EngineClient } from '@neko/neko-client/EngineClient';

export interface IEngineRuntimeResolver {
  ensureClient(): Promise<EngineClient | null>;
}
