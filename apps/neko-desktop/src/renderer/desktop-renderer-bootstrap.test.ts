// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startDesktopRendererBootstrap } from './desktop-renderer-bootstrap';

describe('Desktop renderer bootstrap', () => {
  beforeEach(() => {
    document.documentElement.lang = 'en';
    document.body.innerHTML = '<div id="root"></div>';
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('mounts the canonical application exactly once without a failure presentation', async () => {
    const mountDesktopRenderer = vi.fn(async (container: HTMLElement) => {
      container.textContent = 'Desktop mounted';
    });
    const loadApplication = vi.fn(async () => ({ mountDesktopRenderer }));
    const reload = vi.fn();

    await startDesktopRendererBootstrap({ document, loadApplication, reload });

    expect(loadApplication).toHaveBeenCalledTimes(1);
    expect(mountDesktopRenderer).toHaveBeenCalledTimes(1);
    expect(mountDesktopRenderer).toHaveBeenCalledWith(document.getElementById('root'));
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(document.getElementById('root')?.textContent).toBe('Desktop mounted');
    expect(reload).not.toHaveBeenCalled();
  });

  it('shows an English diagnostic when the application import rejects and reloads the same page', async () => {
    const loadApplication = vi.fn(async () => {
      throw new Error('application export mismatch');
    });
    const reload = vi.fn();

    await startDesktopRendererBootstrap({ document, loadApplication, reload });

    const alert = document.querySelector<HTMLElement>('[role="alert"]');
    expect(alert?.textContent).toContain('OpenNeko could not start');
    expect(alert?.textContent).toContain('application export mismatch');
    const retry = alert?.querySelector<HTMLButtonElement>('button');
    expect(retry?.textContent).toBe('Reload');
    retry?.click();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(loadApplication).toHaveBeenCalledTimes(1);
  });

  it('shows a Chinese diagnostic when application initialization rejects', async () => {
    document.documentElement.lang = 'zh-CN';
    const reload = vi.fn();
    const mountDesktopRenderer = vi.fn(async () => {
      throw new Error('sender-bound bootstrap failed');
    });

    await startDesktopRendererBootstrap({
      document,
      loadApplication: async () => ({ mountDesktopRenderer }),
      reload,
    });

    const alert = document.querySelector<HTMLElement>('[role="alert"]');
    expect(alert?.textContent).toContain('OpenNeko 无法启动');
    expect(alert?.textContent).toContain('sender-bound bootstrap failed');
    expect(alert?.querySelector('button')?.textContent).toBe('重新载入');
    expect(reload).not.toHaveBeenCalled();
  });
});
