/**
 * useTimelineScroll Hook
 * 管理时间轴滚动和虚拟化逻辑
 */

import { useEffect, useState, RefObject } from 'react';
import { PIXELS_PER_SECOND, VIRTUALIZATION_BUFFER } from '../constants';

export interface TimelineScrollOptions {
  zoomLevel: number;
  currentTime: number;
  isPlaying: boolean;
  tracksRef: RefObject<HTMLDivElement>;
}

export interface VisibleRange {
  startTime: number;
  endTime: number;
}

export function useTimelineScroll({
  zoomLevel,
  currentTime,
  isPlaying,
  tracksRef,
}: TimelineScrollOptions) {
  // Virtualization: track visible range for efficient rendering
  const [visibleRange, setVisibleRange] = useState<VisibleRange>({ startTime: 0, endTime: 100 });

  // Auto-scroll to follow playhead during playback
  useEffect(() => {
    if (!isPlaying || !tracksRef.current) return;

    const container = tracksRef.current;
    const playheadPosition = currentTime * PIXELS_PER_SECOND * zoomLevel;
    const containerWidth = container.clientWidth;
    const scrollLeft = container.scrollLeft;

    // Calculate visible range
    const visibleStart = scrollLeft;
    const visibleEnd = scrollLeft + containerWidth;

    // If playhead is outside visible area or near the edge, scroll to keep it visible
    const margin = containerWidth * 0.2; // 20% margin from edges
    if (playheadPosition < visibleStart + margin) {
      container.scrollLeft = Math.max(0, playheadPosition - margin);
    } else if (playheadPosition > visibleEnd - margin) {
      container.scrollLeft = playheadPosition - containerWidth + margin;
    }
  }, [currentTime, isPlaying, zoomLevel, tracksRef]);

  // Auto-scroll to element when selected from outline
  useEffect(() => {
    const handleScrollToElement = (event: Event) => {
      const customEvent = event as CustomEvent<{
        trackId: string;
        elementId: string;
        startTime: number;
      }>;

      if (!tracksRef.current || !customEvent.detail) return;

      const { startTime } = customEvent.detail;
      const container = tracksRef.current;
      const elementPosition = startTime * PIXELS_PER_SECOND * zoomLevel;
      const containerWidth = container.clientWidth;

      // Center the element in the viewport
      const targetScrollLeft = elementPosition - containerWidth / 2;
      container.scrollLeft = Math.max(0, targetScrollLeft);
    };

    window.addEventListener('scrollToElement', handleScrollToElement);
    return () => window.removeEventListener('scrollToElement', handleScrollToElement);
  }, [zoomLevel, tracksRef]);

  // Track scroll for virtualization visible range
  useEffect(() => {
    const tracksContainer = tracksRef.current;
    if (!tracksContainer) return;

    const handleTracksScroll = () => {
      const scrollLeft = tracksContainer.scrollLeft;
      const containerWidth = tracksContainer.clientWidth;
      const startTime = Math.max(
        0,
        (scrollLeft - VIRTUALIZATION_BUFFER) / (PIXELS_PER_SECOND * zoomLevel),
      );
      const endTime =
        (scrollLeft + containerWidth + VIRTUALIZATION_BUFFER) / (PIXELS_PER_SECOND * zoomLevel);
      setVisibleRange({ startTime, endTime });
    };

    // Initial visible range calculation
    handleTracksScroll();

    tracksContainer.addEventListener('scroll', handleTracksScroll);
    return () => tracksContainer.removeEventListener('scroll', handleTracksScroll);
  }, [zoomLevel, tracksRef]);

  // 滚动到指定时间（用于 Minimap 跳转）
  const scrollToTime = (time: number) => {
    if (!tracksRef.current) return;

    const container = tracksRef.current;
    const timePosition = time * PIXELS_PER_SECOND * zoomLevel;
    const containerWidth = container.clientWidth;

    // 将目标时间点居中显示
    const targetScrollLeft = timePosition - containerWidth / 2;
    container.scrollLeft = Math.max(0, targetScrollLeft);
  };

  return {
    visibleRange,
    scrollToTime,
  };
}
