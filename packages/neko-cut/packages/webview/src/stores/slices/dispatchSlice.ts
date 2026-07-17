/**
 * Dispatch Slice — 操作分发中心
 *
 * 所有已迁移的 slice 通过 dispatch(op) 提交 EditOperation。
 * dispatch 负责：
 * 1. 调用 applyOperation 计算新 project
 * 2. 推入 operationHistory 的 undoStack
 * 3. 更新 store 中的 project
 */

import { StateCreator } from 'zustand';
import type { ProjectData } from '../../types';
import { applyOperation, type EditOperation } from '@neko/shared';
import { createMeta } from '../utils/operation-helpers';
import { getLogger } from '../../utils/logger';

const logger = getLogger('Dispatch');

// 依赖接口
interface ProjectDependency {
  project: ProjectData | null;
}

interface OperationHistoryDependency {
  pushOperation: (op: EditOperation) => void;
}

export interface DispatchSlice {
  /** 分发单个操作 */
  dispatch: (op: EditOperation) => void;
  /** 分发批量操作（原子） */
  dispatchBatch: (ops: EditOperation[]) => void;
}

export const createDispatchSlice: StateCreator<
  DispatchSlice & ProjectDependency & OperationHistoryDependency,
  [],
  [],
  DispatchSlice
> = (set, get) => ({
  dispatch: (op) => {
    const { project, pushOperation } = get();
    if (!project) return;

    try {
      const newProject = applyOperation(project, op);
      set({ project: newProject });
      pushOperation(op);
    } catch (e) {
      logger.error('apply failed:', { error: e, op });
    }
  },

  dispatchBatch: (ops) => {
    const { project, pushOperation } = get();
    if (!project || ops.length === 0) return;

    const batchOp: EditOperation = {
      type: 'batch',
      meta: createMeta('user'),
      payload: { operations: ops },
    };

    try {
      const newProject = applyOperation(project, batchOp);
      set({ project: newProject });
      pushOperation(batchOp);
    } catch (e) {
      logger.error('batch apply failed:', { error: e, ops });
    }
  },
});
