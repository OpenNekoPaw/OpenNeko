// =============================================================================
// Types Index - Re-export all types from submodules
// =============================================================================

export * from './message-attachment';

// Configuration
export * from './config';
export * from './agent-ai-source';
export * from './external-research';
export * from './fountain-script';

export * from './agent-runtime-scope';

export * from './npc-test-bench';
export * from './media-library-drag';

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
export * from './agent-autoheal';
export * from './agent-capability-activation';
export * from './agent-capability-diagnostics';
export * from './agent-capability-lifecycle';
export * from './agent-profile';
export * from './agent-output-validation';
export * from './reference-contributor';

// Agent execution trace contracts
export * from './agent-trace';
export * from './agent-token-budget';
// Skill types (Claude-compatible skills and slash commands)
export * from './skill';
export * from './portable-skill';

// ToolGroup types (dynamic tool injection)
export * from './tool-group';

// Tool category types (tool categorization and layer management)
export * from './tool-category';

// Perception tool contracts (Agent-first optional evidence providers)
export * from './perception-tool';
export * from './perception-card';
export * from './agent-image-transport';

// Tool injection types (three-layer injection mechanism)
export * from './tool-injection';

// Hook types (file-based hooks for agent automation)
export * from './hook';

// Media protocol types (Desktop host ↔ Webview media processing IPC)

// Media Library file metadata and package manifests
export * from './media-file';
export * from './asset/manifest';
export * from './asset/workspace-linked-media-library';

// Bundle locators and character asset contracts
export * from './bundle-locator';

// Project memory types (cross-session agent memory)
export * from './project-memory';

export * from './creative-ai-invocation';

// Canvas types (infinite canvas editor)
export * from './canvas';
export * from './canvas-creative-scope';
export * from './canvas-workspace-board';
export * from './canvas-playback';
export * from './canvas-layered';
export * from './canvas-serializable';
export * from './canvas-agent-operations';
export * from './canvas-authoring-contracts';
export * from './canvas-material-contracts';
export * from './canvas-headless-authoring';
export * from './canvas-semantic-storyboard';
export * from './canvas-markdown-capabilities';
export * from './canvas-drop';
export * from './canvas-projection';
export * from './canvas-cut-draft';
export * from './storyboard-cinematography';
export * from './storyboard-table';
export * from './creative-table-profile';
export * from './storyboard-plan-overlay';
export * from './shot-image-prep';
export * from './composite-artifact';
export * from './character-memory';
export * from './media-semantic-index';
export * from './semantic-source';
export * from './comic-animation-indexing';

// Proxy protocol types (video proxy generation and management)
export * from './proxyProtocol';

// Engine-first preview contracts
export * from './preview';

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
export * from './stable-value';

// Intent-aware content access and ingest contracts
export * from './content-access';

// Durable storage-neutral content locators
export * from './content-locator';
export * from './content-locator-drag';
export * from './content-io';

// Rebuildable Media Library file/resource projections
export * from './media-library-projection';

// Storage-neutral semantic representation contracts
export * from './content-representation';

// Direct Creative Entity representation bindings
export * from './entity-representation-binding';

// Explicit inspection and migration contracts for the retired Asset catalog

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

export * from './decision-rationale';
export * from './recovery-guidance';

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
export * from './media-production';
export * from './media-quality';
