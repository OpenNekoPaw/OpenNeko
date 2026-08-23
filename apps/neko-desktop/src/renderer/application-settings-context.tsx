import { createContext, useContext, type ReactNode } from 'react';
import type {
  DesktopApplicationPreferences,
  DesktopApplicationSettingsProjection,
} from '@neko/host/application-settings';
import type { OpenNekoDesktopAiModelSettingsBridge } from '@neko/host/ai-model-settings';
import type { OpenNekoDesktopStorageSettingsBridge } from '@neko/host/desktop-storage-settings-contract';

export interface DesktopApplicationSettingsRuntime {
  readonly projection: DesktopApplicationSettingsProjection;
  update(preferences: DesktopApplicationPreferences): Promise<void>;
  openAgentAdvanced(): Promise<void>;
  readonly aiModelSettings?: OpenNekoDesktopAiModelSettingsBridge['aiModelSettings'];
  readonly storageSettings?: OpenNekoDesktopStorageSettingsBridge['storageSettings'];
}

const DesktopApplicationSettingsContext = createContext<DesktopApplicationSettingsRuntime | null>(
  null,
);

export function DesktopApplicationSettingsProvider({
  children,
  value,
}: {
  readonly children: ReactNode;
  readonly value: DesktopApplicationSettingsRuntime;
}): JSX.Element {
  return (
    <DesktopApplicationSettingsContext.Provider value={value}>
      {children}
    </DesktopApplicationSettingsContext.Provider>
  );
}

export function useDesktopApplicationSettings(): DesktopApplicationSettingsRuntime {
  const value = useContext(DesktopApplicationSettingsContext);
  if (!value) {
    throw new Error('Desktop application settings provider is missing.');
  }
  return value;
}
