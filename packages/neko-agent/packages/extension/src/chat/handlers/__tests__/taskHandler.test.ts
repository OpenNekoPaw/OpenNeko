/**
 * TaskHandler unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskHandler } from '../taskHandler';
import * as vscode from 'vscode';
import type { TaskRunScope } from '@neko/shared';

vi.mock('vscode', async () => await import('../../../__mocks__/vscode'));

function createMockWebview() {
  return { postMessage: vi.fn().mockResolvedValue(true) };
}

function createMockTaskManager() {
  return {
    list: vi.fn().mockResolvedValue([]),
    cancel: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    submit: vi.fn().mockResolvedValue(taskScope('retry-task-1')),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

function taskScope(childRunId: string, ownerConversationId = 'conv-1'): TaskRunScope {
  return {
    conversationId: ownerConversationId,
    runId: 'run-1',
    parentRunId: 'run-1',
    childRunId,
    childKind: 'task',
  };
}

function createMockPlatform() {
  return {
    media: {
      cancelTask: vi.fn().mockResolvedValue(true),
      deleteTask: vi.fn().mockResolvedValue(undefined),
      getTask: vi.fn().mockResolvedValue(null),
    },
  };
}

describe('TaskHandler', () => {
  const conversationId = 'conv-1';
  let handler: TaskHandler;
  let webview: ReturnType<typeof createMockWebview>;
  let taskManager: ReturnType<typeof createMockTaskManager>;
  let platform: ReturnType<typeof createMockPlatform>;

  beforeEach(() => {
    vi.clearAllMocks();
    webview = createMockWebview();
    taskManager = createMockTaskManager();
    platform = createMockPlatform();
  });

  describe('sendTasks', () => {
    it('should send empty tasks when taskManager is unavailable', async () => {
      handler = new TaskHandler({});
      await handler.sendTasks(webview as any, conversationId);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'tasksUpdated',
        conversationId,
        workItems: [],
      });
    });

    it('should send mapped task views when tasks exist', async () => {
      const mockTask = {
        scope: taskScope('task-1'),
        id: 'task-1',
        type: 'image_generation',
        status: 'completed',
        progress: 100,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        input: {
          payload: { prompt: 'Generate a cat image', providerId: 'openai', conversationId },
        },
        output: null,
        error: undefined,
      };
      taskManager.list.mockResolvedValue([mockTask]);

      handler = new TaskHandler({ taskManager: taskManager as any });
      await handler.sendTasks(webview as any, conversationId);

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'tasksUpdated',
          conversationId,
          workItems: expect.arrayContaining([
            expect.objectContaining({
              id: 'task-1',
              kind: 'tool-background-task',
              task: expect.objectContaining({
                type: 'image',
                name: 'Generate a cat image',
              }),
            }),
          ]),
        }),
      );
    });

    it('should truncate long prompt names to 50 chars', async () => {
      const longPrompt = 'A'.repeat(60);
      const mockTask = {
        scope: taskScope('task-2'),
        id: 'task-2',
        type: 'text_generation',
        status: 'running',
        progress: 50,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        input: { payload: { prompt: longPrompt, conversationId } },
        output: null,
        error: undefined,
      };
      taskManager.list.mockResolvedValue([mockTask]);

      handler = new TaskHandler({ taskManager: taskManager as any });
      await handler.sendTasks(webview as any, conversationId);

      const call = webview.postMessage.mock.calls[0]?.[0] as Record<string, unknown>;
      const workItems = call?.workItems as Array<{ task: { name: string } }>;
      expect(workItems?.[0]?.task.name).toHaveLength(50);
      expect(workItems?.[0]?.task.name).toMatch(/\.\.\.$/);
    });

    it('should format task type as display name when no prompt', async () => {
      const mockTask = {
        scope: taskScope('task-3'),
        id: 'task-3',
        type: 'image_generation',
        status: 'pending',
        progress: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        input: { payload: { conversationId } },
        output: null,
        error: undefined,
      };
      taskManager.list.mockResolvedValue([mockTask]);

      handler = new TaskHandler({ taskManager: taskManager as any });
      await handler.sendTasks(webview as any, conversationId);

      const call = webview.postMessage.mock.calls[0]?.[0] as Record<string, unknown>;
      const workItems = call?.workItems as Array<{ task: { name: string } }>;
      expect(workItems?.[0]?.task.name).toBe('Image Generation');
    });

    it('should fall back to payload.content when payload.name is absent', async () => {
      const mockTask = {
        scope: taskScope('task-content'),
        id: 'task-content',
        type: 'workflow',
        status: 'completed',
        progress: 100,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        input: { payload: { content: 'IDC task label', conversationId } },
        output: null,
        error: undefined,
      };
      taskManager.list.mockResolvedValue([mockTask]);

      handler = new TaskHandler({ taskManager: taskManager as any });
      await handler.sendTasks(webview as any, conversationId);

      const call = webview.postMessage.mock.calls[0]?.[0] as Record<string, unknown>;
      const workItems = call?.workItems as Array<{ task: { name: string } }>;
      expect(workItems?.[0]?.task.name).toBe('IDC task label');
    });
  });

  describe('handleCancelTask', () => {
    it('should do nothing when taskManager is unavailable', async () => {
      handler = new TaskHandler({});
      await handler.handleCancelTask(webview as any, taskScope('task-1'));
      expect(webview.postMessage).not.toHaveBeenCalled();
    });

    it('should cancel task and refresh list', async () => {
      taskManager.get.mockResolvedValue({
        scope: taskScope('task-1'),
        id: 'task-1',
        input: { payload: { conversationId } },
      });
      handler = new TaskHandler({ taskManager: taskManager as any });
      await handler.handleCancelTask(webview as any, taskScope('task-1'));

      expect(taskManager.cancel).toHaveBeenCalledWith(taskScope('task-1'));
      expect(taskManager.list).toHaveBeenCalled();
    });

    it('should not fall back to an unscoped media task outside TaskManager', async () => {
      const mediaTask = {
        id: 'media-1',
        type: 'text-to-image',
        status: 'running',
        progress: 20,
        request: { prompt: 'cat', metadata: { conversationId } },
      };
      taskManager.get.mockResolvedValue(null);
      platform.media.getTask.mockResolvedValueOnce(mediaTask).mockResolvedValueOnce({
        ...mediaTask,
        status: 'cancelled',
      });

      handler = new TaskHandler({ taskManager: taskManager as any });
      await handler.handleCancelTask(webview as any, taskScope('media-1'));

      expect(taskManager.cancel).not.toHaveBeenCalled();
      expect(platform.media.getTask).not.toHaveBeenCalled();
      expect(platform.media.cancelTask).not.toHaveBeenCalled();
      expect(webview.postMessage).not.toHaveBeenCalled();
    });

    it('should surface host-private lease diagnostics without touching task handles', async () => {
      const getDiagnostic = vi.fn().mockResolvedValue({
        code: 'hostPrivateLease',
        taskId: 'task-lease',
        ownerSurface: 'tui',
        requestingSurface: 'extension',
        control: 'cancel',
        message:
          'Agent task task-lease has a host-private tui lease and cannot cancel from extension.',
      });
      handler = new TaskHandler({
        taskManager: taskManager as any,
        hostPrivateTaskLeaseGuard: { getDiagnostic },
      });

      await handler.handleCancelTask(webview as any, taskScope('task-lease'));

      expect(getDiagnostic).toHaveBeenCalledWith({
        scope: taskScope('task-lease'),
        control: 'cancel',
      });
      expect(taskManager.get).not.toHaveBeenCalled();
      expect(taskManager.cancel).not.toHaveBeenCalled();
      expect(platform.media.getTask).not.toHaveBeenCalled();
      expect(platform.media.cancelTask).not.toHaveBeenCalled();
      expect(webview.postMessage).not.toHaveBeenCalled();
    });

    it('should refuse tasks from another conversation', async () => {
      taskManager.get.mockResolvedValue({
        scope: taskScope('task-1', 'conv-other'),
        id: 'task-1',
        input: { payload: { conversationId: 'conv-other' } },
      });
      handler = new TaskHandler({ taskManager: taskManager as any });

      await handler.handleCancelTask(webview as any, taskScope('task-1'));

      expect(taskManager.cancel).not.toHaveBeenCalled();
      expect(webview.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('handleRetryTask', () => {
    it('should retry failed task-manager tasks and refresh list', async () => {
      const taskInput = { type: 'image_generation', payload: { conversationId } };
      taskManager.get.mockResolvedValue({
        scope: taskScope('task-1'),
        id: 'task-1',
        type: 'image_generation',
        status: 'failed',
        progress: 100,
        createdAt: 1000,
        updatedAt: 2000,
        input: taskInput,
        output: null,
        error: 'failed',
      });

      handler = new TaskHandler({ taskManager: taskManager as any });
      await handler.handleRetryTask(webview as any, taskScope('task-1'));

      expect(taskManager.submit).toHaveBeenCalledWith(taskInput, {
        conversationId,
        runId: 'run-1',
        parentRunId: 'run-1',
      });
      expect(taskManager.list).toHaveBeenCalled();
    });

    it('should send an agent-projected failed update when retry submit fails', async () => {
      taskManager.get.mockResolvedValue({
        scope: taskScope('task-1'),
        id: 'task-1',
        type: 'image_generation',
        status: 'failed',
        progress: 100,
        createdAt: 1000,
        updatedAt: 2000,
        input: {
          type: 'image_generation',
          payload: { prompt: 'Generate a cat image', conversationId },
        },
        output: null,
        error: 'failed',
      });
      taskManager.submit.mockRejectedValue(new Error('quota exceeded'));

      handler = new TaskHandler({ taskManager: taskManager as any });
      await handler.handleRetryTask(webview as any, taskScope('task-1'));

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'taskUpdated',
          conversationId,
          workItem: expect.objectContaining({
            id: 'task-1',
            kind: 'tool-background-task',
            status: 'failed',
            error: 'Retry failed: quota exceeded',
          }),
        }),
      );
    });
  });

  describe('handleViewTaskResult', () => {
    it('opens generated asset refs from task-manager output in VSCode', async () => {
      taskManager.get.mockResolvedValue({
        scope: taskScope('task-1'),
        id: 'task-1',
        type: 'image_generation',
        status: 'completed',
        progress: 100,
        createdAt: 1000,
        updatedAt: 2000,
        input: { payload: { conversationId } },
        output: { data: { urls: ['generated-assets/asset-1.png'] } },
      });
      handler = new TaskHandler({
        taskManager: taskManager as any,
        generatedAssetLookup: {
          get: vi.fn().mockReturnValue({
            id: 'asset-1',
            path: '/workspace/demo/neko/generated/image/task_1.png',
          }),
        },
      });

      await handler.handleViewTaskResult(taskScope('task-1'));

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'vscode.open',
        expect.objectContaining({ fsPath: '/workspace/demo/neko/generated/image/task_1.png' }),
      );
      expect(vscode.env.openExternal).not.toHaveBeenCalled();
    });

    it('opens workspace-relative generated files in VSCode', async () => {
      taskManager.get.mockResolvedValue({
        scope: taskScope('task-1'),
        id: 'task-1',
        type: 'image_generation',
        status: 'completed',
        progress: 100,
        createdAt: 1000,
        updatedAt: 2000,
        input: { payload: { conversationId } },
        output: { data: { urls: ['neko/generated/image/task_1.png'] } },
      });
      handler = new TaskHandler({ taskManager: taskManager as any });

      await handler.handleViewTaskResult(taskScope('task-1'));

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'vscode.open',
        expect.objectContaining({ fsPath: '/mock/workspace/neko/generated/image/task_1.png' }),
      );
      expect(vscode.env.openExternal).not.toHaveBeenCalled();
    });

    it('opens persisted task-manager results in VSCode instead of media provider urls', async () => {
      taskManager.get.mockResolvedValue({
        scope: taskScope('task-1'),
        id: 'task-1',
        type: 'image_generation',
        status: 'completed',
        progress: 100,
        createdAt: 1000,
        updatedAt: 2000,
        input: { payload: { conversationId } },
        output: { data: { urls: ['generated-assets/asset-1.png'] } },
      });
      platform.media.getTask.mockResolvedValue({
        id: 'task-1',
        type: 'text-to-image',
        status: 'completed',
        progress: 100,
        request: { prompt: 'cat', metadata: { conversationId } },
        outputs: [{ type: 'image', url: 'https://provider.example/result.png' }],
      });
      handler = new TaskHandler({
        taskManager: taskManager as any,
        generatedAssetLookup: {
          get: vi.fn().mockReturnValue({
            id: 'asset-1',
            path: '/workspace/demo/neko/generated/image/task_1.png',
          }),
        },
      });

      await handler.handleViewTaskResult(taskScope('task-1'));

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'vscode.open',
        expect.objectContaining({ fsPath: '/workspace/demo/neko/generated/image/task_1.png' }),
      );
      expect(vscode.env.openExternal).not.toHaveBeenCalled();
    });

    it('does not open webview render URIs through external applications', async () => {
      taskManager.get.mockResolvedValue({
        scope: taskScope('task-1'),
        id: 'task-1',
        type: 'image_generation',
        status: 'completed',
        progress: 100,
        createdAt: 1000,
        updatedAt: 2000,
        input: { payload: { conversationId } },
        output: { data: { urls: ['webview-uri:/workspace/neko/generated/image/task_1.png'] } },
      });
      handler = new TaskHandler({ taskManager: taskManager as any });

      await handler.handleViewTaskResult(taskScope('task-1'));

      expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
        'vscode.open',
        expect.anything(),
      );
      expect(vscode.env.openExternal).not.toHaveBeenCalled();
    });

    it('opens the displayed result ref when stored task data is not directly openable', async () => {
      taskManager.get.mockResolvedValue({
        scope: taskScope('task-1'),
        id: 'task-1',
        type: 'image_generation',
        status: 'completed',
        progress: 100,
        createdAt: 1000,
        updatedAt: 2000,
        input: { payload: { conversationId } },
        output: { data: { url: 'https://provider.example/result.png' } },
      });
      platform.media.getTask.mockResolvedValue({
        id: 'task-1',
        type: 'text-to-image',
        status: 'completed',
        progress: 100,
        request: { prompt: 'cat', metadata: { conversationId } },
        outputs: [{ type: 'image', url: 'https://provider.example/result.png' }],
      });
      handler = new TaskHandler({
        taskManager: taskManager as any,
        generatedAssetLookup: {
          get: vi.fn().mockReturnValue({
            id: 'asset-1',
            path: '/workspace/demo/neko/generated/image/task_1.png',
          }),
        },
      });

      await handler.handleViewTaskResult(taskScope('task-1'), 'generated-assets/asset-1.png');

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'vscode.open',
        expect.objectContaining({ fsPath: '/workspace/demo/neko/generated/image/task_1.png' }),
      );
      expect(vscode.env.openExternal).not.toHaveBeenCalled();
    });

    it('does not open platform-only media task refs outside TaskManager', async () => {
      taskManager.get.mockResolvedValue(null);
      platform.media.getTask.mockResolvedValue({
        id: 'media-1',
        type: 'text-to-image',
        status: 'completed',
        progress: 100,
        request: { prompt: 'cat', metadata: { conversationId } },
        outputs: [{ type: 'image', url: 'generated-assets/asset-1.png' }],
      });
      handler = new TaskHandler({
        taskManager: taskManager as any,
        generatedAssetLookup: {
          get: vi.fn().mockReturnValue({
            id: 'asset-1',
            path: '/workspace/demo/neko/generated/image/task_1.png',
          }),
        },
      });

      await handler.handleViewTaskResult(taskScope('media-1'));

      expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
      expect(vscode.env.openExternal).not.toHaveBeenCalled();
      expect(platform.media.getTask).not.toHaveBeenCalled();
    });
  });
});
