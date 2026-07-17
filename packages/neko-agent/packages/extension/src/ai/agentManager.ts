/**
 * Agent Manager - 管理多个会话的 Agent 实例
 *
 * 每个会话由 Pi runtime 独立拥有，支持：
 * - 多会话并发执行
 * - 会话级别的状态隔离
 * - 独立的工具确认队列
 * - LRU 缓存策略控制内存
 */

import * as vscode from 'vscode';
import {
  createAgentConversationMessageQueue,
  createConversationProjectionStore,
  type AgentConversationMessageQueue,
  type EnqueueAgentMessageInput,
  type ConversationProjectionStore,
} from '@neko/agent/runtime';
import type { AgentQueuedMessageItem } from '@neko-agent/types';
import {
  type ExecuteVSCodePiTurnInput,
  type ExecuteVSCodePiSkillTurnInput,
  type VSCodePiTurnResult,
  VSCodePiRuntimeManager,
} from './vscodePiRuntimeManager';

/**
 * Agent Manager 接口
 */
export interface IAgentManager extends vscode.Disposable {
  /** Execute the canonical conversation turn through Pi. */
  executePiTurn(input: ExecuteVSCodePiTurnInput): Promise<VSCodePiTurnResult>;
  executePiSkillTurn(input: ExecuteVSCodePiSkillTurnInput): Promise<VSCodePiTurnResult>;
  deleteConversation(conversationId: string): Promise<void>;
  /** Get the authoritative render projection owned by the conversation runtime. */
  getOrCreateProjection(conversationId: string): ConversationProjectionStore;

  /**
   * 检查指定会话是否有 Agent 在运行
   */
  isRunning(conversationId: string): boolean;

  /**
   * 获取所有运行中的会话 ID
   */
  getRunningConversations(): string[];

  /**
   * 获取所有会话 ID
   */
  getAllConversations(): string[];

  /**
   * 移除指定会话的 Agent
   */
  remove(conversationId: string): Promise<void>;

  /**
   * 取消指定会话的执行
   */
  cancel(conversationId: string): void;

  /**
   * 取消所有执行
   */
  cancelAll(): void;

  /**
   * Agent 会话中断事件。只暴露 conversation id 和原因，由 bridge 层决定如何协调任务。
   */
  readonly onDidConversationInterrupted: vscode.Event<AgentConversationInterruptedEvent>;

  /**
   * 确认工具执行
   */
  confirmTool(conversationId: string, toolCallId: string, approved: boolean): void;

  /**
   * 清空指定会话的历史
   */
  clearHistory(conversationId: string): Promise<void>;

  /**
   * 清空指定会话的待处理消息队列
   */
  enqueuePendingMessage(
    conversationId: string,
    input: EnqueueAgentMessageInput,
  ): AgentQueuedMessageItem;
  getPendingMessageQueue(conversationId: string): readonly AgentQueuedMessageItem[];
  removePendingMessage(conversationId: string, queueItemId: string): AgentQueuedMessageItem;
  updatePendingMessage(
    conversationId: string,
    queueItemId: string,
    content: string,
    now?: number,
  ): AgentQueuedMessageItem;
  promotePendingMessage(conversationId: string, queueItemId: string): AgentQueuedMessageItem;
  dequeuePendingMessage(conversationId: string): AgentQueuedMessageItem | null;
  clearPendingMessages(conversationId: string): void;
  nextMessageQueueSnapshotVersion(conversationId: string): number;

  /**
   * 获取指定会话的上下文 token 数量
   */
  getContextTokenCount(conversationId: string): number;

  /**
   * 手动触发指定会话的上下文压缩
   */
  compressContext(conversationId: string): Promise<{
    originalTokens: number;
    compressedTokens: number;
    ratio: number;
  }>;

  /**
   * Agent 开始执行事件
   */
  readonly onDidAgentStart: vscode.Event<{ conversationId: string }>;

  /**
   * Agent 停止执行事件
   */
  readonly onDidAgentStop: vscode.Event<{ conversationId: string }>;

}

export type AgentConversationInterruptionReason = 'user-stop' | 'remove' | 'cancel-all';

export interface AgentConversationInterruptedEvent {
  readonly conversationId: string;
  readonly reason: AgentConversationInterruptionReason;
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Agent Manager 实现
 */
export class AgentManager implements IAgentManager {
  private readonly piMessageQueues = new Map<string, AgentConversationMessageQueue>();
  private readonly projections = new Map<string, ConversationProjectionStore>();
  /** 事件发射器 */
  private readonly _onDidAgentStart = new vscode.EventEmitter<{ conversationId: string }>();
  private readonly _onDidAgentStop = new vscode.EventEmitter<{ conversationId: string }>();
  private readonly _onDidConversationInterrupted =
    new vscode.EventEmitter<AgentConversationInterruptedEvent>();
  constructor(private readonly piRuntime: VSCodePiRuntimeManager) {}

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  get onDidAgentStart(): vscode.Event<{ conversationId: string }> {
    return this._onDidAgentStart.event;
  }

  get onDidAgentStop(): vscode.Event<{ conversationId: string }> {
    return this._onDidAgentStop.event;
  }

  get onDidConversationInterrupted(): vscode.Event<AgentConversationInterruptedEvent> {
    return this._onDidConversationInterrupted.event;
  }

