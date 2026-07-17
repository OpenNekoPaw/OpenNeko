/**
 * Base module exports
 */

export { createServiceId } from './serviceCollection';
export type { ServiceIdentifier } from './serviceCollection';

export { setRootLogger, getRootLogger, getLogger } from './logger';

export { setErrorHandler, getErrorHandler, handleError } from './errorHandler';
