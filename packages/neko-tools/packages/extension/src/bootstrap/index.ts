export type { ICoreServicesBootstrapResult } from './bootstrapCoreServices';
export { bootstrapCoreServices } from './bootstrapCoreServices';
export type { INekoToolsExtensionActivation } from './bootstrapExtension';
export { bootstrapNekoToolsExtension } from './bootstrapExtension';
export { bootstrapMediaDiff } from './bootstrapMediaDiff';
export {
  IMediaRuntimeService,
  IExtensionErrorHandler,
  IExtensionI18n,
  IScheduler,
  ITempFileService,
  IMediaDiffService,
  IWorkspaceIO,
  IRootLogger,
} from './serviceIds';
