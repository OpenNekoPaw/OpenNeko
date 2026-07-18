/**
 * Tool Names — Single source of truth for all registered tool name constants.
 *
 * Every tool registration and skill allowedTools reference MUST use these constants
 * instead of raw strings. This prevents naming drift between tool definitions and
 * skill configurations.
 *
 * Categories:
 * - TIMELINE: neko-cut timeline operations
 * - CANVAS: neko-canvas node/generation operations
 * - MEDIA: platform-level media generation (GenerateImage, etc.)
 * - PIPELINE: pipeline orchestration and diagnostics
 * - QUALITY: quality check and consistency tools
 * - EFFECTS: video effects and shader management
 * - ASSETS: asset management tools
 * - TRANSCRIBE: speech-to-text tools
 * - SYSTEM: system/utility tools (file ops, skill discovery)
 */

// =============================================================================
// NekoCut — Timeline Operations
// =============================================================================

export const TOOL_NAMES_TIMELINE = {
  GET_TIMELINE_INFO: 'GetTimelineInfo',
  CUT_GET_TIMELINE_INFO: 'cut.getTimelineInfo',
  CUT_IMPORT_CANVAS_DRAFT: 'cut.importCanvasDraft',
  CUT_REVEAL_TIMELINE: 'cut.revealTimeline',
  GET_ELEMENT_INFO: 'GetElementInfo',
  LIST_TIMELINE_ELEMENTS: 'ListTimelineElements',
  LIST_EFFECTS: 'ListEffects',
  LIST_TRANSITIONS: 'ListTransitions',
  ADD_TIMELINE_ELEMENT: 'AddTimelineElement',
  UPDATE_TIMELINE_ELEMENT: 'UpdateTimelineElement',
  DELETE_TIMELINE_ELEMENT: 'DeleteTimelineElement',
  TRIM_ELEMENT: 'TrimElement',
  SPLIT_ELEMENT: 'SplitElement',
  ADD_EFFECT: 'AddEffect',
  UPDATE_EFFECT: 'UpdateEffect',
  REMOVE_EFFECT: 'RemoveEffect',
  SET_TRANSITION: 'SetTransition',
  REMOVE_TRANSITION: 'RemoveTransition',
  ADD_TRACK: 'AddTrack',
  DELETE_TRACK: 'DeleteTrack',
  REORDER_TRACKS: 'ReorderTracks',
  SET_TRACK_PROPERTIES: 'SetTrackProperties',
  SET_COLOR_CORRECTION: 'SetColorCorrection',
  RESET_COLOR_CORRECTION: 'ResetColorCorrection',
  SET_AUDIO_PROPERTIES: 'SetAudioProperties',
  ADD_AUDIO_KEYFRAME: 'AddAudioKeyframe',
  SEPARATE_AUDIO: 'SeparateAudio',
  SET_PLAYBACK_SPEED: 'SetPlaybackSpeed',
} as const;

// =============================================================================
// NekoCanvas — Canvas Operations
// =============================================================================

