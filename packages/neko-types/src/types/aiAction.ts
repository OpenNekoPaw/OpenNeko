// =============================================================================
// AI Quick Actions - Types for AI action buttons and context menu integration
// =============================================================================

/**
 * Element types that can have AI actions applied
 */
export type AIActionElementType = 'video' | 'image' | 'audio' | 'text' | 'shape';

/**
 * AI action capability requirements
 */
export type AIActionCapability =
  | 'text-generation' // LLM text generation
  | 'image-generation' // Image generation (DALL-E, etc.)
  | 'video-generation' // Video generation (Sora, Kling, etc.)
  | 'vision' // Vision analysis (GPT-4V, Claude Vision)
  | 'transcription' // Speech to text (Whisper)
  | 'translation'; // Text translation

/**
 * AI Quick Action definition
 */
export interface AIQuickAction {
  /** Unique action identifier */
  id: string;
  /** Display label (localization key or direct text) */
  label: string;
  /** Icon name (from icon library) */
  icon?: string;
  /** Element types this action applies to */
  elementTypes: AIActionElementType[];
  /** Required AI capabilities */
  requiredCapabilities: AIActionCapability[];
  /** Action category for grouping */
  category: 'generate' | 'edit' | 'analyze' | 'enhance';
  /** Whether this action supports multi-selection */
  supportsMultiSelect?: boolean;
  /** Priority for ordering (higher = shown first) */
  priority?: number;
}

/**
 * AI action execution request
 */
export interface AIActionRequest {
  /** Action to execute */
  actionId: string;
  /** Selected element IDs */
  elementIds: string[];
  /** Additional parameters for the action */
  params?: Record<string, unknown>;
}

/**
 * AI action execution result
 */
export interface AIActionResult {
  /** Whether the action succeeded */
  success: boolean;
  /** Result data (varies by action type) */
  data?: unknown;
  /** Error message if failed */
  error?: string;
  /** Task ID for async operations */
  taskId?: string;
}

/**
 * Built-in AI actions for different element types
 */
export const AI_ACTIONS: AIQuickAction[] = [
  // Video actions
  {
    id: 'video-generate-variant',
    label: 'ai.action.generateVariant',
    icon: 'sparkles',
    elementTypes: ['video'],
    requiredCapabilities: ['video-generation'],
    category: 'generate',
    priority: 100,
  },
  {
    id: 'video-extend',
    label: 'ai.action.extendVideo',
    icon: 'arrow-right',
    elementTypes: ['video'],
    requiredCapabilities: ['video-generation'],
    category: 'generate',
    priority: 90,
  },
  {
    id: 'video-describe',
    label: 'ai.action.describeContent',
    icon: 'file-text',
    elementTypes: ['video', 'image'],
    requiredCapabilities: ['vision'],
    category: 'analyze',
    priority: 80,
  },
  {
    id: 'video-extract-keyframes',
    label: 'ai.action.extractKeyframes',
    icon: 'images',
    elementTypes: ['video'],
    requiredCapabilities: [],
    category: 'analyze',
    priority: 70,
  },

  // Image actions
  {
    id: 'image-to-video',
    label: 'ai.action.imageToVideo',
    icon: 'video',
    elementTypes: ['image'],
    requiredCapabilities: ['video-generation'],
    category: 'generate',
    priority: 100,
  },
  {
    id: 'image-edit',
    label: 'ai.action.editImage',
    icon: 'edit',
    elementTypes: ['image'],
    requiredCapabilities: ['image-generation'],
    category: 'edit',
    priority: 90,
  },
  {
    id: 'image-upscale',
    label: 'ai.action.upscale',
    icon: 'maximize',
    elementTypes: ['image', 'video'],
    requiredCapabilities: [],
    category: 'enhance',
    priority: 80,
  },

  // Text/Subtitle actions
  {
    id: 'text-translate',
    label: 'ai.action.translate',
    icon: 'languages',
    elementTypes: ['text'],
    requiredCapabilities: ['translation'],
    category: 'edit',
    priority: 100,
  },
  {
    id: 'text-rewrite',
    label: 'ai.action.rewrite',
    icon: 'pencil',
    elementTypes: ['text'],
    requiredCapabilities: ['text-generation'],
    category: 'edit',
    priority: 90,
  },
  {
    id: 'text-generate-voiceover',
    label: 'ai.action.generateVoiceover',
    icon: 'mic',
    elementTypes: ['text'],
    requiredCapabilities: [],
    category: 'generate',
    priority: 80,
  },

  // Audio actions
  {
    id: 'audio-transcribe',
    label: 'ai.action.transcribe',
    icon: 'file-text',
    elementTypes: ['audio'],
    requiredCapabilities: ['transcription'],
    category: 'analyze',
    priority: 100,
  },

  // Multi-element actions
  {
    id: 'batch-style-unify',
    label: 'ai.action.unifyStyle',
    icon: 'palette',
    elementTypes: ['video', 'image'],
    requiredCapabilities: ['vision'],
    category: 'enhance',
    supportsMultiSelect: true,
    priority: 50,
  },
];

/**
 * Get available AI actions for given element type(s)
 */
export function getActionsForElementType(
  elementType: AIActionElementType,
  isMultiSelect: boolean = false,
): AIQuickAction[] {
  return AI_ACTIONS.filter((action) => {
    const typeMatch = action.elementTypes.includes(elementType);
    const multiSelectMatch = !isMultiSelect || action.supportsMultiSelect;
    return typeMatch && multiSelectMatch;
  }).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

/**
 * Map TimelineElement type to AIActionElementType
 */
export function mapElementTypeToAIType(
  elementType: 'media' | 'text' | 'audio' | 'shape' | 'subtitle' | 'scene3d' | 'puppet',
  mediaType?: 'video' | 'image',
): AIActionElementType {
  switch (elementType) {
    case 'media':
      return mediaType === 'image' ? 'image' : 'video';
    case 'text':
      return 'text';
    case 'audio':
      return 'audio';
    case 'shape':
      return 'shape';
    case 'subtitle':
      return 'text';
    case 'scene3d':
    case 'puppet':
      return 'video'; // Treat scene3d/puppet as video for AI actions
    default:
      return 'video';
  }
}
