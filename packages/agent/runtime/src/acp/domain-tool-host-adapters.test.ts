import { describe, expect, it, vi } from 'vitest';

import { CanvasDshHostAdapter } from './canvas-host-adapter';
import { GenerationDshHostAdapter } from './generation-host-adapter';
import type { DshAcpDomainToolRequest } from '@neko/agent-contracts/dsh-acp';
import type { GenerationJobSnapshot, PurposeGenerationJobPort } from '@neko/generation/job';
import {
  CanvasProjectAuthoringError,
  type CanvasProjectAuthoringService,
  type CanvasProjectSnapshot,
} from '@neko/canvas-domain';

describe('DSH Host adapters for the W2 domain Tool slice', () => {
  it('submits a Generation Job and returns bounded durable facts without waiting for provider', async () => {
    const jobs = createGenerationJobs();
    const adapter = new GenerationDshHostAdapter(jobs);
    const snapshot = createGenerationSnapshot();

    jobs.submitGeneration.mockResolvedValue(snapshot);

    const response = await adapter.execute(
      request('openneko.generation', 'submit', {
        purpose: 'image.generate',
        generationType: 'text-to-image',
        lifecycleMode: 'detached',
        request: { prompt: 'A quiet harbor' },
      }),
    );

    expect(jobs.submitGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'image.generate',
        generationType: 'text-to-image',
        lifecycleMode: 'detached',
      }),
    );
    expect(jobs.observeGeneration).not.toHaveBeenCalled();
    expect(response).toEqual({
      outcome: 'success',
      jobId: 'job-1',
      result: {
        jobId: 'job-1',
        kind: 'generation',
        phase: 'pending',
        stage: 'queued',
        lifecycleMode: 'detached',
        generationType: 'text-to-image',
        createdAt: 1,
        updatedAt: 2,
      },
    });
  });

  it('describes a Generation Job by exact durable job identity', async () => {
    const jobs = createGenerationJobs();
    const adapter = new GenerationDshHostAdapter(jobs);

    jobs.describeGeneration.mockResolvedValue(createGenerationSnapshot());

    const response = await adapter.execute(
      request('openneko.generation', 'describe', {
        jobId: 'job-1',
      }),
    );

    expect(jobs.describeGeneration).toHaveBeenCalledWith({ kind: 'generation', jobId: 'job-1' });
    expect(response).toMatchObject({
      outcome: 'success',
      jobId: 'job-1',
      result: { jobId: 'job-1' },
    });
  });

  it('fails locally on semantic negatives and exact tool mismatch', async () => {
    const jobs = createGenerationJobs();
    const adapter = new GenerationDshHostAdapter(jobs);

    await expect(
      adapter.execute(
        request('openneko.generation', 'submit', {
          purpose: '',
          generationType: 'text-to-image',
          lifecycleMode: 'detached',
          request: {},
        }),
      ),
    ).resolves.toMatchObject({
      outcome: 'failure',
      diagnostic: { code: 'GENERATION_DSH_TOOL_INVALID_INPUT' },
    });
    await expect(adapter.execute(request('openneko.unknown', 'submit', {}))).resolves.toMatchObject(
      {
        outcome: 'failure',
        diagnostic: { code: 'GENERATION_DSH_TOOL_MISMATCH' },
      },
    );
    expect(jobs.submitGeneration).not.toHaveBeenCalled();
  });

  it('queries Canvas bounded facts and rejects stale fingerprint mutations locally', async () => {
    const service = createCanvasService();
    const adapter = new CanvasDshHostAdapter(service);
    const snapshot = createCanvasSnapshot();

    service.query.mockResolvedValue(snapshot);
    service.createNode.mockRejectedValue(
      new CanvasProjectAuthoringError('stale-project', 'stale fingerprint'),
    );

    const queryResponse = await adapter.execute(
      request('openneko.canvas', 'query', {
        documentPath: 'boards/story.nkc',
      }),
    );
    expect(queryResponse).toEqual({
      outcome: 'success',
      result: {
        documentPath: 'boards/story.nkc',
        fingerprint: { strategy: 'sha256', value: 'fingerprint' },
        nodeCount: 1,
        connectionCount: 0,
      },
    });

    const staleResponse = await adapter.execute(
      request('openneko.canvas', 'create-node', {
        documentPath: 'boards/story.nkc',
        expectedFingerprint: { strategy: 'sha256', value: 'stale' },
        node: { type: 'markdown' },
      }),
    );
    expect(staleResponse).toMatchObject({
      outcome: 'failure',
      diagnostic: { code: 'stale-project' },
    });
    expect(service.createNode).toHaveBeenCalledWith({
      documentPath: 'boards/story.nkc',
      expectedFingerprint: { strategy: 'sha256', value: 'stale' },
      node: { type: 'markdown' },
    });
  });

  it('forwards the Host Tool AbortSignal into Canvas owning-service reads and writes', async () => {
    const service = createCanvasService();
    const adapter = new CanvasDshHostAdapter(service);
    const snapshot = createCanvasSnapshot();
    const controller = new AbortController();

    service.query.mockResolvedValue(snapshot);
    service.createNode.mockResolvedValue({
      ...snapshot,
      node: {
        id: 'node-2',
        type: 'markdown',
        position: { x: 1, y: 2 },
        size: { width: 100, height: 50 },
        zIndex: 2,
      },
    });

    await adapter.execute(
      request('openneko.canvas', 'query', {
        documentPath: 'boards/story.nkc',
      }),
      controller.signal,
    );
    expect(service.query).toHaveBeenCalledWith({
      documentPath: 'boards/story.nkc',
      signal: controller.signal,
    });

    await adapter.execute(
      request('openneko.canvas', 'create-node', {
        documentPath: 'boards/story.nkc',
        expectedFingerprint: { strategy: 'sha256', value: 'fingerprint' },
        node: { type: 'markdown' },
      }),
      controller.signal,
    );
    expect(service.createNode).toHaveBeenCalledWith({
      documentPath: 'boards/story.nkc',
      expectedFingerprint: { strategy: 'sha256', value: 'fingerprint' },
      node: { type: 'markdown' },
      signal: controller.signal,
    });
  });

  it('does not wrap domain Tools in MCP or use a wildcard Host tool registry', async () => {
    const generationSource = await import('node:fs/promises').then(({ readFile }) =>
      readFile(new URL('./generation-host-adapter.ts', import.meta.url), 'utf8'),
    );
    const canvasSource = await import('node:fs/promises').then(({ readFile }) =>
      readFile(new URL('./canvas-host-adapter.ts', import.meta.url), 'utf8'),
    );
    const clientSource = await import('node:fs/promises').then(({ readFile }) =>
      readFile(new URL('./dsh-acp-application-client.ts', import.meta.url), 'utf8'),
    );

    expect(`${generationSource}\n${canvasSource}\n${clientSource}`).not.toMatch(
      /@modelcontextprotocol|mcp-client|mcp\/index|ToolRegistry|createToolRegistry|wildcard/i,
    );
  });
});

