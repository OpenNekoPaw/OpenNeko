import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GenerationExecutionPort, GenerationJobSnapshot } from '@neko/generation';
import { createNodeWorkspaceResourceCacheMetadataBinding } from '@neko/local-metadata/node';
import { createNodeWorkspaceGenerationJobOwner } from '../workspace-generation-job-owner';

const temporaryDirectories: string[] = [];
const WORKSPACE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_WORKSPACE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe('createNodeWorkspaceGenerationJobOwner', () => {
  it('initializes a fresh Workspace with the exact authoritative identity', async () => {
    const root = await createTemporaryDirectory();
    const homedir = path.join(root, 'home');
    const workspaceRoot = path.join(root, 'workspace');
    await Promise.all([fs.mkdir(homedir), fs.mkdir(workspaceRoot)]);

    const owner = await createNodeWorkspaceGenerationJobOwner({
      workspaceId: WORKSPACE_ID,
      workspaceRoot,
      homedir,
      mediaExecution: createExecution(path.join(root, 'unused.png')),
      promptExecution: createExecution(path.join(root, 'unused.png')),
    });
    await owner.dispose();

    const identity = await createNodeWorkspaceResourceCacheMetadataBinding({
      homedir,
      workDir: workspaceRoot,
      createWorkspaceId: () => OTHER_WORKSPACE_ID,
    });
    expect(identity.workspaceId).toBe(WORKSPACE_ID);
    await identity.dispose();
  });

  it('persists and commits a Generation Job through the injected execution port', async () => {
    const root = await createTemporaryDirectory();
    const homedir = path.join(root, 'home');
    const workspaceRoot = path.join(root, 'workspace');
    await Promise.all([fs.mkdir(homedir), fs.mkdir(workspaceRoot)]);
    const identity = await createNodeWorkspaceResourceCacheMetadataBinding({
      homedir,
      workDir: workspaceRoot,
      createWorkspaceId: () => WORKSPACE_ID,
    });
    await identity.dispose();
    const sourcePath = path.join(root, 'source.png');
    await fs.writeFile(sourcePath, 'generated image bytes');
    const execution = createExecution(sourcePath);
    const owner = await createNodeWorkspaceGenerationJobOwner({
      workspaceId: WORKSPACE_ID,
      workspaceRoot,
      homedir,
      mediaExecution: execution,
      promptExecution: execution,
    });

    const started = await owner.jobs.submitGeneration({
      lifecycleMode: 'detached',
      generationType: 'text-to-image',
      providerId: 'provider-1',
      modelId: 'model-1',
      request: {
        prompt: 'Generate a fixture image',
        providerId: 'provider-1',
        modelId: 'model-1',
      },
    });
    const completed = await waitForTerminal(owner.jobs.observeGeneration(started.ref));

    expect(execution.generateImage).toHaveBeenCalledTimes(1);
    expect(completed).toMatchObject({
      phase: 'succeeded',
      resultLocators: [
        {
          kind: 'generated-output',
          path: expect.stringMatching(/^neko\/generated\/image\//u),
        },
      ],
    });
    const outputPath = completed.resultLocators?.[0]?.path;
    expect(outputPath).toBeDefined();
    await expect(fs.readFile(path.join(workspaceRoot, outputPath!), 'utf8')).resolves.toBe(
      'generated image bytes',
    );

    await owner.dispose();
  });

  it('commits Prompt output as a durable generated text locator', async () => {
    const root = await createTemporaryDirectory();
    const homedir = path.join(root, 'home');
    const workspaceRoot = path.join(root, 'workspace');
    await Promise.all([fs.mkdir(homedir), fs.mkdir(workspaceRoot)]);
    const execution = createExecution(path.join(root, 'unused.png'));
    execution.generatePrompt.mockResolvedValue({
      type: 'prompt',
      providerId: 'provider-1',
      modelId: 'text-model',
      text: '# Generated scene',
      request: { prompt: 'Write a scene' },
    });
    const owner = await createNodeWorkspaceGenerationJobOwner({
      workspaceId: WORKSPACE_ID,
      workspaceRoot,
      homedir,
      mediaExecution: execution,
      promptExecution: execution,
    });

    const started = await owner.jobs.submitGeneration({
      lifecycleMode: 'detached',
      generationType: 'prompt',
      providerId: 'provider-1',
      modelId: 'text-model',
      request: { prompt: 'Write a scene' },
    });
    const completed = await waitForTerminal(owner.jobs.observeGeneration(started.ref));
    const locator = completed.resultLocators?.[0];

    expect(locator).toMatchObject({
      kind: 'generated-output',
      path: expect.stringMatching(/^neko\/generated\/text\//u),
    });
    await expect(fs.readFile(path.join(workspaceRoot, locator!.path), 'utf8')).resolves.toBe(
      '# Generated scene',
    );
    await owner.dispose();
  });

  it('rejects a mismatched authoritative Workspace identity', async () => {
    const root = await createTemporaryDirectory();
    const homedir = path.join(root, 'home');
    const workspaceRoot = path.join(root, 'workspace');
    await Promise.all([fs.mkdir(homedir), fs.mkdir(workspaceRoot)]);
    const identity = await createNodeWorkspaceResourceCacheMetadataBinding({
      homedir,
      workDir: workspaceRoot,
      createWorkspaceId: () => WORKSPACE_ID,
    });
    await identity.dispose();

    await expect(
      createNodeWorkspaceGenerationJobOwner({
        workspaceId: OTHER_WORKSPACE_ID,
        workspaceRoot,
        homedir,
        mediaExecution: createExecution(path.join(root, 'unused.png')),
        promptExecution: createExecution(path.join(root, 'unused.png')),
      }),
    ).rejects.toThrow(`expected '${OTHER_WORKSPACE_ID}', received '${WORKSPACE_ID}'`);
  });
});

function createExecution(sourcePath: string) {
  return {
    generatePrompt: vi.fn(),
    generateImage: vi.fn(async (request) => ({
      type: 'text-to-image' as const,
      providerId: request.providerId,
      modelId: request.modelId,
      outputs: [{ type: 'image' as const, url: sourcePath, mimeType: 'image/png' }],
      request,
    })),
    generateVideo: vi.fn(),
    generateAudio: vi.fn(),
    describeExternalTask: vi.fn(),
    cancelExternalTask: vi.fn(),
  } satisfies GenerationExecutionPort;
}

async function waitForTerminal(
  snapshots: AsyncIterable<GenerationJobSnapshot>,
): Promise<GenerationJobSnapshot> {
  for await (const snapshot of snapshots) {
    if (
      snapshot.phase === 'succeeded' ||
      snapshot.phase === 'failed' ||
      snapshot.phase === 'cancelled' ||
      snapshot.phase === 'outcome-unknown'
    ) {
      return snapshot;
    }
  }
  throw new Error('Generation Job observation ended before terminal state.');
}

async function createTemporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-workspace-generation-owner-'));
  temporaryDirectories.push(directory);
  return directory;
}
