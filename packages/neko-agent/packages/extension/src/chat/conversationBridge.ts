/**
 * VS Code conversation presentation bridge.
 *
 * Pi Session owns transcript history and the Pi conversation authority owns
 * catalog metadata. This bridge retains only replaceable Webview projection
 * state plus the selected conversation for the current VS Code window.
 */

import { randomUUID } from 'node:crypto';

import * as vscode from 'vscode';

import {
  createConversationId,
} from '@neko/agent';
import type {
  PiConversationCatalogRecord,
  PiConversationTranscriptEntry,
} from '@neko/agent/pi';
import { buildAgentSessionDiagnosticMessage, type Message } from '@neko-agent/types';
import type { AgentContentAccessRuntime } from '@neko/agent/runtime';

import { getLogger } from '../base';
import type { AgentLocalResourceAccess } from '../services/localResourceAccess';
import { projectMessagesForWebviewResourceDisplay } from './message/webviewResourceProjection';
import { projectPiConversationEntries } from './message/piConversationHistoryProjection';

const logger = getLogger('ConversationBridge');

export interface PiConversationPresentationCatalogItem extends PiConversationCatalogRecord {
  readonly messageCount: number;
}

export interface PiConversationPresentationAuthority {
  listConversationPresentationCatalog(): Promise<
    readonly PiConversationPresentationCatalogItem[]
  >;
  createConversation(input: {
    readonly conversationId: string;
    readonly title?: string;
  }): Promise<PiConversationCatalogRecord>;
  updateConversationTitle(conversationId: string, title: string): Promise<void>;
  deleteConversation(conversationId: string): Promise<boolean>;
  readConversationEntries(
    conversationId: string,
  ): Promise<readonly PiConversationTranscriptEntry[]>;
}

export interface ConversationBridgeOptions {
  readonly authority: PiConversationPresentationAuthority;
  readonly initialCatalog: readonly PiConversationPresentationCatalogItem[];
}

export interface ConversationPresentation {
  readonly id: string;
  title: string;
  messages: Message[];
  readonly createdAt: number;
  updatedAt: number;
  messageCount: number;
  messagesLoaded: boolean;
}

export interface ConversationReconcileResult {
  readonly upsertedIds: readonly string[];
  readonly removedIds: readonly string[];
}

export interface DeleteConversationOptions {
  readonly activateNext?: boolean;
}

export class ConversationBridge {
  private readonly conversations = new Map<string, ConversationPresentation>();
  private activeId: string | null = null;
  private readonly deletedConversationIds = new Set<string>();
  private readonly getWorkspaceRoot: (() => string | undefined) | undefined;
  private readonly initialWorkspaceRoot: string | undefined;

  constructor(
    workspaceRoot: string | (() => string | undefined) | undefined,
    private readonly localResourceAccess: AgentLocalResourceAccess | undefined,
    private readonly getContentAccessRuntime: (() => AgentContentAccessRuntime | undefined) | undefined,
    private readonly options: ConversationBridgeOptions,
  ) {
    this.initialWorkspaceRoot =
      typeof workspaceRoot === 'function' ? workspaceRoot() : workspaceRoot;
    this.getWorkspaceRoot = typeof workspaceRoot === 'function' ? workspaceRoot : undefined;
    this.replaceCatalog(options.initialCatalog);
  }

  async create(): Promise<string> {
    const conversationId = this.generateConversationId();
    const record = await this.options.authority.createConversation({ conversationId });
    this.conversations.set(conversationId, projectCatalogRecord(record, 0, true));
    this.activeId = conversationId;
    this.deletedConversationIds.delete(conversationId);
    return conversationId;
  }

  getActive(): ConversationPresentation | undefined {
    return this.activeId ? this.conversations.get(this.activeId) : undefined;
  }

  getActiveId(): string | null {
    return this.activeId;
  }

  get(conversationId: string): ConversationPresentation | undefined {
    return this.conversations.get(conversationId);
  }

  getMessageCount(conversationId: string): number | undefined {
    return this.conversations.get(conversationId)?.messageCount;
  }

  switchTo(conversationId: string): boolean {
    if (!this.conversations.has(conversationId)) return false;
    this.activeId = conversationId;
    return true;
  }

