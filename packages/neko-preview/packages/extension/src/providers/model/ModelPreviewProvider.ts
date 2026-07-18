import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  THREE_REFERENCE_PROTOCOL_VERSION,
  type PathResolver,
  type ThreeReferenceDiagnostic,
  type ThreeReferenceIdentity,
  type ThreeReferencePanelSubject,
  type ThreeReferencePurpose,
  type ThreeReferenceStagingSnapshot,
} from '@neko/shared';
import {
  createHostContentAccessRuntime,
  loadHostContentPathPolicy,
  type LocalResourceAccessService,
} from '@neko/shared/vscode/extension';
import { getWebviewHtml } from '../../utils/html';
import { getPreviewErrorHtml } from '../previewProviderHelper';
import {
  authorizePanoramicImageSource,
  type AuthorizedPanoramicImageSource,
} from '../panoramicSourceAuthorization';
import { ModelPreviewSourceSession } from './ModelPreviewSourceSession';
import { ModelSourceInspectionError } from './modelSourceInspection';
import { parseThreeReferenceWebviewMessage } from './threeReferenceProtocol';
import { projectThreeReferencePresetRuntime } from './threeReferencePresetProjection';
import {
  THREE_REFERENCE_PRESET_CATALOG,
  resolveThreeReferencePreset,
  type ThreeReferencePresetCatalogEntry,
} from './threeReferencePresetCatalog';
import {
  createBuiltinPresetStaging,
  createEnvironmentOnlyStaging,
  createSourceModelStaging,
  restoreThreeReferenceStaging,
  threeReferenceStagingStateKey,
} from './threeReferenceStagingState';

interface SourceSessionPort extends vscode.Disposable {
  readonly sessionId: string;
  readonly descriptor: ModelPreviewSourceSession['descriptor'];
  assertLive(sessionId: string, sourceFingerprint: string): void;
}

export interface ThreeReferenceCaptureRequest {
  readonly requestId: string;
  readonly identity: ThreeReferenceIdentity;
  readonly purpose: ThreeReferencePurpose;
  readonly staging: ThreeReferenceStagingSnapshot;
  readonly signal: AbortSignal;
}

export interface ModelPreviewProviderDependencies {
  readonly createSessionId?: () => string;
  readonly presetCatalog?: readonly ThreeReferencePresetCatalogEntry[];
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
  }) => Promise<SourceSessionPort>;
  readonly onCaptureRequested?: (request: ThreeReferenceCaptureRequest) => Promise<void>;
  readonly authorizePanoramicImageSource?: typeof authorizePanoramicImageSource;
  readonly projectPresetRuntime?: typeof projectThreeReferencePresetRuntime;
}

interface PanelState {
  readonly panel: vscode.WebviewPanel;
  readonly panelSubject: ThreeReferencePanelSubject;
  readonly eligiblePurposes: readonly ThreeReferencePurpose[];
  readonly sourceSession?: SourceSessionPort;
  readonly abortController: AbortController;
  readonly disposables: vscode.Disposable[];
  staging: ThreeReferenceStagingSnapshot;
  disposed: boolean;
}

type PanelSubjectRequest =
  | { readonly kind: 'source-model'; readonly document: vscode.CustomDocument }
  | { readonly kind: 'builtin-preset'; readonly presetId: string }
  | { readonly kind: 'environment-only' };

