/**
 * Permission Rule Matcher
 *
 * Matches tool calls against permission rules (deny/allow/ask).
 * Pattern matching logic is centralized in tools/tool-pattern-matcher.ts.
 *
 * Pattern syntax:
 * - "Read" - Exact tool name
 * - "Bash(npm:*)" - Bash command prefix (npm run build, npm test, etc.)
 * - "Bash(git status)" - Exact bash command
 * - "Read(src/**)" - Path pattern with glob
 */

import type { ToolCallInfo } from '@neko/shared';
import type { PermissionRules, PermissionCheckResult, PermissionConfig } from './types';
import { DEFAULT_READ_ONLY_TOOLS, READ_ONLY_MCP_PREFIXES } from './types';
import type { ToolTraitsRegistry } from './tool-traits-registry';

// Re-export pattern matching utilities from centralized module for backward compatibility
export { normalizeToolCall, matchesPattern, isInPatternList } from '../tools/tool-pattern-matcher';
import { normalizeToolCall, isInPatternList } from '../tools/tool-pattern-matcher';

/**
 * Check if a tool call edits ordinary Markdown.
 */
export function isPlanMarkdownWrite(toolCall: ToolCallInfo): boolean {
  const { name, arguments: args } = toolCall;

  // Only Write and Edit tools can write to files
  if (name !== 'Write' && name !== 'Edit') {
    return false;
  }

  // Get the file path from arguments
  const filePath = args?.file_path || args?.path;
  if (!filePath || typeof filePath !== 'string') {
    return false;
  }

  return /(?:^|[/\\])[^/\\]+\.md$/iu.test(filePath);
}

/**
 * Check if a tool is read-only
 *
 * A tool is considered read-only if:
 * 1. It's in the readOnlyTools list (e.g., 'Read', 'Glob', 'Grep')
 * 2. It's an MCP tool with a read-only prefix (e.g., 'mcp__serena__find_symbol')
 */
