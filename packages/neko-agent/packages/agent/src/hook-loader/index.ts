/**
 * Hook Loader Module
 *
 * Provides settings-based shell hooks from .neko/settings.json.
 *
 * @example Settings-based hooks
 * ```typescript
 * import { SettingsHookLoader } from '@neko/agent';
 *
 * const loader = new SettingsHookLoader({
 *   fs: nodeFileSystem,
 *   shell: shellExecutor,
 * });
 *
 * await loader.loadFromSettings('.neko', '~/.neko/settings.json');
 * const result = await loader.executePreToolUse('Bash', { command: 'ls' });
 * ```
 */

export type {
  SettingsHookLoaderOptions,
  ISettingsFileSystem,
  IShellExecutor,
  LoadedSettingsHook,
  SettingsHookLoadResult,
  HookExecutionResult,
} from './settings-hook-loader';

export { SettingsHookLoader, createSettingsHookLoader } from './settings-hook-loader';
