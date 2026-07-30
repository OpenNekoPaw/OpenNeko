/**
 * Input Processor
 *
 * Parses user input and extracts file references (@ mentions).
 * Supports:
 * - @file.ts - Single file reference
 * - @src/ - Directory reference (lists files)
 * - @src/*.ts - Glob pattern
 * - @file.ts:10-20 - Line range
 */

import * as path from 'node:path';
import type {
  FileReference,
  ProcessedInput,
  InputProcessorOptions,
  IFileReader,
  IInputProcessor,
} from './types';
import { createNodeFileReader } from './node-file-reader';
import { DEFAULT_MENTION_EXCLUDED_DIRECTORIES, isMentionExcludedPath } from './mention-excludes';

// =============================================================================
// Constants
// =============================================================================

/** Default max file size (1MB) */
const DEFAULT_MAX_FILE_SIZE = 1024 * 1024;

/** Default max files to process */
const DEFAULT_MAX_FILES = 20;

/** Language hints by extension */
const LANGUAGE_HINTS: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.scala': 'scala',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'zsh',
  '.fish': 'fish',
  '.ps1': 'powershell',
  '.sql': 'sql',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.xml': 'xml',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.md': 'markdown',
  '.mdx': 'mdx',
  '.vue': 'vue',
  '.svelte': 'svelte',
};

// =============================================================================
// Input Processor Implementation
// =============================================================================

/**
 * Input Processor - Parses and processes user input with file references
 */
export class InputProcessor implements IInputProcessor {
  private _options: Required<InputProcessorOptions>;
  private _fileReader: IFileReader;

  constructor(options: InputProcessorOptions) {
    this._options = {
      workspaceRoot: options.workspaceRoot,
      maxFileSize: options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE,
      maxFiles: options.maxFiles ?? DEFAULT_MAX_FILES,
      allowedExtensions: options.allowedExtensions ?? [],
      excludePatterns: options.excludePatterns ?? [...DEFAULT_MENTION_EXCLUDED_DIRECTORIES],
      includeLineNumbers: options.includeLineNumbers ?? true,
      includeLanguageHints: options.includeLanguageHints ?? true,
      fileReader: options.fileReader ?? createNodeFileReader(options.workspaceRoot),
    };
    this._fileReader = this._options.fileReader;
  }