export function isReadOnlyTool(
  toolCall: ToolCallInfo,
  readOnlyTools: string[] = DEFAULT_READ_ONLY_TOOLS,
  readOnlyMcpPrefixes: string[] = READ_ONLY_MCP_PREFIXES,
): boolean {
  const { name } = toolCall;

  // Check if in read-only tools list
  if (readOnlyTools.includes(name)) {
    return true;
  }

  // Check MCP tools with read-only prefixes
  // Format: mcp__<server>__<tool_name>
  if (name.startsWith('mcp__')) {
    // Extract the actual tool name (last part after the server name)
    const parts = name.split('__');
    if (parts.length >= 3) {
      const mcpToolName = parts.slice(2).join('__'); // Handle nested names
      // Check if the tool name starts with a read-only prefix
      for (const prefix of readOnlyMcpPrefixes) {
        if (mcpToolName.startsWith(prefix)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Permission Rule Matcher class
 *
 * Evaluates tool calls against permission rules in order:
 * 1. deny - If matched, immediately deny
 * 2. allow - If matched, allow without confirmation
 * 3. ask - If matched, require confirmation
 * 4. mode check - Apply execution mode rules
 */
export class PermissionRuleMatcher {
  private config: PermissionConfig;
  private traitsRegistry?: ToolTraitsRegistry;

  constructor(config: PermissionConfig, traitsRegistry?: ToolTraitsRegistry) {
    this.config = config;
    this.traitsRegistry = traitsRegistry;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PermissionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current mode
   */
  getMode(): string {
    return this.config.mode;
  }

  /**
   * Check permission for a tool call
   */
  check(toolCall: ToolCallInfo): PermissionCheckResult {
    const normalizedTool = normalizeToolCall(toolCall);
    const { rules, mode, readOnlyTools, readOnlyMcpPrefixes } = this.config;

    // Step 1: Check deny rules (highest priority)
    const denyMatch = isInPatternList(normalizedTool, rules.deny);
    if (denyMatch) {
      return {
        decision: 'deny',
        reason: `Tool '${normalizedTool}' is denied by rule '${denyMatch}'`,
        matchedRule: denyMatch,
        toolCall,
      };
    }

    // Step 2: Plan mode - only allow read-only tools + plan file writes
    if (mode === 'plan') {
      // Allow read-only tools
      if (isReadOnlyTool(toolCall, readOnlyTools, readOnlyMcpPrefixes)) {
        return {
          decision: 'allow',
          reason: `Read-only tool allowed in plan mode`,
          toolCall,
        };
      }

      if (isPlanMarkdownWrite(toolCall)) {
        return {
          decision: 'allow',
          reason: 'Authorized Markdown edits are allowed in plan mode',
          toolCall,
        };
      }

      return {
        decision: 'deny',
        reason: `Tool '${toolCall.name}' is not allowed in plan mode. Only read-only tools and ordinary authorized Markdown edits are permitted.`,
        toolCall,
      };
    }

    // Step 3: Check allow rules
    const allowMatch = isInPatternList(normalizedTool, rules.allow);
    if (allowMatch) {
      // But first check if there's an ask rule that overrides
      const askMatch = isInPatternList(normalizedTool, rules.ask);
      if (askMatch) {
        return {
          decision: 'ask',
          reason: `Tool '${normalizedTool}' requires confirmation (ask rule '${askMatch}' overrides allow)`,
          matchedRule: askMatch,
          toolCall,
        };
      }

      return {
        decision: 'allow',
        reason: `Tool '${normalizedTool}' allowed by rule '${allowMatch}'`,
        matchedRule: allowMatch,
        toolCall,
      };
    }

    // Step 4: Check ask rules
    const askMatch = isInPatternList(normalizedTool, rules.ask);
    if (askMatch) {
      return {
        decision: 'ask',
        reason: `Tool '${normalizedTool}' requires confirmation by rule '${askMatch}'`,
        matchedRule: askMatch,
        toolCall,
      };
    }

    // Step 5: Apply mode-based defaults
    if (mode === 'ask' && isReadOnlyTool(toolCall, readOnlyTools, readOnlyMcpPrefixes)) {
      return {
        decision: 'allow',
        reason: `Ask mode: read-only tool '${normalizedTool}' auto-allowed`,
        toolCall,
      };
    }

    if (mode === 'auto') {
      // Creative conditional auto: use traits when available
      if (this.traitsRegistry) {
        const traits = this.traitsRegistry.get(toolCall.name);

        // Reversible OR local → auto-allow (safe, zero-cost operations)
        if (traits.reversible || traits.locality === 'local') {
          return {
            decision: 'allow',
            reason: `Auto mode: '${normalizedTool}' auto-allowed (reversible=${String(traits.reversible)}, locality=${traits.locality})`,
            toolCall,
          };
        }

        // Network + irreversible → ask user (costs money, user should confirm)
        return {
          decision: 'ask',
          reason: `Auto mode: '${normalizedTool}' requires confirmation (network + irreversible, cost=${traits.cost})`,
          toolCall,
        };
      }

      // Missing traits metadata cannot prove the tool is safe, so ask the user.
      return {
        decision: 'ask',
        reason: `Auto mode: tool '${normalizedTool}' requires confirmation because tool traits metadata is unavailable`,
        toolCall,
      };
    }

    // Default: ask mode requires confirmation for non-read-only tools not explicitly allowed
    return {
      decision: 'ask',
      reason: `Ask mode: tool '${normalizedTool}' requires confirmation`,
      toolCall,
    };
  }

  /**
   * Check multiple tool calls
   */
  checkAll(toolCalls: ToolCallInfo[]): PermissionCheckResult[] {
    return toolCalls.map((tc) => this.check(tc));
  }

  /**
   * Add a rule dynamically
   */
  addRule(type: 'deny' | 'allow' | 'ask', pattern: string): void {
    const rules = this.config.rules;
    if (!rules[type]) {
      rules[type] = [];
    }
    if (!rules[type]!.includes(pattern)) {
      rules[type]!.push(pattern);
    }
  }

  /**
   * Remove a rule
   */
  removeRule(type: 'deny' | 'allow' | 'ask', pattern: string): boolean {
    const rules = this.config.rules;
    const list = rules[type];
    if (!list) return false;

    const index = list.indexOf(pattern);
    if (index >= 0) {
      list.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get all rules
   */
  getRules(): PermissionRules {
    return {
      deny: this.config.rules.deny ? [...this.config.rules.deny] : undefined,
      allow: this.config.rules.allow ? [...this.config.rules.allow] : undefined,
      ask: this.config.rules.ask ? [...this.config.rules.ask] : undefined,
    };
  }
}

/**
 * Create a permission rule matcher
 */
export function createPermissionRuleMatcher(config: PermissionConfig): PermissionRuleMatcher {
  return new PermissionRuleMatcher(config);
}
