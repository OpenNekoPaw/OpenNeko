/**
 * useMinimapInteraction Hook
 * Minimap 交互逻辑
 *
 * 功能:
 * 1. 点击缩略图区域 → 滚动到该时间点（调整可视窗口）
 * 2. 拖拽 → 连续滚动时间线
 */

import { useState, useCallback, RefObject, useEffect, useRef } from 'react';

// =============================================================================
// 类型定义
// =============================================================================

export interface UseMinimapInteractionOptions {
  /** 项目总时长 */
  totalDuration: number;
  /** 可视范围开始时间 */
  visibleStart: number;
  /** 可视范围结束时间 */
  visibleEnd: number;
  /** 滚动到指定时间（调整可视窗口位置） */
  onScrollToTime: (time: number) => void;
  /** Minimap 容器 ref */
  containerRef: RefObject<HTMLDivElement>;
}

export interface UseMinimapInteractionResult {
  /** 鼠标是否按下（拖拽状态） */
  isDragging: boolean;
  /** 鼠标按下处理 */
  handleMouseDown: (e: React.MouseEvent) => void;
  /** 点击跳转处理 */
  handleClick: (e: React.MouseEvent) => void;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useMinimapInteraction({
  totalDuration,
  visibleStart: _visibleStart, // 预留供未来功能使用
  visibleEnd: _visibleEnd, // 预留供未来功能使用
  onScrollToTime,
  containerRef,
}: UseMinimapInteractionOptions): UseMinimapInteractionResult {
  const [isDragging, setIsDragging] = useState(false);

  // 使用 ref 存储回调，避免闭包捕获问题
  const callbacksRef = useRef({ onScrollToTime, totalDuration });
  callbacksRef.current = { onScrollToTime, totalDuration };

  /**
   * 计算点击位置对应的时间
   */
  const getTimeFromPosition = useCallback(
    (clientX: number): number => {
      if (!containerRef.current) return 0;

      const rect = containerRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const percent = x / rect.width;
      const { totalDuration: duration } = callbacksRef.current;
      const time = percent * duration;

      return Math.max(0, Math.min(duration, time));
    },
    [containerRef],
  );

  /**
   * 点击跳转处理
   */
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // 如果正在拖拽，不处理点击
      if (isDragging) return;

      const time = getTimeFromPosition(e.clientX);
      callbacksRef.current.onScrollToTime(time);
    },
    [isDragging, getTimeFromPosition],
  );

  /**
   * 鼠标按下处理
   */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);

      const time = getTimeFromPosition(e.clientX);
      callbacksRef.current.onScrollToTime(time);
    },
    [getTimeFromPosition],
  );

  // 注册全局鼠标事件（用于拖拽）
  // 在 useEffect 内部定义处理函数，避免闭包问题
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percent = x / rect.width;
      const { totalDuration: duration, onScrollToTime: scrollTo } = callbacksRef.current;
      const time = Math.max(0, Math.min(duration, percent * duration));

      scrollTo(time);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    // 使用 passive: true 优化滚动性能
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleMouseUp, { once: true });

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, containerRef]);

  return {
    isDragging,
    handleMouseDown,
    handleClick,
  };
}
