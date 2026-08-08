import type {
  TabRenderBinding,
  TabRenderRuntimeRegistry,
  TabRenderState,
  TabRenderStateUpdate,
} from './tab-render-runtime';
import {
  parseAgentBoundDomainBinding,
  type AgentContextPayload,
  type AgentBoundDomainBinding,
} from '@neko/agent-contracts';

export interface TabRenderDraftSnapshot extends TabRenderBinding {
  readonly inputValue: string;
  readonly viewport: TabRenderState['viewport'];
}

export interface AgentEntryDraftSnapshot {
  readonly draftId: string;
  readonly inputValue: string;
  readonly contextReferences: readonly AgentContextPayload[];
  readonly workspaceTarget?: {
    readonly label: string;
    readonly context: Extract<AgentBoundDomainBinding, { readonly kind: 'workspace' }>;
  };
  readonly selectedModel: string;
  readonly executionMode: 'plan' | 'ask' | 'auto';
}

export interface TabRenderRealmState {
  readonly drafts: readonly TabRenderDraftSnapshot[];
  readonly entryDraft?: AgentEntryDraftSnapshot;
}

export interface TabRenderRealmStateDiagnostic {
  readonly code:
    | 'invalid-realm-state'
    | 'invalid-draft'
    | 'invalid-entry-draft'
    | 'duplicate-draft'
    | 'draft-owner-mismatch'
    | 'entry-draft-owner-mismatch';
  readonly message: string;
  readonly draftIndex?: number;
  readonly tabId?: string;
}

export interface ParsedTabRenderRealmState {
  readonly state: TabRenderRealmState;
  readonly diagnostics: readonly TabRenderRealmStateDiagnostic[];
}

export interface TabRenderRealmStateCoordinator {
  reconcile(bindings: readonly TabRenderBinding[]): boolean;
  getDiagnostics(): readonly TabRenderRealmStateDiagnostic[];
  flush(): void;
  dispose(): void;
}

export interface TabRenderRealmStateHost {
  getState(): unknown;
  setState(state: TabRenderRealmState): void;
  reportStateDiagnostic?(diagnostic: TabRenderRealmStateDiagnostic): void;
}

export interface AgentEntryDraftSnapshotReadResult {
  readonly snapshot?: AgentEntryDraftSnapshot;
  readonly diagnostics: readonly TabRenderRealmStateDiagnostic[];
}

export function createTabRenderRealmStateCoordinator(
  host: TabRenderRealmStateHost,
  registry: TabRenderRuntimeRegistry,
): TabRenderRealmStateCoordinator {
  return new DefaultTabRenderRealmStateCoordinator(host, registry);
}

export function parseTabRenderRealmState(value: unknown): ParsedTabRenderRealmState {
  if (value === undefined) return { state: { drafts: [] }, diagnostics: [] };
  if (!isRecord(value)) {
    return invalidRealmState('Agent Tab render realm state must be an object.');
  }
  if (!Array.isArray(value.drafts)) {
    return invalidRealmState('Agent Tab render realm state drafts must be an array.');
  }
  const drafts: TabRenderDraftSnapshot[] = [];
  const diagnostics: TabRenderRealmStateDiagnostic[] = [];
  const tabIds = new Set<string>();
  for (const [index, valueDraft] of value.drafts.entries()) {
    let draft: TabRenderDraftSnapshot;
    try {
      draft = parseDraft(valueDraft, index);
    } catch (error) {
      diagnostics.push({
        code: 'invalid-draft',
        message: error instanceof Error ? error.message : `Agent Tab draft ${index} is invalid.`,
        draftIndex: index,
        ...(readTabId(valueDraft) ? { tabId: readTabId(valueDraft) } : {}),
      });
      continue;
    }
    if (tabIds.has(draft.tabId)) {
      diagnostics.push({
        code: 'duplicate-draft',
        message: `Duplicate persisted Agent Tab draft for ${draft.tabId}.`,
        draftIndex: index,
        tabId: draft.tabId,
      });
      continue;
    }
    tabIds.add(draft.tabId);
    drafts.push(draft);
  }
  let entryDraft: AgentEntryDraftSnapshot | undefined;
  if (value.entryDraft !== undefined) {
    try {
      entryDraft = parseEntryDraft(value.entryDraft);
    } catch (error) {
      diagnostics.push({
        code: 'invalid-entry-draft',
        message: error instanceof Error ? error.message : 'Agent entry draft snapshot is invalid.',
      });
    }
  }
  return {
    state: { drafts, ...(entryDraft === undefined ? {} : { entryDraft }) },
    diagnostics,
  };
}

export function readAgentEntryDraftSnapshot(
  host: Pick<TabRenderRealmStateHost, 'getState'>,
  draftId: string,
): AgentEntryDraftSnapshotReadResult {
  const exactDraftId = nonEmptyString(draftId, 'Agent entry draft identity');
  const parsed = parseTabRenderRealmState(host.getState());
  const snapshot = parsed.state.entryDraft;
  if (snapshot === undefined || snapshot.draftId === exactDraftId) {
    return {
      ...(snapshot === undefined ? {} : { snapshot }),
      diagnostics: parsed.diagnostics,
    };
  }
  return {
    diagnostics: [
      ...parsed.diagnostics,
      {
        code: 'entry-draft-owner-mismatch',
        message: `Persisted Agent entry draft belongs to ${snapshot.draftId}, not ${exactDraftId}.`,
      },
    ],
  };
}

