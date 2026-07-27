/**
 * Neko Preview Extension
 *
 * Lightweight media preview for video and audio files,
 * powered by the local Node/FFmpeg media runtime.
 *
 * Architecture:
 * extension.ts → VideoPreviewProvider / AudioPreviewProvider
 *   → PreviewService → NodeMediaRuntime → local FFmpeg and tokenized loopback media
 *   → Webview (`<video>` / Web Audio API)
 *
 * Exports NekoPreviewAPI for host-side probe, frame capture, and authorized
 * preview asset registration.
 */

import * as vscode from 'vscode';
import { VideoPreviewProvider } from './providers/VideoPreviewProvider';
import { AudioPreviewProvider } from './providers/AudioPreviewProvider';
import { PdfPreviewProvider } from './providers/document/PdfPreviewProvider';
import { CbzPreviewProvider } from './providers/document/CbzPreviewProvider';
import {
  EpubPreviewProvider,
  type EpubActiveLocation,
} from './providers/document/EpubPreviewProvider';
import { DocxPreviewProvider } from './providers/document/DocxPreviewProvider';
import { ModelPreviewProvider } from './providers/model/ModelPreviewProvider';
import { THREE_REFERENCE_PRESET_CATALOG } from './providers/model/threeReferencePresetCatalog';
import { ThreeReferenceOutputCollector } from './providers/model/ThreeReferenceOutputCollector';
import {
  materializeThreeReferenceCapture,
  resolveThreeReferenceCaptureWorkspaceUri,
} from './providers/model/threeReferenceCaptureMaterialization';
import { registerOpenCommand } from './providers/document/documentProviderHelper';
import { previewFileServer } from './providers/document/PreviewFileServer';
import { EpubSymbolProvider } from './epub/EpubSymbolProvider';
import { EpubOutlineProvider } from './providers/EpubOutlineProvider';
import { PreviewService } from './services/PreviewService';
import { StatusBarManager } from './ui/StatusBarManager';
import type { NekoPreviewAPI } from './types/api';
import type { DocumentLocator, DocumentSourceRef } from '@neko/shared';
import {
  createVSCodeLogger,
  VSCodeErrorHandler,
  resolveLogLevelSetting,
  watchLogLevel,
  createHostDerivedContentRuntime,
  type HostDerivedContentRuntime,
} from '@neko/shared/vscode/extension';
import { setRootLogger, getLogger } from './utils/logger';
import { setErrorHandler } from './utils/errorHandler';
import {
  PreviewWaveformGenerator,
  PreviewWaveformRepresentationReader,
} from './services/PreviewWaveformRepresentation';

const logger = getLogger('Extension');

// =============================================================================
// Extension State
// =============================================================================

let videoProvider: VideoPreviewProvider | null = null;
let audioProvider: AudioPreviewProvider | null = null;
let pdfProvider: PdfPreviewProvider | null = null;
let cbzProvider: CbzPreviewProvider | null = null;
let epubProvider: EpubPreviewProvider | null = null;
let docxProvider: DocxPreviewProvider | null = null;
let modelProvider: ModelPreviewProvider | null = null;
let statusBarManager: StatusBarManager | null = null;
let sharedPreviewService: PreviewService | null = null;

interface RevealDocumentLocatorInput {
  readonly filePath: string;
  readonly locator: DocumentLocator;
  readonly source?: DocumentSourceRef;
}

// =============================================================================
// Activation
// =============================================================================

