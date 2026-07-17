/**
 * Provider UI Metadata
 *
 * UI-only data for provider display. Business data (apiUrl, type, etc.)
 * comes from Platform layer via ConfigManager.
 *
 * This file contains:
 * - icon: Display icon for provider
 * - category: 'chat' | 'media' for UI grouping
 * - noKey: Whether provider requires no API key
 * - authFields: Custom authentication fields (beyond simple apiKey)
 */

/**
 * Authentication field configuration
 */
export interface AuthField {
  /** Field key (e.g., 'apiKey', 'secretKey') */
  key: string;
  /** Display label */
  label: string;
  /** Placeholder text */
  placeholder?: string;
  /** Whether this field is required */
  required?: boolean;
  /** Input type (default: 'password') */
  type?: 'text' | 'password';
  /** Help text */
  helpText?: string;
}

/**
 * Provider UI metadata
 */
export interface ProviderUIMetadata {
  /** Display icon (emoji) */
  icon: string;
  /** Provider category for UI grouping */
  category: 'chat' | 'media';
  /** Whether provider requires no API key (e.g., local providers) */
  noKey?: boolean;
  /** Custom authentication fields */
  authFields?: AuthField[];
}

/**
 * Provider UI metadata registry
 * Key: provider ID (matches Platform providers.json)
 */
export const PROVIDER_UI_METADATA: Record<string, ProviderUIMetadata> = {
  // === Chat Providers ===
  openai: {
    icon: '🟢',
    category: 'chat',
  },
  anthropic: {
    icon: '🟠',
    category: 'chat',
  },
  google: {
    icon: '🔵',
    category: 'chat',
  },
  azure: {
    icon: '☁️',
    category: 'chat',
    authFields: [
      { key: 'apiKey', label: 'API Key', placeholder: 'your-api-key', required: true },
      {
        key: 'resourceName',
        label: 'Resource Name',
        placeholder: 'your-resource-name',
        type: 'text',
        required: true,
      },
      {
        key: 'deploymentId',
        label: 'Deployment ID',
        placeholder: 'your-deployment-id',
        type: 'text',
      },
    ],
  },
  ollama: {
    icon: '🦙',
    category: 'chat',
    noKey: true,
  },
  'ollama-local': {
    icon: '🦙',
    category: 'chat',
    noKey: true,
  },
  deepseek: {
    icon: '🐋',
    category: 'chat',
  },
  grok: {
    icon: '🤖',
    category: 'chat',
  },
  kimi: {
    icon: '🌙',
    category: 'chat',
  },
  glm: {
    icon: '🔴',
    category: 'chat',
  },
  qwen: {
    icon: '☁️',
    category: 'chat',
  },
  lmstudio: {
    icon: '🖥️',
    category: 'chat',
    noKey: true,
  },
  newapi: {
    icon: '🔗',
    category: 'chat',
  },
  'neko-gateway': {
    icon: '🔗',
    category: 'chat',
  },
  'custom-newapi': {
    icon: '🔌',
    category: 'chat',
  },
  generic: {
    icon: '🔌',
    category: 'chat',
  },
  siliconflow: {
    icon: '🌊',
    category: 'chat',
  },
  '302ai': {
    icon: '🤖',
    category: 'chat',
  },
  groq: {
    icon: '⚡',
    category: 'chat',
  },
  together: {
    icon: '🤝',
    category: 'chat',
  },
  openrouter: {
    icon: '🔀',
    category: 'chat',
  },
  fireworks: {
    icon: '🎆',
    category: 'chat',
  },

  // === Media Providers (Image) ===
  midjourney: {
    icon: '🎨',
    category: 'media',
    authFields: [
      { key: 'apiKey', label: 'API Key', placeholder: 'mj-xxx...', required: true },
      {
        key: 'proxyUrl',
        label: 'Proxy URL',
        placeholder: 'https://proxy.example.com',
        type: 'text',
        helpText: 'Midjourney proxy service URL',
      },
    ],
  },
  liblib: {
    icon: '🖼️',
    category: 'media',
    authFields: [
      { key: 'apiKey', label: 'API Key', placeholder: 'your-api-key', required: true },
      {
        key: 'secretKey',
        label: 'Secret Key',
        placeholder: 'your-secret-key',
        required: true,
        helpText: 'Used for request signing',
      },
    ],
  },

  // === Media Providers (Video) ===
  kling: {
    icon: '🎥',
    category: 'media',
    authFields: [
      { key: 'accessKey', label: 'Access Key', placeholder: 'your-access-key', required: true },
      {
        key: 'secretKey',
        label: 'Secret Key',
        placeholder: 'your-secret-key',
        required: true,
        helpText: 'Used for JWT signing',
      },
    ],
  },
  vidu: {
    icon: '🎬',
    category: 'media',
  },
  runway: {
    icon: '🛫',
    category: 'media',
  },
  luma: {
    icon: '✨',
    category: 'media',
  },
  minimax: {
    icon: '🎞️',
    category: 'media',
    authFields: [
      { key: 'apiKey', label: 'API Key', placeholder: 'your-api-key', required: true },
      {
        key: 'groupId',
        label: 'Group ID',
        placeholder: 'your-group-id',
        type: 'text',
        helpText: 'MiniMax group ID',
      },
    ],
  },

  // === Media Providers (Audio) ===
  suno: {
    icon: '🎵',
    category: 'media',
  },
};

/**
 * Get UI metadata for a provider
 * @param providerId Provider ID
 * @returns UI metadata or default values
 */
export function getProviderUIMetadata(providerId: string): ProviderUIMetadata {
  return (
    PROVIDER_UI_METADATA[providerId] || {
      icon: '🔧',
      category: 'chat',
    }
  );
}

/**
 * Get icon for a provider
 */
export function getProviderIcon(providerId: string): string {
  return PROVIDER_UI_METADATA[providerId]?.icon || '🔧';
}

/**
 * Get category for a provider
 */
export function getProviderCategory(providerId: string): 'chat' | 'media' {
  return PROVIDER_UI_METADATA[providerId]?.category || 'chat';
}

/**
 * Check if provider requires no API key
 */
export function isNoKeyProvider(providerId: string): boolean {
  return PROVIDER_UI_METADATA[providerId]?.noKey || false;
}

/**
 * Get custom auth fields for a provider
 */
export function getProviderAuthFields(providerId: string): AuthField[] | undefined {
  return PROVIDER_UI_METADATA[providerId]?.authFields;
}
