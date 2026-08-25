import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';

import { ComfyUiLocalApi, ComfyUiWorkflowRunner, type ComfyUiLocalApiRequestPort } from './index';

describe('ComfyUiLocalApi', () => {
  it('submits and retrieves only output owned by the exact prompt history', async () => {
    const request = vi.fn(async (input: { readonly url: string; readonly method: string }) => {
      if (input.url.endsWith('/prompt')) return json({ prompt_id: 'prompt-1', number: 1 });
      if (input.url.endsWith('/history/prompt-1')) {
        return json({
          'prompt-1': {
            status: { status_str: 'success', completed: true },
            outputs: {
              '9': { images: [{ filename: 'result.png', subfolder: '', type: 'output' }] },
            },
          },
        });
      }
      if (input.url.includes('/view?')) {
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      }
      throw new Error(`Unexpected request ${input.method} ${input.url}`);
    });
    const api = new ComfyUiLocalApi({ request } as ComfyUiLocalApiRequestPort);
    const ref = await api.submit({
      endpoint: 'http://127.0.0.1:8188',
      clientId: 'openneko-1',
      workflow: { '3': { class_type: 'KSampler', inputs: {} } },
    });

    const output = await api.retrieve('http://127.0.0.1:8188', ref, {
      filename: 'result.png',
      subfolder: '',
      outputType: 'output',
    });

    expect(ref).toEqual({ providerId: 'comfyui', promptId: 'prompt-1' });
    expect(output.mimeType).toBe('image/png');
    expect([...output.bytes]).toEqual([1, 2, 3]);
    expect(request.mock.calls.some(([input]) => input.url.includes('filename=result.png'))).toBe(
      true,
    );
  });

  it('deletes an exact pending prompt without global interruption', async () => {
    const request = vi.fn(async (input: { readonly url: string; readonly body?: unknown }) => {
      if (input.url.endsWith('/queue') && input.body === undefined) {
        return json({ queue_running: [], queue_pending: [[1, 'prompt-1', {}, {}]] });
      }
      if (input.url.endsWith('/queue')) return json({});
      throw new Error(`Unexpected request ${input.url}`);
    });
    const api = new ComfyUiLocalApi({ request } as ComfyUiLocalApiRequestPort);

    await api.cancel('http://127.0.0.1:8188', {
      providerId: 'comfyui',
      promptId: 'prompt-1',
    });

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'http://127.0.0.1:8188/queue',
        method: 'POST',
        body: { delete: ['prompt-1'] },
      }),
    );
    expect(request.mock.calls.some(([input]) => input.url.endsWith('/interrupt'))).toBe(false);
  });

  it('refuses global interrupt when exact running cancellation cannot be proven', async () => {
    const request = vi.fn(async (_input: { readonly url: string }) =>
      json({
        queue_running: [
          [1, 'prompt-1', {}, {}],
          [2, 'prompt-2', {}, {}],
        ],
        queue_pending: [],
      }),
    );
    const api = new ComfyUiLocalApi({ request } as ComfyUiLocalApiRequestPort);

    await expect(
      api.cancel('http://127.0.0.1:8188', {
        providerId: 'comfyui',
        promptId: 'prompt-1',
      }),
    ).rejects.toMatchObject({ code: 'comfyui-cancel-target-mismatch' });
    expect(request.mock.calls.some(([input]) => input.url.endsWith('/interrupt'))).toBe(false);
  });

  it('rejects DNS names and remote endpoints before issuing a request', async () => {
    const request = vi.fn();
    const api = new ComfyUiLocalApi({ request });

    await expect(
      api.submit({
        endpoint: 'https://remote.example.com',
        clientId: 'openneko-1',
        workflow: { '1': {} },
      }),
    ).rejects.toMatchObject({ code: 'comfyui-endpoint-invalid' });
    await expect(
      api.submit({
        endpoint: 'http://localhost:8188',
        clientId: 'openneko-1',
        workflow: { '1': {} },
      }),
    ).rejects.toMatchObject({ code: 'comfyui-endpoint-invalid' });
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects a redirected provider response', async () => {
    const redirected = json({ prompt_id: 'prompt-1' });
    Object.defineProperties(redirected, {
      redirected: { value: true },
      url: { value: 'https://remote.example.com/prompt' },
    });
    const api = new ComfyUiLocalApi({ request: vi.fn(async () => redirected) });

    await expect(
      api.submit({
        endpoint: 'http://127.0.0.1:8188',
        clientId: 'openneko-1',
        workflow: { '1': {} },
      }),
    ).rejects.toMatchObject({ code: 'comfyui-endpoint-invalid' });
  });

  it('rejects nested API bases and redirected cancellation responses', async () => {
    const nestedRequest = vi.fn();
    const nestedApi = new ComfyUiLocalApi({ request: nestedRequest });
    await expect(
      nestedApi.submit({
        endpoint: 'http://127.0.0.1:8188/untrusted-base',
        clientId: 'openneko-1',
        workflow: { '1': {} },
      }),
    ).rejects.toMatchObject({ code: 'comfyui-endpoint-invalid' });
    expect(nestedRequest).not.toHaveBeenCalled();

    const redirected = json({});
    Object.defineProperties(redirected, {
      redirected: { value: true },
      url: { value: 'https://remote.example.com/queue' },
    });
    const request = vi.fn(async (input: { readonly url: string; readonly body?: unknown }) => {
      if (input.url.endsWith('/queue') && input.body === undefined) {
        return json({ queue_running: [], queue_pending: [[1, 'prompt-1', {}, {}]] });
      }
      return redirected;
    });
    const api = new ComfyUiLocalApi({ request } as ComfyUiLocalApiRequestPort);
    await expect(
      api.cancel('http://127.0.0.1:8188', {
        providerId: 'comfyui',
        promptId: 'prompt-1',
      }),
    ).rejects.toMatchObject({ code: 'comfyui-endpoint-invalid' });
  });

  it('validates, submits, correlates and retrieves one exact workflow prompt', async () => {
    const request = vi.fn(async (input: { readonly url: string }) => {
      if (input.url.endsWith('/object_info')) {
        return json({ KSampler: { input: { required: {} } } });
      }
      if (input.url.endsWith('/prompt')) return json({ prompt_id: 'prompt-exact' });
      if (input.url.endsWith('/history/prompt-exact')) {
        return json({
          'prompt-exact': {
            status: { status_str: 'success', completed: true },
            outputs: {
              '9': { images: [{ filename: 'exact.png', subfolder: '', type: 'output' }] },
            },
          },
        });
      }
      if (input.url.includes('/view?')) {
        return new Response(new Uint8Array([7, 8, 9]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      }
      throw new Error(`Unexpected request ${input.url}`);
    });
    const runner = new ComfyUiWorkflowRunner({
      api: new ComfyUiLocalApi({ request } as ComfyUiLocalApiRequestPort),
      waitForPoll: async () => undefined,
    });
    const onExternalTask = vi.fn();
    const workflowRequest = {
      endpoint: 'http://127.0.0.1:8188',
      clientId: 'openneko-job-1',
      workflow: { '3': { class_type: 'KSampler', inputs: {} } },
      outputKind: 'image' as const,
      inputBindings: [],
    };

    const result = await runner.generateWorkflow(workflowRequest, { onExternalTask });

    expect(onExternalTask).toHaveBeenCalledWith({
      providerId: 'comfyui',
      externalTaskId: 'prompt-exact',
    });
    expect(result).toMatchObject({
      type: 'workflow',
      providerId: 'comfyui',
      promptId: 'prompt-exact',
      request: workflowRequest,
    });
    expect([...result.outputs[0]!.bytes]).toEqual([7, 8, 9]);
  });

  it('fails missing node validation before workflow submission', async () => {
    const request = vi.fn(async (input: { readonly url: string }) => {
      if (input.url.endsWith('/object_info')) return json({});
      throw new Error(`Workflow submission must not occur: ${input.url}`);
    });
    const runner = new ComfyUiWorkflowRunner({
      api: new ComfyUiLocalApi({ request } as ComfyUiLocalApiRequestPort),
    });

    await expect(
      runner.generateWorkflow({
        endpoint: 'http://127.0.0.1:8188',
        clientId: 'openneko-job-1',
        workflow: { '3': { class_type: 'MissingNode', inputs: {} } },
        outputKind: 'image',
        inputBindings: [],
      }),
    ).rejects.toMatchObject({ code: 'comfyui-workflow-rejected' });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('materializes authorized inputs only after loopback/node validation and binds the exact node input', async () => {
    const request = vi.fn(
      async (input: {
        readonly url: string;
        readonly body?: Readonly<Record<string, unknown>>;
      }) => {
        if (input.url.endsWith('/object_info')) {
          return json({ LoadImage: { input: { required: {} } } });
        }
        if (input.url.endsWith('/prompt')) return json({ prompt_id: 'prompt-input' });
        if (input.url.endsWith('/history/prompt-input')) {
          return json({
            'prompt-input': {
              status: { status_str: 'success', completed: true },
              outputs: {
                '9': { images: [{ filename: 'exact.png', subfolder: '', type: 'output' }] },
              },
            },
          });
        }
        if (input.url.includes('/view?')) {
          return new Response(new Uint8Array([1]), {
            status: 200,
            headers: { 'content-type': 'image/png' },
          });
        }
        throw new Error(`Unexpected request ${input.url}`);
      },
    );
    const materialize = vi.fn(async () => ({ filename: 'uploaded.png' }));
    const runner = new ComfyUiWorkflowRunner({
      api: new ComfyUiLocalApi({ request } as ComfyUiLocalApiRequestPort),
      inputs: { materialize },
      waitForPoll: async () => undefined,
    });

    await runner.generateWorkflow({
      endpoint: 'http://127.0.0.1:8188',
      clientId: 'openneko-job-1',
      workflow: { '3': { class_type: 'LoadImage', inputs: { image: 'frozen-placeholder' } } },
      outputKind: 'image',
      inputBindings: [
        {
          nodeId: '3',
          inputName: 'image',
          contentLocator: { file: { authority: 'workspace', path: 'source/input.png' } },
        },
      ],
    });

    expect(materialize).toHaveBeenCalledTimes(1);
    const promptRequest = request.mock.calls.find(([input]) => input.url.endsWith('/prompt'))?.[0];
    expect(promptRequest?.body).toMatchObject({
      prompt: { '3': { class_type: 'LoadImage', inputs: { image: 'uploaded.png' } } },
    });
  });

  it('rejects every invalid exact input binding before materializing any content', async () => {
    const request = vi.fn(async (input: { readonly url: string }) => {
      if (input.url.endsWith('/object_info')) {
        return json({ LoadImage: { input: { required: {} } } });
      }
      throw new Error(`Workflow submission must not occur: ${input.url}`);
    });
    const materialize = vi.fn(async () => ({ filename: 'uploaded.png' }));
    const runner = new ComfyUiWorkflowRunner({
      api: new ComfyUiLocalApi({ request } as ComfyUiLocalApiRequestPort),
      inputs: { materialize },
    });

    await expect(
      runner.generateWorkflow({
        endpoint: 'http://127.0.0.1:8188',
        clientId: 'openneko-job-1',
        workflow: { '3': { class_type: 'LoadImage', inputs: { image: 'placeholder' } } },
        outputKind: 'image',
        inputBindings: [
          {
            nodeId: '3',
            inputName: 'image',
            contentLocator: { file: { authority: 'workspace', path: 'source/input.png' } },
          },
          {
            nodeId: 'missing',
            inputName: 'image',
            contentLocator: { file: { authority: 'workspace', path: 'source/other.png' } },
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'comfyui-workflow-rejected' });
    expect(materialize).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('contains no output-directory, latest-file or Computer Use fallback path', async () => {
    const source = await readFile(new URL('./index.ts', import.meta.url), 'utf8');

    expect(source).not.toMatch(
      /readdir|readDir|\bglob\b|latest[-_ ]file|output[-_ ]directory|computer[-_ ]use|automation_cua|try-next|fallback provider/iu,
    );
    expect(source).toContain('/history/');
    expect(source).toContain('/view?');
  });
});

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
