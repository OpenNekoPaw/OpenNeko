import { defineConfig, type Plugin } from 'vite';

interface DesktopDevelopmentMainRestartPlugin extends Plugin {
  writeBundle(): void;
}

export function createDesktopDevelopmentMainRestartPlugin(
  command: 'build' | 'serve',
  requestRestart: () => void = requestElectronMainRestart,
): DesktopDevelopmentMainRestartPlugin {
  return {
    name: 'openneko:desktop:restart-main-after-development-build',
    writeBundle() {
      if (command === 'serve') requestRestart();
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [createDesktopDevelopmentMainRestartPlugin(command)],
  build: {
    sourcemap: true,
    rollupOptions: {
      external: ['electron', 'sharp'],
      output: {
        entryFileNames: 'main.cjs',
      },
    },
  },
}));

function requestElectronMainRestart(): void {
  process.stdin.emit('data', 'rs\n');
}