export function writeAgentEntryDraftSnapshot(
  host: Pick<TabRenderRealmStateHost, 'getState' | 'setState'>,
  snapshot: AgentEntryDraftSnapshot | undefined,
): void {
  const current = parseTabRenderRealmState(host.getState()).state;
  const entryDraft = snapshot === undefined ? undefined : parseEntryDraft(snapshot);
  host.setState({
    drafts: current.drafts,
    ...(entryDraft === undefined ? {} : { entryDraft }),
  });
}

class DefaultTabRenderRealmStateCoordinator implements TabRenderRealmStateCoordinator {
  private readonly drafts = new Map<string, TabRenderDraftSnapshot>();
  private readonly subscriptions = new Map<string, () => void>();
  private readonly restoredTabIds = new Set<string>();
  private readonly knownBindings = new Map<string, string>();
  private readonly diagnostics: TabRenderRealmStateDiagnostic[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  constructor(
    private readonly host: TabRenderRealmStateHost,
    private readonly registry: TabRenderRuntimeRegistry,
  ) {
    const persistedState = host.getState();
    const parsed = parseTabRenderRealmState(persistedState);
    for (const diagnostic of parsed.diagnostics) this.reportDiagnostic(diagnostic);
    for (const draft of parsed.state.drafts) {
      this.drafts.set(draft.tabId, draft);
    }
  }

  reconcile(bindings: readonly TabRenderBinding[]): boolean {
    this.assertActive();
    let changed = false;
    const nextBindings = new Map<string, string>();
    for (const binding of bindings) {
      if (nextBindings.has(binding.tabId)) {
        throw new Error(`Duplicate Tab draft binding for ${binding.tabId}.`);
      }
      nextBindings.set(binding.tabId, binding.conversationId);
      let persisted = this.drafts.get(binding.tabId);
      if (persisted && persisted.conversationId !== binding.conversationId) {
        this.reportDiagnostic({
          code: 'draft-owner-mismatch',
          message: `Persisted Tab draft ${binding.tabId} belongs to ${persisted.conversationId}, not ${binding.conversationId}.`,
          tabId: binding.tabId,
        });
        this.drafts.delete(binding.tabId);
        persisted = undefined;
      }
      const runtime = this.registry.require(binding.tabId);
      if (!this.restoredTabIds.has(binding.tabId)) {
        if (persisted) {
          runtime.store.updateState(toStateUpdate(persisted));
          changed = true;
        }
        this.restoredTabIds.add(binding.tabId);
      }
      if (!this.subscriptions.has(binding.tabId)) {
        this.subscriptions.set(
          binding.tabId,
          runtime.store.subscribe(() => {
            const nextDraft = projectDraft(runtime.store.getSnapshot().state, binding);
            const previousDraft = this.drafts.get(binding.tabId);
            if (previousDraft && hasSameDraft(previousDraft, nextDraft)) return;
            this.drafts.set(binding.tabId, nextDraft);
            this.scheduleFlush();
          }),
        );
      }
    }

    for (const [tabId] of this.knownBindings) {
      if (nextBindings.has(tabId)) continue;
      this.subscriptions.get(tabId)?.();
      this.subscriptions.delete(tabId);
      this.restoredTabIds.delete(tabId);
      this.drafts.delete(tabId);
      this.scheduleFlush();
      changed = true;
    }
    this.knownBindings.clear();
    for (const [tabId, conversationId] of nextBindings) {
      this.knownBindings.set(tabId, conversationId);
    }
    return changed;
  }

  getDiagnostics(): readonly TabRenderRealmStateDiagnostic[] {
    return this.diagnostics;
  }

  flush(): void {
    this.assertActive();
    if (this.flushTimer !== undefined) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    const entryDraft = parseTabRenderRealmState(this.host.getState()).state.entryDraft;
    this.host.setState({
      drafts: [...this.drafts.values()],
      ...(entryDraft === undefined ? {} : { entryDraft }),
    });
  }

  dispose(): void {
    if (this.disposed) return;
    if (this.flushTimer !== undefined) this.flush();
    this.disposed = true;
    for (const unsubscribe of this.subscriptions.values()) unsubscribe();
    this.subscriptions.clear();
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== undefined) return;
    this.flushTimer = setTimeout(() => this.flush(), 100);
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('Agent Tab render realm state coordinator is disposed.');
  }

  private reportDiagnostic(diagnostic: TabRenderRealmStateDiagnostic): void {
    this.diagnostics.push(diagnostic);
    this.host.reportStateDiagnostic?.(diagnostic);
  }
}

function projectDraft(state: TabRenderState, binding: TabRenderBinding): TabRenderDraftSnapshot {
  return {
    ...binding,
    inputValue: state.inputValue,
    viewport: { ...state.viewport },
  };
}

