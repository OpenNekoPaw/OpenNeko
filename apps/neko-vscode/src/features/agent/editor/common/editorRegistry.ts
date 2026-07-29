/**
 * 编辑器注册表
 * 管理所有编辑器类型和活动编辑器
 */

import * as vscode from 'vscode';
import { createServiceId, getLogger } from '../../base';

const logger = getLogger('EditorRegistry');
import { EditorType, IEditorModel } from './editorModel';

// =============================================================================
// 服务标识符
// =============================================================================

export const IEditorRegistry = createServiceId<IEditorRegistry>('editorRegistry');

// =============================================================================
// 编辑器 Provider 接口
// =============================================================================

/**
 * 编辑器 Provider 接口
 * 用于创建特定类型的编辑器模型
 */
export interface IEditorModelProvider {
  /**
   * 创建编辑器模型
   * @param document VSCode 文档
   */
  createModel(document: vscode.TextDocument): IEditorModel;
}

// =============================================================================
// 编辑器注册表接口
// =============================================================================

/**
 * 编辑器注册表接口
 */
export interface IEditorRegistry extends vscode.Disposable {
  // -------------------------------------------------------------------------
  // Provider 注册
  // -------------------------------------------------------------------------

  /**
   * 注册编辑器 Provider
   * @param type 编辑器类型
   * @param provider Provider 实例
   */
  registerModelProvider(type: EditorType, provider: IEditorModelProvider): vscode.Disposable;

  /**
   * 获取编辑器 Provider
   * @param type 编辑器类型
   */
  getModelProvider(type: EditorType): IEditorModelProvider | undefined;

  // -------------------------------------------------------------------------
  // 模型管理
  // -------------------------------------------------------------------------

  /**
   * 注册活动的编辑器模型
   * @param model 编辑器模型
   */
  registerModel(model: IEditorModel): vscode.Disposable;

  /**
   * 获取当前活动的编辑器
   */
  getActiveEditor(): IEditorModel | undefined;

  /**
   * 设置活动编辑器
   * @param model 编辑器模型
   */
  setActiveEditor(model: IEditorModel | undefined): void;

  /**
   * 根据 URI 获取编辑器模型
   * @param uri 文档 URI
   */
  getEditorByUri(uri: vscode.Uri): IEditorModel | undefined;

  /**
   * 获取所有已注册的编辑器模型
   */
  getAllEditors(): IEditorModel[];

  /**
   * 获取指定类型的所有编辑器
   * @param type 编辑器类型
   */
  getEditorsByType(type: EditorType): IEditorModel[];

  // -------------------------------------------------------------------------
  // 事件
  // -------------------------------------------------------------------------

  /**
   * 活动编辑器变更事件
   */
  readonly onDidChangeActiveEditor: vscode.Event<IEditorModel | undefined>;

  /**
   * 编辑器注册/注销事件
   */
  readonly onDidRegisterEditor: vscode.Event<IEditorModel>;
  readonly onDidUnregisterEditor: vscode.Event<IEditorModel>;
}

// =============================================================================
// 编辑器注册表实现
// =============================================================================

/**
 * 编辑器注册表实现
 */
export class EditorRegistry implements IEditorRegistry {
  private readonly _providers = new Map<EditorType, IEditorModelProvider>();
  private readonly _models = new Map<string, IEditorModel>();
  private _activeEditor: IEditorModel | undefined;

  private readonly _onDidChangeActiveEditor = new vscode.EventEmitter<IEditorModel | undefined>();
  private readonly _onDidRegisterEditor = new vscode.EventEmitter<IEditorModel>();
  private readonly _onDidUnregisterEditor = new vscode.EventEmitter<IEditorModel>();

  // -------------------------------------------------------------------------
  // 事件
  // -------------------------------------------------------------------------

  get onDidChangeActiveEditor(): vscode.Event<IEditorModel | undefined> {
    return this._onDidChangeActiveEditor.event;
  }

  get onDidRegisterEditor(): vscode.Event<IEditorModel> {
    return this._onDidRegisterEditor.event;
  }

  get onDidUnregisterEditor(): vscode.Event<IEditorModel> {
    return this._onDidUnregisterEditor.event;
  }

  // -------------------------------------------------------------------------
  // Provider 注册
  // -------------------------------------------------------------------------

  registerModelProvider(type: EditorType, provider: IEditorModelProvider): vscode.Disposable {
    if (this._providers.has(type)) {
      logger.warn(`Provider for "${type}" is being overwritten`);
    }
    this._providers.set(type, provider);

    return {
      dispose: () => {
        if (this._providers.get(type) === provider) {
          this._providers.delete(type);
        }
      },
    };
  }

  getModelProvider(type: EditorType): IEditorModelProvider | undefined {
    return this._providers.get(type);
  }

  // -------------------------------------------------------------------------
  // 模型管理
  // -------------------------------------------------------------------------

  registerModel(model: IEditorModel): vscode.Disposable {
    const key = model.uri.toString();

    if (this._models.has(key)) {
      logger.warn(`Model for "${key}" already exists`);
    }

    this._models.set(key, model);
    this._onDidRegisterEditor.fire(model);

    return {
      dispose: () => {
        if (this._models.get(key) === model) {
          this._models.delete(key);
          this._onDidUnregisterEditor.fire(model);

          // 如果注销的是活动编辑器，清除活动编辑器
          if (this._activeEditor === model) {
            this.setActiveEditor(undefined);
          }
        }
      },
    };
  }

  getActiveEditor(): IEditorModel | undefined {
    return this._activeEditor;
  }

  setActiveEditor(model: IEditorModel | undefined): void {
    if (this._activeEditor !== model) {
      this._activeEditor = model;
      this._onDidChangeActiveEditor.fire(model);
    }
  }

  getEditorByUri(uri: vscode.Uri): IEditorModel | undefined {
    return this._models.get(uri.toString());
  }

  getAllEditors(): IEditorModel[] {
    return Array.from(this._models.values());
  }

  getEditorsByType(type: EditorType): IEditorModel[] {
    return this.getAllEditors().filter((editor) => editor.type === type);
  }

  // -------------------------------------------------------------------------
  // 生命周期
  // -------------------------------------------------------------------------

  dispose(): void {
    // 注销所有模型
    for (const model of this._models.values()) {
      model.dispose();
    }
    this._models.clear();
    this._providers.clear();
    this._activeEditor = undefined;

    this._onDidChangeActiveEditor.dispose();
    this._onDidRegisterEditor.dispose();
    this._onDidUnregisterEditor.dispose();
  }
}
