import * as vscode from 'vscode';
import {
  NEKO_WEBVIEW_KEYBOARD_EDITABLE_CONTEXT,
  NEKO_WEBVIEW_KEYBOARD_EDITABLE_QUERY_COMMAND,
  NEKO_WEBVIEW_KEYBOARD_EDITABLE_UPDATE_COMMAND,
  isWebviewKeyboardEditableOwnerUpdate,
} from '@neko/shared/vscode/extension';
import type { ILogger } from '@neko/shared';

export class WebviewKeyboardContextService implements vscode.Disposable {
  private readonly editableOwners = new Set<string>();
  private readonly commandDisposable: vscode.Disposable;
  private readonly queryCommandDisposable: vscode.Disposable;
  private contextValue = false;
  private contextSync: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor(private readonly logger: ILogger) {
    this.commandDisposable = vscode.commands.registerCommand(
      NEKO_WEBVIEW_KEYBOARD_EDITABLE_UPDATE_COMMAND,
      async (payload: unknown) => {
        if (!isWebviewKeyboardEditableOwnerUpdate(payload)) {
          this.logger.warn('Ignoring invalid Webview keyboard editable owner update');
          return;
        }

        await this.updateEditableOwner(payload.ownerId, payload.editable);
      },
    );
    this.queryCommandDisposable = vscode.commands.registerCommand(
      NEKO_WEBVIEW_KEYBOARD_EDITABLE_QUERY_COMMAND,
      () => this.hasEditableOwner(),
    );
  }

  async updateEditableOwner(ownerId: string, editable: boolean): Promise<void> {
    if (this.disposed) {
      return;
    }

    if (editable) {
      this.editableOwners.add(ownerId);
    } else {
      this.editableOwners.delete(ownerId);
    }

    await this.syncContext();
  }

  async reset(): Promise<void> {
    this.editableOwners.clear();
    await this.syncContext();
  }

  hasEditableOwner(): boolean {
    return this.editableOwners.size > 0;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.editableOwners.clear();
    this.commandDisposable.dispose();
    this.queryCommandDisposable.dispose();
    void vscode.commands.executeCommand(
      'setContext',
      NEKO_WEBVIEW_KEYBOARD_EDITABLE_CONTEXT,
      false,
    );
  }

  private async syncContext(): Promise<void> {
    const nextValue = this.editableOwners.size > 0;
    if (this.contextValue === nextValue) {
      return;
    }

    this.contextValue = nextValue;
    this.contextSync = this.contextSync
      .catch(() => undefined)
      .then(async () => {
        await vscode.commands.executeCommand(
          'setContext',
          NEKO_WEBVIEW_KEYBOARD_EDITABLE_CONTEXT,
          nextValue,
        );
      })
      .catch((error) => {
        this.logger.warn('Failed to update Webview keyboard editable context', error);
      });
    await this.contextSync;
  }
}
