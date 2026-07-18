// =============================================================================
// Types Index - Re-export all types from submodules
// =============================================================================

// Generated engine types (from packages/neko-proto/*.proto)
export * from '../generated/timeline.engine';
export * from '../generated/diff.engine';
export * from '../generated/scene.engine';
export type { EngineResolution } from '../generated/timeline.engine';

// Track types
export * from './track';

// Easing types
export * from './easing';

// Blend modes
export * from './blendMode';
export * from './sketch-psd-import';
export * from './sketch-psd-blend-mode';
export * from './sketch-ai';

// Transform
export * from './transform';

// Color correction
export * from './colorCorrection';

// Geometry primitives
export * from './geometry';

// Masks
export * from './mask';

// Transitions
export * from './transition';

// Effects
export * from './effects';

// Keyframes
export * from './keyframe';

// Audio
export * from './audio';
export * from './audioAutomation';
export * from './audioEffectParams';
export * from './audioMix';
export * from './audioProtocol';
export * from './audioTempo';

// Speed
export * from './speed';

// Shapes
export * from './shape';

// Timeline elements
export * from './element';

// Subtitle
export * from './subtitle';

// Timeline tracks
export * from './timelineTrack';

// Project
export * from './project';

// Messages
export * from './message';

// Configuration
export * from './config';
export * from './agent-ai-source';
export * from './external-research';

// AI Actions
export * from './aiAction';

// Task core types (TaskManager interfaces)
export * from './agent-runtime-scope';
export * from './task';

// Task Views (Extension ↔ Webview DTO)
export * from './task-view';

// Dashboard task monitoring contracts
export * from './dashboard-task';
export * from './dashboard-project';
export * from './dashboard-creative-entity';
export * from './creative-entity-facade';
export * from './npc-test-bench';

// SubAgent UI Types
export * from './subagent';

// =============================================================================
// Platform/Agent Shared Types (for package split)
// =============================================================================

// Tool types
export * from './tool-planning';
export * from './tool';
export * from './domain-routing';

// MCP types
export * from './mcp';

// Platform interface types
export * from './platform';

// Agent interface types
export * from './agent';
export * from './agent-autoheal';
export * from './agent-capability-activation';
export * from './agent-capability-diagnostics';
export * from './agent-capability-lifecycle';
export * from './agent-feedback';
export * from './agent-profile';
export * from './agent-output-validation';
export * from './reference-contributor';

// Agent execution trace contracts
export * from './agent-trace';
export * from './agent-token-budget';
export * from './agent-task-result-observation';

// Memory types (for agent context management)
export * from './memory';

// Skill types (Claude-compatible skills and slash commands)
export * from './skill';
export * from './portable-skill';

// Skill lifecycle types (activation records and request-time projection)
export * from './skill-lifecycle';

// ToolGroup types (dynamic tool injection)
export * from './tool-group';

// Tool category types (tool categorization and layer management)
export * from './tool-category';

// Perception tool contracts (Agent-first optional evidence providers)
export * from './perception-tool';
export * from './perception-card';

// Tool injection types (three-layer injection mechanism)
export * from './tool-injection';

// Hook types (file-based hooks for agent automation)
export * from './hook';

// Media protocol types (Extension ↔ Webview media processing IPC)
export * from './mediaProtocol';

// Export protocol types (Extension ↔ Webview export IPC)
export * from './exportProtocol';

// Media diff protocol types (Extension ↔ Webview media diff IPC)
export * from './mediaDiffProtocol';

// Asset management types
export * from './asset';

// Bundle locators and character asset import contracts
export * from './bundle-locator';
export * from './media-import';
export * from './asset-export';
export * from './project-asset-dependency-manifest';

// Context manager types (token budget and lifecycle management)
export * from './context-manager';

// Conversation compressor types (sliding window and summarization)
export * from './conversation-compressor';

// Skill conflict resolution types
export * from './skill-conflict';

// Context persistence types (cross-session state)
export * from './context-persistence';

// Project memory types (cross-session agent memory)
export * from './project-memory';

// Prompt types (prompt template management)
export * from './prompt';

// Agent message types (unified message types for Extension ↔ Webview ↔ CLI)
export * from './agent-message';
export * from './creative-ai-invocation';

// Media engine types (progressive media processing architecture)
export * from './mediaEngine';

