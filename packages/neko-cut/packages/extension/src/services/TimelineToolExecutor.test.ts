/**
 * TimelineToolExecutor 单元测试
 *
 * 关注点：
 * - 关键变换：add/update/delete element、split、set_color_correction
 * - 单次调用只写回一次（单个 undo step 的基础保障）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import type { ProjectData, TimelineElement } from '@neko/shared';
import { CENTERED_TRANSFORM } from '@neko/shared';
import { ServiceCollection, setGlobalServices } from '../base';
import { IEditorRegistry } from '../editor/common/editorRegistry';
import { createNkvProjectRef } from './CutProjectQualityFacade';
import { TimelineToolExecutor, type TimelineToolExecutionTarget } from './TimelineToolExecutor';
import { saveCutProjectFile } from '../editor/video/cutProjectFilePersistence';

vi.mock('../editor/video/cutProjectFilePersistence', () => ({
  saveCutProjectFile: vi.fn(async (_uri: unknown, project: ProjectData) => ({
    ok: true,
    document: project,
    diagnostics: [],
  })),
}));

vi.mock('vscode', () => ({
  Uri: {
    file: (filePath: string) => ({
      scheme: 'file',
      fsPath: filePath,
      path: filePath,
      toString: () => `file://${filePath}`,
    }),
    parse: (value: string) => {
      const filePath = value.replace(/^file:\/\//, '');
      return {
        scheme: value.startsWith('file://') ? 'file' : 'unknown',
        fsPath: filePath,
        path: filePath,
        toString: () => value,
      };
    },
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/test' }, name: 'test', index: 0 }],
  },
}));

class MockVideoEditorModel {
  readonly type = 'video';
  readonly uri = vscode.Uri.file('/test/project.nkv');
  private project: ProjectData;
  readonly updates: ProjectData[] = [];
  readonly savedSyncs: ProjectData[] = [];
  readonly legacyUpdates: ProjectData[] = [];

  constructor(project: ProjectData) {
    this.project = project;
  }

  getProjectData(): ProjectData {
    return this.project;
  }

  async updateProjectData(data: ProjectData): Promise<boolean> {
    this.legacyUpdates.push(data);
    this.project = data;
    return true;
  }

  async syncSavedProjectData(data: ProjectData): Promise<boolean> {
    this.savedSyncs.push(data);
    this.project = data;
    return true;
  }

  applyIncrementalUpdate(data: ProjectData): void {
    this.project = data;
    this.updates.push(data);
  }
}

function createBaseProject(): ProjectData {
  return {
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
}

function createTarget(project: ProjectData): TimelineToolExecutionTarget {
  const documentUri = 'file:///test/project.nkv';
  return {
    documentUri,
    expectedProjectRevision: createNkvProjectRef(documentUri, project).projectRevision,
  };
}

describe('TimelineToolExecutor', () => {
  let executor: TimelineToolExecutor;
  let model: MockVideoEditorModel;

  beforeEach(() => {
    const services = new ServiceCollection();
    setGlobalServices(services);
    vi.mocked(saveCutProjectFile).mockClear();
    vi.mocked(saveCutProjectFile).mockImplementation(async (_uri, project) => ({
      ok: true,
      document: project,
      diagnostics: [],
    }));

    model = new MockVideoEditorModel(createBaseProject());

    const mockEditorRegistry = {
      getActiveEditor: vi.fn(),
      getEditorByUri: () => model as any,
    };
    services.set(IEditorRegistry, mockEditorRegistry as any);

    executor = new TimelineToolExecutor();
  });

  it('returns document identity and revision for an explicit read target', async () => {
    const result = await executor.execute(
      'GetTimelineInfo',
      {},
      { documentUri: 'file:///test/project.nkv' },
    );

    expect(result).toMatchObject({
      success: true,
      data: {
        documentUri: 'file:///test/project.nkv',
        projectRevision: expect.stringMatching(/^nkv:/),
        trackCount: 1,
      },
    });
  });

  it('AddElement 应该新增元素并仅写回一次', async () => {
    const result = await executor.execute(
      'AddElement',
      {
        trackId: 'track-1',
        type: 'media',
        startTime: 0,
        duration: 5,
        src: './assets/a.mp4',
      },
      createTarget(model.getProjectData()),
    );

    expect(result.success).toBe(true);
    expect(model.savedSyncs).toHaveLength(1);
    expect(model.updates).toHaveLength(0);
    expect(model.legacyUpdates).toHaveLength(0);
    expect(saveCutProjectFile).not.toHaveBeenCalled();

    const updated = model.getProjectData();
    expect(updated.tracks[0].elements).toHaveLength(1);

    const element = updated.tracks[0].elements[0] as TimelineElement;
    expect(element.type).toBe('media');
    expect((element as any).src).toBe('./assets/a.mp4');
    expect(element.startTime).toBe(0);
    expect(element.duration).toBe(5);
  });

  it('AddShape 应该在 track.shapes 中新增形状', async () => {
    const result = await executor.execute(
      'AddShape',
      {
        trackId: 'track-1',
        shapeType: 'rectangle',
        position: { x: 10, y: 20 },
        size: { width: 30, height: 40 },
        style: { fillColor: '#ff0000', strokeColor: '#00ff00', strokeWidth: 4 },
      },
      createTarget(model.getProjectData()),
    );

    expect(result.success).toBe(true);
    expect(model.savedSyncs).toHaveLength(1);
    expect(model.updates).toHaveLength(0);

    const trackAny = model.getProjectData().tracks[0] as any;
    expect(trackAny.shapes).toHaveLength(1);

    const shapeInstance = trackAny.shapes[0];
    expect(shapeInstance.shape.shapeType).toBe('rectangle');
    expect(shapeInstance.shape.centerX).toBe(10);
    expect(shapeInstance.shape.centerY).toBe(20);
    expect(shapeInstance.style.fill.color).toBe('#ff0000');
    expect(shapeInstance.style.stroke.color).toBe('#00ff00');
    expect(shapeInstance.style.stroke.width).toBe(4);
  });

  it('UpdateElement 应该更新元素并仅写回一次', async () => {
    const initialElement: TimelineElement = {
      id: 'elem-1',
      type: 'media',
      name: 'clip',
      src: './assets/a.mp4',
      startTime: 0,
      duration: 10,
      trimStart: 0,
      trimEnd: 0,
      transform: { ...CENTERED_TRANSFORM },
    } as TimelineElement;

    model = new MockVideoEditorModel({
      ...createBaseProject(),
      tracks: [
        {
          ...createBaseProject().tracks[0],
          elements: [initialElement],
        },
      ],
    });

    const services = new ServiceCollection();
    setGlobalServices(services);
    services.set(IEditorRegistry, {
      getActiveEditor: vi.fn(),
      getEditorByUri: () => model as any,
    } as any);
    executor = new TimelineToolExecutor();

    const result = await executor.execute(
      'UpdateElement',
      {
        elementId: 'elem-1',
        startTime: 2,
        transform: { x: 0.25, y: 0.75, rotation: 15 },
      },
      createTarget(model.getProjectData()),
    );

    expect(result.success).toBe(true);
    expect(model.savedSyncs).toHaveLength(1);
    expect(model.updates).toHaveLength(0);

    const updatedElement = model.getProjectData().tracks[0].elements[0] as TimelineElement;
    expect(updatedElement.startTime).toBe(2);
    expect(updatedElement.transform?.x).toBe(0.25);
    expect(updatedElement.transform?.y).toBe(0.75);
    expect(updatedElement.transform?.rotation).toBe(15);
  });

  it('UpdateShape 应该更新形状属性', async () => {
    const addResult = await executor.execute(
      'AddShape',
      {
        trackId: 'track-1',
        shapeType: 'ellipse',
        position: { x: 25, y: 35 },
        size: { width: 40, height: 60 },
        style: { fillColor: '#ffffff' },
      },
      createTarget(model.getProjectData()),
    );

    expect(addResult.success).toBe(true);
    const shapeId = (addResult.data as { shapeId: string }).shapeId;

    const updateResult = await executor.execute(
      'UpdateShape',
      {
        elementId: shapeId,
        position: { x: 60, y: 70 },
        size: { width: 80, height: 100 },
        style: { strokeColor: '#123456', strokeWidth: 6, opacity: 0.5 },
        visible: false,
      },
      createTarget(model.getProjectData()),
    );

    expect(updateResult.success).toBe(true);

    const trackAny = model.getProjectData().tracks[0] as any;
    const updatedShape = trackAny.shapes.find((s: any) => s.id === shapeId);
    expect(updatedShape).toBeDefined();
    expect(updatedShape.shape.centerX).toBe(60);
    expect(updatedShape.shape.centerY).toBe(70);
    expect(updatedShape.shape.radiusX).toBe(40);
    expect(updatedShape.shape.radiusY).toBe(50);
    expect(updatedShape.style.stroke.color).toBe('#123456');
    expect(updatedShape.style.stroke.width).toBe(6);
    expect(updatedShape.style.fill.opacity).toBe(0.5);
    expect(updatedShape.visible).toBe(false);
  });

  it('DeleteElement 应该删除元素并仅写回一次', async () => {
    const initialElement: TimelineElement = {
      id: 'elem-1',
      type: 'media',
      name: 'clip',
      src: './assets/a.mp4',
      startTime: 0,
      duration: 10,
      trimStart: 0,
      trimEnd: 0,
      transform: { ...CENTERED_TRANSFORM },
    } as TimelineElement;

    model = new MockVideoEditorModel({
      ...createBaseProject(),
      tracks: [
        {
          ...createBaseProject().tracks[0],
          elements: [initialElement],
        },
      ],
    });

    const services = new ServiceCollection();
    setGlobalServices(services);
    services.set(IEditorRegistry, {
      getActiveEditor: vi.fn(),
      getEditorByUri: () => model as any,
    } as any);
    executor = new TimelineToolExecutor();

    const result = await executor.execute(
      'DeleteElement',
      { elementId: 'elem-1' },
      createTarget(model.getProjectData()),
    );

    expect(result.success).toBe(true);
    expect(model.savedSyncs).toHaveLength(1);
    expect(model.updates).toHaveLength(0);
    expect(model.getProjectData().tracks[0].elements).toHaveLength(0);
  });

  it('SplitElement 应该拆分元素并仅写回一次', async () => {
    const initialElement: TimelineElement = {
      id: 'elem-1',
      type: 'media',
      name: 'clip',
      src: './assets/a.mp4',
      startTime: 0,
      duration: 10,
      trimStart: 0,
      trimEnd: 0,
      transform: { ...CENTERED_TRANSFORM },
    } as TimelineElement;

    model = new MockVideoEditorModel({
      ...createBaseProject(),
      tracks: [
        {
          ...createBaseProject().tracks[0],
          elements: [initialElement],
        },
      ],
    });

    const services = new ServiceCollection();
    setGlobalServices(services);
    services.set(IEditorRegistry, {
      getActiveEditor: vi.fn(),
      getEditorByUri: () => model as any,
    } as any);
    executor = new TimelineToolExecutor();

    const result = await executor.execute(
      'SplitElement',
      { elementId: 'elem-1', splitTime: 3 },
      createTarget(model.getProjectData()),
    );

    expect(result.success).toBe(true);
    expect(model.savedSyncs).toHaveLength(1);
    expect(model.updates).toHaveLength(0);

    const elements = model.getProjectData().tracks[0].elements;
    expect(elements).toHaveLength(2);

    const left = elements[0] as TimelineElement;
    const right = elements[1] as TimelineElement;

    expect(left.id).toBe('elem-1');
    expect(left.trimEnd).toBe(7);
    expect(right.id).not.toBe('elem-1');
    expect(right.startTime).toBe(3);
    expect(right.trimStart).toBe(3);
  });

  it('SetColorCorrection 应该写入 colorCorrection 并仅写回一次', async () => {
    const initialElement: TimelineElement = {
      id: 'elem-1',
      type: 'media',
      name: 'clip',
      src: './assets/a.mp4',
      startTime: 0,
      duration: 10,
      trimStart: 0,
      trimEnd: 0,
      transform: { ...CENTERED_TRANSFORM },
    } as TimelineElement;

    model = new MockVideoEditorModel({
      ...createBaseProject(),
      tracks: [
        {
          ...createBaseProject().tracks[0],
          elements: [initialElement],
        },
      ],
    });

    const services = new ServiceCollection();
    setGlobalServices(services);
    services.set(IEditorRegistry, {
      getActiveEditor: vi.fn(),
      getEditorByUri: () => model as any,
    } as any);
    executor = new TimelineToolExecutor();

    const result = await executor.execute(
      'SetColorCorrection',
      {
        elementId: 'elem-1',
        contrast: 10,
      },
      createTarget(model.getProjectData()),
    );

    expect(result.success).toBe(true);
    expect(model.savedSyncs).toHaveLength(1);
    expect(model.updates).toHaveLength(0);

    const updatedElement = model.getProjectData().tracks[0].elements[0] as any;
    expect(updatedElement.colorCorrection).toBeDefined();
    expect(updatedElement.colorCorrection.enabled).toBe(true);
    expect(updatedElement.colorCorrection.basic.contrast).toBe(10);
  });

  it('rejects a mutation without a revision before applying or saving it', async () => {
    const before = model.getProjectData();

    const result = await executor.execute(
      'AddElement',
      {
        trackId: 'track-1',
        type: 'media',
        startTime: 0,
        duration: 5,
        src: './assets/a.mp4',
      },
      { documentUri: 'file:///test/project.nkv' },
    );

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('missing-project-revision'),
    });
    expect(model.getProjectData()).toBe(before);
    expect(model.savedSyncs).toHaveLength(0);
  });

  it('rejects a stale revision without retargeting the active editor', async () => {
    const activeEditorLookup = vi.fn();
    const targetEditorLookup = vi.fn(() => model as any);
    const services = new ServiceCollection();
    setGlobalServices(services);
    services.set(IEditorRegistry, {
      getActiveEditor: activeEditorLookup,
      getEditorByUri: targetEditorLookup,
    } as any);
    executor = new TimelineToolExecutor();

    const result = await executor.execute(
      'AddTrack',
      { type: 'audio', name: 'Audio' },
      {
        documentUri: 'file:///test/project.nkv',
        expectedProjectRevision: 'stale-revision',
      },
    );

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('stale-project-revision'),
    });
    expect(targetEditorLookup).toHaveBeenCalledOnce();
    expect(activeEditorLookup).not.toHaveBeenCalled();
    expect(model.savedSyncs).toHaveLength(0);
  });
});