  clearActive(): void {
    this.activeId = null;
  }

  async delete(
    conversationId: string,
    options: DeleteConversationOptions = {},
  ): Promise<boolean> {
    const deleted = await this.options.authority.deleteConversation(conversationId);
    if (!deleted) return false;
    this.removePresentation(conversationId, options.activateNext ?? true);
    return true;
  }

  async clearAll(): Promise<void> {
    for (const conversationId of this.list().map((conversation) => conversation.id)) {
      const deleted = await this.options.authority.deleteConversation(conversationId);
      if (!deleted) {
        throw new Error(`Pi conversation ${conversationId} disappeared during clear-all.`);
      }
      this.removePresentation(conversationId, false);
    }
    this.activeId = null;
  }

  clearCurrent(): void {
    const conversationId = this.activeId;
    if (conversationId) this.updateMessagesForConversation(conversationId, []);
  }

  list(): ConversationPresentation[] {
    return [...this.conversations.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async refreshFromPiAuthority(): Promise<ConversationReconcileResult> {
    const records = await this.options.authority.listConversationPresentationCatalog();
    const incomingIds = new Set(records.map((record) => record.conversationId));
    const upsertedIds: string[] = [];
    for (const record of records) {
      const current = this.conversations.get(record.conversationId);
      if (!current) {
        this.conversations.set(
          record.conversationId,
          projectCatalogRecord(record, record.messageCount, false),
        );
        upsertedIds.push(record.conversationId);
        continue;
      }
      const updatedAt = parseCatalogTimestamp(record.updatedAt, 'updatedAt');
      if (
        current.title !== record.title ||
        current.updatedAt !== updatedAt ||
        (!current.messagesLoaded && current.messageCount !== record.messageCount)
      ) {
        current.title = record.title;
        current.updatedAt = updatedAt;
        if (!current.messagesLoaded) current.messageCount = record.messageCount;
        upsertedIds.push(record.conversationId);
      }
    }

    const removedIds: string[] = [];
    for (const conversationId of this.conversations.keys()) {
      if (incomingIds.has(conversationId)) continue;
      this.removePresentation(conversationId, true);
      removedIds.push(conversationId);
    }
    return { upsertedIds, removedIds };
  }

  addMessage(message: Message): void {
    if (this.activeId) this.addMessageToConversation(this.activeId, message);
  }

  addMessageToConversation(conversationId: string, message: Message): void {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Cannot project a message into missing conversation ${conversationId}.`);
    }
    conversation.messages.push(message);
    conversation.messagesLoaded = true;
    conversation.messageCount = conversation.messages.length;
    conversation.updatedAt = Date.now();
    if (conversation.title === 'New conversation' && message.role === 'user') {
      conversation.title = conversationTitle(message.content);
    }
  }

  removeMessageFromConversation(conversationId: string, messageId: string): void {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return;
    const messages = conversation.messages.filter((message) => message.id !== messageId);
    if (messages.length !== conversation.messages.length) {
      this.updateMessagesForConversation(conversationId, messages);
    }
  }

  upsertMessageToConversation(conversationId: string, message: Message): void {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Cannot project a message into missing conversation ${conversationId}.`);
    }
    const index = conversation.messages.findIndex((item) => item.id === message.id);
    if (index === -1) {
      this.addMessageToConversation(conversationId, message);
      return;
    }
    const messages = [...conversation.messages];
    messages[index] = message;
    this.updateMessagesForConversation(conversationId, messages);
  }

  updateMessagesForConversation(conversationId: string, messages: readonly Message[]): void {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return;
    conversation.messages = messages.map((message) => ({ ...message }));
    conversation.messagesLoaded = true;
    conversation.messageCount = conversation.messages.length;
    conversation.updatedAt = Date.now();
  }

  async ensureActive(): Promise<string> {
    return this.activeId ?? this.create();
  }

  sendConversationList(webview: vscode.Webview): void {
    void webview.postMessage({
      type: 'conversationList',
      conversations: this.list().map((conversation) => {
        return {
          id: conversation.id,
          title: conversation.title,
          messageCount: conversation.messageCount,
          updatedAt: conversation.updatedAt,
        };
      }),
    });
  }

