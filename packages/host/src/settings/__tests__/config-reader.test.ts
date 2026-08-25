import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  getConfigReadDiagnostic,
  getUserConfigDir,
  getUserConfigPath,
  isConfigReadError,
  readConfigFileResult,
  writeConfigFile,
} from '../config-reader';

const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-config-reader-'));
  tempRoots.push(root);
  return root;
}

describe('config-reader typed results', () => {
  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns missing without collapsing it into a parse error', () => {
    const filePath = path.join(createTempRoot(), 'missing.toml');

    const result = readConfigFileResult(filePath);

    expect(result).toEqual({ status: 'missing', filePath });
    expect(isConfigReadError(result)).toBe(false);
    expect(getConfigReadDiagnostic(result)).toBeUndefined();
  });

  it('reports an existing empty file as an error', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    fs.writeFileSync(filePath, '  \n', 'utf-8');

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('empty');
    expect(isConfigReadError(result)).toBe(true);
    expect(getConfigReadDiagnostic(result)).toEqual(
      expect.objectContaining({
        code: 'empty',
        filePath,
        message: expect.stringContaining(filePath),
      }),
    );
  });

  it('reports invalid TOML without returning a config object', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    fs.writeFileSync(filePath, 'providers = [', 'utf-8');

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('invalidToml');
    expect(getConfigReadDiagnostic(result)).toEqual(
      expect.objectContaining({
        code: 'invalidToml',
        filePath,
      }),
    );
  });

  it('reports read errors separately from invalid TOML', () => {
    const filePath = path.join(createTempRoot(), 'config-as-directory.toml');
    fs.mkdirSync(filePath);

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('readError');
    expect(getConfigReadDiagnostic(result)).toEqual(
      expect.objectContaining({
        code: 'readError',
        filePath,
      }),
    );
  });

  it('returns parsed config for valid TOML', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    fs.writeFileSync(
      filePath,
      [
        '[default_models.llm]',
        'provider_id = "custom-newapi"',
        'model_id = "custom-chat"',
        '',
        '[[providers]]',
        'id = "custom-newapi"',
        'name = "Custom NewAPI"',
        'type = "newapi"',
        'api_url = "https://api.example.com/api"',
        'connection_kind = "gateway"',
        'protocol_profile = "newapi"',
      ].join('\n'),
      'utf-8',
    );

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') {
      throw new Error('Expected ok result');
    }
    expect(result.config.defaultModels?.llm).toEqual({
      providerId: 'custom-newapi',
      modelId: 'custom-chat',
    });
    expect(result.config.providers?.[0]).toEqual(
      expect.objectContaining({
        id: 'custom-newapi',
        apiUrl: 'https://api.example.com/api',
        connectionKind: 'gateway',
        protocolProfile: 'newapi',
      }),
    );
  });

  it('projects provider api_key only through the Host credential channel', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    const sentinel = 'sentinel-config-secret';
    fs.writeFileSync(
      filePath,
      [
        'version = 4',
        '',
        '[[providers]]',
        'id = "deepseek-chat"',
        'name = "deepseek-chat"',
        'type = "generic"',
        'api_url = "https://api.deepseek.com"',
        'protocol_profile = "openai-chat"',
        `api_key = "${sentinel}"`,
      ].join('\n'),
      'utf-8',
    );

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('Expected ok result');
    expect(result.providerCredentials).toEqual({
      'deepseek-chat': { status: 'configured', apiKey: sentinel },
    });
    expect(result.diagnostics).toEqual([]);
    expect(JSON.stringify(result.config)).not.toContain(sentinel);
    expect(result.config.providers?.[0]).not.toHaveProperty('apiKey');

    writeConfigFile(filePath, { ...result.config, verbose: true }, result.providerCredentials);
    const written = fs.readFileSync(filePath, 'utf-8');
    expect(written).toContain(`api_key = "${sentinel}"`);
    expect(written).not.toContain('version =');
  });

  it('keeps an invalid declared api_key local and secret-safe', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    fs.writeFileSync(
      filePath,
      [
        '[[providers]]',
        'id = "deepseek-chat"',
        'name = "deepseek-chat"',
        'type = "generic"',
        'api_url = "https://api.deepseek.com"',
        'protocol_profile = "openai-chat"',
        'api_key = ""',
      ].join('\n'),
      'utf-8',
    );

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('Expected ok result');
    expect(result.config.providers?.[0]?.id).toBe('deepseek-chat');
    expect(result.providerCredentials).toEqual({ 'deepseek-chat': { status: 'invalid' } });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'invalidProviderApiKey',
        path: 'providers.deepseek-chat.api_key',
      }),
    ]);
    expect(JSON.stringify(result.diagnostics)).not.toContain('api_key =');
  });

  it('preserves an opaque provider protocol profile for DSH validation', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    fs.writeFileSync(
      filePath,
      [
        '[[providers]]',
        'id = "custom-newapi"',
        'name = "Custom NewAPI"',
        'type = "newapi"',
        'api_url = "https://api.example.com/v1"',
        'connection_kind = "gateway"',
        'protocol_profile = "newapi-compatible"',
        '',
        '[[providers]]',
        'id = "valid-local"',
        'name = "Valid Local"',
        'type = "ollama"',
        'api_url = "http://localhost:11434/api"',
        'connection_kind = "local"',
        'protocol_profile = "ollama"',
      ].join('\n'),
      'utf-8',
    );

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('Expected ok result');
    expect(result.config.providers?.map((provider) => provider.id)).toEqual([
      'custom-newapi',
      'valid-local',
    ]);
    expect(result.config.providers?.[0]?.protocolProfile).toBe('newapi-compatible');
    expect(result.diagnostics).toEqual([]);
  });

  it('isolates an invalid provider model-family declaration', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    fs.writeFileSync(
      filePath,
      [
        '[[providers]]',
        'id = "invalid-family"',
        'name = "Invalid Family"',
        'type = "generic"',
        'api_url = "https://invalid.example/v1"',
        'protocol_profile = "openai-chat"',
        'supported_model_families = ["dialogue", "embedding"]',
        '',
        '[[providers]]',
        'id = "valid-generation"',
        'name = "Valid Generation"',
        'type = "generic"',
        'api_url = "https://media.example/v1"',
        'protocol_profile = "openai-chat"',
        'supported_model_families = ["generation"]',
      ].join('\n'),
      'utf-8',
    );

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('Expected ok result');
    expect(result.config.providers?.map((provider) => provider.id)).toEqual(['valid-generation']);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'unsupportedProviderModelFamily',
        path: 'providers.invalid-family.supported_model_families',
      }),
    ]);
  });

  it('preserves type defaults and model capability metadata from TOML', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    fs.writeFileSync(
      filePath,
      [
        '[default_models.audio]',
        'provider_id = "neko-gateway"',
        'model_id = "music-model"',
        '',
        '[default_models.video]',
        'provider_id = "neko-gateway"',
        'model_id = "gemini-video"',
        '',
        '[[models]]',
        'id = "music-model"',
        'name = "music-model"',
        'provider_id = "neko-gateway"',
        'type = "audio"',
        'capabilities = ["text_to_music"]',
        '',
        '[[models]]',
        'id = "gemini-video"',
        'name = "gemini-2.5-pro"',
        'provider_id = "neko-gateway"',
        'type = "video"',
        'capabilities = ["text_to_video", "vision"]',
      ].join('\n'),
      'utf-8',
    );

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('Expected ok result');
    expect(result.config.defaultModels).toEqual({
      audio: { providerId: 'neko-gateway', modelId: 'music-model' },
      video: { providerId: 'neko-gateway', modelId: 'gemini-video' },
    });
    expect(result.config.models?.[0]).toEqual(
      expect.objectContaining({
        type: 'audio',
        capabilities: ['text_to_music'],
      }),
    );
    expect(result.config.models?.[1]).toEqual(
      expect.objectContaining({
        type: 'video',
        capabilities: ['text_to_video', 'vision'],
      }),
    );
  });

  it('rejects an unknown purpose while preserving valid sibling purposes', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    fs.writeFileSync(
      filePath,
      [
        '[default_model_purposes.media_analysis]',
        'provider_id = "google"',
        'model_id = "google-gemini-2.5-flash"',
        '',
        '[default_model_purposes.character_dialogue]',
        'provider_id = "google"',
        'model_id = "google-gemini-2.5-flash"',
        '',
        '[[models]]',
        'id = "google-gemini-2.5-flash"',
        'name = "gemini-2.5-flash"',
        'provider_id = "google"',
        'type = "llm"',
        'capabilities = ["chat", "vision", "audio", "vision_video"]',
      ].join('\n'),
      'utf-8',
    );

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('Expected ok result');
    expect(result.config.defaultModelPurposes).toEqual({
      'character.dialogue': {
        providerId: 'google',
        modelId: 'google-gemini-2.5-flash',
      },
    });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'unsupportedDefaultModelPurpose',
        path: 'default_model_purposes.media_analysis',
      }),
    ]);

    writeConfigFile(filePath, result.config);
    const rewritten = fs.readFileSync(filePath, 'utf-8');
    expect(rewritten).toContain('[default_model_purposes.character_dialogue]');
    expect(rewritten).not.toContain('media_analysis');
  });

  it('preserves model protocol profile overrides from TOML', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    fs.writeFileSync(
      filePath,
      [
        '[[providers]]',
        'id = "mixed-gateway"',
        'name = "Mixed Gateway"',
        'type = "newapi"',
        'api_url = "https://api.example.com/api"',
        'connection_kind = "gateway"',
        'protocol_profile = "newapi"',
        '',
        '[[models]]',
        'id = "claude-via-gateway"',
        'name = "claude-sonnet"',
        'provider_id = "mixed-gateway"',
        'type = "llm"',
        'protocol_profile = "anthropic"',
        'capabilities = ["chat", "thinking"]',
      ].join('\n'),
      'utf-8',
    );

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('Expected ok result');
    expect(result.config.models?.[0]).toEqual(
      expect.objectContaining({
        id: 'claude-via-gateway',
        protocolProfile: 'anthropic',
      }),
    );
  });

  it('preserves model provider expression profile references from TOML metadata', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    fs.writeFileSync(
      filePath,
      [
        '[[models]]',
        'id = "flux-pro"',
        'name = "flux-pro"',
        'provider_id = "flux"',
        'type = "image"',
        'capabilities = ["image.generate"]',
        'provider_expression_profile_id = "provider-expression:flux:flux-pro"',
      ].join('\n'),
      'utf-8',
    );

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('Expected ok result');
    expect(result.config.models?.[0]).toEqual(
      expect.objectContaining({
        providerExpressionProfileId: 'provider-expression:flux:flux-pro',
      }),
    );
  });

  it('ignores unsupported fields including internal version metadata', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    fs.writeFileSync(
      filePath,
      ['version = 7', 'verbose = true', '', '[unsupported_section]', 'enabled = true'].join('\n'),
      'utf-8',
    );

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('Expected ok result');
    expect(result.config.verbose).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(JSON.stringify(result.config)).not.toContain('version');
    expect(JSON.stringify(result.config)).not.toContain('unsupported_section');
  });

  it('keeps default output tokens separate from model context and output metadata', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    fs.writeFileSync(
      filePath,
      [
        '[defaults]',
        'max_tokens = 256000',
        '',
        '[[models]]',
        'id = "gpt-5-codex"',
        'name = "gpt-5-codex"',
        'provider_id = "openai"',
        'type = "llm"',
        'capabilities = ["chat"]',
        'context_window = 256000',
        'max_output_tokens = 128000',
      ].join('\n'),
      'utf-8',
    );

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('Expected ok result');
    expect(result.config.maxTokens).toBe(256000);
    expect(result.config.models?.[0]).toEqual(
      expect.objectContaining({
        contextWindow: 256000,
        maxOutputTokens: 128000,
      }),
    );
  });

  it('diagnoses invalid token metadata instead of replacing it with output defaults', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    fs.writeFileSync(
      filePath,
      [
        '[defaults]',
        'max_tokens = 8192',
        '',
        '[[models]]',
        'id = "broken-model"',
        'name = "broken-model"',
        'provider_id = "openai"',
        'type = "llm"',
        'capabilities = ["chat"]',
        'context_window = -1',
        'max_output_tokens = 0',
      ].join('\n'),
      'utf-8',
    );

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('Expected ok result');
    expect(result.config.maxTokens).toBe(8192);
    expect(result.config.models).toEqual([]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.path)).toEqual([
      'models.broken-model.context_window',
      'models.broken-model.max_output_tokens',
    ]);
  });

  it('diagnoses non-positive default max_tokens as an output-token config error', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    fs.writeFileSync(filePath, ['[defaults]', 'max_tokens = 0'].join('\n'), 'utf-8');

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('Expected ok result');
    expect(result.config.maxTokens).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'invalidDefaultMaxTokens', path: 'defaults.max_tokens' }),
    ]);
  });

  it('accepts existing capability metadata fields for type defaults', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    fs.writeFileSync(
      filePath,
      [
        '[default_models.llm]',
        'provider_id = "neko-gateway"',
        'model_id = "gpt"',
        '',
        '[default_models.audio]',
        'provider_id = "neko-gateway"',
        'model_id = "music-model"',
        '',
        '[[models]]',
        'id = "gpt"',
        'name = "gpt-4.1"',
        'provider_id = "neko-gateway"',
        'type = "llm"',
        'capabilities = ["chat", "function_calling", "streaming", "json_mode", "code"]',
        '',
        '[[models]]',
        'id = "music-model"',
        'name = "music-model"',
        'provider_id = "neko-gateway"',
        'type = "audio"',
        'capabilities = ["text_to_music"]',
      ].join('\n'),
      'utf-8',
    );

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('Expected ok result');
    expect(result.config.defaultModels).toEqual({
      llm: { providerId: 'neko-gateway', modelId: 'gpt' },
      audio: { providerId: 'neko-gateway', modelId: 'music-model' },
    });
  });

  it('writes TOML and reads it back through the canonical reader', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');

    writeConfigFile(filePath, {
      defaultModels: {
        llm: { providerId: 'ollama-local', modelId: 'ollama-local:llama3.2' },
      },
      maxTokens: 8192,
      temperature: 0.7,
      providers: [
        {
          id: 'ollama-local',
          name: 'Ollama Local',
          displayName: 'Ollama Local',
          type: 'ollama',
          apiUrl: 'http://localhost:11434/api',
          enabled: true,
          connectionKind: 'local',
          supportedModelFamilies: ['dialogue'],
          requiresApiKey: false,
        },
      ],
      models: [
        {
          id: 'ollama-local:llama3.2',
          name: 'llama3.2',
          providerId: 'ollama-local',
          protocolProfile: 'ollama',
          type: 'llm',
          capabilities: ['chat', 'streaming'],
          enabled: true,
        },
      ],
    });

    const written = fs.readFileSync(filePath, 'utf-8');
    expect(written).toContain('[default_models.llm]');
    expect(written).toContain('[[providers]]');
    expect(written).toContain('connection_kind = "local"');
    expect(written).toContain('supported_model_families = [ "dialogue" ]');
    expect(written).toContain('protocol_profile = "ollama"');

    const result = readConfigFileResult(filePath);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('Expected ok result');
    expect(result.config.defaultModels?.llm).toEqual({
      providerId: 'ollama-local',
      modelId: 'ollama-local:llama3.2',
    });
    expect(result.config.models?.[0]?.providerId).toBe('ollama-local');
    expect(result.config.models?.[0]?.protocolProfile).toBe('ollama');
    expect(result.config.providers?.[0]?.supportedModelFamilies).toEqual(['dialogue']);
  });

  it('diagnoses duplicate provider ids', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    fs.writeFileSync(
      filePath,
      [
        '[[providers]]',
        'id = "dupe"',
        'name = "one"',
        'type = "newapi"',
        '',
        '[[providers]]',
        'id = "dupe"',
        'name = "two"',
        'type = "newapi"',
      ].join('\n'),
      'utf-8',
    );

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('Expected ok result');
    expect(result.config.providers).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'duplicateProviderId', path: 'providers.dupe' }),
    ]);
  });

  it('preserves provider protocol identities that are not known locally', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    fs.writeFileSync(
      filePath,
      [
        '[[providers]]',
        'id = "deepseek"',
        'name = "deepseek"',
        'type = "generic"',
        'api_url = "https://api.deepseek.com"',
        'connection_kind = "direct"',
        'protocol_profile = "deepseek"',
        '',
        '[providers.protocol_variant]',
        'base_path = "/v1"',
        'auth_type = "bearer"',
        'stream_format = "sse"',
      ].join('\n'),
      'utf-8',
    );

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('Expected ok result');
    expect(result.config.providers).toEqual([
      expect.objectContaining({ id: 'deepseek', protocolProfile: 'deepseek' }),
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  it('rejects unsupported provider and protocol variant enum values', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    fs.writeFileSync(
      filePath,
      [
        '[[providers]]',
        'id = "bad-provider"',
        'name = "Bad Provider"',
        'type = "deepseek"',
        'connection_kind = "remote"',
        'protocol_profile = "openai-chat"',
        'support_level = "stable"',
        '',
        '[providers.protocol_variant]',
        'auth_type = "token"',
        'stream_format = "jsonl"',
      ].join('\n'),
      'utf-8',
    );

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('Expected ok result');
    expect(result.config.providers).toEqual([]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'unsupportedProviderType',
      'unsupportedProviderConnectionKind',
      'unsupportedProviderSupportLevel',
      'unsupportedProtocolAuthType',
      'unsupportedProtocolStreamFormat',
    ]);
  });

  it('rejects music as a top-level model type', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    fs.writeFileSync(
      filePath,
      [
        '[[models]]',
        'id = "music-model"',
        'name = "music-model"',
        'provider_id = "neko-gateway"',
        'type = "music"',
        'capabilities = ["text_to_music"]',
      ].join('\n'),
      'utf-8',
    );

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('Expected ok result');
    expect(result.config.models).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'unsupportedModelType', path: 'models.music-model.type' }),
    ]);
  });

  it('preserves opaque model protocol profile overrides', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    fs.writeFileSync(
      filePath,
      [
        '[[models]]',
        'id = "custom-model"',
        'name = "custom-model"',
        'provider_id = "custom-provider"',
        'protocol_profile = "deepseek"',
        'type = "llm"',
        'capabilities = ["chat"]',
      ].join('\n'),
      'utf-8',
    );

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('Expected ok result');
    expect(result.config.models).toEqual([
      expect.objectContaining({ id: 'custom-model', protocolProfile: 'deepseek' }),
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  it('rejects unsupported type defaults', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    fs.writeFileSync(
      filePath,
      [
        '[default_models.audio_music_generate]',
        'provider_id = "neko-gateway"',
        'model_id = "music-model"',
        '',
        '[[models]]',
        'id = "music-model"',
        'name = "music-model"',
        'provider_id = "neko-gateway"',
        'type = "audio"',
        'capabilities = ["text_to_music"]',
      ].join('\n'),
      'utf-8',
    );

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('Expected ok result');
    expect(result.config.defaultModels).toBeUndefined();
    expect(result.config.models?.[0]?.id).toBe('music-model');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'unsupportedDefaultModelType',
        path: 'default_models.audio_music_generate',
      }),
    ]);
  });

  it('rejects malformed purpose defaults', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    fs.writeFileSync(
      filePath,
      ['[default_model_purposes.character_dialogue]', 'provider_id = "google"'].join('\n'),
      'utf-8',
    );

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('Expected ok result');
    expect(result.config.defaultModelPurposes).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'unsupportedDefaultModelPurpose',
        path: 'default_model_purposes.character_dialogue',
      }),
    ]);
  });
});

describe('config-reader canonical paths', () => {
  it('keeps the user configuration under ~/.neko', () => {
    expect(getUserConfigDir()).toBe(path.join(os.homedir(), '.neko'));
    expect(getUserConfigPath()).toBe(path.join(os.homedir(), '.neko', 'config.toml'));
  });
});
