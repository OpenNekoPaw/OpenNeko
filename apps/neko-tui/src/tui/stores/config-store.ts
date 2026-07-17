/**
 * Config Store
 *
 * Bridges CLIConfig into reactive Zustand state.
 * Delegates all loading and saving to the TUI configuration owner.
 */

import { createStore, type StateCreator, type StoreApi } from 'zustand/vanilla';
import type { CLIConfig } from '../core/types';
import { DEFAULT_CLI_CONFIG } from '../core/types';

export interface ConfigSlice {
  readonly config: CLIConfig;

  setConfig: (updates: Partial<CLIConfig>) => void;
  replaceConfig: (config: CLIConfig) => void;
}

export type ConfigStore = StoreApi<ConfigSlice>;

export function createConfigStore(
  initialConfig: CLIConfig = DEFAULT_CLI_CONFIG,
  assertMutable: () => void = () => undefined,
): ConfigStore {
  return createStore<ConfigSlice>(createConfigState(initialConfig, assertMutable));
}

function createConfigState(
  initialConfig: CLIConfig,
  assertMutable: () => void,
): StateCreator<ConfigSlice> {
  return (set) => {
    const update = (
      next:
        | ConfigSlice
        | Partial<ConfigSlice>
        | ((state: ConfigSlice) => ConfigSlice | Partial<ConfigSlice>),
    ): void => {
      assertMutable();
      set(next);
    };

    return {
      config: { ...initialConfig },

      setConfig: (updates) => {
        update((state) => ({
          config: { ...state.config, ...updates },
        }));
      },

      replaceConfig: (config) => {
        update({ config: { ...config } });
      },
    };
  };
}
