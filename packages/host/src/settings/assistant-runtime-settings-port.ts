import type { AssistantSettingsSnapshot } from './assistant-config';

export interface AssistantRuntimeSettingsDiagnostic {
  readonly authority: string;
  readonly message: string;
}

export interface AssistantRuntimeSettingsPort {
  snapshot(): Readonly<Partial<AssistantSettingsSnapshot>>;
  commit(settings: Readonly<Partial<AssistantSettingsSnapshot>>): Promise<void>;
  reset(): Promise<void>;
  diagnostic(): AssistantRuntimeSettingsDiagnostic | undefined;
}
