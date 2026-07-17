/**
 * Media Engine Service Identifiers
 *
 * Defines service identifiers for dependency injection.
 */

import { createServiceId } from '../base/serviceCollection';
import type { MediaEngineManager } from './MediaEngineManager';

/**
 * Media Engine Manager service identifier
 */
export const IMediaEngineManager = createServiceId<MediaEngineManager>('mediaEngineManager');
