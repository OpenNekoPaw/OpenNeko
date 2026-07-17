/**
 * useMediaInfoCache - Media Info Cache Hook
 *
 * Caches media info (bitrate, codec, etc.) for timeline media elements.
 * Used to display preview info according to docs/principle.md.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useEditorStore } from '../stores/editor-store';
import { getMediaProxy } from '../services/mediaProxyFactory';
import { getLogger } from '../utils/logger';

const logger = getLogger('useMediaInfoCache');

// =============================================================================
// Types
// =============================================================================

interface BitrateInfoCacheEntry {
  bitrate: string;
  timestamp: number;
}

interface CurrentMediaInfo {
  bitrate: string;
  codec: string;
  resolution: string;
}

// =============================================================================
// Constants
// =============================================================================

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook to get current playing media's info (bitrate, codec, etc.)
 */
export function useMediaInfoCache(): CurrentMediaInfo {
  const project = useEditorStore((state) => state.project);
  const currentTime = useEditorStore((state) => state.currentTime);

  const bitrateCacheRef = useRef<Map<string, BitrateInfoCacheEntry>>(new Map());
  const [currentInfo, setCurrentInfo] = useState<CurrentMediaInfo>({
    bitrate: '',
    codec: '',
    resolution: '',
  });

  /**
   * Get active video element at current time
   */
  const getActiveVideoSrc = useCallback((): string | null => {
    if (!project) return null;

    for (const track of project.tracks) {
      for (const element of track.elements) {
        if (element.type !== 'media') continue;
        if (element.hidden) continue;
        const elementEnd = element.startTime + element.duration;
        if (currentTime >= element.startTime && currentTime < elementEnd) {
          return element.src || null;
        }
      }
    }
    return null;
  }, [project, currentTime]);

  /**
   * Fetch bitrate info for a video path (compatible mode)
   */
  const fetchBitrateInfo = useCallback(async (videoPath: string): Promise<string | null> => {
    // Check cache first
    const cached = bitrateCacheRef.current.get(videoPath);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.bitrate;
    }

    try {
      const proxy = getMediaProxy();
      const info = await proxy.getMediaBitrate(videoPath);

      // Cache the result
      bitrateCacheRef.current.set(videoPath, {
        bitrate: info.totalBitrateStr,
        timestamp: Date.now(),
      });

      return info.totalBitrateStr;
    } catch (error) {
      logger.warn('Failed to fetch bitrate info:', error);
      return null;
    }
  }, []);

  // Effect: Update current info when active video changes
  useEffect(() => {
    const videoSrc = getActiveVideoSrc();
    if (!videoSrc) {
      setCurrentInfo({ bitrate: '', codec: '', resolution: '' });
      return;
    }

    // Check bitrate cache for immediate update
    const bitrateCached = bitrateCacheRef.current.get(videoSrc);
    if (bitrateCached) {
      setCurrentInfo((prev) => ({
        ...prev,
        bitrate: bitrateCached.bitrate,
      }));
    }

    // Fetch in background if not cached or expired
    let cancelled = false;

    fetchBitrateInfo(videoSrc).then((bitrate) => {
      if (cancelled || !bitrate) return;
      setCurrentInfo((prev) => ({
        ...prev,
        bitrate,
      }));
    });

    return () => {
      cancelled = true;
    };
  }, [getActiveVideoSrc, fetchBitrateInfo]);

  return currentInfo;
}
