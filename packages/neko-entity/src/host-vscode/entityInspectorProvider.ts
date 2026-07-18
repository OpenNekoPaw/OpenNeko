import * as vscode from 'vscode';
import {
  ENTITY_FACADE_COMMANDS,
  isCreativeEntity,
  isCreativeEntityCandidate,
  isEntityAssetBinding,
  isEntityBindingWidgetAction,
  isEntityFacadeInspectEntityRequest,
  isVisualIdentityDraft,
  type CreativeEntity,
  type CreativeEntityCandidate,
  type CreativeEntityChangeEvent,
  type CreativeEntityChangedRef,
  type CreativeEntityRef,
  type EntityAssetBinding,
  type EntityBindingWidgetAction,
  type EntityFacadeEntityDetailResult,
  type EntityFacadeInspectEntityRequest,
} from '@neko/shared';
import type { ILogger } from '@neko/shared';
import { projectEntityBindingAvailabilityText } from '../projections';

export interface EntityInspectorProviderOptions {
  readonly logger?: Pick<ILogger, 'warn'>;
  readonly executeCommand?: EntityInspectorCommandExecutor;
  readonly subscribeEntityChanges?: EntityInspectorChangeSubscriber;
}

export type EntityInspectorCommandExecutor = (
  command: string,
  ...args: readonly unknown[]
) => Thenable<unknown>;

export type EntityInspectorChangeSubscriber = (
  projectRoot: string,
  listener: (event: CreativeEntityChangeEvent) => void,
) => vscode.Disposable;

interface EntityInspectorState {
  readonly entityRef?: CreativeEntityRef;
  readonly candidateId?: string;
  readonly entity?: CreativeEntity;
  readonly candidate?: CreativeEntityCandidate;
  readonly bindings?: readonly EntityAssetBinding[];
  readonly bindingTexts?: readonly string[];
  readonly error?: string;
}

interface EntityInspectorActionMessage {
  readonly type: 'entityInspector.action';
  readonly action: EntityBindingWidgetAction;
  readonly payload?: Record<string, unknown>;
}

interface EntityInspectorStrings {
  readonly title: string;
  readonly noEntitySelected: string;
  readonly aliases: string;
  readonly noAliases: string;
  readonly summary: string;
  readonly noSummary: string;
  readonly bindings: string;
  readonly noBindings: string;
  readonly actions: string;
  readonly rename: string;
  readonly addAlias: string;
  readonly editAppearance: string;
  readonly actionFailed: string;
}

