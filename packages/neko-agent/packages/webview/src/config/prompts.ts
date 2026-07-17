/**
 * Prompt Preset Configuration
 *
 * Re-exports types from shared package and provides utility functions.
 * Builtin prompts are loaded from platform via ConfigManager.
 */

import type { PromptPresetType } from '@neko/shared';

// Re-export types from shared package
export type { PromptPresetConfig, PromptPresetType, PromptSource } from '@neko/shared';

/**
 * Get prompt type display name
 */
export function getPromptTypeName(type: PromptPresetType): string {
  const typeNames: Record<PromptPresetType, string> = {
    chat: 'Chat',
    coder: 'Coding',
    screenwriter: 'Screenwriting',
    storyboard: 'Storyboard',
    image: 'Image',
    video: 'Video',
    audio: 'Audio',
    plan: 'Plan',
    custom: 'Custom',
  };
  return typeNames[type] || type;
}

/**
 * Get prompt type icon
 */
export function getPromptTypeIcon(type: PromptPresetType): string {
  const icons: Record<PromptPresetType, string> = {
    chat: '💬',
    coder: '👨‍💻',
    screenwriter: '📝',
    storyboard: '🎬',
    image: '🎨',
    video: '🎥',
    audio: '🎵',
    plan: '📋',
    custom: '🔧',
  };
  return icons[type] || '🔧';
}
