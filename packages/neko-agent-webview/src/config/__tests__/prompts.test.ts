import { describe, it, expect } from 'vitest';
import { getPromptTypeName, getPromptTypeIcon } from '../prompts';
import type { PromptPresetType } from '@neko/shared';

describe('prompts config', () => {
  const validTypes: PromptPresetType[] = [
    'chat',
    'coder',
    'screenwriter',
    'storyboard',
    'image',
    'video',
    'custom',
  ];

  describe('getPromptTypeName()', () => {
    it('should return "Chat" for chat type', () => {
      expect(getPromptTypeName('chat')).toBe('Chat');
    });

    it('should return "Coding" for coder type', () => {
      expect(getPromptTypeName('coder')).toBe('Coding');
    });

    it('should return "Screenwriting" for screenwriter type', () => {
      expect(getPromptTypeName('screenwriter')).toBe('Screenwriting');
    });

    it('should return "Storyboard" for storyboard type', () => {
      expect(getPromptTypeName('storyboard')).toBe('Storyboard');
    });

    it('should return "Image" for image type', () => {
      expect(getPromptTypeName('image')).toBe('Image');
    });

    it('should return "Video" for video type', () => {
      expect(getPromptTypeName('video')).toBe('Video');
    });

    it('should return "Custom" for custom type', () => {
      expect(getPromptTypeName('custom')).toBe('Custom');
    });

    it('should return the type itself for unknown types', () => {
      const unknownType = 'unknown-type' as PromptPresetType;
      expect(getPromptTypeName(unknownType)).toBe('unknown-type');
    });
  });

  describe('getPromptTypeIcon()', () => {
    it('should return 💬 for chat type', () => {
      expect(getPromptTypeIcon('chat')).toBe('💬');
    });

    it('should return 👨‍💻 for coder type', () => {
      expect(getPromptTypeIcon('coder')).toBe('👨‍💻');
    });

    it('should return 📝 for screenwriter type', () => {
      expect(getPromptTypeIcon('screenwriter')).toBe('📝');
    });

    it('should return 🎬 for storyboard type', () => {
      expect(getPromptTypeIcon('storyboard')).toBe('🎬');
    });

    it('should return 🎨 for image type', () => {
      expect(getPromptTypeIcon('image')).toBe('🎨');
    });

    it('should return 🎥 for video type', () => {
      expect(getPromptTypeIcon('video')).toBe('🎥');
    });

    it('should return 🔧 for custom type', () => {
      expect(getPromptTypeIcon('custom')).toBe('🔧');
    });

    it('should return 🔧 for unknown types', () => {
      const unknownType = 'unknown-type' as PromptPresetType;
      expect(getPromptTypeIcon(unknownType)).toBe('🔧');
    });
  });

  describe('all valid types have mappings', () => {
    it('should return non-empty name for all valid types', () => {
      validTypes.forEach((type) => {
        const name = getPromptTypeName(type);
        expect(typeof name).toBe('string');
        expect(name.length).toBeGreaterThan(0);
      });
    });

    it('should return non-empty icon for all valid types', () => {
      validTypes.forEach((type) => {
        const icon = getPromptTypeIcon(type);
        expect(typeof icon).toBe('string');
        expect(icon.length).toBeGreaterThan(0);
      });
    });
  });
});
