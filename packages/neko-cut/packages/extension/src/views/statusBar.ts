import * as vscode from 'vscode';
import type { CutExportTaskSnapshot } from '@neko-cut/domain';
import { StatusBarGroup } from '@neko/shared/vscode/extension';
import { projectCutExportStatus } from './cutExportStatusProjection';
import {
  formatCutDocumentStatus,
  type CutDocumentStatusSnapshot,
} from './cutDocumentStatusProjection';

export const OPEN_CUT_EXPORT_TASK_COMMAND = 'neko.cut.openExportTask';
export const OPEN_CUT_DOCUMENT_STATUS_COMMAND = 'neko.cut.openStatusDocument';

const EXPORT_STATUS_ITEM_ID = 'neko.cut.exportStatus';
const DOCUMENT_STATUS_ITEM_ID = 'neko.cut.documentStatus';

export class StatusBar implements vscode.Disposable {
  private readonly group = new StatusBarGroup([
    {
      id: EXPORT_STATUS_ITEM_ID,
      alignment: vscode.StatusBarAlignment.Right,
      priority: 200,
      name: vscode.l10n.t('Neko Cut Export'),
      command: OPEN_CUT_EXPORT_TASK_COMMAND,
      visible: 'conditional',
    },
    {
      id: DOCUMENT_STATUS_ITEM_ID,
      alignment: vscode.StatusBarAlignment.Left,
      priority: 100,
      name: vscode.l10n.t('Neko Cut Document'),
      command: OPEN_CUT_DOCUMENT_STATUS_COMMAND,
      visible: 'conditional',
    },
  ]);
  private readonly tasks = new Map<string, CutExportTaskSnapshot>();
  private exportTargetDocumentUri: string | undefined;
  private documentTarget: { readonly documentUri: string; readonly sessionId: string } | undefined;

  constructor() {
    this.group.show();
  }

  update(task: CutExportTaskSnapshot): void {
    this.tasks.set(task.jobId, task);
    const projection = projectCutExportStatus([...this.tasks.values()], {
      runningText: (label) => vscode.l10n.t('Cut: {0}', label),
      runningCount: (count) => vscode.l10n.t('{0} exports', count),
      exporting: (path) => vscode.l10n.t('Exporting {0}', path),
      completedText: (name) => vscode.l10n.t('Cut: {0}', name),
      completed: (path) => vscode.l10n.t('Export completed: {0}', path),
      failedText: vscode.l10n.t('Cut export failed'),
      failed: (path) => vscode.l10n.t('Export failed: {0}', path),
      cancelledText: vscode.l10n.t('Cut export cancelled'),
      cancelled: (path) => vscode.l10n.t('Export cancelled: {0}', path),
    });
    this.exportTargetDocumentUri = projection.documentUri;
    this.group.update(EXPORT_STATUS_ITEM_ID, projection.text, projection.tooltip);
    const item = this.group.get(EXPORT_STATUS_ITEM_ID);
    if (!item) throw new Error('Cut export status item was not created.');
    item.backgroundColor = statusBackground(projection.tone);
    this.group.setVisible(EXPORT_STATUS_ITEM_ID, projection.visible);
  }

  updateDocument(snapshot: CutDocumentStatusSnapshot | undefined): void {
    if (!snapshot) {
      this.documentTarget = undefined;
      this.group.setVisible(DOCUMENT_STATUS_ITEM_ID, false);
      return;
    }
    this.documentTarget = {
      documentUri: snapshot.documentUri,
      sessionId: snapshot.sessionId,
    };
    const projection = formatCutDocumentStatus(snapshot, {
      clips: (count) => vscode.l10n.t('{0} Clips', count),
      tracks: (count) => vscode.l10n.t('{0} Tracks', count),
      duration: (value) => vscode.l10n.t('Duration: {0}', value),
      dirty: vscode.l10n.t('Unsaved changes'),
    });
    this.group.update(DOCUMENT_STATUS_ITEM_ID, projection.text, projection.tooltip);
    this.group.setVisible(DOCUMENT_STATUS_ITEM_ID, true);
  }

  async openCurrentTaskDocument(): Promise<void> {
    if (!this.exportTargetDocumentUri) {
      throw new Error('No Cut export task is available for status-bar navigation.');
    }
    await vscode.commands.executeCommand(
      'vscode.openWith',
      vscode.Uri.parse(this.exportTargetDocumentUri),
      'neko.cut.otioEditor',
    );
  }

  async openCurrentDocument(): Promise<void> {
    if (!this.documentTarget) {
      throw new Error('No active Cut document is available for status-bar navigation.');
    }
    await vscode.commands.executeCommand(
      'vscode.openWith',
      vscode.Uri.parse(this.documentTarget.documentUri),
      'neko.cut.otioEditor',
    );
  }

  dispose(): void {
    this.group.dispose();
    this.tasks.clear();
  }
}

function statusBackground(
  tone: import('./cutExportStatusProjection').CutExportStatusTone,
): vscode.ThemeColor | undefined {
  switch (tone) {
    case 'warning':
      return new vscode.ThemeColor('statusBarItem.warningBackground');
    case 'error':
      return new vscode.ThemeColor('statusBarItem.errorBackground');
    case 'neutral':
      return undefined;
  }
}
