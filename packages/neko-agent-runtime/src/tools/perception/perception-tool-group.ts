import { TOOL_NAMES_PERCEPTION, type ToolGroup } from '@neko/shared';

export const perceptionToolGroup: ToolGroup = {
  name: 'perception-evidence',
  description:
    'Optional perception evidence tools for Agent-first multimodal workflows. Use them only to attach evidence when the Agent wants extra support.',
  tools: [
    TOOL_NAMES_PERCEPTION.DESCRIBE_INPUT,
    TOOL_NAMES_PERCEPTION.PERCEIVE,
    TOOL_NAMES_PERCEPTION.AUDIO_TRANSCRIBE,
    TOOL_NAMES_PERCEPTION.IMAGE_SIMILARITY,
    TOOL_NAMES_PERCEPTION.IMAGE_CLASSIFY,
    TOOL_NAMES_PERCEPTION.VIDEO_DETECT_SHOTS,
  ],
  alwaysActive: false,
  priority: 50,
  loadingTier: 'lazy',
  source: 'builtin',
  enabled: true,
  icon: '👁️',
};
