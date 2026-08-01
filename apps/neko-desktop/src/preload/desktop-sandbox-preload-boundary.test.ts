import { describe, expect, it } from 'vitest';
import { assertSandboxPreloadBundle } from '../../vite.preload.config';

describe('Desktop sandbox preload bundle boundary', () => {
  it('rejects Node builtins that Electron sandbox preload cannot load', () => {
    expect(() => assertSandboxPreloadBundle('const crypto = require("node:crypto");')).toThrow(
      'unsupported Node builtin require("node:crypto")',
    );
  });

  it('accepts the Electron-only preload runtime boundary', () => {
    expect(() => assertSandboxPreloadBundle('const electron = require("electron");')).not.toThrow();
  });
});
