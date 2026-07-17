/**
 * Input Processor Types
 *
 * Types for parsing and processing user input with file references.
 */

/**
 * File reference parsed from user input
 */
export interface FileReference {
  /** Original reference text (e.g., "@src/index.ts") */
  original: string;

  /** Resolved file path (relative to workspace) */
  path: string;

  /** File content (if successfully read) */
  content?: string;

  /** Error message (if failed to read) */
  error?: string;

  /** File type */
  type: 'file' | 'directory' | 'glob';

  /** Line range (if specified, e.g., "@file.ts:10-20") */
  lineRange?: {
    start: number;
    end: number;
  };
}

/**
 * Processed input result
 */
export interface ProcessedInput {
  /** Original user input */
  original: string;

  /** Processed message (with file references replaced or annotated) */
  message: string;

  /** Parsed file references */
  fileReferences: FileReference[];

  /** File contents formatted for injection */
  fileContents: string;

  /** Whether any files were successfully loaded */
  hasFiles: boolean;

  /** Errors encountered during processing */
  errors: Array<{
    reference: string;
    error: string;
  }>;
}

/**
 * Input processor options
 */
export interface InputProcessorOptions {
  /** Workspace root path */
  workspaceRoot: string;

  /** Maximum file size to read (bytes) */
  maxFileSize?: number;

  /** Maximum number of files to process */
  maxFiles?: number;

  /** File extensions to allow (empty = all) */
  allowedExtensions?: string[];

  /** Directories to exclude */
  excludePatterns?: string[];

  /** Whether to include line numbers in output */
  includeLineNumbers?: boolean;

  /** Whether to include language hints in code blocks */
  includeLanguageHints?: boolean;

  /** Custom file reader (for testing or VSCode integration) */
  fileReader?: IFileReader;
}

/**
 * File reader interface for abstraction
 */
export interface IFileReader {
  /** Read file content */
  readFile(path: string): Promise<string>;

  /** Check if path exists */
  exists(path: string): Promise<boolean>;

  /** Check if path is a file */
  isFile(path: string): Promise<boolean>;

  /** Check if path is a directory */
  isDirectory(path: string): Promise<boolean>;

  /** List files matching glob pattern */
  glob(pattern: string, options?: { cwd?: string }): Promise<string[]>;

  /** Get file stats */
  stat(path: string): Promise<{ size: number; isFile: boolean; isDirectory: boolean }>;
}

/**
 * Input processor interface
 */
export interface IInputProcessor {
  /**
   * Process user input and extract file references
   */
  process(input: string): Promise<ProcessedInput>;

  /**
   * Parse file references without reading content
   */
  parseReferences(input: string): FileReference[];

  /**
   * Format file content for injection into message
   */
  formatFileContent(ref: FileReference): string;
}
