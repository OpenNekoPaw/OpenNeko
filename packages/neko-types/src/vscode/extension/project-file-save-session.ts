import type * as vscode from 'vscode';
import {
  ProjectFileSaveSession as CoreProjectFileSaveSession,
  type ProjectFileSaveSessionOptions,
  type ProjectFileSaveSessionSaveRequest,
  type ProjectFileSaveTargetUri,
} from '../../project-file-io';
import type { ProjectFileSaveReason, ProjectFileSaveResponse } from '../../project-file-io';
import { requestWebviewProjectSnapshot } from './project-file-snapshot';

export type {
  ProjectFileSaveSessionBackupRequest,
  ProjectFileSaveSessionOptions,
  ProjectFileSaveSessionSaveRequest,
  ProjectFileSaveTargetUri,
} from '../../project-file-io';
export { formatProjectFileDiagnostics } from '../../project-file-io';

export interface ProjectFileSaveSessionSnapshotRequest<TDocument> {
  readonly webview: Pick<vscode.Webview, 'postMessage' | 'onDidReceiveMessage'>;
  readonly targetUri: ProjectFileSaveTargetUri;
  readonly saveReason: ProjectFileSaveReason;
  readonly defaultMessage: string;
  readonly sourceUri?: ProjectFileSaveTargetUri;
  readonly sourcePolicyOptions?: ProjectFileSaveSessionSaveRequest<TDocument>['sourcePolicyOptions'];
  readonly useSaveAs?: boolean;
}

export class ProjectFileSaveSession<TDocument> extends CoreProjectFileSaveSession<TDocument> {
  constructor(options: ProjectFileSaveSessionOptions<TDocument>) {
    super(options);
  }

  async saveFromWebviewSnapshot(
    request: ProjectFileSaveSessionSnapshotRequest<TDocument>,
  ): Promise<ProjectFileSaveResponse<TDocument>> {
    const document = await requestWebviewProjectSnapshot<TDocument>(request.webview, {
      formatId: this.formatId,
      saveReason: request.saveReason,
    });
    return this.save({
      targetUri: request.targetUri,
      document,
      saveReason: request.saveReason,
      defaultMessage: request.defaultMessage,
      sourceUri: request.sourceUri,
      sourcePolicyOptions: request.sourcePolicyOptions,
      useSaveAs: request.useSaveAs,
    });
  }
}
