import * as vscode from 'vscode';
import type { IMediaRuntimeService } from '../contracts/IMediaRuntimeService';
import type { IScheduler } from '../contracts/IScheduler';
import type { ITempFileService } from '../contracts/ITempFileService';
import type { IWorkspaceIO } from '../contracts/IWorkspaceIO';
import {
  initializeMediaDiff,
  MediaDiffService,
  MediaDiffEditorSessionFactory,
  MediaDiffEditorProvider,
} from '../media-diff';
import type { ServiceCollection } from '../base/serviceCollection';
import { IMediaDiffService as IMediaDiffServiceId } from './serviceIds';

export function bootstrapMediaDiff(
  context: vscode.ExtensionContext,
  services: ServiceCollection,
  mediaRuntimeService: IMediaRuntimeService,
  workspaceIO: IWorkspaceIO,
  scheduler: IScheduler,
  tempFileService: ITempFileService,
): MediaDiffEditorProvider {
  const diffService = new MediaDiffService(
    undefined,
    mediaRuntimeService,
    workspaceIO,
    scheduler,
    tempFileService,
  );
  const sessionFactory = new MediaDiffEditorSessionFactory(
    diffService,
    mediaRuntimeService,
    scheduler,
    tempFileService,
  );

  services.set(IMediaDiffServiceId, diffService);

  return initializeMediaDiff(context, diffService, sessionFactory);
}
