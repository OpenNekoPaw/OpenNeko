/**
 * Tool Pattern Matcher — Shared utilities for tool call normalization and pattern matching
 *
 * Provides a single source of truth for:
 * - Normalizing tool calls to a canonical string format (e.g., "Bash(git status)")
 * - Matching normalized tool strings against patterns (exact, glob, prefix, domain)
 *
 * Used by PermissionRuleMatcher for product-owned permission rules.
 *
 * Pattern syntax:
 * - "Read" — Exact tool name (matches all Read calls regardless of args)
 * - "Bash(npm:*)" — Bash command prefix match
 * - "Bash(git status)" — Exact Bash command match
 * - "Read(src/**)" — Path glob pattern (** matches any depth)
 * - "Read(src/*)" — Path glob pattern (* matches single level)
 * - "WebFetch(domain:github.com)" — Exact domain match
 * - "WebFetch(domain:*.github.com)" — Wildcard domain match
 */

/**
 * Minimal tool call input for normalization.
 * Compatible with the product ToolCallInfo projection.
 */
export interface ToolCallLike {
  /** Tool name */
  name: string;
  /** Tool arguments */
  arguments?: Record<string, unknown>;
}

/**
 * Normalize a tool call to a canonical string format for pattern matching.
 *
 * @example
 * { name: 'Bash', arguments: { command: 'git status' } } → 'Bash(git status)'
 * { name: 'Read', arguments: { file_path: 'src/index.ts' } } → 'Read(src/index.ts)'
 * { name: 'ReadDocument', arguments: { source: { kind: 'file', path: '${A}/book.epub' } } } → 'ReadDocument(${A}/book.epub)'
 * { name: 'WebFetch', arguments: { url: 'https://github.com' } } → 'WebFetch(domain:github.com)'
 */
export function normalizeToolCall(toolCall: ToolCallLike): string {
  const { name, arguments: args } = toolCall;

  // Handle Bash tool - extract command
  if (name === 'Bash' && args?.command) {
    return `Bash(${String(args.command)})`;
  }

  // Handle filesystem tools - extract path/pattern
  if (['Read', 'Edit', 'Write', 'Glob', 'Grep'].includes(name)) {
    const path = args?.file_path || args?.path || args?.pattern;
    if (path) {
      return `${name}(${String(path)})`;
    }
  }

  if (name === 'ReadDocument' || name === 'ReadImage') {
    const sourcePath = extractSourcePath(args?.source);
    if (sourcePath) {
      return `${name}(${sourcePath})`;
    }
  }

  // Handle WebFetch - extract domain
  if (name === 'WebFetch' && args?.url) {
    try {
      const url = new URL(String(args.url));
      return `WebFetch(domain:${url.hostname})`;
    } catch {
      return `WebFetch(${String(args.url)})`;
    }
  }

  // Handle MCP tools
  if (name.startsWith('mcp__')) {
    return name;
  }

  return name;
}

function extractSourcePath(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record['path'] === 'string') return record['path'];
  const source = record['source'];
  if (!source || typeof source !== 'object') return undefined;
  const nested = source as Record<string, unknown>;
  if (typeof nested['filePath'] === 'string') return nested['filePath'];
  if (typeof nested['projectRelativePath'] === 'string') return nested['projectRelativePath'];
  const document = nested['document'];
  if (!document || typeof document !== 'object') return undefined;
  const documentRecord = document as Record<string, unknown>;
  return typeof documentRecord['filePath'] === 'string' ? documentRecord['filePath'] : undefined;
}

/**
 * Check if a normalized tool string matches a pattern.
 *
 * Supports multiple pattern formats:
 * - Exact match: "Read" === "Read"
 * - Tool name only: "Bash" matches "Bash(git status)"
 * - Command prefix: "Bash(npm:*)" matches "Bash(npm run build)"
 * - Path glob **: "Read(src/**)" matches "Read(src/deep/file.ts)"
 * - Path glob *: "Read(src/*)" matches "Read(src/file.ts)" (not deeper)
 * - Domain: "WebFetch(domain:github.com)" matches exactly
 * - Domain wildcard: "WebFetch(domain:*.github.com)" matches subdomains
 */
export function matchesPattern(normalizedTool: string, pattern: string): boolean {
  // Exact match
  if (pattern === normalizedTool) {
    return true;
  }

  // Tool name only match (e.g., "Bash" matches all Bash calls)
  const toolName = normalizedTool.split('(')[0];
  if (pattern === toolName) {
    return true;
  }

  // Pattern with arguments
  const patternMatch = pattern.match(/^(\w+)\((.+)\)$/);
  const toolMatch = normalizedTool.match(/^(\w+)\((.+)\)$/);

  if (!patternMatch || !toolMatch) {
    return false;
  }

  const [, patternTool, patternArg] = patternMatch;
  const [, callTool, callArg] = toolMatch;

  // Tool name must match
  if (patternTool !== callTool) {
    return false;
  }

  // Handle domain matching for WebFetch
  if (patternArg?.startsWith('domain:') && callArg?.startsWith('domain:')) {
    const patternDomain = patternArg.slice(7);
    const callDomain = callArg.slice(7);

    // Wildcard domain match (*.github.com)
    if (patternDomain.startsWith('*.')) {
      const suffix = patternDomain.slice(1); // .github.com
      return callDomain.endsWith(suffix) || callDomain === patternDomain.slice(2);
    }

    return patternDomain === callDomain;
  }

  // Handle command prefix match (npm:* or git:*)
  if (patternArg?.endsWith(':*')) {
    const cmdPrefix = patternArg.slice(0, -2);
    // Match "npm" or "npm run build" etc.
    return callArg === cmdPrefix || callArg?.startsWith(cmdPrefix + ' ') === true;
  }

  // Handle ** glob pattern for paths (check before single * to avoid early match)
  if (patternArg?.includes('**')) {
    // Use placeholder to avoid double replacement
    const regex = patternArg
      .replace(/\*\*/g, '\x00DOUBLE_STAR\x00') // Placeholder for **
      .replace(/\*/g, '[^/]*') // Single * matches non-slash chars
      .replace(/\x00DOUBLE_STAR\x00/g, '.*') // ** matches everything
      .replace(/\//g, '\\/'); // Escape slashes
    try {
      return new RegExp(`^${regex}$`).test(callArg || '');
    } catch {
      return false;
    }
  }

  // Handle glob-style wildcard match (single *)
  if (patternArg?.endsWith('*')) {
    const prefix = patternArg.slice(0, -1);
    return callArg?.startsWith(prefix) || false;
  }

  // Exact argument match
  return patternArg === callArg;
}

/**
 * Check if a normalized tool string matches any pattern in a list.
 * Returns the first matching pattern, or undefined if no match.
 */
export function isInPatternList(normalizedTool: string, patterns?: string[]): string | undefined {
  if (!patterns || patterns.length === 0) {
    return undefined;
  }

  for (const pattern of patterns) {
    if (matchesPattern(normalizedTool, pattern)) {
      return pattern;
    }
  }

  return undefined;
}
