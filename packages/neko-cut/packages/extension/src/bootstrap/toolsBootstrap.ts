/**
 * Tools Bootstrap
 * Timeline Bridge 实现，用于 VSCode 命令与 Webview 之间的请求-响应通信
 */

import * as vscode from 'vscode';

// =============================================================================
// Types
// =============================================================================

/**
 * Timeline 工具执行结果
 */
export interface TimelineToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Timeline Bridge 请求消息
 */
interface TimelineBridgeRequest {
  type: 'timelineBridgeRequest';
  requestId: string;
  toolName: string;
  params: Record<string, unknown>;
}

/**
 * Timeline Bridge 响应消息
 */
interface TimelineBridgeResponse {
  type: 'timelineBridgeResponse';
  requestId: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

// =============================================================================
// Timeline Bridge
// =============================================================================

/**
 * Timeline Bridge
 * 提供 VSCode 命令与 Webview 之间的请求-响应通信
 */
export class TimelineBridge {
  private webview: vscode.Webview | null = null;
  private pendingRequests = new Map<
    string,
    {
      resolve: (result: TimelineToolResult) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();
  private messageListener: vscode.Disposable | null = null;
  private requestTimeout = 30000; // 30 seconds

  /**
   * 设置当前 webview
   */
  setWebview(webview: vscode.Webview): void {
    // 清理旧的监听器
    if (this.messageListener) {
      this.messageListener.dispose();
    }

    this.webview = webview;

    // 监听 webview 响应
    this.messageListener = webview.onDidReceiveMessage((message: TimelineBridgeResponse) => {
      if (message.type === 'timelineBridgeResponse') {
        this.handleResponse(message);
      }
    });
  }

  /**
   * 执行 timeline 工具
   */
  async execute<T = unknown>(
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<TimelineToolResult<T>> {
    if (!this.webview) {
      return {
        success: false,
        error: 'No webview available',
      };
    }

    const requestId = this.generateRequestId();

    return new Promise((resolve, reject) => {
      // 设置超时
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        resolve({
          success: false,
          error: `Request timeout after ${this.requestTimeout}ms`,
        });
      }, this.requestTimeout);

      // 保存 pending request
      this.pendingRequests.set(requestId, {
        resolve: resolve as (result: TimelineToolResult) => void,
        reject,
        timeout,
      });

      // 发送请求到 webview
      const request: TimelineBridgeRequest = {
        type: 'timelineBridgeRequest',
        requestId,
        toolName,
        params,
      };

      this.webview!.postMessage(request);
    });
  }

  /**
   * 处理 webview 响应
   */
  private handleResponse(response: TimelineBridgeResponse): void {
    const pending = this.pendingRequests.get(response.requestId);
    if (!pending) {
      return;
    }

    // 清理
    clearTimeout(pending.timeout);
    this.pendingRequests.delete(response.requestId);

    // 返回结果
    pending.resolve({
      success: response.success,
      data: response.data,
      error: response.error,
    });
  }

  /**
   * 生成唯一请求 ID
   */
  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 清理资源
   */
  dispose(): void {
    // 清理所有 pending requests
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.resolve({
        success: false,
        error: 'Bridge disposed',
      });
    }
    this.pendingRequests.clear();

    // 清理监听器
    if (this.messageListener) {
      this.messageListener.dispose();
      this.messageListener = null;
    }

    this.webview = null;
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let timelineBridgeInstance: TimelineBridge | null = null;

/**
 * 获取 TimelineBridge 单例
 */
export function getTimelineBridge(): TimelineBridge {
  if (!timelineBridgeInstance) {
    timelineBridgeInstance = new TimelineBridge();
  }
  return timelineBridgeInstance;
}

/**
 * 销毁 TimelineBridge 单例
 */
export function disposeTimelineBridge(): void {
  if (timelineBridgeInstance) {
    timelineBridgeInstance.dispose();
    timelineBridgeInstance = null;
  }
}
