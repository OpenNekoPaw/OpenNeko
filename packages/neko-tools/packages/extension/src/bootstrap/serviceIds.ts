import type { IErrorHandler, ILogger } from '@neko/shared';
import { createServiceId } from '../base/serviceCollection';
import type { IEngineMediaService as EngineMediaServiceContract } from '../contracts/IEngineMediaService';
import type { IEngineRuntimeResolver as EngineRuntimeResolverContract } from '../contracts/IEngineRuntimeResolver';
import type { IExtensionI18n as ExtensionI18nContract } from '../contracts/IExtensionI18n';
import type { IScheduler as SchedulerContract } from '../contracts/IScheduler';
import type { ITempFileService as TempFileServiceContract } from '../contracts/ITempFileService';
import type { IWorkspaceIO as WorkspaceIOContract } from '../contracts/IWorkspaceIO';
import type { IMediaDiffService as MediaDiffServiceContract } from '../media-diff/services/MediaDiffService';
import type {
  IMediaProbeCache as MediaProbeCacheContract,
  IMediaWorkspaceIndex as MediaWorkspaceIndexContract,
} from '../media-lsp/services/types';

export const IRootLogger = createServiceId<ILogger>('nekoTools.rootLogger');
export const IExtensionErrorHandler = createServiceId<IErrorHandler>(
  'nekoTools.extensionErrorHandler',
);
export const IExtensionI18n = createServiceId<ExtensionI18nContract>('nekoTools.extensionI18n');
export const IEngineRuntimeResolver = createServiceId<EngineRuntimeResolverContract>(
  'nekoTools.engineRuntimeResolver',
);
export const IEngineMediaService = createServiceId<EngineMediaServiceContract>(
  'nekoTools.engineMediaService',
);
export const IWorkspaceIO = createServiceId<WorkspaceIOContract>('nekoTools.workspaceIO');
export const IScheduler = createServiceId<SchedulerContract>('nekoTools.scheduler');
export const ITempFileService = createServiceId<TempFileServiceContract>(
  'nekoTools.tempFileService',
);
export const IMediaDiffService = createServiceId<MediaDiffServiceContract>(
  'nekoTools.mediaDiffService',
);
export const IMediaProbeCache = createServiceId<MediaProbeCacheContract>(
  'nekoTools.mediaProbeCache',
);
export const IMediaWorkspaceIndex = createServiceId<MediaWorkspaceIndexContract>(
  'nekoTools.mediaWorkspaceIndex',
);
