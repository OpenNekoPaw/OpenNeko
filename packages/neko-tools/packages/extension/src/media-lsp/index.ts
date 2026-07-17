/**
 * Media LSP Module — Entry point
 *
 * Initializes all JVI language features:
 *   Phase 1: Diagnostics + Hover (media metadata)
 *   Phase 2: DocumentSymbol + Definition + References (cross-file navigation)
 */

import * as vscode from 'vscode';
import type { IEngineMediaService } from '../contracts/IEngineMediaService';
import type { IScheduler } from '../contracts/IScheduler';
import type { IWorkspaceIO } from '../contracts/IWorkspaceIO';
import { getLogger } from '../utils/logger';
import type { IMediaProbeCache, IMediaWorkspaceIndex } from './services/types';

const logger = getLogger('MediaLsp');
import { JviDiagnosticsProvider } from './providers/JviDiagnosticsProvider';
import { JviHoverProvider } from './providers/JviHoverProvider';
import { JviDocumentSymbolProvider } from './providers/JviDocumentSymbolProvider';
import { JviDefinitionProvider } from './providers/JviDefinitionProvider';
import { JviReferenceProvider } from './providers/JviReferenceProvider';

const JVI_SELECTOR: vscode.DocumentSelector = { language: 'nekotools-jvi' };

export interface IMediaLspInitializationOptions {
  engineService?: IEngineMediaService;
  probeCache: IMediaProbeCache;
  scheduler: IScheduler;
  workspaceIO: IWorkspaceIO;
  workspaceIndex: IMediaWorkspaceIndex;
}

/**
 * Initialize the media LSP module.
 * Call during extension activation.
 */
export function initializeMediaLsp(
  context: vscode.ExtensionContext,
  options: IMediaLspInitializationOptions,
): void {
  const { engineService, probeCache, scheduler, workspaceIO, workspaceIndex } = options;

  // ─── Phase 1: Diagnostics + Hover ──────────────────────────────────────

  const diagnostics = new JviDiagnosticsProvider(engineService, probeCache, workspaceIO, scheduler);
  diagnostics.activate();
  context.subscriptions.push(diagnostics);

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      JVI_SELECTOR,
      new JviHoverProvider(engineService, probeCache, workspaceIO),
    ),
  );

  // ─── Phase 2: Symbols + Navigation ─────────────────────────────────────

  context.subscriptions.push(workspaceIndex);
  void workspaceIndex.ensureInitialized().catch((error) => {
    logger.warn('Failed to initialize workspace index:', error);
  });

  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(JVI_SELECTOR, new JviDocumentSymbolProvider()),
    vscode.languages.registerDefinitionProvider(
      JVI_SELECTOR,
      new JviDefinitionProvider(workspaceIndex),
    ),
    vscode.languages.registerReferenceProvider(
      JVI_SELECTOR,
      new JviReferenceProvider(workspaceIndex),
    ),
  );

  logger.info('Initialized (Phase 1 + Phase 2)');
}
