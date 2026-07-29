import { create } from 'zustand';
import type { CanvasViewport } from '@neko/shared';

export interface RuntimeViewportState {
  viewport: CanvasViewport;
  seededDocumentKey: string | null;
  setViewport: (viewport: Partial<CanvasViewport>) => void;
  zoomCanvas: (zoom: number, center?: { x: number; y: number }) => void;
  resetViewport: () => void;
  seedViewportFromDocument: (documentKey: string, viewport: CanvasViewport) => void;
}

export const DEFAULT_RUNTIME_VIEWPORT: CanvasViewport = {
  pan: { x: 0, y: 0 },
  zoom: 1,
};

const MIN_RUNTIME_ZOOM = 0.05;
const MAX_RUNTIME_ZOOM = 16;

function clampRuntimeZoom(zoom: number): number {
  return Math.max(MIN_RUNTIME_ZOOM, Math.min(MAX_RUNTIME_ZOOM, zoom));
}

export const useRuntimeViewportStore = create<RuntimeViewportState>((set) => ({
  viewport: DEFAULT_RUNTIME_VIEWPORT,
  seededDocumentKey: null,

  setViewport: (viewport) => {
    set((state) => ({
      viewport: {
        ...state.viewport,
        ...viewport,
      },
    }));
  },

  zoomCanvas: (zoom, center) => {
    set((state) => {
      const clampedZoom = clampRuntimeZoom(zoom);
      if (!center) {
        return {
          viewport: {
            ...state.viewport,
            zoom: clampedZoom,
          },
        };
      }

      const zoomRatio = clampedZoom / state.viewport.zoom;
      return {
        viewport: {
          zoom: clampedZoom,
          pan: {
            x: center.x - (center.x - state.viewport.pan.x) * zoomRatio,
            y: center.y - (center.y - state.viewport.pan.y) * zoomRatio,
          },
        },
      };
    });
  },

  resetViewport: () => {
    set({ viewport: DEFAULT_RUNTIME_VIEWPORT });
  },

  seedViewportFromDocument: (documentKey, viewport) => {
    set({
      viewport,
      seededDocumentKey: documentKey,
    });
  },
}));
