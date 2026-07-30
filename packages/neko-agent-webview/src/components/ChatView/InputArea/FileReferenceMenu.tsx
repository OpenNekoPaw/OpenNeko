/**
 * File reference parsing helpers.
 * Supports formats: @file, @file:10, @file:10-20, @file:L10-L20
 */

/**
 * Parse file reference with optional line range
 * Supports: @file, @file:10, @file:10-20, @file:L10, @file:L10-L20, @file:L10-20
 */
export interface FileReference {
  file: string;
  startLine?: number;
  endLine?: number;
}

export function parseFileReference(input: string): FileReference | null {
  // Match @file:L10-L20 or @file:10-20 formats
  const match = input.match(/^([^:\s]+)(?::L?(\d+)(?:-L?(\d+))?)?$/);
  if (!match) return null;

  return {
    file: match[1] || '',
    startLine: match[2] ? parseInt(match[2], 10) : undefined,
    endLine: match[3] ? parseInt(match[3], 10) : undefined,
  };
}
