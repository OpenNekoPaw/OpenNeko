import type { MessageBundle } from '@neko/shared';

export const ai = {
  'ai.action.title': 'AI Actions',
  'ai.action.button': 'AI',
  'ai.action.generateVariant': 'Generate Variant',
  'ai.action.extendVideo': 'Extend Video',
  'ai.action.describeContent': 'Describe Content',
  'ai.action.extractKeyframes': 'Extract Keyframes',
  'ai.action.imageToVideo': 'Image to Video',
  'ai.action.editImage': 'Edit Image',
  'ai.action.upscale': 'Upscale',
  'ai.action.translate': 'Translate',
  'ai.action.rewrite': 'Rewrite',
  'ai.action.generateVoiceover': 'Generate Voiceover',
  'ai.action.transcribe': 'Transcribe',
  'ai.action.unifyStyle': 'Unify Style',

  'ai.panel.actions': 'Actions',
  'ai.panel.templates': 'Templates',
  'ai.panel.selectElement': 'Select an element to see available actions',
  'ai.panel.noTemplates': 'No templates available',
} as const satisfies MessageBundle;
