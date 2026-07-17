import type { Model, Provider } from '@neko/platform';

export type TextEmbeddingCredential =
  | { readonly type: 'api_key'; readonly key?: string }
  | { readonly type: 'oauth'; readonly access: string };

export interface TextEmbeddingBinding {
  readonly purpose: 'text.embed';
  readonly provider: Readonly<Provider>;
  readonly model: Readonly<Model>;
  readonly credential?: TextEmbeddingCredential;
}

export interface TextEmbeddingRuntimeOptions {
  readonly fetch?: typeof globalThis.fetch;
}

/** Domain-owned embedding execution for Pi's currently unsupported embedding protocol. */
export async function executeTextEmbedding(
  binding: TextEmbeddingBinding,
  texts: readonly string[],
  options: TextEmbeddingRuntimeOptions = {},
): Promise<number[][]> {
  validateBinding(binding, texts);
  const fetchFn = options.fetch ?? globalThis.fetch;
  const protocol = binding.model.protocolProfile ?? binding.provider.protocolProfile;
  if (protocol === 'ollama' || binding.provider.type === 'ollama') {
    return Promise.all(
      texts.map((text) => requestOllamaEmbedding(fetchFn, binding, text)),
    );
  }
  if (
    protocol === 'newapi' ||
    protocol === 'openai-chat' ||
    protocol === 'openai-responses' ||
    binding.provider.type === 'openai' ||
    binding.provider.type === 'newapi' ||
    binding.provider.type === 'oneapi' ||
    binding.provider.type === 'generic'
  ) {
    return requestOpenAICompatibleEmbeddings(fetchFn, binding, texts);
  }
  throw new Error(
    `Embedding provider ${binding.provider.id} uses unsupported protocol ${protocol ?? binding.provider.type}.`,
  );
}

async function requestOpenAICompatibleEmbeddings(
  fetchFn: typeof globalThis.fetch,
  binding: TextEmbeddingBinding,
  texts: readonly string[],
): Promise<number[][]> {
  const response = await fetchFn(joinEndpoint(binding.provider.apiUrl, 'embeddings'), {
    method: 'POST',
    headers: buildHeaders(binding),
    body: JSON.stringify({ model: binding.model.name, input: texts }),
  });
  const payload = await readJsonResponse(response, binding);
  if (!isRecord(payload) || !Array.isArray(payload['data'])) {
    throw new Error(`Embedding provider ${binding.provider.id} returned no data array.`);
  }
  const indexed = payload['data'].map((item, responseIndex) => {
    if (!isRecord(item) || !isNumberArray(item['embedding'])) {
      throw new Error(
        `Embedding provider ${binding.provider.id} returned an invalid vector at index ${responseIndex}.`,
      );
    }
    const index = typeof item['index'] === 'number' ? item['index'] : responseIndex;
    return { index, embedding: item['embedding'] };
  });
  indexed.sort((left, right) => left.index - right.index);
  if (indexed.length !== texts.length) {
    throw new Error(
      `Embedding provider ${binding.provider.id} returned ${indexed.length} vectors for ${texts.length} inputs.`,
    );
  }
  return indexed.map((item) => item.embedding);
}

async function requestOllamaEmbedding(
  fetchFn: typeof globalThis.fetch,
  binding: TextEmbeddingBinding,
  text: string,
): Promise<number[]> {
  const response = await fetchFn(joinEndpoint(binding.provider.apiUrl, 'embeddings'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: binding.model.name, prompt: text }),
  });
  const payload = await readJsonResponse(response, binding);
  if (!isRecord(payload) || !isNumberArray(payload['embedding'])) {
    throw new Error(`Embedding provider ${binding.provider.id} returned an invalid Ollama vector.`);
  }
  return payload['embedding'];
}

function buildHeaders(binding: TextEmbeddingBinding): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(binding.provider.protocolVariant?.extraHeaders ?? {}),
  };
  const key = credentialSecret(binding.credential);
  if (!key) {
    if (binding.provider.requiresApiKey !== false) {
      throw new Error(`Embedding provider ${binding.provider.id} has no credential.`);
    }
    return headers;
  }
  const authType = binding.provider.protocolVariant?.authType;
  if (authType === 'custom-header') {
    const header = binding.provider.protocolVariant?.authHeader?.trim();
    if (!header) throw new Error(`Embedding provider ${binding.provider.id} has no auth header.`);
    headers[header] = key;
  } else if (authType === 'api-key' && !(binding.model.useBearerAuth ?? binding.provider.useBearerAuth)) {
    headers['x-api-key'] = key;
  } else {
    headers.authorization = `Bearer ${key}`;
  }
  return headers;
}

function credentialSecret(credential: TextEmbeddingCredential | undefined): string | undefined {
  const value = credential?.type === 'api_key' ? credential.key : credential?.access;
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

async function readJsonResponse(
  response: Response,
  binding: TextEmbeddingBinding,
): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Embedding provider ${binding.provider.id} failed with HTTP ${response.status}: ${text.slice(0, 240)}`,
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`Embedding provider ${binding.provider.id} returned invalid JSON.`, {
      cause: error,
    });
  }
}

function validateBinding(binding: TextEmbeddingBinding, texts: readonly string[]): void {
  if (binding.purpose !== 'text.embed') throw new Error('Embedding requires the text.embed binding.');
  if (!binding.provider.enabled || !binding.model.enabled) {
    throw new Error(`Embedding binding ${binding.provider.id}/${binding.model.id} is disabled.`);
  }
  if (binding.model.providerId !== binding.provider.id) {
    throw new Error(
      `Embedding model ${binding.model.id} belongs to ${binding.model.providerId}, not ${binding.provider.id}.`,
    );
  }
  if (!binding.model.capabilities.includes('embedding')) {
    throw new Error(`Embedding model ${binding.model.id} lacks the embedding capability.`);
  }
  if (texts.length === 0 || texts.some((text) => text.trim().length === 0)) {
    throw new Error('Embedding inputs must be non-empty strings.');
  }
}

function joinEndpoint(baseUrl: string, endpoint: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  if (!normalized) throw new Error('Embedding provider API URL must be non-empty.');
  return `${normalized}/${endpoint}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'number' && Number.isFinite(item));
}