export class EntityInspectorProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewType = 'neko.entityInspector';

  private readonly logger: Pick<ILogger, 'warn'>;
  private readonly executeCommand: EntityInspectorCommandExecutor;
  private readonly subscribeEntityChanges: EntityInspectorChangeSubscriber | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly entityChangeSubscriptions = new Map<string, vscode.Disposable>();
  private webviewView: vscode.WebviewView | undefined;
  private state: EntityInspectorState = {};
  private autoFollowTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingAutoFollow: EntityFacadeInspectEntityRequest | undefined;

  constructor(options: EntityInspectorProviderOptions = {}) {
    this.logger = options.logger ?? NOOP_ENTITY_INSPECTOR_LOGGER;
    this.executeCommand = options.executeCommand ?? vscode.commands.executeCommand;
    this.subscribeEntityChanges = options.subscribeEntityChanges;
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.webviewView = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [],
    };
    webviewView.webview.html = this.renderHtml(webviewView.webview);
    this.disposables.push(
      webviewView.webview.onDidReceiveMessage((message: unknown) => {
        void this.handleMessage(message);
      }),
    );
    this.postState();
  }

  async inspect(input: unknown): Promise<{ ok: boolean; message?: string }> {
    if (!isEntityFacadeInspectEntityRequest(input)) {
      return { ok: false, message: vscode.l10n.t('Invalid entity inspector request.') };
    }
    const projectRoot = resolveInspectorProjectRoot(input);
    if (!projectRoot) {
      return {
        ok: false,
        message: vscode.l10n.t('Open a workspace before inspecting an entity.'),
      };
    }

    try {
      this.ensureEntityChangeSubscription(projectRoot);
      this.state = input.entityRef
        ? await this.loadEntityState(
            toInspectorEntityRef(input.entityRef, projectRoot),
            projectRoot,
          )
        : input.candidateId
          ? await this.loadCandidateState(input.candidateId, projectRoot)
          : { error: vscode.l10n.t('Inspector request requires entityRef or candidateId.') };
    } catch (error) {
      this.logger.warn('Entity Inspector load failed', error);
      this.state = { error: error instanceof Error ? error.message : String(error) };
      this.postState();
      return { ok: false, message: this.state.error };
    }

    if (input.reveal !== false) {
      await vscode.commands.executeCommand(`${EntityInspectorProvider.viewType}.focus`);
    }
    this.postState();
    return this.state.error ? { ok: false, message: this.state.error } : { ok: true };
  }

  follow(input: unknown, delayMs = 250): void {
    if (!isEntityFacadeInspectEntityRequest(input)) return;
    const enabled = vscode.workspace
      .getConfiguration('neko.entityInspector')
      .get<boolean>('autoFollow', false);
    if (!enabled) return;
    this.pendingAutoFollow = input;
    if (this.autoFollowTimer) clearTimeout(this.autoFollowTimer);
    this.autoFollowTimer = setTimeout(() => {
      const pending = this.pendingAutoFollow;
      this.pendingAutoFollow = undefined;
      if (pending) void this.inspect({ ...pending, reveal: false });
    }, delayMs);
  }

  dispose(): void {
    if (this.autoFollowTimer) clearTimeout(this.autoFollowTimer);
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
    for (const subscription of this.entityChangeSubscriptions.values()) {
      subscription.dispose();
    }
    this.entityChangeSubscriptions.clear();
  }

  private ensureEntityChangeSubscription(projectRoot: string): void {
    if (!this.subscribeEntityChanges || this.entityChangeSubscriptions.has(projectRoot)) return;
    const subscription = this.subscribeEntityChanges(projectRoot, (event) => {
      void this.refreshFromEntityChange(projectRoot, event);
    });
    this.entityChangeSubscriptions.set(projectRoot, subscription);
  }

  private async refreshFromEntityChange(
    projectRoot: string,
    event: CreativeEntityChangeEvent,
  ): Promise<void> {
    try {
      const confirmedCandidateRef = this.state.candidateId
        ? event.changedRefs.find(
            (changedRef) =>
              changedRef.kind === 'candidate' && changedRef.id === this.state.candidateId,
          )?.entityRef
        : undefined;
      if (confirmedCandidateRef) {
        await this.inspect({ projectRoot, entityRef: confirmedCandidateRef, reveal: false });
        return;
      }
      if (
        this.state.entityRef?.projectRoot === projectRoot &&
        isInspectorChangeRelated(this.state.entityRef, event.changedRefs)
      ) {
        await this.inspect({ projectRoot, entityRef: this.state.entityRef, reveal: false });
        return;
      }
      if (
        this.state.candidateId &&
        event.changedRefs.some(
          (changedRef) =>
            changedRef.kind === 'candidate' && changedRef.id === this.state.candidateId,
        )
      ) {
        await this.inspect({ projectRoot, candidateId: this.state.candidateId, reveal: false });
      }
    } catch (error) {
      this.logger.warn('Entity Inspector refresh failed', {
        projectRoot,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async loadEntityState(
    entityRef: CreativeEntityRef,
    projectRoot: string,
  ): Promise<EntityInspectorState> {
    const result = await this.executeCommand(ENTITY_FACADE_COMMANDS.getEntityDetail, {
      projectRoot,
      entityRef,
    });
    const detail = readEntityFacadeDetail(result);
    if (!detail?.entity) {
      return { entityRef, error: vscode.l10n.t('Entity detail is unavailable.') };
    }
    return {
      entityRef,
      entity: detail.entity,
      bindings: detail.bindings,
      bindingTexts: detail.bindings.map(projectEntityBindingAvailabilityText),
    };
  }

  private async loadCandidateState(
    candidateId: string,
    projectRoot: string,
  ): Promise<EntityInspectorState> {
    const result = await this.executeCommand(ENTITY_FACADE_COMMANDS.listCandidates, {
      projectRoot,
    });
    const candidate = Array.isArray(result)
      ? result.find(
          (item): item is CreativeEntityCandidate =>
            isCreativeEntityCandidate(item) && item.id === candidateId,
        )
      : undefined;
    return candidate
      ? { candidateId, candidate }
      : { candidateId, error: vscode.l10n.t('Entity detail is unavailable.') };
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (!isEntityInspectorActionMessage(message)) {
      this.post({
        type: 'entityInspector.error',
        message: vscode.l10n.t('Invalid Inspector action.'),
      });
      return;
    }
    const result = await this.executeCommand(ENTITY_FACADE_COMMANDS.triggerBindingWidgetAction, {
      context: {
        surface: 'inspector',
        projectRoot: this.state.entityRef?.projectRoot,
      },
      action: message.action,
      ...(this.state.entityRef ? { entityRef: this.state.entityRef } : {}),
      ...(this.state.candidateId ? { candidateId: this.state.candidateId } : {}),
      ...(message.payload ? { payload: message.payload } : {}),
    });
    this.post({ type: 'entityInspector.actionResult', result });
    const target = this.state.entityRef
      ? { entityRef: this.state.entityRef, reveal: false }
      : this.state.candidateId
        ? { candidateId: this.state.candidateId, reveal: false }
        : undefined;
    if (target) await this.inspect(target);
  }

  private postState(): void {
    this.post({
      type: 'entityInspector.update',
      state: this.state,
    });
  }

  private post(message: Record<string, unknown>): void {
    void this.webviewView?.webview.postMessage(message);
  }

  private renderHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const strings = entityInspectorStrings();
    return `<!DOCTYPE html>
<html lang="${vscode.env.language}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    script-src 'nonce-${nonce}';
    style-src 'unsafe-inline';
  " />
  <title>${escapeHtml(strings.title)}</title>
  <style>
    body { color: var(--vscode-foreground); font-family: var(--vscode-font-family); padding: 12px; }
    h2 { font-size: 16px; margin: 0 0 4px; }
    h3 { font-size: 12px; margin: 14px 0 6px; color: var(--vscode-descriptionForeground); text-transform: uppercase; }
    .muted { color: var(--vscode-descriptionForeground); }
    .row { border-top: 1px solid var(--vscode-panel-border); padding: 8px 0; }
    button { margin: 0 6px 6px 0; }
  </style>
</head>
<body>
  <main id="root" class="muted">${escapeHtml(strings.noEntitySelected)}</main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const root = document.getElementById('root');
    const strings = ${safeScriptJson(strings)};
    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'entityInspector.update') render(message.state || {});
      if (message.type === 'entityInspector.error') renderError(message.message);
    });
    function esc(value) {
      return String(value ?? '').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    }
    function list(items, empty) {
      return items && items.length ? items.map((item) => '<li>' + esc(item) + '</li>').join('') : '<li class="muted">' + esc(empty) + '</li>';
    }
    function render(state) {
      const record = state.entity || state.candidate;
      if (!record) {
        root.className = 'muted';
        root.innerHTML = '<p>' + esc(strings.noEntitySelected) + '</p>' + (state.error ? '<p>' + esc(state.error) + '</p>' : '');
        return;
      }
      const label = record.displayName || record.canonicalName || record.name;
      root.className = '';
      root.innerHTML =
        '<h2>' + esc(label) + '</h2>' +
        '<div class="muted">' + esc(record.kind) + ' · ' + esc(record.status) + '</div>' +
        '<div class="row"><h3>' + esc(strings.aliases) + '</h3><ul>' + list(record.aliases || [], strings.noAliases) + '</ul></div>' +
        '<div class="row"><h3>' + esc(strings.summary) + '</h3><p>' + esc(record.metadata?.description || record.metadata?.appearanceSummary || record.metadata?.visualSummary || strings.noSummary) + '</p></div>' +
        '<div class="row"><h3>' + esc(strings.bindings) + '</h3><ul>' + list(state.bindingTexts || [], strings.noBindings) + '</ul></div>' +
        '<div class="row"><h3>' + esc(strings.actions) + '</h3>' +
        '<button data-action="rename-entity">' + esc(strings.rename) + '</button>' +
        '<button data-action="add-alias">' + esc(strings.addAlias) + '</button>' +
        '<button data-action="update-metadata">' + esc(strings.editAppearance) + '</button>' +
        '</div>';
      root.querySelectorAll('button[data-action]').forEach((button) => {
        button.addEventListener('click', () => {
          vscode.postMessage({ type: 'entityInspector.action', action: button.dataset.action });
        });
      });
    }
    function renderError(message) {
      root.className = 'muted';
      root.innerHTML = '<p>' + esc(message || strings.actionFailed) + '</p>';
    }
  </script>
</body>
</html>`;
  }
}

export function toInspectorEntityRef(
  entityRef: CreativeEntityRef,
  projectRoot: string,
): CreativeEntityRef {
  return {
    entityId: entityRef.entityId,
    entityKind: entityRef.entityKind,
    projectRoot,
    source: 'neko-entity',
  };
}

export function isInspectorChangeRelated(
  current: CreativeEntityRef,
  changedRefs: readonly CreativeEntityChangedRef[],
): boolean {
  return changedRefs.some((changedRef) => {
    if (changedRef.entityRef) {
      return (
        changedRef.entityRef.entityId === current.entityId &&
        changedRef.entityRef.entityKind === current.entityKind
      );
    }
    return (
      (changedRef.kind === 'entity' ||
        changedRef.kind === 'binding' ||
        changedRef.kind === 'requirement' ||
        changedRef.kind === 'visual-draft') &&
      changedRef.id === current.entityId
    );
  });
}

function readEntityFacadeDetail(value: unknown): EntityFacadeEntityDetailResult | undefined {
  if (!isRecord(value)) return undefined;
  const entity = value['entity'];
  const candidates = value['candidates'];
  const bindings = value['bindings'];
  const visualDrafts = value['visualDrafts'];
  if (entity !== undefined && !isCreativeEntity(entity)) return undefined;
  if (!Array.isArray(candidates) || !candidates.every(isCreativeEntityCandidate)) return undefined;
  if (!Array.isArray(bindings) || !bindings.every(isEntityAssetBinding)) return undefined;
  if (!Array.isArray(visualDrafts) || !visualDrafts.every(isVisualIdentityDraft)) return undefined;
  return {
    ...(entity ? { entity } : {}),
    candidates,
    bindings,
    visualDrafts,
  };
}

function isEntityInspectorActionMessage(value: unknown): value is EntityInspectorActionMessage {
  if (!isRecord(value)) return false;
  return (
    value['type'] === 'entityInspector.action' &&
    isEntityBindingWidgetAction(value['action']) &&
    (value['payload'] === undefined || isRecord(value['payload']))
  );
}

function resolveInspectorProjectRoot(
  request: EntityFacadeInspectEntityRequest,
): string | undefined {
  return (
    request.projectRoot ??
    request.entityRef?.projectRoot ??
    request.context?.projectRoot ??
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  );
}

function entityInspectorStrings(): EntityInspectorStrings {
  return {
    title: vscode.l10n.t('Entity Inspector'),
    noEntitySelected: vscode.l10n.t('No entity selected.'),
    aliases: vscode.l10n.t('Aliases'),
    noAliases: vscode.l10n.t('No aliases'),
    summary: vscode.l10n.t('Summary'),
    noSummary: vscode.l10n.t('No summary'),
    bindings: vscode.l10n.t('Bindings'),
    noBindings: vscode.l10n.t('No bindings'),
    actions: vscode.l10n.t('Actions'),
    rename: vscode.l10n.t('Rename'),
    addAlias: vscode.l10n.t('Add alias'),
    editAppearance: vscode.l10n.t('Edit appearance'),
    actionFailed: vscode.l10n.t('Inspector action failed.'),
  };
}

function safeScriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return character;
    }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getNonce(): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let index = 0; index < 32; index += 1) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

const NOOP_ENTITY_INSPECTOR_LOGGER: Pick<ILogger, 'warn'> = {
  warn: () => undefined,
};
