import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  MODEL_PREVIEW_PROTOCOL_VERSION,
  type ModelPreviewCaptureResult,
  type ModelPreviewDiagnostic,
  type ModelPreviewIdentity,
  type ModelPreviewSourceDescriptor,
  type ModelPreviewStagingState,
  type PathResolver,
} from '@neko/shared';
import {
  createHostContentAccessRuntime,
  loadHostContentPathPolicy,
  type LocalResourceAccessService,
} from '@neko/shared/vscode/extension';
import { getWebviewHtml } from '../../utils/html';
import { getPreviewErrorHtml } from '../previewProviderHelper';
import { ModelPreviewSourceSession } from './ModelPreviewSourceSession';
import { ModelSourceInspectionError } from './modelSourceInspection';
import { parseModelPreviewWebviewMessage } from './modelPreviewProtocol';
import {
  createDefaultModelStagingState,
  modelStagingStateKey,
  restoreModelStagingState,
} from './modelStagingState';

interface ModelPreviewSourceSessionPort extends vscode.Disposable {
  readonly sessionId: string;
  readonly descriptor: ModelPreviewSourceDescriptor;
  assertLive(sessionId: string, sourceFingerprint: string): void;
}

export interface ModelPreviewCaptureDeliveryInput {
  readonly source: ModelPreviewSourceDescriptor;
  readonly capture: ModelPreviewCaptureResult;
  readonly workspaceRoot?: string;
}

export interface ModelPreviewProviderDependencies {
  readonly createSessionId?: () => string;
  readonly loadPathPolicy?: (input: {
    readonly documentUri: vscode.Uri;
    readonly workspaceRoot?: string;
  }) => Promise<{
    readonly authorizedRoots: readonly string[];
    readonly pathResolver: PathResolver;
  }>;
  readonly openSourceSession?: (input: {
    readonly sessionId: string;
    readonly sourcePath: string;
    readonly projectionRoot: string;
    readonly webview: vscode.Webview;
    readonly extensionUri: vscode.Uri;
    readonly authorization: LocalResourceAccessService;
    readonly authorizedRoots: readonly string[];
    readonly workspaceRoot?: string;
    readonly pathResolver: PathResolver;
    readonly signal: AbortSignal;
  }) => Promise<ModelPreviewSourceSessionPort>;
  readonly deliverCapture?: (input: ModelPreviewCaptureDeliveryInput) => Promise<void>;
}

interface ModelPreviewPanelState {
  readonly panel: vscode.WebviewPanel;
  readonly sourceSession: ModelPreviewSourceSessionPort;
  readonly abortController: AbortController;
  readonly disposables: vscode.Disposable[];
  readonly workspaceRoot?: string;
  staging: ModelPreviewStagingState;
  pendingCaptureRequestId?: string;
  disposed: boolean;
}

