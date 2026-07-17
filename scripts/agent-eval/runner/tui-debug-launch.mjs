import process from 'node:process';

export const CANONICAL_TUI_EXECUTABLE = 'apps/neko-tui/dist/main.js';

export function resolveTuiDebugLaunch(options = {}) {
  const hasConfiguredCommand = options.debugCommand !== undefined;
  return {
    command: options.debugCommand ?? process.execPath,
    argsPrefix:
      options.debugCommandArgsPrefix ?? (hasConfiguredCommand ? [] : [CANONICAL_TUI_EXECUTABLE]),
    shell: hasConfiguredCommand,
  };
}
