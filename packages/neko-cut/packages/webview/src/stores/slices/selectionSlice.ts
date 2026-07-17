/**
 * Selection Slice
 * 管理元素选择状态
 */

import { StateCreator } from 'zustand';

export interface SelectedElement {
  trackId: string;
  elementId: string;
}

export interface SelectionSlice {
  // State
  selectedElements: SelectedElement[];

  // Actions
  selectElement: (trackId: string, elementId: string, multi?: boolean) => void;
  deselectElement: (trackId: string, elementId: string) => void;
  clearSelectedElements: () => void;
  setSelectedElements: (elements: SelectedElement[]) => void;
}

export const createSelectionSlice: StateCreator<SelectionSlice, [], [], SelectionSlice> = (
  set,
) => ({
  // Initial state
  selectedElements: [],

  // Actions
  selectElement: (trackId, elementId, multi = false) => {
    set((state) => {
      const exists = state.selectedElements.some(
        (s) => s.trackId === trackId && s.elementId === elementId,
      );
      if (multi) {
        return exists
          ? {
              selectedElements: state.selectedElements.filter(
                (s) => !(s.trackId === trackId && s.elementId === elementId),
              ),
            }
          : { selectedElements: [...state.selectedElements, { trackId, elementId }] };
      }
      return { selectedElements: [{ trackId, elementId }] };
    });
  },

  deselectElement: (trackId, elementId) => {
    set((state) => ({
      selectedElements: state.selectedElements.filter(
        (s) => !(s.trackId === trackId && s.elementId === elementId),
      ),
    }));
  },

  clearSelectedElements: () => set({ selectedElements: [] }),

  setSelectedElements: (elements) => set({ selectedElements: elements }),
});
