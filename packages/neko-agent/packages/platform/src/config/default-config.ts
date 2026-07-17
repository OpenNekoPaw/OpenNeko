/**
 * Default Configuration
 *
 * Provides default user configuration data for explicit tooling.
 * VS Code Agent runtime does not create or rewrite user config files.
 */

import type { UnifiedConfig } from '@neko/shared';
import type { ModelConfig, ProviderConfig } from '@neko/shared';

export const NEKO_GATEWAY_PROVIDER_ID = 'neko-gateway';
export const CUSTOM_NEWAPI_PROVIDER_ID = 'custom-newapi';
export const OLLAMA_LOCAL_PROVIDER_ID = 'ollama-local';
export const GOOGLE_PROVIDER_ID = 'google';

export const NEKO_GATEWAY_DEFAULT_CHAT_MODEL_ID = 'neko-gateway-default-chat';
export const OLLAMA_LOCAL_DEFAULT_CHAT_MODEL_ID = 'ollama-local-default-chat';
export const NEKO_GATEWAY_DEFAULT_IMAGE_MODEL_ID = 'neko-gateway-gpt-image-2';
export const NEKO_GATEWAY_DEFAULT_VIDEO_MODEL_ID = 'neko-gateway-seedance-lite';
export const NEKO_GATEWAY_DEFAULT_AUDIO_MODEL_ID = 'neko-gateway-tts';
export const NEKO_GATEWAY_DEFAULT_MUSIC_MODEL_ID = 'neko-gateway-suno';
export const GOOGLE_GEMINI_MEDIA_UNDERSTAND_MODEL_ID = 'google-gemini-2.5-flash';

const DEFAULT_NEWAPI_BASE_URL = '';
const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434/api';
const DEFAULT_GOOGLE_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

// =============================================================================
// Default Providers
// =============================================================================

const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    id: NEKO_GATEWAY_PROVIDER_ID,
    name: 'neko-gateway',
    displayName: 'Neko Gateway',
    type: 'newapi',
    apiUrl: DEFAULT_NEWAPI_BASE_URL,
    enabled: true,
    builtin: true,
    connectionKind: 'gateway',
    protocolProfile: 'newapi',
    supportLevel: 'verified',
    requiresApiKey: true,
    useBearerAuth: true,
    supportsBeta: false,
    protocolVariant: {
      basePath: '/v1',
      authType: 'bearer',
      streamFormat: 'sse',
    },
  },
  {
    id: CUSTOM_NEWAPI_PROVIDER_ID,
    name: 'custom-newapi',
    displayName: 'Custom NewAPI Endpoint',
    type: 'newapi',
    apiUrl: DEFAULT_NEWAPI_BASE_URL,
    enabled: false,
    builtin: true,
    connectionKind: 'gateway',
    protocolProfile: 'newapi',
    supportLevel: 'custom',
    requiresApiKey: true,
    useBearerAuth: true,
    supportsBeta: false,
    protocolVariant: {
      basePath: '/v1',
      authType: 'bearer',
      streamFormat: 'sse',
    },
  },
  {
    id: OLLAMA_LOCAL_PROVIDER_ID,
    name: 'ollama',
    displayName: 'Ollama Local',
    type: 'ollama',
    apiUrl: DEFAULT_OLLAMA_BASE_URL,
    enabled: true,
    builtin: true,
    connectionKind: 'local',
    protocolProfile: 'ollama',
    supportLevel: 'compatible',
    requiresApiKey: false,
  },
  {
    id: GOOGLE_PROVIDER_ID,
    name: 'google',
    displayName: 'Google Gemini',
    type: 'google',
    apiUrl: DEFAULT_GOOGLE_BASE_URL,
    enabled: false,
    builtin: true,
    connectionKind: 'direct',
    protocolProfile: 'google',
    supportLevel: 'verified',
    requiresApiKey: true,
    supportsBeta: true,
  },
];

// =============================================================================
// Default Models
// =============================================================================

