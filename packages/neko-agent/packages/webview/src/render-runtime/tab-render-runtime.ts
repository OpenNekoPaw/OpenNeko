import type { AgentContextPayload } from '@neko/shared';
import {
  type SessionMode,
  type ShellExecutionMode,
  type TabType,
  type AgentQueuedMessageItem,
  type AgentSessionDiagnosticMessage,
  type AgentLlmConfig,
} from '@neko-agent/types';
import type {
  ComposerMenuState,
  EntryPromptMenu,
  GenCategory,
  GenerationParams,
  MessageAttachment,
  SelectedFileReference,
} from '@/components/ChatView/InputArea/types';
import {
  DEFAULT_AGENT_LLM_CONFIG,
  DEFAULT_COMPOSER_MENU_STATE,
  DEFAULT_GENERATION_PARAMS,
} from '@/components/ChatView/InputArea/types';
import type {
  MediaModelSelection,
  MediaUnderstandingSelection,
} from '@/components/ChatView/InputAreaContext';
import {
  createAgentMarkdownSessionRegistry,
  type AgentMarkdownSessionRegistry,
} from '@/markdown/agent-markdown-session-registry';
import {
  createConversationProjectionReplica,
  type ConversationProjectionReplica,
} from './conversation-projection-replica';
import {
  createProjectionAttachmentClient,
  type ConversationProjectionAttachmentFrame,
  type ProjectionAttachmentClient,
  type ProjectionAttachmentClientOptions,
} from './projection-attachment-client';

export interface TabViewportSnapshot {
  readonly followMode: 'follow-tail' | 'detached';
  readonly anchorMessageId?: string;
  readonly anchorOffset?: number;
}

const DEFAULT_TAB_VIEWPORT: TabViewportSnapshot = {
  followMode: 'follow-tail',
};

export type TabRenderRuntimeLifecycle = 'attaching' | 'ready' | 'detached' | 'disposed';
export type TabRenderVisibility = 'visible' | 'hidden';
export type TabComposerFocusTarget = 'none' | 'input';

export interface TabRenderBinding {
  readonly tabId: string;
  readonly conversationId: string;
}

export interface TabComposerCompositionState {
  readonly isComposing: boolean;
}

export interface TabComposerFocusState {
  readonly target: TabComposerFocusTarget;
  readonly requestRevision: number;
}

export interface TabRenderMenuState {
  readonly entryPrompt: EntryPromptMenu | null;
  readonly composer: Readonly<ComposerMenuState>;
}

export interface TabQueuedEditState {
  readonly requestId: number;
  readonly item: AgentQueuedMessageItem;
}

export interface TabRenderState {
  readonly modelConfigurationInitialized: boolean;
  readonly activeSurface: TabType;
  readonly inputValue: string;
  readonly attachedFiles: readonly MessageAttachment[];
  readonly selectedFileReferences: readonly SelectedFileReference[];
  readonly contextReferences: readonly AgentContextPayload[];
  readonly selectedModel: string;
  readonly mediaModelSelection: Readonly<MediaModelSelection>;
  readonly mediaUnderstandingSelection: Readonly<MediaUnderstandingSelection>;
  readonly sessionMode: SessionMode;
  readonly executionMode: ShellExecutionMode;
  readonly generationCategory: GenCategory;
  readonly generationParams: Readonly<GenerationParams>;
  readonly llmConfig: Readonly<AgentLlmConfig>;
  readonly composition: TabComposerCompositionState;
  readonly focus: TabComposerFocusState;
  readonly viewport: TabViewportSnapshot;
  readonly menus: TabRenderMenuState;
  readonly queuedEdit: TabQueuedEditState | null;
  readonly diagnostics: readonly AgentSessionDiagnosticMessage[];
}

export type TabRenderStateUpdate =
  Partial<TabRenderState> | ((state: TabRenderState) => Partial<TabRenderState>);

export interface TabRenderRetentionSnapshot {
  readonly isComposing: boolean;
  readonly hasDirtyInput: boolean;
  readonly revision: number;
}

export interface TabRenderStoreSnapshot extends TabRenderBinding {
  readonly visibility: TabRenderVisibility;
  readonly state: TabRenderState;
  readonly revision: number;
}

export interface TabRenderStore {
  getSnapshot(): TabRenderStoreSnapshot;
  getRetentionSnapshot(): TabRenderRetentionSnapshot;
  subscribe(listener: () => void): () => void;
  subscribeRetention(listener: () => void): () => void;
  updateState(update: TabRenderStateUpdate): void;
  setVisibility(visibility: TabRenderVisibility): void;
  dispose(): void;
}