export const TOOL_NAMES_CANVAS = {
  CANVAS_GET_PLAYBACK_PLAN: 'canvas.getPlaybackPlan',
  CANVAS_GET_PLAYBACK_ROUTES: 'canvas.getPlaybackRoutes',
  CANVAS_REVEAL_PLAYBACK_WORKSPACE: 'canvas.revealPlaybackWorkspace',
  CANVAS_CREATE_CUT_DRAFT_FROM_ROUTE: 'canvas.createCutDraftFromRoute',
  CANVAS_REORDER_PLAYBACK_UNITS: 'canvas.reorderPlaybackUnits',
  CANVAS_INGEST_MARKDOWN: 'canvas.ingestMarkdown',
  CANVAS_CREATE_MARKDOWN_NOTE: 'canvas.createMarkdownNote',
  CANVAS_CREATE_TABLE_FROM_MARKDOWN: 'canvas.createTableFromMarkdown',
  CANVAS_CREATE_STORYBOARD_FROM_MARKDOWN: 'canvas.createStoryboardFromMarkdown',
  CANVAS_ATTACH_RESOURCE: 'canvas.attachResource',
  CANVAS_VALIDATE_MARKDOWN_STORYBOARD: 'canvas.validateMarkdownStoryboard',
  CANVAS_LIST_NODES: 'canvas_list_nodes',
  CANVAS_GET_NODE: 'canvas_get_node',
  CANVAS_UPDATE_NODE: 'canvas_update_node',
  CANVAS_CREATE_NODE: 'canvas_create_node',
  CANVAS_DERIVE_NODE: 'canvas_derive_node',
  CANVAS_CREATE_COMPOSITE: 'canvas_create_composite',
  CANVAS_UPDATE_BLOCK: 'canvas_update_block',
  CANVAS_EXTRACT_STRUCTURED_CONTENT: 'canvas_extract_structured_content',
  CANVAS_GET_ACTIVE_CONTEXT: 'canvas_get_active_context',
  CANVAS_APPLY_AGENT_CONTENT: 'canvas_apply_agent_content',
  CANVAS_DESCRIBE_AUTHORING_CAPABILITIES: 'canvas_describe_authoring_capabilities',
  CANVAS_LIST_CONNECTIONS: 'canvas_list_connections',
  CANVAS_GET_CONNECTION: 'canvas_get_connection',
  CANVAS_CREATE_CONNECTION: 'canvas_create_connection',
  CANVAS_NARRATIVE_TRAVERSE: 'canvas_narrative_traverse',
  CANVAS_GET_STORYBOARD_EXECUTION_SUMMARY: 'canvas_get_storyboard_execution_summary',
  CANVAS_GENERATE_IMAGE: 'canvas_generate_image',
  CANVAS_GENERATE_BATCH: 'canvas_generate_batch',
  CANVAS_GENERATE_VIDEO_WITH_KEYFRAMES: 'canvas_generate_video_with_keyframes',
  CANVAS_APPLY_STYLE_TRANSFER: 'canvas_apply_style_transfer',
  SET_PROJECT_GENERATION_CONFIG: 'set_project_generation_config',
  EXPORT_STORYBOARD: 'export_storyboard',
  IMPORT_SCRIPT_TO_CANVAS: 'import_script_to_canvas',
} as const;

// =============================================================================
// Platform Media — Generation Tools
// =============================================================================

export const TOOL_NAMES_MEDIA = {
  GENERATE_IMAGE: 'GenerateImage',
  TRANSFORM_IMAGE: 'TransformImage',
  GENERATE_VIDEO: 'GenerateVideo',
  GENERATE_MUSIC: 'GenerateMusic',
  GENERATE_TTS: 'GenerateTTS',
} as const;

// =============================================================================
// Quality — Canonical Review Gate
// =============================================================================

export const TOOL_NAMES_QUALITY = {
  QUALITY_CHECK: 'QualityCheck',
} as const;

// =============================================================================
// Effects — Video Effects and Shaders
// =============================================================================

export const TOOL_NAMES_EFFECTS = {
  LIST_VIDEO_EFFECTS: 'ListVideoEffects',
  GET_VIDEO_EFFECT_INFO: 'GetVideoEffectInfo',
  REGISTER_CUSTOM_SHADER: 'RegisterCustomShader',
} as const;

// =============================================================================
// Assets — Asset Management
// =============================================================================

export const TOOL_NAMES_ASSETS = {
  LIST_ASSETS: 'ListAssets',
  GET_ASSET: 'GetAsset',
  IMPORT_ASSET: 'ImportAsset',
} as const;

// =============================================================================
// Creative Entities — Entity Facts and Projections
// =============================================================================

