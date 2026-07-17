/**
 * Validation Types
 *
 * Type definitions for ValidationHooks and validators
 */

/**
 * Image constraints configuration
 */
export interface ImageConstraints {
  /** Maximum file size in bytes, default 5MB (Claude limit) */
  maxSizeBytes: number;
  /** Maximum dimension in pixels, default 8192px */
  maxDimension: number;
  /** Allowed MIME types */
  allowedFormats: string[];
}

/**
 * Output constraints configuration
 */
export interface OutputConstraints {
  /** Enable Mermaid syntax pre-validation */
  mermaidPreValidate: boolean;
  /**
   * Artifact/table validators to apply to final assistant output.
   * Runtime artifact/profile requirements may also be supplied through
   * AgentContext.metadata.artifactValidationRequirements.
   */
  artifactValidators?: readonly string[];
  /** JSON Schema for validation */
  jsonSchema?: object;
  /** Maximum output length in characters */
  maxLength?: number;
  /**
   * Action on validation failure
   * - 'warn': Log warning, continue
   * - 'error': Throw error, stop execution
   * - 'silent': Ignore, continue
   * - 'retry': Append error feedback to output, let LLM regenerate
   */
  onValidationFail: 'warn' | 'error' | 'silent' | 'retry';
}

/**
 * ValidationHooks configuration options
 */
export interface ValidationHooksOptions {
  /** Image constraints */
  imageConstraints?: Partial<ImageConstraints>;
  /** Output constraints */
  outputConstraints?: Partial<OutputConstraints>;
  /** Domain validators contributed by owning Skill/capability packages. */
  outputValidationAdapters?: readonly import('@neko/shared').AgentOutputValidationAdapter[];
  /** Callback on validation error */
  onValidationError?: (error: ValidationError) => void;
  /** Callback on validation warning */
  onValidationWarning?: (warning: ValidationWarning) => void;
}

/**
 * Validation error type
 */
export type ValidationErrorType = 'image' | 'output' | 'mermaid' | 'schema';

/**
 * Validation error
 */
export interface ValidationError {
  type: ValidationErrorType;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Validation warning
 */
export interface ValidationWarning {
  type: ValidationErrorType;
  code: string;
  message: string;
  suggestion?: string;
}

/**
 * Validation result containing errors and warnings
 */
export interface ValidationResult {
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/**
 * Image information parsed from data URL or URL
 */
export interface ImageInfo {
  /** MIME type (e.g., 'image/jpeg') */
  mimeType: string;
  /** Size in bytes (for data URLs) */
  sizeBytes: number;
  /** Whether this is a data URL */
  isDataUrl: boolean;
  /** Original URL */
  url: string;
}

/**
 * Mermaid validation result
 */
export interface MermaidValidationResult {
  valid: boolean;
  error?: string;
  lineNumber?: number;
}

/**
 * Mermaid block position info in original content
 */
export interface MermaidBlockInfo {
  /** Block content (without ```mermaid and ```) */
  content: string;
  /** Start index in original content (includes ```mermaid) */
  startIndex: number;
  /** End index in original content (includes ```) */
  endIndex: number;
  /** Start line number (1-indexed) */
  lineStart: number;
  /** End line number (1-indexed) */
  lineEnd: number;
}

/**
 * Single mermaid block validation result with position
 */
export interface MermaidBlockValidationResult {
  blockIndex: number;
  block: MermaidBlockInfo;
  valid: boolean;
  error?: string;
  lineNumber?: number;
}

/**
 * JSON block position info in original content
 */
export interface JsonBlockInfo {
  /** Block content (the JSON string) */
  content: string;
  /** Parsed JSON object (if valid syntax) */
  parsed?: unknown;
  /** Start index in original content (includes ```json if in code block) */
  startIndex: number;
  /** End index in original content */
  endIndex: number;
  /** Start line number (1-indexed) */
  lineStart: number;
  /** End line number (1-indexed) */
  lineEnd: number;
  /** Whether it's in a code block */
  inCodeBlock: boolean;
}

/**
 * Single JSON block validation result with position
 */
export interface JsonBlockValidationResult {
  blockIndex: number;
  block: JsonBlockInfo;
  valid: boolean;
  errors?: Array<{
    path: string;
    message: string;
  }>;
}

/**
 * Extended validation result with block info
 */
export interface ValidationResultWithBlocks extends ValidationResult {
  /** Detailed mermaid block validation results */
  mermaidBlocks?: MermaidBlockValidationResult[];
  /** Detailed JSON block validation results */
  jsonBlocks?: JsonBlockValidationResult[];
}

/**
 * Default image constraints
 */
export const DEFAULT_IMAGE_CONSTRAINTS: ImageConstraints = {
  maxSizeBytes: 5 * 1024 * 1024, // 5MB (Claude limit)
  maxDimension: 8192,
  allowedFormats: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
};

/**
 * Default output constraints
 */
export const DEFAULT_OUTPUT_CONSTRAINTS: OutputConstraints = {
  mermaidPreValidate: false,
  onValidationFail: 'warn',
};
