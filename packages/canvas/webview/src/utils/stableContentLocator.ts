import { contentLocatorKey, validateContentLocator, type ContentLocator } from '@neko/content';

export function readCanonicalContentLocator(value: unknown): ContentLocator | undefined {
  const validation = validateContentLocator(value);
  return validation.ok ? validation.locator : undefined;
}

export function readCanonicalContentLocatorKey(value: unknown): string | undefined {
  const validation = validateContentLocator(value);
  return validation.ok ? contentLocatorKey(validation.locator) : undefined;
}
