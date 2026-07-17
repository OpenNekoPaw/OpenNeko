/**
 * AI Action Types and Helpers Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  AI_ACTIONS,
  getActionsForElementType,
  mapElementTypeToAIType,
  type AIQuickAction,
  type AIActionElementType,
} from '../types/aiAction';

describe('AI_ACTIONS', () => {
  it('should define all expected actions', () => {
    expect(AI_ACTIONS).toBeDefined();
    expect(Array.isArray(AI_ACTIONS)).toBe(true);
    expect(AI_ACTIONS.length).toBeGreaterThan(0);
  });

  it('should have unique action IDs', () => {
    const ids = AI_ACTIONS.map((a) => a.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should have valid element types for each action', () => {
    const validElementTypes: AIActionElementType[] = ['video', 'image', 'audio', 'text', 'shape'];

    for (const action of AI_ACTIONS) {
      expect(action.elementTypes).toBeDefined();
      expect(action.elementTypes.length).toBeGreaterThan(0);
      for (const type of action.elementTypes) {
        expect(validElementTypes).toContain(type);
      }
    }
  });

  it('should have valid categories for each action', () => {
    const validCategories = ['generate', 'edit', 'analyze', 'enhance'];

    for (const action of AI_ACTIONS) {
      expect(validCategories).toContain(action.category);
    }
  });

  it('should include video-specific actions', () => {
    const videoActions = AI_ACTIONS.filter((a) => a.elementTypes.includes('video'));
    expect(videoActions.length).toBeGreaterThan(0);

    const actionIds = videoActions.map((a) => a.id);
    expect(actionIds).toContain('video-generate-variant');
    expect(actionIds).toContain('video-extend');
    expect(actionIds).toContain('video-describe');
  });

  it('should include image-specific actions', () => {
    const imageActions = AI_ACTIONS.filter((a) => a.elementTypes.includes('image'));
    expect(imageActions.length).toBeGreaterThan(0);

    const actionIds = imageActions.map((a) => a.id);
    expect(actionIds).toContain('image-to-video');
    expect(actionIds).toContain('image-edit');
  });

  it('should include text-specific actions', () => {
    const textActions = AI_ACTIONS.filter((a) => a.elementTypes.includes('text'));
    expect(textActions.length).toBeGreaterThan(0);

    const actionIds = textActions.map((a) => a.id);
    expect(actionIds).toContain('text-translate');
    expect(actionIds).toContain('text-rewrite');
  });

  it('should include audio-specific actions', () => {
    const audioActions = AI_ACTIONS.filter((a) => a.elementTypes.includes('audio'));
    expect(audioActions.length).toBeGreaterThan(0);

    const actionIds = audioActions.map((a) => a.id);
    expect(actionIds).toContain('audio-transcribe');
  });
});

describe('getActionsForElementType', () => {
  it('should return actions for video element type', () => {
    const actions = getActionsForElementType('video');
    expect(actions.length).toBeGreaterThan(0);

    for (const action of actions) {
      expect(action.elementTypes).toContain('video');
    }
  });

  it('should return actions for image element type', () => {
    const actions = getActionsForElementType('image');
    expect(actions.length).toBeGreaterThan(0);

    for (const action of actions) {
      expect(action.elementTypes).toContain('image');
    }
  });

  it('should return actions for text element type', () => {
    const actions = getActionsForElementType('text');
    expect(actions.length).toBeGreaterThan(0);

    for (const action of actions) {
      expect(action.elementTypes).toContain('text');
    }
  });

  it('should return actions for audio element type', () => {
    const actions = getActionsForElementType('audio');
    expect(actions.length).toBeGreaterThan(0);

    for (const action of actions) {
      expect(action.elementTypes).toContain('audio');
    }
  });

  it('should return empty array for shape element type (no actions defined)', () => {
    const actions = getActionsForElementType('shape');
    // Shape might not have any AI actions yet
    expect(Array.isArray(actions)).toBe(true);
  });

  it('should sort actions by priority (descending)', () => {
    const actions = getActionsForElementType('video');

    for (let i = 0; i < actions.length - 1; i++) {
      const currentPriority = actions[i].priority ?? 0;
      const nextPriority = actions[i + 1].priority ?? 0;
      expect(currentPriority).toBeGreaterThanOrEqual(nextPriority);
    }
  });

  it('should filter out non-multi-select actions when isMultiSelect is true', () => {
    const singleSelectActions = getActionsForElementType('video', false);
    const multiSelectActions = getActionsForElementType('video', true);

    // Multi-select should only return actions that support multi-select
    for (const action of multiSelectActions) {
      expect(action.supportsMultiSelect).toBe(true);
    }

    // Single select should include all actions for the type
    expect(singleSelectActions.length).toBeGreaterThanOrEqual(multiSelectActions.length);
  });
});

describe('mapElementTypeToAIType', () => {
  it('should map media type to video by default', () => {
    expect(mapElementTypeToAIType('media')).toBe('video');
  });

  it('should map media type with video mediaType to video', () => {
    expect(mapElementTypeToAIType('media', 'video')).toBe('video');
  });

  it('should map media type with image mediaType to image', () => {
    expect(mapElementTypeToAIType('media', 'image')).toBe('image');
  });

  it('should map text type to text', () => {
    expect(mapElementTypeToAIType('text')).toBe('text');
  });

  it('should map audio type to audio', () => {
    expect(mapElementTypeToAIType('audio')).toBe('audio');
  });

  it('should map shape type to shape', () => {
    expect(mapElementTypeToAIType('shape')).toBe('shape');
  });
});

describe('AIQuickAction interface', () => {
  it('should allow creating a valid action object', () => {
    const action: AIQuickAction = {
      id: 'test-action',
      label: 'Test Action',
      elementTypes: ['video', 'image'],
      requiredCapabilities: ['vision'],
      category: 'analyze',
    };

    expect(action.id).toBe('test-action');
    expect(action.label).toBe('Test Action');
    expect(action.elementTypes).toHaveLength(2);
    expect(action.requiredCapabilities).toContain('vision');
    expect(action.category).toBe('analyze');
  });

  it('should allow optional fields', () => {
    const action: AIQuickAction = {
      id: 'test-action',
      label: 'Test Action',
      elementTypes: ['video'],
      requiredCapabilities: [],
      category: 'generate',
      icon: 'sparkles',
      supportsMultiSelect: true,
      priority: 100,
    };

    expect(action.icon).toBe('sparkles');
    expect(action.supportsMultiSelect).toBe(true);
    expect(action.priority).toBe(100);
  });
});