export class ModelPreviewProvider
  implements vscode.CustomReadonlyEditorProvider, vscode.Disposable
{
  static readonly viewType = 'neko.modelPreview';

  private readonly panels = new Map<vscode.WebviewPanel, ModelPreviewPanelState>();
  private readonly contentAccess;
  private readonly localResourceAccess: LocalResourceAccessService;
  private readonly createSessionId: () => string;
  private readonly loadPathPolicy: NonNullable<ModelPreviewProviderDependencies['loadPathPolicy']>;
  private readonly openSourceSession: NonNullable<
    ModelPreviewProviderDependencies['openSourceSession']
  >;
  private readonly deliverCapture: NonNullable<ModelPreviewProviderDependencies['deliverCapture']>;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext,
    dependencies: ModelPreviewProviderDependencies = {},
  ) {
    this.contentAccess = createHostContentAccessRuntime({
      extensionUri,
      context,
      localResourceAccessOptions: { includeExtensionCache: false },
      sourceFileProvider: { enabled: false },
      documentEntryProvider: { enabled: false },
      ingest: { enabled: false },
    });
    if (!this.contentAccess.localResourceAccess) {
      throw new Error('Model Preview requires LocalResourceAccessService.');
    }
    this.localResourceAccess = this.contentAccess.localResourceAccess;
    this.createSessionId = dependencies.createSessionId ?? randomUUID;
    this.loadPathPolicy =
      dependencies.loadPathPolicy ??
      (async ({ documentUri, workspaceRoot }) => {
        const policy = await loadHostContentPathPolicy({
          documentUri,
          workspaceRoot,
          workspaceFolders: vscode.workspace.workspaceFolders,
          getExtension: vscode.extensions.getExtension,
        });
        return {
          authorizedRoots: policy.authorizedReadRoots,
          pathResolver: policy.pathResolver,
        };
      });
    this.openSourceSession =
      dependencies.openSourceSession ?? ((input) => ModelPreviewSourceSession.open(input));
    this.deliverCapture =
      dependencies.deliverCapture ??
      (async () => {
        throw new Error('Model Preview Agent delivery is not configured.');
      });
  }

  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken,
  ): Promise<vscode.CustomDocument> {
    return { uri, dispose: () => {} };
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    panel: vscode.WebviewPanel,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const sessionId = this.createSessionId();
    const abortController = new AbortController();
    let activeState: ModelPreviewPanelState | undefined;
    const cancellation = token.onCancellationRequested(() =>
      abortController.abort(new Error('Model Preview panel resolution cancelled.')),
    );
    const panelDisposal = panel.onDidDispose(() => {
      if (activeState) {
        this.disposePanel(activeState);
      } else {
        abortController.abort(new Error('Model Preview panel disposed during resolution.'));
      }
    });
    try {
      const workspaceRoot =
        vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath ??
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const policy = await this.loadPathPolicy({
        documentUri: document.uri,
        ...(workspaceRoot ? { workspaceRoot } : {}),
      });
      const sourceSession = await this.openSourceSession({
        sessionId,
        sourcePath: document.uri.fsPath,
        projectionRoot: path.join(
          this.context.globalStorageUri.fsPath,
          'model-preview-projections',
          sessionId,
        ),
        webview: panel.webview,
        extensionUri: this.extensionUri,
        authorization: this.localResourceAccess,
        authorizedRoots: policy.authorizedRoots,
        ...(workspaceRoot ? { workspaceRoot } : {}),
        pathResolver: policy.pathResolver,
        signal: abortController.signal,
      });
      if (abortController.signal.aborted) {
        sourceSession.dispose();
        abortController.signal.throwIfAborted();
      }
      const stateKey = modelStagingStateKey(sourceSession.descriptor.sourceFingerprint);
      const stored = this.context.workspaceState.get<unknown>(stateKey);
      const restored = restoreModelStagingState(
        stored,
        sessionId,
        sourceSession.descriptor.sourceFingerprint,
      );
      const staging =
        restored ??
        createDefaultModelStagingState(sessionId, sourceSession.descriptor.sourceFingerprint);
      const state: ModelPreviewPanelState = {
        panel,
        sourceSession,
        abortController,
        staging,
        ...(workspaceRoot ? { workspaceRoot } : {}),
        disposables: [cancellation, panelDisposal],
        disposed: false,
      };
      activeState = state;
      this.panels.set(panel, state);
      const messageDisposable = panel.webview.onDidReceiveMessage((raw) =>
        this.handleMessage(state, raw),
      );
      state.disposables.push(messageDisposable);
      panel.webview.html = getWebviewHtml({
        webview: panel.webview,
        extensionUri: this.extensionUri,
        entry: 'model',
        modelSessionId: sessionId,
      });
      if (stored !== undefined && !restored) {
        await this.postDiagnostic(state, {
          code: 'stale-state',
          message:
            'Stored Model Preview staging did not match this source or schema and was reset.',
          severity: 'warning',
          identity: identityOf(staging),
        });
      }
    } catch (error) {
      cancellation.dispose();
      panelDisposal.dispose();
      abortController.abort(error);
      panel.webview.html = getPreviewErrorHtml(
        diagnosticFromError(error, { sessionId }).message,
        '3D Model Preview',
      );
    }
  }

  dispose(): void {
    for (const state of [...this.panels.values()]) this.disposePanel(state);
  }

  private async handleMessage(state: ModelPreviewPanelState, raw: unknown): Promise<void> {
    if (state.disposed) return;
    const message = parseModelPreviewWebviewMessage(raw);
    if (!message) {
      await this.postDiagnostic(state, {
        code: 'protocol-mismatch',
        message: 'Rejected an unknown or malformed Model Preview message.',
        severity: 'error',
        identity: identityOf(state.staging),
      });
      return;
    }
    try {
      switch (message.type) {
        case 'model-preview/ready':
          if (
            message.protocolVersion !== MODEL_PREVIEW_PROTOCOL_VERSION ||
            message.sessionId !== state.sourceSession.sessionId
          ) {
            throw protocolError('session-mismatch', 'Model Preview ready identity is stale.');
          }
          await state.panel.webview.postMessage({
            type: 'model-preview/load',
            source: state.sourceSession.descriptor,
            staging: state.staging,
          });
          break;
        case 'model-preview/load-completed':
          this.assertIdentity(state, message.identity);
          break;
        case 'model-preview/state-changed':
          state.sourceSession.assertLive(
            message.staging.sessionId,
            message.staging.sourceFingerprint,
          );
          if (message.staging.revision !== state.staging.revision + 1) {
            throw protocolError(
              'stale-revision',
              'Model Preview staging revision is not monotonic.',
            );
          }
          state.staging = message.staging;
          await this.context.workspaceState.update(
            modelStagingStateKey(state.staging.sourceFingerprint),
            state.staging,
          );
          break;
        case 'model-preview/send-requested': {
          this.assertIdentity(state, message.identity);
          if (state.pendingCaptureRequestId) {
            throw protocolError('stale-revision', 'A Model Preview capture is already pending.');
          }
          const requestId = randomUUID();
          state.pendingCaptureRequestId = requestId;
          await state.panel.webview.postMessage({
            type: 'model-preview/capture-requested',
            requestId,
            identity: identityOf(state.staging),
            settings: state.staging.capture,
          });
          break;
        }
        case 'model-preview/capture-completed':
          if (message.requestId !== state.pendingCaptureRequestId) {
            throw protocolError('session-mismatch', 'Model Preview capture request is stale.');
          }
          this.assertIdentity(state, message.capture.metadata);
          state.pendingCaptureRequestId = undefined;
          await this.deliverCapture({
            source: state.sourceSession.descriptor,
            capture: message.capture,
            ...(state.workspaceRoot ? { workspaceRoot: state.workspaceRoot } : {}),
          });
          await state.panel.webview.postMessage({
            type: 'model-preview/send-succeeded',
            identity: identityOf(state.staging),
          });
          break;
        case 'model-preview/diagnostic':
          await this.postDiagnostic(state, message.diagnostic);
          break;
      }
    } catch (error) {
      state.pendingCaptureRequestId = undefined;
      await this.postDiagnostic(state, diagnosticFromError(error, identityOf(state.staging)));
    }
  }

  private assertIdentity(state: ModelPreviewPanelState, identity: ModelPreviewIdentity): void {
    state.sourceSession.assertLive(identity.sessionId, identity.sourceFingerprint);
    if (identity.revision !== state.staging.revision) {
      throw protocolError('stale-revision', 'Model Preview message revision is stale.');
    }
  }

  private async postDiagnostic(
    state: ModelPreviewPanelState,
    diagnostic: ModelPreviewDiagnostic,
  ): Promise<void> {
    if (state.disposed) return;
    await state.panel.webview.postMessage({ type: 'model-preview/diagnostic', diagnostic });
  }

  private disposePanel(state: ModelPreviewPanelState): void {
    if (state.disposed) return;
    state.disposed = true;
    this.panels.delete(state.panel);
    state.abortController.abort(new Error('Model Preview panel disposed.'));
    state.sourceSession.dispose();
    for (const disposable of state.disposables.splice(0)) disposable.dispose();
  }
}

function identityOf(staging: ModelPreviewStagingState): ModelPreviewIdentity {
  return {
    sessionId: staging.sessionId,
    sourceFingerprint: staging.sourceFingerprint,
    revision: staging.revision,
  };
}

function protocolError(
  code: 'session-mismatch' | 'stale-revision',
  message: string,
): ModelSourceInspectionError {
  return new ModelSourceInspectionError({ code, message, severity: 'error' });
}

function diagnosticFromError(
  error: unknown,
  identity: Partial<ModelPreviewIdentity>,
): ModelPreviewDiagnostic {
  if (error instanceof ModelSourceInspectionError) {
    return { ...error.diagnostic, identity: error.diagnostic.identity ?? identity };
  }
  return {
    code: 'load-failed',
    message: error instanceof Error ? error.message : String(error),
    severity: 'error',
    identity,
  };
}