  async sendActiveConversation(
    webview: vscode.Webview,
    activation?: { readonly activationId: number; readonly tabStateRevision: number },
  ): Promise<void> {
    const conversation = this.getActive();
    if (!conversation) {
      await webview.postMessage({
        type: 'activeConversation',
        ...(activation ? { activation } : {}),
        conversation: null,
      });
      return;
    }
    await this.loadMessages(conversation);
    await webview.postMessage({
      type: 'activeConversation',
      ...(activation ? { activation } : {}),
      conversation: {
        id: conversation.id,
        title: conversation.title,
        messages: await this.projectMessagesForWebview(webview, conversation.messages),
      },
    });
  }

  async sendConversationSnapshot(
    webview: vscode.Webview,
    conversationId: string,
  ): Promise<boolean> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      const deleted = this.deletedConversationIds.has(conversationId);
      await webview.postMessage(
        buildAgentSessionDiagnosticMessage({
          code: deleted ? 'deleted-conversation' : 'unknown-conversation',
          action: 'sendConversationSnapshot',
          conversationId,
          message: deleted
            ? `Conversation "${conversationId}" has already been deleted.`
            : `Conversation "${conversationId}" does not exist.`,
        }),
      );
      return false;
    }
    await this.loadMessages(conversation);
    await webview.postMessage({
      type: 'conversationSnapshot',
      conversation: {
        id: conversation.id,
        title: conversation.title,
        messages: await this.projectMessagesForWebview(webview, conversation.messages),
      },
    });
    return true;
  }

  disposeAsync(): Promise<void> {
    return Promise.resolve();
  }

  dispose(): void {}

  private replaceCatalog(records: readonly PiConversationPresentationCatalogItem[]): void {
    this.conversations.clear();
    for (const record of records) {
      if (this.conversations.has(record.conversationId)) {
        throw new Error(`Pi conversation catalog contains duplicate id ${record.conversationId}.`);
      }
      this.conversations.set(
        record.conversationId,
        projectCatalogRecord(record, record.messageCount, false),
      );
    }
  }

  private async loadMessages(conversation: ConversationPresentation): Promise<void> {
    if (conversation.messagesLoaded) return;
    const entries = await this.options.authority.readConversationEntries(conversation.id);
    const messages = projectPiConversationEntries(entries);
    conversation.messages = messages;
    conversation.messageCount = messages.length;
    conversation.messagesLoaded = true;
  }

  private removePresentation(conversationId: string, activateNext: boolean): void {
    if (!this.conversations.delete(conversationId)) return;
    this.deletedConversationIds.add(conversationId);
    if (this.activeId === conversationId) {
      this.activeId = activateNext ? (this.list()[0]?.id ?? null) : null;
    }
  }

  private generateConversationId(): string {
    const root = this.getWorkspaceRoot?.() ?? this.initialWorkspaceRoot;
    return root ? createConversationId(root) : `conv_${randomUUID()}`;
  }

  private projectMessagesForWebview(
    webview: vscode.Webview,
    messages: readonly Message[],
  ): Promise<Message[]> {
    return projectMessagesForWebviewResourceDisplay(messages, {
      webview,
      localResourceAccess: this.localResourceAccess,
      contentAccessRuntime: this.getContentAccessRuntime?.(),
      localMediaCaller: 'neko-agent.conversation',
      documentResourceCaller: 'neko-agent.document-resource',
    });
  }
}

function projectCatalogRecord(
  record: PiConversationCatalogRecord,
  messageCount: number,
  messagesLoaded: boolean,
): ConversationPresentation {
  return {
    id: record.conversationId,
    title: record.title,
    messages: [],
    createdAt: parseCatalogTimestamp(record.createdAt, 'createdAt'),
    updatedAt: parseCatalogTimestamp(record.updatedAt, 'updatedAt'),
    messageCount,
    messagesLoaded,
  };
}

function parseCatalogTimestamp(value: string, field: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`Pi conversation catalog ${field} is not an ISO timestamp: ${value}`);
  }
  return timestamp;
}

function conversationTitle(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  return normalized.length > 50 ? `${normalized.slice(0, 47)}...` : normalized || 'New conversation';
}
