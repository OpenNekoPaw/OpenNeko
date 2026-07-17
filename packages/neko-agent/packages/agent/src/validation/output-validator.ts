/**
 * Output Validator
 *
 * Orchestrates validation of LLM output content including Mermaid diagrams and JSON schemas.
 * Uses specialized validators for each type of validation.
 */

import type {
  OutputConstraints,
  ValidationError,
  ValidationWarning,
  ValidationResult,
  MermaidBlockValidationResult,
  JsonBlockValidationResult,
  ValidationResultWithBlocks,
} from './types';
import type { AgentOutputValidationAdapter, AgentOutputValidationDiagnostic } from '@neko/shared';
import { DEFAULT_OUTPUT_CONSTRAINTS } from './types';

// Import specialized components
import { MermaidExtractor } from './mermaid-validator';
import { MermaidValidator } from './mermaid-validator';
import { MermaidBlockChecker } from './mermaid-validator';
import { JsonExtractor } from './json-validator';
import { JsonSchemaValidator } from './json-validator';
import { LengthValidator } from './length-validator';

/**
 * OutputValidator - Orchestrates LLM output validation
 *
 * Single responsibility: Coordinate validation components
 */
export class OutputValidator {
  readonly constraints: OutputConstraints;
  private readonly artifactValidatorRegistry: ReadonlyMap<string, AgentOutputValidationAdapter>;

  // Specialized components
  private readonly mermaidExtractor = new MermaidExtractor();
  private readonly jsonExtractor = new JsonExtractor();
  private readonly mermaidValidator = new MermaidValidator();
  private readonly jsonSchemaValidator = new JsonSchemaValidator();
  private readonly lengthValidator = new LengthValidator();
  private readonly mermaidBlockChecker = new MermaidBlockChecker();

  constructor(
    constraints: Partial<OutputConstraints> = {},
    artifactValidators: readonly AgentOutputValidationAdapter[] = [],
  ) {
    this.constraints = {
      ...DEFAULT_OUTPUT_CONSTRAINTS,
      ...constraints,
    };
    this.artifactValidatorRegistry = createArtifactValidatorRegistry(artifactValidators);
  }

  /**
   * Validate output content
   */
  async validate(
    content: string,
    runtimeArtifactValidators?: readonly string[],
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // 1. Check length
    if (this.constraints.maxLength !== undefined) {
      const lengthResult = this.lengthValidator.validate(content, {
        maxLength: this.constraints.maxLength,
      });
      warnings.push(...lengthResult.warnings);
    }

    // 2. Mermaid validation
    if (this.constraints.mermaidPreValidate) {
      const mermaidResult = await this.validateMermaid(content);
      errors.push(...mermaidResult.errors);
      warnings.push(...mermaidResult.warnings);
    }

    // 3. JSON Schema validation
    if (this.constraints.jsonSchema) {
      const schemaResult = await this.validateJsonSchema(content);
      errors.push(...schemaResult.errors);
      warnings.push(...schemaResult.warnings);
    }

    // 4. Artifact/table validation
    const artifactResult = this.validateArtifactValidators(
      content,
      mergeArtifactValidators(this.constraints.artifactValidators, runtimeArtifactValidators),
    );
    errors.push(...artifactResult.errors);
    warnings.push(...artifactResult.warnings);

    return { errors, warnings };
  }

  validateArtifactValidators(
    content: string,
    validators: readonly string[] | undefined,
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const normalizedValidators = new Set((validators ?? []).map(normalizeValidatorId));
    const visited = new Set<string>();
    for (const validatorId of normalizedValidators) {
      const validator = this.artifactValidatorRegistry.get(validatorId);
      if (!validator || visited.has(validator.id)) continue;
      visited.add(validator.id);

      if (validator.shouldValidate && !validator.shouldValidate(content)) {
        continue;
      }

      const result = validator.validate(content);
      errors.push(...result.errors.map(toOutputValidationError));
      warnings.push(...result.warnings.map(toOutputValidationWarning));
    }

    return { errors, warnings };
  }

  buildArtifactRetryInstruction(
    validators: readonly string[] | undefined,
    errors: readonly ValidationError[],
    locale?: string,
  ): string | undefined {
    const selected = new Set((validators ?? []).map(normalizeValidatorId));
    const visited = new Set<string>();
    const diagnostics: AgentOutputValidationDiagnostic[] = errors.map((error) => ({
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    }));
    const instructions: string[] = [];
    for (const validatorId of selected) {
      const validator = this.artifactValidatorRegistry.get(validatorId);
      if (!validator || visited.has(validator.id)) continue;
      visited.add(validator.id);
      const instruction = validator.buildRetryInstruction?.(diagnostics, locale);
      if (instruction) instructions.push(instruction);
    }
    return instructions.length > 0 ? instructions.join('\n\n') : undefined;
  }

  /**
   * Validate Mermaid diagrams in content
   */
  async validateMermaid(content: string): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check for structural issues (unclosed, malformed blocks)
    const blockCheckResult = this.mermaidBlockChecker.checkAll(content);
    errors.push(...blockCheckResult.errors);
    warnings.push(...blockCheckResult.warnings);

    // Extract and validate complete mermaid blocks
    const mermaidBlocks = this.mermaidExtractor.extract(content);

    if (mermaidBlocks.length === 0 && blockCheckResult.errors.length === 0) {
      return { errors, warnings };
    }

    for (let i = 0; i < mermaidBlocks.length; i++) {
      const block = mermaidBlocks[i];
      if (!block) continue;

      const result = await this.mermaidValidator.validate(block);

      if (!result.valid) {
        errors.push({
          type: 'mermaid',
          code: 'MERMAID_SYNTAX_ERROR',
          message: `Mermaid diagram #${i + 1} has syntax error: ${result.error}`,
          details: {
            blockIndex: i,
            lineNumber: result.lineNumber,
            code: block.substring(0, 200) + (block.length > 200 ? '...' : ''),
          },
        });
      }
    }