export interface TabRenderRuntimeRetentionSnapshot extends Omit<
  TabRenderRetentionSnapshot,
  'revision'
> {
  readonly lifecycle: TabRenderRuntimeLifecycle;
  readonly revision: number;
}

export interface TabProjectionAttachmentBinding extends Pick<
  ProjectionAttachmentClientOptions,
  'send' | 'reportError'
> {
  readonly endpointEpoch: string;
  readonly attachmentId: string;
}

export interface TabRenderRuntime extends TabRenderBinding {
  readonly store: TabRenderStore;
  readonly projectionReplica: ConversationProjectionReplica;
  readonly markdownSessions: AgentMarkdownSessionRegistry;
  readonly projectionAttachment: ProjectionAttachmentClient | null;
  readonly lifecycle: TabRenderRuntimeLifecycle;
  getRetentionSnapshot(): TabRenderRuntimeRetentionSnapshot;
  subscribeRetention(listener: () => void): () => void;
  markReady(): void;
  beginAttach(): void;
  detach(): void;
  attachProjection(binding: TabProjectionAttachmentBinding): void;
  reattachProjection(
    binding: TabProjectionAttachmentBinding,
    reason: 'endpoint-replaced' | 'protocol-fatal',
  ): void;
  acceptProjectionFrame(frame: ConversationProjectionAttachmentFrame): void;
  detachProjection(reason: import('@neko-agent/types').ProjectionDetachMessage['reason']): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

export interface TabRenderRuntimeRegistry {
  readonly size: number;
  get(tabId: string): TabRenderRuntime | undefined;
  getByConversation(conversationId: string): readonly TabRenderRuntime[];
  require(tabId: string): TabRenderRuntime;
  reconcile(bindings: readonly TabRenderBinding[], activeTabId: string | null): boolean;
  dispose(): void;
}

export function createTabRenderRuntime(binding: TabRenderBinding): TabRenderRuntime {
  return new DefaultTabRenderRuntime(binding);
}

export function createTabRenderRuntimeRegistry(): TabRenderRuntimeRegistry {
  return new DefaultTabRenderRuntimeRegistry();
}

class DefaultTabRenderStore implements TabRenderStore {
  private snapshot: TabRenderStoreSnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly retentionListeners = new Set<() => void>();
  private retentionSnapshot: TabRenderRetentionSnapshot;
  private disposed = false;

  constructor(binding: TabRenderBinding) {
    const state = createInitialTabRenderState();
    this.snapshot = Object.freeze({
      ...binding,
      visibility: 'hidden',
      state,
      revision: 0,
    });
    this.retentionSnapshot = createTabRenderRetentionSnapshot(state, 0);
  }

  getSnapshot(): TabRenderStoreSnapshot {
    return this.snapshot;
  }

  getRetentionSnapshot(): TabRenderRetentionSnapshot {
    return this.retentionSnapshot;
  }

  subscribe(listener: () => void): () => void {
    this.assertActive();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeRetention(listener: () => void): () => void {
    this.assertActive();
    this.retentionListeners.add(listener);
    return () => this.retentionListeners.delete(listener);
  }

  updateState(update: TabRenderStateUpdate): void {
    this.assertActive();
    const patch = typeof update === 'function' ? update(this.snapshot.state) : update;
    if (Object.keys(patch).length === 0) return;
    const nextState = Object.freeze({ ...this.snapshot.state, ...patch });
    if (hasSameStateFields(this.snapshot.state, nextState)) return;
    const previousRetention = this.retentionSnapshot;
    this.commit({ state: nextState });
    const nextRetention = createTabRenderRetentionSnapshot(
      nextState,
      previousRetention.revision + 1,
    );
    if (hasSameRetentionFields(previousRetention, nextRetention)) return;
    this.retentionSnapshot = nextRetention;
    for (const listener of this.retentionListeners) listener();
  }

  setVisibility(visibility: TabRenderVisibility): void {
    this.assertActive();
    if (this.snapshot.visibility === visibility) return;
    this.commit({ visibility });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.clear();
    this.retentionListeners.clear();
  }

  private commit(patch: Partial<Pick<TabRenderStoreSnapshot, 'state' | 'visibility'>>): void {
    this.snapshot = Object.freeze({
      ...this.snapshot,
      ...patch,
      revision: this.snapshot.revision + 1,
    });
    for (const listener of this.listeners) listener();
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error(`Tab render store ${this.snapshot.tabId} is disposed.`);
    }
  }
}

class DefaultTabRenderRuntime implements TabRenderRuntime {
  readonly tabId: string;
  readonly conversationId: string;
  readonly store: TabRenderStore;
  readonly projectionReplica: ConversationProjectionReplica;
  readonly markdownSessions: AgentMarkdownSessionRegistry;
  private currentProjectionAttachment: ProjectionAttachmentClient | null = null;
  private currentLifecycle: TabRenderRuntimeLifecycle = 'attaching';
  private readonly retentionListeners = new Set<() => void>();
  private readonly unsubscribeStoreRetention: () => void;
  private retentionSnapshot: TabRenderRuntimeRetentionSnapshot;

