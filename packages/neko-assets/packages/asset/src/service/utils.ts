/**
 * ID Generation Utilities
 */

/**
 * Generate a unique entity ID
 */
export function generateEntityId(): string {
  return `ent_${Date.now()}_${randomString(8)}`;
}

/**
 * Generate a unique variant ID
 */
export function generateVariantId(): string {
  return `var_${Date.now()}_${randomString(8)}`;
}

/**
 * Generate a unique file ID
 */
export function generateFileId(): string {
  return `file_${Date.now()}_${randomString(8)}`;
}

/**
 * Generate a random alphanumeric string
 */
function randomString(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
