import * as vscode from 'vscode';
import type { IErrorHandler, ILogger, VariantComparisonResult } from '@neko/shared';
import {
  createVSCodeLogger,
  VSCodeErrorHandler,
  resolveLogLevelSetting,
  watchLogLevel,
} from '@neko/shared/vscode/extension';
import {
  clearGlobalServices,
  ServiceCollection,
  setGlobalServices,
} from '../base/serviceCollection';
import type { IAssetEntityReader } from '../contracts/IAssetEntityReader';
import type { IEngineMediaService } from '../contracts/IEngineMediaService';
import type { IEngineRuntimeResolver } from '../contracts/IEngineRuntimeResolver';
import type { IExtensionI18n } from '../contracts/IExtensionI18n';
import type { IScheduler } from '../contracts/IScheduler';
import type { ITempFileService } from '../contracts/ITempFileService';
import type { IVariantComparisonService } from '../contracts/IVariantComparisonService';
import type { IWorkspaceIO } from '../contracts/IWorkspaceIO';
import { EngineMediaService } from '../services/EngineMediaService';
import { VSCodeEngineRuntimeResolver } from '../services/EngineRuntimeResolver';
import { DefaultScheduler } from '../services/Scheduler';
import { DefaultTempFileService } from '../services/TempFileService';
import { VSCodeAssetEntityReader } from '../services/VSCodeAssetEntityReader';
import { VSCodeWorkspaceIO } from '../services/WorkspaceIO';
import { setErrorHandler } from '../utils/errorHandler';
import { setRootLogger } from '../utils/logger';
import {
  IAssetEntityReader as IAssetEntityReaderId,
  IEngineMediaService as IEngineMediaServiceId,
  IEngineRuntimeResolver as IEngineRuntimeResolverId,
  IExtensionErrorHandler,
  IExtensionI18n as IExtensionI18nId,
  IScheduler as ISchedulerId,
  ITempFileService as ITempFileServiceId,
  IWorkspaceIO as IWorkspaceIOId,
  IRootLogger,
  IVariantComparisonService as IVariantComparisonServiceId,
} from './serviceIds';

export interface ICoreServicesBootstrapResult extends vscode.Disposable {
  services: ServiceCollection;
  logger: ILogger;
  errorHandler: IErrorHandler;
  i18n: IExtensionI18n;
  engineRuntimeResolver: IEngineRuntimeResolver;
  engineMediaService: IEngineMediaService;
  workspaceIO: IWorkspaceIO;
  scheduler: IScheduler;
  tempFileService: ITempFileService;
  assetEntityReader: IAssetEntityReader;
  variantComparisonService: IVariantComparisonService;
}

class VscodeExtensionI18n implements IExtensionI18n {
  t(key: string, ...args: Array<string | number | boolean>): string {
    return vscode.l10n.t(key, ...args);
  }
}

class VscodeCommandVariantComparisonService implements IVariantComparisonService {
  async compare(
    entityId: string,
    variantIdA: string,
    variantIdB: string,
  ): Promise<VariantComparisonResult> {
    try {
      const result = await vscode.commands.executeCommand<VariantComparisonResult>(
        'neko.assets.compareVariants',
        entityId,
        variantIdA,
        variantIdB,
      );

      return result ?? createEmptyVariantComparisonResult(entityId, variantIdA, variantIdB);
    } catch {
      return createEmptyVariantComparisonResult(entityId, variantIdA, variantIdB);
    }
  }
}

function createEmptyVariantComparisonResult(
  entityId: string,
  variantIdA: string,
  variantIdB: string,
): VariantComparisonResult {
  return {
    entityId,
    variantA: { id: variantIdA, name: variantIdA },
    variantB: { id: variantIdB, name: variantIdB },
    attributeDiffs: [],
    fileDiffs: [],
  };
}

export function bootstrapCoreServices(
  context: vscode.ExtensionContext,
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
  const engineRuntimeResolver = new VSCodeEngineRuntimeResolver();
  const engineMediaService = new EngineMediaService(engineRuntimeResolver);
  const workspaceIO = new VSCodeWorkspaceIO();
  const scheduler = new DefaultScheduler();
  const tempFileService = new DefaultTempFileService(
    vscode.Uri.joinPath(context.globalStorageUri, 'temp', 'media-diff').fsPath,
  );
  const assetEntityReader = new VSCodeAssetEntityReader();
  const variantComparisonService = new VscodeCommandVariantComparisonService();

  setRootLogger(logger);
  setErrorHandler(errorHandler);

  services.set(IRootLogger, logger);
  services.set(IExtensionErrorHandler, errorHandler);
  services.set(IExtensionI18nId, i18n);
  services.set(IEngineRuntimeResolverId, engineRuntimeResolver);
  services.set(IEngineMediaServiceId, engineMediaService);
  services.set(IWorkspaceIOId, workspaceIO);
  services.set(ISchedulerId, scheduler);
  services.set(ITempFileServiceId, tempFileService);
  services.set(IAssetEntityReaderId, assetEntityReader);
  services.set(IVariantComparisonServiceId, variantComparisonService);
  setGlobalServices(services);

  logger.info('Activating extension...');

  return {
    services,
    logger,
    errorHandler,
    i18n,
    engineRuntimeResolver,
    engineMediaService,
    workspaceIO,
    scheduler,
    tempFileService,
    assetEntityReader,
    variantComparisonService,
    dispose() {
      clearGlobalServices();
      services.dispose();
    },
  };
}