  // -------------------------------------------------------------------------
  // Agent Management
  // -------------------------------------------------------------------------

  async executePiTurn(input: ExecuteVSCodePiTurnInput): Promise<VSCodePiTurnResult> {
    this._onDidAgentStart.fire({ conversationId: input.conversationId });
    try {
      return await this.piRuntime.execute(input);
    } finally {
      this._onDidAgentStop.fire({ conversationId: input.conversationId });
    }
  }

  async executePiSkillTurn(input: ExecuteVSCodePiSkillTurnInput): Promise<VSCodePiTurnResult> {
    this._onDidAgentStart.fire({ conversationId: input.conversationId });
    try {
      return await this.piRuntime.executeSkill(input);
    } finally {
      this._onDidAgentStop.fire({ conversationId: input.conversationId });
    }
  }

  getOrCreateProjection(conversationId: string): ConversationProjectionStore {
    const existing = this.projections.get(conversationId);
    if (existing) return existing;
    const created = createConversationProjectionStore(conversationId);
    this.projections.set(conversationId, created);
    return created;
  }

  isRunning(conversationId: string): boolean {
    return this.piRuntime.isRunning(conversationId);
  }

  getRunningConversations(): string[] {
    return this.piRuntime.getRunningConversationIds();
  }

  getAllConversations(): string[] {
    return this.piRuntime.getConversationIds();
  }

  async remove(conversationId: string): Promise<void> {
    this.projections.delete(conversationId);
    this.piMessageQueues.delete(conversationId);
    await this.piRuntime.remove(conversationId);
    this._onDidConversationInterrupted.fire({ conversationId, reason: 'remove' });
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await this.piRuntime.deleteConversation(conversationId);
    this.projections.delete(conversationId);
    this.piMessageQueues.delete(conversationId);
    this._onDidConversationInterrupted.fire({ conversationId, reason: 'remove' });
  }

  cancel(conversationId: string): void {
    this.piRuntime.cancel(conversationId);
    this._onDidConversationInterrupted.fire({ conversationId, reason: 'user-stop' });
  }

  cancelAll(): void {
    const conversationIds = this.getAllConversations().filter((id) => this.isRunning(id));
    for (const conversationId of conversationIds) {
      this.piRuntime.cancel(conversationId);
      this._onDidConversationInterrupted.fire({ conversationId, reason: 'cancel-all' });
    }
  }

  // -------------------------------------------------------------------------
  // Tool Confirmation
  // -------------------------------------------------------------------------

  confirmTool(conversationId: string, toolCallId: string, approved: boolean): void {
    this.piRuntime.confirmTool(conversationId, toolCallId, approved);
  }

  // -------------------------------------------------------------------------
  // History Management
  // -------------------------------------------------------------------------

  async clearHistory(conversationId: string): Promise<void> {
    await this.piRuntime.clearContext(conversationId);
  }

  enqueuePendingMessage(
    conversationId: string,
    input: EnqueueAgentMessageInput,
  ): AgentQueuedMessageItem {
    return this.requirePiMessageQueue(conversationId).enqueue(input);
  }

  getPendingMessageQueue(conversationId: string): readonly AgentQueuedMessageItem[] {
    return this.piMessageQueues.get(conversationId)?.snapshot().items ?? [];
  }

  removePendingMessage(conversationId: string, queueItemId: string): AgentQueuedMessageItem {
    return this.requirePiMessageQueue(conversationId).remove(queueItemId);
  }

  updatePendingMessage(
    conversationId: string,
    queueItemId: string,
    content: string,
    now?: number,
  ): AgentQueuedMessageItem {
    return this.requirePiMessageQueue(conversationId).edit(queueItemId, content, now);
  }

  promotePendingMessage(conversationId: string, queueItemId: string): AgentQueuedMessageItem {
    return this.requirePiMessageQueue(conversationId).promote(queueItemId);
  }

  dequeuePendingMessage(conversationId: string): AgentQueuedMessageItem | null {
    return this.piMessageQueues.get(conversationId)?.releaseNext() ?? null;
  }

  clearPendingMessages(conversationId: string): void {
    this.piMessageQueues.get(conversationId)?.clear();
  }

  nextMessageQueueSnapshotVersion(conversationId: string): number {
    return this.piMessageQueues.get(conversationId)?.snapshot().version ?? 0;
  }

  getContextTokenCount(conversationId: string): number {
    return this.piRuntime.getContextTokenCount(conversationId);
  }

  private requirePiMessageQueue(conversationId: string): AgentConversationMessageQueue {
    const existing = this.piMessageQueues.get(conversationId);
    if (existing) return existing;
    const queue = createAgentConversationMessageQueue({ conversationId });
    this.piMessageQueues.set(conversationId, queue);
    return queue;
  }

  async compressContext(conversationId: string): Promise<{
    originalTokens: number;
    compressedTokens: number;
    ratio: number;
  }> {
    return this.piRuntime.compactContext(conversationId);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  dispose(): void {
    this.piRuntime.dispose();
    this.projections.clear();

    // 释放事件发射器
    this._onDidAgentStart.dispose();
    this._onDidAgentStop.dispose();
    this._onDidConversationInterrupted.dispose();
  }
}