function toStateUpdate(draft: TabRenderDraftSnapshot): TabRenderStateUpdate {
  return {
    inputValue: draft.inputValue,
    viewport: draft.viewport,
  };
}

function hasSameDraft(left: TabRenderDraftSnapshot, right: TabRenderDraftSnapshot): boolean {
  return (
    left.tabId === right.tabId &&
    left.conversationId === right.conversationId &&
    left.inputValue === right.inputValue &&
    left.viewport.followMode === right.viewport.followMode &&
    left.viewport.anchorMessageId === right.viewport.anchorMessageId &&
    left.viewport.anchorOffset === right.viewport.anchorOffset
  );
}

function parseDraft(value: unknown, index: number): TabRenderDraftSnapshot {
  const path = `Agent Tab draft ${index}`;
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);
  const tabId = nonEmptyString(value.tabId, `${path}.tabId`);
  const conversationId = nonEmptyString(value.conversationId, `${path}.conversationId`);
  const inputValue = stringValue(value.inputValue, `${path}.inputValue`);
  return {
    tabId,
    conversationId,
    inputValue,
    viewport: parseViewport(value.viewport, `${path}.viewport`),
  };
}

function parseEntryDraft(value: unknown): AgentEntryDraftSnapshot {
  const path = 'Agent entry draft snapshot';
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);
  const contextReferences = value.contextReferences;
  if (!Array.isArray(contextReferences)) {
    throw new Error(`${path}.contextReferences must be an array.`);
  }
  const workspaceTarget = parseEntryWorkspaceTarget(value.workspaceTarget, path);
  return {
    draftId: nonEmptyString(value.draftId, `${path}.draftId`),
    inputValue: stringValue(value.inputValue, `${path}.inputValue`),
    contextReferences: contextReferences.map((reference, index) =>
      parseEntryContextReference(reference, `${path}.contextReferences[${index}]`),
    ),
    ...(workspaceTarget === undefined ? {} : { workspaceTarget }),
    selectedModel: stringValue(value.selectedModel, `${path}.selectedModel`),
    executionMode: enumValue(value.executionMode, ['plan', 'ask', 'auto'], `${path}.executionMode`),
  };
}

function parseEntryWorkspaceTarget(
  value: unknown,
  path: string,
): AgentEntryDraftSnapshot['workspaceTarget'] {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error(`${path}.workspaceTarget must be an object.`);
  const context = parseAgentBoundDomainBinding(value.context);
  if (context.kind !== 'workspace') {
    throw new Error(`${path}.workspaceTarget.context must be Workspace-bound.`);
  }
  return {
    label: nonEmptyString(value.label, `${path}.workspaceTarget.label`),
    context,
  };
}

function parseEntryContextReference(value: unknown, path: string): AgentContextPayload {
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);
  const type = enumValue(
    value.type,
    [
      'canvas-node',
      'cut-clip',
      'story-selection',
      'character',
      'scene',
      'asset',
      'media',
      'entity',
      'sketch-layer',
      '3d-reference',
      'audio-clip',
      'file',
      'image',
      'document-selection',
      'canvas-storyboard-action-intent',
    ] as const,
    `${path}.type`,
  );
  if (!('data' in value)) throw new Error(`${path}.data is required.`);
  const intent = optionalString(value.intent, `${path}.intent`);
  return {
    type,
    id: nonEmptyString(value.id, `${path}.id`),
    label: nonEmptyString(value.label, `${path}.label`),
    summary: stringValue(value.summary, `${path}.summary`),
    data: value.data,
    ...(intent === undefined ? {} : { intent }),
  };
}

function parseViewport(value: unknown, path: string): TabRenderState['viewport'] {
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);
  const followMode = enumValue(value.followMode, ['follow-tail', 'detached'], `${path}.followMode`);
  const anchorMessageId = optionalNonEmptyString(value.anchorMessageId, `${path}.anchorMessageId`);
  const anchorOffset = optionalFiniteNumber(value.anchorOffset, `${path}.anchorOffset`);
  return {
    followMode,
    ...(anchorMessageId === undefined ? {} : { anchorMessageId }),
    ...(anchorOffset === undefined ? {} : { anchorOffset }),
  };
}

function enumValue<const T extends string | number>(
  value: unknown,
  allowed: readonly T[],
  path: string,
): T {
  for (const candidate of allowed) {
    if (value === candidate) return candidate;
  }
  throw new Error(`${path} has an unsupported value.`);
}

function nonEmptyString(value: unknown, path: string): string {
  const result = stringValue(value, path);
  if (result.trim().length === 0) throw new Error(`${path} must be non-empty.`);
  return result;
}

function stringValue(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new Error(`${path} must be a string.`);
  return value;
}

function optionalNonEmptyString(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  return nonEmptyString(value, path);
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  return stringValue(value, path);
}

function optionalFiniteNumber(value: unknown, path: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidRealmState(message: string): ParsedTabRenderRealmState {
  return {
    state: { drafts: [] },
    diagnostics: [{ code: 'invalid-realm-state', message }],
  };
}

function readTabId(value: unknown): string | undefined {
  return isRecord(value) && isNonEmptyString(value.tabId) ? value.tabId : undefined;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
