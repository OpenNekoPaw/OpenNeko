/**
 * Tool Category Types - Tool categorization and layer management
 */

import type { ToolCategory } from './tool';

/**
 * Tool injection layer
 * - always: Core tools always injected (file ops, shell, meta-tools)
 * - dynamic: Tools from manually activated ToolSets
 */
export type ToolInjectionLayer = 'always' | 'dynamic';

/**
 * Tool category metadata
 */
export interface ToolCategoryInfo {
  /** Category identifier */
  id: ToolCategory;
  /** Display name for UI */
  displayName: string;
  /** Description of the category */
  description: string;
  /** Icon for UI (emoji) */
  icon: string;
  /** Default injection layer for tools in this category */
  defaultLayer: ToolInjectionLayer;
  /** Priority within layer (higher = more important) */
  priority: number;
}

/**
 * Tool with category and layer information
 */
export interface CategorizedTool {
  /** Tool name */
  name: string;
  /** Tool category */
  category: ToolCategory;
  /** Injection layer */
  layer: ToolInjectionLayer;
  /** Estimated token cost (description + parameters) */
  tokenCost: number;
  /** Whether tool is currently active */
  active: boolean;
}

/**
 * Tool category registry interface
 */
export interface IToolCategoryRegistry {
  /**
   * Register category metadata
   */
  registerCategory(info: ToolCategoryInfo): void;

  /**
   * Get category metadata by ID
   */
  getCategory(id: ToolCategory): ToolCategoryInfo | undefined;

  /**
   * List all registered categories
   */
  listCategories(): ToolCategoryInfo[];

  /**
   * Get all tools in a category
   */
  getToolsByCategory(category: ToolCategory): CategorizedTool[];

  /**
   * Get all tools in a layer
   */
  getToolsByLayer(layer: ToolInjectionLayer): CategorizedTool[];

  /**
   * Register a tool with category and optional layer override
   */
  categorizeTool(toolName: string, category: ToolCategory, layer?: ToolInjectionLayer): void;

  /**
   * Get tool's category and layer info
   */
  getToolInfo(toolName: string): CategorizedTool | undefined;

  /**
   * Calculate total token cost for a set of tools
   */
  calculateTokenCost(toolNames: string[]): number;

  /**
   * Set token cost for a tool
   */
  setToolTokenCost(toolName: string, tokenCost: number): void;

  /**
   * Set tool active state
   */
  setToolActive(toolName: string, active: boolean): void;
}

/**
 * Default category configurations
 */
export const DEFAULT_TOOL_CATEGORIES: ToolCategoryInfo[] = [
  {
    id: 'system',
    displayName: 'System',
    description: 'Core system operations (shell, process)',
    icon: '⚙️',
    defaultLayer: 'always',
    priority: 100,
  },
  {
    id: 'file',
    displayName: 'File',
    description: 'File system operations (read, write, search)',
    icon: '📁',
    defaultLayer: 'always',
    priority: 90,
  },
  {
    id: 'project',
    displayName: 'Project',
    description: 'Project management operations',
    icon: '📦',
    defaultLayer: 'dynamic',
    priority: 85,
  },
  {
    id: 'timeline',
    displayName: 'Timeline',
    description: 'Video timeline operations',
    icon: '🎬',
    defaultLayer: 'dynamic',
    priority: 80,
  },
  {
    id: 'media',
    displayName: 'Media',
    description: 'Media processing operations',
    icon: '🎥',
    defaultLayer: 'dynamic',
    priority: 70,
  },
  {
    id: 'document',
    displayName: 'Document',
    description: 'Document processing operations',
    icon: '📄',
    defaultLayer: 'dynamic',
    priority: 65,
  },
  {
    id: 'generation',
    displayName: 'Generation',
    description: 'AI content generation',
    icon: '🤖',
    defaultLayer: 'dynamic',
    priority: 60,
  },
  {
    id: 'analysis',
    displayName: 'Analysis',
    description: 'Content analysis operations',
    icon: '📊',
    defaultLayer: 'dynamic',
    priority: 50,
  },
  {
    id: 'mcp',
    displayName: 'MCP',
    description: 'MCP server tools',
    icon: '🔌',
    defaultLayer: 'dynamic',
    priority: 40,
  },
  {
    id: 'workflow',
    displayName: 'Workflow',
    description: 'Workflow engine tools',
    icon: '⚡',
    defaultLayer: 'dynamic',
    priority: 30,
  },
];

/**
 * Creative-session core tools that are always injected (always layer).
 * These correspond to all tools in resident-tier ToolSets + meta-tools.
 *
 * - core-system: Read, ReadDocument, ReadImage, ListDirectory, Glob, Grep
 * - file-editing: Write, Edit, CreateDirectory, DeleteFile
 * - meta-tools: CreateSkill, ActivateSkill, DeactivateSkill, GetContext
 */
export const CORE_TOOLS = [
  // core-system (resident)
  'Read',
  'ReadDocument',
  'ListDirectory',
  'Glob',
  'Grep',
  // file-editing (resident)
  'Write',
  'Edit',
  'CreateDirectory',
  'DeleteFile',
  // plan-mode (resident)
  // meta-tools (resident)
  'CreateSkill',
  'ActivateSkill',
  'DeactivateSkill',
  'GetContext',
] as const;

export type CoreToolName = (typeof CORE_TOOLS)[number];
