import { describe, expect, it, vi } from 'vitest';
import type { GenerationJobPort } from '../contracts';
import {
  GenerationApplicationRuntime,
  type GenerationJobOwner,
} from '../generation-application-runtime';

describe('GenerationApplicationRuntime', () => {
  it('shares one exact owner between Agent Tool and direct-operation entries', async () => {
    const owner = createTestOwner();
    let releaseOwner: ((owner: GenerationJobOwner) => void) | undefined;
    const createOwner = vi.fn(
      () =>
        new Promise<GenerationJobOwner>((resolve) => {
          releaseOwner = resolve;
        }),
    );
    const runtime = new GenerationApplicationRuntime({ createOwner });
    const binding = {
      owner: { kind: 'assistant' as const, assistantSpaceId: 'assistant-space:local-user' },
      root: '/user/assistant-spaces/local-user',
    };

    const agentToolJobs = runtime.getJobs(binding);
    const directOperationJobs = runtime.getJobs(binding);

    expect(createOwner).toHaveBeenCalledTimes(1);
    expect(createOwner).toHaveBeenCalledWith(binding);
    releaseOwner?.(owner.value);
    await expect(agentToolJobs).resolves.toBe(owner.value.jobs);
    await expect(directOperationJobs).resolves.toBe(owner.value.jobs);
  });

  it('keeps Workspace and Assistant owners distinct even when their identity text matches', async () => {
    const workspaceOwner = createTestOwner();
    const assistantOwner = createTestOwner();
    const createOwner = vi.fn((binding) =>
      binding.owner.kind === 'workspace' ? workspaceOwner.value : assistantOwner.value,
    );
    const runtime = new GenerationApplicationRuntime({ createOwner });

    await expect(
      runtime.getJobs({
        owner: { kind: 'workspace', workspaceId: 'same-id' },
        root: '/workspace',
      }),
    ).resolves.toBe(workspaceOwner.value.jobs);
    await expect(
      runtime.getJobs({
        owner: { kind: 'assistant', assistantSpaceId: 'same-id' },
        root: '/assistant',
      }),
    ).resolves.toBe(assistantOwner.value.jobs);
    expect(createOwner).toHaveBeenCalledTimes(2);
  });

  it('rejects an existing owner identity bound to another authorized root', async () => {
    const owner = createTestOwner();
    let releaseOwner: ((owner: GenerationJobOwner) => void) | undefined;
    const runtime = new GenerationApplicationRuntime({
      createOwner: () =>
        new Promise<GenerationJobOwner>((resolve) => {
          releaseOwner = resolve;
        }),
    });
    const pending = runtime.getJobs({
      owner: { kind: 'assistant', assistantSpaceId: 'assistant-space:local-user' },
      root: '/assistant/a',
    });

    await expect(
      runtime.getJobs({
        owner: { kind: 'assistant', assistantSpaceId: 'assistant-space:local-user' },
        root: '/assistant/b',
      }),
    ).rejects.toMatchObject({ code: 'generation-owner-conflict' });

    releaseOwner?.(owner.value);
    await pending;
  });

  it('removes only a failed owner creation and preserves sibling owners', async () => {
    const sibling = createTestOwner();
    const retry = createTestOwner();
    let attempts = 0;
    const runtime = new GenerationApplicationRuntime({
      createOwner: vi.fn(async ({ owner }) => {
        if (owner.kind === 'workspace') return sibling.value;
        attempts += 1;
        if (attempts === 1) throw new Error('Assistant store is unavailable.');
        return retry.value;
      }),
    });
    const assistant = {
      owner: { kind: 'assistant' as const, assistantSpaceId: 'assistant-space:local-user' },
      root: '/assistant',
    };
    const workspace = {
      owner: { kind: 'workspace' as const, workspaceId: 'workspace-a' },
      root: '/workspace',
    };

    const siblingJobs = await runtime.getJobs(workspace);
    await expect(runtime.getJobs(assistant)).rejects.toThrow('Assistant store is unavailable.');
    await expect(runtime.getJobs(workspace)).resolves.toBe(siblingJobs);
    await expect(runtime.getJobs(assistant)).resolves.toBe(retry.value.jobs);
  });

  it('disposes ready and pending owners once at application shutdown', async () => {
    const ready = createTestOwner();
    const pending = createTestOwner();
    let releasePending: ((owner: GenerationJobOwner) => void) | undefined;
    const runtime = new GenerationApplicationRuntime({
      createOwner: ({ owner }) => {
        if (owner.kind === 'workspace') return ready.value;
        return new Promise<GenerationJobOwner>((resolve) => {
          releasePending = resolve;
        });
      },
    });
    await runtime.getJobs({
      owner: { kind: 'workspace', workspaceId: 'workspace-ready' },
      root: '/workspace/ready',
    });
    const pendingRequest = runtime.getJobs({
      owner: { kind: 'assistant', assistantSpaceId: 'assistant-pending' },
      root: '/assistant/pending',
    });
    const pendingResult = expect(pendingRequest).rejects.toMatchObject({
      code: 'generation-runtime-disposed',
    });

    const disposal = runtime.dispose();
    releasePending?.(pending.value);

    await Promise.all([disposal, pendingResult]);
    await runtime.dispose();
    expect(ready.dispose).toHaveBeenCalledTimes(1);
    expect(pending.dispose).toHaveBeenCalledTimes(1);
  });
});

function createTestOwner(): {
  readonly value: GenerationJobOwner;
  readonly dispose: ReturnType<typeof vi.fn>;
} {
  const dispose = vi.fn(async () => undefined);
  const jobs = {} as GenerationJobPort;
  return { value: { jobs, dispose }, dispose };
}
