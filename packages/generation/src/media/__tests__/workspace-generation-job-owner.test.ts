import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GenerationExecutionPort, GenerationJobSnapshot } from '@neko/generation';
import type { ComfyUiWorkflowExecutionPort } from '@neko/generation/comfyui';
import { createNodeWorkspaceResourceCacheMetadataBinding } from '@neko/local-metadata/node';
import { createNodeGenerationJobOwner } from '../node-generation-job-owner';

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

describe('createNodeGenerationJobOwner', () => {
  it('initializes a fresh Workspace with the exact authoritative identity', async () => {
    const root = await createTemporaryDirectory();
    const homedir = path.join(root, 'home');
    const workspaceRoot = path.join(root, 'workspace');
    await Promise.all([fs.mkdir(homedir), fs.mkdir(workspaceRoot)]);

    const owner = await createNodeGenerationJobOwner({
      owner: { kind: 'workspace', workspaceId: WORKSPACE_ID },
      root: workspaceRoot,
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
    const owner = await createNodeGenerationJobOwner({
      owner: { kind: 'workspace', workspaceId: WORKSPACE_ID },
      root: workspaceRoot,
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
          file: {
            authority: 'workspace',
            path: expect.stringMatching(/^neko\/generated\/image\//u),
          },
        },
      ],
    });
    const outputPath = completed.resultLocators?.[0]?.file.path;
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
    const owner = await createNodeGenerationJobOwner({
      owner: { kind: 'workspace', workspaceId: WORKSPACE_ID },
      root: workspaceRoot,
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
    expect(completed, completed.failure?.message).toMatchObject({ phase: 'succeeded' });
    const locator = completed.resultLocators?.[0];

    expect(locator).toMatchObject({
      file: {
        authority: 'workspace',
        path: expect.stringMatching(/^neko\/generated\/text\//u),
      },
    });
    await expect(fs.readFile(path.join(workspaceRoot, locator!.file.path), 'utf8')).resolves.toBe(
      '# Generated scene',
    );
    await owner.dispose();
  });

  it('commits only exact ComfyUI history bytes without a fabricated model identity', async () => {
    const root = await createTemporaryDirectory();
    const homedir = path.join(root, 'home');
    const workspaceRoot = path.join(root, 'workspace');
    await Promise.all([fs.mkdir(homedir), fs.mkdir(workspaceRoot)]);
    const execution = createExecution(path.join(root, 'unused.png'));
    const comfyUiExecution: ComfyUiWorkflowExecutionPort = {
      generateWorkflow: vi.fn(async (request, options) => {
        await options?.onExternalTask?.({
          providerId: 'comfyui',
          externalTaskId: 'prompt-exact',
        });
        return {
          type: 'workflow' as const,
          providerId: 'comfyui' as const,
          promptId: 'prompt-exact',
          request,
          outputs: [
            {
              descriptor: { filename: 'exact.png', subfolder: '', outputType: 'output' },
              mimeType: 'image/png',
              bytes: new Uint8Array([137, 80, 78, 71]),
            },
          ],
        };
      }),
      describeWorkflowTask: vi.fn(),
      cancelWorkflowTask: vi.fn(),
    };
    const owner = await createNodeGenerationJobOwner({
      owner: { kind: 'workspace', workspaceId: WORKSPACE_ID },
      root: workspaceRoot,
      homedir,
      mediaExecution: execution,
      promptExecution: execution,
      comfyUiExecution,
    });
    const request = {
      endpoint: 'http://127.0.0.1:8188',
      clientId: 'openneko-job-1',
      workflow: { '3': { class_type: 'KSampler', inputs: { seed: 42 } } },
      outputKind: 'image' as const,
      inputBindings: [],
    };

    const started = await owner.jobs.submitGeneration({
      lifecycleMode: 'detached',
      generationType: 'workflow',
      providerId: 'comfyui',
      request,
    });
    const completed = await waitForTerminal(owner.jobs.observeGeneration(started.ref));

    expect(completed, completed.failure?.message).toMatchObject({
      phase: 'succeeded',
      providerTask: { providerId: 'comfyui', externalTaskId: 'prompt-exact' },
    });
    expect('modelId' in completed.request).toBe(false);
    const locator = completed.resultLocators?.[0];
    expect(locator?.file.path).toMatch(/^neko\/generated\/image\//u);
    await expect(fs.readFile(path.join(workspaceRoot, locator!.file.path))).resolves.toEqual(
      Buffer.from([137, 80, 78, 71]),
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
      createNodeGenerationJobOwner({
        owner: { kind: 'workspace', workspaceId: OTHER_WORKSPACE_ID },
        root: workspaceRoot,
        homedir,
        mediaExecution: createExecution(path.join(root, 'unused.png')),
        promptExecution: createExecution(path.join(root, 'unused.png')),
      }),
    ).rejects.toThrow(`expected '${OTHER_WORKSPACE_ID}', received '${WORKSPACE_ID}'`);
  });

  it('persists Assistant output under its durable user root without a Workspace descriptor', async () => {
    const root = await createTemporaryDirectory();
    const homedir = path.join(root, 'home');
    const assistantRoot = path.join(homedir, '.neko', 'assistant-spaces', 'local-user');
    await fs.mkdir(assistantRoot, { recursive: true });
    const sourcePath = path.join(root, 'source.png');
    await fs.writeFile(sourcePath, 'assistant generated image bytes');
    const execution = createExecution(sourcePath);
    const owner = await createNodeGenerationJobOwner({
      owner: { kind: 'assistant', assistantSpaceId: 'assistant-space:local-user' },
      root: assistantRoot,
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
        prompt: 'Generate an Assistant fixture image',
        providerId: 'provider-1',
        modelId: 'model-1',
      },
    });
    const completed = await waitForTerminal(owner.jobs.observeGeneration(started.ref));
    expect(completed, completed.failure?.message).toMatchObject({ phase: 'succeeded' });
    const locator = completed.resultLocators?.[0];

    expect(locator).toMatchObject({
      file: {
        authority: 'workspace',
        path: expect.stringMatching(/^neko\/generated\/image\//u),
      },
    });
    await expect(fs.readFile(path.join(assistantRoot, locator!.file.path), 'utf8')).resolves.toBe(
      'assistant generated image bytes',
    );
    await expect(fs.stat(path.join(assistantRoot, 'neko', 'project.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(path.isAbsolute(locator!.file.path)).toBe(false);
    expect(locator!.file.path).not.toContain('.part');

    await owner.dispose();

    const reopened = await createNodeGenerationJobOwner({
      owner: { kind: 'assistant', assistantSpaceId: 'assistant-space:local-user' },
      root: assistantRoot,
      homedir,
      mediaExecution: createExecution(path.join(root, 'unused.png')),
      promptExecution: createExecution(path.join(root, 'unused.png')),
    });
    await expect(reopened.jobs.describeGeneration(started.ref)).resolves.toMatchObject({
      phase: 'succeeded',
      resultLocators: [locator],
    });
    await reopened.dispose();
  });

  it('rejects an Assistant root outside durable user storage before provider execution', async () => {
    const root = await createTemporaryDirectory();
    const homedir = path.join(root, 'home');
    const temporaryAssistantRoot = path.join(root, 'tmp', 'assistant-space');
    await Promise.all([
      fs.mkdir(homedir, { recursive: true }),
      fs.mkdir(temporaryAssistantRoot, { recursive: true }),
    ]);
    const execution = createExecution(path.join(root, 'unused.png'));

    await expect(
      createNodeGenerationJobOwner({
        owner: { kind: 'assistant', assistantSpaceId: 'assistant-space:local-user' },
        root: temporaryAssistantRoot,
        homedir,
        mediaExecution: execution,
        promptExecution: execution,
      }),
    ).rejects.toThrow('must be an exact user-owned Assistant Space');
    expect(execution.generateImage).not.toHaveBeenCalled();
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
