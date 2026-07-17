import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({}));

const dispose = vi.fn(async () => {});
const createNativeMediaEngine = vi.fn(async () => ({
  dispose,
}));

vi.mock('./NativeMediaEngine', () => ({
  createNativeMediaEngine,
}));

describe('MediaEngineManager', () => {
  beforeEach(() => {
    dispose.mockClear();
    createNativeMediaEngine.mockClear();
  });

  it('reuses the compatible engine within one extension session', async () => {
    const { MediaEngineManager } = await import('./MediaEngineManager');
    const manager = new MediaEngineManager();

    const engineA = await manager.getCompatibleEngine();
    const engineB = await manager.getCompatibleEngine();

    expect(engineA).toBe(engineB);
    expect(createNativeMediaEngine).toHaveBeenCalledTimes(1);
    expect(manager.currentMode).toBe('compatible');
  });

  it('drops the wrapper instance after disposeEngines', async () => {
    const { MediaEngineManager } = await import('./MediaEngineManager');
    const manager = new MediaEngineManager();

    const engineA = await manager.getCompatibleEngine();
    await manager.disposeEngines();
    const engineB = await manager.getCompatibleEngine();

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(createNativeMediaEngine).toHaveBeenCalledTimes(2);
    expect(engineA).not.toBe(engineB);
  });
});
