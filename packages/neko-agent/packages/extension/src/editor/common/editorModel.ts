/**
 * 编辑器模型抽象
 * 统一 Video/Storyboard/Image 编辑器的基础接口
 */

import * as vscode from 'vscode';

// =============================================================================
// 编辑器类型
// =============================================================================

export type EditorType = 'video' | 'storyboard' | 'image';

// =============================================================================
// 编辑器能力
// =============================================================================

export interface EditorCapabilities {
  /** 是否支持时间线 */
  hasTimeline: boolean;
  /** 是否支持图层 */
  hasLayers: boolean;
  /** 是否支持场景 */
  hasScenes: boolean;
  /** 支持的导出格式 */
  supportedExportFormats: string[];
  /** 是否支持撤销/重做 */
  supportsUndoRedo: boolean;
  /** 是否支持选择 */
  supportsSelection: boolean;
}

// =============================================================================
// 模型变更事件
// =============================================================================

export interface IModelChangeEvent {
  /** 变更的模型 */
  readonly model: IEditorModel;
  /** 变更类型 */
  readonly changeType: 'content' | 'selection' | 'state';
  /** 变更详情 */
  readonly changes?: unknown;
}

// =============================================================================
// 编辑器选择
// =============================================================================

export interface IEditorSelection {
  /** 选中的元素 ID 列表 */
  elementIds: string[];
  /** 选中的轨道 ID */
  trackId?: string;
  /** 时间范围选择 */
  timeRange?: { start: number; end: number };
}

// =============================================================================
// 编辑器状态
// =============================================================================

export interface IEditorState {
  /** 当前播放时间 */
  currentTime?: number;
  /** 是否正在播放 */
  isPlaying?: boolean;
  /** 缩放级别 */
  zoom?: number;
  /** 滚动位置 */
  scrollPosition?: { x: number; y: number };
}

// =============================================================================
// 编辑器模型接口
// =============================================================================

/**
 * 编辑器模型接口
 * 所有编辑器类型（视频、分镜、图片）都实现此接口
 */
export interface IEditorModel extends vscode.Disposable {
  // -------------------------------------------------------------------------
  // 基础属性
  // -------------------------------------------------------------------------

  /** 文档 URI */
  readonly uri: vscode.Uri;

  /** 编辑器类型 */
  readonly type: EditorType;

  /** 底层 VSCode 文档 */
  readonly document: vscode.TextDocument;

  /** 编辑器能力 */
  readonly capabilities: EditorCapabilities;

  // -------------------------------------------------------------------------
  // 事件
  // -------------------------------------------------------------------------

  /** 内容变更事件 */
  readonly onDidChange: vscode.Event<IModelChangeEvent>;

  /** 选择变更事件 */
  readonly onDidChangeSelection: vscode.Event<IEditorSelection>;

  /** 状态变更事件 */
  readonly onDidChangeState: vscode.Event<IEditorState>;

  // -------------------------------------------------------------------------
  // 内容操作
  // -------------------------------------------------------------------------

  /**
   * 获取文档内容
   * @returns 解析后的内容对象
   */
  getContent<T>(): T;

  /**
   * 设置文档内容
   * @param content 新内容
   */
  setContent<T>(content: T): Promise<void>;

  /**
   * 获取原始文本
   */
  getText(): string;

  // -------------------------------------------------------------------------
  // 选择操作
  // -------------------------------------------------------------------------

  /**
   * 获取当前选择
   */
  getSelection(): IEditorSelection;

  /**
   * 设置选择
   */
  setSelection(selection: IEditorSelection): void;

  // -------------------------------------------------------------------------
  // 状态操作
  // -------------------------------------------------------------------------

  /**
   * 获取编辑器状态
   */
  getState(): IEditorState;

  /**
   * 设置编辑器状态
   */
  setState(state: Partial<IEditorState>): void;

  // -------------------------------------------------------------------------
  // 编辑操作
  // -------------------------------------------------------------------------

  /**
   * 是否有未保存的更改
   */
  isDirty(): boolean;

  /**
   * 保存文档
   */
  save(): Promise<boolean>;

  /**
   * 撤销
   */
  undo(): Promise<void>;

  /**
   * 重做
   */
  redo(): Promise<void>;
}

// =============================================================================
// 编辑器模型基类
// =============================================================================

/**
 * 编辑器模型基类
 * 提供通用实现，具体编辑器类型继承此类
 */
export abstract class BaseEditorModel implements IEditorModel {
  protected readonly _onDidChange = new vscode.EventEmitter<IModelChangeEvent>();
  protected readonly _onDidChangeSelection = new vscode.EventEmitter<IEditorSelection>();
  protected readonly _onDidChangeState = new vscode.EventEmitter<IEditorState>();

  protected _selection: IEditorSelection = { elementIds: [] };
  protected _state: IEditorState = {};
  protected _disposed = false;

  constructor(
    public readonly document: vscode.TextDocument,
    public readonly type: EditorType,
  ) {}

  // -------------------------------------------------------------------------
  // 属性实现
  // -------------------------------------------------------------------------

  get uri(): vscode.Uri {
    return this.document.uri;
  }

  get onDidChange(): vscode.Event<IModelChangeEvent> {
    return this._onDidChange.event;
  }

  get onDidChangeSelection(): vscode.Event<IEditorSelection> {
    return this._onDidChangeSelection.event;
  }

  get onDidChangeState(): vscode.Event<IEditorState> {
    return this._onDidChangeState.event;
  }

  abstract get capabilities(): EditorCapabilities;

  // -------------------------------------------------------------------------
  // 内容操作 (子类实现)
  // -------------------------------------------------------------------------

  abstract getContent<T>(): T;
  abstract setContent<T>(content: T): Promise<void>;

  getText(): string {
    return this.document.getText();
  }

  // -------------------------------------------------------------------------
  // 选择操作
  // -------------------------------------------------------------------------

  getSelection(): IEditorSelection {
    return { ...this._selection };
  }

  setSelection(selection: IEditorSelection): void {
    this._selection = { ...selection };
    this._onDidChangeSelection.fire(this._selection);
  }

  // -------------------------------------------------------------------------
  // 状态操作
  // -------------------------------------------------------------------------

  getState(): IEditorState {
    return { ...this._state };
  }

  setState(state: Partial<IEditorState>): void {
    this._state = { ...this._state, ...state };
    this._onDidChangeState.fire(this._state);
  }

  // -------------------------------------------------------------------------
  // 编辑操作
  // -------------------------------------------------------------------------

  isDirty(): boolean {
    return this.document.isDirty;
  }

  async save(): Promise<boolean> {
    return this.document.save();
  }

  async undo(): Promise<void> {
    await vscode.commands.executeCommand('undo');
  }

  async redo(): Promise<void> {
    await vscode.commands.executeCommand('redo');
  }

  // -------------------------------------------------------------------------
  // 生命周期
  // -------------------------------------------------------------------------

  dispose(): void {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    this._onDidChange.dispose();
    this._onDidChangeSelection.dispose();
    this._onDidChangeState.dispose();
  }
}
