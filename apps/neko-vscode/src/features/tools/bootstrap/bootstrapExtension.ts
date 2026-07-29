import type { FeatureRuntimeContext } from '../../../feature-runtime-context';
import { bootstrapCoreServices } from './bootstrapCoreServices';
import { bootstrapMediaDiff } from './bootstrapMediaDiff';
import { registerNekoToolsCommands } from './registerCommands';
import { WebviewKeyboardContextService } from '../services/WebviewKeyboardContextService';

export interface NekoToolsFeatureActivation {
  dispose(): Promise<void>;
}

export function bootstrapNekoToolsExtension(
  context: FeatureRuntimeContext,
): NekoToolsFeatureActivation {
  const coreServices = bootstrapCoreServices(context);

  const mediaDiffProvider = bootstrapMediaDiff(
    context,
    coreServices.services,
    coreServices.mediaRuntimeService,
    coreServices.workspaceIO,
    coreServices.scheduler,
    coreServices.tempFileService,
  );
  registerNekoToolsCommands(context, {
    i18n: coreServices.i18n,
    errorHandler: coreServices.errorHandler,
    mediaRuntimeService: coreServices.mediaRuntimeService,
  });
  const webviewKeyboardContextService = new WebviewKeyboardContextService(
    coreServices.logger.child('WebviewKeyboardContext'),
  );
  context.subscriptions.push(webviewKeyboardContextService);

  coreServices.logger.info('Extension activated');

  return {
    async dispose() {
      await mediaDiffProvider.disposeAsync();
      webviewKeyboardContextService.dispose();
      coreServices.dispose();
    },
  };
}
