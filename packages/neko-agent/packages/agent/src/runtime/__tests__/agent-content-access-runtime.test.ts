import { describe, expect, it } from 'vitest';
import {
  createResourceFingerprint,
  createResourceRef,
  type ContentAccessRequest,
} from '@neko/shared';
import {
  createAgentContentAccessDiagnostic,
  createAgentContentAccessFailureResult,
  isAgentContentAccessReady,
  toAgentContentAccessDiagnostics,
  type AgentContentAccessRuntime,
  type AgentContentAccessRuntimeRequest,
} from '../capability/agent-content-access-runtime';

const sourceResource = createResourceRef({
  scope: 'project',
  provider: 'test-source',
  kind: 'media',
  source: {
    kind: 'file',
    uri: 'workspace://images/cat.png',
  },
  fingerprint: createResourceFingerprint({
    strategy: 'identity',
    value: 'cat',
  }),
});

function createBytesRequest(): ContentAccessRequest {
  return {
    ref: sourceResource,
    intent: 'agent-context',
    target: 'bytes',
    caller: 'test',
  };
}

describe('agent content access runtime contracts', () => {
  it('wraps content access diagnostics with Agent caller context', () => {
    const request = createBytesRequest();
    const diagnostic = createAgentContentAccessDiagnostic({
      code: 'engine-file-access-unavailable',
      message: 'Engine file access is unavailable.',
      caller: 'read-image',
      request,
    });

    expect(diagnostic).toEqual({
      code: 'engine-file-access-unavailable',
      severity: 'error',
      message: 'Engine file access is unavailable.',
      caller: 'read-image',
      intent: 'agent-context',
      target: 'bytes',
    });
  });

  it('creates fail-visible content access results without direct-read fallback', () => {
    const request = createBytesRequest();
    const result = createAgentContentAccessFailureResult({
      request,
      caller: 'attachment-processor',
      code: 'direct-binary-read-forbidden',
      message: 'Direct binary reads are not allowed for Agent attachments.',
      status: 'unsupported-source',
    });

    expect(isAgentContentAccessReady(result.status)).toBe(false);
    expect(result.error).toBe('Direct binary reads are not allowed for Agent attachments.');
    expect(result.diagnostics?.[0]).toEqual(
      expect.objectContaining({
        code: 'direct-binary-read-forbidden',
        caller: 'attachment-processor',
      }),
    );
  });

  it('routes binary helper requests through content access runtime resolve', async () => {
    const fakeRuntime = createRecordingAgentContentAccessRuntime({
      resolve: async ({ request: contentRequest }) => ({
        status: 'ready',
        request: contentRequest,
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: 'image/png',
      }),
    });

    const result = await fakeRuntime.loadProviderAsset({
      caller: 'perception-asset-loader',
      source: sourceResource,
      preferredTarget: 'bytes',
      mimeTypeHint: 'image/png',
    });

    expect(result.status).toBe('ready');
    expect(result.bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(fakeRuntime.calls).toEqual([
      {
        caller: 'perception-asset-loader',
        request: {
          ref: sourceResource,
          intent: 'agent-context',
          target: 'bytes',
        },
      },
    ]);
  });

  it('normalizes shared content access diagnostics for Agent call sites', () => {
    const diagnostics = toAgentContentAccessDiagnostics(
      [
        {
          code: 'unauthorized',
          severity: 'error',
          message: 'Source is outside authorized roots.',
          intent: 'agent-context',
          target: 'bytes',
        },
      ],
      'perception-asset-loader',
    );

    expect(diagnostics).toEqual([
      {
        code: 'unauthorized',
        severity: 'error',
        message: 'Source is outside authorized roots.',
        intent: 'agent-context',
        target: 'bytes',
        caller: 'perception-asset-loader',
      },
    ]);
  });
});

function createRecordingAgentContentAccessRuntime(handlers: {
  readonly resolve: (
    input: AgentContentAccessRuntimeRequest,
  ) => ReturnType<AgentContentAccessRuntime['resolve']>;
}): AgentContentAccessRuntime & {
  readonly calls: AgentContentAccessRuntimeRequest[];
} {
  const calls: AgentContentAccessRuntimeRequest[] = [];
  return {
    calls,
    async resolve(input) {
      calls.push(input);
      return handlers.resolve(input);
    },
    async resolveImageMetadata(input) {
      const result = await this.resolve({
        caller: input.caller ?? 'read-image',
        request: {
          ref: input.source,
          intent: input.intent ?? 'agent-context',
          target: 'bytes',
          ...(input.variant ? { variant: input.variant } : {}),
          ...(input.signal ? { signal: input.signal } : {}),
          ...(input.metadata ? { metadata: input.metadata } : {}),
        },
      });
      return {
        status: result.status,
        source: result.source,
        contentAccess: result,
        diagnostics: toAgentContentAccessDiagnostics(
          result.diagnostics,
          input.caller ?? 'read-image',
        ),
        mimeType: result.mimeType,
        width: result.width,
        height: result.height,
        sizeBytes: result.sizeBytes,
      };
    },
    async resolveDocumentContent(input) {
      const result = await this.resolve({
        caller: input.caller ?? 'read-document',
        request: {
          ref: input.source,
          intent: input.intent ?? 'agent-context',
          target: 'bytes',
          ...(input.signal ? { signal: input.signal } : {}),
          ...(input.metadata ? { metadata: input.metadata } : {}),
        },
      });
      return {
        status: result.status,
        source: result.source,
        contentAccess: result,
        diagnostics: toAgentContentAccessDiagnostics(
          result.diagnostics,
          input.caller ?? 'read-document',
        ),
      };
    },
    async loadProviderAsset(input) {
      const result = await this.resolve({
        caller: input.caller ?? 'perception-asset-loader',
        request: {
          ref: input.source,
          intent: 'agent-context',
          target: input.preferredTarget ?? 'bytes',
          ...(input.signal ? { signal: input.signal } : {}),
          ...(input.metadata ? { metadata: input.metadata } : {}),
        },
      });
      return {
        status: result.status,
        source: result.source,
        contentAccess: result,
        diagnostics: toAgentContentAccessDiagnostics(
          result.diagnostics,
          input.caller ?? 'perception-asset-loader',
        ),
        bytes: result.bytes,
        uri: result.uri,
        engineSourceToken: result.engineSource?.token,
        mimeType: result.mimeType,
        sizeBytes: result.sizeBytes,
      };
    },
    async projectResource(input) {
      const result = await this.resolve({
        caller: input.caller ?? 'message-resource-projection',
        request: {
          ref: input.source,
          intent: 'interactive-preview',
          target: input.target,
          ...(input.variant ? { variant: input.variant } : {}),
          ...(input.signal ? { signal: input.signal } : {}),
          ...(input.metadata ? { metadata: input.metadata } : {}),
        },
      });
      return {
        status: result.status,
        source: result.source,
        contentAccess: result,
        diagnostics: toAgentContentAccessDiagnostics(
          result.diagnostics,
          input.caller ?? 'message-resource-projection',
        ),
        target: input.target,
        uri: result.uri,
        runtimeOnly: true,
      };
    },
  };
}
