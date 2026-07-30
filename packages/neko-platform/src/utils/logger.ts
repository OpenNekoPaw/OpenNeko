/**
 * Platform Logger - Global logger registry
 *
 * Desktop composition injects the application logger via setRootLogger().
 */
import { createLoggerRegistry } from '@neko/shared';

export const { setRootLogger, getLogger } = createLoggerRegistry('Platform');
