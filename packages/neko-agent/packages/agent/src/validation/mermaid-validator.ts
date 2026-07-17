/**
 * Mermaid Validation Module
 *
 * Extraction, syntax validation, and structural checking for Mermaid diagram blocks.
 */

import type {
  MermaidBlockInfo,
  MermaidValidationResult,
  ValidationError,
  ValidationWarning,
  ValidationResult,
} from './types';

// =============================================================================
// Extractor
// =============================================================================

/**
 * Mermaid block extractor interface
 */
export interface IMermaidExtractor {
  /** Extract mermaid code blocks as strings */
  extract(content: string): string[];
  /** Extract mermaid blocks with position info */
  extractWithPosition(content: string): MermaidBlockInfo[];
}

/**
 * Mermaid block extractor implementation
 */
export class MermaidExtractor implements IMermaidExtractor {
  extract(content: string): string[] {
    const blocks: string[] = [];
    const regex = /```mermaid\s*\n([\s\S]*?)```/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      if (match[1]) {
        blocks.push(match[1].trim());
      }
    }

    return blocks;
  }

  extractWithPosition(content: string): MermaidBlockInfo[] {
    const blocks: MermaidBlockInfo[] = [];
    const regex = /```mermaid\s*\n([\s\S]*?)```/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      const fullMatch = match[0];
      const innerContent = match[1]?.trim() || '';
      const startIndex = match.index;
      const endIndex = match.index + fullMatch.length;

      const beforeContent = content.substring(0, startIndex);
      const lineStart = (beforeContent.match(/\n/g) || []).length + 1;
      const blockLines = (fullMatch.match(/\n/g) || []).length;
      const lineEnd = lineStart + blockLines;

      blocks.push({ content: innerContent, startIndex, endIndex, lineStart, lineEnd });
    }

    return blocks;
  }
}

/**
 * Create a mermaid extractor instance
 */
export function createMermaidExtractor(): IMermaidExtractor {
  return new MermaidExtractor();
}

// =============================================================================
// Syntax Validator
// =============================================================================

/**
 * Mermaid diagram types and their starting keywords
 */
const MERMAID_DIAGRAM_TYPES = [
  'graph',
  'flowchart',
  'sequenceDiagram',
  'classDiagram',
  'stateDiagram',
  'erDiagram',
  'gantt',
  'pie',
  'journey',
  'gitGraph',
  'mindmap',
  'timeline',
  'quadrantChart',
  'requirement',
  'c4Context',
  'sankey',
  'xychart',
  'block',
] as const;

/**
 * Mermaid validator interface
 */
export interface IMermaidValidator {
  validate(code: string): Promise<MermaidValidationResult>;
  isLibraryAvailable(): Promise<boolean>;
}

/**
 * Mermaid syntax validator implementation
 */
export class MermaidValidator implements IMermaidValidator {
  async validate(code: string): Promise<MermaidValidationResult> {
    return this.validateBasic(code);
  }

  async isLibraryAvailable(): Promise<boolean> {
    return false;
  }

  private validateBasic(code: string): MermaidValidationResult {
    const trimmedCode = code.trim();
    const lines = trimmedCode.split('\n');
    const firstLine = lines[0]?.trim() || '';

    const startsWithValidType = MERMAID_DIAGRAM_TYPES.some(
      (type) =>
        firstLine.startsWith(type) || firstLine.toLowerCase().startsWith(type.toLowerCase()),
    );

    if (!startsWithValidType) {
      return {
        valid: false,
        error: `Invalid diagram type. Must start with one of: ${MERMAID_DIAGRAM_TYPES.slice(0, 5).join(', ')}...`,
        lineNumber: 1,
      };
    }

    const syntaxIssue = this.checkCommonIssues(trimmedCode);
    if (syntaxIssue) return syntaxIssue;

    return { valid: true };
  }

  private checkCommonIssues(code: string): MermaidValidationResult | null {
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || '';
      const lineNum = i + 1;

      const openBrackets = (line.match(/\[/g) || []).length;
      const closeBrackets = (line.match(/\]/g) || []).length;
      if (openBrackets !== closeBrackets) {
        return {
          valid: false,
          error: `Unmatched brackets on line ${lineNum}`,
          lineNumber: lineNum,
        };
      }

      const openParens = (line.match(/\(/g) || []).length;
      const closeParens = (line.match(/\)/g) || []).length;
      if (openParens !== closeParens) {
        return {
          valid: false,
          error: `Unmatched parentheses on line ${lineNum}`,
          lineNumber: lineNum,
        };
      }

      const doubleQuotes = (line.match(/"/g) || []).length;
      if (doubleQuotes % 2 !== 0) {
        return {
          valid: false,
          error: `Unmatched double quotes on line ${lineNum}`,
          lineNumber: lineNum,
        };
      }
    }

    return null;
  }
}

/**
 * Create a mermaid validator instance
 */
export function createMermaidValidator(): IMermaidValidator {
  return new MermaidValidator();
}

// =============================================================================
// Block Checker
// =============================================================================

/**
 * Unclosed block position info
 */
export interface UnclosedBlockPosition {
  line: number;
  preview: string;
}

/**
 * Mermaid block checker interface
 */
export interface IMermaidBlockChecker {
  checkUnclosed(content: string): ValidationResult;
  checkMalformed(content: string): ValidationResult;
  checkOrphaned(content: string): ValidationResult;
  checkAll(content: string): ValidationResult;
}

/**
 * Mermaid block checker implementation
 */
export class MermaidBlockChecker implements IMermaidBlockChecker {
  checkAll(content: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const unclosedResult = this.checkUnclosed(content);
    errors.push(...unclosedResult.errors);
    warnings.push(...unclosedResult.warnings);

    const malformedResult = this.checkMalformed(content);
    errors.push(...malformedResult.errors);

    const orphanedResult = this.checkOrphaned(content);
    warnings.push(...orphanedResult.warnings);

    return { errors, warnings };
  }

