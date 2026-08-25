/**
 * Platform Logger - Global logger registry
 *
 * Generation owns a package-scoped logger registry.
 */
import { createLoggerRegistry } from '@neko/shared';

const { getLogger } = createLoggerRegistry('Generation');
export { getLogger };
