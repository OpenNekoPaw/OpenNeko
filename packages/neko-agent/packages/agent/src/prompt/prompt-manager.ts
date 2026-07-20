/**
 * Prompt Manager - Prompt template management
 *
 * Manages prompt templates for agent interactions:
 * - Template registration and retrieval
 * - Variable substitution
 */

import type { Prompt, PromptCategory, RenderedPrompt, IPromptManager } from '@neko/shared';

/**
 * Prompt manager implementation
 */
export class PromptManager implements IPromptManager {
  private prompts: Map<string, Prompt> = new Map();

  constructor() {
    this.registerBuiltinPrompts();
  }

  /**
   * List all prompts
   */
  list(): Prompt[] {
    return Array.from(this.prompts.values());
  }

  /**
   * List prompts by category
   */
  listByCategory(category: PromptCategory): Prompt[] {
    return this.list().filter((p) => p.category === category);
  }

  /**
   * Get prompt by ID
   */
  get(id: string): Prompt | undefined {
    return this.prompts.get(id);
  }

  /**
   * Render prompt with variables
   */
  render(id: string, variables: Record<string, unknown>): RenderedPrompt {
    const prompt = this.prompts.get(id);
    if (!prompt) {
      throw new Error(`Prompt '${id}' not found`);
    }

    const warnings: string[] = [];
    let content = prompt.template;

    // Check for missing required variables
    for (const varDef of prompt.variables) {
      const value = variables[varDef.name];

      if (value === undefined || value === null) {
        if (varDef.required && varDef.default === undefined) {
          warnings.push(`Missing required variable: ${varDef.name}`);
        }
      }
    }

    // Substitute variables
    content = content.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      const varDef = prompt.variables.find((v) => v.name === varName);
      let value = variables[varName];

      if (value === undefined || value === null) {
        if (varDef?.default !== undefined) {
          value = varDef.default;
        } else {
          return match; // Keep placeholder if no value
        }
      }

      return this.formatValue(value, varDef?.type || 'string');
    });

    return {
      content,
      variables,
      warnings,
    };
  }

  /**
   * Register a prompt
   */
  register(prompt: Prompt): void {
    this.prompts.set(prompt.id, prompt);
  }

  /**
   * Unregister a prompt
   */
  unregister(id: string): void {
    this.prompts.delete(id);
  }

  /**
   * Check if a prompt exists
   */
  has(id: string): boolean {
    return this.prompts.has(id);
  }

  /**
   * Get prompt count
   */
  get size(): number {
    return this.prompts.size;
  }

  /**
   * Clear all prompts
   */
  clear(): void {
    this.prompts.clear();
  }

  private formatValue(value: unknown, type: string): string {
    switch (type) {
      case 'string':
        return String(value);
      case 'number':
        return String(value);
      case 'boolean':
        return value ? 'true' : 'false';
      case 'object':
      case 'array':
        return JSON.stringify(value, null, 2);
      default:
        return String(value);
    }
  }

  private registerBuiltinPrompts(): void {
    // System prompt for video editor
    this.register({
      id: 'system-video-editor',
      name: 'Video Editor System',
      description: 'System prompt for video editing assistant',
      category: 'system',
      template: `You are an AI assistant specialized in video editing. You help users create and edit videos using a timeline-based editor.

Available tools allow you to:
- Add, remove, and modify tracks and elements
- Apply effects and transitions
- Generate media content
- Analyze and process video/audio

Current project context:
{{projectContext}}

Always provide clear explanations of what you're doing and ask for clarification when needed.`,
      variables: [
        {
          name: 'projectContext',
          description: 'Current project state',
          type: 'string',
          required: false,
          default: 'No project loaded',
        },
      ],
      version: '1.0.0',
    });

    // JSON output format
    this.register({
      id: 'format-json-output',
      name: 'JSON Output Format',
      description: 'Prompt for structured JSON output',
      category: 'format',
      template: `Please respond with a valid JSON object following this schema:
{{schema}}

Do not include any text before or after the JSON. Only output the JSON object.`,
      variables: [
        {
          name: 'schema',
          description: 'JSON schema for output',
          type: 'object',
          required: true,
        },
      ],
      version: '1.0.0',
    });

    // Task planning
    this.register({
      id: 'task-planning',
      name: 'Task Planning',
      description: 'Prompt for planning multi-step tasks',
      category: 'user',
      template: `Analyze the following request and break it down into steps:
{{request}}

For each step, identify:
1. What action needs to be taken
2. What tools or operations are required
3. Dependencies on other steps
4. Expected outcome

Respond with a structured plan.`,
      variables: [
        {
          name: 'request',
          description: 'User request to plan',
          type: 'string',
          required: true,
        },
      ],
      version: '1.0.0',
    });

    // Video analysis prompt
    this.register({
      id: 'analyze-video',
      name: 'Video Analysis',
      description: 'Analyze video content and structure',
      category: 'user',
      template: `Analyze the following video information and provide insights:

Video Details:
{{videoInfo}}

Please provide:
1. Content summary
2. Key scenes or segments
3. Audio characteristics
4. Suggested improvements or edits`,
      variables: [
        {
          name: 'videoInfo',
          description: 'Video metadata and details',
          type: 'object',
          required: true,
        },
      ],
      version: '1.0.0',
    });

    // Subtitle generation prompt
    this.register({
      id: 'generate-subtitles',
      name: 'Subtitle Generation',
      description: 'Generate subtitles from transcript',
      category: 'user',
      template: `Generate properly formatted subtitles from the following transcript:

Transcript:
{{transcript}}

Target language: {{language}}
Max characters per line: {{maxChars}}
Max duration per subtitle: {{maxDuration}} seconds

Format the output as a list of subtitle entries with start time, end time, and text.`,
      variables: [
        {
          name: 'transcript',
          description: 'Audio transcript',
          type: 'string',
          required: true,
        },
        {
          name: 'language',
          description: 'Target language',
          type: 'string',
          required: false,
          default: 'en',
        },
        {
          name: 'maxChars',
          description: 'Maximum characters per line',
          type: 'number',
          required: false,
          default: 42,
        },
        {
          name: 'maxDuration',
          description: 'Maximum duration per subtitle in seconds',
          type: 'number',
          required: false,
          default: 7,
        },
      ],
      version: '1.0.0',
    });

    // Effect suggestion prompt
    this.register({
      id: 'suggest-effects',
      name: 'Effect Suggestions',
      description: 'Suggest video effects based on content',
      category: 'user',
      template: `Based on the following video content and mood, suggest appropriate effects:

Content Description:
{{contentDescription}}

Desired Mood: {{mood}}
Video Style: {{style}}

Suggest:
1. Color grading/filters
2. Transitions between scenes
3. Motion effects
4. Audio enhancements`,
      variables: [
        {
          name: 'contentDescription',
          description: 'Description of video content',
          type: 'string',
          required: true,
        },
        {
          name: 'mood',
          description: 'Desired mood (e.g., energetic, calm, dramatic)',
          type: 'string',
          required: false,
          default: 'neutral',
        },
        {
          name: 'style',
          description: 'Video style (e.g., vlog, documentary, cinematic)',
          type: 'string',
          required: false,
          default: 'general',
        },
      ],
      version: '1.0.0',
    });

    // Error correction prompt
    this.register({
      id: 'correct-timeline-error',
      name: 'Timeline Error Correction',
      description: 'Help correct timeline issues',
      category: 'user',
      template: `The user encountered a timeline error:

Error: {{errorMessage}}

Current timeline state:
{{timelineState}}

User action: {{userAction}}

Please analyze the issue and suggest how to:
1. Fix the current error
2. Prevent similar issues
3. Alternative approaches if the action cannot be completed`,
      variables: [
        {
          name: 'errorMessage',
          description: 'Error message from the system',
          type: 'string',
          required: true,
        },
        {
          name: 'timelineState',
          description: 'Current state of the timeline',
          type: 'object',
          required: true,
        },
        {
          name: 'userAction',
          description: 'What the user was trying to do',
          type: 'string',
          required: true,
        },
      ],
      version: '1.0.0',
    });
  }
}

/**
 * Create a prompt manager instance
 */
export function createPromptManager(): PromptManager {
  return new PromptManager();
}
