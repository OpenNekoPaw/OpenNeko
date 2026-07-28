import { describe, expect, it, vi } from 'vitest';
import { DesktopRendererRecovery } from './renderer-recovery';

describe('DesktopRendererRecovery', () => {
  it('reloads a live renderer only once per Window', () => {
    const recovery = new DesktopRendererRecovery();
    const reload = vi.fn();
    const target = {
      isDestroyed: () => false,
      reload,
    };

    expect(recovery.recover(target)).toBe(true);
    expect(recovery.recover(target)).toBe(false);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('does not consume the recovery budget for a destroyed Window', () => {
    const recovery = new DesktopRendererRecovery();
    const reload = vi.fn();

    expect(
      recovery.recover({
        isDestroyed: () => true,
        reload,
      }),
    ).toBe(false);
    expect(
      recovery.recover({
        isDestroyed: () => false,
        reload,
      }),
    ).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('does not retry when the reload attempt throws', () => {
    const recovery = new DesktopRendererRecovery();
    const reload = vi.fn(() => {
      throw new Error('reload failed');
    });
    const target = {
      isDestroyed: () => false,
      reload,
    };

    expect(() => recovery.recover(target)).toThrow('reload failed');
    expect(recovery.recover(target)).toBe(false);
    expect(reload).toHaveBeenCalledOnce();
  });
});
