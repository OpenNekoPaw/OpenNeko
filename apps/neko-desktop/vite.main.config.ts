import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import {
  listDshDevelopmentInputFiles,
  prepareDshDevelopmentRuntime,
  resolveDshDevelopmentRuntimeRoot,
} from '../../scripts/prepare-dsh-development-runtime.mjs';

interface DesktopDevelopmentWatchContext {
  addWatchFile(path: string): void;
}

type DesktopDevelopmentMainRestartPlugin = Plugin & {
  buildStart(this: DesktopDevelopmentWatchContext): void;
  watchChange(path: string): void;
  writeBundle(): void;
};

export function createDesktopDevelopmentMainRestartPlugin(
  command: 'build' | 'serve',
  requestRestart: () => void = requestElectronMainRestart,
  runtime: {
    readonly inputFiles: readonly string[];
    prepare(): void;
  } = {
    inputFiles: listDshDevelopmentInputFiles(),
    prepare: refreshDesktopDevelopmentDshRuntime,
  },
): DesktopDevelopmentMainRestartPlugin {
  const runtimeInputs = new Set(runtime.inputFiles);
  let runtimeChanged = false;
  return {
    name: 'openneko:desktop:restart-main-after-development-build',
    buildStart(this: DesktopDevelopmentWatchContext) {
      if (command !== 'serve') return;
      for (const path of runtime.inputFiles) this.addWatchFile(path);
    },
    watchChange(path: string) {
      if (runtimeInputs.has(path)) runtimeChanged = true;
    },
    writeBundle() {
      if (command !== 'serve') return;
      if (runtimeChanged) {
        runtime.prepare();
        runtimeChanged = false;
      }
      requestRestart();
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

function refreshDesktopDevelopmentDshRuntime(): void {
  const appRoot = fileURLToPath(new URL('.', import.meta.url));
  const configuredRoot = process.env['NEKO_DSH_RUNTIME_ROOT'];
  if (configuredRoot === undefined) {
    throw new Error('Desktop development DSH runtime root is unavailable during Main rebuild.');
  }
  const generatedRoot = resolveDshDevelopmentRuntimeRoot(appRoot);
  if (realpathSync(configuredRoot) !== realpathSync(generatedRoot)) {
    throw new Error(
      'An explicitly configured DSH runtime cannot be replaced after source changes; restart with a matching qualified closure.',
    );
  }
  prepareDshDevelopmentRuntime({ appRoot, runtimeRoot: generatedRoot });
}