  constructor(binding: TabRenderBinding) {
    assertBinding(binding);
    this.tabId = binding.tabId;
    this.conversationId = binding.conversationId;
    this.projectionReplica = createConversationProjectionReplica(binding.conversationId);
    this.markdownSessions = createAgentMarkdownSessionRegistry();
    this.store = new DefaultTabRenderStore({
      tabId: binding.tabId,
      conversationId: binding.conversationId,
    });
    this.retentionSnapshot = createTabRenderRuntimeRetentionSnapshot(
      this.currentLifecycle,
      this.store.getRetentionSnapshot(),
      0,
    );
    this.unsubscribeStoreRetention = this.store.subscribeRetention(() => this.publishRetention());
  }

  get lifecycle(): TabRenderRuntimeLifecycle {
    return this.currentLifecycle;
  }

  get projectionAttachment(): ProjectionAttachmentClient | null {
    return this.currentProjectionAttachment;
  }

  getRetentionSnapshot(): TabRenderRuntimeRetentionSnapshot {
    return this.retentionSnapshot;
  }

  subscribeRetention(listener: () => void): () => void {
    if (this.currentLifecycle === 'disposed') {
      throw new Error(`Tab render runtime ${this.tabId} is disposed.`);
    }
    this.retentionListeners.add(listener);
    return () => this.retentionListeners.delete(listener);
  }

  markReady(): void {
    this.assertLifecycle('attaching', 'become ready');
    this.currentLifecycle = 'ready';
    this.publishRetention();
  }

  beginAttach(): void {
    this.assertLifecycle('detached', 'begin attaching');
    this.currentLifecycle = 'attaching';
    this.publishRetention();
  }

  detach(): void {
    if (this.currentLifecycle !== 'attaching' && this.currentLifecycle !== 'ready') {
      throw new Error(
        `Tab render runtime ${this.tabId} cannot detach from ${this.currentLifecycle}.`,
      );
    }
    this.currentLifecycle = 'detached';
    this.publishRetention();
  }

  attachProjection(binding: TabProjectionAttachmentBinding): void {
    if (this.currentLifecycle === 'disposed') {
      throw new Error(`Tab render runtime ${this.tabId} is disposed.`);
    }
    const current = this.currentProjectionAttachment;
    if (
      current &&
      current.getSnapshot().phase !== 'detached' &&
      current.getSnapshot().phase !== 'fatal'
    ) {
      throw new Error(
        `Tab render runtime ${this.tabId} already owns projection attachment ${current.getSnapshot().key?.attachmentId ?? 'unknown'}.`,
      );
    }
    const client = createProjectionAttachmentClient({
      tabId: this.tabId,
      conversationId: this.conversationId,
      replica: {
        installSnapshot: (snapshot) => {
          const projectionPublication = this.projectionReplica.prepareSnapshot(snapshot);
          const markdownPublication = this.markdownSessions.commitProjectionSnapshot(snapshot);
          projectionPublication.publish();
          markdownPublication.publish();
        },
        applyPatch: (patch) => {
          const projectionPublication = this.projectionReplica.preparePatch(patch);
          const markdownPublication = this.markdownSessions.commitProjectionPatch(patch);
          projectionPublication.publish();
          markdownPublication.publish();
        },
      },
      send: binding.send,
      reportError: binding.reportError,
    });
    this.currentProjectionAttachment = client;
    client.attach({
      endpointEpoch: binding.endpointEpoch,
      attachmentId: binding.attachmentId,
    });
  }