  /**
   * Process user input and extract file references
   */
  async process(input: string): Promise<ProcessedInput> {
    const references = this.parseReferences(input);
    const errors: ProcessedInput['errors'] = [];
    let filesProcessed = 0;

    // Process each reference
    for (const ref of references) {
      if (filesProcessed >= this._options.maxFiles) {
        errors.push({
          reference: ref.original,
          error: `Max files limit (${this._options.maxFiles}) reached`,
        });
        continue;
      }

      try {
        if (ref.type === 'glob') {
          // Handle glob pattern
          const files = await this._fileReader.glob(ref.path, {
            cwd: this._options.workspaceRoot,
          });

          for (const file of files) {
            if (filesProcessed >= this._options.maxFiles) break;
            if (this._shouldExclude(file)) continue;

            try {
              const content = await this._readFileContent(file);
              ref.content = (ref.content ?? '') + this._formatSingleFile(file, content);
              filesProcessed++;
            } catch (err) {
              errors.push({
                reference: file,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        } else if (ref.type === 'directory') {
          // Handle directory
          const files = await this._fileReader.glob('*', {
            cwd: path.join(this._options.workspaceRoot, ref.path),
          });

          for (const file of files) {
            if (filesProcessed >= this._options.maxFiles) break;
            const fullPath = path.join(ref.path, file);
            if (this._shouldExclude(fullPath)) continue;

            const isFile = await this._fileReader.isFile(fullPath);
            if (!isFile) continue;

            try {
              const content = await this._readFileContent(fullPath);
              ref.content = (ref.content ?? '') + this._formatSingleFile(fullPath, content);
              filesProcessed++;
            } catch (err) {
              errors.push({
                reference: fullPath,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        } else {
          // Handle single file
          if (this._shouldExclude(ref.path)) {
            errors.push({
              reference: ref.original,
              error: 'File is in excluded directory',
            });
            continue;
          }

          const content = await this._readFileContent(ref.path, ref.lineRange);
          ref.content = content;
          filesProcessed++;
        }
      } catch (err) {
        ref.error = err instanceof Error ? err.message : String(err);
        errors.push({
          reference: ref.original,
          error: ref.error,
        });
      }
    }

    // Build file contents string
    const fileContents = references
      .filter((r) => r.content)
      .map((r) => this.formatFileContent(r))
      .join('\n\n');

    return {
      original: input,
      message: input,
      fileReferences: references,
      fileContents,
      hasFiles: references.some((r) => r.content),
      errors,
    };
  }

  /**
   * Parse file references without reading content
   */
  parseReferences(input: string): FileReference[] {
    const references: FileReference[] = [];

    for (const token of scanReferenceTokens(input)) {
      const ref = this._parseReference(token.value);
      if (ref) {
        ref.original = token.original;
        references.push(ref);
      }
    }

    return references;
  }

  /**
   * Format file content for injection into message
   */
  formatFileContent(ref: FileReference): string {
    if (!ref.content) {
      return `<!-- File: ${ref.path} (not loaded) -->`;
    }

    const ext = path.extname(ref.path);
    const lang = this._options.includeLanguageHints ? (LANGUAGE_HINTS[ext] ?? '') : '';

    let header = `### File: ${ref.path}`;
    if (ref.lineRange) {
      header += ` (lines ${ref.lineRange.start}-${ref.lineRange.end})`;
    }

    return `${header}\n\`\`\`${lang}\n${ref.content}\n\`\`\``;
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  private _parseReference(ref: string): FileReference | null {
    if (isDurableNonWorkspaceReference(ref)) {
      return null;
    }

    // Check for line range (e.g., file.ts:10-20)
    const lineRangeMatch = ref.match(/^(.+):(\d+)-(\d+)$/);
    if (lineRangeMatch) {
      return {
        original: `@${ref}`,
        path: lineRangeMatch[1],
        type: 'file',
        lineRange: {
          start: parseInt(lineRangeMatch[2], 10),
          end: parseInt(lineRangeMatch[3], 10),
        },
      };
    }

    // Check for single line (e.g., file.ts:10)
    const singleLineMatch = ref.match(/^(.+):(\d+)$/);
    if (singleLineMatch) {
      const line = parseInt(singleLineMatch[2], 10);
      return {
        original: `@${ref}`,
        path: singleLineMatch[1],
        type: 'file',
        lineRange: {
          start: Math.max(1, line - 5),
          end: line + 5,
        },
      };
    }

    // Check for glob pattern
    if (ref.includes('*')) {
      return {
        original: `@${ref}`,
        path: ref,
        type: 'glob',
      };
    }

    // Check for directory (ends with /)
    if (ref.endsWith('/')) {
      return {
        original: `@${ref}`,
        path: ref.slice(0, -1),
        type: 'directory',
      };
    }

    // Regular file
    return {
      original: `@${ref}`,
      path: ref,
      type: 'file',
    };
  }

  private async _readFileContent(
    filePath: string,
    lineRange?: { start: number; end: number },
  ): Promise<string> {
    // Check file size
    const stat = await this._fileReader.stat(filePath);
    if (stat.size > this._options.maxFileSize) {
      throw new Error(
        `File too large (${(stat.size / 1024).toFixed(1)}KB > ${(this._options.maxFileSize / 1024).toFixed(1)}KB)`,
      );
    }

    // Check extension
    if (this._options.allowedExtensions.length > 0) {
      const ext = path.extname(filePath);
      if (!this._options.allowedExtensions.includes(ext)) {
        throw new Error(`Extension ${ext} not allowed`);
      }
    }

    // Read content
    let content = await this._fileReader.readFile(filePath);

    // Apply line range if specified
    if (lineRange) {
      const lines = content.split('\n');
      const start = Math.max(0, lineRange.start - 1);
      const end = Math.min(lines.length, lineRange.end);
      content = lines.slice(start, end).join('\n');
    }

    // Add line numbers if enabled
    if (this._options.includeLineNumbers) {
      const startLine = lineRange?.start ?? 1;
      content = this._addLineNumbers(content, startLine);
    }

    return content;
  }

  private _addLineNumbers(content: string, startLine: number): string {
    const lines = content.split('\n');
    const maxLineNum = startLine + lines.length - 1;
    const padding = String(maxLineNum).length;

    return lines
      .map((line, i) => {
        const lineNum = String(startLine + i).padStart(padding, ' ');
        return `${lineNum} | ${line}`;
      })
      .join('\n');
  }

  private _formatSingleFile(filePath: string, content: string): string {
    const ext = path.extname(filePath);
    const lang = this._options.includeLanguageHints ? (LANGUAGE_HINTS[ext] ?? '') : '';

    return `\n### File: ${filePath}\n\`\`\`${lang}\n${content}\n\`\`\`\n`;
  }

  private _shouldExclude(filePath: string): boolean {
    return isMentionExcludedPath(filePath, this._options.excludePatterns);
  }
}

interface ReferenceToken {
  original: string;
  value: string;
}

const DURABLE_REFERENCE_SCHEMES = new Set([
  'asset',
  'media',
  'entity',
  'canvas',
  'canvas-node',
  'character',
  'scene',
  'story-scene',
  'artifact',
  'resource',
  'ref',
]);

function isDurableNonWorkspaceReference(ref: string): boolean {
  if (/^\$\{[A-Za-z_][A-Za-z0-9_]*\}(?:\/|$)/.test(ref)) {
    return true;
  }
  const schemeMatch = ref.match(/^([A-Za-z][A-Za-z0-9+.-]*):/);
  return schemeMatch ? DURABLE_REFERENCE_SCHEMES.has(schemeMatch[1].toLowerCase()) : false;
}

function scanReferenceTokens(input: string): ReferenceToken[] {
  const references: ReferenceToken[] = [];
  let index = 0;

  while (index < input.length) {
    const atIndex = input.indexOf('@', index);
    if (atIndex === -1) break;

    const previous = atIndex > 0 ? input[atIndex - 1] : undefined;
    if (previous && !/\s/.test(previous)) {
      index = atIndex + 1;
      continue;
    }

    if (input[atIndex + 1] === '"') {
      const quoted = readQuotedReference(input, atIndex);
      if (quoted) {
        references.push(quoted);
        index = atIndex + quoted.original.length;
        continue;
      }
    }

    const unquoted = readUnquotedReference(input, atIndex);
    if (unquoted) {
      references.push(unquoted);
      index = atIndex + unquoted.original.length;
      continue;
    }

    index = atIndex + 1;
  }

  return references;
}

function readUnquotedReference(input: string, atIndex: number): ReferenceToken | null {
  let end = atIndex + 1;
  while (end < input.length && !/\s|@/.test(input[end] ?? '')) {
    end += 1;
  }

  if (end === atIndex + 1) return null;
  const original = input.slice(atIndex, end);
  return { original, value: original.slice(1) };
}

function readQuotedReference(input: string, atIndex: number): ReferenceToken | null {
  let end = atIndex + 2;
  let value = '';

  while (end < input.length) {
    const char = input[end];
    if (char === '\\') {
      const next = input[end + 1];
      if (next) {
        value += next;
        end += 2;
        continue;
      }
    }
    if (char === '"') {
      const original = input.slice(atIndex, end + 1);
      return value ? { original, value } : null;
    }
    value += char;
    end += 1;
  }

  return null;
}

/**
 * Create an input processor
 */
export function createInputProcessor(options: InputProcessorOptions): InputProcessor {
  return new InputProcessor(options);
}