    return { errors, warnings };
  }

  /**
   * Validate content against JSON Schema
   */
  async validateJsonSchema(content: string): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!this.constraints.jsonSchema) {
      return { errors, warnings };
    }

    // Extract JSON from content
    const jsonContent = this.jsonExtractor.extractFirst(content);

    if (jsonContent === null) {
      warnings.push({
        type: 'schema',
        code: 'NO_JSON_FOUND',
        message: 'No valid JSON found in output for schema validation',
      });
      return { errors, warnings };
    }

    // Check if ajv is available
    const isAvailable = await this.jsonSchemaValidator.isLibraryAvailable();

    if (!isAvailable) {
      warnings.push({
        type: 'schema',
        code: 'AJV_UNAVAILABLE',
        message: 'JSON Schema validation skipped: ajv library not available',
      });
      return { errors, warnings };
    }

    // Validate against schema
    const result = await this.jsonSchemaValidator.validate(
      jsonContent,
      this.constraints.jsonSchema,
    );

    if (!result.valid && result.errors) {
      for (const err of result.errors) {
        errors.push({
          type: 'schema',
          code: 'SCHEMA_VALIDATION_ERROR',
          message: `Schema validation failed: ${err.message}`,
          details: { path: err.path },
        });
      }
    }

    return { errors, warnings };
  }

  /**
   * Validate with detailed block position info
   */
  async validateWithBlockInfo(
    content: string,
    runtimeArtifactValidators?: readonly string[],
  ): Promise<ValidationResultWithBlocks> {
    const baseResult = await this.validate(content, runtimeArtifactValidators);
    const result: ValidationResultWithBlocks = { ...baseResult };

    // Mermaid validation with block info
    if (this.constraints.mermaidPreValidate) {
      const blocks = this.mermaidExtractor.extractWithPosition(content);
      const mermaidBlocks: MermaidBlockValidationResult[] = [];

      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i]!;
        const validationResult = await this.mermaidValidator.validate(block.content);

        mermaidBlocks.push({
          blockIndex: i,
          block,
          valid: validationResult.valid,
          error: validationResult.error,
          lineNumber: validationResult.lineNumber,
        });
      }

      result.mermaidBlocks = mermaidBlocks;
    }

    // JSON Schema validation with block info
    if (this.constraints.jsonSchema) {
      const jsonBlocks = await this.validateJsonBlocksWithPosition(content);
      result.jsonBlocks = jsonBlocks;
    }

    return result;
  }

  /**
   * Validate JSON blocks against schema with position info
   */
  private async validateJsonBlocksWithPosition(
    content: string,
  ): Promise<JsonBlockValidationResult[]> {
    const blocks = this.jsonExtractor.extractWithPosition(content);
    const results: JsonBlockValidationResult[] = [];

    if (!this.constraints.jsonSchema || blocks.length === 0) {
      return results;
    }

    const isAvailable = await this.jsonSchemaValidator.isLibraryAvailable();
    if (!isAvailable) {
      return results;
    }

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]!;
      const validationResult = await this.jsonSchemaValidator.validate(
        block.parsed,
        this.constraints.jsonSchema,
      );

      results.push({
        blockIndex: i,
        block,
        valid: validationResult.valid,
        errors: validationResult.errors,
      });
    }

    return results;
  }

  /**
   * Extract mermaid blocks with position info
   * (Exposed for backward compatibility)
   */
  extractMermaidBlocksWithPosition(content: string) {
    return this.mermaidExtractor.extractWithPosition(content);
  }

  /**
   * Extract JSON blocks with position info
   * (Exposed for backward compatibility)
   */
  extractJsonBlocksWithPosition(content: string) {
    return this.jsonExtractor.extractWithPosition(content);
  }

  /**
   * Get current constraints
   */
  getConstraints(): OutputConstraints {
    return { ...this.constraints };
  }
}

/**
 * Factory function to create OutputValidator
 */
export function createOutputValidator(
  constraints?: Partial<OutputConstraints>,
  artifactValidators?: readonly AgentOutputValidationAdapter[],
): OutputValidator {
  return new OutputValidator(constraints, artifactValidators);
}

function normalizeValidatorId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_.:-]+/g, '');
}

function createArtifactValidatorRegistry(
  definitions: readonly AgentOutputValidationAdapter[],
): ReadonlyMap<string, AgentOutputValidationAdapter> {
  const registry = new Map<string, AgentOutputValidationAdapter>();
  for (const definition of definitions) {
    registry.set(normalizeValidatorId(definition.id), definition);
    for (const alias of definition.aliases ?? []) {
      registry.set(normalizeValidatorId(alias), definition);
    }
  }
  return registry;
}

function toOutputValidationError(diagnostic: AgentOutputValidationDiagnostic): ValidationError {
  return {
    type: 'output',
    code: diagnostic.code,
    message: diagnostic.message,
    ...(diagnostic.details ? { details: { ...diagnostic.details } } : {}),
  };
}

function toOutputValidationWarning(diagnostic: AgentOutputValidationDiagnostic): ValidationWarning {
  return {
    type: 'output',
    code: diagnostic.code,
    message: diagnostic.message,
  };
}

function mergeArtifactValidators(
  configured: readonly string[] | undefined,
  runtime: readonly string[] | undefined,
): readonly string[] | undefined {
  if ((!configured || configured.length === 0) && (!runtime || runtime.length === 0)) {
    return undefined;
  }
  return [...new Set([...(configured ?? []), ...(runtime ?? [])])];
}
