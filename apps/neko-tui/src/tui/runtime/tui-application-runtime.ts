import { randomUUID } from 'node:crypto';
import type { CLIConfig } from '../core/types';
import type { TerminalSize } from '../types/state';
import { createAgentStore, type AgentStore } from '../stores/agent-store';
import { createConfigStore, type ConfigStore } from '../stores/config-store';
import { createConversationStore, type ConversationStore } from '../stores/conversation-store';
import { createUIStore, type UIStore } from '../stores/ui-store';
import {
  OpenNekoCredentialStore,
  type UserCredentialPersistence,
} from '@neko/agent/pi';

export type TuiRuntimeLifecycle = 'ready' | 'disposed';

export interface TuiConversationStores {
  readonly agent: AgentStore;
  readonly config: ConfigStore;
  readonly conversation: ConversationStore;
  readonly ui: UIStore;
}

export interface TuiConversationRuntime {
  readonly runtimeId: string;
  readonly conversationId: string | null;
  readonly lifecycle: TuiRuntimeLifecycle;
  readonly stores: TuiConversationStores;
  bindConversationId(conversationId: string): void;
}

export interface TuiApplicationRuntimeSnapshot {
  readonly lifecycle: TuiRuntimeLifecycle;
  readonly activeRuntimeId: string | null;
  readonly runtimeIds: readonly string[];
}

export interface CreateTuiConversationRuntimeOptions {
  readonly config: CLIConfig;
  readonly conversationId?: string;
  readonly terminalSize?: TerminalSize;
  readonly runtimeId?: string;
  readonly activate?: boolean;
}

export interface AgentTuiApplicationRuntime {
  readonly applicationId: string;
  readonly credentials: OpenNekoCredentialStore;
  getSnapshot(): TuiApplicationRuntimeSnapshot;
  subscribe(listener: () => void): () => void;
  createConversation(options: CreateTuiConversationRuntimeOptions): TuiConversationRuntime;
  findConversation(conversationId: string): TuiConversationRuntime | undefined;
  requireRuntime(runtimeId: string): TuiConversationRuntime;
  requireConversation(conversationId: string): TuiConversationRuntime;
  requireActiveConversation(): TuiConversationRuntime;
  activateRuntime(runtimeId: string): void;
  activateConversation(conversationId: string): void;
  disposeConversation(runtimeId: string): void;
  dispose(): void;
}

export type TuiRuntimeDiagnosticCode =
  | 'application-disposed'
  | 'conversation-runtime-disposed'
  | 'conversation-runtime-not-found'
  | 'conversation-not-found'
  | 'conversation-owner-mismatch'
  | 'duplicate-conversation-owner'
  | 'duplicate-runtime-id'
  | 'missing-active-conversation';

class TuiRuntimeError extends Error {
  public override readonly name = 'TuiRuntimeError';

  public constructor(
    public readonly code: TuiRuntimeDiagnosticCode,
    public readonly metadata: Readonly<Record<string, string>> = {},
  ) {
    super(code);
  }
}

export function createAgentTuiApplicationRuntime(
  credentialPersistence: UserCredentialPersistence,
  applicationId: string = `tui-app-${randomUUID()}`,
): AgentTuiApplicationRuntime {
  return new DefaultAgentTuiApplicationRuntime(applicationId, credentialPersistence);
}

class DefaultAgentTuiApplicationRuntime implements AgentTuiApplicationRuntime {
  private readonly runtimes = new Map<string, DefaultTuiConversationRuntime>();
  private readonly runtimeIdsByConversation = new Map<string, string>();
  private readonly listeners = new Set<() => void>();
  private snapshot: TuiApplicationRuntimeSnapshot = {
    lifecycle: 'ready',
    activeRuntimeId: null,
    runtimeIds: [],
  };

  public readonly credentials: OpenNekoCredentialStore;

  public constructor(
    public readonly applicationId: string,
    credentialPersistence: UserCredentialPersistence,
  ) {
    this.credentials = new OpenNekoCredentialStore(credentialPersistence);
  }

  public getSnapshot(): TuiApplicationRuntimeSnapshot {
    return this.snapshot;
  }

  public subscribe(listener: () => void): () => void {
    this.assertReady();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public createConversation(options: CreateTuiConversationRuntimeOptions): TuiConversationRuntime {
    this.assertReady();
    const runtimeId = options.runtimeId ?? `tui-conversation-${randomUUID()}`;
    if (this.runtimes.has(runtimeId)) {
      throw new TuiRuntimeError('duplicate-runtime-id', { runtimeId });
    }
    if (options.conversationId) {
      this.assertConversationUnowned(options.conversationId);
    }

    const runtime = new DefaultTuiConversationRuntime({
      runtimeId,
      config: options.config,
      conversationId: options.conversationId,
      terminalSize: options.terminalSize,
      bindConversation: (conversationId) => {
        this.assertReady();
        this.assertConversationUnowned(conversationId, runtimeId);
        this.runtimeIdsByConversation.set(conversationId, runtimeId);
        this.emit();
      },
    });
    this.runtimes.set(runtimeId, runtime);
    if (options.conversationId) {
      this.runtimeIdsByConversation.set(options.conversationId, runtimeId);
    }
    const shouldActivate = options.activate ?? this.snapshot.activeRuntimeId === null;
    this.updateSnapshot(shouldActivate ? runtimeId : this.snapshot.activeRuntimeId);
    return runtime;
  }

  public requireRuntime(runtimeId: string): TuiConversationRuntime {
    this.assertReady();
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      throw new TuiRuntimeError('conversation-runtime-not-found', { runtimeId });
    }
    runtime.assertReady();
    return runtime;
  }

