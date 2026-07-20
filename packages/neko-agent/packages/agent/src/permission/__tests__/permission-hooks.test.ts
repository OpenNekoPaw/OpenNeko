/**
 * PermissionHooks Tests
 *
 * Tests for the PermissionHooks class and createPermissionHooks factory.
 * PermissionRuleMatcher is used as a real dependency (not mocked).
 * SettingsHookLoader and callbacks are mocked with vi.fn().
 */

import { describe, it, expect, vi } from 'vitest';
import { PermissionHooks, createPermissionHooks } from '../permission-hooks';
import type { PermissionHooksOptions } from '../permission-hooks';
import type { PermissionConfig, PermissionRules } from '../types';
import type { ToolCallInfo } from '@neko/shared';
import type { SettingsHookLoader } from '../../hook-loader/settings-hook-loader';

// =============================================================================
// Helpers
// =============================================================================

/** Build a minimal ToolCallInfo */
function makeToolCall(name: string, args?: Record<string, unknown>, id = 'call_1'): ToolCallInfo {
  return { id, name, arguments: args ?? {}, index: 0 };
}

/** Build a PermissionConfig with sensible defaults */
function makeConfig(overrides: Partial<PermissionConfig> = {}): PermissionConfig {
  return {
    mode: 'ask',
    rules: {},
    ...overrides,
  };
}

/** Create a mock SettingsHookLoader that does not block by default */
function makeMockHookLoader(blocked = false, reason?: string): SettingsHookLoader {
  return {
    executePreToolUse: vi.fn().mockResolvedValue({ success: !blocked, blocked, reason }),
  } as unknown as SettingsHookLoader;
}

// =============================================================================
// Tests
// =============================================================================

