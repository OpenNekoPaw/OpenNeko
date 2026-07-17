import * as vscode from 'vscode';
import {
  bootstrapNekoToolsExtension,
  type INekoToolsExtensionActivation,
} from '../packages/extension/src/bootstrap';

let activation: INekoToolsExtensionActivation | undefined;

export function activate(context: vscode.ExtensionContext): void {
  activation = bootstrapNekoToolsExtension(context);
}

export async function deactivate(): Promise<void> {
  const currentActivation = activation;
  activation = undefined;

  if (!currentActivation) {
    return;
  }

  await currentActivation.disposeAsync();
}
