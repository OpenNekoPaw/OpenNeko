import type { FeatureRuntimeContext } from '../../../feature-runtime-context';
import * as vscode from 'vscode';
import type { IErrorHandler, ILogger } from '@neko/shared';
import {
  createVSCodeLogger,
  VSCodeErrorHandler,
  resolveLogLevelSetting,
  watchLogLevel,
} from '@neko/shared/vscode/extension';
import { ServiceCollection } from '../base/serviceCollection';
import type { IMediaRuntimeService } from '../contracts/IMediaRuntimeService';
import type { IExtensionI18n } from '../contracts/IExtensionI18n';
import type { IScheduler } from '../contracts/IScheduler';
import type { ITempFileService } from '../contracts/ITempFileService';
import type { IWorkspaceIO } from '../contracts/IWorkspaceIO';
import { NodeMediaRuntimeService } from '../services/NodeMediaRuntimeService';
import { DefaultScheduler } from '../services/Scheduler';
import { DefaultTempFileService } from '../services/TempFileService';
import { VSCodeWorkspaceIO } from '../services/WorkspaceIO';
import { setErrorHandler } from '../utils/errorHandler';
import { setRootLogger } from '../utils/logger';
import {
  IMediaRuntimeService as IMediaRuntimeServiceId,
  IExtensionErrorHandler,
  IExtensionI18n as IExtensionI18nId,
  IScheduler as ISchedulerId,
  ITempFileService as ITempFileServiceId,
  IWorkspaceIO as IWorkspaceIOId,
  IRootLogger,
} from './serviceIds';

export interface ICoreServicesBootstrapResult extends vscode.Disposable {
  services: ServiceCollection;
  logger: ILogger;
  errorHandler: IErrorHandler;
  i18n: IExtensionI18n;
  mediaRuntimeService: IMediaRuntimeService;
  workspaceIO: IWorkspaceIO;
  scheduler: IScheduler;
  tempFileService: ITempFileService;
}

class VscodeExtensionI18n implements IExtensionI18n {
  t(key: string, ...args: Array<string | number | boolean>): string {
    return vscode.l10n.t(key, ...args);
  }
}

export function bootstrapCoreServices(
  context: FeatureRuntimeContext,
): ICoreServicesBootstrapResult {
  const services = new ServiceCollection();
  const logger = createVSCodeLogger(
    'Neko Tools',
    'NekoTools',
    context,
    resolveLogLevelSetting(context.extensionMode),
  );
  watchLogLevel(logger, context);
  const errorHandler = new VSCodeErrorHandler(logger);
  const i18n = new VscodeExtensionI18n();
  const mediaRuntimeService = new NodeMediaRuntimeService();
  const workspaceIO = new VSCodeWorkspaceIO();
  const scheduler = new DefaultScheduler();
  const tempFileService = new DefaultTempFileService(
    vscode.Uri.joinPath(context.globalStorageUri, 'temp', 'media-diff').fsPath,
  );

  setRootLogger(logger);
  setErrorHandler(errorHandler);

  services.set(IRootLogger, logger);
  services.set(IExtensionErrorHandler, errorHandler);
  services.set(IExtensionI18nId, i18n);
  services.set(IMediaRuntimeServiceId, mediaRuntimeService);
  services.set(IWorkspaceIOId, workspaceIO);
  services.set(ISchedulerId, scheduler);
  services.set(ITempFileServiceId, tempFileService);
  logger.info('Activating extension...');

  return {
    services,
    logger,
    errorHandler,
    i18n,
    mediaRuntimeService,
    workspaceIO,
    scheduler,
    tempFileService,
    dispose() {
      void mediaRuntimeService.runtime.dispose();
      services.dispose();
    },
  };
}