function request(tool: string, operation: string, input: unknown): DshAcpDomainToolRequest {
  return {
    sessionId: 'session-1',
    turn: 0,
    toolCallId: `call-${tool}`,
    tool,
    operation,
    input: input as never,
  };
}

function createGenerationJobs(): {
  submitGeneration: ReturnType<typeof vi.fn>;
  describeGeneration: ReturnType<typeof vi.fn>;
  observeGeneration: ReturnType<typeof vi.fn>;
} & Pick<
  PurposeGenerationJobPort,
  'submitGeneration' | 'describeGeneration' | 'observeGeneration'
> {
  return {
    submitGeneration: vi.fn(),
    describeGeneration: vi.fn(),
    observeGeneration: vi.fn(),
  } as never;
}

function createGenerationSnapshot(): GenerationJobSnapshot {
  return {
    ref: { kind: 'generation', jobId: 'job-1' },
    phase: 'pending',
    createdAt: 1,
    updatedAt: 2,
    lifecycleMode: 'detached',
    request: {
      providerId: 'provider',
      modelId: 'model',
      generationType: 'text-to-image',
      request: { prompt: 'A quiet harbor' },
    },
    progress: { stage: 'queued', percent: 0 },
  };
}

function createCanvasService(): Pick<CanvasProjectAuthoringService, 'query' | 'createNode'> {
  return {
    query: vi.fn(),
    createNode: vi.fn(),
  } as never;
}

function createCanvasSnapshot(): CanvasProjectSnapshot {
  return {
    documentPath: 'boards/story.nkc',
    fingerprint: { strategy: 'sha256', value: 'fingerprint' },
    canvas: {
      name: 'Story',
      nodes: [
        {
          id: 'node-1',
          type: 'markdown',
          position: { x: 0, y: 0 },
          size: { width: 100, height: 50 },
          zIndex: 1,
        },
      ],
      connections: [],
    },
  };
}
