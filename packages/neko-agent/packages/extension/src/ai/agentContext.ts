/**
 * Agent Context
 * Agent 执行时的上下文环境
 */

import type { MultimodalContextPacket } from '@neko/shared';
import { createAgentTurnContext } from '@neko/agent/runtime';
import type { IEditorModel } from '../editor/common/editorModel';

// =============================================================================
// Agent Context 接口
// =============================================================================

/**
 * Agent 上下文
 * 提供 Agent 执行时需要的环境信息
 */
export interface IAgentContext {
  // -------------------------------------------------------------------------
  // 编辑器上下文
  // -------------------------------------------------------------------------

  /** 当前活动编辑器 */
  activeEditor?: IEditorModel;

  /** 用户选择的内容 */
  selection?: {
    /** 选择的文本/对象 */
    content: unknown;
    /** 选择的范围 */
    range?: {
      start: number;
      end: number;
    };
  };

  // -------------------------------------------------------------------------
  // 工作区上下文
  // -------------------------------------------------------------------------

  /** 工作区根目录 */
  workspaceRoot?: string;

  /** 当前打开的文件 */
  openFiles?: string[];

  /** 项目类型 */
  projectType?: 'video' | 'storyboard' | 'image' | 'unknown';

  // -------------------------------------------------------------------------
  // 用户上下文
  // -------------------------------------------------------------------------

  /** 用户偏好设置 */
  userPreferences?: {
    /** 首选语言 */
    language?: string;
    /** 首选 AI Provider */
    preferredProvider?: string;
    /** 首选模型 */
    preferredModel?: string;
  };

  // -------------------------------------------------------------------------
  // 自定义上下文
  // -------------------------------------------------------------------------

  /** 自定义上下文数据 */
  custom?: Record<string, unknown>;

  /** 会话 ID */
  sessionId?: string;

  /** 会话元数据 */
  metadata?: Record<string, unknown>;

  // -------------------------------------------------------------------------
  // 多模态上下文
  // -------------------------------------------------------------------------

  /** 图片附件 (base64 编码) */
  imageAttachments?: Array<{
    type: 'base64';
    media_type: string;
    data: string;
  }>;

  // -------------------------------------------------------------------------
  // Canvas 画布上下文（ambient context — auto-updated on selection change）
  // -------------------------------------------------------------------------

  /**
   * Currently selected canvas nodes, injected automatically into the system
   * prompt whenever the user selects nodes in neko-canvas.
   * Updated via NekoCanvasAPI.nodes.onSelectionChange.
   */
  canvasContext?: {
    selectedNodes: Array<{
      nodeId: string;
      type: string;
      /** One-line human-readable summary (e.g. "#3 MS PAN — Alice meets Bob") */
      summary: string;
    }>;
  };

  /** Agent-first multimodal context packet for the current turn. */
  multimodalContextPacket?: MultimodalContextPacket;
}

/**
 * 创建默认 Agent 上下文
 */
export function createDefaultAgentContext(): IAgentContext {
  return createAgentTurnContext<IEditorModel>();
}
