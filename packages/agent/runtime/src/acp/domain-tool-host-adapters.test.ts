import { describe, expect, it, vi } from 'vitest';

import { CanvasDshHostAdapter, type CanvasDshAuthoringPort } from './canvas-host-adapter';
import { GenerationDshHostAdapter } from './generation-host-adapter';
import type { DshAcpDomainToolRequest } from '@neko/agent-contracts/dsh-acp';
import type { GenerationJobSnapshot, PurposeGenerationJobPort } from '@neko/generation-domain/job';
import { CanvasProjectAuthoringError, type CanvasProjectSnapshot } from '@neko/canvas-domain';

describe('DSH Host adapters for the W2 domain Tool slice', () => {
  it('denies read-only Generation and Canvas mutations before resolving their services', async () => {
    const resolveJobs = vi.fn();
    const generation = new GenerationDshHostAdapter(resolveJobs);
    const resolveCanvas = vi.fn();
    const canvas = new CanvasDshHostAdapter(resolveCanvas);

    await expect(
      generation.execute(
        request(
          'openneko_generation',
          'submit',
          {
            purpose: 'image.generate',
            generationType: 'text-to-image',
            lifecycleMode: 'detached',
            request: { prompt: 'A quiet harbor' },
          },
          'read-only',
        ),
      ),
    ).resolves.toMatchObject({
      outcome: 'failure',
      diagnostic: { code: 'DSH_DOMAIN_TOOL_READ_ONLY' },
    });
    await expect(
      canvas.execute(
        request(
          'openneko_canvas',
          'apply',
          {
            documentPath: 'boards/story.nkc',
            command: { kind: 'create_node', node: { type: 'markdown', content: '' } },
          },
          'read-only',
        ),
      ),
    ).resolves.toMatchObject({
      outcome: 'failure',
      diagnostic: { code: 'DSH_DOMAIN_TOOL_READ_ONLY' },
    });
    expect(resolveJobs).not.toHaveBeenCalled();
    expect(resolveCanvas).not.toHaveBeenCalled();
  });

  it('keeps Generation submit active until the exact Job succeeds with result locators', async () => {
    const jobs = createGenerationJobs();
    const adapter = new GenerationDshHostAdapter(jobs);
    const submitted = createGenerationSnapshot();
    const succeeded = createSucceededGenerationSnapshot();

    jobs.submitGeneration.mockResolvedValue(submitted);
    jobs.observeGeneration.mockReturnValue(snapshots(submitted, succeeded));

    const response = await adapter.execute(
      request('openneko_generation', 'submit', {
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
    expect(jobs.observeGeneration).toHaveBeenCalledWith(
      { kind: 'generation', jobId: 'job-1' },
      undefined,
    );
    expect(response).toEqual({
      outcome: 'success',
      jobId: 'job-1',
      result: {
        jobId: 'job-1',
        kind: 'generation',
        phase: 'succeeded',
        stage: 'completed',
        lifecycleMode: 'detached',
        generationType: 'text-to-image',
        createdAt: 1,
        updatedAt: 3,
        resultLocators: [
          { file: { authority: 'workspace', path: 'neko/generated/job-1/image.png' } },
        ],
      },
    });
  });

  it('projects each distinct Generation lifecycle snapshot through the exact Tool request', async () => {
    const jobs = createGenerationJobs();
    const submitted = createGenerationSnapshot();
    const running: GenerationJobSnapshot = {
      ...submitted,
      phase: 'running',
      updatedAt: 3,
      progress: { stage: 'waiting-provider', percent: 40 },
    };
    const succeeded = { ...createSucceededGenerationSnapshot(), updatedAt: 4 };
    const project = vi.fn(async () => ({ status: 'accepted' as const }));
    const adapter = new GenerationDshHostAdapter(jobs, undefined, { project });
    jobs.submitGeneration.mockResolvedValue(submitted);
    jobs.observeGeneration.mockReturnValue(snapshots(submitted, running, succeeded));
    const toolRequest = request('openneko_generation', 'submit', {
      purpose: 'image.generate',
      generationType: 'text-to-image',
      lifecycleMode: 'detached',
      request: { prompt: 'A quiet harbor' },
    });

    await expect(adapter.execute(toolRequest)).resolves.toMatchObject({ outcome: 'success' });

    expect(project).toHaveBeenCalledTimes(3);
    expect(project.mock.calls.map(([input]) => input.snapshot.phase)).toEqual([
      'pending',
      'running',
      'succeeded',
    ]);
    expect(project.mock.calls.every(([input]) => input.request === toolRequest)).toBe(true);
  });

  it('fails the Generation Tool visibly when the exact Job reaches a failed terminal state', async () => {
    const jobs = createGenerationJobs();
    const adapter = new GenerationDshHostAdapter(jobs);
    const submitted = createGenerationSnapshot();
    const failed: GenerationJobSnapshot = {
      ...submitted,
      phase: 'failed',
      updatedAt: 3,
      progress: { stage: 'waiting-provider', percent: 40 },
      failure: {
        code: 'provider-request-failed',
        message: 'Provider rejected the image request.',
        retryable: false,
      },
    };
    jobs.submitGeneration.mockResolvedValue(submitted);
    jobs.observeGeneration.mockReturnValue(snapshots(submitted, failed));

    await expect(
      adapter.execute(
        request('openneko_generation', 'submit', {
          purpose: 'image.generate',
          generationType: 'text-to-image',
          lifecycleMode: 'detached',
          request: { prompt: 'A quiet harbor' },
        }),
      ),
    ).resolves.toEqual({
      outcome: 'failure',
      diagnostic: {
        code: 'provider-request-failed',
        message:
          "Generation Job 'job-1' reached settlement phase 'failed': Provider rejected the image request.",
      },
    });
  });

  it.each(['cancelled', 'outcome-unknown'] as const)(
    'fails the Generation Tool visibly when the exact Job reaches %s',
    async (phase) => {
      const jobs = createGenerationJobs();
      const adapter = new GenerationDshHostAdapter(jobs);
      const submitted = createGenerationSnapshot();
      jobs.submitGeneration.mockResolvedValue(submitted);
      jobs.observeGeneration.mockReturnValue(
        snapshots(submitted, {
          ...submitted,
          phase,
          updatedAt: 3,
          failure: {
            code: `generation-${phase}`,
            message: `Generation became ${phase}.`,
          },
        }),
      );

      await expect(
        adapter.execute(
          request('openneko_generation', 'submit', {
            purpose: 'image.generate',
            generationType: 'text-to-image',
            lifecycleMode: 'detached',
            request: { prompt: 'A quiet harbor' },
          }),
        ),
      ).resolves.toMatchObject({
        outcome: 'failure',
        diagnostic: {
          code: `generation-${phase}`,
          message: expect.stringContaining("Generation Job 'job-1'"),
        },
      });
    },
  );

  it('fails visibly if observation ends before the Generation Job reaches a settlement state', async () => {
    const jobs = createGenerationJobs();
    const adapter = new GenerationDshHostAdapter(jobs);
    const submitted = createGenerationSnapshot();
    jobs.submitGeneration.mockResolvedValue(submitted);
    jobs.observeGeneration.mockReturnValue(snapshots(submitted));

    await expect(
      adapter.execute(
        request('openneko_generation', 'submit', {
          purpose: 'image.generate',
          generationType: 'text-to-image',
          lifecycleMode: 'detached',
          request: { prompt: 'A quiet harbor' },
        }),
      ),
    ).resolves.toMatchObject({
      outcome: 'failure',
      diagnostic: {
        code: 'GENERATION_DSH_OBSERVATION_ENDED',
        message: expect.stringContaining("Job 'job-1'"),
      },
    });
  });

  it('fails visibly if a succeeded Generation Job has no canonical result locator', async () => {
    const jobs = createGenerationJobs();
    const adapter = new GenerationDshHostAdapter(jobs);
    const submitted = createGenerationSnapshot();
    jobs.submitGeneration.mockResolvedValue(submitted);
    jobs.observeGeneration.mockReturnValue(
      snapshots(submitted, {
        ...submitted,
        phase: 'succeeded',
        updatedAt: 3,
        progress: { stage: 'completed', percent: 100 },
      }),
    );

    await expect(
      adapter.execute(
        request('openneko_generation', 'submit', {
          purpose: 'image.generate',
          generationType: 'text-to-image',
          lifecycleMode: 'detached',
          request: { prompt: 'A quiet harbor' },
        }),
      ),
    ).resolves.toMatchObject({
      outcome: 'failure',
      diagnostic: {
        code: 'GENERATION_DSH_JOB_RESULT_MISSING',
        message: expect.stringContaining("Job 'job-1'"),
      },
    });
  });

  it('releases a cancelled Tool observer without cancelling the published Generation Job', async () => {
    const jobs = createGenerationJobs();
    const adapter = new GenerationDshHostAdapter(jobs);
    const submitted = createGenerationSnapshot();
    const controller = new AbortController();
    const pendingNext = new Promise<IteratorResult<GenerationJobSnapshot>>(() => undefined);
    const next = vi
      .fn<() => Promise<IteratorResult<GenerationJobSnapshot>>>()
      .mockResolvedValueOnce({ done: false, value: submitted })
      .mockReturnValueOnce(pendingNext);
    const close = vi.fn(async () => ({ done: true, value: undefined }));
    jobs.submitGeneration.mockResolvedValue(submitted);
    jobs.observeGeneration.mockReturnValue({
      [Symbol.asyncIterator]() {
        return { next, return: close };
      },
    });

    const response = adapter.execute(
      request('openneko_generation', 'submit', {
        purpose: 'image.generate',
        generationType: 'text-to-image',
        lifecycleMode: 'detached',
        request: { prompt: 'A quiet harbor' },
      }),
      controller.signal,
    );
    await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(2));
    controller.abort();

    await expect(response).resolves.toMatchObject({
      outcome: 'failure',
      diagnostic: {
        code: 'GENERATION_DSH_TOOL_ABORTED',
        message: expect.stringContaining("Job 'job-1'"),
      },
    });
    expect(jobs.observeGeneration).toHaveBeenCalledWith(
      { kind: 'generation', jobId: 'job-1' },
      controller.signal,
    );
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('describes a Generation Job by exact durable job identity', async () => {
    const jobs = createGenerationJobs();
    const adapter = new GenerationDshHostAdapter(jobs);

    jobs.describeGeneration.mockResolvedValue(createGenerationSnapshot());

    const response = await adapter.execute(
      request('openneko_generation', 'describe', {
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
        request('openneko_generation', 'submit', {
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
    await expect(adapter.execute(request('openneko_unknown', 'submit', {}))).resolves.toMatchObject(
      {
        outcome: 'failure',
        diagnostic: { code: 'GENERATION_DSH_TOOL_MISMATCH' },
      },
    );
    expect(jobs.submitGeneration).not.toHaveBeenCalled();
  });

  it('keeps Canvas freshness inside the owning Host port and projects mutation failures', async () => {
    const service = createCanvasService();
    const adapter = new CanvasDshHostAdapter(service);
    const snapshot = createCanvasSnapshot();

    service.query.mockResolvedValue(snapshot);
    service.createNode.mockRejectedValue(
      new CanvasProjectAuthoringError('stale-project', 'stale fingerprint'),
    );

    const queryResponse = await adapter.execute(
      request('openneko_canvas', 'query', {
        documentPath: 'boards/story.nkc',
      }),
    );
    expect(queryResponse).toEqual({
      outcome: 'success',
      result: {
        documentPath: 'boards/story.nkc',
        name: 'Story',
        nodeCount: 1,
        connectionCount: 0,
        nodes: [
          {
            nodeId: 'node-1',
            nodeType: 'markdown',
            parentId: null,
            title: null,
            data: { content: '' },
            targetableFields: ['/content', '/title'],
          },
        ],
        connections: [],
        missingNodeIds: [],
        nodesTruncated: false,
        connectionsTruncated: false,
      },
    });

    const staleResponse = await adapter.execute(
      request('openneko_canvas', 'apply', {
        documentPath: 'boards/story.nkc',
        command: { kind: 'create_node', node: { type: 'markdown', content: '# Opening' } },
      }),
    );
    expect(staleResponse).toMatchObject({
      outcome: 'failure',
      diagnostic: { code: 'stale-project' },
    });
    expect(service.createNode).toHaveBeenCalledWith({
      documentPath: 'boards/story.nkc',
      node: { type: 'markdown', data: { content: '# Opening' } },
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
        data: { content: '# Opening' },
      },
    });

    await adapter.execute(
      request('openneko_canvas', 'query', {
        documentPath: 'boards/story.nkc',
      }),
      controller.signal,
    );
    expect(service.query).toHaveBeenCalledWith({
      documentPath: 'boards/story.nkc',
      signal: controller.signal,
    });

    await adapter.execute(
      request('openneko_canvas', 'apply', {
        documentPath: 'boards/story.nkc',
        command: { kind: 'create_node', node: { type: 'markdown', content: '# Opening' } },
      }),
      controller.signal,
    );
    expect(service.createNode).toHaveBeenCalledWith({
      documentPath: 'boards/story.nkc',
      node: { type: 'markdown', data: { content: '# Opening' } },
      signal: controller.signal,
    });
  });

  it('routes Canvas update_node and create_connection through the exact owning port', async () => {
    const service = createCanvasService();
    const adapter = new CanvasDshHostAdapter(service);
    const snapshot = createCanvasSnapshot();
    service.updateNode.mockResolvedValue({ ...snapshot, node: snapshot.canvas.nodes[0]! });
    service.createConnection.mockResolvedValue({
      ...snapshot,
      connection: {
        id: 'connection-1',
        sourceId: 'node-1',
        targetId: 'node-2',
        type: 'sequence',
        sourceEndpoint: { nodeId: 'node-1', scope: 'node' },
        targetEndpoint: { nodeId: 'node-2', scope: 'node' },
      },
    });

    await expect(
      adapter.execute(
        request('openneko_canvas', 'apply', {
          documentPath: 'boards/story.nkc',
          command: {
            kind: 'update_node',
            nodeId: 'node-1',
            path: '/content',
            value: '# Revised',
          },
        }),
      ),
    ).resolves.toMatchObject({
      outcome: 'success',
      result: { command: 'update_node', nodeId: 'node-1' },
    });
    expect(service.updateNode).toHaveBeenCalledWith({
      documentPath: 'boards/story.nkc',
      request: { nodeId: 'node-1', path: '/content', value: '# Revised' },
    });

    await expect(
      adapter.execute(
        request('openneko_canvas', 'apply', {
          documentPath: 'boards/story.nkc',
          command: {
            kind: 'create_connection',
            sourceId: 'node-1',
            targetId: 'node-2',
            type: 'sequence',
          },
        }),
      ),
    ).resolves.toMatchObject({
      outcome: 'success',
      result: { command: 'create_connection', connectionId: 'connection-1' },
    });
    expect(service.createConnection).toHaveBeenCalledWith({
      documentPath: 'boards/story.nkc',
      connection: { sourceId: 'node-1', targetId: 'node-2', type: 'sequence' },
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

function request(
  tool: string,
  operation: string,
  input: unknown,
  sandboxMode: DshAcpDomainToolRequest['sandboxMode'] = 'workspace-write',
): DshAcpDomainToolRequest {
  return {
    sessionId: 'session-1',
    turn: 0,
    toolCallId: `call-${tool}`,
    sandboxMode,
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

function createSucceededGenerationSnapshot(): GenerationJobSnapshot {
  return {
    ...createGenerationSnapshot(),
    phase: 'succeeded',
    updatedAt: 3,
    progress: { stage: 'completed', percent: 100 },
    resultLocators: [{ file: { authority: 'workspace', path: 'neko/generated/job-1/image.png' } }],
  };
}

async function* snapshots(
  ...values: readonly GenerationJobSnapshot[]
): AsyncIterable<GenerationJobSnapshot> {
  yield* values;
}

function createCanvasService(): CanvasDshAuthoringPort {
  return {
    query: vi.fn(),
    createNode: vi.fn(),
    updateNode: vi.fn(),
    createConnection: vi.fn(),
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
          data: { content: '' },
        },
      ],
      connections: [],
    },
  };
}
