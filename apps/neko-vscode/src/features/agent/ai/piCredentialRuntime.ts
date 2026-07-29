import { join } from 'node:path';

import {
  NodeSqliteUserCredentialPersistence,
  OpenNekoCredentialStore,
  PiProviderAuthController,
} from '@neko/agent/pi';

import { VSCodePiAuthInteraction } from './vscodePiAuthInteraction';

export interface VSCodePiCredentialRuntime {
  readonly credentials: OpenNekoCredentialStore;
  readonly auth: PiProviderAuthController;
  readonly interaction: VSCodePiAuthInteraction;
}

export function createVSCodePiCredentialRuntime(userDataRoot: string): VSCodePiCredentialRuntime {
  const credentials = new OpenNekoCredentialStore(
    NodeSqliteUserCredentialPersistence.open({ userDataRoot }),
  );
  return Object.freeze({
    credentials,
    auth: new PiProviderAuthController(credentials),
    interaction: new VSCodePiAuthInteraction(),
  });
}

export function defaultOpenNekoUserDataRoot(homeDirectory: string): string {
  return join(homeDirectory, '.neko');
}
