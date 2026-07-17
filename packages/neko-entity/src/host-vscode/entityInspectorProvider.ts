import * as vscode from 'vscode';
import {
  ENTITY_FACADE_COMMANDS,
  isCreativeEntityKind,
  isCreativeEntityRef,
  isEntityBindingWidgetAction,
  isEntityFacadeInspectEntityRequest,
  type CreativeEntityChangedRef,
  type CreativeEntityRef,
  type EntityBindingWidgetAction,
  type EntityFacadeInspectEntityRequest,
} from '@neko/shared';
import type { ILogger } from '@neko/shared';
import { projectEntityBindingAvailabilityText } from '../projections';
import {
  DASHBOARD_NEUTRAL_CREATIVE_ENTITY_SOURCE_COMMAND,
  isDashboardCreativeEntityDetail,
  isDashboardCreativeEntityRef,
  isDashboardCreativeEntitySource,
  toDashboardCreativeEntityId,
  type DashboardCreativeEntityDetail,
  type DashboardCreativeEntityEvent,
  type DashboardCreativeEntityRef,
  type DashboardCreativeEntitySource,
} from '@neko/shared/types/dashboard-creative-entity';

export interface EntityInspectorProviderOptions {
  readonly logger?: Pick<ILogger, 'warn'>;
  readonly executeCommand?: EntityInspectorCommandExecutor;
}

export type EntityInspectorCommandExecutor = (
  command: string,
  ...args: readonly unknown[]
) => Thenable<unknown>;

interface EntityInspectorState {
  readonly ref?: DashboardCreativeEntityRef;
  readonly entityRef?: CreativeEntityRef;
  readonly candidateId?: string;
  readonly detail?: DashboardCreativeEntityDetail;
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
  readonly requirements: string;
  readonly noRequirements: string;
  readonly actions: string;
  readonly rename: string;
  readonly addAlias: string;
  readonly editAppearance: string;
  readonly actionFailed: string;
}

interface RegisteredInspectorSource {
  readonly source: DashboardCreativeEntitySource;
  readonly subscription: { dispose(): void };
}

