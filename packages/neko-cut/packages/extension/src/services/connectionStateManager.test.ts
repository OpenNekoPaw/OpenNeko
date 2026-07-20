/**
 * ConnectionStateManager 单元测试
 *
 * 测试 MCP/Workflow 连接状态管理功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConnectionStateManager, ConnectionStatus } from './connectionStateManager';

// =============================================================================
// 测试套件
// =============================================================================

describe('ConnectionStateManager', () => {
  let manager: ConnectionStateManager;

  beforeEach(() => {
    manager = new ConnectionStateManager();
  });

  // ---------------------------------------------------------------------------
  // 状态更新
  // ---------------------------------------------------------------------------

  describe('状态更新', () => {
    it('应该能够更新 MCP 服务器状态', () => {
      manager.updateState('server1', 'Test Server', 'mcp', 'connected');

      const state = manager.getState('server1', 'mcp');

      expect(state).toBeDefined();
      expect(state?.id).toBe('server1');
      expect(state?.name).toBe('Test Server');
      expect(state?.type).toBe('mcp');
      expect(state?.status).toBe('connected');
      expect(state?.lastChecked).toBeDefined();
    });

    it('应该能够更新 Workflow 引擎状态', () => {
      manager.updateState('workflow1', 'ComfyUI', 'workflow', 'connecting');

      const state = manager.getState('workflow1', 'workflow');

      expect(state).toBeDefined();
      expect(state?.id).toBe('workflow1');
      expect(state?.name).toBe('ComfyUI');
      expect(state?.type).toBe('workflow');
      expect(state?.status).toBe('connecting');
    });

    it('应该能够更新状态并包含错误信息', () => {
      manager.updateState('server1', 'Test Server', 'mcp', 'error', 'Connection timeout');

      const state = manager.getState('server1', 'mcp');

      expect(state?.status).toBe('error');
      expect(state?.error).toBe('Connection timeout');
    });

    it('更新状态应该更新 lastChecked 时间戳', async () => {
      manager.updateState('server1', 'Test Server', 'mcp', 'connected');
      const state1 = manager.getState('server1', 'mcp');
      const time1 = state1?.lastChecked;

      // 等待一小段时间后再更新
      await new Promise((resolve) => setTimeout(resolve, 10));

      manager.updateState('server1', 'Test Server', 'mcp', 'disconnected');
      const state2 = manager.getState('server1', 'mcp');

      expect(state2?.lastChecked).toBeGreaterThanOrEqual(time1 || 0);
    });

    it('相同 ID 不同类型应该独立存储', () => {
      manager.updateState('test1', 'MCP Test', 'mcp', 'connected');
      manager.updateState('test1', 'Workflow Test', 'workflow', 'error');

      const mcpState = manager.getState('test1', 'mcp');
      const workflowState = manager.getState('test1', 'workflow');

      expect(mcpState?.status).toBe('connected');
      expect(mcpState?.name).toBe('MCP Test');
      expect(workflowState?.status).toBe('error');
      expect(workflowState?.name).toBe('Workflow Test');
    });
  });

  // ---------------------------------------------------------------------------
  // 状态查询
  // ---------------------------------------------------------------------------

  describe('状态查询', () => {
    beforeEach(() => {
      manager.updateState('mcp1', 'MCP Server 1', 'mcp', 'connected');
      manager.updateState('mcp2', 'MCP Server 2', 'mcp', 'error', 'Failed to connect');
      manager.updateState('wf1', 'ComfyUI', 'workflow', 'connected');
      manager.updateState('wf2', 'Dify', 'workflow', 'disconnected');
    });

    it('应该能够获取所有 MCP 状态', () => {
      const mcpStates = manager.getMCPStates();

      expect(mcpStates).toHaveLength(2);
      expect(mcpStates.map((s) => s.id)).toContain('mcp1');
      expect(mcpStates.map((s) => s.id)).toContain('mcp2');
    });

    it('应该能够获取所有 Workflow 状态', () => {
      const workflowStates = manager.getWorkflowStates();

      expect(workflowStates).toHaveLength(2);
      expect(workflowStates.map((s) => s.id)).toContain('wf1');
      expect(workflowStates.map((s) => s.id)).toContain('wf2');
    });

    it('应该能够获取所有状态', () => {
      const allStates = manager.getAllStates();

      expect(allStates).toHaveLength(4);
    });

    it('应该能够获取状态 Map', () => {
      const statesMap = manager.getStatesMap();

      expect(statesMap['mcp:mcp1']).toEqual({ status: 'connected', error: undefined });
      expect(statesMap['mcp:mcp2']).toEqual({ status: 'error', error: 'Failed to connect' });
      expect(statesMap['workflow:wf1']).toEqual({ status: 'connected', error: undefined });
      expect(statesMap['workflow:wf2']).toEqual({ status: 'disconnected', error: undefined });
    });

    it('获取不存在的状态应该返回 undefined', () => {
      const state = manager.getState('nonexistent', 'mcp');

      expect(state).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 事件监听
  // ---------------------------------------------------------------------------

  describe('事件监听', () => {
    it('状态变更应该触发监听器', () => {
      const listener = vi.fn();
      manager.addListener(listener);

      manager.updateState('server1', 'Test Server', 'mcp', 'connected');

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({
        id: 'server1',
        type: 'mcp',
        oldStatus: 'disconnected',
        newStatus: 'connected',
        error: undefined,
      });
    });

    it('状态不变时不应该触发监听器', () => {
      const listener = vi.fn();

      manager.updateState('server1', 'Test Server', 'mcp', 'connected');
      manager.addListener(listener);
      manager.updateState('server1', 'Test Server', 'mcp', 'connected');

      expect(listener).not.toHaveBeenCalled();
    });

    it('应该能够移除监听器', () => {
      const listener = vi.fn();
      const disposable = manager.addListener(listener);

      manager.updateState('server1', 'Test Server', 'mcp', 'connected');
      expect(listener).toHaveBeenCalledTimes(1);

      disposable.dispose();

      manager.updateState('server1', 'Test Server', 'mcp', 'disconnected');
      expect(listener).toHaveBeenCalledTimes(1); // 仍然是 1
    });

    it('多个监听器都应该被调用', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      manager.addListener(listener1);
      manager.addListener(listener2);

      manager.updateState('server1', 'Test Server', 'mcp', 'connected');

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('监听器错误不应该影响其他监听器', () => {
      const errorListener = vi.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });
      const normalListener = vi.fn();

      manager.addListener(errorListener);
      manager.addListener(normalListener);

      // 不应该抛出错误
      expect(() => {
        manager.updateState('server1', 'Test Server', 'mcp', 'connected');
      }).not.toThrow();

      // 正常监听器仍然被调用
      expect(normalListener).toHaveBeenCalledTimes(1);
    });

    it('状态转换应该正确记录 oldStatus', () => {
      const listener = vi.fn();
      manager.addListener(listener);

      manager.updateState('server1', 'Test Server', 'mcp', 'connecting');
      manager.updateState('server1', 'Test Server', 'mcp', 'connected');
      manager.updateState('server1', 'Test Server', 'mcp', 'error', 'Lost connection');

      expect(listener).toHaveBeenCalledTimes(3);

      const calls = listener.mock.calls;
      expect(calls[0][0].oldStatus).toBe('disconnected');
      expect(calls[0][0].newStatus).toBe('connecting');

      expect(calls[1][0].oldStatus).toBe('connecting');
      expect(calls[1][0].newStatus).toBe('connected');

      expect(calls[2][0].oldStatus).toBe('connected');
      expect(calls[2][0].newStatus).toBe('error');
      expect(calls[2][0].error).toBe('Lost connection');
    });
  });

  // ---------------------------------------------------------------------------
  // 状态删除
  // ---------------------------------------------------------------------------

  describe('状态删除', () => {
    it('应该能够删除单个状态', () => {
      manager.updateState('server1', 'Test Server', 'mcp', 'connected');
      manager.updateState('server2', 'Test Server 2', 'mcp', 'connected');

      manager.removeState('server1', 'mcp');

      expect(manager.getState('server1', 'mcp')).toBeUndefined();
      expect(manager.getState('server2', 'mcp')).toBeDefined();
    });

    it('删除不存在的状态应该不报错', () => {
      expect(() => {
        manager.removeState('nonexistent', 'mcp');
      }).not.toThrow();
    });

    it('clear 应该删除所有状态', () => {
      manager.updateState('mcp1', 'MCP 1', 'mcp', 'connected');
      manager.updateState('wf1', 'Workflow 1', 'workflow', 'connected');

      manager.clear();

      expect(manager.getAllStates()).toHaveLength(0);
      expect(manager.getMCPStates()).toHaveLength(0);
      expect(manager.getWorkflowStates()).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 生命周期
  // ---------------------------------------------------------------------------

  describe('生命周期', () => {
    it('dispose 应该清空所有状态和监听器', () => {
      const listener = vi.fn();
      manager.addListener(listener);

      manager.updateState('server1', 'Test Server', 'mcp', 'connected');
      expect(listener).toHaveBeenCalledTimes(1);

      manager.dispose();

      // 状态应该被清空
      expect(manager.getAllStates()).toHaveLength(0);

      // 监听器应该不再响应
      manager.updateState('server2', 'Test Server 2', 'mcp', 'connected');
      expect(listener).toHaveBeenCalledTimes(1); // 仍然是 1
    });

    it('多次 dispose 应该安全', () => {
      manager.updateState('server1', 'Test Server', 'mcp', 'connected');

      manager.dispose();
      expect(() => manager.dispose()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // 边界情况
  // ---------------------------------------------------------------------------

  describe('边界情况', () => {
    it('空字符串 ID 应该能够处理', () => {
      manager.updateState('', 'Empty ID', 'mcp', 'connected');

      const state = manager.getState('', 'mcp');

      expect(state).toBeDefined();
      expect(state?.id).toBe('');
    });

    it('特殊字符 ID 应该能够处理', () => {
      const specialId = 'server:with:colons';
      manager.updateState(specialId, 'Special Server', 'mcp', 'connected');

      const state = manager.getState(specialId, 'mcp');

      expect(state).toBeDefined();
      expect(state?.id).toBe(specialId);
    });

    it('中文名称应该能够处理', () => {
      manager.updateState('server1', '测试服务器', 'mcp', 'connected');

      const state = manager.getState('server1', 'mcp');

      expect(state?.name).toBe('测试服务器');
    });

    it('所有状态类型都应该能够处理', () => {
      const statuses: ConnectionStatus[] = ['disconnected', 'connecting', 'connected', 'error'];

      statuses.forEach((status, index) => {
        manager.updateState(`server${index}`, `Server ${index}`, 'mcp', status);
      });

      expect(manager.getAllStates()).toHaveLength(4);

      statuses.forEach((status, index) => {
        const state = manager.getState(`server${index}`, 'mcp');
        expect(state?.status).toBe(status);
      });
    });
  });
});
