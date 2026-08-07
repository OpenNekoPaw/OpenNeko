import type { Provider } from './types/provider';

export function isProviderConfigured(provider: Provider): boolean {
  return hasProviderEndpoint(provider);
}

function hasProviderEndpoint(provider: Provider): boolean {
  return typeof provider.apiUrl === 'string' && provider.apiUrl.length > 0;
}
