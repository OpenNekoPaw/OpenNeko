import { createContext, useContext, type ReactNode } from 'react';
import type {
  DesktopApplicationPreferences,
  DesktopApplicationSettingsProjection,
} from '@neko/host/application-settings';

export interface DesktopApplicationSettingsRuntime {
  readonly projection: DesktopApplicationSettingsProjection;
  update(preferences: DesktopApplicationPreferences): Promise<void>;
  openAgentAdvanced(): Promise<void>;
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
