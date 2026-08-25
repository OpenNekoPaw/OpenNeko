import {
  AUTH_TYPES,
  MODEL_TYPES,
  PROVIDER_CONNECTION_KINDS,
  PROVIDER_MODEL_FAMILIES,
  KNOWN_PROVIDER_PROTOCOL_PROFILES,
  PROVIDER_SUPPORT_LEVELS,
  PROVIDER_TYPES,
  STREAM_FORMATS,
} from '@neko/ai-contracts';
import { serializeUnifiedConfigToToml, type UnifiedConfig } from './config-core/index';
import { DEFAULT_USER_CONFIG } from './default-config';

export function buildUserConfigTemplate(config: UnifiedConfig = DEFAULT_USER_CONFIG): string {
  return `${buildConfigTemplateHeader()}${serializeUnifiedConfigToToml(config)}`;
}

function buildConfigTemplateHeader(): string {
  return [
    '# Neko Agent user config',
    '#',
    '# Save this file as ~/.neko/config.toml. TOML comments start with "#".',
    '# Comments are accepted when reading, but UI/CLI write operations may rewrite',
    '# this file from structured config and remove comments.',
    '#',
    '# Provider fields:',
    `# - type: ${formatValues(PROVIDER_TYPES)}`,
    `# - connection_kind: ${formatValues(PROVIDER_CONNECTION_KINDS)}`,
    `# - protocol_profile: use a protocol advertised by the connected DSH runtime; omit it for a DSH catalog route; current common values: ${formatValues(KNOWN_PROVIDER_PROTOCOL_PROFILES)}`,
    `# - support_level: ${formatValues(PROVIDER_SUPPORT_LEVELS)}`,
    `# - supported_model_families: ${formatValues(PROVIDER_MODEL_FAMILIES)}`,
    '#',
    '# Recommended provider mappings:',
    '# - DSH catalog route: keep the exact DSH Provider ID and omit api_url + protocol_profile to inherit its adapter defaults',
    '# - OpenAI-compatible gateway: type = "generic", connection_kind = "gateway", protocol_profile = "openai-completions"',
    '# - Anthropic-compatible gateway: type = "generic", connection_kind = "gateway", protocol_profile = "anthropic-messages"',
    '#',
    '# protocol_variant fields for OpenAI-compatible endpoints:',
    '# - base_path: usually "/v1"; set "" only when api_url already includes the full path policy you need',
    `# - auth_type: ${formatValues(AUTH_TYPES)}`,
    `# - stream_format: ${formatValues(STREAM_FORMATS)}`,
    '# - auth_header: required only when auth_type = "custom-header"',
    '#',
    '# Model fields:',
    `# - type: ${formatValues(MODEL_TYPES)}`,
    '# - protocol_profile: optional request protocol override for gateway models',
    '# - capabilities: examples include "chat", "function_calling", "streaming", "json_mode", "code",',
    '#   "text_to_image", "image.generate", "image.edit", "vision",',
    '#   "text_to_video", "vision_video", "audio.tts", "audio", "text_to_music"',
    '# - Music models use type = "audio" with capability "text_to_music".',
    '#',
    '# Token fields:',
    '# - [defaults].max_tokens is the default output generation cap, not a context window.',
    '# - [[models]].context_window is the model input context window metadata.',
    '# - [[models]].max_output_tokens is the model maximum output generation cap.',
    '#',
    '# Default model bindings use provider_id + model_id under [default_models.llm/image/video/audio].',
    '# Media understanding uses the selected Agent model and package-owned media Tools.',
    '# Character roleplay uses independent [default_model_purposes.character_dialogue] and',
    '# [default_model_purposes.character_profile] bindings; Desktop prompts before first use when missing.',
    '# Unsupported values fail visibly with a config diagnostic instead of falling back silently.',
    '',
  ].join('\n');
}

function formatValues(values: readonly string[]): string {
  return values.map((value) => `"${value}"`).join(', ');
}
