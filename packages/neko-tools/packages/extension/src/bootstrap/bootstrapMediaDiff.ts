import * as vscode from 'vscode';
import type { IEngineMediaService } from '../contracts/IEngineMediaService';
import type { IScheduler } from '../contracts/IScheduler';
import type { ITempFileService } from '../contracts/ITempFileService';
import type { IWorkspaceIO } from '../contracts/IWorkspaceIO';
import {
  initializeMediaDiff,
  MediaDiffService,
  AnalyzerRegistry,
  MediaDiffEditorSessionFactory,
  MediaDiffEditorProvider,
} from '../media-diff';
import { AudioDiffAnalyzer } from '../media-diff/services/analyzers/AudioDiffAnalyzer';
import { ImageDiffAnalyzer } from '../media-diff/services/analyzers/ImageDiffAnalyzer';
import { TimelineDiffAnalyzer } from '../media-diff/services/analyzers/TimelineDiffAnalyzer';
import { VideoDiffAnalyzer } from '../media-diff/services/analyzers/VideoDiffAnalyzer';
import type { ServiceCollection } from '../base/serviceCollection';
import { IMediaDiffService as IMediaDiffServiceId } from './serviceIds';

export function bootstrapMediaDiff(
  context: vscode.ExtensionContext,
  services: ServiceCollection,
  engineMediaService: IEngineMediaService,
  workspaceIO: IWorkspaceIO,
  scheduler: IScheduler,
  tempFileService: ITempFileService,
): MediaDiffEditorProvider {
  const registry = new AnalyzerRegistry();
  const diffService = new MediaDiffService(undefined, registry, workspaceIO, scheduler);
  const sessionFactory = new MediaDiffEditorSessionFactory(
    diffService,
    engineMediaService,
    scheduler,
    tempFileService,
  );

  diffService.registerAnalyzer(new ImageDiffAnalyzer(engineMediaService, tempFileService));
  diffService.registerAnalyzer(new VideoDiffAnalyzer(engineMediaService, tempFileService));
  diffService.registerAnalyzer(new AudioDiffAnalyzer(engineMediaService, tempFileService));
  diffService.registerAnalyzer(new TimelineDiffAnalyzer(engineMediaService, tempFileService));

  services.set(IMediaDiffServiceId, diffService);

  return initializeMediaDiff(context, diffService, sessionFactory);
}
