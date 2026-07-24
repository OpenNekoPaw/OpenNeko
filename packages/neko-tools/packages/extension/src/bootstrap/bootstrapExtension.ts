import * as vscode from 'vscode';
import type { ServiceCollection } from '../base/serviceCollection';
import { bootstrapCoreServices } from './bootstrapCoreServices';
import { bootstrapMediaDiff } from './bootstrapMediaDiff';
import { bootstrapMediaLsp } from './bootstrapMediaLsp';
import { registerNekoToolsCommands } from './registerCommands';
import { WebviewKeyboardContextService } from '../services/WebviewKeyboardContextService';

export interface INekoToolsExtensionActivation extends vscode.Disposable {
  services: ServiceCollection;
  disposeAsync(): Promise<void>;
}

export function bootstrapNekoToolsExtension(
  context: vscode.ExtensionContext,
): INekoToolsExtensionActivation {
  const coreServices = bootstrapCoreServices(context);

  const mediaDiffProvider = bootstrapMediaDiff(
    context,
    coreServices.services,
    coreServices.engineMediaService,
    coreServices.workspaceIO,
    coreServices.scheduler,
    coreServices.tempFileService,
  );
  bootstrapMediaLsp(
    context,
    coreServices.services,
    coreServices.engineMediaService,
    coreServices.workspaceIO,
    coreServices.scheduler,
  );
  registerNekoToolsCommands(context, {
    i18n: coreServices.i18n,
    errorHandler: coreServices.errorHandler,
  });
  const webviewKeyboardContextService = new WebviewKeyboardContextService(
    coreServices.logger.child('WebviewKeyboardContext'),
  );
  context.subscriptions.push(webviewKeyboardContextService);

  coreServices.logger.info('Extension activated');

  return {
    services: coreServices.services,
    async disposeAsync() {
      await mediaDiffProvider.disposeAsync();
      webviewKeyboardContextService.dispose();
      coreServices.dispose();
    },
    dispose() {
      void this.disposeAsync();
    },
  };
}
