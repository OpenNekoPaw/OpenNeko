/**
 * Operation Helpers — EditOperation 构建辅助函数
 */

import { generateId } from '../../utils';
import type { OperationMeta, OperationSource } from '@neko/shared';

/**
 * 创建操作元数据
 */
export function createMeta(source: OperationSource = 'user', description?: string): OperationMeta {
  return {
    id: generateId(),
    timestamp: Date.now(),
    source,
    description,
  };
}

/**
 * 从对象中提取指定 keys 的子集（用于构建 before 快照）
 */
export function pickBefore<T extends object>(obj: T, updates: Partial<T>): Partial<T> {
  const result: Partial<T> = {};
  for (const key of Object.keys(updates) as Array<keyof T>) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}
