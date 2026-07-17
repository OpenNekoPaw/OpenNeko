export async function callJudgeProvider(profile, request, options = {}) {
  if (profile.adapter !== 'openai-chat-completions-v1') {
    throw judgeError('judge-configuration-invalid', `Unsupported Judge adapter: ${profile.adapter}`);
  }
  const env = options.env ?? process.env;
  const endpoint = readRequiredEnv(env, profile.endpointEnv);
  const apiKey = readRequiredEnv(env, profile.apiKeyEnv);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), profile.timeoutMs);
  let response;
  try {
    response = await (options.fetch ?? fetch)(`${endpoint.replace(/\/$/u, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
        ...(profile.organizationEnv && env[profile.organizationEnv]
          ? { 'openai-organization': env[profile.organizationEnv] }
          : {}),
      },
      body: JSON.stringify({
        model: profile.modelId,
        temperature: profile.temperature,
        max_tokens: profile.maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
      }),
      signal: controller.signal,
    });
  } catch (error) {
    throw judgeError(
      'judge-infrastructure-fail',
      `Judge provider request failed: ${formatError(error)}`,
    );
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    throw judgeError(
      'judge-infrastructure-fail',
      `Judge provider returned HTTP ${response.status}`,
    );
  }
  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw judgeError('judge-malformed', `Judge provider returned invalid JSON: ${formatError(error)}`);
  }
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw judgeError('judge-malformed', 'Judge provider response has no assistant JSON content');
  }
  return {
    providerId: profile.providerId,
    modelId: profile.modelId,
    profileId: profile.id,
    content,
    usage: {
      inputTokens: readNonNegativeInteger(payload?.usage?.prompt_tokens),
      outputTokens: readNonNegativeInteger(payload?.usage?.completion_tokens),
    },
  };
}

function readRequiredEnv(env, name) {
  const value = env[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw judgeError('judge-infrastructure-fail', `Judge environment variable is unavailable: ${name}`);
  }
  return value;
}

function readNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function judgeError(code, message) {
  return Object.assign(new Error(message), { code });
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
