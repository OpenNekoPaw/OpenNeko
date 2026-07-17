import * as vscode from 'vscode';
import type { IEngineMediaService } from '../contracts/IEngineMediaService';
import type { IScheduler } from '../contracts/IScheduler';
import type { IWorkspaceIO } from '../contracts/IWorkspaceIO';
import { initializeMediaLsp } from '../media-lsp';
import { MediaProbeCache } from '../media-lsp/services/MediaProbeCache';
import { MediaWorkspaceIndex } from '../media-lsp/services/MediaWorkspaceIndex';
import type { ServiceCollection } from '../base/serviceCollection';
import {
  IMediaProbeCache as IMediaProbeCacheId,
  IMediaWorkspaceIndex as IMediaWorkspaceIndexId,
} from './serviceIds';

export function bootstrapMediaLsp(
  context: vscode.ExtensionContext,
  services: ServiceCollection,
  engineMediaService: IEngineMediaService,
  workspaceIO: IWorkspaceIO,
  scheduler: IScheduler,
): void {
  const probeCache = new MediaProbeCache();
  const workspaceIndex = new MediaWorkspaceIndex(workspaceIO);

  services.set(IMediaProbeCacheId, probeCache);
  services.set(IMediaWorkspaceIndexId, workspaceIndex);

  initializeMediaLsp(context, {
    engineService: engineMediaService,
    probeCache,
    scheduler,
    workspaceIO,
    workspaceIndex,
  });
}
