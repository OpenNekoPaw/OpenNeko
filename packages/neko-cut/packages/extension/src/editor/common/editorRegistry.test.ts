/**
 * EditorRegistry 单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { EditorRegistry, IEditorModelProvider } from './editorRegistry';
import { IEditorModel, EditorCapabilities } from './editorModel';

// =============================================================================
// Mock 编辑器模型
// =============================================================================

class MockEditorModel implements IEditorModel {
  private _isDisposed = false;
  private _onDidChange = new vscode.EventEmitter<any>();

  constructor(
    public readonly document: vscode.TextDocument,
    public readonly type: 'video' | 'audio' | 'image' = 'video',
  ) {}

  get uri(): vscode.Uri {
    return this.document.uri;
  }

  get capabilities(): EditorCapabilities {
    return {
      hasTimeline: true,
      hasLayers: false,
      hasScenes: false,
      supportedExportFormats: ['mp4'],
    };
  }

  get onDidChange(): vscode.Event<any> {
    return this._onDidChange.event;
  }

  getContent<T>(): T {
    return {} as T;
  }

  async setContent<T>(content: T): Promise<void> {
    this._onDidChange.fire({ model: this, changeType: 'content', changes: content });
  }

  dispose(): void {
    this._isDisposed = true;
    this._onDidChange.dispose();
  }

  get isDisposed(): boolean {
    return this._isDisposed;
  }
}

class MockModelProvider implements IEditorModelProvider {
  createModel(document: vscode.TextDocument): IEditorModel {
    return new MockEditorModel(document);
  }
}

function createMockDocument(uri: string): vscode.TextDocument {
  return {
    uri: vscode.Uri.parse(uri),
    fileName: uri,
    isUntitled: false,
    languageId: 'json',
    version: 1,
    isDirty: false,
    isClosed: false,
    save: async () => true,
    eol: vscode.EndOfLine.LF,
    lineCount: 1,
    getText: () => '{}',
    lineAt: () => ({}) as any,
    offsetAt: () => 0,
    positionAt: () => new vscode.Position(0, 0),
    getWordRangeAtPosition: () => undefined,
    validateRange: (range) => range,
    validatePosition: (position) => position,
  } as vscode.TextDocument;
}

// =============================================================================
// 测试套件
// =============================================================================

describe('EditorRegistry', () => {
  let registry: EditorRegistry;

  beforeEach(() => {
    registry = new EditorRegistry();
  });

  // ---------------------------------------------------------------------------
  // Provider 注册
  // ---------------------------------------------------------------------------

  describe('Provider 注册', () => {
    it('应该能够注册 Provider', () => {
      const provider = new MockModelProvider();
      const disposable = registry.registerModelProvider('video', provider);

      expect(registry.getModelProvider('video')).toBe(provider);

      disposable.dispose();
    });

    it('注册重复 Provider 应该覆盖旧的', () => {
      const provider1 = new MockModelProvider();
      const provider2 = new MockModelProvider();

      registry.registerModelProvider('video', provider1);
      registry.registerModelProvider('video', provider2);

      expect(registry.getModelProvider('video')).toBe(provider2);
    });

    it('dispose Provider 应该移除注册', () => {
      const provider = new MockModelProvider();
      const disposable = registry.registerModelProvider('video', provider);

      disposable.dispose();

      expect(registry.getModelProvider('video')).toBeUndefined();
    });

    it('获取未注册的 Provider 应该返回 undefined', () => {
      expect(registry.getModelProvider('audio')).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 模型注册
  // ---------------------------------------------------------------------------

  describe('模型注册', () => {
    it('应该能够注册模型', () => {
      const doc = createMockDocument('file:///test.nkv');
      const model = new MockEditorModel(doc);

      const disposable = registry.registerModel(model);

      expect(registry.getEditorByUri(doc.uri)).toBe(model);
      expect(registry.getAllEditors()).toContain(model);

      disposable.dispose();
    });

    it('注册模型应该触发 onDidRegisterEditor 事件', () => {
      const doc = createMockDocument('file:///test.nkv');
      const model = new MockEditorModel(doc);

      let fired = false;
      let firedModel: IEditorModel | undefined;

      registry.onDidRegisterEditor((m) => {
        fired = true;
        firedModel = m;
      });

      registry.registerModel(model);

      expect(fired).toBe(true);
      expect(firedModel).toBe(model);
    });

    it('注销模型应该触发 onDidUnregisterEditor 事件', () => {
      const doc = createMockDocument('file:///test.nkv');
      const model = new MockEditorModel(doc);

      let fired = false;
      let firedModel: IEditorModel | undefined;

      const disposable = registry.registerModel(model);

      registry.onDidUnregisterEditor((m) => {
        fired = true;
        firedModel = m;
      });

      disposable.dispose();

      expect(fired).toBe(true);
      expect(firedModel).toBe(model);
    });

    it('应该能够通过 URI 获取模型', () => {
      const doc = createMockDocument('file:///test.nkv');
      const model = new MockEditorModel(doc);

      registry.registerModel(model);

      expect(registry.getEditorByUri(doc.uri)).toBe(model);
    });

    it('获取未注册的模型应该返回 undefined', () => {
      const uri = vscode.Uri.parse('file:///nonexistent.nkv');
      expect(registry.getEditorByUri(uri)).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 活动编辑器管理
  // ---------------------------------------------------------------------------

  describe('活动编辑器管理', () => {
    it('应该能够设置活动编辑器', () => {
      const doc = createMockDocument('file:///test.nkv');
      const model = new MockEditorModel(doc);

      registry.registerModel(model);
      registry.setActiveEditor(model);

      expect(registry.getActiveEditor()).toBe(model);
    });

    it('设置活动编辑器应该触发 onDidChangeActiveEditor 事件', () => {
      const doc = createMockDocument('file:///test.nkv');
      const model = new MockEditorModel(doc);

      let fired = false;
      let firedModel: IEditorModel | undefined;

      registry.onDidChangeActiveEditor((m) => {
        fired = true;
        firedModel = m;
      });

      registry.registerModel(model);
      registry.setActiveEditor(model);

      expect(fired).toBe(true);
      expect(firedModel).toBe(model);
    });

    it('设置相同的活动编辑器不应该触发事件', () => {
      const doc = createMockDocument('file:///test.nkv');
      const model = new MockEditorModel(doc);

      registry.registerModel(model);
      registry.setActiveEditor(model);

      let fireCount = 0;
      registry.onDidChangeActiveEditor(() => {
        fireCount++;
      });

      registry.setActiveEditor(model);

      expect(fireCount).toBe(0);
    });

    it('注销活动编辑器应该清除活动状态', () => {
      const doc = createMockDocument('file:///test.nkv');
      const model = new MockEditorModel(doc);

      const disposable = registry.registerModel(model);
      registry.setActiveEditor(model);

      disposable.dispose();

      expect(registry.getActiveEditor()).toBeUndefined();
    });

    it('应该能够清除活动编辑器', () => {
      const doc = createMockDocument('file:///test.nkv');
      const model = new MockEditorModel(doc);

      registry.registerModel(model);
      registry.setActiveEditor(model);
      registry.setActiveEditor(undefined);

      expect(registry.getActiveEditor()).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 按类型查询
  // ---------------------------------------------------------------------------

  describe('按类型查询', () => {
    it('应该能够获取所有编辑器', () => {
      const doc1 = createMockDocument('file:///test1.nkv');
      const doc2 = createMockDocument('file:///test2.nkv');
      const model1 = new MockEditorModel(doc1);
      const model2 = new MockEditorModel(doc2);

      registry.registerModel(model1);
      registry.registerModel(model2);

      const editors = registry.getAllEditors();
      expect(editors).toHaveLength(2);
      expect(editors).toContain(model1);
      expect(editors).toContain(model2);
    });

    it('应该能够按类型获取编辑器', () => {
      const doc1 = createMockDocument('file:///test1.nkv');
      const doc2 = createMockDocument('file:///test2.mp3');
      const model1 = new MockEditorModel(doc1, 'video');
      const model2 = new MockEditorModel(doc2, 'audio');

      registry.registerModel(model1);
      registry.registerModel(model2);

      const videoEditors = registry.getEditorsByType('video');
      const audioEditors = registry.getEditorsByType('audio');

      expect(videoEditors).toHaveLength(1);
      expect(videoEditors[0]).toBe(model1);
      expect(audioEditors).toHaveLength(1);
      expect(audioEditors[0]).toBe(model2);
    });

    it('查询不存在类型应该返回空数组', () => {
      const editors = registry.getEditorsByType('image');
      expect(editors).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 生命周期
  // ---------------------------------------------------------------------------

  describe('生命周期', () => {
    it('dispose 应该清空所有模型和 Provider', () => {
      const provider = new MockModelProvider();
      const doc = createMockDocument('file:///test.nkv');
      const model = new MockEditorModel(doc);

      registry.registerModelProvider('video', provider);
      registry.registerModel(model);
      registry.setActiveEditor(model);

      registry.dispose();

      expect(registry.getModelProvider('video')).toBeUndefined();
      expect(registry.getAllEditors()).toHaveLength(0);
      expect(registry.getActiveEditor()).toBeUndefined();
      expect(model.isDisposed).toBe(true);
    });

    it('dispose 应该释放所有事件监听器', () => {
      let registerCount = 0;
      let unregisterCount = 0;
      let activeChangeCount = 0;

      registry.onDidRegisterEditor(() => registerCount++);
      registry.onDidUnregisterEditor(() => unregisterCount++);
      registry.onDidChangeActiveEditor(() => activeChangeCount++);

      registry.dispose();

      // 在 dispose 后触发事件不应该有响应
      const doc = createMockDocument('file:///test.nkv');
      const model = new MockEditorModel(doc);

      // 这些操作应该不会触发任何事件
      try {
        registry.registerModel(model);
        registry.setActiveEditor(model);
      } catch (e) {
        // dispose 后可能会抛出错误，这是正常的
      }

      // 事件计数应该仍然是 0
      expect(registerCount).toBe(0);
      expect(unregisterCount).toBe(0);
      expect(activeChangeCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 边界情况
  // ---------------------------------------------------------------------------

  describe('边界情况', () => {
    it('重复注册同一个模型应该警告但不崩溃', () => {
      const doc = createMockDocument('file:///test.nkv');
      const model = new MockEditorModel(doc);

      registry.registerModel(model);
      registry.registerModel(model); // 重复注册

      // 应该只有一个实例
      expect(registry.getAllEditors()).toHaveLength(1);
    });

    it('注销未注册的模型应该不报错', () => {
      const doc = createMockDocument('file:///test.nkv');
      const model = new MockEditorModel(doc);

      const disposable = registry.registerModel(model);
      disposable.dispose();
      disposable.dispose(); // 重复注销

      // 不应该抛出错误
      expect(registry.getAllEditors()).toHaveLength(0);
    });
  });
});
