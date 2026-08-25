import {
  contentLocatorKey,
  validateContentLocator,
  type ContentLocator,
} from '@neko/content-domain';
import { isCanvasDurableMaterialContentLocator } from '@neko/canvas-domain';

export function readCanonicalContentLocator(value: unknown): ContentLocator | undefined {
  const validation = validateContentLocator(value);
  return validation.ok && isCanvasDurableMaterialContentLocator(validation.locator)
    ? validation.locator
    : undefined;
}

export function readCanonicalContentLocatorKey(value: unknown): string | undefined {
  const locator = readCanonicalContentLocator(value);
  return locator ? contentLocatorKey(locator) : undefined;
}
