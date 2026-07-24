import { describe, expect, it, vi } from 'vitest';
import { executeCutWorkbenchHistory } from './cutHistory';

describe('Cut workbench history routing', () => {
  it('delegates toolbar undo to the active VS Code custom editor history stack', async () => {
    const execute = vi.fn(async () => undefined);

    await executeCutWorkbenchHistory({ direction: 'undo', panelActive: true, execute });

    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith('undo');
  });

  it('fails closed instead of undoing another active editor', async () => {
    const execute = vi.fn(async () => undefined);

    await expect(
      executeCutWorkbenchHistory({ direction: 'redo', panelActive: false, execute }),
    ).rejects.toThrow('active Cut editor');
    expect(execute).not.toHaveBeenCalled();
  });
});