export const TOOL_NAMES_ENTITY = {
  LIST_CREATIVE_ENTITIES: 'ListCreativeEntities',
  GET_CREATIVE_ENTITY: 'GetCreativeEntity',
} as const;

// =============================================================================
// Project Search — Sanitized Project-Wide Search
// =============================================================================

export const TOOL_NAMES_SEARCH = {
  QUERY_PROJECT_SEARCH: 'QueryProjectSearch',
} as const;

// =============================================================================
// Transcribe — Speech-to-Text
// =============================================================================

export const TOOL_NAMES_TRANSCRIBE = {
  TRANSCRIBE_AUDIO: 'TranscribeAudio',
} as const;

// =============================================================================
// Perception — Optional Evidence Tools
// =============================================================================

export const TOOL_NAMES_PERCEPTION = {
  PERCEIVE: 'perception.perceive',
  IMAGE_UNDERSTAND: 'perception.image.understand',
  DESCRIBE_INPUT: 'perception.describeInput',
  AUDIO_TRANSCRIBE: 'perception.audio.transcribe',
  IMAGE_SIMILARITY: 'perception.image.similarity',
  IMAGE_CLASSIFY: 'perception.image.classify',
  VIDEO_DETECT_SHOTS: 'perception.video.detectShots',
} as const;

// =============================================================================
// System — Utility Tools
// =============================================================================

export const TOOL_NAMES_SYSTEM = {
  LIST_PLUGIN_SKILLS: 'ListPluginSkills',
  READ_DOCUMENT: 'ReadDocument',
  READ_IMAGE: 'ReadImage',
  QUERY_SEMANTIC_COVERAGE: 'QuerySemanticCoverage',
  // Core file tools (registered by agent core, not extension)
  READ: 'Read',
  WRITE: 'Write',
  LIST_DIRECTORY: 'ListDirectory',
  GLOB: 'Glob',
} as const;

// =============================================================================
// Unified TOOL_NAMES — Flat export for convenience
// =============================================================================

// =============================================================================
// Dual-Flow — Creation ring tools (P2 W6)
// =============================================================================
// Outer-ring tools that operate at the business-semantic layer
// (Orchestration / Proposal / Review / Execution / Status).
//
// Slots are reserved for later sub-packages to fill. Empty is
// intentional — the namespace is a registration surface, not a
// pre-populated list.

export const TOOL_NAMES_CREATION = {
  // Slots reserved for business-layer tools — e.g. 'creation.proposal.compose',
  // 'creation.review.request', 'creation.status.narrate'. Fill in as
  // creation-flow persona skills are authored.
} as const;

// =============================================================================
// Dual-Flow — Execution ring tools (P2 W6)
// =============================================================================
// Inner-ring tools that operate at the technical-semantic layer
// (Plan / TODO / Approve / Apply / Step).

export const TOOL_NAMES_EXECUTION = {
  // Slots reserved — e.g. 'execution.plan.produce', 'execution.todo.update',
  // 'execution.apply.commit'. Fill in as execution-flow machinery comes
  // online (P3 autoheal, P4 approval, Q3 recovery guidance).
} as const;

/**
 * All registered tool names as a flat constant object.
 * Use individual category objects (TOOL_NAMES_TIMELINE, etc.) for category-scoped access.
 */
export const TOOL_NAMES = {
  ...TOOL_NAMES_TIMELINE,
  ...TOOL_NAMES_CANVAS,
  ...TOOL_NAMES_MEDIA,
  ...TOOL_NAMES_QUALITY,
  ...TOOL_NAMES_EFFECTS,
  ...TOOL_NAMES_ASSETS,
  ...TOOL_NAMES_TRANSCRIBE,
  ...TOOL_NAMES_PERCEPTION,
  ...TOOL_NAMES_SYSTEM,
  ...TOOL_NAMES_CREATION,
  ...TOOL_NAMES_EXECUTION,
} as const;

/** Union type of all registered tool name strings */
export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];
