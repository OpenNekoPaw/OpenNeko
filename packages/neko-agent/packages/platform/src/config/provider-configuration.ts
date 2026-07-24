import type { Provider } from '../types/provider';

export function isProviderConfigured(provider: Provider): boolean {
  if (!hasProviderEndpoint(provider)) return false;
  if (provider.requiresApiKey === false) return true;
  return hasProviderApiKey(provider);
}

function hasProviderApiKey(provider: Provider): boolean {
  return typeof provider.apiKey === 'string' && provider.apiKey.length > 0;
}

function hasProviderEndpoint(provider: Provider): boolean {
  return typeof provider.apiUrl === 'string' && provider.apiUrl.length > 0;
}
