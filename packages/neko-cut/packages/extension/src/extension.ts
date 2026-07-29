import * as vscode from 'vscode';
import {
  createVSCodeLogger,
  resolveLogLevelSetting,
  VSCodeErrorHandler,
  watchLogLevel,
} from '@neko/shared/vscode/extension';
import type { LocalMetadataStore, NekoCutAPI } from '@neko/shared';
import { getRootLogger, setErrorHandler, setRootLogger } from './base';
import { CutOtioEditorProvider, createNewOtioProject } from './editor/CutOtioEditorProvider';
import { OPEN_CUT_DOCUMENT_STATUS_COMMAND, OPEN_CUT_EXPORT_TASK_COMMAND, StatusBar } from './views';
import {
  createInMemoryExportJobStore,
  createPersistentExportJobStore,
  EXPORT_JOB_MIGRATIONS,
  type ExportJobStore,
} from '@neko-cut/node';

export interface NekoCutHostServices {
  readonly localMetadata?: {
    readonly metadataStore: LocalMetadataStore;
    readonly workspaceId: string;
  };
}

let activeEditorProvider: CutOtioEditorProvider | undefined;

export async function activate(
  context: vscode.ExtensionContext,
  hostServices?: NekoCutHostServices,
): Promise<NekoCutAPI> {
  const logger = createVSCodeLogger(
    'Neko Cut',
    'NekoCut',
    context,
    resolveLogLevelSetting(context.extensionMode),
  );
  setRootLogger(logger);
  setErrorHandler(new VSCodeErrorHandler(logger));
  watchLogLevel(logger, context);

  const exportStatusBar = new StatusBar();
  const exportJobStore = await createCutExportJobStore(hostServices?.localMetadata);
  const editorProvider = new CutOtioEditorProvider(
    context,
    {
      onExportTaskUpdate: (task) => exportStatusBar.update(task),
      onDocumentStatusUpdate: (snapshot) => exportStatusBar.updateDocument(snapshot),
    },
    {
      store: exportJobStore,
    },
  );
  activeEditorProvider = editorProvider;
  await editorProvider.recoverExportJobs();
  context.subscriptions.push(
    exportStatusBar,
    { dispose: () => void editorProvider.dispose() },
    vscode.window.registerCustomEditorProvider('neko.cut.otioEditor', editorProvider, {
      supportsMultipleEditorsPerDocument: true,
      webviewOptions: { retainContextWhenHidden: false },
    }),
    vscode.commands.registerCommand(OPEN_CUT_EXPORT_TASK_COMMAND, () =>
      exportStatusBar.openCurrentTaskDocument(),
    ),
    vscode.commands.registerCommand(OPEN_CUT_DOCUMENT_STATUS_COMMAND, () =>
      exportStatusBar.openCurrentDocument(),
    ),
    vscode.commands.registerCommand('neko.cut.newProject', () => createNewOtioProject()),
    vscode.commands.registerCommand('neko.cut.previewMedia', async (uri?: vscode.Uri) => {
      if (!uri) return;

      const extension = uri.fsPath.split('.').pop()?.toLowerCase() ?? '';
      const videoExtensions = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'ts', 'flv', 'wmv'];
      const audioExtensions = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus'];

      if (videoExtensions.includes(extension)) {
        await vscode.commands.executeCommand('vscode.openWith', uri, 'neko.videoPreview');
      } else if (audioExtensions.includes(extension)) {
        await vscode.commands.executeCommand('vscode.openWith', uri, 'neko.audioPreview');
      }
    }),
  );

  logger.info('OTIO Cut editor registered.');
  return {
    status: 'ready',
    routes: { handoff: (request) => editorProvider.handoffRoute(request) },
  };
}

export async function deactivate(): Promise<void> {
  getRootLogger().info('Deactivating extension...');
  const provider = activeEditorProvider;
  activeEditorProvider = undefined;
  await provider?.dispose();
}

async function createCutExportJobStore(
  localMetadata: NekoCutHostServices['localMetadata'],
): Promise<ExportJobStore> {
  if (!localMetadata) return createInMemoryExportJobStore();
  await localMetadata.metadataStore.migrateNamespace(EXPORT_JOB_MIGRATIONS);
  return createPersistentExportJobStore(localMetadata);
}
