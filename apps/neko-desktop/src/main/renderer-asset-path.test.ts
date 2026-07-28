import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveDesktopRendererAsset } from './renderer-asset-path';

describe('Desktop renderer asset path', () => {
  const rendererRoot = path.resolve('/desktop/renderer');

  it('resolves an asset only within the renderer root', () => {
    expect(resolveDesktopRendererAsset(rendererRoot, '/index.html')).toBe(
      path.join(rendererRoot, 'index.html'),
    );
    expect(resolveDesktopRendererAsset(rendererRoot, '/assets/main.js')).toBe(
      path.join(rendererRoot, 'assets/main.js'),
    );
  });

  it('rejects traversal and null bytes', () => {
    expect(() => resolveDesktopRendererAsset(rendererRoot, '/../main.js')).toThrow(
      'escapes its root',
    );
    expect(() =>
      resolveDesktopRendererAsset(rendererRoot, '/assets/../../main.js'),
    ).toThrow('escapes its root');
    expect(() => resolveDesktopRendererAsset(rendererRoot, '/asset\0.js')).toThrow(
      'null byte',
    );
  });
});