export async function activate(context: vscode.ExtensionContext): Promise<NekoPreviewAPI> {
  sharedPreviewService = null;
  const rootLogger = createVSCodeLogger(
    'Neko Preview',
    'NekoPreview',
    context,
    resolveLogLevelSetting(context.extensionMode),
  );
  setRootLogger(rootLogger);
  setErrorHandler(new VSCodeErrorHandler(rootLogger));
  watchLogLevel(rootLogger, context);

  logger.info('Activating extension...');

  let sharedPreviewServicePromise: Promise<PreviewService | null> | null = null;
  const waveformRuntimes = new Map<string, Promise<HostDerivedContentRuntime>>();
  const resolveSharedPreviewService = (): Promise<PreviewService | null> => {
    if (!sharedPreviewServicePromise) {
      sharedPreviewServicePromise = PreviewService.tryCreate().then((service) => {
        sharedPreviewService = service;
        if (service) {
          context.subscriptions.push(service);
          logger.info('Shared Node/FFmpeg PreviewService ready.');
        } else {
          logger.warn('Failed to create PreviewService — Node/FFmpeg runtime unavailable');
        }
        return service;
      });
    }
    return sharedPreviewServicePromise;
  };
  const resolveWaveform = async (filePath: string, service: PreviewService) => {
    const workspaceRoot =
      vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath))?.uri.fsPath ??
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      throw new Error('Preview waveform representations require a workspace folder.');
    }
    let runtimePromise = waveformRuntimes.get(workspaceRoot);
    if (!runtimePromise) {
      runtimePromise = createHostDerivedContentRuntime({
        target: { kind: 'workspace', workspaceRoot },
        representationGenerators: [new PreviewWaveformGenerator(workspaceRoot, service)],
        logger: rootLogger,
      });
      waveformRuntimes.set(workspaceRoot, runtimePromise);
      const runtime = await runtimePromise;
      context.subscriptions.push({
        dispose: () => {
          waveformRuntimes.delete(workspaceRoot);
          void runtime
            .dispose()
            .catch((error) => logger.warn('Failed to dispose waveform runtime', { error }));
        },
      });
    }
    const runtime = await runtimePromise;
    return new PreviewWaveformRepresentationReader(
      workspaceRoot,
      runtime.contentRepresentation,
    ).getWaveform(filePath);
  };

  // Create shared status bar
  statusBarManager = new StatusBarManager();
  context.subscriptions.push(statusBarManager);

  // Create providers and inject shared PreviewService
  videoProvider = new VideoPreviewProvider(
    context.extensionUri,
    statusBarManager,
    resolveSharedPreviewService,
  );
  audioProvider = new AudioPreviewProvider(
    context.extensionUri,
    statusBarManager,
    resolveSharedPreviewService,
    resolveWaveform,
  );
  const threeReferenceOutputs = new ThreeReferenceOutputCollector({
    materializeCapture: (request) =>
      materializeThreeReferenceCapture({
        request,
        workspaceUri: resolveThreeReferenceCaptureWorkspaceUri({
          request,
          workspaceFolders: vscode.workspace.workspaceFolders,
          getWorkspaceFolder: (sourceUri) => vscode.workspace.getWorkspaceFolder(sourceUri),
        }),
        resolvePreviewService: resolveSharedPreviewService,
      }),
    deliverContext: async (payload) => {
      await vscode.commands.executeCommand('neko.agent.sendContext', payload);
    },
  });
  modelProvider = new ModelPreviewProvider(context.extensionUri, context, {
    onCaptureRequested: (request) => threeReferenceOutputs.collect(request),
  });

  // Register custom editors
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(ModelPreviewProvider.viewType, modelProvider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    }),
  );

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(VideoPreviewProvider.viewType, videoProvider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    }),
  );

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(AudioPreviewProvider.viewType, audioProvider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    }),
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.preview.openThreeReferenceGuide', async () => {
      if (!modelProvider) {
        throw new Error('3D Reference provider is unavailable.');
      }
      const mannequinPresets = THREE_REFERENCE_PRESET_CATALOG.filter(
        (entry) => entry.presetKind === 'mannequin',
      ).map((entry) => ({
        label: mannequinPresetLabel(entry.presetId),
        description: vscode.l10n.t('preview.threeReference.preset.guideDescription'),
        presetId: entry.presetId,
      }));
      const picked = await vscode.window.showQuickPick(mannequinPresets, {
        placeHolder: vscode.l10n.t('preview.threeReference.preset.choosePlaceholder'),
        matchOnDescription: true,
      });
      if (picked) await modelProvider.openBuiltinPresetPanel(picked.presetId);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.preview.openVideo', async () => {
      const fileUri = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectMany: false,
        filters: {
          'Video Files': ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'ts', 'flv', 'wmv'],
        },
        title: 'Open Video Preview',
      });

      if (fileUri && fileUri.length > 0) {
        await vscode.commands.executeCommand(
          'vscode.openWith',
          fileUri[0],
          VideoPreviewProvider.viewType,
        );
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.preview.openAudio', async () => {
      const fileUri = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectMany: false,
        filters: {
          'Audio Files': ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus'],
        },
        title: 'Open Audio Preview',
      });

      if (fileUri && fileUri.length > 0) {
        await vscode.commands.executeCommand(
          'vscode.openWith',
          fileUri[0],
          AudioPreviewProvider.viewType,
        );
      }
    }),
  );

  // Register providers for disposal
  context.subscriptions.push(videoProvider);
  context.subscriptions.push(audioProvider);
  context.subscriptions.push(modelProvider);

  // =========================================================================
  // Document Preview Providers (no engine dependency)
  // =========================================================================

  pdfProvider = new PdfPreviewProvider(context.extensionUri, statusBarManager, context);
  cbzProvider = new CbzPreviewProvider(context.extensionUri, statusBarManager, context);
  epubProvider = new EpubPreviewProvider(context.extensionUri, statusBarManager, context);
  docxProvider = new DocxPreviewProvider(context.extensionUri, statusBarManager, context);
  const activeEpubProvider = epubProvider;

  // Register document custom editors
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(PdfPreviewProvider.viewType, pdfProvider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    }),
    vscode.window.registerCustomEditorProvider(CbzPreviewProvider.viewType, cbzProvider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    }),
    vscode.window.registerCustomEditorProvider(EpubPreviewProvider.viewType, epubProvider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    }),
    vscode.window.registerCustomEditorProvider(DocxPreviewProvider.viewType, docxProvider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    }),
  );

  // Register document open commands
  registerOpenCommand(
    context,
    'neko.preview.openPdf',
    PdfPreviewProvider.viewType,
    {
      'PDF Files': ['pdf'],
    },
    'Open PDF Preview',
  );
  registerOpenCommand(
    context,
    'neko.preview.openCbz',
    CbzPreviewProvider.viewType,
    {
      'CBZ Files': ['cbz'],
    },
    'Open CBZ Preview',
  );
  registerOpenCommand(
    context,
    'neko.preview.openEpub',
    EpubPreviewProvider.viewType,
    {
      'EPUB Files': ['epub'],
    },
    'Open EPUB Preview',
  );
  registerOpenCommand(
    context,
    'neko.preview.openDocx',
    DocxPreviewProvider.viewType,
    {
      'Word Files': ['docx'],
    },
    'Open DOCX Preview',
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.preview.revealDocumentLocator',
      async (input?: RevealDocumentLocatorInput) => {
        if (!input?.filePath || !input.locator) {
          return;
        }
        await revealDocumentLocator(input);
      },
    ),
    vscode.commands.registerCommand(
      'neko.preview.navigateDocument',
      async (uri?: vscode.Uri, locator?: DocumentLocator) => {
        if (!uri || !locator) return;
        navigateOpenDocumentPreview(uri, locator);
      },
    ),
  );

  // Register document providers for disposal
  context.subscriptions.push(
    pdfProvider,
    cbzProvider,
    epubProvider,
    docxProvider,
    previewFileServer,
  );

  // =========================================================================
  // EPUB Outline (DocumentSymbolProvider + TreeView) + goToChapter command
  // =========================================================================

  const epubSymbolProvider = new EpubSymbolProvider();
  const epubOutlineProvider = new EpubOutlineProvider();

  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider({ pattern: '**/*.epub' }, epubSymbolProvider),
  );

  // Register TreeView in Explorer sidebar
  const epubOutlineView = vscode.window.createTreeView('neko.epubOutline', {
    treeDataProvider: epubOutlineProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(epubOutlineView, epubOutlineProvider);

  let lastEpubOutlineLocationKey: string | null = null;

  const getEpubOutlineLocationKey = (location: EpubActiveLocation | null): string | null => {
    if (!location?.chapterHref) {
      return null;
    }
    return `${location.uri.toString()}::${location.chapterHref}`;
  };

  const syncEpubOutlineLocation = async (
    location: EpubActiveLocation | null,
    options?: { forceReveal?: boolean },
  ): Promise<void> => {
    const nextLocationKey = getEpubOutlineLocationKey(location);
    const node = epubOutlineProvider.setActiveHref(location?.chapterHref ?? null);
    if (!nextLocationKey) {
      lastEpubOutlineLocationKey = null;
      return;
    }
    if (!node) return;
    const shouldReveal =
      epubOutlineView.visible &&
      (options?.forceReveal === true || nextLocationKey !== lastEpubOutlineLocationKey);
    lastEpubOutlineLocationKey = nextLocationKey;
    if (!shouldReveal) return;
    try {
      await epubOutlineView.reveal(node, {
        select: true,
        focus: false,
        expand: true,
      });
    } catch (err) {
      logger.warn(
        `Failed to reveal EPUB outline node: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  // Track active EPUB editor and refresh outline
  const refreshEpubOutline = async (uri: vscode.Uri | null): Promise<void> => {
    if (uri && uri.fsPath.endsWith('.epub')) {
      await vscode.commands.executeCommand('setContext', 'neko.epubEditorActive', true);
      try {
        const toc = await epubSymbolProvider.getToc(uri.fsPath);
        epubOutlineProvider.update(toc);
        await syncEpubOutlineLocation(activeEpubProvider.getActiveLocation());
      } catch (err) {
        logger.warn(
          `Failed to parse EPUB TOC: ${err instanceof Error ? err.message : String(err)}`,
        );
        epubOutlineProvider.clear();
      }
    } else {
      lastEpubOutlineLocationKey = null;
      await vscode.commands.executeCommand('setContext', 'neko.epubEditorActive', false);
      epubOutlineProvider.clear();
    }
  };

  // Listen for EPUB custom editor activation/deactivation
  context.subscriptions.push(
    activeEpubProvider.onDidChangeActiveEpub((uri) => {
      void refreshEpubOutline(uri);
    }),
  );
  context.subscriptions.push(
    activeEpubProvider.onDidChangeActiveLocation((location) => {
      void syncEpubOutlineLocation(location);
    }),
  );
  context.subscriptions.push(
    epubOutlineView.onDidChangeVisibility(() => {
      if (!epubOutlineView.visible) return;
      void syncEpubOutlineLocation(activeEpubProvider.getActiveLocation(), { forceReveal: true });
    }),
  );

  // Initial outline state: check if an EPUB is already open
  void refreshEpubOutline(activeEpubProvider.getActiveUri());

  // goToChapter command — accepts optional href arg (from TreeView command)
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.epub.goToChapter', async (href?: string) => {
      // When invoked from TreeView, href is provided directly
      if (typeof href === 'string') {
        activeEpubProvider.navigateToChapter(href);
        return;
      }

      // When invoked from command palette, show QuickPick
      const activeUri = activeEpubProvider.getActiveUri();
      if (!activeUri) {
        vscode.window.showInformationMessage('No EPUB file is currently open.');
        return;
      }
      const toc = await epubSymbolProvider.getToc(activeUri.fsPath);
      if (toc.length === 0) {
        vscode.window.showInformationMessage('No table of contents found in this EPUB.');
        return;
      }
      const items = toc.map((entry) => ({
        label: '  '.repeat(entry.depth) + entry.label,
        description: entry.href,
        href: entry.href,
      }));
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Go to chapter\u2026',
        matchOnDescription: true,
      });
      if (picked) {
        activeEpubProvider.navigateToChapter(picked.href);
      }
    }),
  );

  logger.info('Extension activated');

  // Build and return public API for other extensions
  const api: NekoPreviewAPI = {
    get isAvailable() {
      return sharedPreviewService?.isAvailable ?? false;
    },
    probeMedia(filePath: string) {
      if (!sharedPreviewService?.isAvailable) {
        return Promise.reject(new Error('PreviewService not available'));
      }
      return sharedPreviewService.probeMedia(filePath);
    },
    captureFrame(filePath, time, quality = 80) {
      if (!sharedPreviewService?.isAvailable) {
        return Promise.reject(new Error('PreviewService not available'));
      }
      return sharedPreviewService.captureFrame(filePath, time, quality);
    },
    registerPreviewAsset(request) {
      if (!sharedPreviewService?.isAvailable) {
        return Promise.reject(new Error('PreviewService not available'));
      }
      return sharedPreviewService.registerPreviewAsset(request);
    },
    requestPreviewVariant(assetId, request) {
      if (!sharedPreviewService?.isAvailable) {
        return Promise.reject(new Error('PreviewService not available'));
      }
      return sharedPreviewService.requestPreviewVariant(assetId, request);
    },
    updatePreviewAssetMetadata(assetId, request) {
      if (!sharedPreviewService?.isAvailable) {
        return Promise.reject(new Error('PreviewService not available'));
      }
      return sharedPreviewService.updatePreviewAssetMetadata(assetId, request);
    },
    unregisterPreviewAsset(assetIdOrToken) {
      if (!sharedPreviewService?.isAvailable) {
        return Promise.resolve();
      }
      return sharedPreviewService.unregisterPreviewAsset(assetIdOrToken);
    },
  };

  return api;
}

function mannequinPresetLabel(presetId: string): string {
  switch (presetId) {
    case 'guide-mannequin-female':
      return vscode.l10n.t('preview.threeReference.preset.femaleMannequin');
    case 'guide-mannequin-male':
      return vscode.l10n.t('preview.threeReference.preset.maleMannequin');
    case 'guide-mannequin-child':
      return vscode.l10n.t('preview.threeReference.preset.childMannequin');
    default:
      throw new Error(`Unknown built-in mannequin preset label: ${presetId}`);
  }
}

async function revealDocumentLocator(input: RevealDocumentLocatorInput): Promise<void> {
  const uri = vscode.Uri.file(input.filePath);
  const viewType = getDocumentViewType(input.source?.format ?? input.filePath);
  if (!viewType) {
    await vscode.commands.executeCommand('vscode.open', uri);
    return;
  }

  await vscode.commands.executeCommand('vscode.openWith', uri, viewType);

  if (input.locator.kind === 'chapter' && viewType === EpubPreviewProvider.viewType) {
    scheduleEpubChapterNavigation(input.locator.chapterHref, uri);
    return;
  }

  await vscode.commands.executeCommand('neko.preview.navigateDocument', uri, input.locator);
}

function scheduleEpubChapterNavigation(href: string, uri: vscode.Uri): void {
  retryPreviewNavigation(() => epubProvider?.navigateToChapter(href, uri) ?? false);
}

function navigateOpenDocumentPreview(uri: vscode.Uri, locator: DocumentLocator): void {
  const pageNumber =
    locator.kind === 'region' ? locator.pageNumber : readLocatorPageNumber(locator);
  if (pageNumber === undefined) return;

  retryPreviewNavigation(() => {
    if (uri.fsPath.endsWith('.pdf')) {
      return pdfProvider?.navigateToPage(pageNumber, uri) ?? false;
    }
    if (uri.fsPath.endsWith('.cbz')) {
      return cbzProvider?.navigateToPage(pageNumber, uri) ?? false;
    }
    if (uri.fsPath.endsWith('.epub')) {
      return epubProvider?.navigateToPage(pageNumber, uri) ?? false;
    }
    return false;
  });
}

function retryPreviewNavigation(navigate: () => boolean, attemptsLeft = 10): void {
  if (navigate() || attemptsLeft <= 1) return;
  setTimeout(() => retryPreviewNavigation(navigate, attemptsLeft - 1), 80);
}

function readLocatorPageNumber(locator: DocumentLocator): number | undefined {
  return locator.kind === 'page' ? locator.pageNumber : undefined;
}

function getDocumentViewType(formatOrPath: string): string | null {
  const format = formatOrPath.includes('.')
    ? formatOrPath.split('.').pop()?.toLowerCase()
    : formatOrPath.toLowerCase();
  switch (format) {
    case 'pdf':
      return PdfPreviewProvider.viewType;
    case 'cbz':
      return CbzPreviewProvider.viewType;
    case 'epub':
      return EpubPreviewProvider.viewType;
    case 'doc':
    case 'docx':
      return DocxPreviewProvider.viewType;
    default:
      return null;
  }
}

// =============================================================================
// Deactivation
// =============================================================================

export function deactivate(): void {
  logger.info('Deactivating extension...');

  videoProvider?.dispose();
  videoProvider = null;

  audioProvider?.dispose();
  audioProvider = null;

  pdfProvider?.dispose();
  pdfProvider = null;

  cbzProvider?.dispose();
  cbzProvider = null;

  epubProvider?.dispose();
  epubProvider = null;

  docxProvider?.dispose();
  docxProvider = null;

  modelProvider?.dispose();
  modelProvider = null;

  statusBarManager?.dispose();
  statusBarManager = null;

  // sharedPreviewService is disposed via context.subscriptions
  sharedPreviewService = null;

  logger.info('Extension deactivated');
}
