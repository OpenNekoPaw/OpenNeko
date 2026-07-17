// =============================================================================
// SelectionSlice Tests
// =============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { create } from 'zustand';
import type { SelectionSlice, SelectedElement } from '../selectionSlice';
import { createSelectionSlice } from '../selectionSlice';

// -- Test helpers ----------------------------------------------------------

function createTestStore() {
  return create<SelectionSlice>()((set, get, store) => ({
    ...createSelectionSlice(set, get, store),
  }));
}

// -- Tests -----------------------------------------------------------------

describe('selectionSlice', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    store = createTestStore();
  });

  describe('initial state', () => {
    it('should start with empty selectedElements', () => {
      expect(store.getState().selectedElements).toEqual([]);
    });
  });

  describe('selectElement', () => {
    it('should select a single element (non-multi)', () => {
      store.getState().selectElement('track1', 'elem1');
      expect(store.getState().selectedElements).toEqual([
        { trackId: 'track1', elementId: 'elem1' },
      ]);
    });

    it('should replace selection in single-select mode', () => {
      store.getState().selectElement('track1', 'elem1');
      store.getState().selectElement('track2', 'elem2');
      expect(store.getState().selectedElements).toEqual([
        { trackId: 'track2', elementId: 'elem2' },
      ]);
    });

    it('should add to selection in multi-select mode', () => {
      store.getState().selectElement('track1', 'elem1');
      store.getState().selectElement('track2', 'elem2', true);
      expect(store.getState().selectedElements).toHaveLength(2);
      expect(store.getState().selectedElements).toContainEqual({
        trackId: 'track1',
        elementId: 'elem1',
      });
      expect(store.getState().selectedElements).toContainEqual({
        trackId: 'track2',
        elementId: 'elem2',
      });
    });

    it('should toggle off existing element in multi-select mode', () => {
      store.getState().selectElement('track1', 'elem1');
      store.getState().selectElement('track2', 'elem2', true);
      // Toggle off elem1
      store.getState().selectElement('track1', 'elem1', true);
      expect(store.getState().selectedElements).toEqual([
        { trackId: 'track2', elementId: 'elem2' },
      ]);
    });

    it('should not duplicate when selecting already-selected in single mode', () => {
      store.getState().selectElement('track1', 'elem1');
      store.getState().selectElement('track1', 'elem1');
      expect(store.getState().selectedElements).toHaveLength(1);
    });

    it('should handle selecting from same track different elements', () => {
      store.getState().selectElement('track1', 'elem1');
      store.getState().selectElement('track1', 'elem2', true);
      expect(store.getState().selectedElements).toHaveLength(2);
    });
  });

  describe('deselectElement', () => {
    it('should remove a specific element from selection', () => {
      store.getState().selectElement('track1', 'elem1');
      store.getState().selectElement('track2', 'elem2', true);
      store.getState().deselectElement('track1', 'elem1');
      expect(store.getState().selectedElements).toEqual([
        { trackId: 'track2', elementId: 'elem2' },
      ]);
    });

    it('should do nothing when deselecting non-selected element', () => {
      store.getState().selectElement('track1', 'elem1');
      store.getState().deselectElement('track2', 'elem99');
      expect(store.getState().selectedElements).toHaveLength(1);
    });

    it('should result in empty array when deselecting the only element', () => {
      store.getState().selectElement('track1', 'elem1');
      store.getState().deselectElement('track1', 'elem1');
      expect(store.getState().selectedElements).toEqual([]);
    });

    it('should only deselect matching trackId AND elementId', () => {
      // Same elementId but different trackId
      store.getState().selectElement('track1', 'elem1');
      store.getState().selectElement('track2', 'elem1', true);
      store.getState().deselectElement('track1', 'elem1');
      expect(store.getState().selectedElements).toEqual([
        { trackId: 'track2', elementId: 'elem1' },
      ]);
    });
  });

  describe('clearSelectedElements', () => {
    it('should clear all selections', () => {
      store.getState().selectElement('track1', 'elem1');
      store.getState().selectElement('track2', 'elem2', true);
      store.getState().clearSelectedElements();
      expect(store.getState().selectedElements).toEqual([]);
    });

    it('should be safe to call when already empty', () => {
      store.getState().clearSelectedElements();
      expect(store.getState().selectedElements).toEqual([]);
    });
  });

  describe('setSelectedElements', () => {
    it('should replace entire selection array', () => {
      const newSelection: SelectedElement[] = [
        { trackId: 't1', elementId: 'e1' },
        { trackId: 't2', elementId: 'e2' },
        { trackId: 't3', elementId: 'e3' },
      ];
      store.getState().setSelectedElements(newSelection);
      expect(store.getState().selectedElements).toEqual(newSelection);
    });

    it('should override existing selections', () => {
      store.getState().selectElement('track1', 'elem1');
      store.getState().setSelectedElements([{ trackId: 'newTrack', elementId: 'newElem' }]);
      expect(store.getState().selectedElements).toEqual([
        { trackId: 'newTrack', elementId: 'newElem' },
      ]);
    });

    it('should accept empty array', () => {
      store.getState().selectElement('track1', 'elem1');
      store.getState().setSelectedElements([]);
      expect(store.getState().selectedElements).toEqual([]);
    });
  });

  describe('complex scenarios', () => {
    it('should handle rapid select/deselect cycles', () => {
      for (let i = 0; i < 10; i++) {
        store.getState().selectElement('track1', `elem${i}`, true);
      }
      expect(store.getState().selectedElements).toHaveLength(10);
      for (let i = 0; i < 5; i++) {
        store.getState().deselectElement('track1', `elem${i}`);
      }
      expect(store.getState().selectedElements).toHaveLength(5);
    });

    it('should maintain selection state isolation', () => {
      // Selecting in single mode should not be affected by previous multi-selects
      store.getState().selectElement('t1', 'e1');
      store.getState().selectElement('t2', 'e2', true);
      store.getState().selectElement('t3', 'e3', true);
      expect(store.getState().selectedElements).toHaveLength(3);

      // Single select resets everything
      store.getState().selectElement('t4', 'e4');
      expect(store.getState().selectedElements).toHaveLength(1);
      expect(store.getState().selectedElements[0]).toEqual({
        trackId: 't4',
        elementId: 'e4',
      });
    });
  });
});
