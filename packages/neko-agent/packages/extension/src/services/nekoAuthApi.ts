import * as vscode from 'vscode';

import { NEKO_AUTH_EXTENSION_ID } from '@neko/agent/runtime';
import type { AccountAiCatalogSnapshot, IAuthSession } from '@neko/shared';

/** Minimal inter-extension contract owned by the OpenNeko product auth extension. */
export interface NekoAuthAPI {
  getSession(): Promise<IAuthSession | null>;
  login(options?: { force?: boolean }): Promise<IAuthSession>;
  logout(): Promise<void>;
  getAccountAiCatalog(options?: {
    forceRefresh?: boolean;
  }): Promise<AccountAiCatalogSnapshot | null>;
  onDidChangeSession: (listener: (session: IAuthSession | null) => void) => { dispose(): void };
}

export async function getNekoAuthAPI(): Promise<NekoAuthAPI | undefined> {
  const extension = vscode.extensions.getExtension<NekoAuthAPI>(NEKO_AUTH_EXTENSION_ID);
  if (!extension) return undefined;
  await extension.activate();
  return extension.exports;
}
