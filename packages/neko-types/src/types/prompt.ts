/**
 * Prompt Types - Prompt management and rendering
 */

/**
 * Prompt variable definition
 */
export interface PromptVariable {
  /** Variable name */
  name: string;
  /** Variable description */
  description: string;
  /** Variable type */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  /** Whether variable is required */
  required: boolean;
  /** Default value */
  default?: unknown;
  /** Validation schema (JSON Schema) */
  schema?: Record<string, unknown>;
}

/**
 * Prompt category
 */
export type PromptCategory = 'system' | 'user' | 'format' | 'custom';

/**
 * Prompt definition
 */
export interface Prompt {
  /** Unique prompt ID */
  id: string;
  /** Display name */
  name: string;
  /** Prompt description */
  description: string;
  /** Prompt category */
  category: PromptCategory;
  /** Prompt template with {{variable}} placeholders */
  template: string;
  /** Variable definitions */
  variables: PromptVariable[];
  /** Prompt version */
  version: string;
}

/**
 * Rendered prompt result
 */
export interface RenderedPrompt {
  /** Rendered content */
  content: string;
  /** Variables used */
  variables: Record<string, unknown>;
  /** Warnings during rendering */
  warnings: string[];
}

/**
 * Prompt manager interface
 */
export interface IPromptManager {
  /** List all prompts */
  list(): Prompt[];

  /** List prompts by category */
  listByCategory(category: PromptCategory): Prompt[];

  /** Get prompt by ID */
  get(id: string): Prompt | undefined;

  /** Render prompt with variables */
  render(id: string, variables: Record<string, unknown>): RenderedPrompt;

  /** Register custom prompt */
  register(prompt: Prompt): void;

  /** Unregister prompt */
  unregister(id: string): void;
}
