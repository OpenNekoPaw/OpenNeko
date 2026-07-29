/**
 * Tool Pattern Matcher Tests
 *
 * Tests the unified pattern matching utilities used by both
 * PermissionRuleMatcher and ToolGuard.
 */

import { describe, it, expect } from 'vitest';
import { normalizeToolCall, matchesPattern, isInPatternList } from '../tool-pattern-matcher';

// =============================================================================
// normalizeToolCall
// =============================================================================

describe('normalizeToolCall', () => {
  it('should normalize Bash tool with command', () => {
    expect(normalizeToolCall({ name: 'Bash', arguments: { command: 'git status' } })).toBe(
      'Bash(git status)',
    );
  });

  it('should normalize Read tool with file_path', () => {
    expect(normalizeToolCall({ name: 'Read', arguments: { file_path: 'src/index.ts' } })).toBe(
      'Read(src/index.ts)',
    );
  });

  it('should normalize content access tools with canonical source refs', () => {
    expect(
      normalizeToolCall({
        name: 'ReadDocument',
        arguments: { source: { kind: 'file', path: '${A}/books/book.epub' } },
      }),
    ).toBe('ReadDocument(${A}/books/book.epub)');
  });

  it('should normalize Edit tool with file_path', () => {
    expect(normalizeToolCall({ name: 'Edit', arguments: { file_path: 'src/app.ts' } })).toBe(
      'Edit(src/app.ts)',
    );
  });

  it('should normalize Glob tool with pattern', () => {
    expect(normalizeToolCall({ name: 'Glob', arguments: { pattern: 'src/**/*.ts' } })).toBe(
      'Glob(src/**/*.ts)',
    );
  });

  it('should normalize WebFetch tool with URL domain', () => {
    expect(
      normalizeToolCall({ name: 'WebFetch', arguments: { url: 'https://github.com/repo' } }),
    ).toBe('WebFetch(domain:github.com)');
  });

  it('should handle WebFetch with invalid URL', () => {
    expect(normalizeToolCall({ name: 'WebFetch', arguments: { url: 'not-a-url' } })).toBe(
      'WebFetch(not-a-url)',
    );
  });

  it('should pass through MCP tool names', () => {
    expect(normalizeToolCall({ name: 'mcp__github__search_code', arguments: {} })).toBe(
      'mcp__github__search_code',
    );
  });

  it('should return plain name for tools without special handling', () => {
    expect(normalizeToolCall({ name: 'CustomTool', arguments: {} })).toBe('CustomTool');
  });

  it('should return plain name when arguments are missing', () => {
    expect(normalizeToolCall({ name: 'Read' })).toBe('Read');
  });
});

// =============================================================================
// matchesPattern
// =============================================================================

describe('matchesPattern', () => {
  describe('exact match', () => {
    it('should match exact tool name', () => {
      expect(matchesPattern('Read', 'Read')).toBe(true);
    });

    it('should not match different tool names', () => {
      expect(matchesPattern('Read', 'Write')).toBe(false);
    });

    it('should match exact tool with args', () => {
      expect(matchesPattern('Bash(git status)', 'Bash(git status)')).toBe(true);
    });
  });

  describe('tool name only match', () => {
    it('should match all Bash calls with "Bash" pattern', () => {
      expect(matchesPattern('Bash(git status)', 'Bash')).toBe(true);
      expect(matchesPattern('Bash(npm test)', 'Bash')).toBe(true);
    });

    it('should match all Read calls with "Read" pattern', () => {
      expect(matchesPattern('Read(src/index.ts)', 'Read')).toBe(true);
    });
  });

  describe('command prefix match', () => {
    it('should match Bash command prefix with :*', () => {
      expect(matchesPattern('Bash(npm test)', 'Bash(npm:*)')).toBe(true);
      expect(matchesPattern('Bash(npm run build)', 'Bash(npm:*)')).toBe(true);
      expect(matchesPattern('Bash(npm)', 'Bash(npm:*)')).toBe(true);
    });

    it('should not match different command prefix', () => {
      expect(matchesPattern('Bash(git status)', 'Bash(npm:*)')).toBe(false);
    });

    it('should match git prefix', () => {
      expect(matchesPattern('Bash(git status)', 'Bash(git:*)')).toBe(true);
      expect(matchesPattern('Bash(git commit -m "msg")', 'Bash(git:*)')).toBe(true);
    });
  });

  describe('path glob matching', () => {
    it('should match ** glob (any depth)', () => {
      expect(matchesPattern('Read(src/index.ts)', 'Read(src/**)')).toBe(true);
      expect(matchesPattern('Read(src/deep/nested/file.ts)', 'Read(src/**)')).toBe(true);
    });

    it('should match * glob (single level)', () => {
      expect(matchesPattern('Read(src/index.ts)', 'Read(src/*)')).toBe(true);
    });

    it('should match * as prefix (trailing wildcard)', () => {
      // Single trailing * is a prefix match, not a directory-level match
      expect(matchesPattern('Read(src/deep/file.ts)', 'Read(src/*)')).toBe(true);
    });

    it('should match complex glob patterns', () => {
      expect(matchesPattern('Read(src/components/Button.tsx)', 'Read(src/**/*.tsx)')).toBe(true);
      expect(matchesPattern('Read(src/utils/helper.ts)', 'Read(src/**/*.tsx)')).toBe(false);
    });
  });

  describe('domain matching', () => {
    it('should match exact domain', () => {
      expect(matchesPattern('WebFetch(domain:github.com)', 'WebFetch(domain:github.com)')).toBe(
        true,
      );
    });

    it('should not match different domain', () => {
      expect(matchesPattern('WebFetch(domain:github.com)', 'WebFetch(domain:gitlab.com)')).toBe(
        false,
      );
    });

    it('should match wildcard domain', () => {
      expect(
        matchesPattern('WebFetch(domain:api.github.com)', 'WebFetch(domain:*.github.com)'),
      ).toBe(true);
    });

    it('should match base domain against wildcard', () => {
      expect(matchesPattern('WebFetch(domain:github.com)', 'WebFetch(domain:*.github.com)')).toBe(
        true,
      );
    });
  });

  describe('edge cases', () => {
    it('should not match when pattern has args but tool does not', () => {
      expect(matchesPattern('Bash', 'Bash(git:*)')).toBe(false);
    });

    it('should not match different tool names with same args', () => {
      expect(matchesPattern('Write(src/file.ts)', 'Read(src/file.ts)')).toBe(false);
    });
  });
});

// =============================================================================
// isInPatternList
// =============================================================================

describe('isInPatternList', () => {
  it('should return undefined for empty patterns', () => {
    expect(isInPatternList('Read', [])).toBeUndefined();
    expect(isInPatternList('Read', undefined)).toBeUndefined();
  });

  it('should return matching pattern', () => {
    expect(isInPatternList('Bash(git status)', ['Read', 'Bash(git:*)'])).toBe('Bash(git:*)');
  });

  it('should return first matching pattern', () => {
    expect(isInPatternList('Read(src/file.ts)', ['Read', 'Read(src/*)'])).toBe('Read');
  });

  it('should return undefined when no pattern matches', () => {
    expect(isInPatternList('Write(file.ts)', ['Read', 'Bash(git:*)'])).toBeUndefined();
  });
});
