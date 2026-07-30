// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBrowserHostState } from './browserHostState';

describe('preview browser host state', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('posts through the browser parent and owns local session state', () => {
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const api = getBrowserHostState();

    api.postMessage({ type: 'ready' });
    api.setState({ panel: 'preview' });

    expect(postMessage).toHaveBeenCalledWith({ type: 'ready' }, '*');
    expect(api.getState()).toEqual({ panel: 'preview' });
  });
});
