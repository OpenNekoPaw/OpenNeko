/**
 * VideoEditorModel 单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { VideoEditorModel, VideoEditorModelProvider } from './videoEditorModel';
import { ProjectData } from '@neko/shared';

// =============================================================================
// Mock VSCode TextDocument
// =============================================================================

class MockTextDocument implements vscode.TextDocument {
  private _content: string;
  private _version = 1;

  constructor(
    public readonly uri: vscode.Uri,
    content: string = '',
  ) {
    this._content = content;
  }

  get fileName(): string {
    return this.uri.fsPath;
  }

  get isUntitled(): boolean {
    return false;
  }

  get languageId(): string {
    return 'json';
  }

  get version(): number {
    return this._version;
  }

  get isDirty(): boolean {
    return false;
  }

  get isClosed(): boolean {
    return false;
  }

  get eol(): vscode.EndOfLine {
    return vscode.EndOfLine.LF;
  }

  get lineCount(): number {
    return this._content.split('\n').length;
  }

  async save(): Promise<boolean> {
    return true;
  }

  getText(): string {
    return this._content;
  }

  setContent(content: string): void {
    this._content = content;
    this._version++;
  }

  lineAt(): vscode.TextLine {
    throw new Error('Not implemented');
  }

  offsetAt(): number {
    return 0;
  }

  positionAt(): vscode.Position {
    return new vscode.Position(0, 0);
  }

  getWordRangeAtPosition(): vscode.Range | undefined {
    return undefined;
  }

  validateRange(range: vscode.Range): vscode.Range {
    return range;
  }

  validatePosition(position: vscode.Position): vscode.Position {
    return position;
  }
}

// =============================================================================
// 测试数据
// =============================================================================

const validProjectData: ProjectData = {
  version: '1.0',
  name: 'Test Project',
  resolution: { width: 1920, height: 1080 },
  fps: 30,
  tracks: [
    {
      id: 'track-1',
      name: 'Main Track',
      type: 'media',
      elements: [],
      muted: false,
      isMain: true,
    },
  ],
};

const invalidJson = '{ invalid json }';

const emptyProject = '';

// =============================================================================
// 测试套件
// =============================================================================

describe('VideoEditorModel', () => {
  // ---------------------------------------------------------------------------
  // 构造和初始化
  // ---------------------------------------------------------------------------

  describe('构造和初始化', () => {
    it('应该能够从有效 JSON 创建模型', () => {
      const doc = new MockTextDocument(
        vscode.Uri.parse('file:///test.nkv'),
        JSON.stringify(validProjectData),
      );

      const model = new VideoEditorModel(doc);

      expect(model.type).toBe('video');
      expect(model.uri).toBe(doc.uri);
      expect(model.document).toBe(doc);
    });

    it('从无效 JSON 创建应该返回默认项目', () => {
      const doc = new MockTextDocument(vscode.Uri.parse('file:///test.nkv'), invalidJson);

      const model = new VideoEditorModel(doc);
      const content = model.getProjectData();

      expect(content.name).toBe('Untitled Project');
      expect(content.version).toBe('1.0');
      expect(content.tracks).toBeDefined();
    });

    it('从空文档创建应该返回默认项目', () => {
      const doc = new MockTextDocument(vscode.Uri.parse('file:///test.nkv'), emptyProject);

      const model = new VideoEditorModel(doc);
      const content = model.getProjectData();

      expect(content.name).toBe('Untitled Project');
      expect(content.tracks).toBeDefined();
    });

    it('应该自动添加主轨道', () => {
      const projectWithoutMainTrack = {
        ...validProjectData,
        tracks: [],
      };

      const doc = new MockTextDocument(
        vscode.Uri.parse('file:///test.nkv'),
        JSON.stringify(projectWithoutMainTrack),
      );

      const model = new VideoEditorModel(doc);
      const content = model.getProjectData();

      expect(content.tracks.length).toBeGreaterThan(0);
      expect(content.tracks.some((t) => t.isMain)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 能力定义
  // ---------------------------------------------------------------------------

  describe('能力定义', () => {
    it('应该返回正确的编辑器能力', () => {
      const doc = new MockTextDocument(
        vscode.Uri.parse('file:///test.nkv'),
        JSON.stringify(validProjectData),
      );

      const model = new VideoEditorModel(doc);
      const capabilities = model.capabilities;

      expect(capabilities.hasTimeline).toBe(true);
      expect(capabilities.hasLayers).toBe(true);
      expect(capabilities.hasScenes).toBe(false);
      expect(capabilities.supportedExportFormats).toContain('mp4');
      expect(capabilities.supportedExportFormats).toContain('webm');
      expect(capabilities.supportsUndoRedo).toBe(true);
      expect(capabilities.supportsSelection).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 内容操作
  // ---------------------------------------------------------------------------

  describe('内容操作', () => {
    it('getContent 应该返回项目数据', () => {
      const doc = new MockTextDocument(
        vscode.Uri.parse('file:///test.nkv'),
        JSON.stringify(validProjectData),
      );

      const model = new VideoEditorModel(doc);
      const content = model.getContent<ProjectData>();

      expect(content.name).toBe('Test Project');
      expect(content.fps).toBe(30);
    });

    it('getProjectData 应该返回类型安全的项目数据', () => {
      const doc = new MockTextDocument(
        vscode.Uri.parse('file:///test.nkv'),
        JSON.stringify(validProjectData),
      );

      const model = new VideoEditorModel(doc);
      const content = model.getProjectData();

      expect(content).toBeDefined();
      expect(content.tracks).toBeDefined();
      expect(Array.isArray(content.tracks)).toBe(true);
    });

    it('setContent 应该更新项目数据并触发 onDidChange 事件', async () => {
      const doc = new MockTextDocument(
        vscode.Uri.parse('file:///test.nkv'),
        JSON.stringify(validProjectData),
      );

      const model = new VideoEditorModel(doc);

      let eventFired = false;
      let eventData: any;

      model.onDidChange((event) => {
        eventFired = true;
        eventData = event;
      });

      const newData: ProjectData = {
        ...validProjectData,
        name: 'Updated Project',
      };

      await model.setContent(newData);

      expect(eventFired).toBe(true);
      expect(eventData.changeType).toBe('content');
      expect(eventData.model).toBe(model);

      const content = model.getProjectData();
      expect(content.name).toBe('Updated Project');
    });

    it('updateProjectData 应该更新内容', async () => {
      const doc = new MockTextDocument(
        vscode.Uri.parse('file:///test.nkv'),
        JSON.stringify(validProjectData),
      );

      const model = new VideoEditorModel(doc);

      const newData: ProjectData = {
        ...validProjectData,
        fps: 60,
      };

      const result = await model.updateProjectData(newData);

      expect(result).toBe(true);

      const content = model.getProjectData();
      expect(content.fps).toBe(60);
    });
  });

  // ---------------------------------------------------------------------------
  // 数据验证和迁移
  // ---------------------------------------------------------------------------

  describe('数据验证和迁移', () => {
    it('应该自动填充缺失的 version', () => {
      const projectWithoutVersion = { ...validProjectData };
      delete (projectWithoutVersion as any).version;

      const doc = new MockTextDocument(
        vscode.Uri.parse('file:///test.nkv'),
        JSON.stringify(projectWithoutVersion),
      );

      const model = new VideoEditorModel(doc);
      const content = model.getProjectData();

      expect(content.version).toBe('1.0');
    });

    it('应该自动填充缺失的 name', () => {
      const projectWithoutName = { ...validProjectData };
      delete (projectWithoutName as any).name;

      const doc = new MockTextDocument(
        vscode.Uri.parse('file:///test.nkv'),
        JSON.stringify(projectWithoutName),
      );

      const model = new VideoEditorModel(doc);
      const content = model.getProjectData();

      expect(content.name).toBe('Untitled Project');
    });

    it('应该自动填充缺失的 resolution', () => {
      const projectWithoutResolution = { ...validProjectData };
      delete (projectWithoutResolution as any).resolution;

      const doc = new MockTextDocument(
        vscode.Uri.parse('file:///test.nkv'),
        JSON.stringify(projectWithoutResolution),
      );

      const model = new VideoEditorModel(doc);
      const content = model.getProjectData();

      expect(content.resolution).toEqual({ width: 1920, height: 1080 });
    });

    it('应该自动填充缺失的 fps', () => {
      const projectWithoutFps = { ...validProjectData };
      delete (projectWithoutFps as any).fps;

      const doc = new MockTextDocument(
        vscode.Uri.parse('file:///test.nkv'),
        JSON.stringify(projectWithoutFps),
      );

      const model = new VideoEditorModel(doc);
      const content = model.getProjectData();

      expect(content.fps).toBe(30);
    });

    it('应该自动填充缺失的 tracks', () => {
      const projectWithoutTracks = { ...validProjectData };
      delete (projectWithoutTracks as any).tracks;

      const doc = new MockTextDocument(
        vscode.Uri.parse('file:///test.nkv'),
        JSON.stringify(projectWithoutTracks),
      );

      const model = new VideoEditorModel(doc);
      const content = model.getProjectData();

      expect(Array.isArray(content.tracks)).toBe(true);
      expect(content.tracks.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 重新加载
  // ---------------------------------------------------------------------------

  describe('重新加载', () => {
    it('reload 应该重新解析文档内容', () => {
      const doc = new MockTextDocument(
        vscode.Uri.parse('file:///test.nkv'),
        JSON.stringify(validProjectData),
      );

      const model = new VideoEditorModel(doc);

      // 外部修改文档
      const updatedData = {
        ...validProjectData,
        name: 'Externally Modified',
      };
      doc.setContent(JSON.stringify(updatedData));

      // 重新加载
      model.reload();

      const content = model.getProjectData();
      expect(content.name).toBe('Externally Modified');
    });

    it('reload 应该触发 onDidChange 事件', () => {
      const doc = new MockTextDocument(
        vscode.Uri.parse('file:///test.nkv'),
        JSON.stringify(validProjectData),
      );

      const model = new VideoEditorModel(doc);

      let eventFired = false;
      model.onDidChange(() => {
        eventFired = true;
      });

      model.reload();

      expect(eventFired).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 生命周期
  // ---------------------------------------------------------------------------

  describe('生命周期', () => {
    it('dispose 应该释放资源', () => {
      const doc = new MockTextDocument(
        vscode.Uri.parse('file:///test.nkv'),
        JSON.stringify(validProjectData),
      );

      const model = new VideoEditorModel(doc);

      let eventCount = 0;
      model.onDidChange(() => {
        eventCount++;
      });

      model.dispose();

      // dispose 后事件不应该触发
      model.reload();

      expect(eventCount).toBe(0);
    });
  });
});

// =============================================================================
// VideoEditorModelProvider 测试
// =============================================================================

describe('VideoEditorModelProvider', () => {
  it('应该能够创建 VideoEditorModel', () => {
    const provider = new VideoEditorModelProvider();
    const doc = new MockTextDocument(
      vscode.Uri.parse('file:///test.nkv'),
      JSON.stringify(validProjectData),
    );

    const model = provider.createModel(doc);

    expect(model).toBeInstanceOf(VideoEditorModel);
    expect(model.type).toBe('video');
    expect(model.document).toBe(doc);
  });

  it('创建的模型应该正确解析内容', () => {
    const provider = new VideoEditorModelProvider();
    const doc = new MockTextDocument(
      vscode.Uri.parse('file:///test.nkv'),
      JSON.stringify(validProjectData),
    );

    const model = provider.createModel(doc) as VideoEditorModel;
    const content = model.getProjectData();

    expect(content.name).toBe('Test Project');
    expect(content.fps).toBe(30);
  });
});
