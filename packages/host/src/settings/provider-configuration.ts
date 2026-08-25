import type { Provider } from './types/provider';

export function isProviderConfigured(provider: Provider): boolean {
  return hasProviderEndpoint(provider) || isDshCatalogRoute(provider);
}

function hasProviderEndpoint(provider: Provider): boolean {
  return typeof provider.apiUrl === 'string' && provider.apiUrl.length > 0;
}

function isDshCatalogRoute(provider: Provider): boolean {
  return (
    provider.apiUrl === '' &&
    provider.protocolProfile === undefined &&
    provider.supportedModelFamilies?.includes('dialogue') === true
  );
}
