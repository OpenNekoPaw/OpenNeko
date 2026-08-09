import type { AssistantRuntimeSettingsPort } from './assistant-runtime-settings-port';
import { ConfigManager } from './config-manager';
import type { IUserConfigManager } from './user-config';

export interface WorkspaceConfigBinding {
  readonly workspaceId: string;
  readonly workspacePath: string;
}

export interface WorkspaceConfigManagerAuthorityOptions {
  readonly userConfigManager: IUserConfigManager;
  readonly assistantRuntimeSettings: AssistantRuntimeSettingsPort;
}

export type WorkspaceConfigAuthorityErrorCode =
  | 'workspace-config-binding-invalid'
  | 'workspace-config-identity-conflict'
  | 'workspace-config-authority-disposed';

export class WorkspaceConfigAuthorityError extends Error {
  constructor(
    readonly code: WorkspaceConfigAuthorityErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'WorkspaceConfigAuthorityError';
  }
}

interface WorkspaceConfigEntry {
  readonly workspacePath: string;
  readonly config: ConfigManager;
}

export class WorkspaceConfigManagerAuthority {
  private readonly workspaceConfigs = new Map<string, WorkspaceConfigEntry>();
  private applicationConfig: ConfigManager | undefined;
  private disposed = false;

  constructor(private readonly options: WorkspaceConfigManagerAuthorityOptions) {}

  getApplicationConfig(): ConfigManager {
    this.requireActive();
    if (!this.applicationConfig) {
      this.applicationConfig = this.createConfig();
    }
    return this.applicationConfig;
  }

  getWorkspaceConfig(binding: WorkspaceConfigBinding): ConfigManager {
    this.requireActive();
    const workspaceId = requireNonEmpty(binding.workspaceId, 'Workspace identity');
    const workspacePath = requireNonEmpty(binding.workspacePath, 'Workspace path');
    const existing = this.workspaceConfigs.get(workspaceId);
    if (existing) {
      if (existing.workspacePath !== workspacePath) {
        throw new WorkspaceConfigAuthorityError(
          'workspace-config-identity-conflict',
          `Workspace '${workspaceId}' is already bound to another configuration path.`,
        );
      }
      return existing.config;
    }
    const config = this.createConfig(workspacePath);
    this.workspaceConfigs.set(workspaceId, { workspacePath, config });
    return config;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.applicationConfig?.dispose();
    this.applicationConfig = undefined;
    for (const entry of this.workspaceConfigs.values()) entry.config.dispose();
    this.workspaceConfigs.clear();
  }

  private createConfig(workspacePath?: string): ConfigManager {
    return new ConfigManager({
      userConfigManager: this.options.userConfigManager,
      assistantRuntimeSettings: this.options.assistantRuntimeSettings,
      ...(workspacePath === undefined ? {} : { workspacePath }),
    });
  }

  private requireActive(): void {
    if (this.disposed) {
      throw new WorkspaceConfigAuthorityError(
        'workspace-config-authority-disposed',
        'Workspace configuration authority is disposed.',
      );
    }
  }
}

function requireNonEmpty(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new WorkspaceConfigAuthorityError(
      'workspace-config-binding-invalid',
      `${label} must be a non-empty string.`,
    );
  }
  return value;
}