export class ModelPreviewProvider
  implements vscode.CustomReadonlyEditorProvider, vscode.Disposable
{
  static readonly viewType = 'neko.modelPreview';

  private readonly panels = new Map<vscode.WebviewPanel, PanelState>();
  private readonly localResourceAccess: LocalResourceAccessService;
  private readonly createSessionId: () => string;
  private readonly presetCatalog: readonly ThreeReferencePresetCatalogEntry[];
  private readonly loadPathPolicy: NonNullable<ModelPreviewProviderDependencies['loadPathPolicy']>;
  private readonly openSourceSession: NonNullable<
    ModelPreviewProviderDependencies['openSourceSession']
  >;
  private readonly onCaptureRequested?: ModelPreviewProviderDependencies['onCaptureRequested'];
  private readonly authorizePanoramicImageSource: typeof authorizePanoramicImageSource;
  private readonly projectPresetRuntime: typeof projectThreeReferencePresetRuntime;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext,
    dependencies: ModelPreviewProviderDependencies = {},
  ) {
    const contentAccess = createHostContentAccessRuntime({
      extensionUri,
      context,
      localResourceAccessOptions: { includeExtensionCache: false },
      sourceFileProvider: { enabled: false },
      documentEntryProvider: { enabled: false },
      ingest: { enabled: false },
    });
    if (!contentAccess.localResourceAccess) {
      throw new Error('3D Reference requires LocalResourceAccessService.');
    }
    this.localResourceAccess = contentAccess.localResourceAccess;
    this.createSessionId = dependencies.createSessionId ?? randomUUID;
    this.presetCatalog = dependencies.presetCatalog ?? THREE_REFERENCE_PRESET_CATALOG;
    this.onCaptureRequested = dependencies.onCaptureRequested;
    this.authorizePanoramicImageSource =
      dependencies.authorizePanoramicImageSource ?? authorizePanoramicImageSource;
    this.projectPresetRuntime =
      dependencies.projectPresetRuntime ?? projectThreeReferencePresetRuntime;
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
    await this.resolvePanel({ kind: 'source-model', document }, panel, token);
  }

  async resolveBuiltinPresetPanel(
    presetId: string,
    panel: vscode.WebviewPanel,
    token: vscode.CancellationToken,
  ): Promise<void> {
    await this.resolvePanel({ kind: 'builtin-preset', presetId }, panel, token);
  }

  async openBuiltinPresetPanel(presetId: string): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
      'neko.preview.3dReferenceGuide',
      '3D Reference',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    const cancellation = new vscode.CancellationTokenSource();
    panel.onDidDispose(() => {
      cancellation.cancel();
      cancellation.dispose();
    });
    await this.resolveBuiltinPresetPanel(presetId, panel, cancellation.token);
  }

  async resolveEnvironmentOnlyPanel(
    panel: vscode.WebviewPanel,
    token: vscode.CancellationToken,
  ): Promise<void> {
    await this.resolvePanel({ kind: 'environment-only' }, panel, token);
  }

  async authorizePanoramicEnvironment(
    panel: vscode.WebviewPanel,
    sourceUri: vscode.Uri,
  ): Promise<AuthorizedPanoramicImageSource> {
    const state = this.panels.get(panel);
    if (!state || state.disposed) {
      throw new Error('3D Reference panel is not live.');
    }
    const workspaceRoot =
      vscode.workspace.getWorkspaceFolder(sourceUri)?.uri.fsPath ??
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const policy = await this.loadPathPolicy({
      documentUri: sourceUri,
      ...(workspaceRoot ? { workspaceRoot } : {}),
    });
    state.abortController.signal.throwIfAborted();
    const authorized = await this.authorizePanoramicImageSource({
      sourcePath: sourceUri.fsPath,
      webview: state.panel.webview,
      authorization: this.localResourceAccess,
      authorizedRoots: policy.authorizedRoots,
      ...(workspaceRoot ? { workspaceRoot } : {}),
      pathResolver: policy.pathResolver,
      signal: state.abortController.signal,
    });
    state.abortController.signal.throwIfAborted();
    const staging: ThreeReferenceStagingSnapshot = {
      ...state.staging,
      revision: state.staging.revision + 1,
      environment: {
        source: authorized.sourceRef,
        fingerprint: authorized.fingerprint,
        orientation: state.staging.environment?.orientation ?? {
          yawDeg: 0,
          pitchDeg: 0,
          fieldOfViewDeg: 75,
        },
      },
    };
    state.staging = staging;
    await this.context.workspaceState.update(
      threeReferenceStagingStateKey(state.panelSubject.subject),
      staging,
    );
    state.abortController.signal.throwIfAborted();
    await state.panel.webview.postMessage({
      type: '3d-reference/environment-runtime',
      identity: identityOf(staging),
      staging,
      runtime: {
        source: authorized.sourceRef,
        fingerprint: authorized.fingerprint,
        uri: authorized.webviewUri,
        mediaType: authorized.mediaType,
        sizeBytes: authorized.sizeBytes,
      },
    });
    return authorized;
  }

  dispose(): void {
    for (const state of [...this.panels.values()]) this.disposePanel(state);
  }

  private async resolvePanel(
    request: PanelSubjectRequest,
    panel: vscode.WebviewPanel,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const sessionId = this.createSessionId();
    const webview = panel.webview;
    const abortController = new AbortController();
    let state: PanelState | undefined;
    let pendingSourceSession: SourceSessionPort | undefined;
    let stopped = false;
    const stop = (reason: Error): void => {
      stopped = true;
      if (state) this.disposePanel(state);
      else abortController.abort(reason);
    };
    const cancellation = token.onCancellationRequested(() =>
      stop(new Error('3D Reference panel resolution cancelled.')),
    );
    const panelDisposal = panel.onDidDispose(() =>
      stop(new Error('3D Reference panel disposed during resolution.')),
    );
    try {
      const initialized = await this.initializePanelSubject(
        request,
        panel,
        sessionId,
        abortController,
      );
      pendingSourceSession = initialized.sourceSession;
      abortController.signal.throwIfAborted();
      const stateKey = threeReferenceStagingStateKey(initialized.panelSubject.subject);
      const stored = this.context.workspaceState.get<unknown>(stateKey);
      const staging =
        restoreThreeReferenceStaging(stored, sessionId, initialized.panelSubject.subject) ??
        initialized.staging;
      state = {
        panel,
        panelSubject: initialized.panelSubject,
        eligiblePurposes: initialized.eligiblePurposes,
        ...(initialized.sourceSession ? { sourceSession: initialized.sourceSession } : {}),
        abortController,
        staging,
        disposables: [cancellation, panelDisposal],
        disposed: false,
      };
      pendingSourceSession = undefined;
      const liveState = state;
      this.panels.set(panel, liveState);
      state.disposables.push(
        webview.onDidReceiveMessage((raw) => this.handleMessage(liveState, raw)),
      );
      webview.html = getWebviewHtml({
        webview,
        extensionUri: this.extensionUri,
        entry: 'model',
        modelSessionId: sessionId,
      });
      if (stored !== undefined && staging === initialized.staging) {
        await this.postDiagnostic(state, {
          code: 'staging-version-unsupported',
          message: 'Stored 3D Reference staging was incompatible and was reset.',
          severity: 'warning',
          identity: identityOf(staging),
        });
      }
    } catch (error) {
      if (state) this.disposePanel(state);
      else {
        pendingSourceSession?.dispose();
        cancellation.dispose();
        panelDisposal.dispose();
        abortController.abort(error);
      }
      if (stopped) return;
      webview.html = getPreviewErrorHtml(
        diagnosticFromError(error, { sessionId }).message,
        '3D Reference',
      );
    }
  }

  private async initializePanelSubject(
    request: PanelSubjectRequest,
    panel: vscode.WebviewPanel,
    sessionId: string,
    abortController: AbortController,
  ): Promise<{
    readonly panelSubject: ThreeReferencePanelSubject;
    readonly eligiblePurposes: readonly ThreeReferencePurpose[];
    readonly staging: ThreeReferenceStagingSnapshot;
    readonly sourceSession?: SourceSessionPort;
  }> {
    switch (request.kind) {
      case 'source-model': {
        const workspaceRoot =
          vscode.workspace.getWorkspaceFolder(request.document.uri)?.uri.fsPath ??
          vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const policy = await this.loadPathPolicy({
          documentUri: request.document.uri,
          ...(workspaceRoot ? { workspaceRoot } : {}),
        });
        abortController.signal.throwIfAborted();
        const sourceSession = await this.openSourceSession({
          sessionId,
          sourcePath: request.document.uri.fsPath,
          projectionRoot: path.join(
            this.context.globalStorageUri.fsPath,
            '3d-reference-projections',
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
        const descriptor = sourceSession.descriptor;
        const subject = {
          kind: 'source-model',
          source: descriptor.source,
          fingerprint: descriptor.sourceFingerprint,
          format: descriptor.format,
        } as const;
        return {
          panelSubject: {
            kind: 'source-model',
            subject,
            runtime: {
              source: descriptor.source,
              fingerprint: descriptor.sourceFingerprint,
              format: descriptor.format,
              entryUri: descriptor.entryUri,
              uriMap: descriptor.uriMap,
              sizeBytes: descriptor.sizeBytes,
            },
          },
          eligiblePurposes: ['appearance', 'camera'],
          staging: createSourceModelStaging(sessionId, subject),
          sourceSession,
        };
      }
      case 'builtin-preset': {
        const candidate = this.presetCatalog.find((entry) => entry.presetId === request.presetId);
        if (!candidate) throw new Error(`Unknown 3D Reference preset: ${request.presetId}`);
        const subject = {
          kind: 'builtin-preset',
          presetId: candidate.presetId,
          presetVersion: candidate.presetVersion,
          fingerprint: candidate.fingerprint,
          presetKind: candidate.presetKind,
          appearancePolicy: candidate.appearancePolicy,
          allowedPurposes: candidate.allowedPurposes,
        } as const;
        resolveThreeReferencePreset(this.presetCatalog, subject);
        const runtime = await this.projectPresetRuntime({
          entry: candidate,
          webview: panel.webview,
          extensionUri: this.extensionUri,
          authorization: this.localResourceAccess,
          signal: abortController.signal,
        });
        return {
          panelSubject: { kind: 'builtin-preset', subject, runtime },
          eligiblePurposes: candidate.allowedPurposes,
          staging: createBuiltinPresetStaging(sessionId, candidate),
        };
      }
      case 'environment-only': {
        const subject = { kind: 'environment-only' } as const;
        return {
          panelSubject: { kind: 'environment-only', subject },
          eligiblePurposes: ['camera', 'panorama-scene'],
          staging: createEnvironmentOnlyStaging(sessionId),
        };
      }
    }
  }

  private async handleMessage(state: PanelState, raw: unknown): Promise<void> {
    if (state.disposed) return;
    const message = parseThreeReferenceWebviewMessage(raw);
    if (!message) {
      await this.postDiagnostic(state, {
        code: 'protocol-mismatch',
        message: 'Rejected an unknown or malformed 3D Reference message.',
        severity: 'error',
        identity: identityOf(state.staging),
      });
      return;
    }
    try {
      switch (message.type) {
        case '3d-reference/ready':
          if (
            message.protocolVersion !== THREE_REFERENCE_PROTOCOL_VERSION ||
            message.sessionId !== state.staging.sessionId
          ) {
            throw protocolError('session-mismatch', '3D Reference ready identity is stale.');
          }
          await state.panel.webview.postMessage({
            type: '3d-reference/session-init',
            protocolVersion: THREE_REFERENCE_PROTOCOL_VERSION,
            panelSubject: state.panelSubject,
            eligiblePurposes: state.eligiblePurposes,
            staging: state.staging,
          });
          break;
        case '3d-reference/load-completed':
          this.assertIdentity(state, message.identity);
          break;
        case '3d-reference/staging-changed':
          this.assertStagingUpdate(state, message.staging);
          state.staging = message.staging;
          await this.context.workspaceState.update(
            threeReferenceStagingStateKey(state.panelSubject.subject),
            state.staging,
          );
          break;
        case '3d-reference/capture-requested':
          this.assertIdentity(state, message.identity);
          if (
            !state.eligiblePurposes.includes(message.purpose) ||
            !state.staging.selectedPurposes.includes(message.purpose)
          ) {
            throw purposeError(message.purpose);
          }
          if (!this.onCaptureRequested) {
            throw protocolError(
              'output-invalid',
              '3D Reference capture runtime is not registered.',
            );
          }
          await this.onCaptureRequested({
            requestId: message.requestId,
            identity: message.identity,
            purpose: message.purpose,
            staging: state.staging,
            signal: state.abortController.signal,
          });
          break;
        case '3d-reference/diagnostic':
          await this.postDiagnostic(state, message.diagnostic);
          break;
      }
    } catch (error) {
      await this.postDiagnostic(state, diagnosticFromError(error, identityOf(state.staging)));
    }
  }

  private assertStagingUpdate(state: PanelState, staging: ThreeReferenceStagingSnapshot): void {
    this.assertIdentity(state, { sessionId: staging.sessionId, revision: state.staging.revision });
    if (staging.revision !== state.staging.revision + 1) {
      throw protocolError('stale-revision', '3D Reference staging revision is not monotonic.');
    }
    if (!samePanelSubject(state.panelSubject.subject, staging.subject)) {
      throw protocolError('subject-invalid', '3D Reference subject cannot change in place.');
    }
    if (!staging.selectedPurposes.every((purpose) => state.eligiblePurposes.includes(purpose))) {
      throw protocolError(
        'purpose-unsupported',
        '3D Reference staging selected an ineligible purpose.',
      );
    }
  }

  private assertIdentity(state: PanelState, identity: ThreeReferenceIdentity): void {
    if (identity.sessionId !== state.staging.sessionId) {
      throw protocolError('session-mismatch', '3D Reference message belongs to another panel.');
    }
    if (identity.revision !== state.staging.revision) {
      throw protocolError('stale-revision', '3D Reference message revision is stale.');
    }
    if (state.sourceSession && state.panelSubject.subject.kind === 'source-model') {
      state.sourceSession.assertLive(identity.sessionId, state.panelSubject.subject.fingerprint);
    }
  }

  private async postDiagnostic(
    state: PanelState,
    diagnostic: ThreeReferenceDiagnostic,
  ): Promise<void> {
    if (state.disposed) return;
    await state.panel.webview.postMessage({ type: '3d-reference/diagnostic', diagnostic });
  }

  private disposePanel(state: PanelState): void {
    if (state.disposed) return;
    state.disposed = true;
    this.panels.delete(state.panel);
    state.abortController.abort(new Error('3D Reference panel disposed.'));
    state.sourceSession?.dispose();
    for (const disposable of state.disposables.splice(0)) disposable.dispose();
  }
}

function identityOf(staging: ThreeReferenceStagingSnapshot): ThreeReferenceIdentity {
  return { sessionId: staging.sessionId, revision: staging.revision };
}

function samePanelSubject(
  expected: ThreeReferencePanelSubject['subject'],
  actual: ThreeReferencePanelSubject['subject'],
): boolean {
  if (expected.kind !== actual.kind) return false;
  switch (expected.kind) {
    case 'source-model':
      return actual.kind === 'source-model' && expected.fingerprint === actual.fingerprint;
    case 'builtin-preset':
      return (
        actual.kind === 'builtin-preset' &&
        expected.presetId === actual.presetId &&
        expected.presetVersion === actual.presetVersion &&
        expected.fingerprint === actual.fingerprint
      );
    case 'environment-only':
      return actual.kind === 'environment-only';
  }
  throw new Error('Unknown 3D Reference subject kind.');
}

function protocolError(
  code: ThreeReferenceDiagnostic['code'],
  message: string,
): ThreeReferenceProtocolError {
  return new ThreeReferenceProtocolError({ code, message, severity: 'error' });
}

function purposeError(purpose: ThreeReferencePurpose): ThreeReferenceProtocolError {
  return new ThreeReferenceProtocolError({
    code: 'purpose-unsupported',
    message: `3D Reference purpose is not selected or eligible: ${purpose}`,
    severity: 'error',
    purpose,
  });
}

class ThreeReferenceProtocolError extends Error {
  constructor(readonly diagnostic: ThreeReferenceDiagnostic) {
    super(diagnostic.message);
    this.name = 'ThreeReferenceProtocolError';
  }
}

function diagnosticFromError(
  error: unknown,
  identity: Partial<ThreeReferenceIdentity>,
): ThreeReferenceDiagnostic {
  if (error instanceof ThreeReferenceProtocolError) {
    return { ...error.diagnostic, identity: error.diagnostic.identity ?? identity };
  }
  if (error instanceof ModelSourceInspectionError) {
    return {
      code: mapSourceDiagnosticCode(error.diagnostic.code),
      message: error.diagnostic.message,
      severity: error.diagnostic.severity,
      identity,
    };
  }
  return {
    code: 'source-load-failed',
    message: error instanceof Error ? error.message : String(error),
    severity: 'error',
    identity,
  };
}

function mapSourceDiagnosticCode(
  code: ModelSourceInspectionError['diagnostic']['code'],
): ThreeReferenceDiagnostic['code'] {
  switch (code) {
    case 'source-missing':
      return 'source-missing';
    case 'source-unauthorized':
      return 'source-unauthorized';
    case 'unsupported-format':
      return 'source-unsupported';
    case 'session-mismatch':
      return 'session-mismatch';
    case 'stale-revision':
      return 'stale-revision';
    case 'protocol-mismatch':
      return 'protocol-mismatch';
    case 'renderer-unavailable':
      return 'renderer-unavailable';
    case 'renderer-lost':
      return 'renderer-lost';
    case 'disposed':
      return 'disposed';
    case 'stale-state':
      return 'staging-version-unsupported';
    case 'source-too-large':
    case 'mime-mismatch':
    case 'unsafe-dependency':
    case 'missing-dependency':
    case 'dependency-limit-exceeded':
    case 'load-failed':
    case 'empty-model':
      return 'source-load-failed';
  }
  throw new Error(`Unknown model source diagnostic code: ${String(code)}`);
}