  reattachProjection(
    binding: TabProjectionAttachmentBinding,
    reason: 'endpoint-replaced' | 'protocol-fatal',
  ): void {
    if (this.currentLifecycle === 'disposed') {
      throw new Error(`Tab render runtime ${this.tabId} is disposed.`);
    }
    const current = this.currentProjectionAttachment;
    if (current) {
      if (reason === 'endpoint-replaced') {
        current.abandon();
      } else {
        current.detach('protocol-fatal');
      }
      current.dispose();
      this.currentProjectionAttachment = null;
    }
    this.attachProjection(binding);
  }

  acceptProjectionFrame(frame: ConversationProjectionAttachmentFrame): void {
    if (this.currentLifecycle === 'disposed') {
      throw new Error(`Tab render runtime ${this.tabId} is disposed.`);
    }
    const client = this.currentProjectionAttachment;
    if (!client) {
      throw new Error(`Tab render runtime ${this.tabId} has no projection attachment.`);
    }
    client.accept(frame);
  }

  detachProjection(reason: import('@neko-agent/types').ProjectionDetachMessage['reason']): void {
    if (this.currentLifecycle === 'disposed') {
      throw new Error(`Tab render runtime ${this.tabId} is disposed.`);
    }
    this.currentProjectionAttachment?.detach(reason);
  }

  setVisible(visible: boolean): void {
    if (this.currentLifecycle === 'disposed') {
      throw new Error(`Tab render runtime ${this.tabId} is disposed.`);
    }
    this.store.setVisibility(visible ? 'visible' : 'hidden');
  }

  dispose(): void {
    if (this.currentLifecycle === 'disposed') return;
    this.currentLifecycle = 'disposed';
    this.unsubscribeStoreRetention();
    this.retentionListeners.clear();
    this.currentProjectionAttachment?.dispose();
    this.currentProjectionAttachment = null;
    this.projectionReplica.dispose();
    this.markdownSessions.disposeAll();
    this.store.dispose();
  }

  private publishRetention(): void {
    const next = createTabRenderRuntimeRetentionSnapshot(
      this.currentLifecycle,
      this.store.getRetentionSnapshot(),
      this.retentionSnapshot.revision + 1,
    );
    if (
      next.lifecycle === this.retentionSnapshot.lifecycle &&
      next.isComposing === this.retentionSnapshot.isComposing &&
      next.hasDirtyInput === this.retentionSnapshot.hasDirtyInput
    ) {
      return;
    }
    this.retentionSnapshot = next;
    for (const listener of this.retentionListeners) listener();
  }

  private assertLifecycle(expected: TabRenderRuntimeLifecycle, operation: string): void {
    if (this.currentLifecycle !== expected) {
      throw new Error(
        `Tab render runtime ${this.tabId} cannot ${operation} from ${this.currentLifecycle}.`,
      );
    }
  }
}

class DefaultTabRenderRuntimeRegistry implements TabRenderRuntimeRegistry {
  private readonly runtimes = new Map<string, TabRenderRuntime>();
  private disposed = false;

  get size(): number {
    return this.runtimes.size;
  }

  get(tabId: string): TabRenderRuntime | undefined {
    return this.runtimes.get(tabId);
  }

  getByConversation(conversationId: string): readonly TabRenderRuntime[] {
    this.assertActive();
    if (conversationId.length === 0) {
      throw new Error('Conversation ID is required to query Tab render runtimes.');
    }
    return [...this.runtimes.values()].filter(
      (runtime) => runtime.conversationId === conversationId,
    );
  }

  require(tabId: string): TabRenderRuntime {
    const runtime = this.runtimes.get(tabId);
    if (!runtime) {
      throw new Error(`Tab render runtime ${tabId} is not registered.`);
    }
    return runtime;
  }