// Canvas types (infinite canvas editor)
export * from './canvas';
export * from './canvas-creative-scope';
export * from './canvas-workspace-board';
export * from './canvas-playback';
export * from './canvas-layered';
export * from './canvas-serializable';
export * from './canvas-presets';
export * from './canvas-agent-operations';
export * from './canvas-authoring-contracts';
export * from './canvas-headless-authoring';
export * from './canvas-semantic-storyboard';
export * from './canvas-creative-ai-actions';
export * from './canvas-markdown-capabilities';
export * from './canvas-drop';
export * from './canvas-subsystem';
export * from './canvas-projection';
export * from './canvas-flow-traversal';
export * from './canvas-cut-draft';
export * from './canvas-narrative-contract';
export * from './canvas-narrative-validation';
export * from './canvas-narrative-agent';
export * from './canvas-timeline-sync';
export * from './narrative-asset';
export * from './narrative-production-binding';
export * from './narrative-preview';
export * from './narrative-runtime';
export * from './storyboard-planner';
export * from './storyboard-readiness';
export * from './storyboard-table';
export * from './creative-table-profile';
export * from './storyboard-plan-overlay';
export * from './shot-image-prep';
export * from './composite-artifact';
export * from './artifact-projection';
export * from './character-memory';
export * from './media-semantic-index';
export * from './semantic-source';
export * from './comic-animation-indexing';
export { QUALITY_ISSUE_CATEGORIES } from './quality';
export type {
  AudioTechnicalMetrics,
  CharacterAppearance,
  ConsistencyReport,
  DiagnosticsReport,
  EvalMediaType,
  GatePreviewData,
  IssueSeverity,
  MediaEvaluation,
  QualityIssue,
  QualityIssueCategory,
  RemediationAction,
  RemediationActionType,
  SceneDiagnostic,
  SceneReviewCard,
  SceneVerdict,
  StyleDriftPair,
  VideoTechnicalMetrics,
} from './quality';
export * from './reference-resolution';

// Sketch types (.nks document format)
export * from './sketch';

// Puppet types (.nkp project format)
export * from './puppet';
export * from './puppet-motion-preset';

// Puppet face parameter template (standard 32-param face model)
export * from './puppet-face-params';

// Keyframe editor types (shared mini-timeline for puppet/model editors)
export * from './keyframe-editor';

// 3D Model project types (.nkm project format)
export * from './model-project';
export * from './model-agent-api';

// 3D scene authoring and viewport contracts
export * from './scene';
export * from './model-ai-preview-scene-modes';

// Audio project types (.nka file format)
export * from './audioProject';

// Proxy protocol types (video proxy generation and management)
export * from './proxyProtocol';

// Engine-first preview contracts
export * from './preview';
export * from './panoramic-preview';

// Unified viewport protocol contracts
export * from './viewport-protocol';
export * from './live-compositor';

// Extension API types (inter-extension communication)
export * from './extension-api';

// Auth types (shared interfaces for neko-auth ecosystem)
export * from './auth';

// Generation types (output params + model config)
export * from './generation';

// Agent context types (unified sendToAgent payload)
export * from './agent-context';
export * from './model-preview';
export * from './three-reference';

// Document reading contracts (Preview ↔ Agent ↔ Platform)
export * from './document-reading';

// Project cache/search contracts (Project facts/cache ↔ Agent/Webview search)
export * from './project-cache-search';

// Resource cache contracts (stable refs, variants, manifests, quota)
export * from './resource-cache';

// Intent-aware content access and ingest contracts
export * from './content-access';

// Loading tier types (tiered lazy loading for tools, skills, commands)
export * from './loading-tier';

// Generated asset types (cross-plugin asset reference schema, ADR-4)
export * from './generated-asset';
export * from './generated-asset-lifecycle';

// Character registry types (git-tracked project identity source)
export * from './character-registry';

// Storage layout types (unified path management, three-level hierarchy)
export * from './storage';

// Tool name constants (single source of truth for all registered tool names)
export * from './tool-names';

// Agent capability provider protocol (sub-package → neko-agent capability injection)
export * from './agent-capability';

// Agent-first multimodal observation / rationale contracts
export * from './agent-observation';
export * from './multimodal-context';

// Live tracking contracts
export * from './tracking';
export * from './decision-rationale';
export * from './recovery-guidance';
export * from './subagent-reviewer';
export * from './operation-tool-adapter';

// Prompt fragment (PR3e: sub-package prompt contribution)
export * from './prompt-fragment';

// Provider card expression context contracts
export * from './provider-card';

// Creative entity graph types (cross-modal relationship graph, ADR Phase 3)
export * from './creative-entity-graph';

// Creative entity asset composition contracts
export * from './creative-entity-asset-composition';

export * from './durable-resource-ref';
export * from './creative-media-operations';
export * from './creative-media-capability-registry';
export * from './media-production';
export * from './media-quality';
export * from './recording-artifact';
