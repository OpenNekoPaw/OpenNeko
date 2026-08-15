import type {
  DesktopCharacterPresentationSurfaceKind,
  DesktopCharacterPresentationSurfaceRef,
} from './desktop-scene-contract';

export interface DesktopCharacterPresentationSurfaceProvider<TResult> {
  readonly providerId: string;
  readonly surfaceKind: DesktopCharacterPresentationSurfaceKind;
  resolve(surface: DesktopCharacterPresentationSurfaceRef): TResult;
}

export class DesktopCharacterPresentationSurfaceRegistry<TResult> {
  private readonly providers = new Map<
    string,
    DesktopCharacterPresentationSurfaceProvider<TResult>
  >();

  register(provider: DesktopCharacterPresentationSurfaceProvider<TResult>): void {
    const providerId = requireIdentity(provider.providerId, 'Character Presentation provider');
    const key = providerKey(provider.surfaceKind, providerId);
    if (this.providers.has(key)) {
      throw new Error(
        `Character Presentation provider '${providerId}' is already registered for '${provider.surfaceKind}'.`,
      );
    }
    this.providers.set(key, provider);
  }

  resolve(surface: DesktopCharacterPresentationSurfaceRef): TResult {
    const provider = this.providers.get(providerKey(surface.surfaceKind, surface.providerId));
    if (!provider) {
      throw new Error(
        `Character Presentation provider '${surface.providerId}' is unavailable for '${surface.surfaceKind}'.`,
      );
    }
    return provider.resolve(surface);
  }
}

function providerKey(kind: DesktopCharacterPresentationSurfaceKind, providerId: string): string {
  return `${kind}:${providerId}`;
}

function requireIdentity(value: string, label: string): string {
  if (value.trim().length === 0) throw new Error(`${label} identity is required.`);
  return value;
}
