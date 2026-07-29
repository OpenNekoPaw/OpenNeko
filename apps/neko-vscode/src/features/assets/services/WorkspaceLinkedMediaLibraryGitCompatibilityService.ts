import * as vscode from 'vscode';
import { t } from '../i18n';

const GIT_CONFIGURATION_SECTION = 'git';
const GIT_ENABLED_SETTING = 'enabled';
const PROMPTED_STATE_KEY_PREFIX = 'workspace-linked-media-libraries.git-integration-prompted.v2';
const OWNERSHIP_STATE_KEY_PREFIX = 'workspace-linked-media-libraries.git-integration-ownership.v1';

interface GitSettingOwnership {
  readonly schemaVersion: 1;
  readonly status: 'pending' | 'owned';
  readonly hadExplicitWorkspaceFolderValue: boolean;
  readonly previousWorkspaceFolderValue?: boolean;
}

type WorkspaceGitCompatibilityResult =
  | 'already-disabled'
  | 'disabled'
  | 'kept-enabled'
  | 'not-selected'
  | 'not-owned'
  | 'restored'
  | 'user-value-preserved';

/** Owns the confirmed, folder-scoped VS Code Git compatibility setting for linked libraries. */
export class WorkspaceLinkedMediaLibraryGitCompatibilityService {
  private reconciliation: Promise<void> = Promise.resolve();

  constructor(
    private readonly workspaceFolder: vscode.WorkspaceFolder,
    private readonly workspaceState: vscode.Memento,
  ) {}

  async reconcile(hasLinkedMediaLibraries: boolean): Promise<WorkspaceGitCompatibilityResult> {
    const result = this.reconciliation.then(() =>
      hasLinkedMediaLibraries ? this.promptIfNeeded() : this.restoreIfOwned(),
    );
    this.reconciliation = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async promptIfNeeded(): Promise<WorkspaceGitCompatibilityResult> {
    const setting = this.inspectSetting();
    if (setting.effectiveValue === false) return 'already-disabled';
    if (this.workspaceState.get<boolean>(this.promptedStateKey(), false)) {
      return 'not-selected';
    }

    const disableAction = t('mediaLibrary.gitIntegration.disableAction');
    const keepAction = t('mediaLibrary.gitIntegration.keepAction');
    const selection = await vscode.window.showWarningMessage(
      t('mediaLibrary.gitIntegration.warning'),
      disableAction,
      keepAction,
    );

    if (selection !== disableAction) {
      await this.workspaceState.update(this.promptedStateKey(), true);
      return selection === keepAction ? 'kept-enabled' : 'not-selected';
    }

    await this.disable(setting);
    await this.workspaceState.update(this.promptedStateKey(), true);
    await vscode.window.showInformationMessage(t('mediaLibrary.gitIntegration.disabled'));
    return 'disabled';
  }

  private async disable(setting: InspectedGitSetting): Promise<void> {
    const previousValue = setting.inspection.workspaceFolderValue;
    const pending: GitSettingOwnership = {
      schemaVersion: 1,
      status: 'pending',
      hadExplicitWorkspaceFolderValue: previousValue !== undefined,
      ...(previousValue !== undefined ? { previousWorkspaceFolderValue: previousValue } : {}),
    };
    await this.workspaceState.update(this.ownershipStateKey(), pending);
    try {
      await setting.configuration.update(
        GIT_ENABLED_SETTING,
        false,
        vscode.ConfigurationTarget.WorkspaceFolder,
      );
    } catch (error) {
      await this.workspaceState.update(this.ownershipStateKey(), undefined);
      throw error;
    }
    await this.workspaceState.update(this.ownershipStateKey(), {
      ...pending,
      status: 'owned',
    } satisfies GitSettingOwnership);
  }

  private async restoreIfOwned(): Promise<WorkspaceGitCompatibilityResult> {
    const ownership = this.readOwnership();
    await this.workspaceState.update(this.promptedStateKey(), undefined);
    if (!ownership) return 'not-owned';

    const setting = this.inspectSetting();
    if (setting.inspection.workspaceFolderValue !== false) {
      await this.workspaceState.update(this.ownershipStateKey(), undefined);
      return 'user-value-preserved';
    }

    await setting.configuration.update(
      GIT_ENABLED_SETTING,
      ownership.hadExplicitWorkspaceFolderValue
        ? ownership.previousWorkspaceFolderValue
        : undefined,
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
    await this.workspaceState.update(this.ownershipStateKey(), undefined);
    return 'restored';
  }

  private inspectSetting(): InspectedGitSetting {
    const configuration = vscode.workspace.getConfiguration(
      GIT_CONFIGURATION_SECTION,
      this.workspaceFolder.uri,
    );
    const inspection = configuration.inspect<boolean>(GIT_ENABLED_SETTING);
    if (!inspection) {
      throw new Error('VS Code setting "git.enabled" is not registered.');
    }
    return {
      configuration,
      inspection,
      effectiveValue: configuration.get<boolean>(GIT_ENABLED_SETTING),
    };
  }

  private readOwnership(): GitSettingOwnership | undefined {
    const value = this.workspaceState.get<unknown>(this.ownershipStateKey());
    if (value === undefined) return undefined;
    if (isGitSettingOwnership(value)) return value;
    throw new Error('Invalid linked Media Library Git compatibility ownership state.');
  }

  private promptedStateKey(): string {
    return `${PROMPTED_STATE_KEY_PREFIX}:${this.workspaceFolder.uri.toString()}`;
  }

  private ownershipStateKey(): string {
    return `${OWNERSHIP_STATE_KEY_PREFIX}:${this.workspaceFolder.uri.toString()}`;
  }
}

interface InspectedGitSetting {
  readonly configuration: vscode.WorkspaceConfiguration;
  readonly inspection: { readonly workspaceFolderValue?: boolean };
  readonly effectiveValue: boolean | undefined;
}

function isGitSettingOwnership(value: unknown): value is GitSettingOwnership {
  if (typeof value !== 'object' || value === null) return false;
  const schemaVersion = Reflect.get(value, 'schemaVersion');
  const status = Reflect.get(value, 'status');
  const hadExplicitWorkspaceFolderValue = Reflect.get(value, 'hadExplicitWorkspaceFolderValue');
  const previousWorkspaceFolderValue = Reflect.get(value, 'previousWorkspaceFolderValue');
  if (
    schemaVersion !== 1 ||
    (status !== 'pending' && status !== 'owned') ||
    typeof hadExplicitWorkspaceFolderValue !== 'boolean'
  ) {
    return false;
  }
  return hadExplicitWorkspaceFolderValue
    ? typeof previousWorkspaceFolderValue === 'boolean'
    : previousWorkspaceFolderValue === undefined;
}
