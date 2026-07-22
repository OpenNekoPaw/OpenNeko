import { describe, expect, it } from 'vitest';
import type {
  AgentCapabilityAvailabilityDiagnostic,
  AgentCapabilityProviderAvailabilitySummary,
} from '@neko/shared';
import {
  presentCapabilityCommand,
  presentMcpCommand,
  type McpCommandSemanticResult,
  type TerminalMcpServerSnapshot,
} from './infrastructure-presentation';
import { createTestAgentTerminalPresentation } from './testing';

const MCP_SERVERS: readonly TerminalMcpServerSnapshot[] = [
  {
    id: 'filesystem',
    name: 'Filesystem Provider',
    enabled: true,
    connected: true,
    transport: 'stdio+vendor-detail',
    toolCount: 2,
  },
  {
    id: 'reference-service',
    name: 'reference-service',
    enabled: false,
    connected: false,
    transport: 'custom-http',
    toolCount: 0,
  },
];

const CAPABILITY_DIAGNOSTICS: readonly AgentCapabilityAvailabilityDiagnostic[] = [
  {
    level: 'warn',
    providerId: 'neko-cut',
    contributionKind: 'tool',
    contributionName: 'cut.render',
    code: 'capability.tool.codec-missing',
    reason: 'Vendor codec: Foo/H.266 is unavailable',
    message: 'External provider message must not be translated.',
    requirement: 'codec:foo-h266',
  },
  {
    level: 'info',
    providerId: 'fountain-content',
    contributionKind: 'provider',
    code: 'capability.provider.host-not-supported',
    reason: 'host=tui is not supported',
    message: 'External provider message must not be translated.',
  },
];

const CAPABILITY_PROVIDERS: readonly AgentCapabilityProviderAvailabilitySummary[] = [
  {
    providerId: 'neko-assets',
    version: 'vendor-version-1',
    loaded: [{ kind: 'tool', name: 'assets.lookup' }],
    skipped: [],
  },
  {
    providerId: 'neko-cut',
    loaded: [],
    skipped: CAPABILITY_DIAGNOSTICS.slice(0, 1),
  },
];

describe('infrastructure command presenters', () => {
  it('localizes MCP-owned chrome while preserving server, transport, and tool identity', () => {
    const semantic = { kind: 'servers', servers: MCP_SERVERS } as const;
    const en = presentMcpCommand(semantic, createTestAgentTerminalPresentation('en'));
    const zh = presentMcpCommand(semantic, createTestAgentTerminalPresentation('zh-cn'));

    expect(en.kind).toBe('output');
    expect(zh.kind).toBe('output');
    if (en.kind !== 'output' || zh.kind !== 'output')
      throw new Error('Expected output projections.');
    expect(en.output).not.toBe(zh.output);
    for (const stableValue of [
      'filesystem',
      'Filesystem Provider',
      'stdio+vendor-detail',
      'reference-service',
      'custom-http',
    ]) {
      expect(en.output).toContain(stableValue);
      expect(zh.output).toContain(stableValue);
    }

    const tools = ['mcp__filesystem__read_file', 'vendor/tool-name'];
    const enTools = presentMcpCommand(
      { kind: 'tools', serverId: 'filesystem', tools },
      createTestAgentTerminalPresentation('en'),
    );
    const zhTools = presentMcpCommand(
      { kind: 'tools', serverId: 'filesystem', tools },
      createTestAgentTerminalPresentation('zh-cn'),
    );
    expect(enTools).toMatchObject({ kind: 'output' });
    expect(zhTools).toMatchObject({ kind: 'output' });
    if (enTools.kind !== 'output' || zhTools.kind !== 'output') {
      throw new Error('Expected tool output projections.');
    }
    expect(enTools.output.split('\n').slice(1)).toEqual(zhTools.output.split('\n').slice(1));
  });

  it('wraps an external MCP failure detail without translating it and keeps its code stable', () => {
    const semantic: McpCommandSemanticResult = {
      kind: 'diagnostic',
      code: 'operation-failed',
      detail: 'ProviderError[E_CONN]: Verbindung abgelehnt',
    };
    const en = presentMcpCommand(semantic, createTestAgentTerminalPresentation('en'));
    const zh = presentMcpCommand(semantic, createTestAgentTerminalPresentation('zh-cn'));

    expect(en).toEqual({
      kind: 'error',
      diagnosticCode: 'mcp.operation-failed',
      error: 'MCP operation failed: ProviderError[E_CONN]: Verbindung abgelehnt',
    });
    expect(zh).toEqual({
      kind: 'error',
      diagnosticCode: 'mcp.operation-failed',
      error: 'MCP 操作失败：ProviderError[E_CONN]: Verbindung abgelehnt',
    });
  });

  it('renders capability rows deterministically and preserves provider contribution details', () => {
    const semantic = {
      kind: 'providers',
      providers: CAPABILITY_PROVIDERS,
      diagnostics: CAPABILITY_DIAGNOSTICS,
    } as const;
    const en = presentCapabilityCommand(semantic, createTestAgentTerminalPresentation('en'));
    const zh = presentCapabilityCommand(semantic, createTestAgentTerminalPresentation('zh-cn'));

    expect(en.kind).toBe('output');
    expect(zh.kind).toBe('output');
    if (en.kind !== 'output' || zh.kind !== 'output')
      throw new Error('Expected output projections.');
    expect(en.output).not.toBe(zh.output);
    for (const stableValue of [
      'neko-assets',
      'neko-cut',
      'cut.render',
      'Vendor codec: Foo/H.266 is unavailable',
      'codec:foo-h266',
      'fountain-content',
      'host=tui is not supported',
    ]) {
      expect(en.output).toContain(stableValue);
      expect(zh.output).toContain(stableValue);
    }
    expect(en.output.indexOf('neko-assets')).toBeLessThan(en.output.indexOf('neko-cut'));
    expect(zh.output.indexOf('neko-assets')).toBeLessThan(zh.output.indexOf('neko-cut'));
    expect(en.output).toContain('warn neko-cut tool cut.render:');
    expect(en.output).toContain('info fountain-content provider: host=tui is not supported');
    expect(en.output).not.toContain('provider :');
  });

  it('uses explicit empty and scoped variants and stable capability diagnostic codes', () => {
    expect(
      presentCapabilityCommand(
        { kind: 'tools', providerId: 'neko-assets', tools: [] },
        createTestAgentTerminalPresentation('zh-cn'),
      ),
    ).toEqual({ kind: 'output', output: 'neko-assets 没有能力工具。' });

    const en = presentCapabilityCommand(
      { kind: 'diagnostic', code: 'unknown-provider', providerId: 'vendor-provider' },
      createTestAgentTerminalPresentation('en'),
    );
    const zh = presentCapabilityCommand(
      { kind: 'diagnostic', code: 'unknown-provider', providerId: 'vendor-provider' },
      createTestAgentTerminalPresentation('zh-cn'),
    );
    expect(en).toEqual({
      kind: 'error',
      diagnosticCode: 'capability.unknown-provider',
      error: 'Unknown capability provider: vendor-provider',
    });
    expect(zh).toEqual({
      kind: 'error',
      diagnosticCode: 'capability.unknown-provider',
      error: '未知能力提供者：vendor-provider',
    });
  });
});