  public requireConversation(conversationId: string): TuiConversationRuntime {
    this.assertReady();
    const runtimeId = this.runtimeIdsByConversation.get(conversationId);
    if (!runtimeId) {
      throw new TuiRuntimeError('conversation-not-found', { conversationId });
    }
    return this.requireRuntime(runtimeId);
  }

  public findConversation(conversationId: string): TuiConversationRuntime | undefined {
    this.assertReady();
    const runtimeId = this.runtimeIdsByConversation.get(conversationId);
    return runtimeId ? this.runtimes.get(runtimeId) : undefined;
  }

  public requireActiveConversation(): TuiConversationRuntime {
    this.assertReady();
    const runtimeId = this.snapshot.activeRuntimeId;
    if (!runtimeId) {
      throw new TuiRuntimeError('missing-active-conversation');
    }
    return this.requireRuntime(runtimeId);
  }

  public activateRuntime(runtimeId: string): void {
    this.requireRuntime(runtimeId);
    if (this.snapshot.activeRuntimeId !== runtimeId) {
      this.updateSnapshot(runtimeId);
    }
  }

  public activateConversation(conversationId: string): void {
    this.activateRuntime(this.requireConversation(conversationId).runtimeId);
  }

  public disposeConversation(runtimeId: string): void {
    this.assertReady();
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      throw new TuiRuntimeError('conversation-runtime-not-found', { runtimeId });
    }
    runtime.dispose();
    this.runtimes.delete(runtimeId);
    if (runtime.conversationId) {
      this.runtimeIdsByConversation.delete(runtime.conversationId);
    }
    this.updateSnapshot(
      this.snapshot.activeRuntimeId === runtimeId ? null : this.snapshot.activeRuntimeId,
    );
  }

  public dispose(): void {
    if (this.snapshot.lifecycle === 'disposed') {
      return;
    }
    for (const runtime of this.runtimes.values()) {
      runtime.dispose();
    }
    this.runtimes.clear();
    this.runtimeIdsByConversation.clear();
    this.snapshot = { lifecycle: 'disposed', activeRuntimeId: null, runtimeIds: [] };
    this.emit();
    this.listeners.clear();
    this.credentials.dispose();
  }

  private assertReady(): void {
    if (this.snapshot.lifecycle !== 'ready') {
      throw new TuiRuntimeError('application-disposed', { applicationId: this.applicationId });
    }
  }

  private assertConversationUnowned(conversationId: string, expectedRuntimeId?: string): void {
    const ownerRuntimeId = this.runtimeIdsByConversation.get(conversationId);
    if (ownerRuntimeId && ownerRuntimeId !== expectedRuntimeId) {
      throw new TuiRuntimeError('duplicate-conversation-owner', {
        conversationId,
        ownerRuntimeId,
      });
    }
  }

  private updateSnapshot(activeRuntimeId: string | null): void {
    this.snapshot = {
      lifecycle: 'ready',
      activeRuntimeId,
      runtimeIds: [...this.runtimes.keys()],
    };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

class DefaultTuiConversationRuntime implements TuiConversationRuntime {
  private currentConversationId: string | null;
  private currentLifecycle: TuiRuntimeLifecycle = 'ready';
  public readonly stores: TuiConversationStores;

  public constructor(
    private readonly options: {
      readonly runtimeId: string;
      readonly config: CLIConfig;
      readonly conversationId?: string;
      readonly terminalSize?: TerminalSize;
      readonly bindConversation: (conversationId: string) => void;
    },
  ) {
    this.currentConversationId = options.conversationId ?? null;
    const assertMutable = (): void => this.assertReady();
    this.stores = {
      agent: createAgentStore(assertMutable),
      config: createConfigStore(options.config, assertMutable),
      conversation: createConversationStore(assertMutable),
      ui: createUIStore(options.terminalSize, assertMutable),
    };
  }

  public get runtimeId(): string {
    return this.options.runtimeId;
  }

  public get conversationId(): string | null {
    return this.currentConversationId;
  }

  public get lifecycle(): TuiRuntimeLifecycle {
    return this.currentLifecycle;
  }

  public bindConversationId(conversationId: string): void {
    this.assertReady();
    if (this.currentConversationId === conversationId) {
      return;
    }
    if (this.currentConversationId !== null) {
      throw new TuiRuntimeError('conversation-owner-mismatch', {
        runtimeId: this.runtimeId,
        expectedConversationId: this.currentConversationId,
        receivedConversationId: conversationId,
      });
    }
    this.options.bindConversation(conversationId);
    this.currentConversationId = conversationId;
  }

  public assertReady(): void {
    if (this.currentLifecycle !== 'ready') {
      throw new TuiRuntimeError('conversation-runtime-disposed', { runtimeId: this.runtimeId });
    }
  }

  public dispose(): void {
    this.currentLifecycle = 'disposed';
  }
}
