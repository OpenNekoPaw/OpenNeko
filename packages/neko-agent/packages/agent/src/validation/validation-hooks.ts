/**
 * Validation Hooks
 *
 * ExecutorHooks implementation for validating LLM input and output
 *
 * Features:
 * - Input validation: Image size, format, dimensions
 * - Output validation: Mermaid syntax, JSON Schema
 * - Configurable constraints and error handling
 */

import type {
  ExecutorHooks,
  AgentContext,
  AgentStep,
  ChatMessage,
  ContentPart,
} from '@neko/shared';
import { AgentError } from '../errors';
import { ImageValidator, ImageValidationError } from './image-validator';
import { OutputValidator } from './output-validator';
import type {
  ValidationHooksOptions,
  ValidationError,
  ValidationWarning,
  ImageConstraints,
  OutputConstraints,
  MermaidBlockValidationResult,
  JsonBlockValidationResult,
} from './types';

/**
 * ValidationHooks - Validates LLM input and output
 *
 * Implements beforeThink for input validation and afterThink for output validation
 *
 * @example
 * ```typescript
 * const hooks = createValidationHooks({
 *   imageConstraints: {
 *     maxSizeBytes: 5 * 1024 * 1024,
 *     allowedFormats: ['image/jpeg', 'image/png'],
 *   },
 *   outputConstraints: {
 *     mermaidPreValidate: true,
 *     onValidationFail: 'warn',
 *   },
 *   onValidationWarning: (warning) => console.warn(warning.message),
 * });
 * ```
 */
export class ValidationHooks implements ExecutorHooks {
  readonly name = 'validation';

  private readonly imageValidator: ImageValidator;
  private readonly outputValidator: OutputValidator;
  private readonly options: ValidationHooksOptions;

  constructor(options: ValidationHooksOptions = {}) {
    this.options = options;
    this.imageValidator = new ImageValidator(options.imageConstraints);
    this.outputValidator = new OutputValidator(
      options.outputConstraints,
      options.outputValidationAdapters,
    );
  }

  /**
   * beforeThink: Validate input messages before sending to LLM
   *
   * Validates:
   * - Image content parts (size, format)
   *
   * @throws AgentError if validation fails
   */
  async beforeThink(context: AgentContext): Promise<AgentContext> {
    try {
      const validatedMessages = await Promise.all(
        context.messages.map((msg) => this.validateMessage(msg)),
      );
      return { ...context, messages: validatedMessages };
    } catch (error) {
      if (error instanceof ImageValidationError) {
        // Convert to ValidationError and call callback
        this.options.onValidationError?.(error.toValidationError());

        // Re-throw as AgentError
        throw new AgentError({
          category: 'validation',
          code: error.code,
          message: error.message,
          retryable: false,
          context: error.details,
        });
      }
      throw error;
    }
  }

  /**
   * afterThink: Validate LLM output after receiving response
   *
   * Validates:
   * - Mermaid diagram syntax (if enabled)
   * - JSON Schema compliance (if configured)
   * - Output length (if configured)
   */
  async afterThink(step: AgentStep, context: AgentContext): Promise<void> {
    const artifactValidationRequirements = readArtifactValidationRequirements(context.metadata);
    const result = await this.outputValidator.validateWithBlockInfo(
      step.content,
      artifactValidationRequirements,
    );

    // Process warnings
    for (const warning of result.warnings) {
      this.options.onValidationWarning?.(warning);
    }

    // Check for errors in base result and block-level validations
    const hasMermaidErrors = result.mermaidBlocks?.some((b) => !b.valid) ?? false;
    const hasJsonErrors = result.jsonBlocks?.some((b) => !b.valid) ?? false;
    const hasErrors = result.errors.length > 0 || hasMermaidErrors || hasJsonErrors;

    // Process errors based on configured action
    if (hasErrors) {
      const action = this.outputValidator.getConstraints().onValidationFail;

      for (const error of result.errors) {
        this.options.onValidationError?.(error);
      }
      const retryInstruction =
        action === 'retry'
          ? this.outputValidator.buildArtifactRetryInstruction(
              [
                ...(this.outputValidator.getConstraints().artifactValidators ?? []),
                ...(artifactValidationRequirements ?? []),
              ],
              result.errors,
              readLocale(context.metadata),
            )
          : undefined;

      if (action === 'error') {
        const firstError = result.errors[0];
        if (firstError) {
          throw new AgentError({
            category: 'validation',
            code: firstError.code,
            message: firstError.message,
            retryable: false,
            context: firstError.details,
          });
        }
      } else if (action === 'retry') {
        let content = step.content || '';

        // Replace error mermaid blocks with fix prompts
        if (hasMermaidErrors && result.mermaidBlocks) {
          content = this.replaceMermaidErrorBlocks(content, result.mermaidBlocks);
        }

        // Replace error JSON blocks with fix prompts
        if (hasJsonErrors && result.jsonBlocks) {
          content = this.replaceJsonErrorBlocks(content, result.jsonBlocks);
        }

        if (retryInstruction) {
          queueOutputValidationRetry(context, result.errors, retryInstruction);
        }

        step.content = content;
      }
      // 'warn' and 'silent' modes don't throw or modify content
    }
  }