describe('PermissionHooks', () => {
  // ---------------------------------------------------------------------------
  // 1. Constructor
  // ---------------------------------------------------------------------------

  describe('constructor', () => {
    it('creates with default config when no options provided', () => {
      const hooks = new PermissionHooks();
      // Default mode from DEFAULT_PERMISSION_CONFIG is 'ask'
      expect(hooks.getMode()).toBe('ask');
      expect(hooks.name).toBe('permission');
    });

    it('creates with custom config', () => {
      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'auto' }),
      });
      expect(hooks.getMode()).toBe('auto');
    });

    it('creates with all custom options without throwing', () => {
      const options: PermissionHooksOptions = {
        config: makeConfig({ mode: 'plan' }),
        onConfirmTool: vi.fn(),
        onToolDenied: vi.fn(),
        onToolAllowed: vi.fn(),
        onToolAskStarted: vi.fn(),
        settingsHookLoader: makeMockHookLoader(),
      };
      expect(() => new PermissionHooks(options)).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // 2. setMode / getMode
  // ---------------------------------------------------------------------------

  describe('setMode / getMode', () => {
    it('returns the mode set via setMode', () => {
      const hooks = new PermissionHooks();
      hooks.setMode('auto');
      expect(hooks.getMode()).toBe('auto');
    });

    it('can switch between all three modes', () => {
      const hooks = new PermissionHooks();

      hooks.setMode('plan');
      expect(hooks.getMode()).toBe('plan');

      hooks.setMode('ask');
      expect(hooks.getMode()).toBe('ask');

      hooks.setMode('auto');
      expect(hooks.getMode()).toBe('auto');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. updateRules / getRules
  // ---------------------------------------------------------------------------

  describe('updateRules / getRules', () => {
    it('returns empty rules by default', () => {
      const hooks = new PermissionHooks({ config: makeConfig({ rules: {} }) });
      const rules = hooks.getRules();
      expect(rules.deny).toBeUndefined();
      expect(rules.allow).toBeUndefined();
      expect(rules.ask).toBeUndefined();
    });

    it('stores and returns updated rules', () => {
      const hooks = new PermissionHooks();
      const rules: PermissionRules = {
        deny: ['Bash'],
        allow: ['Read'],
        ask: ['Write'],
      };
      hooks.updateRules(rules);
      const got = hooks.getRules();
      expect(got.deny).toEqual(['Bash']);
      expect(got.allow).toEqual(['Read']);
      expect(got.ask).toEqual(['Write']);
    });

    it('replaces previous rules on subsequent updateRules calls', () => {
      const hooks = new PermissionHooks();
      hooks.updateRules({ deny: ['Bash'] });
      hooks.updateRules({ allow: ['Read'] });
      // updateRules replaces the whole rules object
      const got = hooks.getRules();
      expect(got.deny).toBeUndefined();
      expect(got.allow).toEqual(['Read']);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. addAllowRule
  // ---------------------------------------------------------------------------

  describe('addAllowRule', () => {
    it('adds a pattern to the allow list', () => {
      const hooks = new PermissionHooks({ config: makeConfig({ rules: {} }) });
      hooks.addAllowRule('Read');
      expect(hooks.getRules().allow).toContain('Read');
    });

    it('does not add duplicate patterns', () => {
      const hooks = new PermissionHooks({ config: makeConfig({ rules: {} }) });
      hooks.addAllowRule('Read');
      hooks.addAllowRule('Read');
      expect(hooks.getRules().allow?.filter((p) => p === 'Read').length).toBe(1);
    });

    it('appends to existing allow rules', () => {
      const hooks = new PermissionHooks({
        config: makeConfig({ rules: { allow: ['Glob'] } }),
      });
      hooks.addAllowRule('Read');
      expect(hooks.getRules().allow).toContain('Glob');
      expect(hooks.getRules().allow).toContain('Read');
    });

    it('rejects persistent shell allow rules', () => {
      const hooks = new PermissionHooks({ config: makeConfig({ rules: {} }) });

      expect(() => hooks.addAllowRule('Bash(git status)')).toThrow(
        'Persistent shell allow rules are disabled',
      );
      expect(hooks.getRules().allow).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 5. onToolCall - deny decision
  // ---------------------------------------------------------------------------

  describe('onToolCall - deny decision', () => {
    it('returns error result when tool is denied by rule', async () => {
      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'ask', rules: { deny: ['Bash'] } }),
      });

      const toolCall = makeToolCall('Bash', { command: 'rm -rf /' });
      const execute = vi.fn().mockResolvedValue({ success: true, data: 'ok' });

      const result = await hooks.onToolCall(toolCall, execute);

      expect(result).not.toBeNull();
      expect(result?.success).toBe(false);
      expect(result?.error).toContain('denied');
      expect(result?.callId).toBe('call_1');
      expect(result?.name).toBe('Bash');
      expect(execute).not.toHaveBeenCalled();
    });

    it('calls onToolDenied callback when tool is denied', async () => {
      const onToolDenied = vi.fn();
      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'ask', rules: { deny: ['Write'] } }),
        onToolDenied,
      });

      const toolCall = makeToolCall('Write', { file_path: '/etc/passwd' });
      const execute = vi.fn();

      await hooks.onToolCall(toolCall, execute);

      expect(onToolDenied).toHaveBeenCalledWith(toolCall, expect.stringContaining('denied'));
    });

    it('denies tool in plan mode when not read-only', async () => {
      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'plan', rules: {} }),
      });

      const toolCall = makeToolCall('Bash', { command: 'echo hello' });
      const execute = vi.fn();

      const result = await hooks.onToolCall(toolCall, execute);

      expect(result).not.toBeNull();
      expect(result?.success).toBe(false);
      expect(result?.error).toContain('not allowed in plan mode');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. onToolCall - allow decision
  // ---------------------------------------------------------------------------

  describe('onToolCall - allow decision', () => {
    it('returns null (pass-through) when tool is allowed by rule', async () => {
      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'ask', rules: { allow: ['Read'] } }),
      });

      const toolCall = makeToolCall('Read', { file_path: '/tmp/test.txt' });
      const execute = vi.fn();

      const result = await hooks.onToolCall(toolCall, execute);

      expect(result).toBeNull();
    });

    it('calls onToolAllowed callback when tool is allowed', async () => {
      const onToolAllowed = vi.fn();
      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'ask', rules: { allow: ['Read'] } }),
        onToolAllowed,
      });

      const toolCall = makeToolCall('Read', { file_path: '/tmp/test.txt' });
      const execute = vi.fn();

      await hooks.onToolCall(toolCall, execute);

      expect(onToolAllowed).toHaveBeenCalledWith(toolCall, expect.any(String));
    });

    it('auto-allows read-only tools in ask mode without requesting confirmation', async () => {
      const onConfirmTool = vi.fn();
      const onToolAllowed = vi.fn();
      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'ask', rules: {} }),
        onConfirmTool,
        onToolAllowed,
      });

      const readOnlyCalls = [
        makeToolCall('Read', { file_path: '/tmp/test.txt' }, 'call_read'),
        makeToolCall(
          'ReadDocument',
          {
            source: {
              kind: 'file',
              path: '/tmp/book.epub',
            },
          },
          'call_doc',
        ),
        makeToolCall(
          'ReadImage',
          {
            images: [
              {
                resourceRef: {
                  kind: 'document-entry',
                  source: { filePath: '/tmp/book.epub', format: 'epub' },
                  entryPath: 'OPS/page.png',
                  versionPolicy: 'versioned-export',
                },
              },
            ],
          },
          'call_image',
        ),
        makeToolCall('Grep', { pattern: 'needle' }, 'call_grep'),
      ];

      for (const toolCall of readOnlyCalls) {
        await expect(hooks.onToolCall(toolCall, vi.fn())).resolves.toBeNull();
      }

      expect(onConfirmTool).not.toHaveBeenCalled();
      expect(onToolAllowed).toHaveBeenCalledTimes(readOnlyCalls.length);
    });

    it('allows read-only tools in plan mode', async () => {
      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'plan', rules: {} }),
      });

      const toolCall = makeToolCall('Read', { file_path: '/tmp/test.txt' });
      const execute = vi.fn();

      const result = await hooks.onToolCall(toolCall, execute);

      expect(result).toBeNull();
    });

    it('allows writing ordinary Markdown in plan mode', async () => {
      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'plan', rules: {} }),
      });

      const writeBrief = makeToolCall('Write', { file_path: '/project/docs/brief.md' });
      const editPlan = makeToolCall('Edit', { path: '/project/plans/animation-plan.md' });

      await expect(hooks.onToolCall(writeBrief, vi.fn())).resolves.toBeNull();
      await expect(hooks.onToolCall(editPlan, vi.fn())).resolves.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 7. onToolCall - ask decision with callback
  // ---------------------------------------------------------------------------

  describe('onToolCall - ask decision with callback', () => {
    it('calls onConfirmTool callback and returns null when approved', async () => {
      const onConfirmTool = vi.fn().mockResolvedValue({
        confirmationToken: 'token_1',
        approved: true,
      });

      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'ask', rules: {} }),
        onConfirmTool,
      });

      const toolCall = makeToolCall('Bash', { command: 'ls' });
      const execute = vi.fn();

      const result = await hooks.onToolCall(toolCall, execute);

      expect(onConfirmTool).toHaveBeenCalledWith(
        expect.objectContaining({
          toolCall,
          action: expect.stringContaining('Run command'),
          confirmationToken: expect.any(String),
        }),
      );
      expect(result).toBeNull();
    });

    it('continues to ask for write, shell, and generation tools in ask mode', async () => {
      const onConfirmTool = vi.fn().mockResolvedValue({
        confirmationToken: 'token_1',
        approved: true,
      });
      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'ask', rules: {} }),
        onConfirmTool,
      });

      const gatedCalls = [
        makeToolCall('Write', { file_path: '/tmp/output.txt' }, 'call_write'),
        makeToolCall('Bash', { command: 'ls' }, 'call_bash'),
        makeToolCall('GenerateImage', { prompt: 'rain' }, 'call_generate'),
      ];

      for (const toolCall of gatedCalls) {
        await expect(hooks.onToolCall(toolCall, vi.fn())).resolves.toBeNull();
      }

      expect(onConfirmTool).toHaveBeenCalledTimes(gatedCalls.length);
    });

    it('lets explicit ask rules override read-only auto-allow in ask mode', async () => {
      const onConfirmTool = vi.fn().mockResolvedValue({
        confirmationToken: 'token_1',
        approved: true,
      });
      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'ask', rules: { ask: ['ReadDocument'] } }),
        onConfirmTool,
      });

      const toolCall = makeToolCall('ReadDocument', {
        source: { kind: 'file', path: '/tmp/book.epub' },
      });

      await expect(hooks.onToolCall(toolCall, vi.fn())).resolves.toBeNull();

      expect(onConfirmTool).toHaveBeenCalledWith(
        expect.objectContaining({
          toolCall,
          action: 'Execute ReadDocument',
        }),
      );
    });

    it('lets explicit deny rules block read-only tools in ask mode', async () => {
      const onConfirmTool = vi.fn();
      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'ask', rules: { deny: ['ReadDocument'] } }),
        onConfirmTool,
      });

      const toolCall = makeToolCall('ReadDocument', {
        source: { kind: 'file', path: '/tmp/book.epub' },
      });
      const result = await hooks.onToolCall(toolCall, vi.fn());

      expect(result).not.toBeNull();
      expect(result?.success).toBe(false);
      expect(result?.error).toContain('denied');
      expect(onConfirmTool).not.toHaveBeenCalled();
    });

    it('returns error result when user denies via callback', async () => {
      const onConfirmTool = vi.fn().mockResolvedValue({
        confirmationToken: 'token_1',
        approved: false,
      });

      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'ask', rules: {} }),
        onConfirmTool,
      });

      const toolCall = makeToolCall('Bash', { command: 'ls' });
      const execute = vi.fn();

      const result = await hooks.onToolCall(toolCall, execute);

      expect(result).not.toBeNull();
      expect(result?.success).toBe(false);
      expect(result?.error).toContain('denied by user');
    });

    it('calls onToolDenied when user denies via callback', async () => {
      const onConfirmTool = vi.fn().mockResolvedValue({
        confirmationToken: 'token_1',
        approved: false,
      });
      const onToolDenied = vi.fn();

      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'ask', rules: {} }),
        onConfirmTool,
        onToolDenied,
      });

      const toolCall = makeToolCall('Bash', { command: 'ls' });
      const execute = vi.fn();

      await hooks.onToolCall(toolCall, execute);

      expect(onToolDenied).toHaveBeenCalledWith(toolCall, 'User denied');
    });

    it('calls onToolAllowed when user approves via callback', async () => {
      const onConfirmTool = vi.fn().mockResolvedValue({
        confirmationToken: 'token_1',
        approved: true,
      });
      const onToolAllowed = vi.fn();

      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'ask', rules: {} }),
        onConfirmTool,
        onToolAllowed,
      });

      const toolCall = makeToolCall('Bash', { command: 'ls' });
      const execute = vi.fn();

      await hooks.onToolCall(toolCall, execute);

      expect(onToolAllowed).toHaveBeenCalledWith(toolCall, 'User approved');
    });
  });

  // ---------------------------------------------------------------------------
  // 8. onToolCall - ask decision with allowAlways
  // ---------------------------------------------------------------------------

  describe('onToolCall - ask decision with allowAlways', () => {
    it('does not persist Bash allow rule when approved with allowAlways', async () => {
      const onConfirmTool = vi.fn().mockResolvedValue({
        confirmationToken: 'token_1',
        approved: true,
        allowAlways: true,
      });

      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'ask', rules: {} }),
        onConfirmTool,
      });

      const toolCall = makeToolCall('Bash', { command: 'git status' });
      const execute = vi.fn();

      await hooks.onToolCall(toolCall, execute);

      const rules = hooks.getRules();
      expect(rules.allow ?? []).not.toContain('Bash(git status)');
    });

    it('does not add allow rule when approved without allowAlways', async () => {
      const onConfirmTool = vi.fn().mockResolvedValue({
        confirmationToken: 'token_1',
        approved: true,
        allowAlways: false,
      });

      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'ask', rules: {} }),
        onConfirmTool,
      });

      const toolCall = makeToolCall('Bash', { command: 'git status' });
      const execute = vi.fn();

      await hooks.onToolCall(toolCall, execute);

      const rules = hooks.getRules();
      expect(rules.allow ?? []).not.toContain('Bash(git status)');
    });

    it('does not add allow rule when denied with allowAlways', async () => {
      const onConfirmTool = vi.fn().mockResolvedValue({
        confirmationToken: 'token_1',
        approved: false,
        allowAlways: true,
      });

      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'ask', rules: {} }),
        onConfirmTool,
      });

      const toolCall = makeToolCall('Bash', { command: 'git status' });
      const execute = vi.fn();

      await hooks.onToolCall(toolCall, execute);

      const rules = hooks.getRules();
      expect(rules.allow).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 9. onToolCall - ask decision without callback (pending confirmation)
  // ---------------------------------------------------------------------------

  describe('onToolCall - ask decision without callback', () => {
    it('creates pending confirmation and waits for confirmTool()', async () => {
      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'ask', rules: {} }),
      });

      const toolCall = makeToolCall('Bash', { command: 'ls' });
      const execute = vi.fn();

      // Start the onToolCall (it will wait for external confirmation)
      const resultPromise = hooks.onToolCall(toolCall, execute);

      // Give it time to create the pending confirmation
      await new Promise((r) => setTimeout(r, 10));

      const pending = hooks.getPendingConfirmations();
      expect(pending.length).toBe(1);
      expect(pending[0]?.toolCall).toEqual(toolCall);

      // Approve the confirmation
      hooks.confirmTool(pending[0]!.confirmationToken, true);

      const result = await resultPromise;
      expect(result).toBeNull();
    });

    it('returns error result when confirmTool denies', async () => {
      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'ask', rules: {} }),
      });

      const toolCall = makeToolCall('Bash', { command: 'ls' });
      const execute = vi.fn();

      const resultPromise = hooks.onToolCall(toolCall, execute);

      await new Promise((r) => setTimeout(r, 10));

      const pending = hooks.getPendingConfirmations();
      hooks.confirmTool(pending[0]!.confirmationToken, false);

      const result = await resultPromise;
      expect(result).not.toBeNull();
      expect(result?.success).toBe(false);
      expect(result?.error).toContain('denied by user');
    });

    it('calls onToolAskStarted callback when ask flow starts', async () => {
      const onToolAskStarted = vi.fn();
      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'ask', rules: {} }),
        onToolAskStarted,
      });

      const toolCall = makeToolCall('Bash', { command: 'ls' });
      const execute = vi.fn();

      const resultPromise = hooks.onToolCall(toolCall, execute);

      await new Promise((r) => setTimeout(r, 10));

      expect(onToolAskStarted).toHaveBeenCalledWith(
        expect.objectContaining({
          toolCall,
          confirmationToken: expect.any(String),
        }),
      );

      // Clean up
      const pending = hooks.getPendingConfirmations();
      hooks.confirmTool(pending[0]!.confirmationToken, false);
      await resultPromise;
    });
  });

  // ---------------------------------------------------------------------------
  // 10. confirmTool
  // ---------------------------------------------------------------------------

  describe('confirmTool', () => {
    it('resolves pending confirmation when called with valid token', async () => {
      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'ask', rules: {} }),
      });

      const toolCall = makeToolCall('Bash', { command: 'ls' });
      const execute = vi.fn();

      const resultPromise = hooks.onToolCall(toolCall, execute);

      await new Promise((r) => setTimeout(r, 10));

      const pending = hooks.getPendingConfirmations();
      const token = pending[0]!.confirmationToken;

      hooks.confirmTool(token, true);

      const result = await resultPromise;
      expect(result).toBeNull();
    });

    it('does not persist Bash allow rule when approved with allowAlways', async () => {
      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'ask', rules: {} }),
      });

      const toolCall = makeToolCall('Bash', { command: 'git status' });
      const execute = vi.fn();

      const resultPromise = hooks.onToolCall(toolCall, execute);

      await new Promise((r) => setTimeout(r, 10));

      const pending = hooks.getPendingConfirmations();
      hooks.confirmTool(pending[0]!.confirmationToken, true, true);

      await resultPromise;

      const rules = hooks.getRules();
      expect(rules.allow ?? []).not.toContain('Bash(git status)');
    });

    it('adds non-shell allow rule when approved with allowAlways', async () => {
      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'ask', rules: {} }),
      });

      const toolCall = makeToolCall('Write', { path: 'draft.md' });
      const execute = vi.fn();

      const resultPromise = hooks.onToolCall(toolCall, execute);

      await new Promise((r) => setTimeout(r, 10));

      const pending = hooks.getPendingConfirmations();
      hooks.confirmTool(pending[0]!.confirmationToken, true, true);

      await resultPromise;

      const rules = hooks.getRules();
      expect(rules.allow).toContain('Write(draft.md)');
    });

    it('does not add allow rule when denied with allowAlways', async () => {
      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'ask', rules: {} }),
      });

      const toolCall = makeToolCall('Bash', { command: 'git status' });
      const execute = vi.fn();

      const resultPromise = hooks.onToolCall(toolCall, execute);

      await new Promise((r) => setTimeout(r, 10));

      const pending = hooks.getPendingConfirmations();
      hooks.confirmTool(pending[0]!.confirmationToken, false, true);

      await resultPromise;

      const rules = hooks.getRules();
      expect(rules.allow).toBeUndefined();
    });

    it('warns when called with unknown token', () => {
      const hooks = new PermissionHooks();

      // Should not throw, just log warning
      expect(() => hooks.confirmTool('unknown_token', true)).not.toThrow();
    });

    it('removes pending confirmation after resolution', async () => {
      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'ask', rules: {} }),
      });

      const toolCall = makeToolCall('Bash', { command: 'ls' });
      const execute = vi.fn();

      const resultPromise = hooks.onToolCall(toolCall, execute);

      await new Promise((r) => setTimeout(r, 10));

      const pending = hooks.getPendingConfirmations();
      expect(pending.length).toBe(1);

      hooks.confirmTool(pending[0]!.confirmationToken, true);

      await resultPromise;

      expect(hooks.getPendingConfirmations().length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 11. getPendingConfirmations
  // ---------------------------------------------------------------------------

  describe('getPendingConfirmations', () => {
    it('returns empty array when no pending confirmations', () => {
      const hooks = new PermissionHooks();
      expect(hooks.getPendingConfirmations()).toEqual([]);
    });

    it('returns list of pending confirmation requests', async () => {
      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'ask', rules: {} }),
      });

      const toolCall1 = makeToolCall('Bash', { command: 'ls' }, 'call_1');
      const toolCall2 = makeToolCall('Write', { file_path: '/tmp/test' }, 'call_2');

      const promise1 = hooks.onToolCall(toolCall1, vi.fn());
      const promise2 = hooks.onToolCall(toolCall2, vi.fn());

      await new Promise((r) => setTimeout(r, 10));

      const pending = hooks.getPendingConfirmations();
      expect(pending.length).toBe(2);
      expect(pending[0]?.toolCall.id).toBe('call_1');
      expect(pending[1]?.toolCall.id).toBe('call_2');

      // Clean up
      pending.forEach((p) => hooks.confirmTool(p.confirmationToken, false));
      await Promise.all([promise1, promise2]);
    });
  });

  // ---------------------------------------------------------------------------
  // 12. onToolCall with settingsHookLoader
  // ---------------------------------------------------------------------------

  describe('onToolCall with settingsHookLoader', () => {
    it('executes PreToolUse hook before permission check', async () => {
      const mockLoader = makeMockHookLoader(false);
      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'ask', rules: { allow: ['Read'] } }),
        settingsHookLoader: mockLoader,
      });

      const toolCall = makeToolCall('Read', { path: 'README.md' });
      const execute = vi.fn();

      await hooks.onToolCall(toolCall, execute);

      expect(mockLoader.executePreToolUse).toHaveBeenCalledWith('Read', { path: 'README.md' });
    });

    it('blocks tool when hook returns blocked', async () => {
      const mockLoader = makeMockHookLoader(true, 'Hook blocked this tool');
      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'auto', rules: {} }),
        settingsHookLoader: mockLoader,
      });

      const toolCall = makeToolCall('Bash', { command: 'rm -rf /' });
      const execute = vi.fn();

      const result = await hooks.onToolCall(toolCall, execute);

      expect(result).not.toBeNull();
      expect(result?.success).toBe(false);
      expect(result?.error).toContain('Hook blocked this tool');
      expect(execute).not.toHaveBeenCalled();
    });

    it('calls onToolDenied when hook blocks tool', async () => {
      const mockLoader = makeMockHookLoader(true, 'Blocked by hook');
      const onToolDenied = vi.fn();
      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'auto', rules: {} }),
        settingsHookLoader: mockLoader,
        onToolDenied,
      });

      const toolCall = makeToolCall('Bash', { command: 'rm -rf /' });
      const execute = vi.fn();

      await hooks.onToolCall(toolCall, execute);

      expect(onToolDenied).toHaveBeenCalledWith(toolCall, 'Blocked by hook');
    });

    it('continues to permission check when hook does not block', async () => {
      const mockLoader = makeMockHookLoader(false);
      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'ask', rules: { allow: ['Read'] } }),
        settingsHookLoader: mockLoader,
      });

      const toolCall = makeToolCall('Read', { file_path: '/tmp/test.txt' });
      const execute = vi.fn();

      const result = await hooks.onToolCall(toolCall, execute);

      expect(mockLoader.executePreToolUse).toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 13. getActionDescription
  // ---------------------------------------------------------------------------

  describe('getActionDescription', () => {
    it('generates correct description for Bash tool', async () => {
      const onToolAskStarted = vi.fn();
      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'ask', rules: {} }),
        onToolAskStarted,
      });

      const toolCall = makeToolCall('Bash', { command: 'git status' });
      const execute = vi.fn();

      const resultPromise = hooks.onToolCall(toolCall, execute);

      await new Promise((r) => setTimeout(r, 10));

      expect(onToolAskStarted).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'Run command: git status',
        }),
      );

      // Clean up
      const pending = hooks.getPendingConfirmations();
      hooks.confirmTool(pending[0]!.confirmationToken, false);
      await resultPromise;
    });

    it('generates correct description for Read tool', async () => {
      const onToolAskStarted = vi.fn();
      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'ask', rules: { ask: ['Read'] } }),
        onToolAskStarted,
      });

      const toolCall = makeToolCall('Read', { file_path: '/tmp/test.txt' });
      const execute = vi.fn();

      const resultPromise = hooks.onToolCall(toolCall, execute);

      await new Promise((r) => setTimeout(r, 10));

      expect(onToolAskStarted).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'Read file: /tmp/test.txt',
        }),
      );

      // Clean up
      const pending = hooks.getPendingConfirmations();
      hooks.confirmTool(pending[0]!.confirmationToken, false);
      await resultPromise;
    });

    it('generates correct description for Write tool', async () => {
      const onToolAskStarted = vi.fn();
      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'ask', rules: {} }),
        onToolAskStarted,
      });

      const toolCall = makeToolCall('Write', { file_path: '/tmp/output.txt' });
      const execute = vi.fn();

      const resultPromise = hooks.onToolCall(toolCall, execute);

      await new Promise((r) => setTimeout(r, 10));

      expect(onToolAskStarted).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'Write file: /tmp/output.txt',
        }),
      );

      // Clean up
      const pending = hooks.getPendingConfirmations();
      hooks.confirmTool(pending[0]!.confirmationToken, false);
      await resultPromise;
    });

    it('generates correct description for Edit tool', async () => {
      const onToolAskStarted = vi.fn();
      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'ask', rules: {} }),
        onToolAskStarted,
      });

      const toolCall = makeToolCall('Edit', { file_path: '/tmp/config.json' });
      const execute = vi.fn();

      const resultPromise = hooks.onToolCall(toolCall, execute);

      await new Promise((r) => setTimeout(r, 10));

      expect(onToolAskStarted).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'Edit file: /tmp/config.json',
        }),
      );

      // Clean up
      const pending = hooks.getPendingConfirmations();
      hooks.confirmTool(pending[0]!.confirmationToken, false);
      await resultPromise;
    });

    it('generates correct description for WebFetch tool', async () => {
      const onToolAskStarted = vi.fn();
      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'ask', rules: { ask: ['WebFetch'] } }),
        onToolAskStarted,
      });

      const toolCall = makeToolCall('WebFetch', {
        url: 'https://example.com',
        mode: 'live',
        providerId: 'mcp:research',
        domain: 'example.com',
      });
      const execute = vi.fn();

      const resultPromise = hooks.onToolCall(toolCall, execute);

      await new Promise((r) => setTimeout(r, 10));

      expect(onToolAskStarted).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'Fetch URL: https://example.com (live, mcp:research, example.com)',
          details: expect.objectContaining({
            mode: 'live',
            providerId: 'mcp:research',
            domain: 'example.com',
            url: 'https://example.com',
          }),
        }),
      );

      // Clean up
      const pending = hooks.getPendingConfirmations();
      hooks.confirmTool(pending[0]!.confirmationToken, false);
      await resultPromise;
    });

    it('generates external research description for WebSearch tool', async () => {
      const onToolAskStarted = vi.fn();
      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'ask', rules: { ask: ['WebSearch'] } }),
        onToolAskStarted,
      });

      const resultPromise = hooks.onToolCall(
        makeToolCall('WebSearch', {
          query: 'kimono reference',
          mode: 'indexed',
          providerId: 'mcp:research',
        }),
        vi.fn(),
      );

      await new Promise((r) => setTimeout(r, 10));

      expect(onToolAskStarted).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'Search web: kimono reference (indexed, mcp:research)',
          details: expect.objectContaining({
            query: 'kimono reference',
            mode: 'indexed',
            providerId: 'mcp:research',
          }),
        }),
      );

      const pending = hooks.getPendingConfirmations();
      hooks.confirmTool(pending[0]!.confirmationToken, false);
      await resultPromise;
    });

    it('generates default description for unknown tool', async () => {
      const onToolAskStarted = vi.fn();
      const hooks = new PermissionHooks({
        config: makeConfig({ mode: 'ask', rules: {} }),
        onToolAskStarted,
      });

      const toolCall = makeToolCall('CustomTool', { param: 'value' });
      const execute = vi.fn();

      const resultPromise = hooks.onToolCall(toolCall, execute);

      await new Promise((r) => setTimeout(r, 10));

      expect(onToolAskStarted).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'Execute CustomTool',
        }),
      );

      // Clean up
      const pending = hooks.getPendingConfirmations();
      hooks.confirmTool(pending[0]!.confirmationToken, false);
      await resultPromise;
    });
  });

  // ---------------------------------------------------------------------------
  // 14. createPermissionHooks factory
  // ---------------------------------------------------------------------------

  describe('createPermissionHooks', () => {
    it('creates PermissionHooks instance with default options', () => {
      const hooks = createPermissionHooks();
      expect(hooks).toBeInstanceOf(PermissionHooks);
      expect(hooks.name).toBe('permission');
    });

    it('creates PermissionHooks instance with custom options', () => {
      const hooks = createPermissionHooks({
        config: makeConfig({ mode: 'auto' }),
      });
      expect(hooks).toBeInstanceOf(PermissionHooks);
      expect(hooks.getMode()).toBe('auto');
    });
  });
});