  checkUnclosed(content: string): ValidationResult {
    const errors: ValidationError[] = [];

    const openingPattern = /```mermaid\b/g;
    const closedPattern = /```mermaid\s*\n[\s\S]*?```/g;

    const openings = content.match(openingPattern) || [];
    const closed = content.match(closedPattern) || [];

    const unclosedCount = openings.length - closed.length;

    if (unclosedCount > 0) {
      const positions = this.findUnclosedPositions(content);

      for (const pos of positions) {
        errors.push({
          type: 'mermaid',
          code: 'MERMAID_UNCLOSED_BLOCK',
          message: `Mermaid code block starting at line ${pos.line} is not properly closed. Missing closing \`\`\``,
          details: { line: pos.line, preview: pos.preview },
        });
      }
    }

    return { errors, warnings: [] };
  }

  checkMalformed(content: string): ValidationResult {
    const errors: ValidationError[] = [];
    const lines = content.split('\n');
    let inMermaidBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || '';
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith('```mermaid')) {
        inMermaidBlock = true;
      } else if (inMermaidBlock) {
        const closingIndex = line.indexOf('```');
        if (closingIndex !== -1) {
          const beforeClosing = line.substring(0, closingIndex).trim();
          const afterClosing = line.substring(closingIndex + 3).trim();

          if (beforeClosing.length > 0) {
            errors.push({
              type: 'mermaid',
              code: 'MERMAID_MALFORMED_CLOSING',
              message: `Mermaid code block has malformed closing at line ${i + 1}. The closing \`\`\` must be on its own line.`,
              details: {
                line: i + 1,
                lastContent:
                  beforeClosing.substring(0, 50) + (beforeClosing.length > 50 ? '...' : ''),
                suggestion: 'Add a newline before the closing ``` marker',
              },
            });
          } else if (afterClosing.length > 0) {
            errors.push({
              type: 'mermaid',
              code: 'MERMAID_INLINE_CLOSING',
              message: `Mermaid code block closing \`\`\` is immediately followed by content at line ${i + 1}. Add a newline after \`\`\`.`,
              details: {
                line: i + 1,
                afterContent: afterClosing.substring(0, 50),
                suggestion: 'The closing ``` should be on its own line with nothing after it',
              },
            });
          }

          inMermaidBlock = false;
        } else {
          const partialBacktickMatch = line.match(/([^`]|^)``([^`]|$)/);
          if (partialBacktickMatch) {
            errors.push({
              type: 'mermaid',
              code: 'MERMAID_MALFORMED_CLOSING',
              message: `Mermaid code block at line ${i + 1} may have incorrect backticks (two instead of three).`,
              details: {
                line: i + 1,
                content: line.substring(0, 80),
                suggestion: 'Use three backticks to close the code block',
              },
            });
          }
        }
      }
    }

    return { errors, warnings: [] };
  }

  checkOrphaned(content: string): ValidationResult {
    const warnings: ValidationWarning[] = [];
    const lines = content.split('\n');
    let inCodeBlock = false;

    const mermaidKeywords = [
      'graph ',
      'graph\t',
      'flowchart ',
      'sequenceDiagram',
      'classDiagram',
      'stateDiagram',
      'erDiagram',
      'gantt',
      'pie ',
      'pie\t',
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || '';
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        continue;
      }

      if (inCodeBlock) continue;

      for (const keyword of mermaidKeywords) {
        if (
          trimmedLine.startsWith(keyword) ||
          trimmedLine.toLowerCase().startsWith(keyword.toLowerCase())
        ) {
          warnings.push({
            type: 'mermaid',
            code: 'MERMAID_OUTSIDE_CODEBLOCK',
            message: `Possible Mermaid diagram content found outside of code block at line ${i + 1}`,
            suggestion: 'Wrap Mermaid diagrams in ```mermaid and ``` markers',
          });
          break;
        }
      }
    }

    return { errors: [], warnings };
  }

  private findUnclosedPositions(content: string): UnclosedBlockPosition[] {
    const positions: UnclosedBlockPosition[] = [];
    const lines = content.split('\n');

    let inMermaidBlock = false;
    let blockStartLine = 0;
    let blockContent = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || '';

      if (!inMermaidBlock && line.trim().startsWith('```mermaid')) {
        inMermaidBlock = true;
        blockStartLine = i + 1;
        blockContent = '';
      } else if (inMermaidBlock) {
        if (line.trim() === '```') {
          inMermaidBlock = false;
          blockContent = '';
        } else {
          blockContent += line + '\n';
        }
      }
    }

    if (inMermaidBlock) {
      positions.push({
        line: blockStartLine,
        preview: blockContent.substring(0, 100) + (blockContent.length > 100 ? '...' : ''),
      });
    }

    return positions;
  }
}

/**
 * Create a mermaid block checker instance
 */
export function createMermaidBlockChecker(): IMermaidBlockChecker {
  return new MermaidBlockChecker();
}
