import type { Plugin } from 'vite';

export interface DesktopDevelopmentRestartPlugin extends Plugin {
  writeBundle(): void;
}

export function createDesktopDevelopmentRestartPlugin(
  command: 'build' | 'serve',
  requestRestart: () => void = requestElectronMainRestart,
): DesktopDevelopmentRestartPlugin {
  return {
    name: 'openneko:desktop:restart-main-after-development-build',
    writeBundle() {
      if (command === 'serve') requestRestart();
    },
  };
}

function requestElectronMainRestart(): void {
  process.stdin.emit('data', 'rs\n');
}