  /**
   * Replace error mermaid blocks with fix prompts, keeping surrounding text
   */
  private replaceMermaidErrorBlocks(
    content: string,
    blocks: MermaidBlockValidationResult[],
  ): string {
    // Sort by startIndex descending to replace from end to start (avoid index shift)
    const errorBlocks = blocks
      .filter((b) => !b.valid)
      .sort((a, b) => b.block.startIndex - a.block.startIndex);

    let result = content;

    for (const { block } of errorBlocks) {
      // Simple fix prompt - just ask LLM to regenerate the diagram
      const fixPrompt = ['```mermaid', block.content, '```'].join('\n');

      // Replace the error block with fix prompt
      result = result.slice(0, block.startIndex) + fixPrompt + result.slice(block.endIndex);
    }

    return result;
  }

  /**
   * Replace error JSON blocks with fix prompts, keeping surrounding text
   */
  private replaceJsonErrorBlocks(content: string, blocks: JsonBlockValidationResult[]): string {
    // Sort by startIndex descending to replace from end to start (avoid index shift)
    const errorBlocks = blocks
      .filter((b) => !b.valid)
      .sort((a, b) => b.block.startIndex - a.block.startIndex);

    let result = content;

    for (const { block, errors } of errorBlocks) {
      // Build error hint as JSON comment (not standard but LLM understands)
      const errorHint = errors?.map((e) => `${e.path}: ${e.message}`).join(', ') || '';

      // Simple fix prompt
      const fixPrompt = block.inCodeBlock
        ? ['```json', block.content, '```'].join('\n')
        : `/* FIX: ${errorHint} */ ${block.content}`;

      // Replace the error block with fix prompt
      result = result.slice(0, block.startIndex) + fixPrompt + result.slice(block.endIndex);
    }

    return result;
  }

  /**
   * Validate a single message
   */
  private async validateMessage(message: ChatMessage): Promise<ChatMessage> {
    // Only process messages with content parts (multimodal)
    if (typeof message.content === 'string') {
      return message;
    }

    const validatedContent = await Promise.all(
      message.content.map((part) => this.validateContentPart(part)),
    );

    return { ...message, content: validatedContent };
  }

  /**
   * Validate a content part
   */
  private async validateContentPart(part: ContentPart): Promise<ContentPart> {
    if (part.type === 'image') {
      return this.imageValidator.validate(part);
    }
    return part;
  }

  /**
   * Get image validator instance
   */
  getImageValidator(): ImageValidator {
    return this.imageValidator;
  }

  /**
   * Get output validator instance
   */
  getOutputValidator(): OutputValidator {
    return this.outputValidator;
  }

  /**
   * Get current image constraints
   */
  getImageConstraints(): ImageConstraints {
    return this.imageValidator.getConstraints();
  }

  /**
   * Get current output constraints
   */
  getOutputConstraints(): OutputConstraints {
    return this.outputValidator.getConstraints();
  }

  /**
   * Validate a single image URL (utility method)
   */
  async validateImage(imageUrl: string): Promise<{ valid: boolean; error?: ValidationError }> {
    try {
      await this.imageValidator.validate({ type: 'image', imageUrl });
      return { valid: true };
    } catch (error) {
      if (error instanceof ImageValidationError) {
        return { valid: false, error: error.toValidationError() };
      }
      throw error;
    }
  }

  /**
   * Validate output content (utility method)
   */
  async validateOutput(
    content: string,
    artifactValidators?: readonly string[],
  ): Promise<{ errors: ValidationError[]; warnings: ValidationWarning[] }> {
    return this.outputValidator.validate(content, artifactValidators);
  }
}

/**
 * Factory function to create ValidationHooks
 */
export function createValidationHooks(options?: ValidationHooksOptions): ValidationHooks {
  return new ValidationHooks(options);
}

function readArtifactValidationRequirements(
  metadata: Record<string, unknown>,
): readonly string[] | undefined {
  const value = metadata['artifactValidationRequirements'];
  if (!Array.isArray(value)) return undefined;
  const validators = value.filter((item): item is string => typeof item === 'string');
  return validators.length > 0 ? validators : undefined;
}

function queueOutputValidationRetry(
  context: AgentContext,
  errors: readonly ValidationError[],
  retryInstruction: string,
): void {
  const previousRetry = readOutputValidationRetry(context.metadata);
  const attempt = (previousRetry?.attempt ?? 0) + 1;
  const codes = errors.map((error) => error.code);
  context.messages.push({
    role: 'user',
    content: retryInstruction,
  });
  context.metadata = {
    ...context.metadata,
    outputValidationRetry: {
      reason: 'artifact-validation',
      attempt,
      codes,
    },
  };
}

function readLocale(metadata: Record<string, unknown>): string | undefined {
  const value = metadata['locale'];
  return typeof value === 'string' ? value : undefined;
}

function readOutputValidationRetry(
  metadata: Record<string, unknown>,
): { readonly attempt: number } | undefined {
  const value = metadata['outputValidationRetry'];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const attempt = (value as Record<string, unknown>)['attempt'];
  return typeof attempt === 'number' && Number.isFinite(attempt) ? { attempt } : undefined;
}
