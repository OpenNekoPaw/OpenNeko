/**
 * Global Logger Registry — delegates to shared createLoggerRegistry().
 */

import { createLoggerRegistry } from '@neko/shared';

export const { setRootLogger, getLogger } = createLoggerRegistry('NekoPreview');