const DEFAULT_MODELS: ModelConfig[] = [
  {
    id: NEKO_GATEWAY_DEFAULT_CHAT_MODEL_ID,
    name: 'auto',
    displayName: 'Gateway Default Chat',
    providerId: NEKO_GATEWAY_PROVIDER_ID,
    type: 'llm',
    capabilities: ['chat', 'llm.chat', 'function_calling', 'streaming', 'json_mode', 'code'],
    enabled: true,
  },
  {
    id: OLLAMA_LOCAL_DEFAULT_CHAT_MODEL_ID,
    name: 'llama3.2',
    displayName: 'Ollama Local Chat',
    providerId: OLLAMA_LOCAL_PROVIDER_ID,
    type: 'llm',
    capabilities: ['chat', 'streaming', 'code'],
    enabled: true,
  },
  {
    id: NEKO_GATEWAY_DEFAULT_IMAGE_MODEL_ID,
    name: 'gpt-image-2',
    displayName: 'GPT Image 2',
    providerId: NEKO_GATEWAY_PROVIDER_ID,
    type: 'image',
    capabilities: ['text_to_image', 'image.generate', 'image_to_image', 'image_edit', 'image.edit'],
    enabled: true,
  },
  {
    id: NEKO_GATEWAY_DEFAULT_VIDEO_MODEL_ID,
    name: 'seedance-lite',
    displayName: 'Seedance Lite',
    providerId: NEKO_GATEWAY_PROVIDER_ID,
    type: 'video',
    capabilities: ['text_to_video', 'video.generate', 'image_to_video'],
    enabled: true,
  },
  {
    id: NEKO_GATEWAY_DEFAULT_AUDIO_MODEL_ID,
    name: 'tts-1',
    displayName: 'Gateway TTS',
    providerId: NEKO_GATEWAY_PROVIDER_ID,
    type: 'audio',
    capabilities: ['text_to_audio', 'audio.generate', 'audio.tts', 'audio'],
    enabled: true,
  },
  {
    id: NEKO_GATEWAY_DEFAULT_MUSIC_MODEL_ID,
    name: 'suno-v4',
    displayName: 'Suno Music',
    providerId: NEKO_GATEWAY_PROVIDER_ID,
    type: 'audio',
    capabilities: ['text_to_music'],
    enabled: true,
  },
  {
    id: GOOGLE_GEMINI_MEDIA_UNDERSTAND_MODEL_ID,
    name: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash Media Understanding',
    providerId: GOOGLE_PROVIDER_ID,
    type: 'llm',
    capabilities: [
      'chat',
      'llm.chat',
      'vision',
      'llm.vision',
      'audio',
      'vision_video',
      'function_calling',
      'streaming',
      'json_mode',
    ],
    enabled: false,
  },
];

// =============================================================================
// Default User Config
// =============================================================================

/**
 * Default user configuration written by explicit tooling.
 */
export const DEFAULT_USER_CONFIG: UnifiedConfig = {
  defaultProvider: OLLAMA_LOCAL_PROVIDER_ID,
  defaultModel: OLLAMA_LOCAL_DEFAULT_CHAT_MODEL_ID,
  defaultModels: {
    llm: {
      providerId: NEKO_GATEWAY_PROVIDER_ID,
      modelId: NEKO_GATEWAY_DEFAULT_CHAT_MODEL_ID,
    },
    image: {
      providerId: NEKO_GATEWAY_PROVIDER_ID,
      modelId: NEKO_GATEWAY_DEFAULT_IMAGE_MODEL_ID,
    },
    video: {
      providerId: NEKO_GATEWAY_PROVIDER_ID,
      modelId: NEKO_GATEWAY_DEFAULT_VIDEO_MODEL_ID,
    },
    audio: {
      providerId: NEKO_GATEWAY_PROVIDER_ID,
      modelId: NEKO_GATEWAY_DEFAULT_AUDIO_MODEL_ID,
    },
  },
  maxTokens: 8192,
  temperature: 0.7,
  providers: DEFAULT_PROVIDERS,
  models: DEFAULT_MODELS,
  mcpServers: [],
};
