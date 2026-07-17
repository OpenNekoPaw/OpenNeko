import process from 'node:process';
import { describe, expect, it } from 'vitest';
import { CANONICAL_TUI_EXECUTABLE, resolveTuiDebugLaunch } from './tui-debug-launch.mjs';

describe('canonical TUI debug launch contract', () => {
  it('launches the canonical app executable directly through Node by default', () => {
    expect(resolveTuiDebugLaunch()).toEqual({
      command: process.execPath,
      argsPrefix: [CANONICAL_TUI_EXECUTABLE],
      shell: false,
    });
    expect(CANONICAL_TUI_EXECUTABLE).toBe('apps/neko-tui/dist/main.js');
  });

  it('preserves an explicit debug command without injecting the app executable', () => {
    expect(resolveTuiDebugLaunch({ debugCommand: 'custom-neko-debug' })).toEqual({
      command: 'custom-neko-debug',
      argsPrefix: [],
      shell: true,
    });
  });

  it('uses an explicit executable prefix for isolated implementation targets', () => {
    expect(
      resolveTuiDebugLaunch({ debugCommandArgsPrefix: ['/tmp/variant/dist/main.js'] }),
    ).toEqual({
      command: process.execPath,
      argsPrefix: ['/tmp/variant/dist/main.js'],
      shell: false,
    });
  });
});
