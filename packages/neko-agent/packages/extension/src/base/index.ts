/**
 * Base module exports
 */

export {
  ServiceCollection,
  ServiceIdentifier,
  createServiceId,
  setGlobalServices,
  getService,
  getGlobalServices,
} from './serviceCollection';

export { setRootLogger, getRootLogger, getLogger } from './logger';

export { setErrorHandler, getErrorHandler, handleError } from './errorHandler';