export class EntityInspectorProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewType = 'neko.entityInspector';

  private readonly logger: Pick<ILogger, 'warn'>;
  private readonly executeCommand: EntityInspectorCommandExecutor;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly sources = new Map<string, RegisteredInspectorSource>();
  private webviewView: vscode.WebviewView | undefined;
  private state: EntityInspectorState = {};
  private autoFollowTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingAutoFollow: EntityFacadeInspectEntityRequest | undefined;

  constructor(private readonly options: EntityInspectorProviderOptions = {}) {
    this.logger = options.logger ?? NOOP_ENTITY_INSPECTOR_LOGGER;
    this.executeCommand = options.executeCommand ?? vscode.commands.executeCommand;
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
    const ref = toInspectorDashboardRef(input, projectRoot);
    if (!ref) {
      return {
        ok: false,
        message: vscode.l10n.t('Inspector request requires entityRef or candidateId.'),
      };
    }

    const source = await this.getSource(projectRoot);
    const detail = await source.getDetail(ref);
    this.state = {
      ref,
      ...(input.entityRef ? { entityRef: input.entityRef } : {}),
      ...(input.candidateId ? { candidateId: input.candidateId } : {}),
      ...(detail ? { detail } : {}),
      ...(detail ? { bindingTexts: projectInspectorBindingTexts(detail) } : {}),
      ...(detail ? {} : { error: vscode.l10n.t('Entity detail is unavailable.') }),
    };
    if (input.reveal !== false) {
      await vscode.commands.executeCommand(`${EntityInspectorProvider.viewType}.focus`);
    }
    this.postState();
    return { ok: true };
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
    for (const registered of this.sources.values()) {
      registered.subscription.dispose();
    }
    this.sources.clear();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
  }

  private async refreshIfAffected(event: DashboardCreativeEntityEvent): Promise<void> {
    if (!this.state.ref || !isInspectorEventRelated(this.state.ref, event)) return;
    try {
      const nextEntityRef = resolveConfirmedCandidateEntityRef(this.state.candidateId, event);
      const projectRoot =
        nextEntityRef?.projectRoot ??
        this.state.ref.projectRoot ??
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!projectRoot) return;
      const nextRef = nextEntityRef
        ? toInspectorDashboardRef({ entityRef: nextEntityRef }, projectRoot)
        : this.state.ref;
      if (!nextRef) return;
      const source = await this.getSource(projectRoot);
      const detail = await source.getDetail(nextRef);
      const nextState: EntityInspectorState = nextEntityRef
        ? {
            ref: nextRef,
            entityRef: nextEntityRef,
            ...(detail ? { detail } : {}),
            ...(detail ? { bindingTexts: projectInspectorBindingTexts(detail) } : {}),
            ...(detail ? {} : { error: vscode.l10n.t('Entity detail is unavailable.') }),
          }
        : {
            ...this.state,
            ref: nextRef,
            ...(detail ? { detail } : {}),
            ...(detail ? { bindingTexts: projectInspectorBindingTexts(detail) } : {}),
            ...(detail ? {} : { error: vscode.l10n.t('Entity detail is unavailable.') }),
          };
      this.state = nextState;
      this.postState();
    } catch (error) {
      this.logger.warn('Entity Inspector refresh failed', error);
      this.state = {
        ...this.state,
        error: error instanceof Error ? error.message : String(error),
      };
      this.postState();
    }
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (!isEntityInspectorActionMessage(message)) {
      this.post({
        type: 'entityInspector.error',
        message: vscode.l10n.t('Invalid Inspector action.'),
      });
      return;
    }
    const entityRef =
      this.state.entityRef ??
      (this.state.detail ? detailToCreativeEntityRef(this.state.detail) : undefined);
    const result = await this.executeCommand(ENTITY_FACADE_COMMANDS.triggerBindingWidgetAction, {
      context: {
        surface: 'inspector',
        projectRoot: entityRef?.projectRoot,
      },
      action: message.action,
      ...(entityRef ? { entityRef } : {}),
      ...(this.state.candidateId ? { candidateId: this.state.candidateId } : {}),
      ...(message.payload ? { payload: message.payload } : {}),
    });
    this.post({ type: 'entityInspector.actionResult', result });
  }

  private async getSource(projectRoot: string): Promise<DashboardCreativeEntitySource> {
    const current = this.sources.get(projectRoot);
    if (current) return current.source;
    const candidate = await this.executeCommand(DASHBOARD_NEUTRAL_CREATIVE_ENTITY_SOURCE_COMMAND, {
      projectRoot,
    });
    if (!isDashboardCreativeEntitySource(candidate)) {
      throw new Error('Entity source is unavailable for the active workspace.');
    }
    const subscription = candidate.onDidChangeEntity((event) => {
      void this.refreshIfAffected(event);
    });
    const registered = { source: candidate, subscription };
    this.sources.set(projectRoot, registered);
    return registered.source;
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
    code { word-break: break-all; }
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
      const detail = state.detail;
      if (!detail) {
        root.className = 'muted';
        root.innerHTML = '<p>' + esc(strings.noEntitySelected) + '</p>' + (state.error ? '<p>' + esc(state.error) + '</p>' : '');
        return;
      }
      root.className = '';
      root.innerHTML =
        '<h2>' + esc(detail.label) + '</h2>' +
        '<div class="muted">' + esc(detail.kind) + ' · ' + esc(detail.status) + ' · ' + esc(detail.freshness) + '</div>' +
        '<div class="row"><h3>' + esc(strings.aliases) + '</h3><ul>' + list(detail.aliases, strings.noAliases) + '</ul></div>' +
        '<div class="row"><h3>' + esc(strings.summary) + '</h3><p>' + esc(detail.description || detail.metadata?.appearanceSummary || detail.metadata?.visualSummary || strings.noSummary) + '</p></div>' +
        '<div class="row"><h3>' + esc(strings.bindings) + '</h3><ul>' + list(state.bindingTexts || [], strings.noBindings) + '</ul></div>' +
        '<div class="row"><h3>' + esc(strings.requirements) + '</h3><ul>' + list((detail.requirements || []).map((req) => req.requiredKinds.join(', ') + ' · ' + req.status), strings.noRequirements) + '</ul></div>' +
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
    requirements: vscode.l10n.t('Requirements'),
    noRequirements: vscode.l10n.t('No requirements'),
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

function projectInspectorBindingTexts(detail: DashboardCreativeEntityDetail): readonly string[] {
  return detail.bindings.map((binding) => projectEntityBindingAvailabilityText(binding));
}

export function toInspectorDashboardRef(
  request: EntityFacadeInspectEntityRequest,
  projectRoot: string,
): DashboardCreativeEntityRef | undefined {
  if (request.entityRef) {
    return {
      source: 'neko-entity',
      sourceEntityId: `entity:${request.entityRef.entityId}`,
      entityId: request.entityRef.entityId,
      entityKind: request.entityRef.entityKind,
      projectRoot,
    };
  }
  if (request.candidateId) {
    return {
      source: 'neko-entity',
      sourceEntityId: request.candidateId,
      entityKind: 'character',
      projectRoot,
    };
  }
  return undefined;
}

export function isInspectorEventRelated(
  current: DashboardCreativeEntityRef,
  event: DashboardCreativeEntityEvent,
): boolean {
  if (
    event.ref &&
    toDashboardCreativeEntityId(event.ref) === toDashboardCreativeEntityId(current)
  ) {
    return true;
  }
  if (isCandidateDashboardRef(current)) {
    return (
      event.changedRefs?.some(
        (changedRef) => changedRef.kind === 'candidate' && changedRef.id === current.sourceEntityId,
      ) === true
    );
  }
  const currentEntityId = current.entityId;
  if (currentEntityId) {
    return (
      event.changedRefs?.some((changedRef) => {
        if (changedRef.entityRef) {
          return (
            changedRef.entityRef.entityId === currentEntityId &&
            changedRef.entityRef.entityKind === current.entityKind
          );
        }
        return (
          (changedRef.kind === 'entity' ||
            changedRef.kind === 'binding' ||
            changedRef.kind === 'requirement' ||
            changedRef.kind === 'visual-draft') &&
          changedRef.id === currentEntityId
        );
      }) === true
    );
  }
  return false;
}

function resolveConfirmedCandidateEntityRef(
  candidateId: string | undefined,
  event: DashboardCreativeEntityEvent,
): CreativeEntityRef | undefined {
  if (!candidateId) return undefined;
  const changedRef = event.changedRefs?.find(
    (candidateRef) => candidateRef.kind === 'candidate' && candidateRef.id === candidateId,
  );
  return changedRef?.entityRef;
}

function isCandidateDashboardRef(ref: DashboardCreativeEntityRef): boolean {
  return ref.sourceEntityId.startsWith('candidate:');
}

function isEntityInspectorActionMessage(value: unknown): value is EntityInspectorActionMessage {
  if (!isRecord(value)) return false;
  return (
    value['type'] === 'entityInspector.action' &&
    isEntityBindingWidgetAction(value['action']) &&
    (value['payload'] === undefined || isRecord(value['payload']))
  );
}

function detailToCreativeEntityRef(
  detail: DashboardCreativeEntityDetail,
): CreativeEntityRef | undefined {
  if (!isDashboardCreativeEntityDetail(detail)) return undefined;
  if (
    !detail.ref.entityId ||
    !isCreativeEntityKind(detail.ref.entityKind) ||
    !isCreativeEntityRef({
      entityId: detail.ref.entityId,
      entityKind: detail.ref.entityKind,
    })
  ) {
    return undefined;
  }
  return {
    entityId: detail.ref.entityId,
    entityKind: detail.ref.entityKind,
    ...(detail.ref.projectRoot ? { projectRoot: detail.ref.projectRoot } : {}),
    source: detail.ref.source,
  };
}

function sameCreativeEntityRef(left: CreativeEntityRef, right: CreativeEntityRef): boolean {
  return left.entityId === right.entityId && left.entityKind === right.entityKind;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
