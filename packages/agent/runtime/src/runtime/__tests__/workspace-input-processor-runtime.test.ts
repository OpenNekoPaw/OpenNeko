import { describe, expect, it, vi } from 'vitest';
import type { InputProcessor } from '../../input';
import { createWorkspaceInputProcessorRuntime } from '../turn/workspace-input-processor-runtime';

function createProcessor(id: string): InputProcessor {
  return { id } as unknown as InputProcessor;
}

describe('workspace-input-processor-runtime', () => {
  it('returns null when no workspace root is available', () => {
    const createProcessorMock = vi.fn(createProcessor);
    const runtime = createWorkspaceInputProcessorRuntime({
      createProcessor: createProcessorMock,
    });

    expect(runtime.resolve(undefined)).toBeNull();
    expect(runtime.resolve(null)).toBeNull();
    expect(createProcessorMock).not.toHaveBeenCalled();
  });

  it('reuses the processor for the same workspace root', () => {
    const createProcessorMock = vi.fn(createProcessor);
    const runtime = createWorkspaceInputProcessorRuntime({
      createProcessor: createProcessorMock,
    });

    const first = runtime.resolve('/workspace/a');
    const second = runtime.resolve('/workspace/a');

    expect(first).toBe(second);
    expect(createProcessorMock).toHaveBeenCalledTimes(1);
  });

  it('recreates the processor when workspace root changes', () => {
    const createProcessorMock = vi.fn(createProcessor);
    const runtime = createWorkspaceInputProcessorRuntime({
      createProcessor: createProcessorMock,
    });

    const first = runtime.resolve('/workspace/a');
    const second = runtime.resolve('/workspace/b');

    expect(first).not.toBe(second);
    expect(createProcessorMock).toHaveBeenCalledTimes(2);
    expect(createProcessorMock).toHaveBeenNthCalledWith(1, '/workspace/a');
    expect(createProcessorMock).toHaveBeenNthCalledWith(2, '/workspace/b');
  });
});