  reconcile(bindings: readonly TabRenderBinding[], activeTabId: string | null): boolean {
    this.assertActive();
    let changed = false;
    const nextBindings = new Map<string, TabRenderBinding>();
    for (const binding of bindings) {
      assertBinding(binding);
      if (nextBindings.has(binding.tabId)) {
        throw new Error(`Duplicate Tab render binding for ${binding.tabId}.`);
      }
      nextBindings.set(binding.tabId, binding);
    }
    if (activeTabId !== null && !nextBindings.has(activeTabId)) {
      throw new Error(`Active Tab ${activeTabId} has no open render binding.`);
    }

    for (const [tabId, runtime] of this.runtimes) {
      const binding = nextBindings.get(tabId);
      if (binding && runtime.conversationId !== binding.conversationId) {
        throw new Error(
          `Tab render runtime ${tabId} is bound to ${runtime.conversationId} and cannot rebind to ${binding.conversationId}.`,
        );
      }
    }

    for (const [tabId, runtime] of this.runtimes) {
      if (!nextBindings.has(tabId)) {
        runtime.dispose();
        this.runtimes.delete(tabId);
        changed = true;
      }
    }

    for (const binding of nextBindings.values()) {
      let runtime = this.runtimes.get(binding.tabId);
      if (!runtime) {
        runtime = createTabRenderRuntime(binding);
        runtime.markReady();
        this.runtimes.set(binding.tabId, runtime);
        changed = true;
      }
      if (
        runtime.store.getSnapshot().visibility !==
        (binding.tabId === activeTabId ? 'visible' : 'hidden')
      ) {
        changed = true;
      }
      runtime.setVisible(binding.tabId === activeTabId);
    }
    return changed;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const runtime of this.runtimes.values()) runtime.dispose();
    this.runtimes.clear();
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error('Tab render runtime registry is disposed.');
    }
  }
}

function createTabRenderRuntimeRetentionSnapshot(
  lifecycle: TabRenderRuntimeLifecycle,
  store: TabRenderRetentionSnapshot,
  revision: number,
): TabRenderRuntimeRetentionSnapshot {
  return Object.freeze({
    lifecycle,
    isComposing: store.isComposing,
    hasDirtyInput: store.hasDirtyInput,
    revision,
  });
}

function createTabRenderRetentionSnapshot(
  state: TabRenderState,
  revision: number,
): TabRenderRetentionSnapshot {
  return Object.freeze({
    isComposing: state.composition.isComposing,
    hasDirtyInput: Boolean(
      state.inputValue.length > 0 ||
      state.attachedFiles.length > 0 ||
      state.selectedFileReferences.length > 0 ||
      state.contextReferences.length > 0 ||
      state.queuedEdit !== null,
    ),
    revision,
  });
}

function hasSameRetentionFields(
  previous: TabRenderRetentionSnapshot,
  next: TabRenderRetentionSnapshot,
): boolean {
  return previous.isComposing === next.isComposing && previous.hasDirtyInput === next.hasDirtyInput;
}

function createInitialTabRenderState(): TabRenderState {
  return Object.freeze({
    modelConfigurationInitialized: false,
    activeSurface: 'chat',
    inputValue: '',
    attachedFiles: Object.freeze([]),
    selectedFileReferences: Object.freeze([]),
    contextReferences: Object.freeze([]),
    selectedModel: '',
    mediaModelSelection: Object.freeze({ image: 'none', video: 'none', audio: 'none' }),
    mediaUnderstandingSelection: Object.freeze({ image: 'auto', video: 'auto', audio: 'auto' }),
    sessionMode: 'agent',
    executionMode: 'ask',
    generationCategory: 'image',
    generationParams: Object.freeze({ ...DEFAULT_GENERATION_PARAMS }),
    llmConfig: Object.freeze({ ...DEFAULT_AGENT_LLM_CONFIG }),
    composition: Object.freeze({ isComposing: false }),
    focus: Object.freeze({ target: 'none', requestRevision: 0 }),
    viewport: Object.freeze({ ...DEFAULT_TAB_VIEWPORT }),
    menus: Object.freeze({
      entryPrompt: null,
      composer: Object.freeze({
        ...DEFAULT_COMPOSER_MENU_STATE,
        slash: Object.freeze({ ...DEFAULT_COMPOSER_MENU_STATE.slash }),
        skill: Object.freeze({ ...DEFAULT_COMPOSER_MENU_STATE.skill }),
        mention: Object.freeze({ ...DEFAULT_COMPOSER_MENU_STATE.mention }),
        controls: Object.freeze({ ...DEFAULT_COMPOSER_MENU_STATE.controls }),
      }),
    }),
    queuedEdit: null,
    diagnostics: Object.freeze([]),
  });
}

function hasSameStateFields(previous: TabRenderState, next: TabRenderState): boolean {
  const keys = Object.keys(next) as Array<keyof TabRenderState>;
  return keys.every((key) => Object.is(previous[key], next[key]));
}

function assertBinding(binding: TabRenderBinding): void {
  if (binding.tabId.trim().length === 0) {
    throw new Error('tabId is required for a Tab render runtime.');
  }
  if (binding.conversationId.trim().length === 0) {
    throw new Error('conversationId is required for a Tab render runtime.');
  }
}
