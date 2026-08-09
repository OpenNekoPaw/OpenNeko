import { describe, expect, it, vi } from 'vitest';
import type { GenerationJobPort } from '../contracts';
import {
  WorkspaceGenerationApplicationRuntime,
  type WorkspaceGenerationJobOwner,
} from '../workspace-application-runtime';

describe('WorkspaceGenerationApplicationRuntime', () => {
  it('shares one exact Workspace owner between Agent Tool and direct-operation entries', async () => {
    const owner = createTestOwner();
    let releaseOwner: ((owner: WorkspaceGenerationJobOwner) => void) | undefined;
    const createWorkspaceOwner = vi.fn(
      () =>
        new Promise<WorkspaceGenerationJobOwner>((resolve) => {
          releaseOwner = resolve;
        }),
    );
    const runtime = new WorkspaceGenerationApplicationRuntime({
      createOwner: createWorkspaceOwner,
    });
    const workspace = { workspaceId: 'workspace-a', workspaceRoot: '/workspace/a' };

    const agentToolJobs = runtime.getWorkspaceJobs(workspace);
    const directOperationJobs = runtime.getWorkspaceJobs(workspace);

    expect(createWorkspaceOwner).toHaveBeenCalledTimes(1);
    expect(createWorkspaceOwner).toHaveBeenCalledWith(workspace);
    releaseOwner?.(owner.value);
    await expect(agentToolJobs).resolves.toBe(owner.value.jobs);
    await expect(directOperationJobs).resolves.toBe(owner.value.jobs);
  });

  it('rejects an existing Workspace identity bound to another authorized root', async () => {
    const owner = createTestOwner();
    let releaseOwner: ((owner: WorkspaceGenerationJobOwner) => void) | undefined;
    const createWorkspaceOwner = vi.fn(
      () =>
        new Promise<WorkspaceGenerationJobOwner>((resolve) => {
          releaseOwner = resolve;
        }),
    );
    const runtime = new WorkspaceGenerationApplicationRuntime({
      createOwner: createWorkspaceOwner,
    });
    const pending = runtime.getWorkspaceJobs({
      workspaceId: 'workspace-a',
      workspaceRoot: '/workspace/a',
    });

    await expect(
      runtime.getWorkspaceJobs({
        workspaceId: 'workspace-a',
        workspaceRoot: '/workspace/other',
      }),
    ).rejects.toMatchObject({ code: 'workspace-generation-identity-conflict' });
    expect(createWorkspaceOwner).toHaveBeenCalledTimes(1);

    releaseOwner?.(owner.value);
    await pending;
  });

  it('removes only a failed Workspace creation and preserves sibling owners', async () => {
    const sibling = createTestOwner();
    const retry = createTestOwner();
    let workspaceAttempts = 0;
    const createWorkspaceOwner = vi.fn(
      async ({ workspaceId }: { readonly workspaceId: string }) => {
        if (workspaceId === 'workspace-b') return sibling.value;
        workspaceAttempts += 1;
        if (workspaceAttempts === 1) throw new Error('Workspace A store is unavailable.');
        return retry.value;
      },
    );
    const runtime = new WorkspaceGenerationApplicationRuntime({
      createOwner: createWorkspaceOwner,
    });
    const workspaceA = { workspaceId: 'workspace-a', workspaceRoot: '/workspace/a' };
    const workspaceB = { workspaceId: 'workspace-b', workspaceRoot: '/workspace/b' };

    const siblingJobs = await runtime.getWorkspaceJobs(workspaceB);
    await expect(runtime.getWorkspaceJobs(workspaceA)).rejects.toThrow(
      'Workspace A store is unavailable.',
    );

    await expect(runtime.getWorkspaceJobs(workspaceB)).resolves.toBe(siblingJobs);
    await expect(runtime.getWorkspaceJobs(workspaceA)).resolves.toBe(retry.value.jobs);
    expect(createWorkspaceOwner).toHaveBeenCalledTimes(3);
  });

  it('disposes ready and pending owners once at application shutdown', async () => {
    const ready = createTestOwner();
    const pending = createTestOwner();
    let releasePending: ((owner: WorkspaceGenerationJobOwner) => void) | undefined;
    const runtime = new WorkspaceGenerationApplicationRuntime({
      createOwner: vi.fn(({ workspaceId }) => {
        if (workspaceId === 'workspace-ready') return ready.value;
        return new Promise<WorkspaceGenerationJobOwner>((resolve) => {
          releasePending = resolve;
        });
      }),
    });
    await runtime.getWorkspaceJobs({
      workspaceId: 'workspace-ready',
      workspaceRoot: '/workspace/ready',
    });
    const pendingRequest = runtime.getWorkspaceJobs({
      workspaceId: 'workspace-pending',
      workspaceRoot: '/workspace/pending',
    });
    const pendingResult = expect(pendingRequest).rejects.toMatchObject({
      code: 'workspace-generation-runtime-disposed',
    });

    const disposal = runtime.dispose();
    releasePending?.(pending.value);

    await Promise.all([disposal, pendingResult]);
    await runtime.dispose();
    expect(ready.dispose).toHaveBeenCalledTimes(1);
    expect(pending.dispose).toHaveBeenCalledTimes(1);
    await expect(
      runtime.getWorkspaceJobs({
        workspaceId: 'workspace-after-dispose',
        workspaceRoot: '/workspace/after-dispose',
      }),
    ).rejects.toMatchObject({ code: 'workspace-generation-runtime-disposed' });
  });
});

function createTestOwner(): {
  readonly value: WorkspaceGenerationJobOwner;
  readonly dispose: ReturnType<typeof vi.fn>;
} {
  const dispose = vi.fn(async () => undefined);
  const jobs = {} as GenerationJobPort;
  return {
    value: { jobs, dispose },
    dispose,
  };
}
